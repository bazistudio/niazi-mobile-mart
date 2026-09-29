# Phase 1.1 — Parties Database + Domain Foundation

**Branch:** `feature/phase-1-1-parties-foundation`
**Base:** `d0b3c41a106bbb3c7ca30a564b7ced1afe683a83` (Phase 0)
**Owner decisions applied:** HA-1.1.1 A · HA-1.1.2 · HA-1.1.3 · HA-1.1.4 · HA-1.1.5 · HA-1.1.6 (all "Recommended")

## 1. What changed

### Model

`parties` is the canonical identity and contact record. `customers` and `suppliers` stay as **role** tables. They keep their codes, credit limits, ledgers, and sales/purchase/return references, and each gains a nullable `party_id`.

| Rule | Detail |
|---|---|
| Legacy identity | Deterministic backfill: `party.id = role.id`, identical in SQLite and PostgreSQL. Rows are **never merged automatically**. |
| New party | `party.id` = first role id. A BOTH party's supplier role gets its own UUID. |
| Uniqueness | At most one customer role and one supplier role per party (partial unique indexes). The FK is `ON DELETE RESTRICT`. |
| Single-role party | Mirrors its role's contact fields when that role is created or edited through the existing customer/supplier screens. |
| Two-role party | Contact changes only through the Parties flow (`PARTY_UPSERTED`), which copies name, phones, email, address and active flag down to both roles. |
| Last-writer guard | `PARTY_UPSERTED` applies when `incoming.updated_at >= stored.updated_at`. Roles are overwritten only when the incoming party is strictly newer. Backfilled parties carry `updated_at = 1970-01-01T00:00:00+00:00`, so any real edit wins. |
| Blank legacy names | The party uses the role code. |
| UUID collision | A supplier whose UUID equals a customer UUID is left **unlinked** and reported by the preflight query instead of being merged. |

### Migrations (additive only)

**PostgreSQL `007_parties_foundation.sql`**
- Added to `PostgresAdapter::run_migrations()`.
- Idempotent. The runner re-executes it on every start, which also self-heals rows inserted unlinked, such as the legacy `POST /api/customers` path.

**SQLite 018–021**
- 018: `parties` table.
- 019: `customers.party_id`.
- 020: `suppliers.party_id`.
- 021: indexes and backfill.
- Each `ALTER TABLE` is its own migration, because the runner skips the rest of a batch after a tolerated "duplicate column name" error.

### Rust

- `domain/party.rs`: types and pure rules.
- `repositories/party_repository.rs` (SQLite) and `repositories/postgres_party_repo.rs` (PostgreSQL) implement the same contract.
- `services/party_service.rs`:
  - Desktop create/update run in **one transaction** with role rows and outbox events.
  - The server side is read-only.
- Typed commands: `storage_party_list`, `storage_party_get`, `storage_party_create`, `storage_party_update`.
- Existing customer/supplier create/update/deactivate now link the party in the same transaction. Role payloads gain an extra `party_id` key, which older readers ignore.
- Change applier:
  - Links roles on `CUSTOMER_*` / `SUPPLIER_*`.
  - New `PARTY_UPSERTED` arm.
  - Unknown events stay a forward-compatible no-op on old desktops.
- Server `sync_push`:
  - Links roles.
  - Forwards `party_id` in change_log payloads.
  - New `PARTY_UPSERTED` projection with change_log entity `PARTY`.
- Server API (read-only, JWT):
  - `GET /api/v1/parties`
  - `GET /api/v1/parties/:id`
  - Both require page `parties`, which `access_control` aliases with `customers` / `suppliers`.

### TypeScript

- `tauriClient` gains party types and methods.
- New files:
  - `features/parties/domain/party.domain.ts` (rules and view model)
  - `services/party.repository.ts` (bridge)
  - `services/party.service.ts` (permission checks `parties.view` / `parties.manage`, fail closed)
  - `partyService.instance.ts`
- `services/party.api.ts` was a stub that stored nothing. It now delegates to the service and keeps the same response envelopes.
- UI:
  - The form gets a Customer/Supplier/Both selector (locked on edit).
  - Opening balance is disabled with a note.
  - The profile shows **Receivable** and **Payable** side by side.
  - The unified ledger is deferred.

## 2. Rollout order (HA-1.1.5) — REQUIRED

1. Deploy the **server first**. Migration 007 runs at startup.
2. Then release the desktop build.

