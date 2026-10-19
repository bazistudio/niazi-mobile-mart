# Niazi Mobile Mart — Mobile Inventory Release-Readiness Audit Report

**Date:** 2026-10-19  
**Audit Type:** Release-Readiness Forensic Audit & Verification (Phase B & Phase C)  
**Author:** AI Quality Assurance & Release Engineering  
**Release Target:** Mobile Inventory Module (Foundation & TypeScript Online Authority)  

---

## Executive Summary

| Audit Item | Status | Note |
| :--- | :--- | :--- |
| **Gate 0: Repository Baseline** | **VERIFIED** | Clean match with `feature/apply-home-pc-changes` at HEAD `6ef4318491be675cef4ccd7c40f61b618bd73702`. |
| **Gate 1: Static, Type & Security Audit** | **DEFECTS FOUND** | Monetary validation flaw, hardcoded org constant, Express 5 type mismatch, unmapped 23505 race error. |
| **Gate 2: Test & Migration Infrastructure** | **GAP IDENTIFIED** | No mobile unit/integration test suites exist in `backend/src/__tests__`. |
| **Gate 3: Disposable Database Verification** | **BLOCKED** | No isolated disposable DB configured; only primary DB `niazi_mobile_mart` exists. |
| **Gate 4: Authorized Verification Checks** | **PARTIAL** | Backend static typecheck & monetary tests passed after minimal fix; DB tests & frontend blocked. |
| **Gate 5: Defects & Corrections** | **DOCUMENTED** | 2 minimal code corrections applied and verified; remaining defects documented. |
| **Gate 6: Release-Readiness Verdict** | **FAIL — NOT READY** | Critical release gates remaining blocked; deployment is prohibited. |

---

## 1. Repository & Worktree Verification (Gate 0)

### 1.1 Baseline Identification
- **Repository Root:** `D:\niazi mobile mart`
- **Active Branch:** `feature/apply-home-pc-changes`
- **Starting HEAD Commit SHA:** `6ef4318491be675cef4ccd7c40f61b618bd73702`
- **Ending HEAD Commit SHA:** `6ef4318491be675cef4ccd7c40f61b618bd73702`
- **Target Commit Message:** `chore(release): prepare v1.3.43`

### 1.2 Git Status & Worktree Preservation
```text
 M backend/src/server.ts
 M frontend/src/app/router/shopAdminRoutes.tsx
 M frontend/src/constants/navigation/shop-admin-navigation.ts
?? backend/src/repositories/mobile.repo.ts
?? backend/src/routes/mobile.routes.ts
?? backend/src/routes/mobile.validation.ts
?? claude/
?? frontend/src/features/mobiles/
?? frontend/src/pages/dashboard/shop-admin/AddMobilePage.tsx
?? frontend/src/pages/dashboard/shop-admin/MobileInventoryPage.tsx
?? src-tauri/migrations/postgres/037_mobile_inventory_foundation.sql
```
- **Pre-existing Modified Files:** Preserved unchanged.
- **Untracked UI & Phase B/C Files:** Preserved intact.
- **Backup Directory `shelter`:** Unmodified and preserved.
- **Prohibited Git Actions:** Zero calls to `git reset`, `git clean`, `git checkout --`, `git restore`, `git stash`, or `git add .`.

---

## 2. Complete File Inventory & Pre-Existing Work Preservation

