use serde_json::json;
use std::path::{Path, PathBuf};
use syndwell_lib::{db, dispatch, feeds, opml};
fn setup() -> (tempfile::TempDir, PathBuf) {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("test.sqlite3");
    db::migrate(&path).unwrap();
    (dir, path)
}
fn seed(path: &Path) {
    let c = db::open(path).unwrap();
    for (id, title, url) in [
        (1, "Field Notes", "https://example.org/rss"),
        (2, "Atom Journal", "https://example.org/atom"),
        (3, "JSON Journal", "https://example.org/feed.json"),
    ] {
        c.execute(
            "INSERT INTO feeds(id,title,url) VALUES(?1,?2,?3)",
            rusqlite::params![id, title, url],
        )
        .unwrap();
    }
    feeds::store(path, 1, include_bytes!("../../tests/fixtures/rss.xml")).unwrap();
    feeds::store(path, 2, include_bytes!("../../tests/fixtures/atom.xml")).unwrap();
    feeds::store(path, 3, include_bytes!("../../tests/fixtures/feed.json")).unwrap();
}
#[test]
fn migrations_are_repeatable() {
    let (_d, p) = setup();
    db::migrate(&p).unwrap();
    assert_eq!(
        db::open(&p)
            .unwrap()
            .query_row("PRAGMA user_version", [], |r| r.get::<_, i64>(0))
            .unwrap(),
        3
    );
}
#[test]
fn formats_dedupe_and_states_survive_refresh() {
    let (_d, p) = setup();
    seed(&p);
    dispatch(&p, "state", json!({"id":1,"key":"starred","value":1})).unwrap();
    dispatch(&p, "note", json!({"id":1,"body":"An enduring idea"})).unwrap();
    assert_eq!(
        feeds::store(&p, 1, include_bytes!("../../tests/fixtures/rss.xml")).unwrap(),
        0
    );
    let c = db::open(&p).unwrap();
    assert_eq!(
        c.query_row("SELECT count(*) FROM articles", [], |r| r.get::<_, i64>(0))
            .unwrap(),
        4
    );
    assert_eq!(
        dispatch(&p, "article", json!({"id":1})).unwrap()["starred"],
        1
    );
    drop(c);
    assert_eq!(
        dispatch(&p, "article", json!({"id":1})).unwrap()["note"],
        "An enduring idea"
    );
}
#[test]
fn search_notes_authors_feed_and_full_text() {
    let (_d, p) = setup();
    seed(&p);
    dispatch(&p, "note", json!({"id":1,"body":"Rareword solitude"})).unwrap();
    for q in ["Rareword", "Ada", "Field", "gardening"] {
        let result = dispatch(&p, "articles", json!({"query":q,"sort":"relevance"})).unwrap();
        assert!(!result.as_array().unwrap().is_empty(), "{q}");
    }
    db::open(&p)
        .unwrap()
        .execute(
            "UPDATE articles SET full_content='Newly extracted astronomy' WHERE id=1",
            [],
        )
        .unwrap();
    assert_eq!(
        dispatch(&p, "articles", json!({"query":"astronomy"}))
            .unwrap()
            .as_array()
            .unwrap()
            .len(),
        1
    );
    assert!(dispatch(&p, "articles", json!({"query":"\" OR * : - ()"})).is_ok());
}
#[test]
fn sorting_filters_folders_and_bulk_read() {
    let (_d, p) = setup();
    seed(&p);
    let newest = dispatch(&p, "articles", json!({"sort":"newest"})).unwrap();
    let oldest = dispatch(&p, "articles", json!({"sort":"oldest"})).unwrap();
    assert_eq!(newest[0]["title"], "Open tools for everyone");
    assert_eq!(oldest[0]["title"], "The quiet art of growing things");
    assert_eq!(
        dispatch(
            &p,
            "articles",
            json!({"contains":"slower","excludes":"garden"})
        )
        .unwrap()
        .as_array()
        .unwrap()
        .len(),
        1
    );
    assert_eq!(
        dispatch(
            &p,
            "articles",
            json!({"after":"2026-06-03","before":"2026-06-04"})
        )
        .unwrap()
        .as_array()
        .unwrap()
        .len(),
        2
    );
    let c = db::open(&p).unwrap();
    c.execute_batch("INSERT INTO folders(id,name) VALUES(1,'Root'); INSERT INTO folders(id,name,parent_id) VALUES(2,'Child',1); UPDATE feeds SET folder_id=2 WHERE id=1;").unwrap();
    assert_eq!(
        dispatch(&p, "articles", json!({"folder_id":1}))
            .unwrap()
            .as_array()
            .unwrap()
            .len(),
        2
    );
    dispatch(&p, "mark_all", json!({"folder_id":1})).unwrap();
    assert_eq!(
        dispatch(&p, "articles", json!({"view":"unread"}))
            .unwrap()
            .as_array()
            .unwrap()
            .len(),
        2
    );
}
#[test]
fn discovery_resolves_relative_feeds() {
    let base = url::Url::parse("https://example.org/blog/").unwrap();
    assert_eq!(feeds::discover("<link rel='alternate' type='application/rss+xml' href='../rss'><link rel='alternate' type='application/feed+json' href='/feed.json'>",&base),vec!["https://example.org/rss","https://example.org/feed.json"]);
}
#[test]
fn opml_roundtrip_duplicate_and_hierarchy() {
    let (_d, p) = setup();
    let r = opml::import(&p, include_str!("../../tests/fixtures/subscriptions.opml")).unwrap();
    assert_eq!(r["imported"], 3);
    assert_eq!(r["skipped"], 1);
    assert_eq!(r["invalid"], 1);
    let xml = opml::export(&p).unwrap();
    let (_d2, p2) = setup();
    assert_eq!(opml::import(&p2, &xml).unwrap()["imported"], 3);
    assert_eq!(
        dispatch(&p2, "library", json!({})).unwrap()["folders"]
            .as_array()
            .unwrap()
            .len(),
        2
    );
    assert_eq!(opml::import(&p, &xml).unwrap()["imported"], 0);
}
#[test]
fn backup_restore_and_unsubscribe_preserve_offline_notes() {
    let (_d, p) = setup();
    seed(&p);
    dispatch(&p, "note", json!({"id":1,"body":"# My research"})).unwrap();
    dispatch(&p, "state", json!({"id":1,"key":"saved","value":1})).unwrap();
    let backup = dispatch(&p, "backup", json!({})).unwrap();
    let (_d2, p2) = setup();
    dispatch(&p2, "restore", backup.clone()).unwrap();
    dispatch(&p2, "feed_delete", json!({"id":1})).unwrap();
    let saved = dispatch(&p2, "articles", json!({"view":"saved"})).unwrap();
    assert_eq!(saved[0]["note"], "# My research");
    assert!(dispatch(&p2, "export_notes", json!({}))
        .unwrap()
        .as_str()
        .unwrap()
        .contains("My research"));
    let mut bad = backup;
    bad["articles"][0]["feed_id"] = json!(999);
    assert!(dispatch(&p2, "restore", bad).is_err());
    assert_eq!(
        dispatch(&p2, "articles", json!({"view":"saved"})).unwrap()[0]["note"],
        "# My research"
    );
}
#[test]
fn readability_extracts_fixture_without_network() {
    let html="<html><head><title>Garden</title></head><body><nav>Menu</nav><article><h1>Garden</h1><p>A quiet garden gives us room to think. The leaves rustle in the afternoon sun, while bees wander between flowers. Every day there is a small new discovery waiting to be found. We return to the soil and pay attention to the seasons, learning patience and care along the way.</p><p>Another season brings an abundance of colors and seeds. This is a space for slowing down, for noticing the world around us, and for making something beautiful with our hands.</p></article></body></html>";
    let p = readability::extractor::extract(
        &mut std::io::Cursor::new(html),
        &url::Url::parse("https://example.org").unwrap(),
    )
    .unwrap();
    assert!(p.text.contains("quiet garden"));
}

