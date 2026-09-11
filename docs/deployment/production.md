# Niazi Mobile Mart — Production Deployment Guide

## Overview

This document describes the production deployment configuration, environment setup, database connectivity, container runtime, health checking, security guidelines, and zero-downtime rollback procedures for the **Niazi Mobile Mart** backend HTTP server (`niazi-server`).

---

## 1. Prerequisites

- **Container Engine**: Docker 20.10+ or Podman
- **Target Platform**: Google Cloud Run (or any OCI-compliant container runtime / Kubernetes cluster)
- **Database**: Managed PostgreSQL 14+ instance (e.g., Google Cloud SQL for PostgreSQL) with SSL enabled
- **Secret Management**: Google Secret Manager or equivalent cloud environment secret injection

---

## 2. Production Environment Variables & Secrets

The application requires the following environment variables at runtime:

| Variable | Type | Description | Production Example |
| :--- | :--- | :--- | :--- |
| `PORT` | Variable | Port for Axum HTTP server to bind | `8080` (Cloud Run default) |
| `DATABASE_URL` | **Secret** | Connection string to PostgreSQL instance | `postgresql://user:pass@10.0.0.3:5432/niazi_mobile_mart?sslmode=require` |
| `TOKEN_SECRET` | **Secret** | Cryptographic secret for signing Bearer JWTs | `<256-bit-random-secret>` |
| `RUST_LOG` | Variable | Application log filtering level | `info` |

> [!IMPORTANT]
> **Secrets Management Safety**: Never commit real database credentials or `TOKEN_SECRET` values to Git repositories or store them in plain text inside Docker container images. Inject secrets via environment variables from Secret Manager.

---

## 3. Container Build Instructions

The production container uses a multi-stage Docker build producing a minimal, secure, non-root Debian slim runtime image containing only the compiled `niazi-server` binary.

### Build Production Container Image

```bash
docker build -t gcr.io/niazi-mobile-mart/niazi-server:v1.0.0 -f Dockerfile .
```

---

## 4. Local Production Smoke Test

Before pushing to Google Container Registry or deploying to Cloud Run, execute a local production container verification using test environment variables:

```bash
docker run -d \
  --name niazi-server-test \
  -p 8080:8080 \
  -e PORT=8080 \
  -e DATABASE_URL="postgresql://niazi_app:testpass@host.docker.internal:5432/niazi_db?sslmode=disable" \
  -e TOKEN_SECRET="local-test-secret-key-must-be-long-enough" \
  -e RUST_LOG=info \
  gcr.io/niazi-mobile-mart/niazi-server:v1.0.0
```

### Verify Container Health & Endpoints

```bash
# 1. Verify Health Endpoint
curl -i http://localhost:8080/api/health

# Expected Output: HTTP/1.1 200 OK -> {"status":"ok","database":"connected","timestamp":...}

# 2. Verify Authentication Endpoint
curl -i -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Password123!"}'

# 3. Clean Up Local Test Container
docker stop niazi-server-test && docker rm niazi-server-test
```

---

## 5. Google Cloud Run Deployment Procedure

### Step 5.1: Store Secrets in Cloud Secret Manager

```bash
# Create database URL secret
gcloud secrets create niazi-db-url --data-file=- <<< "postgresql://niazi_prod_user:SECRET_PASSWORD@10.x.x.x:5432/niazi_mobile_mart?sslmode=require"

# Create token secret
gcloud secrets create niazi-token-secret --data-file=- <<< "GENERATED_SUPER_SECURE_256_BIT_KEY"
```

### Step 5.2: Deploy to Cloud Run

```bash
gcloud run deploy niazi-server \
  --image gcr.io/niazi-mobile-mart/niazi-server:v1.0.0 \
  --platform managed \
  --region us-central1 \
  --port 8080 \
  --allow-unauthenticated \
  --set-env-vars RUST_LOG=info \
  --set-secrets DATABASE_URL=niazi-db-url:latest,TOKEN_SECRET=niazi-token-secret:latest \
  --health-check-path=/api/health
```

---

## 6. Health & Readiness Verification

- **Health Endpoint**: `GET /api/health`
- **Behavior**: Verifies Axum web server responsiveness and active PostgreSQL pool connectivity (`SELECT 1`).
- **Response Format**:
  ```json
  {
    "status": "ok",
    "database": "connected",
    "timestamp": "2026-09-10T21:58:00Z"
  }
  ```
- **Error Behavior**: If database connectivity drops or fails initialization, returns HTTP `503 Service Unavailable`.

---

## 7. PostgreSQL Database Architecture & Freeze Policy

> [!CAUTION]
> **DATABASE SCHEMA IS FROZEN**:
> The PostgreSQL database schema was finalized and approved in Phase 2 (`b62649b70e2d03e9cafc0dcf19002811d75b9dfd`).
> No schema migrations, DDL statements, table modifications, column changes, seed modifications, or automatic schema initializations are performed during application startup in Phase 7.

---

## 8. Graceful Shutdown & Container Lifecycle

The `niazi-server` binary integrates Tokio signal handlers (`SIGINT` and `SIGTERM`).
Upon receiving a termination signal (such as Cloud Run instance scale-down or container stop):

1. Axum stops accepting new incoming HTTP connections.
2. In-flight HTTP requests complete cleanly within the grace period (30s default).
3. PostgreSQL connection pool resources (`sqlx::PgPool`) are cleanly closed.
4. Process exits with code `0`.

---

## 9. Failure Modes & Safety

| Failure Scenario | Expected Behavior | Operator Action |
| :--- | :--- | :--- |
| **Invalid/Missing `DATABASE_URL`** | Server fails immediately at startup with explicit log error. Does NOT fall back to SQLite in production mode. | Verify environment secret injection in Cloud Run / Secret Manager. |
| **Invalid Database Credentials** | Connection pool initialization fails with auth error. No credentials leaked in logs. | Rotate database credentials and update Cloud Secret Manager. |
| **Database Network Outage** | `/api/health` returns `503 Service Unavailable`. Cloud Run routes traffic away from unhealthy instance. | Check Cloud SQL instance health and VPC Connector status. |
| **Missing `TOKEN_SECRET`** | Token verification falls back to default fallback or fails safely on auth endpoints. | Ensure `TOKEN_SECRET` environment variable is explicitly provided. |

---

## 10. Zero-Downtime Rollback Procedure

Because the database schema is permanently frozen and backward-compatible:

1. **Rollback Container Image Revision**:
   If revision `v1.0.0` exhibits runtime issues, instantly route traffic back to the prior known-good Cloud Run revision:
   ```bash
   gcloud run services update-traffic niazi-server --to-revisions niazi-server-PREVIOUS_REVISION=100
   ```
2. **No Database Rollback Required**:
   Zero database schema changes were introduced in Phase 7, ensuring total database compatibility with prior revisions.

---

## 11. Security Audit Summary

- **Non-Root Container**: Container executes as unprivileged `appuser` (UID 10001).
- **No Hardcoded Credentials**: Verified zero secrets committed in source code or Dockerfile layer history.
- **Controlled Exposure**: Internal system errors sanitized before returning to HTTP clients.
- **RBAC & Authentication Enforced**: All Phase 3 authentication and Phase 4 permission checks remain active.