| File Path | Status | Origin / Phase | Preservation Confirmation |
| :--- | :--- | :--- | :--- |
| `backend/src/server.ts` | Tracked Modified | Route mounting `/api/mobiles` & `/api/v1/mobiles` | Preserved |
| `frontend/src/app/router/shopAdminRoutes.tsx` | Tracked Modified | Mobile route declarations (`mobiles`, `mobiles/add`) | Preserved |
| `frontend/src/constants/navigation/shop-admin-navigation.ts` | Tracked Modified | Mobile Inventory sidebar item | Preserved |
| `backend/src/repositories/mobile.repo.ts` | Untracked (949 lines) | Phase B/C Data Access Layer & Transactions | Preserved |
| `backend/src/routes/mobile.routes.ts` | Untracked (744 lines) | Phase C API Endpoints & Auth Guards | Corrected typing; preserved |
| `backend/src/routes/mobile.validation.ts` | Untracked (232 lines) | Phase B/C Validation & Domain Rules | Corrected monetary; preserved |
| `src-tauri/migrations/postgres/037_mobile_inventory_foundation.sql` | Untracked (193 lines) | Phase B 5-Table Foundation Schema | Preserved; not executed |
| `frontend/src/features/mobiles/*` | Untracked (17 files) | Phase 1 UI components & forms | Preserved |
| `frontend/src/pages/dashboard/shop-admin/*` | Untracked (2 files) | Phase 1 UI wrapper pages | Preserved |
| `claude/` reports | Untracked | Forensic audits & reviews | Preserved |

---

## 3. Static, Type, Test, Migration, and Build Commands Executed

| # | Exact Command | Working Directory | Command Classification | Exit Code | Result Summary |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | `git status --short; git rev-parse HEAD; git branch --show-current` | Repo root | 1. Read-only static check | 0 | Verified baseline matches expected SHA and branch. |
| 2 | `git diff --check` | Repo root | 1. Read-only static check | 0 | Clean diff formatting; no conflict markers or whitespace issues. |
| 3 | `npx tsc --noEmit` | `backend/` | 1. Read-only static check | 1 | **Failed:** 3 type errors in `mobile.routes.ts` (`req.params.id` Express 5 union type). |
| 4 | `npx tsc --noEmit` | `frontend/` | 1. Read-only static check | 1 | **Failed:** 1 type error in `AddMobileForm.tsx:61` (`'GOOD'` not in `PhysicalBodyGrade`). |
| 5 | `node scratch/monetary_test.js` (Initial) | Repo root | 2. Pure unit test | 0 | **Exposed defect F-01:** Sub-cents and empty strings accepted and equated to valid prices. |
| 6 | `node scratch/domain_validation_test.js` | Repo root | 2. Pure unit test | 0 | Validated IMEI, CNIC, supplier linkage, and status transition rules. |
| 7 | `npx tsc --noEmit` (Rerun) | `backend/` | 1. Read-only static check | 0 | **Passed:** Backend TypeScript compiles cleanly after Express 5 param fix. |
| 8 | `node scratch/monetary_test.js` (Rerun) | Repo root | 2. Pure unit test | 0 | **Passed:** Strict `parseExactPaisa` passed 10/10 edge cases. |

---

## 4. Disposable Database Verification & Migration Status (Gate 3)

### 4.1 Evaluation of Database Environment
- Inspection of `backend/.env` confirmed:
  - Host: `127.0.0.1`
  - Database: `niazi_mobile_mart`
  - Role: Primary development / live database.
- Inspection of environment variables confirmed:
  - `TEST_DATABASE_URL`: **Undefined / Missing**
  - `DISPOSABLE_DATABASE_URL`: **Undefined / Missing**
- Verification of disposability: **FAILED**. No database in the environment could be proven to be isolated, disposable, or safe to truncate/migrate.

### 4.2 Gate 3 Halt Decision
Pursuant to Gate 3 mandatory instructions:
> *"If a disposable database cannot be proven, **STOP all database operations**. Do not connect, migrate, truncate, drop, seed, or reset any database. Continue with static checks and report the blocked checks."*

**Action taken:**
- Zero database connections established.
- Zero migrations executed against `niazi_mobile_mart` or any other database.
- Migration `037_mobile_inventory_foundation.sql` was evaluated strictly via static code review.
- Database-backed integration tests were marked as **BLOCKED BY ENVIRONMENT**.

---

## 5. Security & Organization/Branch Isolation Findings (Gate 1.C & 1.E)

### 5.1 Authentication & Authorization Verification
1. **Authentication:**
   All six Mobile Inventory endpoints (`POST /`, `GET /`, `GET /imei-check`, `GET /:id`, `GET /:id/paperwork`, `PATCH /:id`) are mounted behind `buildAuthMiddleware(pool)` at line 81 of `mobile.routes.ts`. Anonymous callers receive `401 Unauthorized`.
