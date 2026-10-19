# Niazi Mobile Inventory — Release Blocker Remediation Report

**Date:** 2026-10-19  
**Task Type:** Scoped Source-Code Remediation & Automated Test Authoring  
**Author:** AI Quality Assurance & Software Engineering  
**Reference Audit:** `claude/mobile-inventory-release-readiness-audit.md`  

---

## Executive Summary

| Remediation Item | Status | Key Evidence / Results |
| :--- | :--- | :--- |
| **Gate 0: Baseline Verification** | **VERIFIED** | Clean match with `feature/apply-home-pc-changes` at HEAD `6ef4318491be675cef4ccd7c40f61b618bd73702`. |
| **DEF-01: Express 5 Parameter Typing** | **RESOLVED** | Explicit string narrowing applied in `mobile.routes.ts`; backend `tsc` compiles with code 0. |
| **SEC-01: Organization Context Scoping** | **RESOLVED** | Removed all 9 occurrences of `NIAZI_ORGANIZATION_ID` in `mobile.repo.ts`. Organization context propagated from JWT session; branch ownership verified. |
| **DEF-02: PostgreSQL 23505 Error Mapping** | **RESOLVED** | Constraint-specific mapping implemented in `mobile.repo.ts` and `mobile.routes.ts`. Duplicate IMEI, voucher, and device ID race conditions map to HTTP 409 Conflict. |
| **DEF-F01: Monetary Validation Bounds** | **RESOLVED** | Strict `parseExactPaisa` enforces 2 decimals, rejects sub-cents and empty strings, and validates `NUMERIC(12,2)` ceiling (`MAX_MONETARY_PAISAS = 999_999_999_999`). |
| **DEF-03: PATCH Field Allowlist** | **RESOLVED** | `PATCH /:id` rejects unexpected or immutable fields with HTTP 400 Bad Request. |
| **Gate 3: Frontend Type Mismatch** | **RESOLVED** | `PhysicalBodyGrade` in `frontend/src/features/mobiles/types/mobile.types.ts` aligned with migration 037 (`'GOOD'`); frontend `tsc` compiles with code 0. |
| **Gate 2: Automated Regression Tests** | **COMPLETED** | Created `backend/src/__tests__/mobile-inventory.test.ts`. 40 unit and regression tests executed: **40 passed, 0 failed**. |
| **Gate 4: Database / Migration Operations** | **BLOCKED (SAFE)** | No disposable database configured (`TEST_DATABASE_URL` absent). Zero migrations or live DB tests run against `niazi_mobile_mart`. |
| **Final Remediation Verdict** | **REMEDIATION COMPLETE — READY FOR RE-AUDIT** | Scoped code fixes complete; implementation ready for isolated database verification. |

---

## 1. Repository & Baseline Verification (Gate 0)

- **Repository Root:** `D:\niazi mobile mart`
- **Active Branch:** `feature/apply-home-pc-changes`
- **HEAD Commit SHA:** `6ef4318491be675cef4ccd7c40f61b618bd73702`
- **Commit Subject:** `chore(release): prepare v1.3.43`
- **Worktree Status:**
  - 3 tracked modified files: `backend/src/server.ts`, `frontend/src/app/router/shopAdminRoutes.tsx`, `frontend/src/constants/navigation/shop-admin-navigation.ts`
  - Untracked files: `backend/src/__tests__/mobile-inventory.test.ts`, `backend/src/repositories/mobile.repo.ts`, `backend/src/routes/mobile.routes.ts`, `backend/src/routes/mobile.validation.ts`, `claude/`, `frontend/src/features/mobiles/`, `frontend/src/pages/dashboard/shop-admin/*`, `src-tauri/migrations/postgres/037_mobile_inventory_foundation.sql`.
- **Integrity Preservation:** Pre-existing UI files, earlier audit reports, and the `shelter` directory remain 100% preserved. Zero destructive git commands (`reset`, `clean`, `restore`, `stash`, `checkout`) were executed.

---

## 2. Remediated Defects & Code Changes (Gate 1 & Gate 3)

### 2.1 DEF-01: Express 5 Route Parameter Typing
- **Problem:** In `@types/express` v5, `req.params.id` has type `string | string[]`. Passing this directly to `repo.getMobileDevice` and `repo.getMobilePaperwork` caused TypeScript compilation errors `TS2345` and `TS2322`.
- **Correction:** In `backend/src/routes/mobile.routes.ts`:
  - Lines 586, 621, 666: Narrowed with `typeof req.params.id === 'string' ? req.params.id : String(req.params.id ?? '')`.
