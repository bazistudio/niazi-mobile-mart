# Multi-stage Dockerfile for Niazi Mobile Mart Cloud Run HTTP Server (niazi-server)
# ─────────────────────────────────────────────────────────────────────────────
# STAGE 1: Cargo Build Environment
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
COPY src-tauri/src ./src-tauri/src

WORKDIR /usr/src/niazi-mobile-mart/src-tauri

# Build production binary for niazi-server
RUN cargo build --release --bin niazi-server

# ─────────────────────────────────────────────────────────────────────────────
# STAGE 2: Minimal Production Runtime Container
# ─────────────────────────────────────────────────────────────────────────────
FROM debian:bookworm-slim AS runtime

# Install CA certificates & OpenSSL runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    libssl3 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create unprivileged non-root app user (UID 10001)
RUN useradd -m -u 10001 -s /bin/bash appuser

WORKDIR /app

# Copy compiled binary from builder stage
COPY --from=builder /usr/src/niazi-mobile-mart/src-tauri/target/release/niazi-server /app/niazi-server

# Set file permissions for appuser
RUN chown -R appuser:appuser /app

USER appuser

# Expose default Cloud Run runtime port
ENV PORT=8080
ENV RUST_LOG=info
EXPOSE 8080

# Health check instructions for container runtime engines
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:${PORT}/api/health || exit 1

ENTRYPOINT ["/app/niazi-server"]
