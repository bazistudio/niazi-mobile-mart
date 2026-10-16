# Niazi Mobile Mart — Legacy Admin Role Temporary Blocking & Recovery Guide

## 1. Purpose and Release Boundary

This document records the exact changes, operational impacts, verification results, and safe recovery procedures for the **temporary runtime blocking of legacy administrative roles** in Niazi Mobile Mart.

### Context & Goals
Niazi Mobile Mart operates on a strict **two-administrator model**:
- **`ADMIN` (Organization Admin)**: Unrestricted organization-wide visibility and administrative authority across all retail branches and warehouse operations.
- **`SHOP_ADMIN` (Branch Admin)**: Restricted strictly to the administrator's assigned branch (`branch_id`). Cannot access or mutate data from other branches.

In previous releases, legacy role aliases inherited from upstream SaaS architecture were permitted through transition mapping logic. This release implements **temporary runtime blocking** at the authentication and authorization boundary to eliminate administrative privilege inheritance from legacy role aliases, without permanently removing compatibility mappings, database records, or historical transaction attribution.

- **Introducing Release Commit:** `706b52969f5959e2682441add5973eac52f37cbd`
- **Prior Committed Baseline (Phase 5A):** `dc4ce3b46c67d8b2d07a265d67525eba50b19163`

### Targeted Legacy Aliases
The five legacy administrator aliases blocked at runtime are:
1. **`SUPER_ADMIN`** (Legacy Organization Admin alias)
2. **`OWNER`** (Legacy Organization Admin alias)
3. **`MULTI_ADMIN`** (Legacy Organization Admin alias)
4. **`SHOPADMIN`** (Legacy Branch Admin alias)
5. **`BRANCH_ADMIN`** (Legacy Branch Admin alias)

### Canonical vs Legacy Distinction (Verified Facts)
- **Database Accounts**: Read-only inspection of the active database verified that **zero accounts** currently hold any of the five legacy aliases. Existing active database accounts are exclusively canonical (`admin` as `ADMIN`, `user_a` as `SHOP_ADMIN`, `user_b` as `SHOP_ADMIN`, `raja` as `SALESMAN`).
- **Data Safety**: No database account rows were deleted, disabled, or migrated. No tables or schemas were modified. Historical transactions, ledgers, audit trails, and customer records remain completely intact.

---

## 2. File-by-File Change Inventory

Four implementation files were modified against committed baseline `dc4ce3b46c67d8b2d07a265d67525eba50b19163`:

### 1. `backend/src/auth.ts`
- **Location:** Lines 85–100, 175–190, 205–235, 415–445
- **Previous Behavior:**
  - `isOrgAdmin()` recognized `ADMIN`, `SUPER_ADMIN`, `OWNER`, and `MULTI_ADMIN`.
  - `isBranchAdmin()` recognized `SHOP_ADMIN`, `SHOPADMIN`, and `BRANCH_ADMIN`.
  - `resolveIdentity()` accepted any valid RS256 token regardless of role alias.
  - `buildAuthMiddleware()` verified token signature and checked `is_active` and `status = 'ACTIVE'` in PostgreSQL, but did not validate the persisted database `role`.
- **Current Behavior:**
  - Exports explicit set `BLOCKED_LEGACY_ADMIN_ROLES = new Set(['SUPER_ADMIN', 'OWNER', 'MULTI_ADMIN', 'SHOPADMIN', 'BRANCH_ADMIN'])`.
  - `resolveIdentity()` throws `AuthError` (401 Unauthorized: `"Account role is deprecated or blocked. Please log in with a canonical role."`) if claims contain a blocked legacy role.
  - `isOrgAdmin()` strictly checks `r === 'ADMIN'`. Legacy aliases fail closed.
  - `isBranchAdmin()` strictly checks `r === 'SHOP_ADMIN'` (or `isOrgAdmin()`). Legacy aliases fail closed.
  - `buildAuthMiddleware()` queries `SELECT is_active, status, role FROM users WHERE id = $1`. If `BLOCKED_LEGACY_ADMIN_ROLES.has(dbRole)`, it returns `401 Unauthorized` (`"Account role is deprecated or blocked. Contact your administrator."`) and aborts before executing protected routes.
