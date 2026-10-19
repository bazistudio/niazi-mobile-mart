# Niazi Mobile Mart — Mobile Inventory Phase B Verification Audit
## Read-Only Forensic Review + Safe Static Testing

**Repository:** `D:\niazi mobile mart`  
**Audited Branch:** `feature/apply-home-pc-changes`  
**Verified Starting HEAD:** `6ef4318491be675cef4ccd7c40f61b618bd73702`  
**Commit Subject:** `chore(release): prepare v1.3.43`  
**Audit Date:** 2026-10-19  
**Audit Type:** Static Forensic Inspection & Safe Static Verification  
**Final Verdict:** **PASS WITH FINDINGS**

---

## 1. Hard Baseline & Worktree Verification

### 1.1 Git Reference Baseline
```text
Repository Root : D:/niazi mobile mart
Current Branch  : feature/apply-home-pc-changes
HEAD Commit SHA : 6ef4318491be675cef4ccd7c40f61b618bd73702
Parent SHA      : 3daab7d83bd19182b0e842ec48d4c77ba2c35320
Commit Subject  : chore(release): prepare v1.3.43
```
The repository root, branch, HEAD SHA, parent SHA, and commit subject exactly match the approved v1.3.43 release baseline.

### 1.2 Worktree Status (`git status --short --branch`)
```text
## feature/apply-home-pc-changes
 M backend/src/server.ts
 M frontend/src/app/router/shopAdminRoutes.tsx
 M frontend/src/constants/navigation/shop-admin-navigation.ts
?? backend/src/repositories/mobile.repo.ts
?? backend/src/routes/mobile.routes.ts
?? backend/src/routes/mobile.validation.ts
?? frontend/src/features/mobiles/
?? frontend/src/pages/dashboard/shop-admin/AddMobilePage.tsx
?? frontend/src/pages/dashboard/shop-admin/MobileInventoryPage.tsx
?? src-tauri/migrations/postgres/037_mobile_inventory_foundation.sql
```

### 1.3 Pre-Existing Work vs. Phase B Changes
Forensic analysis of the working tree confirms:
1. **Pre-Existing Phase 1 UI Changes (Preserved & Untouched):**
   - `frontend/src/app/router/shopAdminRoutes.tsx` (modified: added `/mobiles` and `/mobiles/add` route elements)
   - `frontend/src/constants/navigation/shop-admin-navigation.ts` (modified: added Mobile Inventory sidebar item)
   - `frontend/src/features/mobiles/` (untracked: components, types, and dashboard UI)
   - `frontend/src/pages/dashboard/shop-admin/AddMobilePage.tsx` (untracked: form page shell)
   - `frontend/src/pages/dashboard/shop-admin/MobileInventoryPage.tsx` (untracked: directory page shell)
2. **Phase B Implementation Changes (Under Review):**
   - `backend/src/server.ts` (modified: imported `buildMobileRouter` and mounted on `/api/mobiles` and `/api/v1/mobiles`)
   - `backend/src/repositories/mobile.repo.ts` (untracked: repository class, types, audit helper, and error class)
   - `backend/src/routes/mobile.routes.ts` (untracked: router factory, auth middleware, permission helpers, health endpoint)
   - `backend/src/routes/mobile.validation.ts` (untracked: domain vocabulary constants, validation helpers, type guards)
   - `src-tauri/migrations/postgres/037_mobile_inventory_foundation.sql` (untracked: 5-table schema DDL)
3. **Repository Integrity:**
   - Existing migrations `001_initial_schema.sql` through `036_update_product_composite_identity.sql` were **not modified**.
   - The `shelter` directory and release candidate assets were **not modified**.
   - No unrelated files in the project were touched.

### 1.4 Phase A.3 Design and Phase B Report Availability
- `claude/mobile-inventory-phase-a3-final-design.md`: Missing from disk.
- `claude/mobile-inventory-phase-b-implementation-report.md`: Missing from disk.
- **Audit Procedure:** As instructed by the audit charter, because the markdown reports were missing on disk, this verification was conducted directly against live source code, migration files, git logs, and established project architecture.

---

## 2. Files Under Review