#[test]
fn upgrades_v1_without_losing_data() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("v1.sqlite3");
    let c = db::open(&path).unwrap();
    c.execute_batch(include_str!("../migrations/001_initial.sql"))
        .unwrap();
    c.execute(
        "INSERT INTO preferences(key,value) VALUES('theme','dark')",
        [],
    )
    .unwrap();
    drop(c);
    db::migrate(&path).unwrap();
    db::migrate(&path).unwrap();
    assert_eq!(
        dispatch(&path, "library", json!({})).unwrap()["preferences"][0]["value"],
        "dark"
    );
    assert!(dispatch(&path, "cached_images", json!({"id":1}))
        .unwrap()
        .as_array()
        .unwrap()
        .is_empty());
}
#[test]
fn canonical_dedupe_updates_content_and_preserves_research() {
    let (_d, p) = setup();
    seed(&p);
    dispatch(&p, "note", json!({"id":1,"body":"Keep this thought"})).unwrap();
    let changed = include_str!("../../tests/fixtures/rss.xml")
        .replace("garden-1", "new-guid-for-same-article")
        .replace(
            "https://example.org/garden",
            "https://example.org/garden#section",
        )
        .replace("The quiet art of growing things", "A revised garden story");
    assert_eq!(feeds::store(&p, 1, changed.as_bytes()).unwrap(), 0);
    let article = dispatch(&p, "article", json!({"id":1})).unwrap();
    assert_eq!(article["title"], "A revised garden story");
    assert_eq!(article["note"], "Keep this thought");
    assert_eq!(
        dispatch(&p, "articles", json!({"query":"revised"}))
            .unwrap()
            .as_array()
            .unwrap()
            .len(),
        1
    );
}
#[test]
fn cache_images_backup_and_clear_keeps_notes() {
    let (_d, p) = setup();
    seed(&p);
    dispatch(&p, "note", json!({"id":1,"body":"Offline note"})).unwrap();
    db::open(&p).unwrap().execute("INSERT INTO images(article_id,url,mime,data) VALUES(1,'https://example.org/image.png','image/png','aGVsbG8=')",[]).unwrap();
    let cached = dispatch(&p, "cached_images", json!({"id":1})).unwrap();
    assert_eq!(cached[0]["data"], "data:image/png;base64,aGVsbG8=");
    let backup = dispatch(&p, "backup", json!({})).unwrap();
    let (_d2, p2) = setup();
    dispatch(&p2, "restore", backup).unwrap();
    assert_eq!(
        dispatch(&p2, "cached_images", json!({"id":1})).unwrap(),
        cached
    );
    dispatch(&p2, "clear_cache", json!({})).unwrap();
    assert!(dispatch(&p2, "cached_images", json!({"id":1}))
        .unwrap()
        .as_array()
        .unwrap()
        .is_empty());
    assert_eq!(
        dispatch(&p2, "article", json!({"id":1})).unwrap()["note"],
        "Offline note"
    );
}
#[test]
fn large_library_pagination_and_search() {
    let (_d, p) = setup();
    seed(&p);
    let mut c = db::open(&p).unwrap();
    let tx = c.transaction().unwrap();
    {
        let mut stmt=tx.prepare("INSERT INTO articles(feed_id,guid,url,title,summary,content,published) VALUES(1,?1,?2,?3,'An extensive local archive','Useful evergreen research','2026-06-05T00:00:00Z')").unwrap();
        for i in 0..30_000 {
            stmt.execute(rusqlite::params![
                format!("archive-{i}"),
                format!("https://example.org/archive/{i}"),
                format!("Research archive {i}")
            ])
            .unwrap();
        }
    }
    tx.commit().unwrap();
    let start = std::time::Instant::now();
    let result = dispatch(
        &p,
        "articles",
        json!({"query":"evergreen","sort":"relevance"}),
    )
    .unwrap();
    assert_eq!(result.as_array().unwrap().len(), 100);
    assert_eq!(
        dispatch(&p, "articles", json!({"query":"evergreen","offset":29_950}))
            .unwrap()
            .as_array()
            .unwrap()
            .len(),
        50
    );
    eprintln!("30k article search + pagination: {:?}", start.elapsed());
    dispatch(&p, "mark_all", json!({"query":"gardening"})).unwrap();
    assert_eq!(dispatch(&p, "article", json!({"id":1})).unwrap()["read"], 1);
    assert_eq!(dispatch(&p, "article", json!({"id":2})).unwrap()["read"], 0);
}
#[test]
fn thousands_of_subscriptions_and_invalid_import_are_atomic() {
    let (_d, p) = setup();
    let outlines = (0..2000)
        .map(|i| format!("<outline text='Feed {i}' xmlUrl='https://example.org/feed/{i}'/>"))
        .collect::<String>();
    let xml = format!("<opml version='2.0'><body>{outlines}</body></opml>");
    assert_eq!(opml::import(&p, &xml).unwrap()["imported"], 2000);
    assert_eq!(opml::import(&p, &xml).unwrap()["skipped"], 2000);
    assert!(opml::import(&p, "<opml><body><outline").is_err());
    assert_eq!(
        dispatch(&p, "library", json!({})).unwrap()["feeds"]
            .as_array()
            .unwrap()
            .len(),
        2000
    );
}

#[test]
fn folder_reorder_survives_rename_and_delete_preserves_children() {
    let (_d, p) = setup();
    for name in ["Alpha", "Beta", "Gamma"] {
        dispatch(&p, "folder_add", json!({"name":name})).unwrap();
    }
    dispatch(&p, "folder_move", json!({"id":3,"direction":-1})).unwrap();
    dispatch(
        &p,
        "folder_edit",
        json!({"id":3,"name":"Renamed","position":999}),
    )
    .unwrap();
    let lib = dispatch(&p, "library", json!({})).unwrap();
    assert_eq!(lib["folders"][1]["name"], "Renamed");
    dispatch(&p, "folder_add", json!({"name":"Nested","parent_id":3})).unwrap();
    dispatch(&p, "folder_delete", json!({"id":3})).unwrap();
    let c = db::open(&p).unwrap();
    let parent: Option<i64> = c
        .query_row(
            "SELECT parent_id FROM folders WHERE name='Nested'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert!(parent.is_none());
}
