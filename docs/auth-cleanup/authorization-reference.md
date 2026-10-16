# Authorization Reference

This reference describes the current authorization architecture of Niazi Mobile Mart, explaining how organization-wide and branch-scoped administrative authorities are established, verified, and enforced.

---

## 1. Dual Administrative Authority Model

The application enforces a fundamental distinction between **Organization Admin** and **Branch Admin**:

### Organization Admin (`ADMIN`)
- **Authority Scope:** Global organization-wide. Accesses data across all branches (Main Branch, Branch Alpha, Branch Beta, Warehouse, etc.).
- **Branch Independence:** Authority is **not** dependent on whether the account's database record has `branch_id = NULL` or `branch_id = '<main_branch_uuid>'`. An Organization Admin assigned to Main Branch remains fully authorized to administer Branch B, switch branches in the UI, and inspect all organizational assets.
- **Key Helper:** `isOrgAdmin(user)` in `backend/src/auth.ts`.

### Branch Admin (`SHOP_ADMIN`)
- **Authority Scope:** Local branch administration. Manages point-of-sale, stock, expenses, repairs, and daily cash drawer sessions for their **assigned branch only**.
- **Constraint:** Must not be granted global organization authority. Must not be allowed to mutate records in other branches or view profit summaries across the entire organization.
- **Key Helper:** `isBranchAdmin(user)` in `backend/src/auth.ts`.

---

## 2. Operational Roles Reference

In addition to administrators, the system defines 5 authoritative operational roles:

| Operational Role | Access Profile & Scope | Key Capabilities & Limitations |
| :--- | :--- | :--- |
| **`CASHIER`** | POS & register operations | Opens/closes cash registers; creates sales and holds orders. Discount capped at 10%. Cannot perform inventory stock adjustments or export financial reports. |
| **`SALESMAN`** | POS & sales intake | Creates sales and holds orders. Cannot open/close cash drawer registers. Discount capped at 5%. |
| **`MANAGER`** | Store operations supervision | Superintends inventory, products, customers, suppliers, parties, and repairs. Cannot access cash drawers directly. Discount capped at 15%. |
| **`ACCOUNTANT`** | Financial & ledger management | Accesses ledger reports, expense tracking, and supplier receivables/payables. Cannot execute POS sales or discount overrides. |
| **`REPAIR_MECHANIC`** | Device service department | Creates and updates repair jobs, device diagnosis, and repair spare-parts management. Completely isolated from POS and financials. |

---

## 3. Permission Profile Construction (`AccessProfile`)

Access control is reinforced both at the role level and via fine-grained `AccessProfile` structures embedded directly into JWTs and validated across backend and Tauri desktop layers:

```typescript
export interface AccessProfile {
  allowed_pages: string[];
  allowed_actions: string[];
  limits: StaffOperationalLimits;
}

export interface StaffOperationalLimits {
  max_discount_percent: number;
  can_price_override: boolean;
  can_refund: boolean;
  can_void_sale: boolean;
  can_view_profit: boolean;
}
```

### Sources of Truth:
1. **Desktop Native (Rust):** `src-tauri/src/domain/access_control.rs`
   - `StaffAccessProfile::admin_unlimited()`: `allowed_pages = ["*"]`, `max_discount = 100.0`.
   - `StaffAccessProfile::shop_admin_default()`: `allowed_pages = ["dashboard", "pos", "products", "inventory", "sales", ...]`, `max_discount = 25.0`.
   - `StaffAccessProfile::cashier_default()`: `allowed_pages = ["dashboard", "pos", "products", "sales", "customers", "parties"]`.
2. **Backend API (TypeScript):** `backend/src/repositories/auth.repo.ts`
   - Mirrors the Rust limits via `defaultLimitsForRole(role)`.

---

## 4. Frontend Checks vs. Backend Enforcement

Security is governed by backend validation; frontend checks serve exclusively for user experience (e.g., hiding navigation links or showing the branch switcher).

| Feature / Action | Frontend Guard | Backend Enforcement |
| :--- | :--- | :--- |
| **Shop Switcher (Branch selector)** | `ShopSwitcher.tsx`: Checks `isOrgAdmin`. Hidden for non-org-admins. | `auth.ts` (`requireBranchAccess`): Verifies `isOrgAdmin(req.user) || req.user.branch_id === requestedBranchId`. |
| **Daily Cash Session** | `CashDrawerModal.tsx`: Checks permissions. | `cash.routes.ts`: Validates branch ID match and verifies `isOrgAdmin || isBranchAdmin || cashier`. |
| **Stock Adjustments** | `StockAdjustmentModal.tsx`: Verifies action `stock:adjust`. | `inventory.routes.ts`: Enforces branch isolation and checks permissions. |
| **User Administration** | `UsersPage.tsx`: Admin-only navigation. | `users.routes.ts`: Strictly enforces `isOrgAdmin(req.user)`. Rejects non-org-admins with HTTP 403. |