The 5 Phase B files were subjected to full read-only line-by-line inspection:

1. `src-tauri/migrations/postgres/037_mobile_inventory_foundation.sql` (193 lines)
2. `backend/src/repositories/mobile.repo.ts` (244 lines)
3. `backend/src/routes/mobile.routes.ts` (152 lines)
4. `backend/src/routes/mobile.validation.ts` (197 lines)
5. `backend/src/server.ts` (lines 58, 290–300)

---

## 3. Migration 037 Static Schema Verification

### 3.1 Five-Table Structure & Constraints Analysis

#### Table 1: `mobile_devices` (Lines 18–58)
- **Primary Key:** `id TEXT PRIMARY KEY CHECK(length(id) = 36)` — Matches project-wide UUIDv4 text format.
- **Foreign Keys:**
  - `organization_id TEXT NOT NULL REFERENCES organizations(id)` — Verified: target table exists in `001_initial_schema.sql:12`.
  - `branch_id TEXT NOT NULL REFERENCES branches(id)` — Verified: target table exists in `001_initial_schema.sql:26`.
  - `supplier_id TEXT REFERENCES suppliers(id) ON DELETE RESTRICT` — Verified: target exists in `001_initial_schema.sql:286`. Nullable, restricted delete.
  - `sale_id TEXT REFERENCES sales(id)` — Verified: target exists in `001_initial_schema.sql:191`. Nullable, reserved for Phase F.
  - `created_by TEXT NOT NULL REFERENCES users(id)` — Verified: target exists in `001_initial_schema.sql:40`.
  - `updated_by TEXT REFERENCES users(id)` — Verified: target exists in `001_initial_schema.sql:40`.
- **CHECK Constraints:**
  - `brand`: `CHECK(length(trim(brand)) > 0)` — Enforces non-blank string.
  - `model`: `CHECK(length(trim(model)) > 0)` — Enforces non-blank string.
  - `pta_status`: `CHECK(pta_status IN ('PTA_APPROVED', 'NON_PTA', 'JV', 'GEVEY'))` — Exact domain vocabulary.
  - `condition`: `CHECK(condition IN ('NEW', 'USED'))` — Exact domain vocabulary.
  - `status`: `CHECK(status IN ('IN_STOCK', 'INSPECTION', 'SOLD'))` — Explicitly excludes unapproved transition states (`TRANSFERRED`, `RETURNED`).
  - `cost_price`: `NUMERIC(12,2) NOT NULL CHECK(cost_price >= 0)` — Nonnegative.
  - `expected_sale_price`: `NUMERIC(12,2) CHECK(expected_sale_price >= 0)` — Nonnegative.
- **Indexes:**
  - `idx_mobile_devices_branch ON mobile_devices (branch_id, status)`
  - `idx_mobile_devices_org_status ON mobile_devices (organization_id, status)`
  - `idx_mobile_devices_sale ON mobile_devices (sale_id) WHERE sale_id IS NOT NULL`
  - `idx_mobile_devices_supplier ON mobile_devices (supplier_id) WHERE supplier_id IS NOT NULL`

#### Table 2: `mobile_imei_identifiers` (Lines 65–79)
- **Primary Key:** `id TEXT PRIMARY KEY CHECK(length(id) = 36)`
- **Foreign Keys:**
  - `device_id TEXT NOT NULL REFERENCES mobile_devices(id) ON DELETE RESTRICT` — Parent device deletion prevented while IMEIs exist.
  - `organization_id TEXT NOT NULL REFERENCES organizations(id)`
- **IMEI Column:**
  - `imei TEXT NOT NULL CHECK(length(imei) = 15 AND imei ~ '^[0-9]{15}$')` — Enforces exactly 15 numeric digits.
  - `slot TEXT NOT NULL CHECK(slot IN ('IMEI1', 'IMEI2'))`
- **Uniqueness:**
  - `UNIQUE (organization_id, imei)` — Enforces organization-wide IMEI uniqueness.
- **Index:**
  - `idx_mobile_imei_device ON mobile_imei_identifiers (device_id)`

