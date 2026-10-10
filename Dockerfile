# Multi-stage Dockerfile for Niazi Mobile Mart Standalone TypeScript Central Backend
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
# STAGE 2: TypeScript Backend Builder
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
# STAGE 3: Minimal Production Runtime Container (Node.js 20 Slim)
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-slim AS runtime

# Install curl for container health checks
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Create unprivileged non-root app user (UID 10001)
RUN useradd -m -u 10001 -s /bin/bash appuser

WORKDIR /app

# Copy compiled TypeScript backend (dist + node_modules) from ts-builder stage
COPY --from=ts-builder /app/backend/dist ./backend/dist
COPY --from=ts-builder /app/backend/node_modules ./backend/node_modules

# Copy PostgreSQL migration SQL files required by migration runner
COPY src-tauri/migrations/postgres ./src-tauri/migrations/postgres

# Copy compiled frontend production static assets from frontend-builder stage
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

# Launcher script
COPY scripts/docker-entrypoint.sh /app/docker-entrypoint.sh
RUN sed -i 's/\r$//' /app/docker-entrypoint.sh && chmod +x /app/docker-entrypoint.sh

# Set file permissions for appuser
RUN chown -R appuser:appuser /app

USER appuser

# Expose default Cloud Run runtime port
ENV PORT=8080
ENV NODE_ENV=production
ENV STATIC_DIR=frontend/dist
EXPOSE 8080

# Health check instructions for container runtime engines
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:${PORT}/api/health || exit 1

ENTRYPOINT ["/app/docker-entrypoint.sh"]