An old server acknowledges `PARTY_UPSERTED` as SYNCED and drops it (F-02). With a new desktop and an old server:
- a BOTH party's company name would be lost centrally;
- its supplier role would get its own backfilled party (split identity).

## 3. Verification

| Test | Where | Result |
|---|---|---|
| SQLite 018–021: backfill preserves every column, identity `party_id = id`, collision left unlinked, blank-name fallback, sentinel, unique/FK/CHECK constraints, re-run idempotent, fresh DB | `docs/audits/phase-1-1-verification/sqlite_migrations_018_021_test.py` (Python sqlite3) | PASS 22/22 |
| PostgreSQL 007: upgrade path from 006 with seeded data, column preservation (md5), identity, collision, runner re-run ×2 idempotent, self-heal of an unlinked row, unique/FK/RESTRICT, BOTH linking, fresh install | `docs/audits/phase-1-1-verification/pg_migration_007_test.sh` (scratch PostgreSQL 16.13) | PASS 17/17 |
| PostgreSQL party repository SQL (derive, link, single-role mirror, guarded upsert incl. stale reject, GREATEST copy, list with ILIKE/filters, summary with BIGINT casts) | Executed verbatim against scratch PostgreSQL | PASS |
| SQLite party repository SQL (same statements; upsert rowcount 0 on stale) | Executed verbatim with Python sqlite3 | PASS |
| TS rules + service permission gates | `docs/audits/phase-1-1-verification/ts_party_rules_test.sh` (Node 22 strip-types) | PASS 6/6 |
| Frontend `tsc --noEmit` | Owner PC workspace, real `node_modules` | PASS: 34 errors before and after, identical sets, **0 new** |
| Rust syntax (`rustfmt --check` parse) on all changed/new files | Cloud container | PASS |
| `cargo test --lib`, `cargo check --bin niazi-server`, `vite build` | — | **BLOCKED here** (crates.io unreachable; Windows-native bundler binaries). **Must be run by AG AI.** |

New Rust tests for AG AI to run:
- `db::migrations::tests::test_migrations_018_021_parties_foundation_backfill`
- `domain::party::tests::*`
- `repositories::party_repository::tests::*`
- `services::party_service::tests::*` (including the legacy customer path)
- `services::change_applier::tests::test_downstream_parties_both_roles_and_guarded_party_upsert`
- `commands::storage_party::tests::party_command_lifecycle`

## 4. Findings recorded (not fixed; out of scope)

> **Update:** the P1 supplier ledger sign, P2 `SUM(bigint)` and P2 `deactivate_customer` findings are resolved on `feature/phase-1-1-targeted-fixes`. See `phase-1-1-targeted-fixes.md`.

| Sev | Finding | Evidence |
|---|---|---|
| P1 | Supplier ledger sign differs between SQLite and PostgreSQL. SQLite writes PURCHASE as **debit** and computes payable as debit − credit. PostgreSQL writes PURCHASE as **credit** and PAYMENT also as **credit**, then computes credit − debit, so central payable **increases** on payment. The party read model follows each backend's existing convention. | `supplier_repository.rs:185-189`; `postgres_purchase_repo.rs:440-455, 598-615`; `postgres_supplier_repo.rs:313-316` |
| P2 | PostgreSQL `SUM(bigint)` returns `numeric`. The existing `query_as::<(i64,)>` balance queries may fail to decode at runtime. The new party queries cast to `BIGINT`. | `postgres_supplier_repo.rs:314`, `postgres_customer_repo.rs:304-306` |
| P2 | `deactivate_customer` (repository-level) enqueues no event and does not mirror to the party. The party can show Active while the customer is inactive. | `customer_service.rs:241` |
| INFO | `CUSTOMER_UPDATED` is still dropped by the server (F-02). A single-role customer's contact edit now also emits `PARTY_UPSERTED`, which propagates the contact fields (not credit limit) through the party path. | — |
| INFO | Auto-healed placeholder roles on desktops stay unlinked until their real CREATED/UPDATED event arrives (then linked and mirrored). | `change_applier.rs` auto-heal helpers |
| INFO | CLAUDE.md §7 still lists 17 SQLite / 6 PostgreSQL migrations. The counts are now 21 / 7. | — |

## 5. Not included (by decision)

- Opening balances.
- The unified party ledger.
- Changing a party's type.
- Linking existing customer/supplier pairs (a later ADMIN action).
- Party writes over REST.
