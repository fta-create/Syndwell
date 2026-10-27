pub mod db;
pub mod feeds;
pub mod images;
pub mod net;
pub mod opml;
pub mod sync;
use rusqlite::params;
use serde_json::{json, Value};
use std::path::Path;
pub fn dispatch(path: &Path, op: &str, v: Value) -> Result<Value, String> {
    match op {
        "download_icon" => images::feed_icon(path, v["id"].as_i64().ok_or("Missing feed")?),
        "cached_images" => images::cached(path, v["id"].as_i64().ok_or("Missing article")?),
        "download_images" => images::fetch(path, v["id"].as_i64().ok_or("Missing article")?),
        "library" => db::library(&db::open(path)?),
        "articles" => db::list(&db::open(path)?, &v),
        "article" => {
            let a=db::rows(&db::open(path)?,"SELECT a.*,f.title feed,s.read,s.starred,s.saved,s.progress,COALESCE(n.body,'') note FROM articles a JOIN feeds f ON f.id=a.feed_id JOIN states s ON s.article_id=a.id LEFT JOIN notes n ON n.article_id=a.id WHERE a.id=?1",&[&v["id"].as_i64().unwrap_or(0)])?;
            a[0].as_object()
                .map(|_| a[0].clone())
                .ok_or("Article not found".into())
        }
        "add_feed" => Ok(json!(feeds::add(
            path,
            db::text(&v, "url"),
            v["folder_id"].as_i64()
        )?)),
        "refresh" => sync::refresh(path, &v),
        "refresh_status" => Ok(sync::status()),
        "cancel_refresh" => {
            sync::cancel();
            Ok(json!(true))
        }
        "extract" => {
            let c = db::open(path)?;
            let id = v["id"].as_i64().ok_or("Missing article")?;
            let (url, cached): (String, Option<String>) = c
                .query_row(
                    "SELECT url,full_content FROM articles WHERE id=?1",
                    [id],
                    |r| Ok((r.get(0)?, r.get(1)?)),
                )
                .map_err(|e| e.to_string())?;
            if let Some(s) = cached {
                return Ok(json!(s));
            }
            let (r, base) = net::get(&url, None, None)?;
            let bytes = net::body(r)?;
            let product = readability::extractor::extract(&mut std::io::Cursor::new(bytes), &base)
                .map_err(|e| e.to_string())?;
            if product.text.chars().count() < 120 {
                return Err("No readable article found. Feed content is still available.".into());
            }
            c.execute(
                "UPDATE articles SET full_content=?1 WHERE id=?2",
                params![product.content, id],
            )
            .map_err(|e| e.to_string())?;
            Ok(json!(product.content))
        }
        "import_opml" => opml::import(path, db::text(&v, "xml")),
        "export_opml" => Ok(json!(opml::export(path)?)),
        "export_notes" => {
            let notes=db::rows(&db::open(path)?,"SELECT a.title,a.url,n.body FROM notes n JOIN articles a ON a.id=n.article_id WHERE length(n.body)>0 ORDER BY n.updated DESC",&[])?;
            let s = notes
                .as_array()
                .unwrap()
                .iter()
                .map(|n| {
                    format!(
                        "# {}\n\nSource: {}\n\n{}\n\n---\n\n",
                        n["title"].as_str().unwrap_or(""),
                        n["url"].as_str().unwrap_or(""),
                        n["body"].as_str().unwrap_or("")
                    )
                })
                .collect::<String>();
            Ok(json!(s))
        }
        "backup" => {
            let mut c = db::open(path)?;
            let tx = c.transaction().map_err(|e| e.to_string())?;
            let mut out = json!({"format":"syndwell","version":1});
            for table in [
                "folders",
                "feeds",
                "articles",
                "states",
                "notes",
                "preferences",
                "images",
            ] {
                out[table] = db::rows(&tx, &format!("SELECT * FROM {table}"), &[])?
            }
            tx.commit().map_err(|e| e.to_string())?;
            Ok(out)
        }
        "restore" => restore(path, &v),
        _ => db::mutation(&db::open(path)?, op, &v),
    }
}
static EMPTY_ROWS: Vec<Value> = Vec::new();
fn restore(path: &Path, v: &Value) -> Result<Value, String> {
    if v["format"] != "syndwell" || v["version"] != 1 {
        return Err("Unsupported Syndwell backup".into());
    }
    let mut c = db::open(path)?;
    let tx = c.transaction().map_err(|e| e.to_string())?;
    // Defer parent references so nested folders can be inserted in any ID order.
    tx.execute_batch("PRAGMA defer_foreign_keys=ON; DELETE FROM images; DELETE FROM notes; DELETE FROM states; DELETE FROM articles; DELETE FROM feeds; DELETE FROM folders; DELETE FROM preferences; DELETE FROM search;").map_err(|e|e.to_string())?;
    for table in [
        "folders",
        "feeds",
        "articles",
        "states",
        "notes",
        "preferences",
        "images",
    ] {
        let columns: Vec<String> = {
            let mut stmt = tx
                .prepare(&format!("PRAGMA table_info({table})"))
                .map_err(|e| e.to_string())?;
            let x = stmt
                .query_map([], |r| r.get(1))
                .map_err(|e| e.to_string())?
                .collect::<Result<_, _>>()
                .map_err(|e| e.to_string())?;
            x
        };
        for row in v[table]
            .as_array()
            .or_else(|| {
                if table == "images" {
                    Some(&EMPTY_ROWS)
                } else {
                    None
                }
            })
            .ok_or("Backup is missing a table")?
        {
            let values: Vec<rusqlite::types::Value> = columns
                .iter()
                .map(|k| match &row[k] {
                    Value::Null => Ok(rusqlite::types::Value::Null),
                    Value::String(s) => Ok(rusqlite::types::Value::Text(s.clone())),
                    Value::Number(n) => {
                        if let Some(i) = n.as_i64() {
                            Ok(rusqlite::types::Value::Integer(i))
                        } else {
                            Ok(rusqlite::types::Value::Real(n.as_f64().unwrap_or(0.)))
                        }
                    }
                    _ => Err("Invalid backup value"),
                })
                .collect::<Result<_, _>>()?;
            let placeholders = vec!["?"; columns.len()].join(",");
            tx.execute(
                &format!(
                    "INSERT OR REPLACE INTO {table}({}) VALUES({placeholders})",
                    columns.join(",")
                ),
                rusqlite::params_from_iter(values),
            )
            .map_err(|e| e.to_string())?;
        }
    }
    let folder_rows = db::rows(&tx, "SELECT id,parent_id FROM folders", &[])?;
    let parents: std::collections::HashMap<i64, Option<i64>> = folder_rows
        .as_array()
        .unwrap()
        .iter()
        .map(|f| (f["id"].as_i64().unwrap(), f["parent_id"].as_i64()))
        .collect();
    for id in parents.keys() {
        let mut seen = std::collections::HashSet::new();
        let mut node = Some(*id);
        while let Some(id) = node {
            if !seen.insert(id) || seen.len() > 64 {
                return Err("Backup contains cyclic or excessively nested folders".into());
            }
            node = parents.get(&id).copied().flatten();
        }
    }
    let violations: i64 = tx
        .query_row("SELECT count(*) FROM pragma_foreign_key_check", [], |r| {
            r.get(0)
        })
        .map_err(|e| e.to_string())?;
    if violations > 0 {
        return Err("Backup has invalid relationships; original data preserved".into());
    }
    tx.execute_batch("UPDATE articles SET full_content=full_content; UPDATE notes SET body=body;")
        .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(json!(true))
}
#[cfg(feature = "desktop")]
mod desktop {
    use super::*;
    use tauri::Manager;
    struct Store(std::path::PathBuf);
    #[tauri::command]
    async fn request(
        state: tauri::State<'_, Store>,
        app: tauri::AppHandle,
        op: String,
        args: Value,
    ) -> Result<Value, String> {
        let path = state.0.clone();
        tauri::async_runtime::spawn_blocking(move || {
            if op == "save_export" {
                use tauri_plugin_dialog::DialogExt;
                let kind = db::text(&args, "kind");
                let (operation, name, extension) = match kind {
                    "opml" => ("export_opml", "syndwell.opml", "opml"),
                    "notes" => ("export_notes", "syndwell-notes.md", "md"),
                    "backup" => ("backup", "syndwell-backup.json", "json"),
                    _ => return Err("Unknown export type".into()),
                };
                let result = dispatch(&path, operation, json!({}))?;
                let body = if operation == "backup" {
                    serde_json::to_string(&result).map_err(|e| e.to_string())?
                } else {
                    result.as_str().unwrap_or("").to_owned()
                };
                let destination = app
                    .dialog()
                    .file()
                    .set_file_name(name)
                    .add_filter("Syndwell export", &[extension])
                    .blocking_save_file();
                if let Some(file) = destination {
                    let target = file.into_path().map_err(|e| e.to_string())?;
                    std::fs::write(target, body).map_err(|e| e.to_string())?;
                    return Ok(json!(true));
                }
                return Ok(json!(false));
            }
            dispatch(&path, &op, args)
        })
        .await
        .map_err(|e| e.to_string())?
    }
    pub fn run() {
        tauri::Builder::default()
            .plugin(tauri_plugin_opener::init())
            .plugin(tauri_plugin_dialog::init())
            .setup(|app| {
                let dir = app.path().app_data_dir()?;
                std::fs::create_dir_all(&dir)?;
                let path = dir.join("syndwell.sqlite3");
                db::migrate(&path).map_err(std::io::Error::other)?;
                app.manage(Store(path));
                Ok(())
            })
            .invoke_handler(tauri::generate_handler![request])
            .run(tauri::generate_context!())
            .expect("Could not start Syndwell");
    }
}
#[cfg(feature = "desktop")]
pub use desktop::run;
