import {
  BookOpen,
  Inbox,
  Star,
  Bookmark,
  StickyNote,
  Plus,
  ChevronDown,
  Folder as FolderIcon,
  Settings,
  ArrowUpRight,
  Rss,
  RefreshCw,
  Ellipsis,
  Check,
  Sun,
} from 'lucide-react';
import type { Library, Filters, Feed, Folder } from '../lib/types';
export function Sidebar({
  library,
  filters,
  select,
  onAdd,
  onFolder,
  onSettings,
  onRefresh,
  refreshing,
  onEditFeed,
  onEditFolder,
}: {
  library: Library;
  filters: Filters;
  select: (v: Partial<Filters>) => void;
  onAdd: () => void;
  onFolder: () => void;
  onSettings: () => void;
  onRefresh: () => void;
  refreshing: boolean;
  onEditFeed: (f: Feed) => void;
  onEditFolder: (f: Folder) => void;
}) {
  const count = library.counts[0];
  const views = [
    ['all', 'All articles', BookOpen, count.total],
    ['unread', 'Unread', Inbox, count.unread],
    ['starred', 'Starred', Star, count.starred],
    ['saved', 'Read later', Bookmark, count.saved],
    ['notes', 'My notes', StickyNote, count.notes],
  ] as const;
  function unreadInFolder(id: number): number {
    const ids = new Set([id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const f of library.folders)
        if (f.parent_id !== null && ids.has(f.parent_id) && !ids.has(f.id)) {
          ids.add(f.id);
          changed = true;
        }
    }
    return library.feeds
      .filter((f) => f.folder_id !== null && ids.has(f.folder_id))
      .reduce((n, f) => n + f.unread, 0);
  }
  const feed = (f: Feed) => (
    <div className={`feed-row ${filters.feed_id === f.id ? 'active' : ''}`} key={f.id}>
      <button
        title={f.error || f.description || f.url}
        onClick={() => select({ view: 'all', feed_id: f.id, folder_id: undefined })}
      >
        <span className={`feed-symbol ${f.error ? 'error' : ''}`}>
          {f.icon_data &&
          /^data:image\/(png|jpeg|gif|webp|avif|x-icon|vnd.microsoft.icon);base64,[a-zA-Z0-9+/=]+$/.test(
            f.icon_data,
          ) ? (
            <img src={f.icon_data} alt="" />
          ) : (
            <Rss size={13} />
          )}
        </span>
        <span className="truncate">{f.title}</span>
        {f.error ? (
          <span className="error-dot" />
        ) : f.unread > 0 ? (
          <span className="count">{f.unread}</span>
        ) : null}
      </button>
      <button className="row-menu" aria-label={`Edit ${f.title}`} onClick={() => onEditFeed(f)}>
        <Ellipsis size={15} />
      </button>
    </div>
  );
  const folder = (f: Folder, depth = 0): React.ReactNode => (
    <div key={f.id} style={{ paddingLeft: depth ? 12 : 0 }}>
      <div className={`folder-row ${filters.folder_id === f.id ? 'active' : ''}`}>
        <button onClick={() => select({ view: 'all', folder_id: f.id, feed_id: undefined })}>
          <ChevronDown size={12} />
          <FolderIcon size={15} />
          <span className="truncate">{f.name}</span>
          <span className="count">{unreadInFolder(f.id) || ''}</span>
        </button>
        <button
          className="row-menu"
          aria-label={`Edit folder ${f.name}`}
          onClick={() => onEditFolder(f)}
        >
          <Ellipsis size={15} />
        </button>
      </div>
      {library.feeds.filter((x) => x.folder_id === f.id).map(feed)}
      {library.folders.filter((x) => x.parent_id === f.id).map((x) => folder(x, depth + 1))}
    </div>
  );
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-icon">
          <BookOpen size={22} strokeWidth={1.6} />
        </span>
        <span>
          Syndwell<span className="brand-period">.</span>
        </span>
      </div>
      <button className="workspace" onClick={onSettings}>
        <span className="workspace-avatar">S</span>
        <span>
          Your reading space<small>Local & personal</small>
        </span>
        <ChevronDown size={14} />
      </button>
      <nav aria-label="Library">
        {views.map(([key, label, Icon, n]) => (
          <button
            key={key}
            className={`nav-item ${!filters.feed_id && !filters.folder_id && filters.view === key ? 'active' : ''}`}
            onClick={() => select({ view: key, feed_id: undefined, folder_id: undefined })}
          >
            <Icon size={17} strokeWidth={1.7} />
            <span>{label}</span>
            <span className="count">{n || ''}</span>
          </button>
        ))}
      </nav>
      <div className="section-heading">
        <span>YOUR LIBRARY</span>
        <button className="icon-button" title="New folder" onClick={onFolder}>
          <Plus size={15} />
        </button>
      </div>
      <div className="subscriptions">
        {library.folders.filter((f) => !f.parent_id).map((f) => folder(f))}
        {library.feeds.filter((f) => !f.folder_id).map(feed)}
        {!library.feeds.length && !library.folders.length && (
          <div className="sidebar-empty">
            <Rss size={20} />
            <p>
              Your favorite corners
              <br />
              of the internet, together.
            </p>
          </div>
        )}
      </div>
      <button className="add-feed" onClick={onAdd}>
        <Plus size={17} />
        Add a feed<kbd>⌘ N</kbd>
      </button>
      <div className="sidebar-bottom">
        <div className="private-label">
          <span />
          <span>Just you and your curiosity.</span>
        </div>
        <div className="bottom-actions">
          <button onClick={onSettings}>
            <Settings size={16} />
            Settings
          </button>
          <button
            title="Refresh all feeds"
            aria-label="Refresh all feeds"
            onClick={onRefresh}
            disabled={refreshing}
          >
            <RefreshCw size={15} className={refreshing ? 'spin' : ''} />
          </button>
        </div>
      </div>
    </aside>
  );
}
