# Phase C1.2 -- PostgreSQL Transaction & Idempotency Foundation

## Status
**COMPLETE -- FOUNDATION READY FOR C1.3**

## Starting Checkpoint
`fa443df008663238702bbae473fc0d360803f5c2`

## Objective
Establish the central PostgreSQL transaction and idempotency foundation required for future domain projection (SALE_CREATED, PURCHASE_CREATED, EXPENSE_CREATED).

## Implemented Architecture
```text
AuthenticatedUser (JWT Bearer Token)
        |
Organization Authorization (event.organization_id == auth.organization_id)
        |
Branch Authorization (auth.validate_context())
        |
PostgreSQL Transaction BEGIN (pg_pool.begin())
        |
Idempotency Check (PostgresSyncAuditRepository::find_existing_event_id_tx)
        |
Sync Audit Record (PostgresSyncAuditRepository::record_audit_tx)
        |
PostgreSQL Transaction COMMIT (tx.commit())
```

- Standardized transaction handles on PostgreSQL transaction executor references.
- Created PostgresSyncAuditRepository in src-tauri/src/repositories/sync_queue_repository.rs.
- Refactored sync_push_handler in src-tauri/src/bin/server.rs to initialize a single atomic PostgreSQL transaction and roll back cleanly on any failure before committing.

## Files Changed
- src-tauri/src/repositories/sync_queue_repository.rs
- src-tauri/src/repositories/mod.rs
- src-tauri/src/bin/server.rs
- docs/audits/phase-c1.2-postgresql-transaction-idempotency-completion.md

## Idempotency Mechanism
- client_event_id serves as the sync idempotency key.
- Database uniqueness is enforced in PostgreSQL schema 002_add_terminals_and_sync_queue.sql via:
  client_event_id TEXT NOT NULL UNIQUE CHECK(length(client_event_id) = 36) and index idx_pg_sync_audit_client_event.
- Duplicate event IDs cannot create duplicate sync_audit rows (ON CONFLICT (client_event_id) DO NOTHING).
- Limitation Note: Live concurrent PostgreSQL integration testing was NOT executed during C1.2 verification. Concurrency safety was verified through database constraint analysis and code inspection.

## Rollback Behavior
- PostgreSQL transactions are explicitly committed only after successful processing (tx.commit().await).
- Failure during idempotency check or audit record insertion invokes tx.rollback().await.
- SQLx Transaction drop semantics provide fallback rollback if commit is not reached.
- Limitation Note: Live PostgreSQL rollback integration test was NOT executed. Rollback was verified by code-level and architectural inspection.

## Verification Evidence
| Verification | Classification | Result |
| :--- | :--- | :--- |
| cargo check --bin niazi-server | Actually executed | PASS |
| C1.1 auth preservation | Code-level verification | PASS |
| Rollback behavior | Code-level verification | PASS |
| Duplicate event behavior | Code-level verification | PASS |
| Concurrent duplicate protection | Database constraint analysis only | PASS |

## C1.1 Security Preservation
- AuthenticatedUser JWT extractor: UNCHANGED
- Organization context validation: UNCHANGED
- Branch context authorization: UNCHANGED
- Terminal identity handling: UNCHANGED

## Explicit Non-Goals
Phase C1.2 did NOT implement:
- SALE_CREATED domain table projection
- PURCHASE_CREATED domain table projection
- EXPENSE_CREATED domain table projection
- stock & stock_movements relative inventory projection
- Customer/Supplier ledger projections
- central_change_log / sequence tracking
- Downstream delta pull (/api/v1/sync/pull)
- SQLite downstream apply engine
- SSE / WebSocket notifications
- Terminal registration whitelist
- Invoice number redesign
- InventoryService code modifications

## Important Phase C1.3 Requirement
PostgresSaleRepository::complete_sale currently creates its own private PostgreSQL transaction (self.pool.begin().await). Before SALE_CREATED domain projection can be implemented in Phase C1.3, the sale repository must be adapted to accept an existing parent transaction handle. This is required so that sale header, lines, payments, stock decrements, customer ledger entries, and sync_audit logging participate in one atomic PostgreSQL transaction.

## System Architectural Status
```text
C1.1: Sync Security Boundary -- COMPLETE
C1.2: PostgreSQL Transaction / Idempotency Foundation -- COMPLETE
C1.3: SALE_CREATED Central Domain Projection -- NOT STARTED
```
