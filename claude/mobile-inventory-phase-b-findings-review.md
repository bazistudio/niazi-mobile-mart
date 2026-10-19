# Niazi Mobile Mart — Mobile Inventory Phase B Findings Review
## Read-Only Deep Dive & Pre-Phase C Authorization Review

**Repository:** `D:\niazi mobile mart`  
**Current Branch:** `feature/apply-home-pc-changes`  
**Verified HEAD SHA:** `6ef4318491be675cef4ccd7c40f61b618bd73702`  
**Commit Subject:** `chore(release): prepare v1.3.43`  
**Audit Reference:** `claude/mobile-inventory-phase-b-verification-audit.md`  
**Review Date:** 2026-10-19  
**Review Type:** Deep-Dive Read-Only Findings Validation  

---

## 1. Verified Repository Baseline

```text
Repository Path : D:/niazi mobile mart
Branch          : feature/apply-home-pc-changes
HEAD Commit SHA : 6ef4318491be675cef4ccd7c40f61b618bd73702
Parent SHA      : 3daab7d83bd19182b0e842ec48d4c77ba2c35320
Commit Subject  : chore(release): prepare v1.3.43
Worktree Status : 3 modified files, 7 untracked files/directories (unchanged)
```

The repository baseline matches the expected v1.3.43 release candidate baseline. All pre-existing modified files (`backend/src/server.ts`, `frontend/src/app/router/shopAdminRoutes.tsx`, `frontend/src/constants/navigation/shop-admin-navigation.ts`) and untracked files (`frontend/src/features/mobiles/`, `backend/src/repositories/mobile.repo.ts`, `backend/src/routes/mobile.routes.ts`, `backend/src/routes/mobile.validation.ts`, `src-tauri/migrations/postgres/037_mobile_inventory_foundation.sql`) remain intact. The `shelter` backup folder is untouched.

---

## 2. Validation of Finding F-01 — Monetary Equality & Precision

### 2.1 File & Code Evidence
- **File:** `backend/src/routes/mobile.validation.ts`
- **Lines 125–131:**
```typescript
export function pricesAreEqual(a: unknown, b: unknown): boolean {
  const na = typeof a === 'string' ? parseFloat(a) : (typeof a === 'number' ? a : NaN);
  const nb = typeof b === 'string' ? parseFloat(b) : (typeof b === 'number' ? b : NaN);
  if (!Number.isFinite(na) || !Number.isFinite(nb)) return false;
  // Compare as fixed-point strings with 2 decimal places to avoid IEEE-754 drift.
  return na.toFixed(2) === nb.toFixed(2);
}
```

### 2.2 Deep-Dive Technical Findings
1. **Input Types:** The function accepts `unknown`. In Phase C request bodies, values can arrive as JSON numbers (e.g. `285000`) or strings (e.g. `"285000.00"`).
2. **Permissive String Parsing:** `parseFloat()` stops parsing at the first non-numeric character.
   - Example: `parseFloat("100.50foo")` $\rightarrow$ `100.5`.
   - Result: `pricesAreEqual("100.50foo", 100.50)` evaluates to `true`, unsafely accepting malformed input containing trailing characters.
3. **Unequal Sub-Cent Coercion:** `.toFixed(2)` rounds values with $>2$ decimal places.
   - Example: `(100.501).toFixed(2)` $\rightarrow$ `"100.50"` and `(100.504).toFixed(2)` $\rightarrow$ `"100.50"`.
   - Result: `pricesAreEqual("100.501", "100.504")` evaluates to `true` despite the values being mathematically unequal.
4. **Asymmetric Negative Zero Rounding:**
   - In JavaScript, `(0.001).toFixed(2)` yields `"0.00"`, but `(-0.001).toFixed(2)` yields `"-0.00"`.
   - Result: `pricesAreEqual(0.001, 0)` is `true`, while `pricesAreEqual(-0.001, 0)` is `false`.
5. **Database Numeric Precision vs. Application Convention:**
   - In existing migrations `001`–`036`, monetary columns (`products.sale_price`, `sales.total_amount`, `cash_movements.amount`, `repair_jobs.estimated_cost`) are **`BIGINT`** storing whole PKR integers (no paisas in physical cash retail).
   - In migration `037_mobile_inventory_foundation.sql:34-35, 97`, mobile prices are typed as **`NUMERIC(12,2)`**. PostgreSQL `pg` driver returns `NUMERIC` columns as JavaScript `string` to prevent binary floating-point precision loss.

