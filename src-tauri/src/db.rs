use rusqlite::{params, Connection};
use serde_json::{json, Value};
use std::path::Path;
pub fn open(path: &Path) -> Result<Connection, String> {
    let c = Connection::open(path).map_err(|e| e.to_string())?;
    c.busy_timeout(std::time::Duration::from_secs(10))
        .map_err(|e| e.to_string())?;
    c.execute_batch("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;")
        .map_err(|e| e.to_string())?;
    Ok(c)
}
pub fn migrate(path: &Path) -> Result<(), String> {
    let mut c = open(path)?;
    let version: i64 = c
        .query_row("PRAGMA user_version", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    if version > 3 {
        return Err("This database needs a newer version of Syndwell".into());
    }
    let tx = c.transaction().map_err(|e| e.to_string())?;
    if version < 1 {
        tx.execute_batch(include_str!("../migrations/001_initial.sql"))
            .map_err(|e| e.to_string())?
    }
    if version < 2 {
        tx.execute_batch(include_str!("../migrations/002_images.sql"))
            .map_err(|e| e.to_string())?
    }
    if version < 3 {
        tx.execute_batch(include_str!("../migrations/003_feed_icons.sql"))
            .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())
}
pub fn rows(c: &Connection, sql: &str, p: &[&dyn rusqlite::ToSql]) -> Result<Value, String> {
    let mut s = c.prepare(sql).map_err(|e| e.to_string())?;
    let names = s
        .column_names()
        .iter()
        .map(|x| x.to_string())
        .collect::<Vec<_>>();
    let iter = s
        .query_map(p, |r| {
            let mut o = serde_json::Map::new();
            for (i, n) in names.iter().enumerate() {
                use rusqlite::types::ValueRef;
                let v = match r.get_ref(i)? {
                    ValueRef::Null => Value::Null,
                    ValueRef::Integer(v) => json!(v),
                    ValueRef::Real(v) => json!(v),
                    ValueRef::Text(v) => json!(String::from_utf8_lossy(v)),
                    _ => Value::Null,
                };
                o.insert(n.clone(), v);
            }
            Ok(Value::Object(o))
        })
        .map_err(|e| e.to_string())?;
    let v = iter
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(json!(v))
}
pub fn text<'a>(v: &'a Value, k: &str) -> &'a str {
    v[k].as_str().unwrap_or("")
}
pub fn list(c: &Connection, v: &Value) -> Result<Value, String> {
    filtered(c, v, false)
}
fn filtered(c: &Connection, v: &Value, ids_only: bool) -> Result<Value, String> {
    let select = if ids_only {
        "SELECT a.id FROM articles a JOIN feeds f ON f.id=a.feed_id JOIN states s ON s.article_id=a.id LEFT JOIN notes n ON n.article_id=a.id "
    } else {
        "SELECT a.id,a.feed_id,a.title,a.author,a.url,a.published,substr(COALESCE(NULLIF(a.summary,''),a.content),1,500) summary,f.title feed,s.read,s.starred,s.saved,s.progress,COALESCE(n.body,'') note FROM articles a JOIN feeds f ON f.id=a.feed_id JOIN states s ON s.article_id=a.id LEFT JOIN notes n ON n.article_id=a.id "
    };
    let mut sql = String::from(select);
    let query = text(v, "query").trim();
    let mut values: Vec<Box<dyn rusqlite::ToSql>> = vec![];
    if !query.is_empty() {
        sql.push_str(" JOIN search ON search.rowid=a.id ")
    }
    sql.push_str(" WHERE 1=1 ");
    if !query.is_empty() {
        sql.push_str(" AND search MATCH ? ");
        let safe = query
            .split_whitespace()
            .map(|s| format!("\"{}\"", s.replace('"', "\"\"")))
            .collect::<Vec<_>>()
            .join(" AND ");
        values.push(Box::new(safe));
    }
    match text(v, "status") {
        "unread" => sql.push_str(" AND s.read=0"),
        "read" => sql.push_str(" AND s.read=1"),
        _ => {}
    }
    match text(v, "view") {
        "unread" => sql.push_str(" AND s.read=0"),
        "starred" => sql.push_str(" AND s.starred=1"),
        "saved" => sql.push_str(" AND s.saved=1"),
        "notes" => sql.push_str(" AND length(n.body)>0"),
        "read" => sql.push_str(" AND s.read=1"),
        _ => {}
    }
    if let Some(id) = v["feed_id"].as_i64() {
        sql.push_str(" AND a.feed_id=?");
        values.push(Box::new(id));
    }
    if let Some(id) = v["folder_id"].as_i64() {
        sql.push_str(" AND f.folder_id IN(WITH RECURSIVE tree(id) AS(SELECT ? UNION ALL SELECT folders.id FROM folders JOIN tree ON folders.parent_id=tree.id) SELECT id FROM tree)");
        values.push(Box::new(id));
    }
    for (k, op) in [("after", ">="), ("before", "<=")] {
        let t = text(v, k);
        if !t.is_empty() {
            sql.push_str(&format!(" AND substr(a.published,1,10){op}?"));
            values.push(Box::new(t.to_owned()));
        }
    }
    for (k, neg) in [("contains", false), ("excludes", true)] {
        let t = text(v, k);
        if !t.is_empty() {
            sql.push_str(if neg {
                " AND instr(lower(a.title||' '||a.summary||' '||a.content),lower(?))=0"
            } else {
                " AND instr(lower(a.title||' '||a.summary||' '||a.content),lower(?))>0"
            });
            values.push(Box::new(t.to_owned()));
        }
    }
    sql.push_str(match text(v, "sort") {
        "oldest" => " ORDER BY a.published ASC,a.id ASC",
        "relevance" if !query.is_empty() => " ORDER BY bm25(search),a.published DESC",
        _ => " ORDER BY a.published DESC,a.id DESC",
    });
    if !ids_only {
        sql.push_str(" LIMIT 100 OFFSET ?");
        values.push(Box::new(v["offset"].as_i64().unwrap_or(0).max(0)));
    }
    let refs = values.iter().map(|b| b.as_ref()).collect::<Vec<_>>();
    rows(c, &sql, &refs)
}
pub fn library(c: &Connection) -> Result<Value, String> {
    Ok(
        json!({"feeds":rows(c,"SELECT f.id,f.url,f.title,f.description,f.site_url,f.icon_url,f.icon_data,f.folder_id,f.error,f.checked_at,(SELECT count(*) FROM articles a JOIN states s ON s.article_id=a.id WHERE a.feed_id=f.id AND s.read=0) unread FROM feeds f WHERE subscribed=1 ORDER BY title COLLATE NOCASE",&[])?,"folders":rows(c,"SELECT * FROM folders ORDER BY position,name",&[])?,"counts":rows(c,"SELECT count(*) total,COALESCE(sum(s.read=0),0) unread,COALESCE(sum(s.starred),0) starred,COALESCE(sum(s.saved),0) saved,COALESCE(sum(length(n.body)>0),0) notes FROM articles a JOIN states s ON s.article_id=a.id LEFT JOIN notes n ON n.article_id=a.id",&[])?,"preferences":rows(c,"SELECT * FROM preferences",&[])?}),
    )
}
pub fn mutation(c: &Connection, op: &str, v: &Value) -> Result<Value, String> {
    let id = v["id"].as_i64().unwrap_or(0);
    match op {
        "state" => {
            let key = text(v, "key");
            if !["read", "starred", "saved", "progress"].contains(&key) {
                return Err("Invalid state".into());
            }
            c.execute(
                &format!("UPDATE states SET {key}=?1 WHERE article_id=?2"),
                params![v["value"].as_f64().unwrap_or(0.), id],
            )
            .map_err(|e| e.to_string())?;
        }
        "note" => {
            c.execute("INSERT INTO notes(article_id,body) VALUES(?1,?2) ON CONFLICT(article_id) DO UPDATE SET body=excluded.body,updated=CURRENT_TIMESTAMP",params![id,text(v,"body")]).map_err(|e|e.to_string())?;
        }
        "folder_add" => {
            if text(v, "name").trim().is_empty() {
                return Err("Folder name is required".into());
            }
            c.execute("INSERT INTO folders(name,parent_id,position) VALUES(?1,?2,(SELECT count(*) FROM folders))",params![text(v,"name"),v["parent_id"].as_i64()]).map_err(|e|e.to_string())?;
        }
        "folder_edit" => {
            c.execute(
                "UPDATE folders SET name=?1 WHERE id=?2",
                params![text(v, "name"), id],
            )
            .map_err(|e| e.to_string())?;
        }
        "folder_move" => {
            let parent: Option<i64> = c
                .query_row("SELECT parent_id FROM folders WHERE id=?1", [id], |r| {
                    r.get(0)
                })
                .map_err(|e| e.to_string())?;
            let siblings = rows(
                c,
                "SELECT id FROM folders WHERE parent_id IS ?1 ORDER BY position,name",
                &[&parent],
            )?;
            let mut ids: Vec<i64> = siblings
                .as_array()
                .unwrap()
                .iter()
                .filter_map(|f| f["id"].as_i64())
                .collect();
            if let Some(index) = ids.iter().position(|i| *i == id) {
                let target = index as i64 + v["direction"].as_i64().unwrap_or(0).signum();
                if target >= 0 && (target as usize) < ids.len() {
                    ids.swap(index, target as usize);
                    let tx = c.unchecked_transaction().map_err(|e| e.to_string())?;
                    for (i, id) in ids.iter().enumerate() {
                        tx.execute(
                            "UPDATE folders SET position=?1 WHERE id=?2",
                            params![i as i64, id],
                        )
                        .map_err(|e| e.to_string())?;
                    }
                    tx.commit().map_err(|e| e.to_string())?;
                }
            }
        }
        "folder_delete" => {
            c.execute("DELETE FROM folders WHERE id=?1", [id])
                .map_err(|e| e.to_string())?;
        }
        "feed_edit" => {
            c.execute(
                "UPDATE feeds SET title=?1,folder_id=?2 WHERE id=?3",
                params![text(v, "title"), v["folder_id"].as_i64(), id],
            )
            .map_err(|e| e.to_string())?;
        }
        "feed_delete" => {
            c.execute("UPDATE feeds SET subscribed=0 WHERE id=?1", [id])
                .map_err(|e| e.to_string())?;
        }
        "mark_all" => {
            let tx = c.unchecked_transaction().map_err(|e| e.to_string())?;
            let ids = filtered(&tx, v, true)?;
            for article in ids.as_array().unwrap() {
                tx.execute(
                    "UPDATE states SET read=1 WHERE article_id=?1",
                    [article["id"].as_i64().unwrap()],
                )
                .map_err(|e| e.to_string())?;
            }
            tx.commit().map_err(|e| e.to_string())?;
        }
        "preference" => {
            c.execute("INSERT INTO preferences(key,value) VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value",params![text(v,"key"),text(v,"value")]).map_err(|e|e.to_string())?;
        }
        "clear_cache" => {
            c.execute_batch(
                "BEGIN; UPDATE articles SET full_content=NULL; DELETE FROM images; UPDATE feeds SET icon_data=NULL; COMMIT;",
            )
            .map_err(|e| e.to_string())?;
        }
        _ => return Err(format!("Unknown operation: {op}")),
    };
    Ok(json!(true))
}
