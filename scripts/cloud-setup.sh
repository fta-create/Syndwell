#!/usr/bin/env bash
set -euo pipefail
cd /workspace/Syndwell
source scripts/cloud-env.sh
if ! command -v cargo >/dev/null; then
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs -o /tmp/syndwell-rustup.sh
  sh /tmp/syndwell-rustup.sh -y --no-modify-path --profile minimal --default-toolchain 1.99.1
fi
npm ci --no-audit --no-fund
cargo test --manifest-path src-tauri/Cargo.toml --locked --no-default-features
cargo build --manifest-path src-tauri/Cargo.toml --locked --bin syndwell-cli
npm run build
npm test
# Desktop checking is optional on machines without development headers.
if pkg-config --exists webkit2gtk-4.1 gtk+-3.0; then
  cargo check --manifest-path src-tauri/Cargo.toml --locked --features desktop --bin syndwell
fi
