use crate::db::{open, rows};
use rusqlite::params;
use serde_json::{json, Value};
use std::path::Path;
fn escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}
pub fn export(path: &Path) -> Result<String, String> {
    let c = open(path)?;
    let folders = rows(&c, "SELECT * FROM folders ORDER BY position,id", &[])?;
    let feeds = rows(
        &c,
        "SELECT * FROM feeds WHERE subscribed=1 ORDER BY title",
        &[],
    )?;
    fn branch(parent: Option<i64>, folders: &Value, feeds: &Value, out: &mut String) {
        for f in feeds.as_array().unwrap() {
            if f["folder_id"].as_i64() == parent {
                out.push_str(&format!("<outline type=\"rss\" text=\"{}\" title=\"{}\" xmlUrl=\"{}\" htmlUrl=\"{}\"/>\n",escape(f["title"].as_str().unwrap_or("")),escape(f["title"].as_str().unwrap_or("")),escape(f["url"].as_str().unwrap_or("")),escape(f["site_url"].as_str().unwrap_or(""))))
            }
        }
        for f in folders.as_array().unwrap() {
            if f["parent_id"].as_i64() == parent {
                out.push_str(&format!(
                    "<outline text=\"{}\">\n",
                    escape(f["name"].as_str().unwrap_or(""))
                ));
                branch(f["id"].as_i64(), folders, feeds, out);
                out.push_str("</outline>\n");
            }
        }
    }
    let mut out=String::from("<?xml version=\"1.0\" encoding=\"UTF-8\"?><opml version=\"2.0\"><head><title>Syndwell subscriptions</title></head><body>\n");
    branch(None, &folders, &feeds, &mut out);
    out.push_str("</body></opml>");
    Ok(out)
}
// Import subscriptions without fetching. Large imports remain transactional and can refresh separately.
pub fn import(path: &Path, xml: &str) -> Result<Value, String> {
    if xml.len() > 16 * 1024 * 1024 {
        return Err("OPML exceeds 16 MiB".into());
    }
    let doc = roxmltree::Document::parse(xml).map_err(|e| e.to_string())?;
    if doc.root_element().tag_name().name() != "opml" {
        return Err("Not an OPML document".into());
    }
    let mut c = open(path)?;
    let tx = c.transaction().map_err(|e| e.to_string())?;
    let (mut imported, mut skipped, mut invalid) = (0, 0, 0);
    fn walk(
        n: roxmltree::Node,
        parent: Option<i64>,
        tx: &rusqlite::Transaction,
        counts: &mut (i32, i32, i32),
        depth: usize,
    ) -> Result<(), String> {
        if depth > 64 {
            return Err("OPML folder nesting exceeds 64 levels".into());
        }
        for child in n.children().filter(|n| n.is_element()) {
            if child.tag_name().name() != "outline" {
                walk(child, parent, tx, counts, depth + 1)?;
                continue;
            }
            let title = child
                .attribute("text")
                .or(child.attribute("title"))
                .unwrap_or("Untitled");
            if let Some(raw) = child.attribute("xmlUrl") {
                let valid = url::Url::parse(raw).ok().is_some_and(|u| {
                    matches!(u.scheme(), "http" | "https")
                        && u.host_str().is_some()
                        && u.username().is_empty()
                        && u.password().is_none()
                });
                if !valid {
                    counts.2 += 1;
                    continue;
                }
                let exists: bool = tx
                    .query_row(
                        "SELECT EXISTS(SELECT 1 FROM feeds WHERE url=?1)",
                        [raw],
                        |r| r.get(0),
                    )
                    .map_err(|e| e.to_string())?;
                if exists {
                    counts.1 += 1
                } else {
                    tx.execute(
                        "INSERT INTO feeds(url,title,folder_id) VALUES(?1,?2,?3)",
                        params![raw, title, parent],
                    )
                    .map_err(|e| e.to_string())?;
                    counts.0 += 1;
                }
            } else {
                let existing: Option<i64> = tx
                    .query_row(
                        "SELECT id FROM folders WHERE name=?1 AND parent_id IS ?2",
                        params![title, parent],
                        |r| r.get(0),
                    )
                    .ok();
                let id = if let Some(id) = existing {
                    id
                } else {
                    tx.execute(
                        "INSERT INTO folders(name,parent_id) VALUES(?1,?2)",
                        params![title, parent],
                    )
                    .map_err(|e| e.to_string())?;
                    tx.last_insert_rowid()
                };
                walk(child, Some(id), tx, counts, depth + 1)?;
            }
        }
        Ok(())
    }
    let mut counts = (imported, skipped, invalid);
    walk(doc.root_element(), None, &tx, &mut counts, 0)?;
    (imported, skipped, invalid) = counts;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(json!({"imported":imported,"skipped":skipped,"invalid":invalid}))
}
