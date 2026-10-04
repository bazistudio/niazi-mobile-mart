# Multi-stage Dockerfile for Niazi Mobile Mart Cloud Run HTTP Server
# ─────────────────────────────────────────────────────────────────────────────
# STAGE 1: Frontend SPA Builder
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-slim AS frontend-builder

WORKDIR /app/frontend

# Copy package manifests first to enable layer caching
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

# Copy frontend source files and build production bundle
COPY frontend/ ./
RUN npm run build

# ─────────────────────────────────────────────────────────────────────────────
# STAGE 2: TypeScript Product Backend Builder
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-slim AS ts-builder

WORKDIR /app/backend

# Copy package manifests first to enable layer caching
COPY backend/package.json backend/package-lock.json ./
RUN npm ci

# Copy TypeScript source and config
COPY backend/src ./src
COPY backend/tsconfig.json ./

# Compile TypeScript to JavaScript
RUN npm run build

# ─────────────────────────────────────────────────────────────────────────────
# STAGE 3: Cargo Rust Backend Builder
# ─────────────────────────────────────────────────────────────────────────────
FROM rust:1.88-slim AS builder

WORKDIR /usr/src/niazi-mobile-mart

# Install build dependencies including glib and webkit2gtk dependencies required for linux build
RUN apt-get update && apt-get install -y --no-install-recommends \
    pkg-config \
    libssl-dev \
    libglib2.0-dev \
    libgtk-3-dev \
    libwebkit2gtk-4.1-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy manifest files first to enable layer caching
COPY src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json src-tauri/build.rs ./src-tauri/
COPY src-tauri/capabilities ./src-tauri/capabilities
COPY src-tauri/icons ./src-tauri/icons
COPY src-tauri/migrations ./src-tauri/migrations

WORKDIR /usr/src/niazi-mobile-mart/src-tauri

# Create dummy source files for dependency caching layer
RUN mkdir -p src/bin && \
    echo "" > src/lib.rs && \
    echo "fn main() {}" > src/main.rs && \
    echo "fn main() {}" > src/bin/server.rs && \
    cargo build --release --bin niazi-server

# Copy actual source files
COPY src-tauri/src ./src

# Build production release binary for niazi-server
RUN find src -type f -exec touch {} + && cargo build --release --bin niazi-server

# ─────────────────────────────────────────────────────────────────────────────
# STAGE 4: Minimal Production Runtime Container
# ─────────────────────────────────────────────────────────────────────────────
FROM debian:bookworm-slim AS runtime

# Install Node.js 20, CA certificates, OpenSSL runtime, and GTK/GLib/WebKit
# shared libraries required by niazi-server binary
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    libssl3 \
    curl \
    libgtk-3-0 \
    libglib2.0-0 \
    libwebkit2gtk-4.1-0 \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Create unprivileged non-root app user (UID 10001)
RUN useradd -m -u 10001 -s /bin/bash appuser

WORKDIR /app

# Copy compiled Rust binary from Rust builder stage
COPY --from=builder /usr/src/niazi-mobile-mart/src-tauri/target/release/niazi-server /app/niazi-server

# Copy compiled TypeScript backend (dist + node_modules) from ts-builder stage
COPY --from=ts-builder /app/backend/dist ./backend/dist
COPY --from=ts-builder /app/backend/node_modules ./backend/node_modules

# Copy compiled frontend production static assets from frontend-builder stage
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

# Launcher: Rust sidecar on 127.0.0.1-internal port 8081 + Node on $PORT
COPY scripts/docker-entrypoint.sh /app/docker-entrypoint.sh
RUN sed -i 's/\r$//' /app/docker-entrypoint.sh && chmod +x /app/docker-entrypoint.sh

# Set file permissions for appuser
RUN chown -R appuser:appuser /app

USER appuser

# Expose default Cloud Run runtime port and static directory env
ENV PORT=8080
ENV RUST_LOG=info
ENV STATIC_DIR=frontend/dist
EXPOSE 8080

# Health check instructions for container runtime engines
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:${PORT}/api/health || exit 1

# Launcher runs Rust (internal :8081) and the TypeScript Express server ($PORT).
# Express handles Product + Sales, proxies all other routes to the in-container Rust server.
ENTRYPOINT ["/app/docker-entrypoint.sh"]