#### Table 3: `mobile_purchase_paperwork` (Lines 89–116)
- **Primary Key:** `id TEXT PRIMARY KEY CHECK(length(id) = 36)`
- **Foreign Keys:**
  - `device_id TEXT NOT NULL UNIQUE REFERENCES mobile_devices(id) ON DELETE RESTRICT` — Strictly 1:1 relationship per device.
  - `organization_id TEXT NOT NULL REFERENCES organizations(id)`
  - `branch_id TEXT NOT NULL REFERENCES branches(id)`
  - `recorded_by TEXT NOT NULL REFERENCES users(id)`
- **Fields & Constraints:**
  - `voucher_no`: `TEXT NOT NULL CHECK(length(trim(voucher_no)) > 0)` — Mandatory, non-blank.
  - `purchase_date`: `TEXT NOT NULL`
  - `purchase_price`: `NUMERIC(12,2) NOT NULL CHECK(purchase_price > 0)` — Positive price requirement enforced.
  - `seller_name`, `father_name`, `seller_phone`, `seller_address`: Non-blank string checks enforced.
  - `seller_cnic`: `TEXT NOT NULL CHECK(seller_cnic ~ '^\d{5}-\d{7}-\d$')` — 13-digit Pakistani CNIC pattern strictly enforced.
  - `ownership_declaration_acknowledged`, `physical_affidavit_acknowledged`: `BOOLEAN NOT NULL DEFAULT FALSE`.
  - **Mandatory Removal:** `cnic_copy_attached` is **completely absent**.
- **Uniqueness & Indexes:**
  - `UNIQUE (branch_id, voucher_no)` via `idx_mobile_paperwork_branch_voucher` — Prevents voucher collision per branch.
  - `idx_mobile_paperwork_cnic ON mobile_purchase_paperwork (seller_cnic)` — Fast search by seller CNIC.

#### Table 4: `mobile_inspection_records` (Lines 124–156)
- **Primary Key:** `id TEXT PRIMARY KEY CHECK(length(id) = 36)`
- **Foreign Keys:**
  - `device_id TEXT NOT NULL UNIQUE REFERENCES mobile_devices(id) ON DELETE RESTRICT` — Strictly 1:1 per device.
  - `organization_id TEXT NOT NULL REFERENCES organizations(id)`
  - `inspected_by TEXT NOT NULL REFERENCES users(id)`
  - `updated_by TEXT REFERENCES users(id)` — Tracks last modifier.
- **Diagnostic Invariants:**
  - `body_grade`: `CHECK(body_grade IN ('PRISTINE', 'GOOD', 'HEAVY_WEAR', 'DENTED'))`
  - `screen_condition`: `CHECK(screen_condition IN ('ORIGINAL', 'REPLACED', 'CRACKED'))`
  - `battery_health_percent`: `INTEGER CHECK(battery_health_percent BETWEEN 1 AND 100)`
  - 11 Functional Component Checks: `touch_working`, `battery_backup_ok`, `front_camera_ok`, `back_camera_ok`, `speaker_ok`, `microphone_ok`, `charging_port_ok`, `buttons_ok`, `biometrics_ok`, `wifi_bluetooth_ok`, `sim_network_ok` all defined as `BOOLEAN NOT NULL DEFAULT TRUE`.
  - 4 Explicit Accessories: `accessories_box`, `accessories_original_charger`, `accessories_cable`, `accessories_handsfree` all defined as `BOOLEAN NOT NULL DEFAULT FALSE`.
  - `defect_notes TEXT`.

#### Table 5: `mobile_device_movements` (Lines 166–193)
- **Primary Key:** `id TEXT PRIMARY KEY CHECK(length(id) = 36)`
- **Foreign Keys:**
  - `device_id TEXT NOT NULL REFERENCES mobile_devices(id) ON DELETE RESTRICT`
  - `organization_id TEXT NOT NULL REFERENCES organizations(id)`
  - `from_branch_id TEXT REFERENCES branches(id)`
  - `to_branch_id TEXT REFERENCES branches(id)`
  - `performed_by TEXT NOT NULL REFERENCES users(id)`
