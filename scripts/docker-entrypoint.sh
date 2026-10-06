#!/bin/bash
# Container launcher: Rust server (internal sidecar) + Node TypeScript server (public).
#   Rust  -> port 8081 (never exposed by Cloud Run; only $PORT is routed)
#   Node  -> $PORT     (Product + Sales in TypeScript, everything else proxied to Rust)
# If either process exits, the container exits so Cloud Run restarts it.
set -u

PUBLIC_PORT="${PORT:-8080}"
RUST_INTERNAL_PORT=8081

export RUST_UPSTREAM_URL="${RUST_UPSTREAM_URL:-http://127.0.0.1:${RUST_INTERNAL_PORT}}"

PORT="${RUST_INTERNAL_PORT}" /app/niazi-server &
RUST_PID=$!

PORT="${PUBLIC_PORT}" node /app/backend/dist/server.js &
NODE_PID=$!

shutdown() {
  kill -TERM "$RUST_PID" "$NODE_PID" 2>/dev/null
}
trap shutdown TERM INT

wait -n "$RUST_PID" "$NODE_PID"
EXIT_CODE=$?
shutdown
wait
exit "$EXIT_CODE"
