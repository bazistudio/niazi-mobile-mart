# Phase 5 — Core API Endpoints & Domain Integration Audit Report

**Date**: 2026-09-10  
**Project**: Niazi Mobile Mart  
**Status**: AUDIT COMPLETE — PENDING IMPLEMENTATION  

---

## A. Current API Architecture

The application currently has two entry points sharing the same backend logic:

```text
HTTP Request (Axum)
    ↓
AuthenticatedUser Extractor (Phase 3 Bearer Token)
    ↓
RequestIdentity (Phase 4 Permission & Isolation Context)
    ↓
Axum HTTP Handler (server.rs)
    ↓
Domain Service Layer (ProductService, InventoryService, CustomerService, SaleService, etc.)
    ↓
Repository Layer (SQLiteUserRepository, PostgresAdapter, SQLiteProductRepository, etc.)
    ↓
Database (PostgreSQL pool in Cloud Run mode / SQLite in Desktop mode)
```

---

## B. Domain Inventory & Status Matrix

| Domain | Backend Service | Repository Layer | Existing HTTP API | Authorization Gate | PostgreSQL Schema | Status |
|--------|-----------------|------------------|-------------------|--------------------|-------------------|--------|
| **Authentication** | `AuthService` | `SQLiteUserRepository` | `/api/auth/login`, `/api/auth/me`, `/api/auth/logout` | Phase 3 Extractor | `users`, `user_access_profiles` | **PASS / READY** |
| **Products** | `ProductService` | `SQLiteProductRepository` | Pending Phase 5 | `products.view`, `products.manage` | `products`, `categories`, `brands`, `units` | **READY FOR API** |
| **Inventory** | `InventoryService` | `SQLiteInventoryRepository` | Pending Phase 5 | `inventory.view`, `inventory.adjust`, `inventory.transfer` | `stock`, `stock_movements` | **READY FOR API** |
| **Customers** | `CustomerService` | `SQLiteCustomerRepository` | Pending Phase 5 | `customers` / `parties` | `customers`, `customer_ledger_entries` | **READY FOR API** |
| **Suppliers** | `SupplierService` | `SQLiteSupplierRepository` | Pending Phase 5 | `suppliers` / `parties` | `suppliers`, `supplier_ledger_entries` | **READY FOR API** |
| **POS / Sales** | `SaleService` | `SQLiteSaleRepository` | Pending Phase 5 | `pos:sale`, `pos:refund`, `pos:void` | `sales`, `sale_lines`, `sale_payments` | **READY FOR API** |
| **Expenses** | `ExpenseService` | `SQLiteExpenseRepository` | Pending Phase 5 | `expenses.manage`, `expenses` | `expenses`, `expense_categories` | **READY FOR API** |
| **Cash Management**| `CashService` | `SQLiteCashRepository` | Pending Phase 5 | `cash.manage`, `finance` | `cash_sessions`, `cash_movements` | **READY FOR API** |

---

## C. API Gap Analysis & Scope Recommendation

1. **Gap**: Current Axum server binary (`server.rs`) only registers `/api/health`, `/api/auth/login`, `/api/auth/logout`, and `/api/auth/me`. Domain endpoints for Products, Inventory, Customers, Suppliers, Sales, Expenses, and Cash Sessions are not yet wired to Axum HTTP routes.
2. **Scope**: Incrementally expose and wire core domain endpoints in `server.rs` using `AuthenticatedUser` + `RequestIdentity::authorize_permission` + `RequestIdentity::validate_context`, ensuring strict transport-only handlers delegating directly to `AppState` service methods.

---

## D. Risk Classification

| Risk | Level | Mitigation |
|------|-------|------------|
| Business SQL in Axum Handlers | **CRITICAL** | Strict transport-only handlers. Handlers MUST call domain service methods on `AppState`. |
| Unauthenticated / Unauthorized Access | **HIGH** | Every protected domain endpoint requires `AuthenticatedUser` extractor + `authorize_permission()`. |
| Cross-Tenant / Cross-Branch Tampering | **HIGH** | Validate request organization and branch context against trusted `RequestIdentity` via `validate_context()`. |

---

## E. Phase 5 Implementation Plan

1. **Wire Products API**:
   - `GET /api/products` (List with optional query search/category filter)
   - `GET /api/products/:id` (Get by ID)
   - `POST /api/products` (Create product master)
2. **Wire Inventory API**:
   - `GET /api/inventory` (List stock levels per branch)
   - `POST /api/inventory/adjust` (Execute inventory adjustment)
3. **Wire Customers & Suppliers API**:
   - `GET /api/customers` & `POST /api/customers`
   - `GET /api/suppliers` & `POST /api/suppliers`
4. **Wire POS / Sales API**:
   - `POST /api/sales` (Complete sale transaction with atomic inventory/ledger update)
5. **Add Comprehensive API End-to-End Tests**:
   - Verify HTTP status codes (200 OK, 401 Unauthorized, 403 Forbidden, 400 Bad Request, 404 Not Found).
   - Confirm 0 schema modifications.

---

## F. Database Safety Confirmation

- **Schema Changes**: ZERO.
- **Migration Changes**: ZERO.
- **Seed Data Changes**: ZERO.
- **Database Architecture**: FROZEN.
