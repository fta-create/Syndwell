import { useState } from 'react';
import {
  Search,
  SlidersHorizontal,
  CheckCheck,
  ChevronDown,
  ArrowDownWideNarrow,
  ArrowUpDown,
  Inbox,
  Plus,
  ArrowRight,
  Bookmark,
  Star,
  X,
} from 'lucide-react';
import type { Article, Filters } from '../lib/types';
import { dateLabel, plain } from '../lib/content';
export function Timeline({
  articles,
  selected,
  filters,
  title,
  setFilters,
  onSelect,
  onMore,
  onAdd,
  onMark,
  loading,
  hasMore,
}: {
  articles: Article[];
  selected: number | null;
  filters: Filters;
  title: string;
  setFilters: (v: Partial<Filters>) => void;
  onSelect: (id: number) => void;
  onMore: () => void;
  onAdd: () => void;
  onMark: () => void;
  loading: boolean;
  hasMore: boolean;
}) {
  const [advanced, setAdvanced] = useState(false);
  return (
    <section className="timeline">
      <header className="timeline-header">
        <div className="eyebrow">YOUR DAILY PERSPECTIVE</div>
        <div className="timeline-title">
          <h1>{title}</h1>
          <button
            className="icon-button"
            title="Mark this view as read"
            aria-label="Mark this view as read"
            onClick={onMark}
          >
            <CheckCheck size={18} />
          </button>
        </div>
        <div className="list-subtitle">A little discovery. A wider world.</div>
        <div className="search-field">
          <Search size={16} />
          <input
            aria-label="Search articles"
            placeholder="Search your library…"
            value={filters.query}
            onChange={(e) => setFilters({ query: e.target.value })}
          />
          {filters.query ? (
            <button aria-label="Clear search" onClick={() => setFilters({ query: '' })}>
              <X size={14} />
            </button>
          ) : (
            <kbd>/</kbd>
          )}
        </div>
        <div className="list-toolbar">
          <button
            className={advanced ? 'filter-trigger selected' : 'filter-trigger'}
            onClick={() => setAdvanced(!advanced)}
          >
            <SlidersHorizontal size={14} />
            Filters
            {[filters.after, filters.before, filters.contains, filters.excludes].some(Boolean) && (
              <span className="tiny-dot" />
            )}
          </button>
          <label className="sort-control">
            <ArrowDownWideNarrow size={14} />
            <select
              aria-label="Sort articles"
              value={filters.sort}
              onChange={(e) => setFilters({ sort: e.target.value })}
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="relevance">Relevance</option>
            </select>
          </label>
        </div>
        {advanced && (
          <div className="advanced-filters">
            <label className="status-filter">
              Reading status
              <select
                value={filters.status}
                onChange={(e) => setFilters({ status: e.target.value })}
              >
                <option value="all">All articles</option>
                <option value="unread">Unread only</option>
                <option value="read">Read only</option>
              </select>
            </label>
            <label>
              From
              <input
                type="date"
                value={filters.after}
                onChange={(e) => setFilters({ after: e.target.value })}
              />
            </label>
            <label>
              Until
              <input
                type="date"
                value={filters.before}
                onChange={(e) => setFilters({ before: e.target.value })}
              />
            </label>
            <label>
              Contains
              <input
                placeholder="Words to include"
                value={filters.contains}
                onChange={(e) => setFilters({ contains: e.target.value })}
              />
            </label>
            <label>
              Excludes
              <input
                placeholder="Words to exclude"
                value={filters.excludes}
                onChange={(e) => setFilters({ excludes: e.target.value })}
              />
            </label>
            <button
              onClick={() =>
                setFilters({ status: 'all', after: '', before: '', contains: '', excludes: '' })
              }
            >
              Clear filters
            </button>
          </div>
        )}
      </header>
      <div className="article-list" aria-label="Articles" aria-busy={loading}>
        {articles.length > 0 && (
          <div className="list-date">
            {filters.query ? 'SEARCH RESULTS' : 'THE LATEST'}
            <span>
              {articles.length}
              {hasMore ? '+' : ''} articles
            </span>
          </div>
        )}
        {articles.map((a) => (
          <button
            key={a.id}
            className={`article-card ${selected === a.id ? 'selected' : ''} ${a.read ? 'is-read' : ''}`}
            onClick={() => onSelect(a.id)}
          >
            <div className="article-source">
              <span className="source-avatar">{a.feed.slice(0, 1).toUpperCase()}</span>
              <span className="truncate">{a.feed}</span>
              <time>{dateLabel(a.published)}</time>
            </div>
            <div className="article-card-title">
              {!a.read && <span className="unread-dot" />}
              <h3>{a.title}</h3>
            </div>
            <p>{plain(a.summary).slice(0, 165) || 'Open this article to start reading.'}</p>
            <div className="article-meta">
              <span>
                {Math.max(1, Math.ceil(plain(a.summary).split(/\s+/).length / 220))} min preview
              </span>
              {a.saved > 0 && <Bookmark size={12} />} {a.starred > 0 && <Star size={12} />}{' '}
              {!!a.note && <span>Note attached</span>}
            </div>
          </button>
        ))}
        {hasMore && (
          <button className="load-more" onClick={onMore} disabled={loading}>
            {loading ? 'Loading…' : 'Load more articles'}
          </button>
        )}
        {!articles.length && !loading && (
          <div className="list-empty">
            <span className="empty-icon">
              <Inbox size={28} strokeWidth={1.3} />
            </span>
            <h3>{filters.query ? 'No matches, yet.' : 'Room for something good.'}</h3>
            <p>
              {filters.query
                ? 'Try another phrase or adjust your filters.'
                : 'Your next great read starts with a source you love.'}
            </p>
            <button onClick={onAdd}>
              Find your first feed
              <ArrowRight size={14} />
            </button>
          </div>
        )}
        {!articles.length && loading && <div className="loading-state">Loading your library…</div>}
      </div>
      <footer className="list-footer">
        <span className="tiny-dot" /> A quieter corner of the internet
      </footer>
    </section>
  );
}
