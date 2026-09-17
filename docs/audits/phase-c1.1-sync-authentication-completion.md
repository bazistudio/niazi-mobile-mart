# Phase C1.1 — Sync Authentication & Organization/Branch Authorization

## Status
**COMPLETE**

## Objective
Secure `POST /api/v1/sync/push` using the application's existing JWT authentication and authorization architecture (`AuthenticatedUser` & `RequestIdentity`).

## Implemented
- Added `AuthenticatedUser` extractor to `sync_push_handler` in `src-tauri/src/bin/server.rs`.
- JWT token claims are authoritative for user identity (`user_id`), organization (`organization_id`), and assigned role. Client-supplied user identity in JSON payload is not trusted.
- `organization_id` is validated against `auth.0.organization_id`. Discrepant cross-organization payloads are rejected with `403 Forbidden`.
- Branch authorization utilizes existing `auth.0.validate_context(Some(&event.organization_id), Some(&event.branch_id))`. Unauthorized cross-branch payloads are rejected with `403 Forbidden`.
- Existing `sync_audit` log deduplication and insertion behavior remains unchanged.
- Central domain projection was intentionally **NOT** implemented in this security boundary phase.

## Files Changed
- `src-tauri/src/bin/server.rs`
- `src-tauri/src/domain/sync_queue.rs`
- `docs/audits/phase-c1.1-sync-authentication-completion.md`

## Verification Commands
```powershell
cargo check --bin niazi-server
cargo test domain::identity::tests
cargo test domain::sync_queue::tests
```

## Security Tests Results
| Security Test | Result |
| :--- | :--- |
| **No JWT** | **PASS** (`401 Unauthorized`) |
| **Invalid JWT** | **PASS** (`401 Unauthorized`) |
| **Valid JWT** | **PASS** (`200 OK`) |
| **Cross-Organization Event** | **PASS** (`403 Forbidden`) |
| **Unauthorized Branch Event** | **PASS** (`403 Forbidden`) |
| **Authorized Branch Event** | **PASS** (`200 OK`) |
| **Client Identity Override Prevention** | **PASS** (JWT is authoritative) |

## System Architectural Status
```text
SYNC PUSH SECURITY
        ✅ AUTHENTICATED
        ✅ ORGANIZATION AUTHORIZED
        ✅ BRANCH AUTHORIZED

DOMAIN PROJECTION
        ❌ NOT IMPLEMENTED YET
```

## Explicit Non-Goals
C1.1 did **NOT** implement:
- central domain projection (`sales`, `purchases`, `expenses`, `stock`)
- `central_change_log`
- downstream delta pull
- SQLite downstream apply
- bootstrap
- SSE / WebSocket notifications
- master-data synchronization
- terminal registration
- invoice redesign
- `InventoryService` changes
- database migrations
- production deployment

## Remaining Work
- **Phase C1.2**: PostgreSQL transaction & idempotency domain projection foundation.
