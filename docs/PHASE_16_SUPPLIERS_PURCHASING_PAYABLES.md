# Phase 16: Suppliers + Purchasing + Payables

## 1. Overview & Architecture Lock

Niazi Mobile Mart operates strictly as a native, single-shop, offline-first desktop ERP.
The architecture pipeline is strictly locked:

```text
React 19 + Vite
      ↓
Tauri v2 invoke()
      ↓
Rust Commands
      ↓
Rust Services
      ↓
Rust Repositories
      ↓
SQLite (rusqlite)
```

No external backend, HTTP, Express, MongoDB, Axios, or multi-tenant SaaS constructs exist in the application.

Phase 16 establishes the complete native **Suppliers, Purchasing, and Payables** accounting pipeline on top of the established Phase 14 (Sales & Inventory) and Phase 15 (Customers & Receivables) foundation:

```text
Supplier
   ↓
Purchase
   ↓
Purchase Lines
   ↓
Stock Increase (IN)
   ↓
Supplier Payable
   ↓
Supplier Payment
   ↓
Supplier Ledger
   ↓
Updated Outstanding Balance
```

---

## 2. Database Migration 006 (`006_suppliers_purchasing_and_payables`)

Migration 006 introduces four canonical tables and three atomic counters without altering Migrations 001–005:

### 2.1 Counters
- `supplier_code`: Generates sequential supplier codes (`SUP-000001`, `SUP-000002`, ...).
- `purchase_number`: Generates sequential purchase order numbers (`PUR-000001`, `PUR-000002`, ...).
- `supplier_payment_receipt`: Generates sequential supplier payout receipts (`PAY-000001`, `PAY-000002`, ...), completely separate from customer sales receipts (`REC-000001`).

### 2.2 `suppliers` Table
Stores authoritative supplier identities and procurement terms:
- `id`: UUID v4 (36 chars) primary key.
- `supplier_code`: Unique sequential identifier (`SUP-XXXXXX`).
- `name`: Supplier / company / contact person name (required).
- `phone`: Contact phone number (required).
- `alternate_phone`, `email`, `address`, `notes`: Optional contact metadata.
- `credit_limit`: Integer $\ge 0$ in whole PKR. `0` denotes unlimited credit.
- `is_active`: `1` for active, `0` for deactivated. Suppliers are never physically deleted once purchasing or financial transactions exist.
- `created_at`, `updated_at`: ISO 8601 UTC timestamps.

### 2.3 `purchases` Table
Stores the authoritative purchase orders:
- `id`: UUID v4 primary key.
- `purchase_number`: Unique sequential identifier (`PUR-XXXXXX`).
- `supplier_id`: Foreign key to `suppliers.id` (`ON DELETE RESTRICT`).
- `branch_id`: Foreign key to `branches.id` (`ON DELETE RESTRICT`).
- `subtotal`: Integer sum of purchase line totals.
- `discount`: Purchase-level discount in whole PKR.
- `total_amount`: Net purchase amount (`subtotal - discount`).
- `paid_amount`: Amount paid at procurement time.
- `credit_amount`: Unpaid portion creating a supplier payable (`total_amount - paid_amount`).
- `payment_status`: `PAID`, `PARTIALLY_PAID`, or `UNPAID`.
- `status`: `COMPLETED` or `CANCELLED`.
- `notes`: Optional purchase notes or supplier bill reference.
- `performed_by`: User ID of logged-in staff member.
- `created_at`, `updated_at`: Timestamps.

### 2.4 `purchase_lines` Table
Stores immutable purchase line snapshots:
- `id`: UUID v4 primary key.
- `purchase_id`: Foreign key to `purchases.id` (`ON DELETE CASCADE`).
- `product_id`: Foreign key to `products.id` (`ON DELETE RESTRICT`).
- `product_name_snapshot`: Historical product name at procurement time.
- `sku_snapshot`: Historical product SKU at procurement time.
- `quantity`: Positive integer units procured ($> 0$).
- `unit_cost`: Authoritative unit cost in whole PKR ($\ge 0$).
- `discount`: Line-level discount ($\ge 0$).
- `line_total`: Line net total ($quantity \times unit\_cost - discount$).
- `created_at`: Timestamp.

### 2.5 `supplier_ledger_entries` Table
Append-only double-entry financial journal:
- `id`: UUID v4 primary key.
- `supplier_id`: Foreign key to `suppliers.id` (`ON DELETE RESTRICT`).
- `reference_id`: Associated purchase or payment UUID.
- `reference_number`: Associated document code (`PUR-XXXXXX`, `PAY-XXXXXX`).
- `entry_type`: `PURCHASE`, `PAYMENT`, or `ADJUSTMENT`.
- `debit`: Payable increase ($\ge 0$). Created on credit purchase.
- `credit`: Payable decrease ($\ge 0$). Created on supplier payment.
- `balance_after`: Snapshot balance after the transaction.
- `description`: Human-readable audit narrative.
- `performed_by`: Audit user ID.
- `created_at`: Timestamp.

---

## 3. Financial Semantics & Money Representation

- **Monetary Unit**: 1 Integer = 1 Pakistani Rupee (PKR). No floats, decimals, paisas, or minor-unit scaling.
- **Payable Formula**:
  $$\text{Authoritative Outstanding Balance} = \sum(\text{debit}) - \sum(\text{credit})$$
  - `DEBIT`: Supplier credit purchase increases payable liability.
  - `CREDIT`: Supplier payout reduces payable liability.
  - Selecting a supplier during a cash purchase where $\text{paid} = \text{total}$ results in $\text{credit} = 0$, producing **zero** ledger debit and **zero** payable.
