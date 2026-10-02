# NIAZI MOBILE MART — CLAUDE CODE PROJECT & TECHNICAL HANDOVER DOCUMENT

## 1. FROZEN RELEASE-CANDIDATE BASELINE

```text
Repository:         bazistudio/niazi-mobile-mart
Branch:             main
Version:            1.2.33
Commit SHA:         fe1ab006a5394ea50f8afb816d8b9ff7951653f6
Working Tree:       CLEAN
Release Tag:        NOT CREATED
Cloud Deployment:   NOT PERFORMED
```

---

## 2. PROJECT OVERVIEW

**Niazi Mobile Mart** is a private, single-organization mobile shop Point-of-Sale (POS) and Enterprise Resource Planning (ERP) application. It is designed specifically for multi-PC retail shop operations in Pakistan, backed by a central PostgreSQL database accessed exclusively over HTTPS.

### Business Domain Features
- **POS & Multi-Payment Sales**: Split payment checkout (Cash, Card, Bank Transfer, EasyPaisa, JazzCash, Other) with overpayment/change accounting and credit ledger tracking.
- **Inventory & Stock Management**: Product master catalog, barcode search, stock transfers between shop branches, stock adjustments, and opening inventory.
- **Customer & Supplier Ledgers**: Customer credit limits, receivable ledgers, supplier payable ledgers, and payment allocation (FIFO).
- **Cash Session Reconciliation**: Daily opening/closing cash drawer sessions, cash movement tracking, and cash expense logging.
- **Profitability & Financials**: Real-time sales profit margin calculations, average costing, and sales return reversals.
- **Central Management**: Central Axum backend server, PostgreSQL central database, JWT authentication, and RBAC.

*Note: This system is a single-organization private ERP. It is NOT a multi-tenant SaaS platform.*

---

## 3. TECHNOLOGY STACK

```text
Frontend Framework:     React 19, Vite 6, TypeScript
Styling & UI:           TailwindCSS, Lucide Icons, Shadcn/Radix UI patterns
State & Data Fetching:  Zustand (stores), TanStack Query v5 (React Query)
Desktop Shell:          Tauri v2 (2.1.1)
Machine/Native Layer:   Rust 2021 Edition
Local Persistence:      SQLite (rusqlite 0.32 bundled, WAL mode enabled) — auth snapshot & terminal state only
Central Server:         Axum 0.8, Tokio 1.43
Central Database:       PostgreSQL (sqlx 0.8 with native migration runner) — sole business data store
Authentication:         Central JWT with local auth snapshot fallback
CI/CD Pipeline:         GitHub Actions (.github/workflows/release.yml)
Cloud Platform:         GCP Cloud Run, GCP Cloud SQL PostgreSQL
Installer Packager:     Tauri Bundler (NSIS .exe / Windows .msi)
```

---

## 4. HIGH-LEVEL ARCHITECTURE

```text
                         NIAZI MOBILE MART ARCHITECTURE

                     CENTRAL BACKEND (AUTHORITATIVE)
                 Axum Web Server + PostgreSQL + JWT Auth + RBAC
                               │
                               │ HTTPS / REST API
                               │
            ┌──────────────────┴──────────────────┐
            │                                     │
      Desktop Application (Tauri v2)       Future Mobile Client
      React 19 UI + TypeScript Engine             (REST API)
            │
            │ TypeScript Application Layer (Zustand / TanStack Query / AuthService)
            │
      Typed Tauri Bridge (src/lib/tauri/tauriClient.ts)
            │
      Rust Machine Layer (src-tauri/src/)
            │
   ┌────────┴────────┬─────────────────┐
   │                 │                 │
SQLite (local    Windows FS       Thermal Printer
auth/terminal)
```

### Architectural Layer Responsibilities

1. **TypeScript Application Layer (`frontend/src/`)**:
   - Primary owner of business workflow orchestration, UI routing, local store state (`usePosStore`, `cash.store`, etc.), and user session management (`AuthService`).
   - Communicates with native layer via the typed bridge.

2. **Typed Tauri Bridge (`frontend/src/lib/tauri/tauriClient.ts`)**:
   - Enforces strict type contracts between React frontend and Rust IPC handlers.

3. **Rust Machine Layer (`src-tauri/src/`)**:
   - Handles OS capabilities, SQLite for local auth snapshot and terminal registration, Windows thermal printing, and all business data operations via the central PostgreSQL server.

4. **Central Axum Server (`src-tauri/src/bin/server.rs`)**:
   - Sole authority for all business data: authentication, PostgreSQL persistence, and RBAC enforcement.

---

## 5. CRITICAL ARCHITECTURAL BOUNDARIES & RULES

> **CRITICAL RULE**: Do NOT migrate business logic from TypeScript into Rust merely because legacy Rust commands exist.

