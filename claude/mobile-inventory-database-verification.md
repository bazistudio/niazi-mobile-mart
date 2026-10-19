# Niazi Mobile Inventory — Disposable Database Verification Report

**Date:** 2026-10-19  
**Execution Context:** Isolated Disposable PostgreSQL 17 Test Environment  
**Repository:** `D:\niazi mobile mart`  
**Branch:** `feature/apply-home-pc-changes`  
**HEAD SHA:** `6ef4318491be675cef4ccd7c40f61b618bd73702`  
**Status:** Verification Gate Complete  

---

## Executive Summary & Final Verdict

| Gate / Verification Phase | Target / Method | Result | Notes |
| :--- | :--- | :--- | :--- |
| **Target Revalidation** | Disposable Container `niazi-mobile-inventory-test-pg` | **PASSED** | Verified Container ID, TCP loopback port 55432, PG 17.11, dedicated DB `niazi_mobile_inventory_test`. |
| **Isolation Safety** | Host & Dev DB Safety Check | **PASSED** | Zero connections to `niazi_mobile_mart`, Windows port 5432, or Cloud SQL. Anonymous volume isolation. |
| **Migration Runner Inspection** | `backend/src/migrate.ts` & SQL files 001–037 | **PASSED** | Discovered 37 sequential migrations; zero external DB links, drop database commands, or remote scripts. |
| **Migration 001–037 Execution** | `node dist/migrate.js` | **PASSED** | All 37 migrations applied inside transaction blocks with advisory locking. Migration 037 recorded. |
| **PostgreSQL 17 Schema & Constraints** | 5 Mobile Tables, 17 Indexes, 25 CHECKs | **PASSED** | Verified all columns, types, foreign keys, 23505 uniqueness rules, and 23514 check constraints in PG 17. |
| **Live MobileRepo Operations** | Real PostgreSQL transactions via `MobileRepo` | **PASSED** | Verified NEW/USED device registrations, IMEI/voucher uniqueness, fail-closed audit log, branch scoping, and PATCH. |
| **Regression Suite (with DB)** | `node --test dist/__tests__/mobile-inventory.test.js` | **PASSED** | **40/40 tests passed** (0 failures, 0 skipped, 10 suites). Detected disposable database. |
| **Static TypeScript Checks** | Backend & Frontend `tsc --noEmit` | **PASSED** | Both backend and frontend compiled with 0 type errors. |

### Final Release Gate Verdict:
**`PASS — READY FOR USER RELEASE AUTHORIZATION`**

*All verification gates for the approved Mobile Inventory phase (Phases B & C) are now complete. Migration 037 and all physical database constraints have been verified against a verified disposable PostgreSQL 17 database.*

---

## 1. Disposable Target & Isolation Revalidation

Immediately prior to migration execution, target identity and network bindings were revalidated:

- **Container Name:** `niazi-mobile-inventory-test-pg`
- **Container ID:** `91bd5ba85a52639ecba8735dbf767a7081affcdc4479a8862bfcc2a6f85ee6a2`
- **Engine / Image:** Pinned `postgres:17` (Linux x86_64, Debian 17.11-1.pgdg13+2)
- **Host Binding:** `127.0.0.1:55432 -> 5432/tcp` (strictly bound to localhost loopback)
- **Connected Database:** `niazi_mobile_inventory_test`
- **Connected User:** `postgres`
- **Data Volume Isolation:** Anonymous container storage; zero host filesystem mounts or data directory reuse.
- **Production / Dev Isolation:**
  - Zero connections were opened to the primary development database `niazi_mobile_mart`.
  - The local Windows host PostgreSQL service (`postgresql-x64-18` on default port 5432) was untouched.
  - Zero connections to Cloud SQL.
  - Credential hygiene: High-entropy randomly generated password retained only in ephemeral non-repository scratch; zero credentials exposed in logs, git history, or committed files.

---

## 2. Migration Runner & Execution Results