- **Credit Limits**:
  If $\text{credit\_limit} > 0$:
  $$\text{current\_outstanding} + \text{new\_credit} \le \text{credit\_limit}$$
  If $\text{credit\_limit} = 0$: Treated as unlimited credit.

---

## 4. Atomic Transaction Pipeline

### 4.1 Purchase Execution (`complete_purchase`)
Executed in a single SQLite transaction:
1. Validate supplier existence and active status.
2. Validate branch active status.
3. Validate products, quantities ($> 0$), and unit costs ($\ge 0$).
4. Calculate line totals, subtotal, discount, total, and credit amount.
5. Enforce supplier credit limit if $\text{credit\_amount} > 0$.
6. Generate sequential `purchase_number` (`PUR-XXXXXX`).
7. Insert `purchases` record.
8. Insert `purchase_lines` records with historical snapshots.
9. Increment stock in `stock` table atomically (`SQLiteInventoryRepository::set_stock_in_tx`).
10. Insert `stock_movements` record (`movement_type = 'IN'`, reference = `purchase.id`).
11. Update catalog `products.purchase_price` to the latest procurement unit cost.
12. If $\text{credit\_amount} > 0$, append `supplier_ledger_entries` record with `entry_type = 'PURCHASE'`, `debit = credit_amount`.
13. Commit transaction. On any validation or database error, all changes rollback completely.

### 4.2 Supplier Payment Execution (`record_supplier_payment`)
Executed in a single SQLite transaction:
1. Validate supplier existence and active status.
2. Compute authoritative outstanding balance from ledger: $\sum(\text{debit}) - \sum(\text{credit})$.
3. Reject payment if $\text{amount} \le 0$ or $\text{amount} > \text{outstanding}$ (overpayment protection).
4. Generate sequential `receipt_number` (`PAY-XXXXXX`).
5. Retrieve unpaid and partially paid purchases ordered by `created_at ASC` (FIFO).
6. Allocate payment sequentially across oldest open purchases, updating each purchase's `paid_amount` and transition status (`PAID` or `PARTIALLY_PAID`).
7. Append `supplier_ledger_entries` record with `entry_type = 'PAYMENT'`, `credit = amount`.
8. Commit transaction.

---

## 5. Tauri IPC Command Interface

Registered in `src-tauri/src/lib.rs`:

| Command | Purpose |
|---|---|
| `supplier_create` | Creates a new supplier profile with sequential `SUP-XXXXXX` code |
| `supplier_update` | Updates supplier profile, contact info, and credit terms |
| `supplier_get_by_id` | Fetches a supplier by UUID |
| `supplier_get_detail` | Returns supplier profile, outstanding balance, and recent records |
| `supplier_list` | Lists suppliers with optional search and active filters |
| `supplier_search` | Searches suppliers by name, company, code, or phone |
| `supplier_get_ledger` | Retrieves raw append-only ledger entries |
| `supplier_get_statement` | Generates chronological supplier statement with opening/closing balance |
| `supplier_get_balance` | Authoritative outstanding payable balance query |
| `supplier_record_payment` | Records supplier payment with FIFO allocation and ledger credit |
| `supplier_deactivate` | Deactivates supplier without deleting historical financial records |
| `purchase_complete` | Atomically completes purchase, stocks in inventory, and updates payable |
| `purchase_get_by_id` | Fetches purchase order by UUID |
| `purchase_get_by_number` | Fetches purchase order by `PUR-XXXXXX` |
| `purchase_list` | Lists purchase orders with status and date filtering |
| `purchase_get_lines` | Retrieves historical purchase lines for an order |

---

## 6. Frontend Integration

- `frontend/src/lib/tauri/tauriClient.ts`: Strongly typed wrappers and TypeScript interfaces for all 16 commands.
- `frontend/src/services/supplier.api.ts`: Full integration with `tauriClient`, mapping data models for supplier management and drawers.
- `frontend/src/services/purchase.api.ts`: Native purchasing service API.
- `frontend/src/services/ledger.api.ts`: Implemented native Tauri handling for `partyType === 'SUPPLIER'`, routing to `supplierGetStatement` and `supplierRecordPayment`.
- `frontend/src/features/purchasing/components/PurchaseOrderModal.tsx`: Complete native procurement modal featuring supplier selection, line items with live inventory matching, financial discount and payment breakdown, live payable preview, and atomic purchase checkout.

---

## 7. Verification Results

- `cargo test`: 58 passed, 0 failed.
  - Phase 14 & 15 tests: Passed with 0 regressions.
  - Migration 006 tests: Passed.
  - Supplier service tests (creation, sequential codes, update, deactivation): Passed.
  - Purchase service tests (cash purchase, credit purchase & limit, FIFO payment, atomic rollback): Passed.
- `cargo check`: Clean (0 errors, 0 warnings).
- `npm run build`: Clean production bundle built.
- `npm run lint`: Clean (0 errors).
- Legacy forensic audit: 0 active executable occurrences of Axios, fetch, Express, MongoDB, Electron, or tenantId.
- Protected migrations: Migrations 001–005 100% untouched.