- **Movement Invariant:**
  - `CHECK(movement_type IN ('ACQUIRED', 'TRANSFERRED', 'SOLD', 'RETURNED', 'STATUS_CHANGE', 'INSPECTION_UPDATE'))`
- **Indexes:**
  - `idx_mobile_movements_device ON mobile_device_movements (device_id, created_at)`
  - `idx_mobile_movements_org ON mobile_device_movements (organization_id, created_at)`

### 3.2 Migration Runner Compatibility
- **Runner Inspection (`backend/src/migrate.ts`):**
  - Filename sorting logic (`lines 88`): `localeCompare(..., { numeric: true, sensitivity: 'base' })`.
  - Version extraction (`lines 73–76`): `filename.match(/^(\d+)/)` extracts integer `37` from `037_mobile_inventory_foundation.sql`.
  - Sequence order: Preceding file is `036_update_product_composite_identity.sql` (`version = 36`). Migration 037 will be discovered and applied immediately next.
  - Transaction handling: `migrate.ts` executes each migration within an atomic `BEGIN; ... COMMIT;` block under PostgreSQL advisory transaction lock `pg_advisory_xact_lock(74291837)`.
  - Down migration: Project-wide convention has no `.down.sql` files (migrations 001–036 are all forward-only). Migration 037 adheres to this convention.

---

## 4. Backend Correctness & Security Audit

### 4.1 Router Registration (`backend/src/server.ts`)
- Mounted on both canonical aliases:
  ```typescript
  const mobileRouter = buildMobileRouter(pool);
  app.use('/api/mobiles', mobileRouter);
  app.use('/api/v1/mobiles', mobileRouter);
  ```
- Placement: Lines 294–300 in `server.ts`, after `rolesRouter` and before `/api/organization/balances`.
- No unimplemented Phase C endpoints are exposed. Only `GET /api/mobiles/health` is active.

### 4.2 Authentication & Authorization Checks
1. **Authentication:**
   - Every request to `mobileRouter` passes through `router.use(buildAuthMiddleware(pool))` (`mobile.routes.ts:43`).
   - Unauthenticated requests are rejected fail-closed with `401 Unauthorized`.
2. **Database Access on Health Check:**
   - **Finding:** While the `/health` handler itself performs no domain query, `buildAuthMiddleware(pool)` executes `SELECT is_active, status, role FROM users WHERE id = $1` on PostgreSQL for every request.
   - **Conclusion:** A live HTTP request to `/api/mobiles/health` **is not database-free**. It cannot be tested live without accessing PostgreSQL.
3. **Permission Scaffolding:**
   - `requireInventoryView`: checks `authorizePermission(identity, 'inventory', null)`.
   - `requireInventoryEdit`: checks `authorizePermission(identity, 'inventory', 'inventory:edit')`.
   - **Security Finding (P2 - Medium):** In `backend/src/auth.ts:313-322`, `hasActionAccess` contains a legacy fallback: if `allowed_actions` is empty, it returns `true` for all staff roles (`SALESMAN`, `CASHIER`, `STAFF`, `MANAGER`, `ACCOUNTANT`). Consequently, unless checked via `isBranchAdmin` or an explicit default-deny action guard, non-admin staff with empty `allowed_actions` could pass `requireInventoryEdit`. (See Finding F-02).

### 4.3 Repository & Audit Helpers (`backend/src/repositories/mobile.repo.ts`)
1. **`writeAuditEntry` Contract:**
   - Correctly passes `client: PoolClient` into `writeChangeLogEntry`.
   - Passes `payloadStr: JSON.stringify(opts.eventPayload)`.
   - Operates inside the surrounding transaction; does not commit or release the client.
2. **Transaction Scoping in Availability Check (P2 - Medium):**
   - `isImeiTaken` and `isVoucherTaken` currently query `this.pool.query(...)`.
   - If invoked inside a Phase C registration transaction, they query via an independent pool connection outside the transaction block.
   - **Recommendation for Phase C:** Update signatures to `(client?: PoolClient)` so queries participate in the open transaction. (See Finding F-03).