### 2.3 Exact Acceptance Rule & Recommended Phase C Replacement
Values with $>2$ decimal places or non-numeric trailing characters must be **strictly rejected** by input validation rather than silently rounded.

```typescript
// Proposed Phase C Replacement:
export function parseExactPaisa(value: unknown): number | null {
  let str: string;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) return null;
    str = value.toString();
  } else if (typeof value === 'string') {
    str = value.trim();
  } else {
    return null;
  }
  // Enforce strictly 0, 1, or 2 decimal places with no trailing characters
  if (!/^\d+(\.\d{1,2})?$/.test(str)) return null;
  
  const [rupees, paisas = ''] = str.split('.');
  const paddedPaisas = (paisas + '00').slice(0, 2);
  const total = Number(rupees) * 100 + Number(paddedPaisas);
  return Number.isSafeInteger(total) ? total : null;
}

export function pricesAreEqual(a: unknown, b: unknown): boolean {
  const pa = parseExactPaisa(a);
  const pb = parseExactPaisa(b);
  if (pa === null || pb === null) return false;
  return pa === pb;
}
```

#### Test Matrix for Phase C:
| Test Input `a` | Test Input `b` | Expected Result | Reason |
| :--- | :--- | :--- | :--- |
| `285000` | `"285000.00"` | `true` | Exact equivalent integer/string |
| `"100.5"` | `100.50` | `true` | Equivalent decimal representation |
| `"100.50foo"` | `100.50` | `false` | Malformed string rejected |
| `"100.501"` | `"100.504"` | `false` | Sub-cent values rejected/unequal |
| `-100` | `-100` | `false` | Negative price rejected |
| `0` | `"0.00"` | `true` | Zero matches |

---

## 3. Validation of Finding F-02 — Authorization & Access Control

### 3.1 File & Code Evidence
- **Files:** `backend/src/routes/mobile.routes.ts` and `backend/src/auth.ts`
- **`mobile.routes.ts:82`:**
```typescript
const err = authorizePermission(identity, 'inventory', 'inventory:edit');
```
- **`auth.ts:266–288` (`authorizePermission`):**
```typescript
export function authorizePermission(identity: RequestIdentity, page: string | null, action: string | null): string | null {
  if (isAdmin(identity)) return null;
  if (page !== null && !hasPageAccess(identity.access_profile, page, identity.role)) {
    return `Access denied: You do not have permission to access page '${page}'`;
  }
  if (action !== null && !hasActionAccess(identity.access_profile, action, identity.role)) {
    return `Access denied: You do not have permission to execute action '${action}'`;
  }
  return null;
}
```
- **`auth.ts:313–322` (`hasActionAccess`):**
```typescript
function hasActionAccess(profile: StaffAccessProfile, action: string, role?: UserRole): boolean {
  if (profile && Array.isArray(profile.allowed_actions) && profile.allowed_actions.length > 0) {
    return profile.allowed_actions.some((a) => a === '*' || a === action);
  }
  const r = String(role || '').toUpperCase();
  if (r === 'SALESMAN' || r === 'CASHIER' || r === 'STAFF' || r === 'MANAGER' || r === 'ACCOUNTANT') {
    return true; // <-- Broad fallback
  }
  return false;
}
```

### 3.2 Trace of Authorization Behaviors across 6 Caller Scenarios

1. **Organization Admin (`identity.role === 'ADMIN'`):**
   - `isAdmin(identity)` returns `true` (`auth.ts:220`).
   - Read & Write: Bypasses checks and returns `null` (Allowed).
   - Behavior: **Correct.** Full organization-wide authority.
2. **Branch Admin (`identity.role === 'SHOP_ADMIN'`):**
   - `isAdmin(identity)` returns `true` (`auth.ts:222`).
   - Read & Write: Bypasses checks and returns `null` (Allowed).
   - Behavior: **Correct for own branch.** In Phase C, handlers must additionally enforce branch-scoping (`canAccessBranch(identity, branch_id)`).
3. **Staff with Explicit Inventory Write Permission (`allowed_pages: ['inventory']`, `allowed_actions: ['inventory:edit']`):**
   - Read: `hasPageAccess` matches `'inventory'`. Action check skipped. Returns `null` (Allowed).
   - Write: `hasActionAccess` matches `'inventory:edit'`. Returns `null` (Allowed).
   - Behavior: **Correct.** Explicit grant succeeds.