- **Verification:** Backend `npx tsc --noEmit` compiles cleanly with exit code 0.

### 2.2 SEC-01: Authenticated Organization Context & Branch Scoping
- **Problem:** `MobileRepo` previously hardcoded `NIAZI_ORGANIZATION_ID` across 9 locations, ignoring `identity.organization_id` from the JWT session and allowing potential cross-tenant or hardcoded assumptions.
- **Corrections in `backend/src/repositories/mobile.repo.ts`:**
  - Removed `import { NIAZI_ORGANIZATION_ID } from '../auth';`.
  - Added `organization_id: string;` to `RegisterMobileDeviceInput`, `ListMobileDevicesFilter`, and `PatchMobileDeviceInput`.
  - Updated `writeAuditEntry` to accept and write `opts.organizationId`.
  - Updated `registerMobileDeviceTx` to use `input.organization_id` for device, IMEI, paperwork, inspection, movements, and audit log.
  - Updated `listMobileDevices`, `getMobileDevice`, `getMobilePaperwork`, and `patchMobileDevice` to require and query by `organization_id`.
  - Added `isBranchInOrganization(organizationId: string, branchId: string): Promise<boolean>` to verify that a target branch belongs to the authenticated organization.
- **Corrections in `backend/src/routes/mobile.routes.ts`:**
  - `resolveWriteBranchId` and `resolveReadBranchId` made async; when called by an Org Admin, they verify `await repo.isBranchInOrganization(identity.organization_id, branchId)`. If false, requests fail-closed with `403 Forbidden`.
  - All repository method calls now propagate `identity.organization_id`.

### 2.3 DEF-02: PostgreSQL 23505 Uniqueness Error Mapping
- **Problem:** In concurrent submission races, raw PostgreSQL `23505 (unique_violation)` errors were unhandled by `MobileRepo` and `handleMobileError`, returning unhandled `500 Internal Server Error`.
- **Corrections:**
  - In `backend/src/repositories/mobile.repo.ts` (lines 605–635):
    - Added error inspection for `pgErr.code === '23505'`.
    - Violated constraint `mobile_imei_identifiers_organization_id_imei_key` $\rightarrow$ throws `MobileRepoError('IMEI_ALREADY_REGISTERED: ...', 409)`.
    - Violated constraint `idx_mobile_paperwork_branch_voucher` $\rightarrow$ throws `MobileRepoError('VOUCHER_ALREADY_REGISTERED: ...', 409)`.
    - Violated constraint `mobile_purchase_paperwork_device_id_key` $\rightarrow$ throws `MobileRepoError('DEVICE_RECORD_CONFLICT: ...', 409)`.
    - Other unique constraint failures $\rightarrow$ throws `MobileRepoError('UNIQUE_CONSTRAINT_VIOLATION: ...', 409)`.
  - In `backend/src/routes/mobile.routes.ts` (`handleMobileError`):
    - Added matching constraint mapping to guarantee consistent HTTP 409 responses without exposing raw database queries, tables, or sensitive values.

### 2.4 DEF-F01: Monetary Range & Strict Parsing Bounds
- **Problem:** `toPaisas()` previously used `Math.round(n * 100)` on loose numbers, coercing sub-cents (`100.501` to `100.50`) and empty strings (`""` to `0`). Furthermore, values exceeding PostgreSQL `NUMERIC(12,2)` (10 integer digits) were not guarded.
- **Corrections in `backend/src/routes/mobile.validation.ts`:**
  - Exported `MAX_MONETARY_PAISAS = 999_999_999_999` (Rs 9,999,999,999.99).
  - In `parseExactPaisa(value: unknown)`:
    - Enforced strict regex `/^\d+(\.\d{1,2})?$/`.
    - Checked integer length `rupees.length <= 10`.
    - Checked `total <= MAX_MONETARY_PAISAS`.
    - Maintained IEEE-754 micro-drift tolerance (1e-9) for floating-point calculations like `0.1 + 0.2 === 0.30`.
    - Rejects empty strings, whitespace, negative numbers, sub-cents, and trailing non-digits.

### 2.5 DEF-03: PATCH Field Allowlist Enforcement
- **Problem:** `PATCH /:id` silently ignored unknown fields rather than rejecting unknown or immutable parameters.
- **Correction in `backend/src/routes/mobile.routes.ts`:**
  - Defined `ALLOWED_PATCH_BODY_KEYS = new Set(['branch_id', 'status', 'expected_sale_price', 'pta_status', 'notes'])`.
  - Any request containing keys outside this set is rejected with `400 Bad Request` and a descriptive message naming the disallowed field(s).

