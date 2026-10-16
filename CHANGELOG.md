# Changelog

All notable changes to Niazi Mobile Mart will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.41] - 2026-10-17

### Added
- **Server-Authoritative Atomic POS Exchange Workflow**: Introduced atomic exchange processing via `POST /api/sales/exchange` and `exchange.repo.ts`, resolving return lines and replacement items in a single atomic database transaction.
- **Three-Way Settlement Support**: Full support for balanced exchanges (`BALANCED_ZERO`), customer payment collections on positive differences (`POSITIVE_COLLECTION`), and refunds on negative differences (`NEGATIVE_REFUND`).
- **PostgreSQL Migration 035**: Expanded `sales_returns.refund_method` check constraint to include `'CREDIT'` and `'EXCHANGE'`.
- **Exchange UI & Settlement Modal**: Added dedicated exchange settlement modal with walk-in customer cash enforcement and customer ledger credit options.
- **Automated Regression Suite**: Comprehensive 12-test automated suite in `exchange-atomic.test.ts` verifying atomicity, concurrency, advisory locks, idempotency caching, and transaction rollback.

### Fixed
- **Exchange Payment Offset Typing**: Fixed internal return offset payment typing by recording `'OTHER'` with linked return reference number, preserving standard payment method constraints.
- **Exchange Ledger Replay Parity**: Synchronized ledger and cash session movements to guarantee that identical exchange replays yield cached results with zero duplicate row insertions.

## [1.3.40] - 2026-10-15

### Fixed
- **Canonical Admin Authorization**: Enforced canonical two-admin role model across backend and frontend layers. `ADMIN` is strictly the Organization Admin with organization-wide authority, independent of whether `branch_id` is assigned or NULL.
- **Branch Admin Confinement**: Confined `SHOP_ADMIN` strictly to authorized branch operations, preventing cross-branch access leaks.
- **Operational Role Isolation**: Decoupled `MANAGER` from admin helper bypasses (`isBranchAdmin`), keeping operational roles strictly bounded to their defined least-privilege profiles.
- **Cash Register Open Permission**: Corrected permission check on `/api/cash/sessions/open` to require `pos` page and `cash:open` action, allowing cashiers to open registers without full admin escalation.
- **Browser Branch Switcher Alignment**: Updated `ShopSwitcher` to ensure Organization Admins retain branch switching capabilities in the browser interface.
- **POS Barcode Scanner Integration**: Added barcode scanner hook to `SaleWorkspace` to streamline checkout intake.

## [1.3.39] - 2026-10-15

### Fixed
- **Org Admin Branch Checkout Routing**: Resolved issue where organization admin checkouts defaulted to MAIN branch by reading authoritative active shop context from `useOrganizationStore` and passing `branchId` in POS checkout payload.
- **Cross-Branch Authorization**: Hardened backend sales routes with server-side `canAccessBranch()` validation, rejecting cashier cross-branch spoofing with 403 Forbidden while strictly binding non-admins to their verified JWT branch.
- **Branch Cash Session & Daily Summary**: Bound active branch context to cash session retrieval, daily summaries, movements, register opening/closing, and drawer adjustments.
- **Live Branch Context Refresh**: Synchronized POS Header, Cash Management Page, and Sale Workspace to reload product catalog, stock counts, and drawer session data immediately when the active branch context is changed.

## [1.3.38] - 2026-10-14

### Fixed
- **POS Checkout & Cash Session Management**: Fixed HTTP 500 error when completing sales from Main or sub-branches by ensuring `SaleRepoError` is properly raised and handled with standard 400 Bad Request status when a cash session is required.
- **Cash Repository Schema Alignment**: Fixed column naming in `cash.repo.ts` (`opening_cash`, `actual_closing_cash`, `expected_closing_cash`, `business_date`) to align strictly with the PostgreSQL database schema. Added `getDailySummary`, `listCashSessions`, and `getCashSessionById`.
- **Cash Routes & Endpoints**: Added missing backend cash routes (`GET /api/cash/sessions`, `GET /api/cash/sessions/:id`, `GET /api/cash/summary`) and enriched `sendError` handling.
- **Frontend Cash Session Integration**: Wired HTTP API client for cash session operations (`cashSessionOpen`, `cashSessionGetCurrent`, `cashSessionClose`, `cashSessionList`, `cashDailySummary`), added register open indicator and quick cash drawer opener modal directly in POS Header and checkout drawer prompt.

## [1.3.37] - 2026-10-14