2. **Read Authorization (`requireInventoryView`):**
   Requires `identity` and validates `authorizePermission(identity, 'inventory', null)`. Non-inventory staff receive `403 Forbidden`.
3. **Write Authorization (`requireInventoryWrite`):**
   - Validates `isBranchAdmin(identity)` first (passes `SHOP_ADMIN` and `ADMIN`).
   - For non-admin staff, checks `profile.allowed_actions` for explicit `'*'` or `'inventory:edit'`.
   - If `allowed_actions` is empty, **default-denies** with `403 Forbidden`.
   - **Verification:** Successfully resolves Finding F-02 from the Phase B audit by avoiding the legacy fallback in `hasActionAccess()`.
4. **Branch Isolation:**
   - **Branch Admin (`SHOP_ADMIN`):** Resolves branch from `identity.branch_id`. Any `branch_id` passed in request body (`POST`, `PATCH`) or query string (`GET /`, `GET /:id`, `GET /:id/paperwork`) is completely ignored. Branch admins cannot operate across branch boundaries.
   - **Staff:** Bound to `identity.branch_id`.

### 5.2 Critical Finding SEC-01 — Hardcoded Organization Constant
- **Evidence:** `backend/src/repositories/mobile.repo.ts`:
  - Line 32: `import { NIAZI_ORGANIZATION_ID } from '../auth';`
  - Line 334: `organizationId: NIAZI_ORGANIZATION_ID,` in `writeAuditEntry`
  - Line 389: `const orgId = NIAZI_ORGANIZATION_ID;` in `registerMobileDeviceTx`
  - Line 639: `[NIAZI_ORGANIZATION_ID, filter.branch_id]` in `listMobileDevices`
  - Line 716: `[deviceId, NIAZI_ORGANIZATION_ID, branchId]` in `getMobileDevice`
  - Line 769: `[deviceId, NIAZI_ORGANIZATION_ID, branchId]` in `getMobilePaperwork`
  - Line 833: `[input.device_id, NIAZI_ORGANIZATION_ID, input.branch_id]` in `patchMobileDevice`
- **Violation:**
  Gate 1.C explicitly mandates:
  > *"No request-supplied organization ID or hardcoded organization constant can override the authenticated organization."*
- **Impact:**
  `MobileRepo` ignores `identity.organization_id` from the JWT session. While the current single-tenant deployment uses a fixed organization ID, hardcoding this constant in the repository breaks multi-tenant architectural integrity and bypasses authenticated identity validation.

### 5.3 Paperwork Confidentiality (Gate 1.E)
1. **Endpoint Isolation:**
   Sensitive seller fields (`seller_cnic`, `father_name`, `seller_phone`, `seller_address`) are selected **only** in `getMobilePaperwork`. They are omitted from `listMobileDevices` (`GET /`), `getMobileDevice` (`GET /:id`), and `checkImeiAvailability` (`GET /imei-check`).
2. **Transactional Fail-Closed Audit:**
   `getMobilePaperwork` executes inside an atomic PostgreSQL transaction:
   ```text
   BEGIN -> SELECT paperwork -> writeChangeLogEntry(MOBILE_PAPERWORK_ACCESSED) -> COMMIT
   ```
   If the audit write fails, transaction rolls back, returns `500`, and **no seller paperwork is released**.
3. **Audit Payload Sanitization:**
   The `MOBILE_PAPERWORK_ACCESSED` audit event payload contains only `{ device_id, branch_id, voucher_no, accessed_by }`. Sensitive personal data is strictly excluded from change log payloads.

---

## 6. Monetary Validation & Transaction Integrity Findings (Gate 1.B & 1.D)

### 6.1 Finding F-01 Review — Monetary Normalization Flaws
Prior to correction, `backend/src/routes/mobile.validation.ts` implemented `toPaisas(value)` using `Number(value)` and `Math.round(n * 100)`.