### 2.1 Pre-Execution Migration Analysis
All 37 migration scripts in `src-tauri/migrations/postgres` were statically inspected before execution:
- Verified migration ordering: `001_initial_schema.sql` through `037_mobile_inventory_foundation.sql`.
- Verified no destructive operations (`DROP DATABASE`), foreign data wrappers (`postgres_fdw`), or external program executions (`COPY FROM PROGRAM`).
- Verified advisory locking (`pg_advisory_xact_lock(74291837)`) and atomic transaction wrapping per migration file in `backend/src/migrate.ts`.

### 2.2 Execution
- **Command:** `node dist/migrate.js` (with `DATABASE_URL` scoped exclusively to `127.0.0.1:55432/niazi_mobile_inventory_test?sslmode=disable`)
- **Exit Code:** `0`
- **Output:**
  ```text
  [migrate] Discovering PostgreSQL migrations from: D:\niazi mobile mart\src-tauri\migrations\postgres
  [migrate] Discovered 37 migration file(s) (001 through 037_mobile_inventory_foundation.sql).
  [migrate] Applying migration 1: 001_initial_schema.sql...
  ...
  [migrate] Applying migration 37: 037_mobile_inventory_foundation.sql...
  [migrate] Successfully applied 37 pending migration(s).
  [migrate] CLI migration runner completed successfully.
  ```
- **Tracking Table:** `schema_migrations` verified with 37 recorded rows, ending with version `37` (`037_mobile_inventory_foundation.sql`).

---

## 3. Physical PostgreSQL 17 Schema & Constraint Verification

### 3.1 Tables, Indexes, and Constraints Present in PostgreSQL 17

1. **`mobile_devices`** (21 columns):
   - Primary key: `id` (UUID format, length 36).
   - Foreign keys: `organization_id -> organizations(id)`, `branch_id -> branches(id)`, `supplier_id -> suppliers(id)`, `sale_id -> sales(id)`, `created_by -> users(id)`, `updated_by -> users(id)`.
   - Indexes: `mobile_devices_pkey`, `idx_mobile_devices_branch`, `idx_mobile_devices_org_status`, `idx_mobile_devices_sale`, `idx_mobile_devices_supplier`.
   - CHECK constraints: `pta_status IN ('PTA_APPROVED', 'NON_PTA', 'JV', 'GEVEY')`, `condition IN ('NEW', 'USED')`, `status IN ('IN_STOCK', 'INSPECTION', 'SOLD')`, `cost_price >= 0`, `expected_sale_price >= 0`.

2. **`mobile_imei_identifiers`** (6 columns):
   - Primary key: `id` (UUID format, length 36).
   - Foreign keys: `device_id -> mobile_devices(id)`, `organization_id -> organizations(id)`.
   - Unique constraint: `mobile_imei_identifiers_organization_id_imei_key` on `(organization_id, imei)`.
   - Indexes: `mobile_imei_identifiers_pkey`, `idx_mobile_imei_device`.
   - CHECK constraints: `length(imei) = 15 AND imei ~ '^[0-9]{15}$'`, `slot IN ('IMEI1', 'IMEI2')`.

3. **`mobile_purchase_paperwork`** (17 columns):
   - Primary key: `id` (UUID format, length 36).
   - Foreign keys: `device_id -> mobile_devices(id)` (UNIQUE), `organization_id -> organizations(id)`, `branch_id -> branches(id)`, `recorded_by -> users(id)`.
   - Unique index: `idx_mobile_paperwork_branch_voucher` on `(branch_id, voucher_no)`.
   - Index: `idx_mobile_paperwork_cnic` on `(seller_cnic)`.
   - CHECK constraints: `purchase_price > 0`, `seller_cnic ~ '^\d{5}-\d{7}-\d$'`, non-blank checks for `seller_name`, `father_name`, `seller_phone`, `seller_address`, `voucher_no`.

4. **`mobile_inspection_records`** (26 columns):
   - Primary key: `id` (UUID format, length 36).
   - Foreign keys: `device_id -> mobile_devices(id)` (UNIQUE), `organization_id -> organizations(id)`, `inspected_by -> users(id)`, `updated_by -> users(id)`.
   - CHECK constraints: `body_grade IN ('PRISTINE', 'GOOD', 'HEAVY_WEAR', 'DENTED')`, `screen_condition IN ('ORIGINAL', 'REPLACED', 'CRACKED')`, `battery_health_percent BETWEEN 1 AND 100`.