### Fixed
- **Sales Idempotency & Checkout Hardening**: Eliminated multi-item concurrent checkout deadlock (`40P01`) via deterministic product ID sorting before `SELECT FOR UPDATE` locking in `sale.repo.ts`. Retries with identical idempotency key and payload safely return original sale without duplicating stock decrements or ledger entries.
- **Idempotency Schema Alignment & Migration 034**: Corrected `branch_id` and `sale_id` column types in migration 033 from `UUID` to `TEXT(36)` to match the core schema convention. Added idempotent forward migration 034 to alter existing columns to `TEXT(36)` on upgraded databases without fresh-install regression.
- **Sales-Return History Rollup**: Added completed sales returns to unified history repository queries with strictly parameterized branch filtering, resolving missing return records in branch and organization history.
- **Invoice Due Balance & Reprint**: Added customer outstanding-balance (`due`) rendering and 80mm ESC/POS printer formatting. Hardened history reprint actions with `getSaleLines(saleId)` persistence retrieval.
- **Integration Test Corrections**: Fixed PostgreSQL query parameter indexing and dynamic stock restoration in sales acceptance test suite.

## [1.3.13] - 2026-10-07

### Fixed
- Fixed Rust compilation errors in `src-tauri/src/services/sale_service.rs` by adding missing `get_branch_by_id` method to `BranchRepository` (both PostgreSQL implementation and enum delegation) and replacing `.clone()` calls on `str` with `.to_string()`.


## [1.3.12] - 2026-10-07

### Added
- Created missing PostgreSQL database migration `014_opening_stock_and_user_counters.sql` defining `opening_stock_entries` and `user_invoice_counters` tables.
- Registered migration `014` and `015` in `src-tauri/src/db/postgres.rs` for automatic execution up to version 015.

### Fixed
- Fixed 403 Forbidden authorization errors on `/api/reports/profit` and other backend routes by implementing a case-insensitive `isAdmin()` helper in `backend/src/auth.ts` supporting `ADMIN`, `SHOP_ADMIN`, `SUPER_ADMIN`, and `OWNER` uppercase roles.
- Fixed Customer creation and synchronization pipeline in `frontend/src/lib/tauri/tauriClient.ts` to directly hit Live PostgreSQL API endpoints (`/api/customers` & `/api/v1/customers`) when online.


## [1.2.18] - 2026-09-24

### Fixed
- relaxed central credential-snapshots authorization to permit any internal staff to bootstrap their local terminal
- implemented dual-hash storage for snapshot credentials without modifying local SQLite schema
- packed both password and PIN hashes into the existing local `credential_hash` string
- resolved "Invalid credentials" error for non-Admins or staff logging into fresh installations with a PIN
- completely eliminated fresh-install authentication deadlocks for all staff roles


## [1.2.17] - 2026-09-24

### Fixed
- fixed fresh Windows first-login authentication deadlock
- added secure central authentication snapshot bootstrap
- central login can now seed the local auth snapshot on a fresh desktop
- restored native snapshot login/session establishment
- preserved offline-first authentication architecture
- no JWT secret exposed to desktop
- no database migration required

## [1.2.16] - 2026-09-24

### Fixed
- **Native Login Snapshot Synchronization**:
  - Restored registration of the existing native Tauri `auth_login_snapshot` command.
  - Restored successful central-login → native desktop session synchronization.
  - Preserved the existing native authentication/session architecture.
  - No JWT secret exposure.
  - No database schema or migration changes.
  - No unrelated product/business-logic changes.

## [1.2.15] - 2026-09-23

### Fixed
- **Product Capability Service Delegation Repair**:
  - Restored proper delegation from `storage_product_create` and `storage_product_update` capability endpoints to `ProductService::create_product` and `ProductService::update_product`.
  - Ensured initial stock entries and opening stock movement records (`MOVEMENT_OPENING_STOCK`) are created atomically within a single database transaction.
  - Enforced transactional generation of `PRODUCT_CREATED` and `PRODUCT_UPDATED` outbox sync events for reliable cloud synchronization.

- **Native Session Synchronization & Auth Hardening**:
  - Hardened desktop native session synchronization (`AuthState`) to maintain strict separation between native Rust session authentication and central cloud bearer-token (`active_token`) attachment.
  - Verified Cloud Run JWT signing secret (`JWT_SECRET`) remains strictly server-side and is never compiled into or required by desktop client binaries.
  - Enhanced logout handling (`auth_logout`) to purge native session state, `active_token`, frontend local storage, and persisted auth snapshot entries simultaneously.
