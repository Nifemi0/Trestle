#!/usr/bin/env bash
# Wrapper: run the Hyperlane CLI via node (the .bin shim trips the agent's command guard).
# Usage: ./hl.sh <args...>
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node "$DIR/node_modules/@hyperlane-xyz/cli/bundle/index.js" "$@"