5. **`mobile_device_movements`** (11 columns):
   - Primary key: `id` (UUID format, length 36).
   - Foreign keys: `device_id -> mobile_devices(id)`, `organization_id -> organizations(id)`, `from_branch_id -> branches(id)`, `to_branch_id -> branches(id)`, `performed_by -> users(id)`.
   - Indexes: `idx_mobile_movements_device`, `idx_mobile_movements_org`.
   - CHECK constraints: `movement_type IN ('ACQUIRED', 'TRANSFERRED', 'SOLD', 'RETURNED', 'STATUS_CHANGE', 'INSPECTION_UPDATE')`.

### 3.2 Real PostgreSQL 17 Constraint Enforcement Evidence

The following negative and boundary test queries were executed against PostgreSQL 17 (using isolated transactions and rollbacks):

| Test Case | Attempted Invalid Data | Expected Behavior | Actual Database Result |
| :--- | :--- | :--- | :--- |
| **Organization-Wide IMEI Uniqueness** | Inserting duplicate IMEI for second device in same org | Rejection via `23505` | **Passed:** Rejected with SQLSTATE `23505` on `mobile_imei_identifiers_organization_id_imei_key`. |
| **Branch-Scoped Voucher Uniqueness** | Duplicate `voucher_no` on second device in same branch | Rejection via `23505` | **Passed:** Rejected with SQLSTATE `23505` on `idx_mobile_paperwork_branch_voucher`. |
| **Cross-Branch Voucher Scope** | Same `voucher_no` on device in *different* branch | Allowed | **Passed:** Accepted without conflict. |
| **14-digit IMEI Check** | `12345678901234` (14 digits) | Rejection via `23514` | **Passed:** Rejected with SQLSTATE `23514` (`mobile_imei_identifiers_imei_check`). |
| **Alphabetic IMEI Check** | `12345678901234A` | Rejection via `23514` | **Passed:** Rejected with SQLSTATE `23514` (`mobile_imei_identifiers_imei_check`). |
| **CNIC Missing Dashes** | `3520112345671` | Rejection via `23514` | **Passed:** Rejected with SQLSTATE `23514` (`mobile_purchase_paperwork_seller_cnic_check`). |
| **Negative Cost Price** | `cost_price = -500.00` | Rejection via `23514` | **Passed:** Rejected with SQLSTATE `23514` (`mobile_devices_cost_price_check`). |
| **Zero Purchase Price** | `purchase_price = 0.00` | Rejection via `23514` | **Passed:** Rejected with SQLSTATE `23514` (`mobile_purchase_paperwork_purchase_price_check`). |
| **Invalid Body Grade** | `body_grade = 'FAIR'` | Rejection via `23514` | **Passed:** Rejected with SQLSTATE `23514` (`mobile_inspection_records_body_grade_check`). |
| **Invalid Battery Health** | `battery_health_percent = 105` | Rejection via `23514` | **Passed:** Rejected with SQLSTATE `23514` (`mobile_inspection_records_battery_health_percent_check`). |

---

## 4. Live `MobileRepo` Integration Verification in PostgreSQL 17

Real database operations were executed using `MobileRepo` connected to the disposable PostgreSQL 17 database:

1. **NEW Device Registration (`registerMobileDeviceTx`):**
   - Successfully inserted device, 2 IMEIs (IMEI1, IMEI2), default inspection record, and initial `ACQUIRED` movement log in a single atomic transaction.
   - Retrieved device via `getMobileDevice` verifying all attributes, status `IN_STOCK`, and IMEI list.
2. **USED Device Registration (`registerMobileDeviceTx`):**
   - Successfully inserted device, 1 IMEI, full purchase paperwork, inspection record, and initial `ACQUIRED` movement log.
   - Verified that `purchase_price` matched `cost_price`.
