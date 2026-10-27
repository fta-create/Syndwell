# Syndwell

**A quieter way to stay curious.** A free, private, local-first RSS reader built with Tauri 2, React, TypeScript and SQLite. GPL-3.0-or-later. No accounts, subscription tiers, telemetry, aggregation service, or hosted database.

Syndwell starts with an empty library. Add a feed or website URL, or import your own OPML subscriptions. Test fixtures are only used by tests.

## Develop

Install Node.js 22.12 or newer (24 recommended), npm, and Rust using [rustup](https://rustup.rs). `rust-toolchain.toml` pins the tested compiler. The Rust toolchain may download on the first Cargo command.

Install [Tauri's platform prerequisites](https://v2.tauri.app/start/prerequisites/):

- **Windows:** Visual Studio C++ Build Tools and Microsoft Edge WebView2.
- **macOS:** Xcode Command Line Tools (`xcode-select --install`).
- **Debian/Ubuntu Linux:** `sudo apt install build-essential pkg-config libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev patchelf`. A graphical session is required to run the desktop app.

```sh
npm ci
npm run tauri dev
```

`npm run dev` starts the interface in a regular browser at Vite's configured port. **Browser mode is a clearly labeled interface preview.** The persistent database and feed downloads require the desktop application. There is no browser server or hosted backend.

## Use

1. Click **Add a feed** and enter an HTTP(S) RSS, Atom, JSON Feed, or website address. Website discovery chooses the first advertised supported feed. Paste a specific feed URL if you want another one.
2. Create folders with the library's `+` button. Use a feed's `…` menu to rename, move, inspect errors, or unsubscribe. Folder menus support renaming, reordering and deletion. Unsubscribing preserves archived articles and research.
3. Select an article to read it. Star important articles, use **Read later**, and attach Markdown notes. Explicitly save notes before navigating away.
4. Use **Full article** for on-demand Readability extraction. A successful extraction is cached. On failure, feed content remains visible; authentication and paywalls are never bypassed.
5. Images are blocked by default. **Download images** fetches raster images explicitly and caches them locally. This contacts each image's origin; remote scripts and image URLs never reach the renderer.
6. Download publication favicons explicitly from feed details if desired; they are stored locally too.
7. Search titles, feed content, full text, authors, feed names and notes. Combine source/folder selection with date, status, include/exclude word filters. Relevance uses FTS5 BM25.
8. Settings includes typography, themes, refresh intervals, automatic full-text download, OPML import/export, Markdown note export, a complete JSON library backup/restore, and cache clearing. Export uses a native save dialog. Restore is transactional and replaces the current library; create a backup first.

Keyboard: **J/K** next/previous, **S** star, **B** save, **M** read/unread, **/** search, **Cmd/Ctrl+N** add feed, **Esc** close dialog. Shortcuts ignore text-entry fields.

All metadata, feed content, reading states, notes, extracted content, and explicitly downloaded images persist in SQLite in the OS application-data directory for `org.syndwell.reader`. Offline reading requires content to have been downloaded previously. Live processes restart each launch; no account or external sync is involved.

## Validate

```sh
npm run build                 # strict TypeScript + production web assets
npm test                      # HTML/Markdown sanitization and cached-image policy
cargo test --manifest-path src-tauri/Cargo.toml --no-default-features
cargo check --manifest-path src-tauri/Cargo.toml --features desktop --bin syndwell
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --no-default-features -- -D warnings
```

Native tests use local RSS, Atom, JSON Feed and OPML fixtures. They exercise migrations, canonical URL deduplication, article updates, FTS, notes, offline caches, state preservation, transactional backup/restore, nested folders, 2,000-feed imports and a 30,000-article archive.

UI integration tests replace **only the Tauri IPC transport** with calls to the actual Rust CLI and a temporary SQLite database. They are not native WebView tests and do not validate live Internet fetching:

```sh
cargo build --manifest-path src-tauri/Cargo.toml --bin syndwell-cli
npx playwright install chromium
CHROMIUM_PATH=/path/to/chromium npm run test:e2e
```

The test config defaults to `/usr/bin/chromium`; set `CHROMIUM_PATH` to a browser executable on your OS. Native commands and the UI share the same Rust dispatch and database implementation. The CLI is a developer utility, not a background server.

See [validation evidence and limitations](docs/VALIDATION.md) and [architecture](docs/ARCHITECTURE.md).

## Build desktop installers

On the target OS with its prerequisites installed:

```sh
npm ci
npm run tauri build
```

Tauri builds the frontend, enables the `desktop` Rust feature, embeds assets, and writes artifacts under `src-tauri/target/release/bundle/`. Build Windows installers on Windows, macOS applications/DMGs on macOS, and Linux packages on Linux. For Debian only: `npm run tauri build -- --bundles deb`. For a development package: add `--debug`.

Code signing and Apple notarization require the distributor's own certificates. No signing keys or paid services are needed for local development. Unsigned installers may display OS security prompts; no installer has been published by this repository.

## Scope and privacy

Network traffic is limited to sources requested by the user, discovered feed URLs, article URLs for requested extraction, and explicitly requested image downloads. Four feed workers use ETag/Last-Modified, exponential backoff, bounded response sizes, and cancellation between requests. HTTP requests have a 25-second timeout. Public HTTP(S) targets only; private addresses, local files, reserved addresses, credentials in URLs and unsafe redirect destinations are blocked. DNS answers are checked and pinned to avoid rebinding. Direct networking is required; automatic proxy environment variables are intentionally not used because remote proxy DNS would undermine address pinning.

There are no application-imposed subscription or article quotas. Lists load in pages of 100. Safety bounds apply to individual response bodies (12 MiB), OPML files (16 MiB) and folder nesting (64 levels). Data remains on disk until you remove it; cache clearing removes extracted text and cached images, not your notes or reading history.

Current deliberate boundaries: no multi-device sync, enclosure/podcast playback, scheduled updates when the app is closed, saved smart views, search-match highlighting, or drag-and-drop. Fonts use system UI and locally available serif fonts. Folders and list columns use the platform's resize handle on wide windows. Notes export as one Markdown document; library backups use portable JSON, not a raw SQLite-file copy.

## License

[GNU General Public License v3.0 or later](LICENSE). Existing license text is preserved. Contributions are welcome; keep privacy, offline usability, accessibility, and free access central to every change.
