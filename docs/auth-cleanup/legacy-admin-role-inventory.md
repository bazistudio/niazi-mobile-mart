# Legacy Admin Role Inventory

This document catalogues every administrator role string, alias, and conditional expression identified across the Niazi Mobile Mart codebase, including backend TypeScript, frontend React/TypeScript, and desktop Rust/Tauri.

---

## 1. Inventory Summary Matrix

| Role / Identifier | Classification | Persisted in DB? | Presence in Codebase | Purpose & Current Usage |
| :--- | :--- | :---: | :--- | :--- |
| **`ADMIN`** | **Canonical Target** | Yes | Backend, Frontend, Tauri | Authoritative Organization Admin role. Unlimited organization-wide authority. |
| **`SHOP_ADMIN`** | **Canonical Target** | Yes | Backend, Frontend, Tauri | Authoritative Branch Admin role. Scoped strictly to assigned branch ID(s). |
| **`SUPER_ADMIN`** | **Legacy Alias** | Possible (legacy) | Backend, Frontend, Tauri | Inherited from multi-tenant SaaS architecture. Normalized to `ADMIN` or treated identically in guards. |
| **`OWNER`** | **Legacy Alias** | Possible (legacy) | Backend, Frontend, Tauri | Inherited from store-owner account concepts. Normalized to `ADMIN` or treated identically in guards. |
| **`MULTI_ADMIN`** | **Legacy Alias** | Unlikely | Backend, Frontend, Tauri | Multi-branch tenant manager role in legacy SaaS. Normalized to `ADMIN` in auth helpers. |
| **`SHOPADMIN`** | **Legacy Alias** | Possible (legacy) | Backend, Frontend | Legacy unhyphenated variant. Normalized to `SHOP_ADMIN`. |
| **`BRANCH_ADMIN`** | **Legacy Alias** | Possible (legacy) | Backend, Frontend, Tauri | Descriptive synonym for `SHOP_ADMIN`. Aliased in Tauri serde and backend helpers. |
| **`ORG_ADMIN`** | **Helper Concept** | No | Tauri (`AuthService::is_org_admin`) | Function/method naming convention in Tauri Rust backend, not an enumerated string role. |
| **`ORGANIZATION_ADMIN`** | **Non-Existent** | No | None found in source | Speculative alias only; no occurrences found in codebase. |

---

## 2. Detailed Occurrences by Component

### A. Backend (`backend/src/`)

#### 1. Central Normalization: `backend/src/auth.ts`
- **Lines 181–189:**
  ```typescript
  /**
   * Returns true if the identity holds organization-wide admin authority (ADMIN).
   * Legacy aliases (SUPER_ADMIN, OWNER, MULTI_ADMIN) are mapped here during transition.
   */
  export function isOrgAdmin(user: Pick<UserIdentity, 'role'>): boolean {
    const r = (user.role || '').toUpperCase();
    return r === 'ADMIN' || r === 'SUPER_ADMIN' || r === 'OWNER' || r === 'MULTI_ADMIN';
  }
  ```
- **Lines 192–203:**
  ```typescript
  /**
   * Returns true if the identity holds branch-admin authority (SHOP_ADMIN).
   * Legacy aliases (SHOPADMIN, BRANCH_ADMIN) are normalized here.
   */
  export function isBranchAdmin(user: Pick<UserIdentity, 'role'>): boolean {
    const r = (user.role || '').toUpperCase();
    return r === 'SHOP_ADMIN' || r === 'SHOPADMIN' || r === 'BRANCH_ADMIN';
  }
  ```

#### 2. User Administration: `backend/src/routes/users.routes.ts`
- **Line 60:** Validation check for protected admin operations:
  ```typescript
  if (r !== 'ADMIN' && r !== 'SUPER_ADMIN' && r !== 'OWNER' && r !== 'MULTI_ADMIN')
  ```
- **Lines 175, 313, 423, 575, 632, 675, 728, 785:**
  Prevents unprivileged users from mutating, deactivating, or suspending admin accounts:
  ```typescript
  const isTargetAdmin = targetRole === 'ADMIN' || targetRole === 'SUPER_ADMIN' || targetRole === 'OWNER' || targetRole === 'MULTI_ADMIN';
  ```