### 2.6 Gate 3: Frontend PhysicalBodyGrade Alignment
- **Problem:** `frontend/src/features/mobiles/types/mobile.types.ts:5` defined `PhysicalBodyGrade = 'PRISTINE' | 'MINOR_SCRATCHES' | 'HEAVY_WEAR' | 'DENTED'`, conflicting with `AddMobileForm.tsx:61` which used `'GOOD'`, causing `npx tsc --noEmit` on `frontend` to fail.
- **Correction:** Aligned `mobile.types.ts` to `export type PhysicalBodyGrade = 'PRISTINE' | 'GOOD' | 'HEAVY_WEAR' | 'DENTED';` matching migration 037 line 130 and backend validation.
- **Verification:** Frontend `npx tsc --noEmit` compiles cleanly with exit code 0.

---

## 3. Automated Regression Test Suite (Gate 2)

**File Created:** `backend/src/__tests__/mobile-inventory.test.ts` (635 lines)  
**Runner:** Node.js native test runner (`node --test dist/__tests__/mobile-inventory.test.js`)  
**Execution Command:** `npm run build && node --test dist/__tests__/mobile-inventory.test.js`  
**Execution Results:** 10 test suites, 40 tests, **40 passed, 0 failed, 0 errors** (Duration: 6.8s).

### Test Coverage Breakdown:
1. **Monetary Validation & Normalization (11 tests):**
   - Valid integer and decimal amounts (`100`, `"100.00"`, `285000`, `"285000.00"`).
   - Decimal amounts with 1 and 2 places (`100.5`, `"100.50"`, `0.99`).
   - Zero and negative zero handling (`0`, `-0`, `"0.00"`).
   - Sub-cent rejection (`100.501`, `"100.504"`, `"100.509"`).
   - Malformed string rejection (`"100.50foo"`, `"foo100"`, `"100..50"`).
   - Empty/whitespace string rejection (`""`, `"   "`).
   - Negative amount rejection (`-100`, `"-100"`, `"-0.01"`).
   - Non-finite and type rejection (`NaN`, `Infinity`, `null`, `undefined`, `{}`).
   - IEEE-754 drift handling (`0.1 + 0.2` equal to `0.30`).
   - Maximum `NUMERIC(12,2)` amount acceptance (`9999999999.99`).
   - Numerical overflow rejection (`10000000000.00`, `99999999999.00`).
2. **IMEI & CNIC Validation (5 tests):**
   - Valid 15-digit IMEI strings accepted.
   - Non-15 digit, alphabetic, empty, and numeric types rejected.
   - Pakistani CNIC format `DDDDD-DDDDDDD-D` accepted.
   - Missing dashes, wrong digit counts, and letters rejected.
   - `isNonBlankString` verified for non-empty content.
3. **Supplier Linkage Rules (4 tests):**
   - USED phone rejects `supplier_id`.
   - USED phone accepts absent `supplier_id`.
   - NEW phone allows optional `supplier_id`.
   - NEW phone rejects blank/whitespace `supplier_id`.
4. **Explicit Write Authorization (6 tests):**
   - `ADMIN` and `SHOP_ADMIN` pass write authorization.
   - Non-admin staff with explicit `inventory:edit` passes.
   - Non-admin staff with wildcard `*` passes.
   - Non-admin staff with EMPTY `allowed_actions: []` is **default-denied (403)**.
   - Non-admin staff with unrelated actions (`pos:sale`) is denied (403).
   - Unauthenticated request is rejected (401).
5. **Organization & Branch Scoping (2 tests):**
   - `SHOP_ADMIN` branch locked to JWT claim; ignores request body branch.
   - Org admin branch verification queries `branches` table by `organization_id`.
6. **PostgreSQL 23505 Error Mapping (6 tests):**
   - Duplicate IMEI constraint maps to 409 Conflict (`IMEI_ALREADY_REGISTERED`).
   - Duplicate voucher constraint maps to 409 Conflict (`VOUCHER_ALREADY_REGISTERED`).
   - Duplicate device ID maps to 409 Conflict (`DEVICE_RECORD_CONFLICT`).
   - Generic unique constraint maps to 409 Conflict (`UNIQUE_CONSTRAINT_VIOLATION`).
   - Unrelated database error maps to 500 without leaking raw details.
   - `MobileRepoError` preserves custom statusCode (e.g. 422).
7. **Transaction Integrity & Rollback Guarantee (1 test):**
   - Verified that on query failure during registration, `ROLLBACK` is executed, no `COMMIT` occurs, and client is released in `finally`.