- **Security & Compatibility Implications:**
  - Prevents stale JWTs holding legacy aliases from executing route handlers.
  - Prevents token-drift where an account with a blocked DB role attempts to use an older canonical token.
  - Fails closed consistently across stateless and stateful authentication checks.
- **Evidence / Diff:**
  - `BLOCKED_LEGACY_ADMIN_ROLES` constant defined.
  - Case-insensitive check `roleUpper = String(claims.role || '').toUpperCase()`.
  - `dbRole = String(row['role'] ?? '').toUpperCase()`.

### 2. `backend/src/services/auth.service.ts`
- **Location:** Lines 24–28, 140–150
- **Previous Behavior:**
  - Checked `user.status` and `user.is_active`, then verified password/PIN hashes. Any active user record could log in and receive a JWT reflecting its stored `role`.
- **Current Behavior:**
  - Pre-login check: Before checking password/PIN credentials, evaluates `BLOCKED_LEGACY_ADMIN_ROLES.has(String(user.role || '').toUpperCase())`.
  - If a legacy role alias is detected, throws `AuthServiceError('Account role is deprecated or blocked. Contact your administrator.', 'DISABLED', 403)`.
- **Security & Compatibility Implications:**
  - Blocks issuance of new JWTs for accounts holding legacy roles.
  - Non-sensitive error message avoids leaking password validity or account presence details.
- **Evidence / Diff:**
  - Import of `BLOCKED_LEGACY_ADMIN_ROLES` from `../auth`.
  - Early throw of `AuthServiceError` with HTTP 403 status code.

### 3. `backend/src/routes/users.routes.ts`
- **Location:** Lines 33–37, 154–165, 345–358
- **Previous Behavior:**
  - User creation (`POST /`) and user update (`PUT /:id`) accepted any arbitrary role string, enabling creation of accounts with legacy aliases.
- **Current Behavior:**
  - `POST /`: Validates `BLOCKED_LEGACY_ADMIN_ROLES.has(role.trim().toUpperCase())`. If matched, rejects with `400 Bad Request` (`"Role '<role>' is a deprecated legacy alias and is blocked. Only canonical roles ('ADMIN', 'SHOP_ADMIN', etc.) are permitted."`).
  - `PUT /:id`: Validates `BLOCKED_LEGACY_ADMIN_ROLES.has(role.trim().toUpperCase())`. If matched, rejects with `400 Bad Request`.
  - Preserves existing protections: Last active admin protection, self-deactivation prevention (`id === callerUserId`), and admin account modification restrictions remain 100% active.
- **Security & Compatibility Implications:**
  - Prevents administrators from accidentally or intentionally provisioning new legacy identities.
- **Evidence / Diff:**
  - Checks in `POST /` and `PUT /:id` validating `upperRoleInput` against `BLOCKED_LEGACY_ADMIN_ROLES`.

### 4. `backend/src/__tests__/canonical-auth-matrix.test.ts`
- **Location:** Lines 50–62, 248–268, 348–370
- **Previous Behavior:**
  - Test 5 asserted that legacy transition aliases returned `true` for `isOrgAdmin()` and `isBranchAdmin()`.
- **Current Behavior:**
  - Updated Test 5 to assert that `SUPER_ADMIN`, `OWNER`, and `MULTI_ADMIN` return `false` for `isOrgAdmin()`, `isBranchAdmin()`, and `isAdmin()`.
  - Asserted that `SHOPADMIN` and `BRANCH_ADMIN` return `false` for `isBranchAdmin()`.
  - Added Test 13: Verifies that HTTP requests carrying JWTs for each of the five legacy aliases are rejected with `401 Unauthorized` at the route boundary.
- **Evidence / Diff:**
  - Test suite passes 13 of 13 tests including unit and HTTP integration verifications.

---

## 3. Authentication & Authorization Behavior Matrix

