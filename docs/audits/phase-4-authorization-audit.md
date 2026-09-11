# Phase 4 — Authorization & Permission Enforcement Audit Report

**Date**: 2026-09-10  
**Project**: Niazi Mobile Mart  
**Status**: AUDIT COMPLETE — PENDING IMPLEMENTATION  

---

## A. Existing RBAC Architecture

The application enforces a multi-tier Role-Based Access Control (RBAC) model with per-user custom overrides:

```text
User Account (users table)
    ↓
Assigned UserRole (ADMIN, SHOP_ADMIN, MANAGER, ACCOUNTANT, SALESMAN, CASHIER, REPAIR_MECHANIC, STAFF, PUBLIC_USER)
    ↓
Default StaffAccessProfile (access_control.rs: admin_unlimited, cashier_default, shop_admin_default, etc.)
    ↓
Individual User Overrides (user_access_profiles table: allowed_pages, allowed_actions, limits)
    ↓
Effective Access Profile & Permissions (StaffAccessProfile)
    ↓
Server-Side Authorization Decision (ALLOW vs 403 Forbidden)
```

---

## B. Permission Inventory

The authoritative permission identifiers used in the application include:

### Page Navigation Permissions
- `dashboard` — Dashboard overview
- `pos` — POS checkout screen
- `products` — Product catalog management
- `inventory` — Stock levels and stock movement tracking
- `sales` — Historical sales & invoice records
- `purchases` — Supplier purchase orders
- `customers` / `parties` — Customer master data & ledgers
- `suppliers` / `parties` — Supplier master data & ledgers
- `expenses` / `finance` — Store operational expenses
- `cash` / `finance` — Daily cash sessions & cash movements
- `reports` — Business analytics & export
- `settings` — System configuration & staff management

### Action Invocation Permissions
- `pos:sale` / `pos.use` — Execute POS retail sale
- `pos:hold` — Hold/resume checkout carts
- `pos:discount` / `pos.apply_discount` — Apply invoice/line discount
- `pos:override` / `pos.price_override` — Override product unit selling price
- `pos:refund` / `pos.void_sale` — Process sales refund or void sale
- `stock:adjust` / `inventory.adjust` — Execute manual stock adjustment
- `stock:transfer` / `inventory.transfer` — Perform inter-branch inventory transfer
- `product:create` / `products.manage` — Add new product master record
- `product:edit` / `products.manage` — Modify product pricing or properties
- `expense:create` / `expenses.manage` — Record operational expense
- `cash:manage` / `cash.manage` — Open/close cash drawer session
- `reports:export` / `reports.view` — Export business financial reports

---

## C. Existing Role Model

1. **ADMIN**: Full unlimited access (`*` pages, `*` actions, 100% max discount, all operational limits enabled).
2. **SHOP_ADMIN**: Branch administrative access (POS, catalog, inventory, sales, purchases, expenses, cash, 25% max discount limit).
3. **MANAGER**: Operational overview (dashboard, products, inventory, sales, purchases, parties, reports).
4. **ACCOUNTANT**: Financial management (sales, purchases, customer/supplier ledgers, expenses, cash).
5. **SALESMAN**: POS & customer interactions.
6. **CASHIER**: POS checkout terminal.
7. **REPAIR_MECHANIC**: Device service & repair job tracking.
8. **STAFF**: Base operational staff profile.
9. **PUBLIC_USER**: External public rate app (STRICT ISOLATION: 0 pages, 0 internal ERP actions).

---

## D. Individual Permission Overrides

- Individual permission overrides are persisted in the `user_access_profiles` table.
- When an administrator creates or updates a staff user account (`admin_create_user` or `admin_update_user`), custom `allowed_pages`, `allowed_actions`, and `StaffOperationalLimits` are written to `user_access_profiles`.
- When loading a user (`SQLiteUserRepository::find_by_id`), the repository performs a `LEFT JOIN user_access_profiles` to load the exact individual override profile.

---

## E. Existing Authorization Findings & Defects

1. **Axum HTTP Server Authorization Defect (HIGH)**:
   - While Tauri IPC commands invoke `AuthService::require_permission()`, the Axum HTTP server routes (`/api/auth/me`, `/api/health`, etc.) currently lack an Axum authorization layer to enforce permission checks per HTTP endpoint.
2. **Organization & Branch Isolation Requirement (HIGH)**:
   - All HTTP requests must validate that the requested resource belongs to the caller's trusted `RequestIdentity.organization_id` (`00000000-0000-0000-0000-000000000001`) and authorized branch context, rejecting cross-branch/cross-tenant tampering.

---

## F. Recommended Phase 4 Implementation Plan

1. **Implement `AuthorizePermission` Axum Middleware / Extractor**:
   - Create an Axum extractor / middleware helper (`RequirePermission`) that inspects the caller's `RequestIdentity` and returns `403 Forbidden` if effective permissions or domain actions are missing.
2. **Implement Organization & Branch Context Guard**:
   - Validate client-supplied `organization_id` and `branch_id` against `RequestIdentity`. Reject any client attempts to override organization or access unauthorized branches.
3. **Comprehensive Authorization & Security Tests**:
   - Write tests covering:
     - Role-based permission enforcement (`ALLOW` vs `403`).
     - Individual permission override precedence (`Role DENY + Override ALLOW = ALLOW`).
     - Organization isolation (reject cross-organization manipulation).
     - Branch access validation.
     - Privilege escalation prevention.

---

## G. Database Safety Confirmation

- **Schema Changes**: ZERO.
- **Migration Changes**: ZERO.
- **Seed Data Changes**: ZERO.
- **Database Architecture**: FROZEN.
