# Phase 3 — Request Identity & Authentication Audit Report

**Date**: 2026-09-10  
**Project**: Niazi Mobile Mart  
**Status**: AUDIT COMPLETE — PENDING IMPLEMENTATION APPROVAL  

---

## A. Current Authentication Architecture

Currently, the application supports two operational deployment modes:

```text
DESKTOP MODE (Tauri Desktop App)
Frontend (React + Vite) ──(Tauri IPC)──> Commands (src/commands/*.rs) ──> Shared AppState ──> Services & SQLite

HTTP SERVER MODE (Cloud Run / Axum Server)
Browser Client ──(HTTP)──> Axum Server (src/bin/server.rs) ──> AppState (PgPool/SQLite) ──> Services
```

### Layer-by-Layer Findings

1. **Frontend**:
   - Uses `tauriClient.ts` to bridge IPC calls in Tauri mode, with API fallbacks for HTTP browser mode.
   - Session context is retained in React memory state and `localStorage`.

2. **Backend API / Axum HTTP Server**:
   - `server.rs` currently only registers a single unauthenticated route: `GET /api/health`.
   - **No authentication middleware or extractor exists** in Axum to extract, validate, or attach user identity from HTTP request headers (such as `Authorization: Bearer <token>`).

3. **Backend Commands & Services**:
   - Tauri commands (e.g. `auth_login`, `auth_get_current_session`, `auth_logout`) manage authentication by updating `AppState.session` (`Arc<RwLock<SessionContext>>`).
   - `SessionContext` holds: `is_authenticated`, `is_locked`, `user_id`, `username`, `role`, `login_time_ms`, and `access_profile`.
   - In desktop single-user mode, `AppState.session` represents the local desktop session. In multi-user concurrent HTTP mode, a single shared `AppState.session` is unsuitable and must be replaced/supplemented with per-request identity resolution (Axum request extractor/middleware).

---

## B. Current Identity Model

- **User Identifier**: UUID v4 string (`users.id`).
- **Role Identifier**: `UserRole` enum (`ADMIN`, `SHOP_ADMIN`, `MANAGER`, `ACCOUNTANT`, `SALESMAN`, `CASHIER`, `REPAIR_MECHANIC`, `STAFF`, `PUBLIC_USER`).
- **Organization Identifier**: Fixed canonical UUID `00000000-0000-0000-0000-000000000001` (`Niazi Mobile Mart`).
- **Branch Identifier**: Default main branch UUID `00000000-0000-0000-0000-000000000002` (`Main Branch`) or assigned branch on `users.branch_id`.
- **Permissions**: Represented by `StaffAccessProfile` (`allowed_pages`, `allowed_actions`, `limits`).

---

## C. Current Authentication Mechanism

- **Password / PIN Verification**: Argon2id hashing (`services/hasher.rs`).
- **Token Handling**: Login generates a token/session representation. For HTTP requests, a lightweight JWT or signed bearer token mechanism resolves the authenticated user on every incoming HTTP request.

---

## D. Current Request Identity Problems & Security Risks

1. **Missing Axum Authentication Middleware (CRITICAL)**:
   - Axum routes lack an extractor/middleware to validate HTTP Bearer tokens and inject an authenticated `RequestIdentity` into handlers.
2. **Shared State Lock Risk in Concurrent Mode (HIGH)**:
   - Relying on `AppState.session` (`Arc<RwLock<SessionContext>>`) across concurrent HTTP requests would cause session pollution across different client connections. Per-request authentication via token context (`RequestIdentity`) is required for HTTP mode while preserving Tauri `AppState.session` for single-user desktop mode.
3. **No Distinction Between 401 Unauthorized and 403 Forbidden (MEDIUM)**:
   - Error handling needs clear separation between unauthenticated (401) and unauthorized (403) responses.

---

## E. Security Risk Classification

| Risk | Level | Description |
|------|-------|-------------|
| Missing HTTP Auth Middleware | **CRITICAL** | HTTP endpoints would be unprotected without request identity extraction. |
| Session Shared State Contention | **HIGH** | `AppState.session` cannot be shared across multiple concurrent HTTP users. |
| Insecure Client Identity Overrides | **MEDIUM** | Handlers must derive `user_id` / `branch_id` from trusted `RequestIdentity`, not request bodies. |

---

## F. Recommended Phase 3 Implementation Plan

1. **Define Trusted `RequestIdentity` Struct**:
   - `userId`, `username`, `role`, `organizationId`, `branchId`, `accessProfile`.
2. **Implement Token / Session Identity Resolver**:
   - Add JWT / Auth token generator & validator (`services/jwt_service.rs` or token helper) without altering database schema.
3. **Implement Axum Request Extractor / Auth Middleware**:
   - `AuthenticatedUser` extractor for Axum handlers.
   - Return `401 Unauthorized` for missing/invalid credentials.
   - Return `403 Forbidden` for permission failures in authorization checks.
4. **Wire HTTP Authentication Endpoints**:
   - `POST /api/auth/login`
   - `POST /api/auth/logout`
   - `GET /api/auth/me`
5. **Add Comprehensive Unit & Integration Tests**:
   - Test 401 unauthenticated access, 403 forbidden access, token expiration, identity extraction, and verify zero schema changes.

---

## G. Database Safety Confirmation

- **Schema Changes**: ZERO.
- **Migration Changes**: ZERO.
- **Seed Data Changes**: ZERO.
- **Database Architecture**: FROZEN.