3. **Data Privacy:**
   - `MobileDeviceRow` strictly omits `seller_name`, `father_name`, `seller_cnic`, `seller_phone`, and `seller_address`.
   - `MobilePaperworkRow` encapsulates sensitive fields and documents that paperwork queries require dedicated admin-level auditing.

### 4.4 Validation Correctness (`backend/src/routes/mobile.validation.ts`)
1. **Format Validators:**
   - `isValidImei`: Exactly 15 digits (`/^[0-9]{15}$/`). Validated.
   - `isValidCnic`: Matches `^\d{5}-\d{7}-\d$`. Validated.
   - `isNonBlankString`: Non-empty trimmed string. Validated.
   - `isValidBatteryHealth`: `null`/`undefined` allowed; if number, requires integer $1 \le x \le 100$. Validated.
   - `validateSupplierLinkage`: Requires `supplier_id` to be absent for `USED`, optional for `NEW`. Validated.
2. **Monetary Precision & Price Equality (P1 - High):**
   - **Inspection of `pricesAreEqual(a, b)`:**
     ```typescript
     export function pricesAreEqual(a: unknown, b: unknown): boolean {
       const na = typeof a === 'string' ? parseFloat(a) : (typeof a === 'number' ? a : NaN);
       const nb = typeof b === 'string' ? parseFloat(b) : (typeof b === 'number' ? b : NaN);
       if (!Number.isFinite(na) || !Number.isFinite(nb)) return false;
       return na.toFixed(2) === nb.toFixed(2);
     }
     ```
   - **Flaws Identified:**
     1. *Permissive Parsing:* `parseFloat("100.50XYZ")` produces `100.50`, allowing malformed trailing characters to pass.
     2. *Unequal Value Coercion:* `pricesAreEqual("100.501", "100.504")` and `pricesAreEqual("100.505", "100.506")` both coerce to identical `.toFixed(2)` strings, returning `true` despite mathematically unequal prices.
     3. *Negative Zero Discrepancy:* `pricesAreEqual(-0, 0)` checks `"-0.00" === "0.00"`, evaluating to `false`.
     4. *Binary Float Drift:* Standard IEEE-754 numbers like `1.005.toFixed(2)` produce `"1.00"` due to floating-point representation.
   - **Impact on Phase C:** Used-phone registration requires exact parity between `cost_price` and `purchase_price`. This helper must be strengthened before Phase C registration handler is wired. (See Finding F-01).

---

## 5. Safe Static Checks & Tests

### 5.1 Check Classification

| Candidate Check | Safety Classification | Execution Decision | Rationale |
| :--- | :--- | :--- | :--- |
| `npx tsc --noEmit` (backend) | **Safe** | **EXECUTED** | Pure static type analysis; non-mutating; does not touch DB or emit files. |
| `node --test` (backend integration tests) | **Unsafe** | **SKIPPED** | Test scripts import `db.ts`, create pool, and connect to PostgreSQL. |
| `npm run migrate` | **Unsafe** | **SKIPPED** | Executes pending migrations against PostgreSQL. Prohibited by Gate 4. |
| `curl /api/mobiles/health` | **Unsafe** | **SKIPPED** | `buildAuthMiddleware(pool)` queries PostgreSQL `users` table on every request. |
| Pre-installed SQL Linter | **N/A** | **SKIPPED** | No local offline SQL linting binary is configured in workspace. |

### 5.2 Safe Check Outcome
- **Command:** `npx tsc --noEmit` executed in `D:\niazi mobile mart\backend`
- **Exit Code:** `0`
- **Output:** Clean (0 errors, 0 warnings).
- **Worktree Verification:** `git status --short` confirmed 0 files were created, modified, or emitted by the check.

---

## 6. Audit Findings & Classifications

### [P1 — High] F-01: Permissive and Rounding-Prone `pricesAreEqual` Implementation
- **Location:** `backend/src/routes/mobile.validation.ts:125-131`
- **Evidence:** `parseFloat()` parses strings with trailing non-numeric characters (e.g. `"100.00abc"` $\rightarrow$ `100`). Furthermore, `.toFixed(2)` coerces distinct sub-cent values to equal strings (e.g. `"100.501"` and `"100.504"` both yield `"100.50"`), and evaluates `-0` as `"-0.00"` $\ne$ `"0.00"`.
- **Phase C Impact:** Used-phone registration depends on strict price equality between `cost_price` and `purchase_price`. While non-blocking for Phase B (no registration endpoint is active in Phase B), this must be repaired before Phase C registration.
- **Recommended Fix (Phase C):** Use strict regex format validation (`/^\d+(\.\d{1,2})?$/`) and compare normalized scaled integers (cents/paisas) or trimmed canonical decimal strings.

