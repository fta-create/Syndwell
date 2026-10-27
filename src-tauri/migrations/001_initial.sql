PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS folders(id INTEGER PRIMARY KEY, name TEXT NOT NULL, parent_id INTEGER REFERENCES folders(id) ON DELETE SET NULL, position INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS feeds(id INTEGER PRIMARY KEY, url TEXT NOT NULL UNIQUE, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', site_url TEXT NOT NULL DEFAULT '', folder_id INTEGER REFERENCES folders(id) ON DELETE SET NULL, etag TEXT, modified TEXT, error TEXT, checked_at TEXT, failures INTEGER NOT NULL DEFAULT 0, next_check INTEGER NOT NULL DEFAULT 0, subscribed INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS articles(id INTEGER PRIMARY KEY, feed_id INTEGER NOT NULL REFERENCES feeds(id), guid TEXT NOT NULL, url TEXT NOT NULL, title TEXT NOT NULL, author TEXT NOT NULL DEFAULT '', summary TEXT NOT NULL DEFAULT '', content TEXT NOT NULL DEFAULT '', full_content TEXT, published TEXT NOT NULL, UNIQUE(feed_id,guid));
CREATE INDEX IF NOT EXISTS article_date ON articles(published DESC);
CREATE INDEX IF NOT EXISTS article_feed ON articles(feed_id,published DESC);
CREATE UNIQUE INDEX IF NOT EXISTS article_url ON articles(feed_id,url) WHERE url<>'';
CREATE TABLE IF NOT EXISTS states(article_id INTEGER PRIMARY KEY REFERENCES articles(id) ON DELETE CASCADE, read INTEGER NOT NULL DEFAULT 0, starred INTEGER NOT NULL DEFAULT 0, saved INTEGER NOT NULL DEFAULT 0, progress REAL NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS notes(article_id INTEGER PRIMARY KEY REFERENCES articles(id) ON DELETE CASCADE, body TEXT NOT NULL DEFAULT '', updated TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS preferences(key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE VIRTUAL TABLE IF NOT EXISTS search USING fts5(title,summary,content,author,feed,notes, tokenize='unicode61 remove_diacritics 2');
CREATE TRIGGER IF NOT EXISTS article_insert AFTER INSERT ON articles BEGIN
INSERT INTO states(article_id) VALUES(new.id);
INSERT INTO search(rowid,title,summary,content,author,feed,notes) VALUES(new.id,new.title,new.summary,new.content,new.author,(SELECT title FROM feeds WHERE id=new.feed_id),''); END;
CREATE TRIGGER IF NOT EXISTS article_update AFTER UPDATE ON articles BEGIN UPDATE search SET title=new.title,summary=new.summary,content=COALESCE(new.full_content,new.content),author=new.author WHERE rowid=new.id; END;
CREATE TRIGGER IF NOT EXISTS note_insert AFTER INSERT ON notes BEGIN UPDATE search SET notes=new.body WHERE rowid=new.article_id; END;
CREATE TRIGGER IF NOT EXISTS note_update AFTER UPDATE ON notes BEGIN UPDATE search SET notes=new.body WHERE rowid=new.article_id; END;
CREATE TRIGGER IF NOT EXISTS feed_rename AFTER UPDATE OF title ON feeds BEGIN UPDATE search SET feed=new.title WHERE rowid IN(SELECT id FROM articles WHERE feed_id=new.id); END;
PRAGMA user_version=1;
