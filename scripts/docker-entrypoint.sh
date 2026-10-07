#!/bin/bash
# Container entrypoint launcher for Standalone TypeScript Backend.
#   Executes Node.js server directly on $PORT (Cloud Run default: 8080).
#   Handles SIGTERM cleanly for Cloud Run instance lifecycle management.
set -eu

PUBLIC_PORT="${PORT:-8080}"
export PORT="${PUBLIC_PORT}"

echo "[entrypoint] Starting Niazi Mobile Mart Standalone TypeScript Backend on port ${PORT}..."
exec node /app/backend/dist/server.js