### [P2 — Medium] F-02: Broad Staff Role Fallback in `authorizePermission` for Action Access
- **Location:** `backend/src/routes/mobile.routes.ts:82` and `backend/src/auth.ts:313-322`
- **Evidence:** `hasActionAccess` in `auth.ts` falls back to `true` for all staff roles (`SALESMAN`, `CASHIER`, `STAFF`, `MANAGER`, `ACCOUNTANT`) if `allowed_actions` is empty.
- **Phase C Impact:** In Phase C, relying solely on `authorizePermission(identity, 'inventory', 'inventory:edit')` without requiring `isBranchAdmin` or an explicit action check would inadvertently allow non-admin staff with empty action arrays to execute mobile writes.
- **Recommended Fix (Phase C):** Restrict mobile mutation endpoints to `isBranchAdmin(identity)` or enforce explicit default-deny action checks (similar to `authorizeProductMutation`).

### [P2 — Medium] F-03: `isImeiTaken` and `isVoucherTaken` Use Pool-Level Client
- **Location:** `backend/src/repositories/mobile.repo.ts:174-198`
- **Evidence:** `this.pool.query(...)` acquires a separate connection from the pool.
- **Phase C Impact:** Calling these checks inside an atomic registration transaction (`client.query('BEGIN')`) would cause the preflight checks to run outside the transaction's isolation snapshot.
- **Recommended Fix (Phase C):** Extend signatures to accept optional `client?: PoolClient`:
  ```typescript
  async isImeiTaken(organizationId: string, imei: string, client?: PoolClient): Promise<boolean>
  ```

### [P3 — Low] F-04: Unused Instantiated `repo` in `buildMobileRouter`
- **Location:** `backend/src/routes/mobile.routes.ts:46`
- **Evidence:** `const repo = new MobileRepo(pool);` is instantiated but not referenced by `/health`.
- **Phase C Impact:** None. Clean scaffold for Phase C handlers.

### [INFO] I-01: Health Endpoint Involves PostgreSQL via `buildAuthMiddleware`
- **Location:** `backend/src/routes/mobile.routes.ts:43, 100` and `backend/src/auth.ts:420`
- **Evidence:** `buildAuthMiddleware` executes a live SQL query against `users`.
- **Impact:** Confirms that `/api/mobiles/health` cannot be probed in a zero-database audit environment.

### [INFO] I-02: Phase A.3 and Phase B Markdown Reports Missing on Disk
- **Location:** `claude/mobile-inventory-phase-a3-final-design.md`
- **Evidence:** The `claude/` directory was absent prior to this audit. Verified directly against source code and git history.

---

## 7. Audit Impact & Final Verdict

### Phase C Progression Assessment
- **Does Migration 037 block Phase C?** **NO.** The schema is robust, fully indexed, enforces foreign keys, strictly bounds statuses to `IN_STOCK | INSPECTION | SOLD`, and completely omits the rejected `cnic_copy_attached` field.
- **Do the findings block Phase C commencement?** **NO.** The findings (F-01, F-02, F-03) reside in validation and repository helper logic that is **not yet active** in Phase B. They must be addressed during the implementation of Phase C route handlers.

### Verdict
**PASS WITH FINDINGS**

- Phase B successfully establishes the 5-table schema foundation and backend routing scaffolding.
- Zero TypeScript compiler errors (`tsc --noEmit` passed).
- Gate 3 and Gate 4 remain strictly **CLOSED** (migration 037 has not been executed; no database has been modified).
- Findings F-01 through F-03 are prioritized for resolution during Phase C implementation.
- No application source code was modified during this audit.
- No commit, tag, push, or deployment occurred.
