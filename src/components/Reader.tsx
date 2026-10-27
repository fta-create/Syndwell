import { useState, useEffect, useRef } from 'react';
import {
  Bookmark,
  Star,
  ExternalLink,
  ArrowLeft,
  ArrowRight,
  MoreHorizontal,
  StickyNote,
  Check,
  AlignLeft,
  Globe,
  BookOpen,
  ArrowUpRight,
  Leaf,
  Text,
  PanelLeftClose,
  ChevronLeft,
  CheckCheck,
  WifiOff,
  Image,
} from 'lucide-react';
import type { Article } from '../lib/types';
import { markdown, plain, safeHtml } from '../lib/content';
import { openLink, request } from '../lib/api';
export function Reader({
  article,
  onState,
  onNote,
  onProgress,
  onNext,
  onPrevious,
  prefs,
  onError,
  onBack,
}: {
  article: Article | null;
  onState: (key: string, value: number) => void;
  onNote: (text: string) => Promise<void>;
  onProgress: (n: number) => void;
  onNext: () => void;
  onPrevious: () => void;
  prefs: Record<string, string>;
  onError: (s: string) => void;
  onBack: () => void;
}) {
  const [images, setImages] = useState<Record<string, string>>({});
  const [imagesBusy, setImagesBusy] = useState(false);
  const [mode, setMode] = useState('feed');
  const [extracting, setExtracting] = useState(false);
  const [full, setFull] = useState<string | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState('');
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [readingProgress, setReadingProgress] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const progressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressId = useRef<number | null>(null);
  useEffect(() => {
    progressId.current = article?.id ?? null;
    setImages({});
    let active = true;
    if (article)
      request<{ url: string; data: string }[]>('cached_images', { id: article.id })
        .then((rows) => {
          if (active) setImages(Object.fromEntries(rows.map((r) => [r.url, r.data])));
        })
        .catch(() => {});
    setMode('feed');
    setReadingProgress(article?.progress || 0);
    setFull(article?.full_content || null);
    setNote(article?.note || '');
    setNoteOpen(false);
    setPreview(false);
    const el = scrollRef.current;
    if (el)
      requestAnimationFrame(() => {
        el.scrollTop = (article?.progress || 0) * Math.max(0, el.scrollHeight - el.clientHeight);
      });
    return () => {
      active = false;
      if (progressTimer.current) clearTimeout(progressTimer.current);
    };
  }, [article?.id]);
  async function extract() {
    if (!article) return;
    const id = article.id;
    progressId.current = id;
    setMode('full');
    if (full) return;
    setExtracting(true);
    try {
      const content = await request<string>('extract', { id });
      if (progressId.current === id) setFull(content);
    } catch (e) {
      setMode('feed');
      onError(String(e));
    } finally {
      setExtracting(false);
    }
  }
  async function loadImages() {
    if (!article) return;
    const id = article.id;
    setImagesBusy(true);
    try {
      const r = await request<{ images: { url: string; data: string }[]; errors: string[] }>(
        'download_images',
        { id },
      );
      if (progressId.current === id)
        setImages(Object.fromEntries(r.images.map((i) => [i.url, i.data])));
      if (r.errors.length)
        onError(`${r.errors.length} images could not download. Text remains available.`);
    } catch (e) {
      onError(String(e));
    } finally {
      setImagesBusy(false);
    }
  }
  async function save() {
    setSaving(true);
    try {
      await onNote(note);
    } finally {
      setSaving(false);
    }
  }
  if (!article)
    return (
      <main className="reader welcome-reader">
        <div className="reader-topbar">
          <span className="topbar-caption">
            <span className="tiny-dot" /> YOUR PERSONAL READING SANCTUARY
          </span>
          <BookOpen size={17} />
        </div>
        <div className="welcome-content">
          <div className="welcome-illustration">
            <div className="illustration-orbit orbit-one" />
            <div className="illustration-orbit orbit-two" />
            <span className="floating-leaf">
              <Leaf size={24} strokeWidth={1.3} />
            </span>
            <div className="illustration-paper">
              <span className="paper-kicker">THE DAILY DISCOVERY</span>
              <div className="paper-rule" />
              <BookOpen size={48} strokeWidth={1.1} />
              <span className="paper-title">Stay curious.</span>
              <div className="paper-lines">
                <i />
                <i />
                <i />
              </div>
            </div>
            <span className="floating-star">✦</span>
          </div>
          <span className="eyebrow">LESS NOISE. MORE PERSPECTIVE.</span>
          <h2>
            A good place
            <br />
            to get lost in a story.
          </h2>
          <p>
            Bring your favorite publications, independent voices,
            <br className="desktop-break" /> and big ideas into one thoughtfully quiet space.
          </p>
          <div className="welcome-features">
            <span>
              <Check size={13} />
              Entirely yours
            </span>
            <span>
              <Check size={13} />
              Always private
            </span>
            <span>
              <Check size={13} />
              Free. Forever.
            </span>
          </div>
        </div>
        <div className="reader-bottom">
          <span>Made for the love of reading.</span>
          <span>
            J / K <span className="muted">to navigate</span>
          </span>
        </div>
      </main>
    );
  const content = mode === 'full' && full ? full : article.content || article.summary;
  const words = plain(content).split(/\s+/).length;
  return (
    <main className="reader">
      <div className="reader-topbar">
        <div className="reader-nav">
          <button className="icon-button mobile-back" onClick={onBack} title="Back to articles">
            <ChevronLeft size={18} />
          </button>
          <button className="icon-button" onClick={onPrevious} aria-label="Previous article">
            <ArrowLeft size={17} />
          </button>
          <button className="icon-button" onClick={onNext} aria-label="Next article">
            <ArrowRight size={17} />
          </button>
          <span className="toolbar-separator" />
          <span className="reading-label">{Math.max(1, Math.ceil(words / 220))} min read</span>
        </div>
        <div className="reader-actions">
          <button
            className={`icon-button ${article.read ? 'toggled' : ''}`}
            title={article.read ? 'Mark unread (M)' : 'Mark read (M)'}
            onClick={() => onState('read', article.read ? 0 : 1)}
          >
            <CheckCheck size={18} />
          </button>
          <button
            className={`icon-button ${article.starred ? 'toggled gold' : ''}`}
            title="Star article (S)"
            aria-label="Star article"
            onClick={() => onState('starred', article.starred ? 0 : 1)}
          >
            <Star size={18} fill={article.starred ? 'currentColor' : 'none'} />
          </button>
          <button
            className={`icon-button ${article.saved ? 'toggled' : ''}`}
            title="Save for later (B)"
            aria-label="Save for later"
            onClick={() => onState('saved', article.saved ? 0 : 1)}
          >
            <Bookmark size={18} fill={article.saved ? 'currentColor' : 'none'} />
          </button>
          <button
            className={`icon-button ${noteOpen ? 'toggled' : ''}`}
            title="Article notes"
            aria-label="Article notes"
            onClick={() => setNoteOpen(!noteOpen)}
          >
            <StickyNote size={18} />
          </button>
          <span className="toolbar-separator" />
          <button
            className="icon-button"
            title="Open original in browser"
            aria-label="Open original in browser"
            onClick={() => openLink(article.url).catch((e) => onError(String(e)))}
          >
            <ExternalLink size={17} />
          </button>
        </div>
      </div>
      <div
        className="reading-scroll"
        ref={scrollRef}
        onScroll={() => {
          if (progressTimer.current) clearTimeout(progressTimer.current);
          const el = scrollRef.current;
          if (!el) return;
          const n =
            el.scrollHeight <= el.clientHeight
              ? 1
              : el.scrollTop / (el.scrollHeight - el.clientHeight);
          setReadingProgress(Math.max(0, Math.min(1, n)));
          progressTimer.current = setTimeout(() => onProgress(Math.max(0, Math.min(1, n))), 500);
        }}
      >
        <article
          className="reading-article"
          style={{
            maxWidth: Number(prefs.width || 680),
            fontSize: Number(prefs.fontSize || 19),
            lineHeight: Number(prefs.lineHeight || 1.85),
          }}
        >
          <div className="article-publication">
            <span className="source-avatar large">{article.feed.slice(0, 1)}</span>
            {article.feed}
            <span className="publication-dot">·</span>
            <time>
              {new Date(article.published).toLocaleDateString(undefined, {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}
            </time>
          </div>
          <h1>{article.title}</h1>
          <div className="article-byline">
            {article.author && <span>By {article.author}</span>}
            <span>{Math.max(1, Math.ceil(words / 220))} minute read</span>
          </div>
          <div className="reading-mode">
            <div className="segmented">
              <button className={mode === 'feed' ? 'selected' : ''} onClick={() => setMode('feed')}>
                <AlignLeft size={13} />
                Feed content
              </button>
              <button
                className={mode === 'full' ? 'selected' : ''}
                onClick={extract}
                disabled={extracting}
              >
                <Globe size={13} />
                {extracting ? 'Retrieving…' : 'Full article'}
              </button>
            </div>
            <span>
              {mode === 'full' && full ? 'Cached for offline reading' : 'Private by design'}
            </span>
          </div>
          {/<img[\s>]/i.test(content) && (
            <button className="image-download" disabled={imagesBusy} onClick={loadImages}>
              <Image size={13} />
              {imagesBusy
                ? 'Downloading images…'
                : Object.keys(images).length
                  ? 'Images cached locally · check for more'
                  : 'Download images for this article'}
              {!Object.keys(images).length && ' · may contact image hosts'}
            </button>
          )}
          <div
            className="prose"
            onClick={(e) => {
              const a = (e.target as HTMLElement).closest('a');
              if (a) {
                e.preventDefault();
                try {
                  openLink(new URL(a.getAttribute('href') || '', article.url).href).catch((e) =>
                    onError(String(e)),
                  );
                } catch {
                  onError('Invalid article link');
                }
              }
            }}
            dangerouslySetInnerHTML={{ __html: safeHtml(content, images, article.url) }}
          />
          {!plain(content).trim() && (
            <div className="content-fallback">
              This feed includes a title only. Try Full article or open the original.
            </div>
          )}
          <button
            className="original-link"
            onClick={() => openLink(article.url).catch((e) => onError(String(e)))}
          >
            Continue at {article.feed}
            <ArrowUpRight size={15} />
          </button>
          <div className="end-mark">✦</div>
          {noteOpen && (
            <section className="notes-editor">
              <div className="notes-heading">
                <h3>
                  <StickyNote size={16} />
                  Your private notes
                </h3>
                <button onClick={() => setPreview(!preview)}>{preview ? 'Edit' : 'Preview'}</button>
              </div>
              {preview ? (
                <div
                  className="prose note-preview"
                  dangerouslySetInnerHTML={{ __html: markdown(note) }}
                />
              ) : (
                <textarea
                  aria-label="Article note"
                  placeholder="A thought worth keeping… Markdown is welcome."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              )}
              <div className="notes-footer">
                <span>Stored only on your device</span>
                <button className="primary-button" onClick={save} disabled={saving}>
                  {saving ? 'Saving…' : 'Save note'}
                </button>
              </div>
            </section>
          )}
        </article>
      </div>
      <div
        className="reading-progress"
        role="progressbar"
        aria-label="Reading progress"
        aria-valuenow={Math.round(readingProgress * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <span style={{ width: `${readingProgress * 100}%` }} />
      </div>
      <div className="reader-bottom">
        <span>
          <span className="tiny-dot" /> Available offline
        </span>
        <button onClick={() => setNoteOpen(!noteOpen)}>
          <StickyNote size={13} />
          {article.note ? 'View your note' : 'Add a thought'}
        </button>
      </div>
    </main>
  );
}