- **Session Ownership**: User authentication sessions are owned by `AuthService` in TypeScript.
- **Rust Machine Boundary**: Rust functions as the machine execution layer (local auth/terminal SQLite, thermal printing, native OS calls, PostgreSQL business data via Axum).
- **Online-Only**: All business data flows through the central PostgreSQL server. There is no offline business data storage, no local outbox queue, and no sync worker for business events.
- **Legacy Commands Precaution**: Legacy Rust commands in `src-tauri/src/commands/` may still inspect `AppState.session`. Always verify whether a command is called via the typed bridge before altering session checks.

---

## 6. AUTHENTICATION & ROLE-BASED ACCESS CONTROL (RBAC)

### Authentication Flow
1. User logs in via Central Server (`/api/auth/login`), receiving a signed JWT.
2. The user profile, JWT, and permissions are cached locally in the SQLite `local_auth_snapshot` table.
3. If network is unavailable, offline login validates credentials against `local_auth_snapshot` using argon2/bcrypt password hashes.
4. Session reset or logout clears active memory state and local snapshot token.

### Supported System Roles
- `ADMIN`: Full organization & branch access.
- `SHOP_ADMIN`: Full operational access within assigned shop branch.
- `CASHIER`: Restricted to POS sales, daily cash sessions, and customer payments.
- `SALESMAN`: Restricted to POS product browsing and drafting sales.

*Security Constraint*: RBAC authorization must be enforced server-side. Never rely solely on UI component hiding.

---

## 7. DATABASE ARCHITECTURE & MIGRATION SCHEMA

### Local Database (SQLite)
- **Path**: Managed by Tauri AppData directory (`niazi_mobile_mart.db`).
- **Pragmas**: `journal_mode = WAL`, `foreign_keys = ON`, `synchronous = NORMAL`.
- **Active Migrations**: 21 Migrations (`001_initial_schema` to `021_parties_backfill`).
- **Migration 017 (`017_multi_payment`)**: Rebuilds `sale_payments` table to support payment method CHECK constraint: `('CASH', 'CARD', 'BANK_TRANSFER', 'EASYPAISA', 'JAZZCASH', 'OTHER')`.
- **Migrations 018–021 (`018_parties_table` to `021_parties_backfill`)**: Canonical party identity model with deterministic backfill.

### Central Database (PostgreSQL)
- **Engine**: GCP Cloud SQL PostgreSQL.
- **Migration Runner**: Enforced in code via `PostgresAdapter::run_migrations()` in `src-tauri/src/db/postgres.rs`.
- **Active Migrations**: 8 Migrations (`001_initial_schema.sql` to `008_search_index_parity.sql`).
- **Migration 007 (`007_parties_foundation.sql`)**: Canonical party identity model with deterministic backfill (mirrors SQLite 018–021).
- **Migration 008 (`008_search_index_parity.sql`)**: Adds `lower()` functional indexes on `parties.display_name`, `customers.name`, `suppliers.name` for case-insensitive search parity.

### Intentional Schema Differences (SQLite vs PostgreSQL)

These are by-design differences, not gaps:

| Difference | Explanation |
|-----------|-------------|
| SQLite `sync_cursors` table | Client-side pull cursor tracking `last_applied_sequence` per stream. Each desktop terminal tracks its own sync position. No server equivalent needed. |
| PostgreSQL `sync_audit` table | Central audit log for sync events received from terminals. No client-side equivalent needed. |
| PostgreSQL `change_log` table | Central event broadcast stream (`BIGSERIAL` sequence). Desktop clients consume it via `sync_cursors`; they do not replicate it locally. |
| SQLite `local_auth_snapshot` table | Offline authentication cache per terminal. Stores hashed credentials for offline login. Central server authenticates live and does not need this. |
| SQLite `offline_sync_queue` (client outbox) vs PostgreSQL `sync_audit` (server ingest) | Opposite ends of the same sync pipeline. Different schemas are intentional. |
| Products composite UNIQUE constraint | PostgreSQL enforces `products_composite_identity_key` (`UNIQUE NULLS NOT DISTINCT`). SQLite lacks this syntax; uniqueness is enforced at application layer via collision preflight in migration 015 runner code. |
| SQLite `sale_payments` table-rebuild migration | SQLite cannot `ALTER CHECK` constraints; migration 017 uses `DROP` + `CREATE` + `INSERT`. PostgreSQL migration 006 uses `ALTER TABLE ... DROP/ADD CONSTRAINT`. End state is identical. |
| Money columns: `INTEGER` (SQLite) vs `BIGINT` (PostgreSQL) | Both represent whole PKR rupees. SQLite `INTEGER` is 64-bit for large values. PostgreSQL `BIGINT` is explicitly 64-bit. No overflow risk at shop scale. |
| Search indexes: `COLLATE NOCASE` (SQLite) vs `lower()` functional (PostgreSQL) | SQLite uses `COLLATE NOCASE` on B-tree indexes. PostgreSQL uses `lower(column)` functional indexes (migration 008). Both support case-insensitive ordering. |

---

## 8. ONLINE-ONLY DATA ARCHITECTURE

### Transaction Flow
```text
1. Transaction initiated on POS
   ↓
2. Tauri command dispatched to Rust service layer
   ↓
3. Rust service calls PostgreSQL via Axum REST API (HTTPS)
   ↓
4. Central PostgreSQL persistence + RBAC enforcement
   ↓
5. Response returned to Tauri command handler
   ↓
6. UI state updated via TanStack Query cache invalidation
```

