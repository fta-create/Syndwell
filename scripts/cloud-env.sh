#!/usr/bin/env bash
# Source this file; all tools stay in writable workspace paths.
export CARGO_HOME=/workspace/.syndwell-cargo
export RUSTUP_HOME=/workspace/.syndwell-rustup
export PATH="$CARGO_HOME/bin:$PATH"
export npm_config_cache=/workspace/.npm-cache
if [ -d /workspace/.syndwell-sysroot/usr/lib/x86_64-linux-gnu/pkgconfig ]; then
  export PKG_CONFIG_SYSROOT_DIR=/workspace/.syndwell-sysroot
  export PKG_CONFIG_PATH=/workspace/.syndwell-sysroot/usr/lib/x86_64-linux-gnu/pkgconfig:/workspace/.syndwell-sysroot/usr/share/pkgconfig
  export LD_LIBRARY_PATH="/workspace/.syndwell-sysroot/usr/lib/x86_64-linux-gnu${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
fi