**Pre-Correction Test Results:**
- `pricesAreEqual(100.501, 100.50)` $\rightarrow$ `true` (**DEFECT**: Sub-cent value rounded up to match).
- `pricesAreEqual("100.501", "100.504")` $\rightarrow$ `true` (**DEFECT**: Unequal prices evaluated as equal).
- `pricesAreEqual("", 0)` $\rightarrow$ `true` (**DEFECT**: Empty string coerced to zero).
- `pricesAreEqual("   ", 0)` $\rightarrow$ `true` (**DEFECT**: Whitespace string coerced to zero).
- `isNonNegativePrice("")` $\rightarrow$ `true` (**DEFECT**: Empty string accepted as valid non-negative price).

**Minimal Correction Applied:**
Implemented `parseExactPaisa(value: unknown): number | null` enforcing strict 2-decimal string regex (`/^\d+(\.\d{1,2})?$/`) with IEEE-754 micro-drift tolerance (1e-9) for calculations like `0.1 + 0.2 === 0.30`.

**Post-Correction Rerun Results:**
- `pricesAreEqual(100.501, 100.50)` $\rightarrow$ `false` (Strictly rejected).
- `pricesAreEqual("100.501", "100.504")` $\rightarrow$ `false` (Strictly rejected).
- `pricesAreEqual("100.50foo", 100.50)` $\rightarrow$ `false` (Strictly rejected).
- `pricesAreEqual("", 0)` $\rightarrow$ `false` (Strictly rejected).
- `pricesAreEqual("   ", 0)` $\rightarrow$ `false` (Strictly rejected).
- `pricesAreEqual(0.1 + 0.2, 0.30)` $\rightarrow$ `true` (IEEE-754 drift handled).
- `pricesAreEqual(-0, 0)` $\rightarrow$ `true` (Signed zero matched).
- `pricesAreEqual(100, "100.00")` $\rightarrow$ `true` (Integer/string equivalence preserved).

### 6.2 Registration Transaction Integrity (Gate 1.D)
`registerMobileDeviceTx` operates on a single client connection:
```typescript
const client = await this.pool.connect();
try {
  await client.query('BEGIN');
  // 1. isImeiTaken (IMEI1, optional IMEI2)
  // 2. [USED] isVoucherTaken
  // 3. [NEW] Supplier active check
  // 4. INSERT mobile_devices
  // 5. INSERT mobile_imei_identifiers (IMEI1, optional IMEI2)
  // 6. [USED] INSERT mobile_purchase_paperwork
  // 7. INSERT mobile_inspection_records
  // 8. INSERT mobile_device_movements (ACQUIRED)
  // 9. writeChangeLogEntry (MOBILE_DEVICE_REGISTERED)
  await client.query('COMMIT');
  return deviceId;
} catch (err) {
  await client.query('ROLLBACK');
  throw err;
} finally {
  client.release();
}
```
- **Atomicity:** All 7 entities write in one transaction block. Client release is guaranteed in `finally`.
- **Finding DEF-02 (PostgreSQL 23505 Error Mapping):**
  Under concurrent race conditions where two requests pass preflight checks simultaneously, the second write will trip PostgreSQL unique constraint `mobile_imei_identifiers_organization_id_imei_key` or `idx_mobile_paperwork_branch_voucher` with SQLSTATE `23505`.
  `registerMobileDeviceTx` rethrows raw `pg` error. `handleMobileError` in `mobile.routes.ts` does not inspect SQLSTATE `23505`, resulting in an unhandled `500 Internal Server Error` instead of an HTTP `409 Conflict`.

### 6.3 PATCH Domain Integrity (Gate 1.F)
- **Allowed Update Fields:** `status`, `expected_sale_price`, `pta_status`, `notes`.
- **Immutable Fields:** `id`, `organization_id`, `branch_id`, `condition`, `cost_price`, `created_by`, `created_at`, `sale_id`, `supplier_id`, IMEIs, and paperwork cannot be updated.
- **Terminal State Enforcement:** `SOLD` status cannot be set via PATCH (rejected with 400). Status transition is restricted to `IN_STOCK <-> INSPECTION`.
- **Finding DEF-03 (PATCH Unknown Fields Silently Ignored):**
  `PATCH /:id` currently extracts permitted fields and ignores extra keys rather than returning `400 Bad Request` when disallowed keys (e.g. `cost_price`, `condition`, `imei1`) are supplied.

