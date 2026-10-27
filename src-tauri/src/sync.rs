//! Four bounded workers; all network and SQLite work stays off the webview thread.
use crate::{db, dispatch, feeds};
use serde_json::{json, Value};
use std::{
    path::Path,
    sync::{
        atomic::{AtomicBool, AtomicUsize, Ordering},
        Mutex,
    },
};
static RUNNING: Mutex<()> = Mutex::new(());
static CANCEL: AtomicBool = AtomicBool::new(false);
static TOTAL: AtomicUsize = AtomicUsize::new(0);
static DONE: AtomicUsize = AtomicUsize::new(0);
pub fn cancel() {
    CANCEL.store(true, Ordering::Relaxed)
}
pub fn status() -> Value {
    json!({"done":DONE.load(Ordering::Relaxed),"total":TOTAL.load(Ordering::Relaxed)})
}
pub fn refresh(path: &Path, v: &Value) -> Result<Value, String> {
    let _guard = RUNNING
        .try_lock()
        .map_err(|_| "A refresh is already running")?;
    CANCEL.store(false, Ordering::Relaxed);
    DONE.store(0, Ordering::Relaxed);
    let ids=db::rows(&db::open(path)?,"SELECT id FROM feeds WHERE subscribed=1 AND (?1 IS NULL OR id=?1) AND (?2 IS NULL OR folder_id IN(WITH RECURSIVE tree(id) AS(SELECT ?2 UNION ALL SELECT folders.id FROM folders JOIN tree ON folders.parent_id=tree.id) SELECT id FROM tree)) AND (?1 IS NOT NULL OR next_check<=unixepoch())",&[&v["feed_id"].as_i64(),&v["folder_id"].as_i64()])?;
    let ids: Vec<i64> = ids
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|r| r["id"].as_i64())
        .collect();
    TOTAL.store(ids.len(), Ordering::Relaxed);
    let cursor = AtomicUsize::new(0);
    let result = Mutex::new((0usize, Vec::<String>::new()));
    std::thread::scope(|scope| {
        for _ in 0..4.min(ids.len()) {
            let ids = &ids;
            let cursor = &cursor;
            let result = &result;
            scope.spawn(move || loop {
                if CANCEL.load(Ordering::Relaxed) {
                    break;
                }
                let index = cursor.fetch_add(1, Ordering::Relaxed);
                let Some(id) = ids.get(index) else { break };
                let fetched = feeds::refresh(path, *id);
                let mut state = result.lock().unwrap();
                match fetched {
                    Ok(n) => state.0 += n,
                    Err(e) => state.1.push(e),
                }
                DONE.fetch_add(1, Ordering::Relaxed);
            });
        }
    });
    if v["auto_full"].as_bool().unwrap_or(false) && !CANCEL.load(Ordering::Relaxed) {
        let pending=db::rows(&db::open(path)?,"SELECT a.id FROM articles a JOIN states s ON s.article_id=a.id WHERE a.full_content IS NULL AND s.read=0 ORDER BY a.published DESC",&[])?;
        TOTAL.fetch_add(pending.as_array().unwrap().len(), Ordering::Relaxed);
        for a in pending.as_array().unwrap() {
            if CANCEL.load(Ordering::Relaxed) {
                break;
            }
            let _ = dispatch(path, "extract", json!({"id":a["id"]}));
            DONE.fetch_add(1, Ordering::Relaxed);
        }
    }
    let (added, errors) = result.into_inner().map_err(|e| e.to_string())?;
    Ok(json!({"added":added,"errors":errors,"cancelled":CANCEL.load(Ordering::Relaxed)}))
}