### Architecture Status
- **Current State**: All business data operations target central PostgreSQL exclusively. No offline outbox queue, no sync worker, no SQLite business tables used at runtime.
- **SQLite remaining uses**: Local auth snapshot (`local_auth_snapshot`) for offline login fallback; terminal registration (`terminals` table) for invoice number scoping.

---

## 9. POS MULTI-PAYMENT CONTRACT (v1.2.33 RELEASE SCOPE)

Version 1.2.33 introduces canonical POS multi-payment support:

### Input Contract
`CompleteSaleDto` accepts an optional breakdown array:
```typescript
interface SalePaymentInputDto {
  payment_method: string; // CASH, CARD, BANK_TRANSFER, EASYPAISA, JAZZCASH, OTHER
  amount: number;         // Amount in whole PKR rupees
  reference_number?: string;
  notes?: string;
}
```

### Verified Payment Invariants
1. **Clamping**: Total inserted `SalePayment` records are capped to `total_amount`.
2. **Overpayment / Change**: Excess tendered cash is output as `change_amount` and is NOT recorded as a payment record.
3. **Cash Movement Capping**: Net `CashMovement` is capped to allocated cash (total sale amount minus non-cash tenders).
4. **Credit Ledger Gap**: Unpaid balance (`total_amount - upfront_paid`) generates a `CustomerLedgerEntry` debit for registered customers.
5. **Returns Integrity**: Partial and full sales returns reverse cost of goods sold (COGS) without modifying original historical payment rows.

---

## 10. VERIFIED TEST & BUILD BASELINE (v1.2.33)

```text
Rust Library Unit Tests:    168 passed / 0 failed (cargo test --lib)
Frontend Vite Production:   PASSED (vite build completed in ~34s)
Server Compilation:         PASSED (cargo check --bin niazi-server)
Tauri Desktop Library:      PASSED (Cargo lib check)
POS Payment Contract:       PASSED
Auth / RBAC Boundaries:     PASSED
Database Migration Parity:  PASSED (SQLite 017 & Postgres 006 verified)
```

---

## 11. RELEASE PIPELINE

- **Release Workflow File**: `.github/workflows/release.yml`
- **Trigger**: Tag push matching `v[0-9]+\.[0-9]+\.[0-9]+*` (e.g. `v1.2.33`).
- **Build Process**: GitHub Actions runner installs Node.js & Rust, executes `tauri-action@v0`, and packages NSIS `.exe` installer and `.msi` package.
- **Rule**: Creating production tags and deploying Cloud Run services requires explicit human owner authorization.

---

## 12. KNOWN TECHNICAL DEBT & FUTURE WORK PRIORITIES

1. **P0 — Security Hardening**: Strict audit of API authorization boundaries, token expiration, and local auth snapshot security.
2. **P0 — Network Resilience**: Graceful handling of transient network failures — retry logic, user-facing error states, and partial operation recovery.
3. **P1 — Backup & Disaster Recovery**: Implement automated PostgreSQL snapshot backups and restoration procedures.
4. **P1 — Operational Polish**: Enhanced reporting, print layout customizations, and batch inventory import tooling.
5. **Future — Mobile Application**: Separate lightweight React Native client interfacing directly with the central Axum REST API.

---

## 13. CLAUDE CODE OPERATING RULES

1. **Audit Before Implementation**: Always inspect target source code and tests before editing. Never guess file paths, variable names, or schemas.
2. **Targeted Staging**: NEVER run `git add .` or `git add -A`. Stage only explicit files required for the task.
3. **No Uncontrolled Refactoring**: Do not rewrite existing working components unless specifically requested or required for a bug fix.
4. **Online-Only Constraint**: All business data operations MUST go through the central PostgreSQL server. Never introduce SQLite business writes outside of auth snapshot or terminal registration.
5. **Protect Financial Integrity**: Any change touching sales, payments, cash, profit, or ledgers MUST pass all existing unit tests.
6. **Server-Side Authorization**: Ensure permissions are enforced in backend/service endpoints, not just UI components.
7. **Idempotent Migrations**: SQLite and PostgreSQL migrations must be written safely using table rebuilds or idempotent DDL.
8. **Clean Checkpoints**: Always verify `cargo test --lib` and `npm run build` pass clean before requesting commit authorization.
9. **Hard Stop Gate**: Stop execution and request user feedback before performing destructive changes, tags, or deployments.

---

## 14. RECOMMENDED NEXT PHASE FOR CLAUDE CODE

```text
Phase: NETWORK RESILIENCE & ERROR UX HARDENING
1. Audit all Tauri command handlers for unhandled network error cases.
2. Identify user-facing flows that leave UI in broken state on API failure.
3. Implement retry policy for transient failures (connection timeout, 503).
4. Add graceful error modals or toast notifications for API errors in frontend.
5. Test all POS flows under simulated network interruption.
6. STOP for human owner review before modifying any financial transaction code.
```
