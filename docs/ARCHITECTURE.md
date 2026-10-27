# Architecture

## Boundaries

React components render the sidebar, paged timeline, reader, settings, and modal forms. `src/lib/api.ts` is the only application IPC boundary. Strict TypeScript models describe persisted data; application state is local React state with debounced queries and stale-response guards. There is no localStorage article store, remote backend, web server, or account layer.

Tauri exposes one async `request` command. Work runs on its blocking pool, so HTTP, XML parsing, Readability and SQLite never block the webview. Native export dialogs accept only a selected export kind; the renderer cannot choose arbitrary filesystem paths. `opener` is scoped to standard external URL handling; the frontend further restricts it to HTTP(S). No shell, general filesystem or arbitrary command-execution permissions are granted to the renderer.

The Rust library also compiles without the optional `desktop` feature, enabling meaningful headless tests without GTK/WebKit. `syndwell-cli` is an explicit developer utility with JSON stdin/stdout and local fixture ingestion; it is not available through IPC and is not the desktop entry point.

## Native modules

- `db`: connection policy, schema migration, parameterized filters, FTS queries and mutations.
- `feeds`: public-site discovery, RSS/Atom/JSON parsing, transactional ingestion, deduplication and conditional feed updates.
- `net`: public-address validation, DNS pinning, redirect validation, timeouts and response-size bounds. No cookies, stored credentials, or proxy environment inheritance.
- `sync`: four workers, observable progress, request-boundary cancellation, backoff selection, optional extracted-content downloads.
- `opml`: transactional import, duplicate skipping, nested-folder preservation and escaped XML export.
- `images`: explicit raster-image caching as base64 SQLite data; no remote resource loading by the webview.
- `lib`: typed operation dispatch, extraction, backup/restore, native startup and export handling.

## Data lifecycle

SQLite runs with foreign keys, WAL, and a busy timeout. Versioned SQL migrations execute in a transaction and reject databases newer than the application. Feeds retain HTTP metadata and refresh errors. Articles are unique by `(feed_id, guid)` and by nonempty canonical URL within a feed. Re-ingestion updates editorial content while retaining article IDs, dates, reading states, extracted caches and notes. Missing dates receive a stable first-seen timestamp.

Read/star/save/progress states live separately from editorial content. Unsubscribe changes subscription membership and keeps the archive. Folder deletion sets child folder and feed parents to NULL. Reordering normalizes sibling positions transactionally. Recursive folder filters and unread counts include descendants.

The independent FTS5 table indexes title, summary, feed/extracted content, author, feed name and note text. Triggers update it when articles, notes or feed names change. User queries are tokenized into quoted literals, not injected into FTS syntax. BM25 is used only when a search exists; chronological order is the fallback. SQL predicates are parameterized. Visible results load in 100-row pages; no subscription/archive quota exists.

Backups are transactionally consistent JSON snapshots of all application tables, including images and preferences. Restore uses schema-defined column names, a transaction, deferred foreign-key validation, folder-cycle checks and FTS rebuilds. Invalid data rolls back to the previous library. Backup JSON is sensitive personal data and is never uploaded by the application. The database itself is not encrypted; use OS disk encryption where needed.

## Untrusted content

Feed HTML and extracted webpages are stored as data. Rendering sanitizes them with DOMPurify, removing scripts, frames, forms, styles, event handlers and dangerous URLs. Original HTML is parsed in an inert template. Images are removed unless their exact resolved URL has a locally cached raster data URI. SVGs are not accepted as cached images. Markdown notes use the same sanitizer. CSP forbids remote images, remote connections, frames and objects. Links are intercepted and opened through the OS browser after scheme validation.

Readability fetches the publicly served page only. Non-success HTTP responses are errors; no alternate paywall endpoint, authentication, cookie jar, or content fabrication is attempted. Extraction failure leaves feed content intact. Downloaded resources stay available offline.

## UI and background behavior

The desktop layout has a quiet sage sidebar, a compact editorial timeline, and a serif reader. It adapts to a single pane with back navigation at narrow widths. Dialogs use native HTML dialog focus management and Escape handling. Theme follows the system unless overridden, and reduced-motion preference disables animation.

Refresh runs only while the app is open. Connectivity restoration triggers another refresh. `navigator.onLine` is a hint; actual per-feed failures remain visible in feed details. Stop is cooperative: active HTTP requests finish or time out; no half-written article transaction is exposed. Automatic full-text extraction covers uncached unread articles after feeds finish and can be stopped through the same control.