| Role / Identifier | Classification | Login Allowed? | JWT / Session Valid? | `isOrgAdmin()` | `isBranchAdmin()` | User Creation Allowed? | Branch Isolation | Observed Status |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **`ADMIN`** | Canonical Target | Yes (200) | Yes (200) | `true` | `true` | Yes (Canonical only) | Unrestricted (all branches) | **PASS** (Verified) |
| **`SHOP_ADMIN`** | Canonical Target | Yes (200) | Yes (200) | `false` | `true` | No (Branch staff only) | Restricted to `branch_id` | **PASS** (Verified) |
| **`SALESMAN`** | Supported Operational | Yes (200) | Yes (200) | `false` | `false` | No | Restricted to `branch_id` | **PASS** (Verified) |
| **`SUPER_ADMIN`** | Legacy Alias | **Blocked (403)** | **Blocked (401)** | `false` | `false` | **Blocked (400)** | N/A (Blocked) | **PASS** (Verified) |
| **`OWNER`** | Legacy Alias | **Blocked (403)** | **Blocked (401)** | `false` | `false` | **Blocked (400)** | N/A (Blocked) | **PASS** (Verified) |
| **`MULTI_ADMIN`** | Legacy Alias | **Blocked (403)** | **Blocked (401)** | `false` | `false` | **Blocked (400)** | N/A (Blocked) | **PASS** (Verified) |
| **`SHOPADMIN`** | Legacy Alias | **Blocked (403)** | **Blocked (401)** | `false` | `false` | **Blocked (400)** | N/A (Blocked) | **PASS** (Verified) |
| **`BRANCH_ADMIN`** | Legacy Alias | **Blocked (403)** | **Blocked (401)** | `false` | `false` | **Blocked (400)** | N/A (Blocked) | **PASS** (Verified) |

---

## 4. Recovery Diagnosis Guide

If unexpected authentication or operational issues arise in staging or live testing, use this table to identify the cause:

### Issue 1: Canonical Organization Admin cannot log in or receives 401/403
- **Symptoms:** User with username `admin` receives 401 Unauthorized or 403 Forbidden.
- **Diagnostic Steps:**
  1. Inspect user row in PostgreSQL:
     ```sql
     SELECT id, username, role, is_active, status FROM users WHERE username = 'admin';
     ```
  2. Verify that `role` is exactly `'ADMIN'`. If stored in mixed or lowercase (`'admin'`), normalization is case-insensitive, but ensure it is not mapped to an unrecognized role.
  3. Verify `status = 'ACTIVE'` and `is_active = 1`.
  4. Inspect server log: Check whether `[auth] 401` or `[auth] 503` is emitted.

### Issue 2: Branch Admin loses access to assigned branch or cannot open POS
- **Symptoms:** `SHOP_ADMIN` receives 403 Forbidden when accessing `/api/products` or `/api/cash/sessions/current`.
- **Diagnostic Steps:**
  1. Inspect the decoded JWT claims: Ensure `branch_id` is a valid branch UUID and not null or empty.
  2. Verify the request URL query parameters: Branch admins must query `?branch_id=<own_branch_id>`.
  3. Check `backend/src/auth.ts`: `canAccessBranch(identity, targetBranchId)` requires `identity.branch_id === targetBranchId`.

### Issue 3: Stale sessions or legacy tokens continue operating
- **Symptoms:** A client device previously logged in with a legacy role alias continues making requests.
- **Diagnostic Steps:**
  1. Check endpoint: If the endpoint is behind `buildAuthMiddleware(pool)`, both token claim and DB role are checked.
  2. If an endpoint only uses deprecated `authMiddleware`, it checks `resolveIdentity()` which verifies token claims against `BLOCKED_LEGACY_ADMIN_ROLES`.

### Issue 4: Creating a new user fails with 400 Bad Request
- **Symptoms:** POST `/api/users` returns 400.
- **Diagnostic Steps:**
  1. Check the `role` field in the request body. If the client sent `SUPER_ADMIN`, `OWNER`, `MULTI_ADMIN`, `SHOPADMIN`, or `BRANCH_ADMIN`, the request is intentionally rejected.
  2. Ensure the client UI or API payload supplies canonical `ADMIN` or `SHOP_ADMIN`.

---

## 5. Safe Recovery Procedure

If a regression occurs and temporary legacy compatibility must be restored, follow this strictly controlled, non-destructive procedure.

### Phase 1: Baseline Capture & Non-Destructive Backup
Run these diagnostic commands to record current repository state:
```powershell
# Diagnostic check (Read-Only)
git branch --show-current
git rev-parse HEAD
git status --short
git diff --stat
```

