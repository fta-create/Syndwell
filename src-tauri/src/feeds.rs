use crate::{db::open, net};
use rusqlite::params;
use scraper::{Html, Selector};
use std::path::Path;
pub fn discover(html: &str, base: &url::Url) -> Vec<String> {
    let doc = Html::parse_document(html);
    let sel = Selector::parse("link[rel~='alternate']").unwrap();
    doc.select(&sel)
        .filter(|e| {
            e.value().attr("type").is_some_and(|v| {
                matches!(
                    v,
                    "application/rss+xml" | "application/atom+xml" | "application/feed+json"
                )
            })
        })
        .filter_map(|e| {
            base.join(e.value().attr("href")?)
                .ok()
                .map(|u| u.to_string())
        })
        .collect()
}
pub fn add(path: &Path, url: &str, folder: Option<i64>) -> Result<i64, String> {
    let (r, base) = net::get(url, None, None)?;
    let bytes = net::body(r)?;
    let (url, bytes) = if feed_rs::parser::parse(&bytes[..]).is_ok() {
        (base.to_string(), bytes)
    } else {
        let choices = discover(&String::from_utf8_lossy(&bytes), &base);
        let u = choices
            .first()
            .ok_or("No RSS, Atom or JSON feed discovered at this address")?;
        let (r, b) = net::get(u, None, None)?;
        (b.to_string(), net::body(r)?)
    };
    let feed = feed_rs::parser::parse(&bytes[..]).map_err(|e| e.to_string())?;
    let c = open(path)?;
    c.execute("INSERT INTO feeds(url,title,description,site_url,folder_id) VALUES(?1,?2,?3,?4,?5) ON CONFLICT(url) DO UPDATE SET subscribed=1",params![url,feed.title.as_ref().map(|t|t.content.as_str()).unwrap_or("Untitled feed"),feed.description.as_ref().map(|t|t.content.as_str()).unwrap_or(""),feed.links.first().map(|l|l.href.as_str()).unwrap_or(""),folder]).map_err(|e|e.to_string())?;
    let id = c
        .query_row("SELECT id FROM feeds WHERE url=?1", [url], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    drop(c);
    store(path, id, &bytes)?;
    Ok(id)
}
pub fn store(path: &Path, id: i64, bytes: &[u8]) -> Result<usize, String> {
    let mut c = open(path)?;
    let source: String = c
        .query_row("SELECT url FROM feeds WHERE id=?1", [id], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    let f = feed_rs::parser::Builder::new()
        .base_uri(Some(&source))
        .build()
        .parse(bytes)
        .map_err(|e| e.to_string())?;
    let tx = c.transaction().map_err(|e| e.to_string())?;
    let icon = f
        .icon
        .as_ref()
        .or(f.logo.as_ref())
        .and_then(|i| url::Url::parse(&source).ok()?.join(&i.uri).ok())
        .or_else(|| url::Url::parse(&source).ok()?.join("/favicon.ico").ok())
        .map(|u| u.to_string());
    tx.execute(
        "UPDATE feeds SET icon_url=?1 WHERE id=?2",
        params![icon, id],
    )
    .map_err(|e| e.to_string())?;
    let mut count = 0;
    for e in f.entries {
        let raw_url = e
            .links
            .iter()
            .find(|l| l.rel.as_deref().is_none_or(|r| r == "alternate"))
            .map(|l| l.href.as_str())
            .unwrap_or("");
        let canonical = url::Url::parse(raw_url).ok().map(|mut u| {
            u.set_fragment(None);
            u.to_string()
        });
        let url = canonical.as_deref().unwrap_or(raw_url);
        let guid = if e.id.is_empty() { url } else { &e.id };
        let summary = e.summary.as_ref().map(|s| s.content.as_str()).unwrap_or("");
        let content = e
            .content
            .as_ref()
            .and_then(|c| c.body.as_deref())
            .unwrap_or(summary);
        let date = e
            .published
            .or(e.updated)
            .map(|d| d.with_timezone(&chrono::Utc).to_rfc3339())
            .unwrap_or_else(|| chrono::Utc::now().to_rfc3339());
        let inserted=tx.execute("INSERT INTO articles(feed_id,guid,url,title,author,summary,content,published) VALUES(?1,?2,?3,?4,?5,?6,?7,?8) ON CONFLICT DO NOTHING",params![id,guid,url,e.title.as_ref().map(|t|t.content.as_str()).unwrap_or("Untitled article"),e.authors.iter().map(|a|if a.name=="author" {a.email.clone().unwrap_or_else(||a.name.clone())}else{a.name.clone()}).collect::<Vec<_>>().join(", "),summary,content,date]).map_err(|e|e.to_string())?;
        count += inserted;
        if inserted == 0 {
            tx.execute("UPDATE articles SET title=?1,summary=?2,content=?3,author=?4 WHERE feed_id=?5 AND (guid=?6 OR (url<>'' AND url=?7))",params![e.title.as_ref().map(|t|t.content.as_str()).unwrap_or("Untitled article"),summary,content,e.authors.iter().map(|a|if a.name=="author"{a.email.clone().unwrap_or_else(||a.name.clone())}else{a.name.clone()}).collect::<Vec<_>>().join(", "),id,guid,url]).map_err(|e|e.to_string())?;
        }
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(count)
}
pub fn refresh(path: &Path, id: i64) -> Result<usize, String> {
    let c = open(path)?;
    let (url, etag, modified): (String, Option<String>, Option<String>) = c
        .query_row(
            "SELECT url,etag,modified FROM feeds WHERE id=?1",
            [id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .map_err(|e| e.to_string())?;
    drop(c);
    let result = (|| {
        let (r, _) = net::get(&url, etag.as_deref(), modified.as_deref())?;
        if r.status().as_u16() == 304 {
            return Ok(0);
        }
        let etag = r
            .headers()
            .get("etag")
            .and_then(|v| v.to_str().ok())
            .map(str::to_owned);
        let modified = r
            .headers()
            .get("last-modified")
            .and_then(|v| v.to_str().ok())
            .map(str::to_owned);
        let n = store(path, id, &net::body(r)?)?;
        open(path)?
            .execute(
                "UPDATE feeds SET etag=?1,modified=?2 WHERE id=?3",
                params![etag, modified, id],
            )
            .map_err(|e| e.to_string())?;
        Ok(n)
    })();
    let c = open(path)?;
    match &result {
        Ok(_) => {
            c.execute("UPDATE feeds SET error=NULL,failures=0,checked_at=CURRENT_TIMESTAMP,next_check=0 WHERE id=?1",[id]).map_err(|e|e.to_string())?;
        }
        Err(e) => {
            c.execute("UPDATE feeds SET error=?1,failures=failures+1,next_check=unixepoch()+MIN(21600,60*(1 << MIN(failures,8))) WHERE id=?2",params![e,id]).map_err(|e|e.to_string())?;
        }
    }
    result
}
