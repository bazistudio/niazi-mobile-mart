# Future Authorization Cleanup Plan

This document details the recommended, multi-phase plan to safely retire legacy admin aliases (`SUPER_ADMIN`, `OWNER`, `MULTI_ADMIN`, `SHOPADMIN`, `BRANCH_ADMIN`) in favor of the canonical two-admin model (`ADMIN` and `SHOP_ADMIN`).

**NOTE:** This plan is purely prospective. No steps outlined here should be executed without separate, explicit authorization.

---

## Phase 1: Database Account Audit & Standardization

Before removing any string check from code, every account stored in the production and local database must be inspected:

1. **Query Existing Roles:**
   ```sql
   SELECT role, count(*) FROM users GROUP BY role;
   ```
2. **Identify Accounts Using Legacy Roles:**
   ```sql
   SELECT id, username, role, branch_id FROM users WHERE role IN ('SUPER_ADMIN', 'OWNER', 'MULTI_ADMIN', 'SHOPADMIN', 'BRANCH_ADMIN');
   ```
3. **Data Migration (Separately Authorized):**
   - Migrate any `SUPER_ADMIN`, `OWNER`, or `MULTI_ADMIN` accounts to `ADMIN`.
   - Migrate any `SHOPADMIN` or `BRANCH_ADMIN` accounts to `SHOP_ADMIN`.
   - Ensure all historical attribution (`created_by`, `cashier_id`, audit logs) remains intact.

---

## Phase 2: Centralize and Normalize in Backend Auth Layer

Once database records are uniform:

1. **Update `backend/src/auth.ts`:**
   - Simplify `isOrgAdmin`:
     ```typescript
     export function isOrgAdmin(user: Pick<UserIdentity, 'role'>): boolean {
       return (user.role || '').toUpperCase() === 'ADMIN';
     }
     ```
   - Simplify `isBranchAdmin`:
     ```typescript
     export function isBranchAdmin(user: Pick<UserIdentity, 'role'>): boolean {
       return (user.role || '').toUpperCase() === 'SHOP_ADMIN';
     }
     ```
2. **Refactor Route Guards:**
   - Replace manual `|| r === 'SUPER_ADMIN'` checks in `users.routes.ts`, `settings.routes.ts`, and `reports.routes.ts` with direct calls to `isOrgAdmin()` or `isBranchAdmin()`.

---

## Phase 3: Update Desktop Tauri Deserialization

1. **Update `src-tauri/src/domain/user.rs`:**
   - Remove legacy aliases from `UserRole` serde attributes once desktop clients are updated.
2. **Update SQL Repositories:**
   - Simplify `postgres_user_repo.rs` and `sqlite_user_repo.rs` role matching blocks.

---

## Phase 4: Frontend Cleanup

1. **Remove Legacy Types:**
   - Prune `'SUPER_ADMIN' | 'OWNER' | 'MULTI_ADMIN'` from `types/auth/auth.ts` and `auth.types.ts`.
2. **Consolidate Component Guards:**
   - Refactor inventory, settings, and layout pages (`ShopSwitcher.tsx`, `Sidebar.tsx`, `InventoryProductsPage.tsx`) to check solely for `ADMIN` and `SHOP_ADMIN`.

---

## Phase 5: Verification & Safety Gates

1. Run full unit and integration test suite (`canonical-auth-matrix.test.ts`, `test-identities-seed.test.ts`).
2. Verify browser login and navigation for both `ADMIN` and `SHOP_ADMIN`.
3. Validate that historical transaction attribution across sales, cash sessions, and invoices is 100% preserved.