#### 3. Access Profile & Limits: `backend/src/repositories/auth.repo.ts`
- **Lines 74–79:**
  ```typescript
  if (r === 'ADMIN' || r === 'SUPER_ADMIN' || r === 'OWNER') {
    return { max_discount_percent: 100.0, can_price_override: true, can_refund: true, can_void_sale: true, can_view_profit: true };
  }
  if (r === 'SHOP_ADMIN' || r === 'SHOPADMIN') {
    return { max_discount_percent: 25.0, can_price_override: true, can_refund: true, can_void_sale: true, can_view_profit: true };
  }
  ```

#### 4. Sanitization & Listing: `backend/src/repositories/users.repo.ts`
- **Line 545:**
  ```typescript
  if (userRole === 'ADMIN' || userRole === 'SUPER_ADMIN' || userRole === 'OWNER' || userRole === 'MULTI_ADMIN')
  ```

---

### B. Frontend (`frontend/src/`)

#### 1. Type Definitions: `frontend/src/types/auth/auth.ts` & `frontend/src/lib/auth/core/auth.types.ts`
- Declares allowed string literals including `SUPER_ADMIN`, `MULTI_ADMIN`, `OWNER`, `ADMIN`, `SHOP_ADMIN`.

#### 2. Route Guards & Navigation: `frontend/src/components/layout/ShopSwitcher.tsx`
- **Lines 31–36:**
  ```typescript
  const isOrgAdmin =
    user?.role === 'ADMIN' ||
    user?.role === 'OWNER' ||
    user?.role === 'SUPER_ADMIN' ||
    user?.role === 'MULTI_ADMIN';
  ```

#### 3. Inventory & Product Workspaces:
- Found across `InventoryProductsPage.tsx`, `InventoryImportPage.tsx`, `StockTable.tsx`, `ProductListWidget.tsx`, `ProductActions.tsx`, `StockTransferWorkspace.tsx`, `QuickStockAdjustModal.tsx`:
  ```typescript
  const isOrgAdmin = role === 'SUPER_ADMIN' || role === 'MULTI_ADMIN' || role === 'OWNER' || role === 'ADMIN';
  ```

#### 4. Permissions Map: `frontend/src/constants/permissions.ts`
- Defines static entries for `OWNER`, `SUPER_ADMIN`, `MULTI_ADMIN`, grant full `SELECT` permission masks identically to `ADMIN`.

---

### C. Desktop Rust Backend (`src-tauri/src/`)

#### 1. Serde & User Entity: `src-tauri/src/domain/user.rs`
- **Lines 8–11:**
  ```rust
  #[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
  pub enum UserRole {
      Admin,
      #[serde(alias = "BRANCH_ADMIN", alias = "shop_admin", alias = "branch_admin")]
      ShopAdmin,
      Manager,
      Cashier,
      Salesman,
      Accountant,
      RepairMechanic,
      Staff,
  }
  ```

#### 2. SQL Repositories: `sqlite_user_repo.rs` & `postgres_user_repo.rs`
- **Lines 430–432 (Postgres) & 501–503 (SQLite):**
  ```rust
  match s.to_uppercase().as_str() {
      "ADMIN" | "OWNER" | "SUPER_ADMIN" | "MULTI_ADMIN" => UserRole::Admin,
      "SHOP_ADMIN" | "BRANCH_ADMIN" => UserRole::ShopAdmin,
      ...
  }
  ```

---

## 3. Potential Impact If Removed Without Migration

1. **Persisted Accounts:** If an existing user in the database currently possesses `role = 'SUPER_ADMIN'` or `role = 'OWNER'`, removing the string alias without updating the user table row would cause auth deserialization to fail or demote them to unprivileged fallback.
2. **Third-Party Integrations / Token Drift:** Older unexpired JWT tokens containing `SUPER_ADMIN` would immediately fail signature/role validation until the user re-authenticates.
3. **Frontend Route Blocking:** If frontend checks are simplified to `role === 'ADMIN'` before backend tokens are standardized, users holding legacy tokens would be locked out of navigation.