4. **Staff with EMPTY `allowed_actions` list (`allowed_pages: ['inventory']`, `allowed_actions: []`):**
   - Example: Cashier or Salesman with inventory view access.
   - Write: `hasActionAccess` sees `profile.allowed_actions.length === 0`.
   - Line 319 executes: `if (r === 'CASHIER' || ...) return true`.
   - Result: `authorizePermission(identity, 'inventory', 'inventory:edit')` returns `null` (**ALLOWED**)!
   - **Vulnerability Confirmed:** Non-admin staff with an unconfigured or empty action array are **unintentionally granted write access** to inventory mutations.
5. **Staff with Unrelated Permissions (`allowed_pages: ['pos']`, `allowed_actions: ['pos:sale']`):**
   - Read & Write: `hasPageAccess` fails (`'pos'` does not match `'inventory'`).
   - Returns `Access denied: You do not have permission to access page 'inventory'`.
   - Behavior: **Correct.** Fail-closed (403 Forbidden).
6. **Missing or Malformed Identity:**
   - Missing token: Handled by `buildAuthMiddleware` $\rightarrow$ `401 Unauthorized`.
   - Deleted/inactive user in DB: Handled by `buildAuthMiddleware` status check $\rightarrow$ `401 Unauthorized`.
   - Blocked legacy admin role (e.g. `SUPER_ADMIN`): Handled by `resolveIdentity` $\rightarrow$ `401 Unauthorized`.
   - Behavior: **Correct.** Fail-closed.

### 3.3 Safest Compatible Phase C Write-Authorization Contract
To prevent unauthorized staff mutations due to the legacy empty-array fallback, Phase C must adopt an **explicit default-deny guard** for all mobile mutation endpoints:

```typescript
// Proposed Phase C Write-Authorization Guard:
export function canMutateMobileInventory(identity: RequestIdentity, targetBranchId: string): boolean {
  // 1. Must have branch access
  if (!canAccessBranch(identity, targetBranchId)) {
    return false;
  }
  // 2. Administrators can always mutate inventory for their branch
  if (isBranchAdmin(identity)) {
    return true;
  }
  // 3. Non-admin staff MUST have an explicit, non-fallback action grant
  const profile = identity.access_profile;
  if (!profile || !Array.isArray(profile.allowed_actions) || profile.allowed_actions.length === 0) {
    return false; // Default-deny
  }
  return profile.allowed_actions.some((a) => a === '*' || a === 'inventory:edit' || a === 'mobiles:register');
}
```

---

## 4. Validation of Finding F-03 — Transaction-Safe Uniqueness

### 4.1 File & Code Evidence
- **File:** `backend/src/repositories/mobile.repo.ts`
- **Lines 174–183 & 189–198:**
```typescript
async isImeiTaken(organizationId: string, imei: string): Promise<boolean> {
  const result = await this.pool.query<{ exists: boolean }>(...);
  return result.rows[0]?.exists === true;
}
async isVoucherTaken(branchId: string, voucherNo: string): Promise<boolean> {
  const result = await this.pool.query<{ exists: boolean }>(...);
  return result.rows[0]?.exists === true;
}
```

### 4.2 Technical Verification
1. **Transaction Client Parameter:** Neither helper accepts a `PoolClient` parameter. Both query `this.pool` directly.
2. **Transaction Isolation:** In Phase C registration, operations must run inside a single transaction:
   ```typescript
   const client = await this.pool.connect();
   await client.query('BEGIN');
   ```
   If `isImeiTaken` is called during this transaction, it executes on an external pool connection, meaning it reads outside the active transaction snapshot and cannot observe uncommitted writes from the same transaction.
3. **Concurrent Race Protection via Migration 037 Unique Constraints:**
   Even if two concurrent requests query `isImeiTaken` at the exact same instant, the database schema provides authoritative concurrency protection:
   - `mobile_imei_identifiers`: `UNIQUE (organization_id, imei)` (`037...sql:74`)
   - `mobile_purchase_paperwork`: `UNIQUE (branch_id, voucher_no)` (`037...sql:111-112`)
   - `mobile_purchase_paperwork`: `device_id TEXT NOT NULL UNIQUE` (`037...sql:91`)
   - `mobile_inspection_records`: `device_id TEXT NOT NULL UNIQUE` (`037...sql:126`)
   If a concurrent race occurs, PostgreSQL immediately raises a `23505 unique_violation`, rolling back the transaction.
