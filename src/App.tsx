import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus,
  Rss,
  ArrowRight,
  Globe,
  FolderPlus,
  X,
  AlertCircle,
  Check,
  WifiOff,
  RefreshCw,
  Menu,
  Upload,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { Timeline } from './components/Timeline';
import { Reader } from './components/Reader';
import { Modal } from './components/Modal';
import { Settings } from './components/Settings';
import { request, native } from './lib/api';
import {
  emptyLibrary,
  type Library,
  type Article,
  type Filters,
  type Feed,
  type Folder,
} from './lib/types';
const initialFilters: Filters = {
  view: 'all',
  status: 'all',
  query: '',
  sort: 'newest',
  after: '',
  before: '',
  contains: '',
  excludes: '',
};
export default function App() {
  const [library, setLibrary] = useState<Library>(emptyLibrary);
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [articles, setArticles] = useState<Article[]>([]);
  const [article, setArticle] = useState<Article | null>(null);
  const [modal, setModal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [syncProgress, setSyncProgress] = useState({ done: 0, total: 0 });
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [toast, setToast] = useState<{ text: string; error: boolean } | null>(null);
  const [offline, setOffline] = useState(!navigator.onLine);
  const [mobileReader, setMobileReader] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [folderId, setFolderId] = useState('');
  const [editingFeed, setEditingFeed] = useState<Feed | null>(null);
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null);
  const [importResult, setImportResult] = useState('');
  const [importProgress, setImportProgress] = useState('');
  const [localPrefs, setLocalPrefs] = useState<Record<string, string>>({});
  const queryVersion = useRef(0);
  const selectionVersion = useRef(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshLock = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const prefs = {
    ...Object.fromEntries(library.preferences.map((p) => [p.key, p.value])),
    ...localPrefs,
  };
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const notify = useCallback((text: string, error = false) => {
    setToast({ text, error });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 7000);
  }, []);
  const error = useCallback((s: string) => notify(s, true), [notify]);
  const loadLibrary = useCallback(async () => {
    if (!native) return;
    const lib = await request<Library>('library');
    setLibrary(lib);
    setLocalPrefs({});
  }, []);
  const loadArticles = useCallback(
    async (more = false) => {
      if (!native) return;
      const version = ++queryVersion.current;
      setLoading(true);
      try {
        const data = await request<Article[]>('articles', {
          ...filters,
          offset: more ? articles.length : 0,
        });
        if (version === queryVersion.current) {
          setArticles((prev) => (more ? [...prev, ...data] : data));
          setHasMore(data.length === 100);
        }
      } catch (e) {
        error(String(e));
      } finally {
        if (version === queryVersion.current) setLoading(false);
      }
    },
    [filters, articles.length, error],
  );
  useEffect(() => {
    loadLibrary().catch((e) => error(String(e)));
  }, [loadLibrary, error]);
  useEffect(() => {
    const t = setTimeout(() => {
      void loadArticles();
    }, 180);
    return () => {
      clearTimeout(t);
      queryVersion.current++;
    };
  }, [filters]);
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const apply = () =>
      (document.documentElement.dataset.theme =
        prefs.theme === 'dark' || (prefs.theme !== 'light' && media.matches) ? 'dark' : 'light');
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [prefs.theme]);
  async function preference(k: string, v: string) {
    setLocalPrefs((p) => ({ ...p, [k]: v }));
    try {
      await request('preference', { key: k, value: v });
    } catch (e) {
      error(String(e));
    }
  }
  async function selectArticle(id: number) {
    const version = ++selectionVersion.current;
    try {
      let a = await request<Article>('article', { id });
      if (version !== selectionVersion.current) return;
      if (prefsRef.current.autoRead !== 'false' && !a.read) {
        await request('state', { id, key: 'read', value: 1 });
        a = { ...a, read: 1 };
        setArticles((prev) => prev.map((x) => (x.id === id ? { ...x, read: 1 } : x)));
        void loadLibrary();
      }
      setArticle(a);
      setMobileReader(true);
    } catch (e) {
      error(String(e));
    }
  }
  async function state(key: string, value: number) {
    if (!article) return;
    const id = article.id;
    try {
      await request('state', { id, key, value });
      setArticle((a) => (a?.id === id ? { ...a, [key]: value } : a));
      setArticles((prev) => prev.map((a) => (a.id === id ? { ...a, [key]: value } : a)));
      if (key !== 'progress') void loadLibrary();
    } catch (e) {
      error(String(e));
    }
  }
  async function note(body: string) {
    if (!article) return;
    const id = article.id;
    try {
      await request('note', { id, body });
      setArticle((a) => (a?.id === id ? { ...a, note: body } : a));
      setArticles((prev) => prev.map((a) => (a.id === id ? { ...a, note: body } : a)));
      await loadLibrary();
      notify(body ? 'Note saved on your device' : 'Note removed');
    } catch (e) {
      error(String(e));
    }
  }
  function navigate(delta: number) {
    const i = articles.findIndex((a) => a.id === article?.id);
    const next = articles[i + delta];
    if (next) void selectArticle(next.id);
  }
  async function refresh(scope: Partial<Filters> = {}) {
    if (refreshLock.current) return;
    if (!native) {
      error('Open the desktop application to fetch feeds securely.');
      return;
    }
    refreshLock.current = true;
    setRefreshing(true);
    try {
      const result = await request<{ added: number; errors: string[]; cancelled: boolean }>(
        'refresh',
        { ...scope, auto_full: prefsRef.current.autoFull === 'true' },
      );
      await loadLibrary();
      await loadArticles();
      notify(
        result.cancelled
          ? 'Refresh stopped. Downloaded articles are saved.'
          : result.errors.length
            ? `${result.added} new articles. ${result.errors.length} feeds could not update; see feed settings.`
            : `All caught up. ${result.added} new articles.`,
        result.errors.length > 0,
      );
    } catch (e) {
      error(String(e));
    } finally {
      setRefreshing(false);
      refreshLock.current = false;
    }
  }
  useEffect(() => {
    if (!refreshing) return;
    const timer = setInterval(() => {
      request<{ done: number; total: number }>('refresh_status')
        .then(setSyncProgress)
        .catch(() => {});
    }, 600);
    return () => clearInterval(timer);
  }, [refreshing]);
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useEffect(() => {
    const online = () => {
      setOffline(false);
      if (native) void refreshRef.current();
    };
    const off = () => setOffline(true);
    window.addEventListener('online', online);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', off);
    };
  }, []);
  useEffect(() => {
    const minutes = Number(prefs.interval ?? 30);
    if (!native || !minutes) return;
    const timer = setInterval(() => {
      if (navigator.onLine) void refreshRef.current();
    }, minutes * 60000);
    return () => clearInterval(timer);
  }, [prefs.interval]);
  function openAdd() {
    setUrl('');
    setFolderId(filters.folder_id ? String(filters.folder_id) : '');
    setModal('add');
  }
  const keyboard = useRef({ navigate, state, article, modal, openAdd });
  keyboard.current = { navigate, state, article, modal, openAdd };
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        keyboard.current.openAdd();
        return;
      }
      if (
        keyboard.current.modal ||
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey
      )
        return;
      const k = keyboard.current;
      if (e.key === '/') {
        e.preventDefault();
        document.querySelector<HTMLInputElement>('[aria-label="Search articles"]')?.focus();
      }
      if (e.key === 'j') k.navigate(1);
      if (e.key === 'k') k.navigate(-1);
      if (e.key === 's' && k.article) void k.state('starred', k.article.starred ? 0 : 1);
      if (e.key === 'b' && k.article) void k.state('saved', k.article.saved ? 0 : 1);
      if (e.key === 'm' && k.article) void k.state('read', k.article.read ? 0 : 1);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
      await loadLibrary();
      await loadArticles();
    } catch (e) {
      error(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function mark() {
    await run(async () => {
      await request('mark_all', filters);
      setArticle((a) => (a ? { ...a, read: 1 } : a));
      notify('Articles marked as read');
    });
  }
  const title = filters.feed_id
    ? library.feeds.find((f) => f.id === filters.feed_id)?.title || 'Feed'
    : filters.folder_id
      ? library.folders.find((f) => f.id === filters.folder_id)?.name || 'Folder'
      : {
          all: 'All articles',
          unread: 'Unread',
          starred: 'Starred',
          saved: 'Read later',
          notes: 'My notes',
          read: 'Read articles',
        }[filters.view] || 'All articles';
  const folderOptions = (
    <>
      <option value="">No folder</option>
      {library.folders.map((f) => (
        <option key={f.id} value={f.id}>
          {f.name}
        </option>
      ))}
    </>
  );
  return (
    <div className={`app ${mobileReader ? 'show-reader' : ''} ${mobileNav ? 'show-nav' : ''}`}>
      <div className="mobile-header">
        <button
          className="icon-button"
          aria-label="Toggle navigation"
          onClick={() => setMobileNav(!mobileNav)}
        >
          <Menu size={19} />
        </button>
        <span>Syndwell.</span>
        <button className="icon-button" aria-label="Add feed" onClick={openAdd}>
          <Plus size={19} />
        </button>
      </div>
      <Sidebar
        library={library}
        filters={filters}
        select={(v) => {
          setFilters((p) => ({ ...p, ...v }));
          setMobileNav(false);
          setMobileReader(false);
        }}
        onAdd={openAdd}
        onFolder={() => {
          setName('');
          setFolderId('');
          setModal('folder');
        }}
        onSettings={() => setModal('settings')}
        onRefresh={() => refresh()}
        refreshing={refreshing}
        onEditFeed={(f) => {
          setEditingFeed(f);
          setName(f.title);
          setFolderId(f.folder_id ? String(f.folder_id) : '');
          setModal('feed-edit');
        }}
        onEditFolder={(f) => {
          setEditingFolder(f);
          setName(f.name);
          setModal('folder-edit');
        }}
      />
      <div className="content-shell">
        <div className="global-bar">
          <span>
            <span className={`status-dot ${offline ? 'offline' : ''}`} />
            {offline
              ? 'Offline — your library is still here'
              : native
                ? 'Your library, on your device'
                : 'DESKTOP INTERFACE PREVIEW'}
          </span>
          <button
            disabled={refreshing}
            onClick={() => refresh({ feed_id: filters.feed_id, folder_id: filters.folder_id })}
          >
            <RefreshCw size={13} className={refreshing ? 'spin' : ''} />
            {refreshing
              ? `Updating ${syncProgress.done} / ${syncProgress.total}…`
              : 'Refresh feeds'}
          </button>
          {refreshing && (
            <button onClick={() => request('cancel_refresh').catch((e) => error(String(e)))}>
              Stop
            </button>
          )}
        </div>
        <div className="panes">
          <Timeline
            articles={articles}
            selected={article?.id ?? null}
            filters={filters}
            title={title}
            setFilters={(v) => setFilters((p) => ({ ...p, ...v }))}
            onSelect={selectArticle}
            onMore={() => loadArticles(true)}
            onAdd={openAdd}
            onMark={mark}
            loading={loading}
            hasMore={hasMore}
          />
          <Reader
            article={article}
            onState={state}
            onNote={note}
            onProgress={(n) => {
              void state('progress', n);
            }}
            onNext={() => navigate(1)}
            onPrevious={() => navigate(-1)}
            prefs={prefs}
            onError={error}
            onBack={() => setMobileReader(false)}
          />
        </div>
      </div>
      {toast && (
        <div
          className={`toast ${toast.error ? 'toast-error' : ''}`}
          role={toast.error ? 'alert' : 'status'}
        >
          {toast.error ? <AlertCircle size={18} /> : <Check size={18} />}
          <span>{toast.text}</span>
          <button aria-label="Dismiss notification" onClick={() => setToast(null)}>
            <X size={16} />
          </button>
        </div>
      )}
      {modal === 'add' && (
        <Modal title="A new perspective" onClose={() => !busy && setModal(null)}>
          <p className="modal-description">
            Follow a publication, a personal blog, or a corner of the web you love. Paste a feed or
            website address.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                const id = await request<number>('add_feed', {
                  url,
                  folder_id: folderId ? Number(folderId) : null,
                });
                setFilters({ ...initialFilters, feed_id: id });
                setModal(null);
                notify('Feed added. Your next great read awaits.');
              });
            }}
          >
            <label className="field-label">
              Website or feed URL
              <div className="input-with-icon">
                <Globe size={17} />
                <input
                  autoFocus
                  type="url"
                  required
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://your-favorite-publication.com"
                />
              </div>
            </label>
            <label className="field-label">
              Add to folder
              <select
                aria-label="Folder"
                value={folderId}
                onChange={(e) => setFolderId(e.target.value)}
              >
                {folderOptions}
              </select>
            </label>
            <div className="info-box">
              <Rss size={17} />
              <span>
                RSS, Atom, and JSON Feed supported. We’ll discover the feed for you when possible.
              </span>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setModal(null)}
                disabled={busy}
              >
                Cancel
              </button>
              <button className="primary-button" disabled={busy}>
                {busy ? 'Discovering & downloading…' : 'Add to my library'}
                <Plus size={15} />
              </button>
            </div>
          </form>
        </Modal>
      )}
      {modal === 'folder' && (
        <Modal title="A little organization" onClose={() => setModal(null)}>
          <p className="modal-description">Give your interests a home.</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await request('folder_add', {
                  name,
                  parent_id: folderId ? Number(folderId) : null,
                });
                setModal(null);
              });
            }}
          >
            <label className="field-label">
              Folder name
              <input
                autoFocus
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Design, technology, slow living…"
              />
            </label>
            <label className="field-label">
              Parent folder
              <select
                aria-label="Folder"
                value={folderId}
                onChange={(e) => setFolderId(e.target.value)}
              >
                {folderOptions}
              </select>
            </label>
            <div className="modal-footer">
              <button className="primary-button" disabled={busy}>
                Create folder
                <FolderPlus size={15} />
              </button>
            </div>
          </form>
        </Modal>
      )}
      {modal === 'feed-edit' && editingFeed && (
        <Modal title="Feed details" onClose={() => setModal(null)}>
          <p className="modal-description feed-url">{editingFeed.url}</p>
          {editingFeed.error && (
            <div className="info-box danger-box">Last refresh: {editingFeed.error}</div>
          )}
          <p className="modal-description">{editingFeed.description}</p>
          <button
            className="secondary-button"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await request('download_icon', { id: editingFeed.id });
                notify('Publication icon cached on your device');
              })
            }
          >
            Download publication icon
          </button>
          <p className="small-text">Contacts the icon host once and saves the image locally.</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await request('feed_edit', {
                  id: editingFeed.id,
                  title: name,
                  folder_id: folderId ? Number(folderId) : null,
                });
                setModal(null);
              });
            }}
          >
            <label className="field-label">
              Name
              <input autoFocus required value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="field-label">
              Folder
              <select
                aria-label="Folder"
                value={folderId}
                onChange={(e) => setFolderId(e.target.value)}
              >
                {folderOptions}
              </select>
            </label>
            <p className="small-text">
              Removing a subscription keeps its articles, notes and bookmarks in your library.
            </p>
            <div className="modal-footer">
              <button
                type="button"
                className="danger-button"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await request('feed_delete', { id: editingFeed.id });
                    setModal(null);
                    setFilters(initialFilters);
                  })
                }
              >
                Unsubscribe
              </button>
              <button className="primary-button" disabled={busy}>
                Save changes
              </button>
            </div>
          </form>
        </Modal>
      )}
      {modal === 'folder-edit' && editingFolder && (
        <Modal title="Edit folder" onClose={() => setModal(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await request('folder_edit', {
                  id: editingFolder.id,
                  name,
                  position: editingFolder.position,
                });
                setModal(null);
              });
            }}
          >
            <label className="field-label">
              Name
              <input autoFocus required value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <div className="button-group">
              <button
                className="secondary-button"
                type="button"
                onClick={() =>
                  run(async () => {
                    await request('folder_move', { id: editingFolder.id, direction: -1 });
                  })
                }
              >
                <ArrowUp size={14} />
                Move up
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() =>
                  run(async () => {
                    await request('folder_move', { id: editingFolder.id, direction: 1 });
                  })
                }
              >
                <ArrowDown size={14} />
                Move down
              </button>
            </div>
            <p className="small-text">
              Deleting a folder moves its feeds and child folders to the top level.
            </p>
            <div className="modal-footer">
              <button
                className="danger-button"
                type="button"
                onClick={() =>
                  run(async () => {
                    await request('folder_delete', { id: editingFolder.id });
                    setModal(null);
                    setFilters(initialFilters);
                  })
                }
              >
                Delete folder
              </button>
              <button className="primary-button" disabled={busy}>
                Save
              </button>
            </div>
          </form>
        </Modal>
      )}
      {modal === 'settings' && (
        <Settings
          prefs={prefs}
          setPreference={preference}
          onClose={() => setModal(null)}
          onChanged={() => {
            void loadLibrary();
            void loadArticles();
            setArticle(null);
          }}
          onError={error}
          onImport={() => {
            setImportResult('');
            setModal('import');
          }}
        />
      )}
      {modal === 'import' && (
        <Modal title="Bring your reading world along" onClose={() => !busy && setModal(null)}>
          <p className="modal-description">
            Import an OPML file from another reader. Folder hierarchies are preserved and duplicate
            feeds are skipped.
          </p>
          <input
            hidden
            ref={fileInput}
            type="file"
            accept=".opml,.xml,text/xml"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              void run(async () => {
                if (f.size > 16 * 1024 * 1024) throw new Error('OPML exceeds 16 MiB');
                setImportProgress('Reading file…');
                const xml = await f.text();
                setImportProgress('Importing subscriptions in a local transaction…');
                const result = await request<{
                  imported: number;
                  skipped: number;
                  invalid: number;
                }>('import_opml', { xml });
                setImportResult(
                  `${result.imported} feeds imported · ${result.skipped} duplicates skipped · ${result.invalid} invalid URLs`,
                );
                setImportProgress('');
                notify('Subscriptions imported. Refresh to download articles.');
              });
            }}
          />
          <button
            className="import-dropzone"
            disabled={busy}
            onClick={() => fileInput.current?.click()}
          >
            <Upload size={27} />
            <strong>{busy ? importProgress : 'Choose an OPML file'}</strong>
            <span>Subscriptions stay on your device</span>
          </button>
          {importResult && (
            <div className="info-box">
              <Check size={18} />
              {importResult}
            </div>
          )}
          <div className="modal-footer">
            <button
              className="primary-button"
              disabled={busy}
              onClick={() => {
                setModal(null);
                void refresh();
              }}
            >
              Refresh imported feeds
              <ArrowRight size={15} />
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
