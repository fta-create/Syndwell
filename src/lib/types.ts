export interface Feed {
  id: number;
  title: string;
  url: string;
  description: string;
  icon_data: string | null;
  site_url: string;
  folder_id: number | null;
  error: string | null;
  unread: number;
  checked_at: string | null;
}
export interface Folder {
  id: number;
  name: string;
  parent_id: number | null;
  position: number;
}
export interface Article {
  id: number;
  feed_id: number;
  title: string;
  author: string;
  url: string;
  published: string;
  summary: string;
  content?: string;
  full_content?: string | null;
  feed: string;
  read: number;
  starred: number;
  saved: number;
  progress: number;
  note: string;
}
export interface Library {
  feeds: Feed[];
  folders: Folder[];
  counts: { total: number; unread: number; starred: number; saved: number; notes: number }[];
  preferences: { key: string; value: string }[];
}
export interface Filters {
  view: string;
  status: string;
  feed_id?: number;
  folder_id?: number;
  query: string;
  sort: string;
  after: string;
  before: string;
  contains: string;
  excludes: string;
}
export const emptyLibrary: Library = {
  feeds: [],
  folders: [],
  counts: [{ total: 0, unread: 0, starred: 0, saved: 0, notes: 0 }],
  preferences: [],
};