---

## 7. Migration 037 Schema Contract Verification (Gate 1.A)

Static analysis of `src-tauri/migrations/postgres/037_mobile_inventory_foundation.sql`:

1. **Table Definitions & Constraints:**
   - `mobile_devices`: Enforces `CHECK(length(id) = 36)`, `CHECK(cost_price >= 0)`, `CHECK(condition IN ('NEW', 'USED'))`, `CHECK(status IN ('IN_STOCK', 'INSPECTION', 'SOLD'))`.
   - `mobile_imei_identifiers`: Normalized 1:N IMEI storage. Enforces `CHECK(length(imei) = 15 AND imei ~ '^[0-9]{15}$')`, `UNIQUE(organization_id, imei)`.
   - `mobile_purchase_paperwork`: Enforces `UNIQUE(device_id)`, `UNIQUE(branch_id, voucher_no)`, `CHECK(purchase_price > 0)`, `CHECK(seller_cnic ~ '^\d{5}-\d{7}-\d$')`.
   - `mobile_inspection_records`: Enforces `UNIQUE(device_id)`, `CHECK(body_grade IN ('PRISTINE', 'GOOD', 'HEAVY_WEAR', 'DENTED'))`.
   - `mobile_device_movements`: Append-only movement log.
2. **Foreign Key Relationships:**
   - All tables enforce `REFERENCES organizations(id)` and `REFERENCES branches(id)`.
   - Cascade rules: All child tables use `ON DELETE RESTRICT` on `device_id` to prevent accidental orphaned cascades.
3. **Data Type Conventions:**
   - Monetary columns are typed as `NUMERIC(12,2)` in migration 037. (Existing core schema tables `products`, `sales`, `cash_movements` use `BIGINT` whole PKR integers).
   - `pg` driver returns `NUMERIC` as JavaScript string, which `MobileDeviceRow` correctly types as `cost_price: string`.

---

## 8. Defect Log & Corrective Actions (Gate 5)

| Defect ID | Severity | File & Location | Description | Status |
| :--- | :--- | :--- | :--- | :--- |
| **DEF-01** | **High** | `backend/src/routes/mobile.routes.ts:586, 621, 666` | Express 5 `@types/express` type conflict: `req.params.id` is typed as `string \| string[]`, failing `tsc --noEmit`. | **FIXED** (explicit string narrowing applied). |
| **DEF-F01** | **High** | `backend/src/routes/mobile.validation.ts:85-146` | Permissive `toPaisas` and `isNonNegativePrice` accepted sub-cent prices and empty strings. | **FIXED** (replaced with strict `parseExactPaisa` regex). |
| **DEF-UI01** | **Medium** | `frontend/src/features/mobiles/components/AddMobileForm.tsx:61` | Enum mismatch: Form uses `'GOOD'` but `mobile.types.ts` defines `PhysicalBodyGrade` as `'PRISTINE' \| 'MINOR_SCRATCHES' \| 'HEAVY_WEAR' \| 'DENTED'`. | **OPEN** (Deferred to Phase D frontend alignment). |
| **SEC-01** | **High** | `backend/src/repositories/mobile.repo.ts:32, 334, 389, 639...` | Hardcoded `NIAZI_ORGANIZATION_ID` constant used instead of `identity.organization_id`. | **OPEN** (Requires architectural refactor of repo inputs). |
| **DEF-02** | **Medium** | `backend/src/repositories/mobile.repo.ts:616` / `mobile.routes.ts:729` | Concurrent race condition tripping PostgreSQL `23505` returns unhandled `500` instead of `409 Conflict`. | **OPEN** (Requires SQLSTATE `23505` mapping in repo/routes). |
| **DEF-03** | **Low** | `backend/src/routes/mobile.routes.ts:662` | `PATCH /:id` silently ignores unknown fields instead of returning `400 Bad Request`. | **OPEN** (Allowlist check should reject unexpected keys). |
| **ENV-01** | **High** | Test Infrastructure | Missing disposable PostgreSQL test environment (`TEST_DATABASE_URL`). Migration 037 cannot be safely applied. | **OPEN** (Requires disposable database provisioning). |
| **TEST-01** | **High** | `backend/src/__tests__/` | Zero automated unit or integration tests exist for the Mobile Inventory module. | **OPEN** (Test suite required prior to production release). |

