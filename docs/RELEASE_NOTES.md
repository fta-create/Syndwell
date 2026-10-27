A private, local-first RSS reader. No account, subscription, or hosted database.

## Downloads

- **Windows x64:** download the `.exe` installer and run it. Windows may show an unknown-publisher warning because this build is unsigned.
- **macOS:** choose `macos-arm64.dmg` for Apple Silicon (M1 or newer) or `macos-x64.dmg` for Intel. Open the disk image and drag Syndwell into Applications. These builds are unsigned and not notarized; macOS may block opening them. Use Apple's supported “Open Anyway” flow in Privacy & Security only after verifying the source. Do not disable Gatekeeper globally.
- **Linux x64 (Debian/Ubuntu):** download the `.deb` and install with `sudo apt install ./Syndwell-0.1.0-linux-x64.deb`. Package dependencies are installed by apt.

Each installer has an accompanying `.sha256` checksum. Checksums detect download corruption; they are not a replacement for OS code signing.

This is an early release. Native graphical acceptance, native export dialogs, clean-host installation, and real-feed checks must be completed on the target platforms before marking the release stable. The cloud validation record is in `docs/VALIDATION.md`. The browser interface alone is a preview; install the desktop app for persistence and native feed fetching.