3. **Duplicate IMEI Error Mapping (DEF-02):**
   - Attempted registration of an existing IMEI.
   - Caught `MobileRepoError` with HTTP `409 Conflict` and sanitized error message (`IMEI_ALREADY_REGISTERED: ...`).
4. **Duplicate Voucher Error Mapping (DEF-02):**
   - Attempted registration of an existing voucher number within the same branch.
   - Caught `MobileRepoError` with HTTP `409 Conflict` and sanitized error message (`VOUCHER_ALREADY_REGISTERED: ...`).
5. **Fail-Closed Paperwork Access & Audit (`getMobilePaperwork`):**
   - Called `getMobilePaperwork(deviceId, orgId, branchId, userId)`.
   - Verified paperwork returned accurately.
   - Verified audit entry written to `change_log` with `event_type = 'MOBILE_PAPERWORK_ACCESSED'` committed prior to data return.
   - Verified sensitive seller personal info (`seller_cnic`, `seller_phone`, `seller_address`) was excluded from audit payload.
6. **Multi-Tenant Organization Quarantining:**
   - Attempted to access device using `WRONG_ORG_ID`.
   - Verified `getMobileDevice` returned `null` and `listMobileDevices` returned 0 devices.
7. **Branch Quarantining:**
   - Listed devices filtering by `BRANCH_MAIN` (returned active devices) and `BRANCH_WH` (returned 0 devices).
8. **PATCH Operation (`patchMobileDevice`):**
   - Updated status to `INSPECTION`, modified `expected_sale_price`, and updated notes.
   - Verified atomic commit, state persistence, and `MOBILE_DEVICE_UPDATED` audit entry in `change_log`.
9. **IMEI Probe (`checkImeiAvailability`):**
   - Active registered IMEI correctly returned `{ available: false }`.
   - Unregistered random IMEI correctly returned `{ available: true }`.

---

## 5. Automated Regression & Static Verification Results

| Suite / Command | Scope | Exit Code | Result |
| :--- | :--- | :--- | :--- |
| `node --test dist/__tests__/mobile-inventory.test.js` | Unit & Gated DB Regression Suite | 0 | **40 passed, 0 failed, 0 skipped** (40/40 tests across 10 suites in 1908ms) |
| `npx tsc --noEmit` (in `backend/`) | Backend TypeScript Check | 0 | **Passed:** 0 type errors |
| `npx tsc --noEmit` (in `frontend/`) | Frontend TypeScript Check | 0 | **Passed:** 0 type errors |
| `git status --short` | Git Working Tree Inspection | 0 | **Passed:** Zero unintentional modifications; `shelter/` preserved |

---

## 6. Files Inventory & Scope Integrity

- **Files Created:**
  - `claude/mobile-inventory-database-verification.md` (this report)
- **Files Preserved Unchanged:**
  - `claude/mobile-inventory-final-verification.md`
  - `claude/mobile-inventory-release-readiness-audit.md`
  - `claude/mobile-inventory-release-blocker-remediation.md`
  - `claude/mobile-inventory-phase-b-verification-audit.md`
  - `claude/mobile-inventory-phase-b-findings-review.md`
  - `shelter/` directory and pre-existing modified/untracked files.
- **Scope Isolation:**
  - Mobile Repair files, endpoints, and migrations were **NOT** touched.
  - No Git commits, tags, pushes, or deployments were performed.

---

## 7. Next Steps

With all automated tests (40/40), static TypeScript checks (0 errors), and physical PostgreSQL 17 database migrations (001–037) passing with full verification, the Mobile Inventory backend and database foundations are complete.

Next recommended milestone (subject to separate authorization):
- **Phase D — Frontend Integration:** Connect the Mobile Inventory UI components in `frontend/src/features/mobiles/` to the validated backend API endpoints (`/api/mobiles`).
- **Post-Verification Environment Teardown:** When no longer needed for inspection, the temporary container `niazi-mobile-inventory-test-pg` can be safely removed with `docker rm -f niazi-mobile-inventory-test-pg`.

---
*Report generated and verified on 2026-10-19.*
