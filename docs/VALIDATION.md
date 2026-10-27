# Validation record

This record distinguishes code checks, local test transports, native packaging and actual desktop execution. The app is version 0.1.0; this is an implementation with explicit release-acceptance gaps, not a claim that all platforms have been validated.

## Completed in the cloud workspace

- Clean `npm ci` and the reusable `scripts/cloud-setup.sh` completed successfully.
- Strict TypeScript and Vite's production frontend build passed.
- Six Vitest tests passed: HTML and Markdown sanitization, dangerous URL removal, readable previews, cached raster image handling and SVG rejection.
- Eighteen Rust tests passed: four network/security tests and fourteen integration tests. Fixtures cover RSS, Atom, JSON Feed and nested OPML. Local HTTP tests exercise conditional request headers, 304 handling, rejection of internal-network redirects, and fetched RSS persistence followed by offline reopening. The loopback test resolver is private and injected only by tests; production always validates public DNS answers.
- Integration coverage includes migrations from schema v1, repeated migrations, canonical URL deduplication, updated article content with retained notes/states, notes/author/feed/full-text search, FTS relevance, chronological sorting, combined predicates, recursive folder selection, filtered bulk-read, image cache backup/restore, unsubscribe preservation and rollback of malformed backups.
- A 2,000-subscription OPML import and duplicate re-import passed. A 30,000-article archive search plus deep pagination completed in approximately 220 ms in the test run; this is an observation, not a cross-device performance guarantee.
- Four Playwright integration tests passed using Chromium and the actual Rust engine/SQLite over a test-only replacement for Tauri IPC. They exercise notes, save/read states, reload persistence, source/folder organization, theme persistence, narrow-window navigation and offline content. The fourth verifies that a normal browser displays an honest empty interface preview.
- `cargo clippy --all-targets --no-default-features -- -D warnings` passed.
- Desktop-feature `cargo check` passed with local GTK/WebKit development libraries.
- Both `npm run tauri build -- --debug --bundles deb` and the optimized `npm run tauri build -- --bundles deb` completed successfully. The release Linux amd64 installer is approximately 13.5 MiB under `src-tauri/target/release/bundle/deb/`. Package metadata declares WebKitGTK 4.1 and GTK 3 dependencies. Packaging success does not establish a successful clean-host installation.

## External and runtime limitations

The cloud machine provides package-manager traffic through its proxy, but direct public hostname resolution failed for representative external feed hosts. The application deliberately requires direct, validated DNS and pinned public addresses rather than sending feed requests through a proxy that resolves destinations remotely. **A live external feed subscription and live webpage extraction were not verified here.** Local HTTP fixtures and the same production parser/database code were exercised instead. No security or TLS verification was disabled to obtain a passing result.

The Linux desktop binary was launched under a local Xvfb display and created its window, but WebKit then aborted because `/usr/lib/x86_64-linux-gnu/webkit2gtk-4.1/WebKitNetworkProcess` is absent. Development libraries were extracted under `/workspace` because the system tree is read-only. The runtime's helper-process path is compiled into WebKit; its release build did not honor a local executable-path override. User-namespace setup is also blocked. **Native graphical behavior and native file dialogs have therefore not been validated end to end.** WebKit sandboxing was not disabled to bypass this constraint.

Windows/macOS builds, OS signing/notarization, installation on a clean host, published releases, and restored cloud-task snapshots have not been executed. The CI workflow is provided but has not been run remotely.

## Before a public release

On an ordinary desktop with the documented OS prerequisites: install the release package, add a real public RSS/Atom/JSON feed and a website homepage, verify discovered subscriptions and repeated conditional refresh, exercise full-text fallback and successful extraction, explicitly cache images/icons, export through native save dialogs, close and reopen offline, and restore a backup into a disposable profile. Run the platform CI matrix and check keyboard/screen-reader navigation in the native WebView.

Saved cloud setup/start instructions are a draft for review. Saving a draft does not publish the environment or prove a fresh task restores successfully. Review/save environment settings and publish through the product when the prepared development environment is suitable for your workflow.
