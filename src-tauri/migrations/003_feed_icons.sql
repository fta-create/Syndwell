ALTER TABLE feeds ADD COLUMN icon_url TEXT;
ALTER TABLE feeds ADD COLUMN icon_data TEXT;
PRAGMA user_version=3;