---

## 9. Skipped & Blocked Checks Summary

1. **Migration 037 Disposable DB Execution:**
   - *Status:* **BLOCKED BY ENVIRONMENT** (Gate 3).
   - *Reason:* No verified disposable database available. Connecting to `niazi_mobile_mart` was strictly avoided to protect development data integrity.
2. **Database-Backed Integration Tests:**
   - *Status:* **BLOCKED BY ENVIRONMENT** (Gate 4.D).
   - *Reason:* Relies on an isolated test database.
3. **Automated Mobile Inventory Test Suite:**
   - *Status:* **SKIPPED / GAP** (Gate 4.B).
   - *Reason:* No test files exist in `backend/src/__tests__` covering mobile inventory.
4. **Frontend Production Build:**
   - *Status:* **BLOCKED** (Gate 4.E).
   - *Reason:* Frontend TypeScript check fails on `AddMobileForm.tsx` due to Phase 1/Phase B enum divergence (`'MINOR_SCRATCHES'` vs `'GOOD'`). Phase D frontend integration is pending.

---

## 10. Release-Readiness Verdict & Next Actions (Gate 6)

### Verdict: **FAIL — NOT READY**

### Justification:
While the core backend architecture, transaction boundaries, and permission model are well-structured:
1. Migration 037 has not been executed or verified against an isolated disposable database.
2. Zero automated integration or unit tests exist for the Mobile Inventory module in the repository.
3. Security finding **SEC-01** (hardcoded `NIAZI_ORGANIZATION_ID` bypassing authenticated identity) remains unresolved.
4. Concurrency error handling (**DEF-02**) returns unhandled 500 errors on duplicate IMEI/voucher races.
5. Frontend TypeScript compilation fails, and Phase D frontend integration remains incomplete.

### Required Next Actions Before Release Re-Audit:
1. **Provision Disposable Database:** Establish a containerized or isolated PostgreSQL instance and supply `TEST_DATABASE_URL`.
2. **Execute Migration 037 in Isolation:** Verify table creation, constraints, and indexes using the disposable database runner.
3. **Resolve SEC-01:** Update `MobileRepo` method signatures (`registerMobileDeviceTx`, `listMobileDevices`, `getMobileDevice`, `getMobilePaperwork`, `patchMobileDevice`) to receive `organization_id` from `RequestIdentity`.
4. **Implement Concurrency Error Mapping (DEF-02):** Catch PostgreSQL error code `23505` and translate it to `409 Conflict` (`IMEI_ALREADY_REGISTERED` / `VOUCHER_ALREADY_REGISTERED`).
5. **Align Frontend Types (Phase D):** Update `PhysicalBodyGrade` in `frontend/src/features/mobiles/types/mobile.types.ts` to match migration 037 (`'PRISTINE' | 'GOOD' | 'HEAVY_WEAR' | 'DENTED'`).
6. **Author Test Suite (TEST-01):** Create `backend/src/__tests__/mobile-inventory.test.ts` covering registration, duplicate IMEI/voucher races, paperwork fail-closed access, branch isolation, and status transitions.

---

## 11. Production Deployment Confirmation

**Strict Release Boundary Maintained:**
- Production deployment was **NOT** executed.
- No production database was accessed, connected to, or altered.
- No Git commits, tags, pushes, or branch switches were performed.
- All pre-existing modified files, untracked work, and the `shelter` directory remain completely preserved.

---
*Report generated and verified in `D:\niazi mobile mart` on 2026-10-19.*