8. **Fail-Closed Paperwork Confidentiality (2 tests):**
   - Missing device paperwork rolls back and returns null.
   - Audit write failure triggers `ROLLBACK` and throws without returning paperwork data.
9. **PATCH Field Restrictions (2 tests):**
   - Permitted transitions: `IN_STOCK <-> INSPECTION` allowed; `SOLD` terminal.
   - Disallowed and immutable fields (`cost_price`, `condition`, `imei1`) rejected.
10. **Disposable Database Verification Gate (1 test):**
    - Verifies that in the absence of a disposable test database, live database tests are cleanly gated and not run against `niazi_mobile_mart`.

---

## 4. Verification Commands & Outputs (Gate 5)

| Command | Working Directory | Exit Code | Output Summary |
| :--- | :--- | :--- | :--- |
| `npm run build` | `backend/` | 0 | TypeScript build clean (`dist/` generated). |
| `npx tsc --noEmit` | `backend/` | 0 | 0 errors. |
| `npx tsc --noEmit` | `frontend/` | 0 | 0 errors. |
| `node --test dist/__tests__/mobile-inventory.test.js` | `backend/` | 0 | 40 passed, 0 failed, 10 suites passed. |
| `git diff --check` | Root | 0 | Clean diff formatting; zero whitespace/conflict errors. |
| `git status --short` | Root | 0 | Expected tracked modified & untracked files confirmed. |

---

## 5. Database & Migration Status (Gate 4)

- **Environment Target:** `TEST_DATABASE_URL` is undefined. `DATABASE_URL` points to `niazi_mobile_mart` on `127.0.0.1`.
- **Database Safety Respected:**
  - Zero connections were made to `niazi_mobile_mart` during tests or remediation.
  - Migration 037 was **NOT** executed against the development database.
  - Database-backed integration tests were gated and skipped.
- **Prerequisite for Final Database Verification:**
  - Provision an isolated disposable PostgreSQL database.
  - Set `TEST_DATABASE_URL=postgres://user:pass@127.0.0.1:5432/niazi_mobile_mart_test_disposable`.
  - Apply migration 037 via the migration runner and verify schema constraints.

---

## 6. Remediation Verdict & Next Action (Gate 6)

### Verdict: **`REMEDIATION COMPLETE — READY FOR RE-AUDIT`**

### Summary of State:
- All source-code compilation errors, security flaws, monetary validation defects, error-mapping gaps, and type mismatches identified in the release-readiness audit have been completely resolved.
- A comprehensive 40-test automated regression suite has been implemented and passes with 100% success.
- Both backend and frontend TypeScript compilations pass with zero errors.
- Pre-existing work, uncommitted files, and the `shelter` directory remain intact.
- Production deployment remains prohibited until the disposable database verification gate is executed in the subsequent audit.

---

## 7. Modified & Created File List

```text
Tracked Modified Files:
  backend/src/server.ts
  frontend/src/app/router/shopAdminRoutes.tsx
  frontend/src/constants/navigation/shop-admin-navigation.ts

Remediated & Newly Authored Files:
  backend/src/__tests__/mobile-inventory.test.ts            (Authoring: 40 automated regression tests)
  backend/src/repositories/mobile.repo.ts                   (Fixes: SEC-01 org scoping, DEF-02 23505 mapping, isBranchInOrganization)
  backend/src/routes/mobile.routes.ts                       (Fixes: DEF-01 Express 5 typing, SEC-01 org propagation, DEF-02 error mapping, DEF-03 allowlist)
  backend/src/routes/mobile.validation.ts                   (Fixes: DEF-F01 strict parseExactPaisa, NUMERIC(12,2) bounds)
  frontend/src/features/mobiles/types/mobile.types.ts       (Fixes: Gate 3 PhysicalBodyGrade 'GOOD' alignment)
  claude/mobile-inventory-release-blocker-remediation.md   (Remediation report)

Preserved Untracked Work:
  claude/mobile-inventory-phase-b-findings-review.md
  claude/mobile-inventory-phase-b-verification-audit.md
  claude/mobile-inventory-release-readiness-audit.md
  frontend/src/features/mobiles/* (17 UI components & forms)
  frontend/src/pages/dashboard/shop-admin/AddMobilePage.tsx
  frontend/src/pages/dashboard/shop-admin/MobileInventoryPage.tsx
  src-tauri/migrations/postgres/037_mobile_inventory_foundation.sql
  shelter/
```

---
*Report generated and verified in `D:\niazi mobile mart` on 2026-10-19.*
