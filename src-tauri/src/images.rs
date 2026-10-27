//! Explicit, opt-in image downloads. No remote image URL is passed to the webview.
use crate::{db, net};
use base64::{engine::general_purpose::STANDARD, Engine};
use rusqlite::params;
use scraper::{Html, Selector};
use serde_json::Value;
use std::path::Path;
pub fn cached(path: &Path, id: i64) -> Result<Value, String> {
    db::rows(
        &db::open(path)?,
        "SELECT url,'data:'||mime||';base64,'||data AS data FROM images WHERE article_id=?1",
        &[&id],
    )
}
pub fn fetch(path: &Path, id: i64) -> Result<Value, String> {
    let c = db::open(path)?;
    let (url, content): (String, String) = c
        .query_row(
            "SELECT url,COALESCE(full_content,content) FROM articles WHERE id=?1",
            [id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(|e| e.to_string())?;
    let base = url::Url::parse(&url).map_err(|e| e.to_string())?;
    let doc = Html::parse_fragment(&content);
    let selector = Selector::parse("img[src]").unwrap();
    let mut errors = vec![];
    for image in doc.select(&selector) {
        let Some(raw) = image.value().attr("src") else {
            continue;
        };
        let Ok(url) = base.join(raw) else { continue };
        let exists: bool = c
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM images WHERE article_id=?1 AND url=?2)",
                params![id, url.as_str()],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        if exists {
            continue;
        }
        let result = (|| {
            let (r, _) = net::get(url.as_str(), None, None)?;
            let mime = r
                .headers()
                .get("content-type")
                .and_then(|h| h.to_str().ok())
                .unwrap_or("")
                .split(';')
                .next()
                .unwrap_or("")
                .to_owned();
            if !matches!(
                mime.as_str(),
                "image/jpeg" | "image/png" | "image/gif" | "image/webp" | "image/avif"
            ) {
                return Err("Unsupported image format".into());
            }
            let bytes = net::body(r)?;
            c.execute(
                "INSERT OR IGNORE INTO images(article_id,url,mime,data) VALUES(?1,?2,?3,?4)",
                params![id, url.as_str(), mime, STANDARD.encode(bytes)],
            )
            .map_err(|e| e.to_string())?;
            Ok::<(), String>(())
        })();
        if let Err(e) = result {
            errors.push(e)
        }
    }
    Ok(serde_json::json!({"images":cached(path,id)?,"errors":errors}))
}

pub fn feed_icon(path: &Path, id: i64) -> Result<Value, String> {
    let c = db::open(path)?;
    let (icon, site): (Option<String>, String) = c
        .query_row(
            "SELECT icon_url,COALESCE(NULLIF(site_url,''),url) FROM feeds WHERE id=?1",
            [id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(|e| e.to_string())?;
    let raw = match icon {
        Some(url) => url,
        None => url::Url::parse(&site)
            .and_then(|u| u.join("/favicon.ico"))
            .map_err(|e| e.to_string())?
            .to_string(),
    };
    let (r, _) = net::get(&raw, None, None)?;
    let mime = r
        .headers()
        .get("content-type")
        .and_then(|h| h.to_str().ok())
        .unwrap_or("")
        .split(';')
        .next()
        .unwrap_or("")
        .to_owned();
    if !matches!(
        mime.as_str(),
        "image/png"
            | "image/jpeg"
            | "image/gif"
            | "image/webp"
            | "image/avif"
            | "image/x-icon"
            | "image/vnd.microsoft.icon"
    ) {
        return Err("Feed icon is not a supported raster image".into());
    }
    let bytes = net::body(r)?;
    if bytes.len() > 1024 * 1024 {
        return Err("Feed icon exceeds 1 MiB".into());
    }
    let data = format!("data:{mime};base64,{}", STANDARD.encode(bytes));
    c.execute(
        "UPDATE feeds SET icon_data=?1 WHERE id=?2",
        params![data, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(serde_json::json!(true))
}
