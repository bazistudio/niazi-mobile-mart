# Changelog

All notable changes to Niazi Mobile Mart will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.47] - Unreleased Candidate

### Added
- **Product Master Compatible Models Persistence**:
  - Implemented 1:N device model mapping (`compatible_models`) on product creation, initial stock intake, and product updates in `product.repo.ts`.
  - Added multi-value compatible model input in `ProductEditModal.tsx` supporting comma- and newline-delimited models.
  - Added compatible-model badge display in `ProductTable.tsx` with count indicators for spare parts and accessories.
  - Extended frontend types and DTO contracts in `tauriClient.ts`, `inventory.dto.ts`, and `inventory.api.ts`.
- **USED Mobile Inventory Legal A4 Paperwork & Date Management**:
  - Expanded `usedMobileA4Template.ts` to include verified bilingual legal declarations (approved Urdu heading `حلف نامہ برائے ذاتی ملکیت` and oath statement), English device affirmation, and distinct seller signature, staff signature, and shop stamp areas.
  - Added dedicated 40mm × 48mm thumb-impression box and administrative record filing approval section (`FINAL ADMIN APPROVAL & RECORD ARCHIVE`).
  - Added unmasked seller CNIC display (`seller_cnic`) on legal paperwork while preserving backend masking for general queries.
  - Restricted historical purchase date entry in `AddMobileForm.tsx` to past/present dates with bilingual Urdu labeling (`تاریخ خریداری`).
  - Separated historical purchase date display from current document print timestamp.
- **Organization Catalog Stock Split**:
  - Separated Central Warehouse Stock from Total Organization Stock across `OrganizationProductsPage.tsx` and `ProductTable.tsx`.

### Changed
- **Decoupled Product Master Updates from Stock Adjustment**:
  - Removed stock quantity adjustment (`tauriClient.inventoryAdjust`) side effects from `productService.updateProduct`, ensuring product metadata edits (name, price, models) never alter inventory stock counts.
- **POS Cart Reactivity Enhancement**:
  - Replaced imperative `getActiveSession()` getters with reactive Zustand state slice subscriptions (`state.saleTabs.find(t => t.id === state.activeTabId)`) across `CartSummary.tsx`, `CartTable.tsx`, `CustomerSelector.tsx`, `PosCustomerLedgerPanel.tsx`, `ProductCardGrid.tsx`, `ProductSearch.tsx`, and `SaleWorkspace.tsx`.
- **Repair Booking Payload Contract Alignment**:
  - Added optional `advance_payment` field to `CreateRepairJobPayload` in `repair.api.ts`, matching backend route and repository expectations (`advance_payment?: { amount: number; method: string; reference?: string | null; } | null;`) and resolving frontend TypeScript compilation errors.

### Validation Notes
- **Static Verification**: Frontend TypeScript check (`npx tsc --noEmit`) passes cleanly with zero errors.
- **Untested / Unverified Status**:
  - POS interactive multi-tab cart UI behavior remains untested in live user runtime.
  - Physical A4 print output, single-page boundary enforcement, and Urdu Nastaliq font fallback on target printer drivers remain visually uncertified.
  - Desktop production build packaging (`build:desktop`) has not yet been executed or certified.
  - Database schema uniqueness constraint for `(product_id, normalized_model)` remains a known schema risk (mitigated in application logic during update).

## [1.3.45] - 2026-10-20

### Added
- **Dedicated Organization Admin Mobile Inventory Page**:
  - Implemented `/dashboard/organization/mobile-inventory` under `organizationRoutes.tsx` with `RoleGuard` restriction, providing organization administrators with a centralized serialized device management console.
  - Added organization overview metric cards for Total Units, Condition Split (NEW vs USED), Stock Status (In-Stock, Inspection, Sold), and cost-based asset valuation in PKR.
  - Added Branch-by-Branch Allocation breakdown cards including zero-device branches (`Branch Beta`, `Central Warehouse`) with interactive branch drilldown filtering.
  - Added consolidated inventory table displaying device model, masked primary IMEI, PTA status, condition, purchase cost, and owning branch badges (`[MAIN]`, `[BRA]`).
  - Added `MobileInventoryCard.tsx` to the main Organization Dashboard linking directly to the dedicated page.
- **Automated Regression Suite (Section 14)**: Added focused unit tests in `mobile-inventory.test.ts` verifying zero-device branch representation, branch ownership metadata on device rows, and summary-to-table total reconciliations.

### Changed
- **Multi-Branch Mobile Inventory Scope & Ownership Metadata**:
  - `mobile.repo.ts`: Extended `listMobileDevices` query with `LEFT JOIN branches b ON b.id = d.branch_id` to include `branch_name` and `branch_code` on all retrieved records.
  - `mobile.routes.ts`: Enforced strict default-deny authorization on `GET /api/mobiles/summary` for non-organization administrators (HTTP 403), while permitting consolidated organization querying on `GET /api/mobiles`.
  - `mobile.routes.ts`: Expanded query limit validation ceiling from 200 to 500 (`limit must be an integer between 1 and 500`).
  - `OrganizationMobileInventoryPage.tsx`: Aligned request limit to `limit=200` for consistent compatibility.
  - `organization-navigation.ts`: Updated Organization Admin navigation href to `/dashboard/organization/mobile-inventory`.

### Fixed
- **Expense Repository User Full Name Column Mapping**: Preserved correction in `expense.repo.ts` mapping `u.name AS performed_by_name` (resolving PostgreSQL error 42703).

## [1.3.44] - 2026-10-20