4. **Voucher Policy Match:**
   `UNIQUE (branch_id, voucher_no)` accurately matches physical retail store practices, where voucher numbers originate from physical pre-printed receipt pads issued per branch.
5. **Phase C Transaction Helper Signatures:**
   To make preflight checks transaction-safe and prevent unhandled 500 crashes on concurrent duplicate submissions, update signatures in Phase C:
   ```typescript
   async isImeiTaken(organizationId: string, imei: string, client?: PoolClient): Promise<boolean> {
     const runner = client ?? this.pool;
     const result = await runner.query<{ exists: boolean }>(...);
     return result.rows[0]?.exists === true;
   }
   ```

---

## 5. Recheck of Unresolved Design Requirements

### 5.1 Supplier Relationship Requirement
1. **Migration 037 (`mobile_devices` table, line 36):**
   `supplier_id TEXT REFERENCES suppliers(id) ON DELETE RESTRICT`
2. **Validation (`mobile.validation.ts:146-164`):**
   - For `USED` phones: `supplier_id` must be absent (`null` or `undefined`). (Seller data is captured in `mobile_purchase_paperwork`).
   - For `NEW` phones: `supplier_id` is optional (`null` allowed; if string provided, must be non-blank).
3. **Status:**
   - **Conclusively Resolved in Schema & Validation:** `supplier_id` is nullable. It is disallowed for used phones and optional for new phones.
   - **Frontend UI Gap:** The Phase 1 `AddMobileForm.tsx` currently does not render a supplier dropdown for `NEW` phones.
   - **Phase C Decision:** In Phase C backend API, accepting `supplier_id?: string | null` for new phones is fully supported by the schema and validation scaffolding.

### 5.2 Append-Only Movement History Verification
- **Investigation:** `037_mobile_inventory_foundation.sql:160-186` defines `mobile_device_movements`.
- **Finding:** There is **NO database trigger** blocking `UPDATE` or `DELETE` on `mobile_device_movements`.
- **Verification:** The "append-only" guarantee is **enforced exclusively by application convention** (the repository provides `INSERT` only and will expose no `UPDATE` or `DELETE` queries). It is **not database-enforced**. This distinction is noted for architectural clarity.

---

## 6. Allowed Checks Executed vs. Prohibitions Respected

### 6.1 Checks Executed
- Read-only Git inspection: `git rev-parse`, `git status --short`, `git diff --check`.
- Clean line-by-line inspection of `mobile.validation.ts`, `mobile.repo.ts`, `mobile.routes.ts`, `auth.ts`, `server.ts`, and migrations `001`–`037`.
- Local mathematical edge-case evaluation via isolated Node.js script (zero files written, zero network/db calls).

### 6.2 Prohibitions Respected
- Zero source code or configuration files modified.
- Zero database connections established.
- Zero migrations executed.
- Zero HTTP requests executed against database-backed authentication.
- Zero packages installed.
- Zero Git commits, tags, pushes, or resets performed.

---

## 7. Strategic Recommendation for Phase C Authorization

### Verdict: **READY FOR PHASE C UPON IMPLEMENTATION OF 3 EXPLICIT SAFEGUARDS**

The foundation established in Phase B is sound, fully typed, and cleanly structured. Migration 037 enforces strict foreign keys and status boundaries (`IN_STOCK | INSPECTION | SOLD`). 

Phase C implementation may be authorized immediately, provided the Phase C implementation plan explicitly incorporates the following three targeted safeguards:

1. **Safeguard 1 (Monetary Guard):** Replace `pricesAreEqual` with an exact integer-in-cents or strict regex validator (`/^\d+(\.\d{1,2})?$/`) in `mobile.validation.ts` to prevent trailing-character acceptance and sub-cent rounding coercion.
2. **Safeguard 2 (Write Authorization Guard):** In `mobile.routes.ts`, enforce `isBranchAdmin(identity)` or an explicit default-deny action check for all mutation routes (`POST`, `PATCH`), preventing low-privilege staff with empty action lists from bypassing action security.
3. **Safeguard 3 (Transaction-Scoped Preflight):** In `mobile.repo.ts`, update `isImeiTaken` and `isVoucherTaken` to accept `client?: PoolClient` so that preflight checks execute inside the registration transaction block.

---

### Confirmation
- **Application source files modified:** None.
- **Database accessed or migrations executed:** None.
- **Git refs or working tree modified:** None (only this review report was created).
- **Report Path:** `claude/mobile-inventory-phase-b-findings-review.md`