Create a recovery shelter branch before modifying any files:
```powershell
# State-changing command: Requires team review before execution
git branch shelter/legacy-block-recovery-backup
```

### Phase 2: Isolated Rollback of Blocking Logic
To restore legacy alias recognition without resetting unrelated work or altering database records:

1. **In `backend/src/auth.ts`:**
   - Remove legacy aliases from `BLOCKED_LEGACY_ADMIN_ROLES` or temporarily comment out the set's entries.
   - Restore legacy aliases in `isOrgAdmin()`:
     ```typescript
     return r === 'ADMIN' || r === 'SUPER_ADMIN' || r === 'OWNER' || r === 'MULTI_ADMIN';
     ```
   - Restore legacy aliases in `isBranchAdmin()`:
     ```typescript
     return r === 'SHOP_ADMIN' || r === 'SHOPADMIN' || r === 'BRANCH_ADMIN';
     ```
   - In `resolveIdentity()`, bypass the `BLOCKED_LEGACY_ADMIN_ROLES.has(roleUpper)` check.
   - In `buildAuthMiddleware()`, bypass the `BLOCKED_LEGACY_ADMIN_ROLES.has(dbRole)` check.

2. **In `backend/src/services/auth.service.ts`:**
   - In `login()`, remove or bypass the `BLOCKED_LEGACY_ADMIN_ROLES.has(...)` check before credential verification.

3. **In `backend/src/routes/users.routes.ts`:**
   - In `POST /` and `PUT /:id`, remove the `BLOCKED_LEGACY_ADMIN_ROLES.has(...)` check.

### Phase 3: Validation After Recovery Edit
Recompile backend TypeScript and run the test suite:
```powershell
# Validation commands
npm --prefix backend run build
node --test backend/dist/__tests__/canonical-auth-matrix.test.js
```

### DO NOT:
- **DO NOT** run `git reset --hard` or `git clean -fd`.
- **DO NOT** alter database tables, run migrations, or delete user records.
- **DO NOT** commit or push without explicit review and approval.

---

## 6. Known Limitations & Future Permanent Cleanup

1. **Intentionally Preserved Compatibility Code:**
   - Legacy enum aliases in Tauri Rust (`src-tauri/src/domain/user.rs`, `postgres_user_repo.rs`, `sqlite_user_repo.rs`) are preserved for native desktop backward compatibility.
   - Legacy type unions in `frontend/src/types/auth/auth.ts` and `frontend/src/lib/auth/core/auth.types.ts` remain intact to prevent frontend compile breaks.
   - Frontend route definitions (`RoleGuard allowedRoles={['SUPER_ADMIN', 'MULTI_ADMIN', 'OWNER', 'ADMIN']}`) remain intact; backend enforcement prevents unauthorized access regardless of frontend guards.
2. **Permanent Removal Requirements (Future Release):**
   - After a 30-day monitoring period with zero legacy login attempts, perform permanent deletion of legacy role definitions across backend, frontend, and Tauri.
   - Remove legacy mappings from `auth.repo.ts` (`defaultLimitsForRole`) and `users.repo.ts`.
   - Update frontend route definitions to check strictly for canonical `ADMIN` and `SHOP_ADMIN`.

---

## 7. Recovery Verification Checklist

- [x] Git baseline confirmed at commit `dc4ce3b46c67d8b2d07a265d67525eba50b19163`.
- [x] All 5 legacy aliases rejected at login boundary (`AuthService.login` -> 403).
- [x] All 5 legacy aliases rejected at token resolution (`resolveIdentity` -> 401).
- [x] All 5 legacy aliases rejected at DB session check (`buildAuthMiddleware` -> 401).
- [x] All 5 legacy aliases rejected during account creation / update (`users.routes.ts` -> 400).
- [x] Canonical `ADMIN` verified for organization-wide visibility and cross-branch operations.
- [x] Canonical `SHOP_ADMIN` verified for assigned-branch POS and cross-branch isolation (403 on other branches).
- [x] Operational roles (`SALESMAN`, `CASHIER`, `ACCOUNTANT`, `MANAGER`) verified for role-specific boundaries.
- [x] Last active admin and self-deactivation protections preserved.
- [x] Zero database records modified or deleted. Zero migrations executed.
- [x] Safe recovery procedure documented with step-by-step diagnostic and rollback guidance.