### Added
- **Repair Booking & Finish Job Transaction Pipeline**:
  - Implemented transactional repair job creation, live stock deduction upon adding spare parts, and compensating stock restoration upon removing parts.
  - Implemented delivery and finish job pipeline with invoice counter allocation (`REP-XXXXX`), status transition to `'Delivered'`, and support for full CASH settlement, advance payments, and customer CREDIT without unverified ledger mutation.
  - Added PostgreSQL migration `038_repair_transaction_pipeline.sql` extending `cash_movements.movement_type` (`REPAIR_ADVANCE`, `REPAIR_SETTLEMENT`), `repair_jobs`, `repair_payments`, `repair_parts`, and introducing `repair_invoice_counters`.
- **Automated Repair Acceptance Suite (T1–T7)**: Added `repair-pipeline.test.ts` verifying full cash settlement (T1), credit settlement with zero ledger mutation (T2), walk-in repair delivery (T3), open cash session enforcement (T4), advance payment deduction (T5), atomic stock deduction/restoration (T6), and conflict rejection on already delivered jobs (T7).

### Changed
- **Polymorphic Repair Query & Schema Compatibility**:
  - `repair.repo.ts`: Explicitly cast `id::text` in polymorphic queries comparing against both UUID and human-readable `job_id`, preventing PostgreSQL operator mismatch errors.
  - `repair.repo.ts`: Aligned `stock_movements` append-only audit log inserts with canonical schema (`reference_id` / `reason`).

## [1.3.43] - 2026-10-19

### Added
- **POS Exchange Server-Authoritative Result Display**: Added `ExchangeResultSummaryModal.tsx` to display server-confirmed exchange breakdowns (`ExchangeResultDto`), ensuring operators view authoritative backend amounts without duplicate submit paths.
- **Dedicated Exchange & Return Receipt Formatting**: Added `formatExchangeReceipt()` to `printFormatter.ts` supporting 80mm thermal and A4 layouts with distinct sections for returned items (credit), replacement items (debit), and settlement summary. Wired return receipt reprint via `HistoryRowActions.tsx`.

### Changed
- **Branch-Isolation & Sentinel Normalization**:
  - `history.repo.ts`: Normalized the branch_id sentinel `'all'` and empty strings to `null` before building WHERE clauses, guaranteeing consistent un-scoped queries across all UNION ALL query arms for org admins while maintaining strict branch isolation.
  - `reports.routes.ts`: Normalized the `'all'` query parameter sentinel to `undefined` for org admins on `/summary` and `/profit` routes, preventing spurious `WHERE branch_id = 'all'` empty result sets.
  - `InvoiceLookupModal.tsx`: Scoped invoice search queries to the operator's active branch (`activeBranchId`), enforcing branch isolation during return lookups.
- **POS Return & Exchange Workflow Consolidation**:
  - `posReturn.service.ts`: Added `createReturnForInvoice()` supporting `'CASH'` and `'CREDIT'` refund methods via `POST /api/returns`.
  - `usePosStore.ts`: Re-routed POS invoice returns through `createReturnForInvoice()`, removed erroneous duplicate `recordPayout()` accounting calls for customer cash refunds, wired server-authoritative exchange results (`lastExchangeResult`), and broadened React Query cache invalidation to include customers, cash, products, returns, and ledger.
- **Printer Mode Options**: Updated `PrinterSelector.tsx` to streamline supported printer layouts (80mm Thermal, A4 / Letter, and PDF Only).
- **Tauri Client Security & Architecture**:
  - `tauriClient.ts`: Cleaned up unpersisted in-memory web storage fallbacks for customers and suppliers, enforcing authoritative backend API and Tauri IPC execution.
  - `backend/package.json`: Preserved test runner script targeting integration test suites.

### Deferred / Known Limitations
- **Return Receipt Wording Defect**: In `HistoryRowActions.tsx`, `refund_method === 'EXCHANGE'` currently falls back into the cash refund calculation ternary (`sr.refund_method === 'CREDIT' ? 0 : ...`). Exchange offsets must not be represented as "Cash Refunded"; exchange offsets must remain distinct from actual cash refunds and credit entries. This cosmetic receipt wording defect is explicitly deferred to v1.3.44.
- **Atomic Exchange Test Suite Baseline**: The automated atomic exchange test suite (`exchange-atomic.test.ts`) baseline remains documented as 12 passed, 0 failed. Tests were not re-executed against the protected environment during this release cycle.

## [1.3.42] - 2026-10-18

### Fixed
- **Sale Idempotency Key Persistence**: `completeSale()` in `sale.repo.ts` now INSERTs into `sale_idempotency_keys` atomically within the sale transaction (before COMMIT), ensuring that duplicate submissions with the same `idempotency_key` correctly return the original sale instead of creating a duplicate.
- **Test Fixture Column Names**: Fixed `customer-ledger-branch.test.ts` `before()` hook to use correct `sales` table column names (`discount`, `payment_status`, `sale_status`) and supply all required NOT NULL columns (`tax_amount`, `paid_amount`, `change_amount`).
- **Test Teardown FK Violation**: Added `DELETE FROM change_log WHERE branch_id = ANY(...)` to `p0-p1-regression.test.ts` `teardownFixtures()` before deleting branches, resolving RESTRICT FK constraint violation on `change_log.branch_id`.
- **Test Prerequisite Branch Seeding**: `test-identities-seed.test.ts` test 11 now seeds the `BRA` and `Branch Beta` (`BRB`) branches required by `runTestIdentitiesSeed()` and removes them atomically in a `finally` block, eliminating the `[PREREQUISITE MISSING]` failure.

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
