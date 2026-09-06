# PHASE 17 — CASH MANAGEMENT, EXPENSES & DAILY CLOSING

## 1. Executive Summary

Phase 17 implements the authoritative, native SQLite-backed **Cash Management, Expenses, and Daily Closing** subsystem for Niazi Mobile Mart desktop application.

Operational financial flow:
```
SALE
  ↓
Cash / Customer Payment
  ↓
Cash IN

PURCHASE
  ↓
Supplier Payment
  ↓
Cash OUT

EXPENSE
  ↓
Cash OUT

              ↓
      DAILY CASH SESSION
              ↓
      EXPECTED CASH
              ↓
       PHYSICAL COUNT
              ↓
          VARIANCE
              ↓
        DAY CLOSING
```

---

## 2. Permanent Architecture Alignment

- **Runtime**: React 19 + Vite $\rightarrow$ Tauri v2 `invoke()` $\rightarrow$ Rust Commands $\rightarrow$ Rust Services $\rightarrow$ Rust Repositories $\rightarrow$ SQLite (`rusqlite`).
- **Authoritative Source of Truth**: Local SQLite database with WAL mode and foreign keys enabled.
- **Zero Legacy Protocol**: Zero HTTP endpoints, zero Axios, zero Express/Node servers, zero Electron, zero MongoDB, zero cloud sync/tenantId.
- **Strict Boundary**: Physical cash calculations originate strictly from Rust/SQLite transactions. Non-cash payments (e.g. Bank, Online, Credit) NEVER affect physical cash drawer reserves.

---

## 3. Database Migration 007 (`007_cash_management_and_daily_closing`)

Migrations 001–006 remain completely untouched. Migration 007 adds:

### 3.1. `expense_categories`
- `id` TEXT PRIMARY KEY (UUID v4)
- `name` TEXT NOT NULL UNIQUE (case-insensitive via collation / unique index)
- `description` TEXT
- `is_active` INTEGER NOT NULL DEFAULT 1
- `created_at` TEXT NOT NULL
- `updated_at` TEXT NOT NULL
- Seeded with 8 operational categories:
  - Rent, Electricity, Internet, Staff Salary, Transport, Maintenance, Office Supplies, Miscellaneous.

### 3.2. `expenses`
- `id` TEXT PRIMARY KEY (UUID v4)
- `expense_number` TEXT NOT NULL UNIQUE (`EXP-000001`, `EXP-000002`, etc.)
- `category_id` TEXT NOT NULL REFERENCES `expense_categories(id)`
- `branch_id` TEXT NOT NULL REFERENCES `branches(id)`
- `amount` INTEGER NOT NULL CHECK(amount > 0) (whole PKR)
- `payment_method` TEXT NOT NULL
- `description` TEXT
- `notes` TEXT
- `expense_date` TEXT NOT NULL
- `status` TEXT NOT NULL CHECK(status IN ('COMPLETED', 'CANCELLED'))
- `performed_by` TEXT REFERENCES `users(id)`
- `created_at` TEXT NOT NULL
- `updated_at` TEXT NOT NULL

### 3.3. `cash_sessions`
- `id` TEXT PRIMARY KEY (UUID v4)
- `branch_id` TEXT NOT NULL REFERENCES `branches(id)`
- `business_date` TEXT NOT NULL (ISO 8601 Date: `YYYY-MM-DD`)
- `opening_cash` INTEGER NOT NULL CHECK(opening_cash >= 0)
- `expected_closing_cash` INTEGER (authoritatively calculated at close / summary)
- `actual_closing_cash` INTEGER
- `cash_variance` INTEGER (`actual_closing_cash - expected_closing_cash`)
- `status` TEXT NOT NULL CHECK(status IN ('OPEN', 'CLOSED'))
- `opened_at` TEXT NOT NULL
- `closed_at` TEXT
- `opened_by` TEXT NOT NULL REFERENCES `users(id)`
- `closed_by` TEXT REFERENCES `users(id)`
- `notes` TEXT
- **Unique Partial Index**: `CREATE UNIQUE INDEX idx_one_open_session_per_branch ON cash_sessions(branch_id) WHERE status = 'OPEN';` guarantees at most one open session per branch at the SQLite engine level.

### 3.4. `cash_movements`
- Append-only, auditable cash ledger:
  - `id` TEXT PRIMARY KEY (UUID v4)
  - `session_id` TEXT REFERENCES `cash_sessions(id)`
  - `branch_id` TEXT NOT NULL REFERENCES `branches(id)`
  - `movement_type` TEXT NOT NULL CHECK(movement_type IN ('SALE_PAYMENT', 'CUSTOMER_PAYMENT', 'SUPPLIER_PAYMENT', 'EXPENSE', 'CASH_ADJUSTMENT'))
  - `direction` TEXT NOT NULL CHECK(direction IN ('IN', 'OUT'))
  - `amount` INTEGER NOT NULL CHECK(amount > 0)
  - `reference_id` TEXT
  - `reference_number` TEXT
  - `payment_method` TEXT NOT NULL DEFAULT 'CASH'
  - `description` TEXT NOT NULL
  - `performed_by` TEXT REFERENCES `users(id)`
  - `created_at` TEXT NOT NULL

---

## 4. Operational Financial Flows & Transaction Boundaries

All operations are executed within single SQLite transactions (`conn.transaction()`):

### 4.1. Cash Sale
```
sale (INSERT)
  ↓
sale_lines (INSERT)
  ↓
sale_payments (INSERT with method = 'CASH')
  ↓
stock deduction (UPDATE stock)
  ↓
stock_movements (INSERT type = 'SALE')
  ↓
cash_movements (INSERT type = 'SALE_PAYMENT', direction = 'IN')
  ↓
COMMIT (or complete ROLLBACK on any failure)
```

### 4.2. Customer Cash Payment
```
customer payment (INSERT)
  ↓
FIFO allocation across unpaid sales (UPDATE sale_payments / sales)
  ↓
customer_ledger_entries (INSERT CREDIT)
  ↓
cash_movements (INSERT type = 'CUSTOMER_PAYMENT', direction = 'IN')
  ↓
COMMIT
```

### 4.3. Supplier Cash Payment / Purchase Cash Settlement
```
supplier payment (INSERT / purchase completion with paid_amount > 0)
  ↓
FIFO allocation across unpaid purchases (UPDATE purchases)
  ↓
supplier_ledger_entries (INSERT DEBIT/CREDIT)
  ↓
cash_movements (INSERT type = 'SUPPLIER_PAYMENT', direction = 'OUT')
  ↓
COMMIT
```

### 4.4. Cash Expense & Cancellation
```
expense (INSERT status = 'COMPLETED')
  ↓
cash_movements (INSERT type = 'EXPENSE', direction = 'OUT')
  ↓
COMMIT
```
**Cancellation**:
```
expense (UPDATE status = 'CANCELLED', notes appended with reason)
  ↓
cash_movements (INSERT compensating reversal, direction = 'IN', description = 'Reversal of EXP-...')
  ↓
COMMIT
```
Historical financial records are NEVER physically deleted.

### 4.5. Cash Drawer Adjustments
- Movement type: `CASH_ADJUSTMENT`.
- Direction: `IN` (float addition, surplus adjustment) or `OUT` (petty cash draw, shortage correction).
- Requires an active `OPEN` cash session for the branch.
- Mandatory reason/audit trail.

### 4.6. Daily Session Reconciliation & Closing
1. Verifies session is currently `OPEN`.
2. Computes Authoritative Expected Cash:
   $$\text{Expected Closing Cash} = \text{Opening Cash} + \sum \text{Cash IN Movements} - \sum \text{Cash OUT Movements}$$
3. Computes Authoritative Variance:
   $$\text{Variance} = \text{Actual Closing Cash} - \text{Expected Closing Cash}$$
   - Variance is NEVER normalized to zero.
4. Atomically updates session:
   - `expected_closing_cash`
   - `actual_closing_cash`
   - `cash_variance`
   - `status = 'CLOSED'`
   - `closed_at = UTC NOW`
   - `closed_by = user_id`
   - `notes`

---

## 5. Prevention of Double Counting & Non-Cash Isolation

- **Non-Cash Transactions**: Credit sales, unpaid receivables, credit purchases, bank payments, and online transfers DO NOT generate cash movements.
- **Partial Cash Payments**: Only the actual CASH component generates a cash movement. Total invoice amount is never assumed to be cash.

---

## 6. Frontend UI Implementation

1. **Expenses Feature**:
   - `frontend/src/features/expenses/`:
     - Category filter (dynamically loaded from `expense_categories`).
     - Payment method filter (`CASH`, `BANK`, `ONLINE`).
     - Status filter (`COMPLETED`, `CANCELLED`).
     - Date range filter.
     - Search by number, description, category.
     - Create Expense modal with real category selection and validation.
     - Expense Detail modal with full field breakdown.
     - Reversible cancellation action with prompt for audit reason.
     - Authoritative cash flow metrics card connected to `cashApi.getDailySummary()`.
2. **Cash Management Feature**:
   - `frontend/src/features/cash/`:
     - `CashSessionActiveCard`: Displays active session status, opening cash, total cash in (+Sales, +Customer payments, +Adjustments), total cash out (-Supplier payments, -Expenses, -Adjustments), and authoritative expected cash.
     - `CashSessionOpenModal`: Opens new session with physical opening float.
     - `CashSessionCloseModal`: Compares authoritative expected cash against user physical count, calculating and color-coding variance in real-time.
     - `CashAdjustmentModal`: Records auditable IN/OUT drawer adjustments.
     - `CashMovementsTable`: Real-time append-only movement ledger.
     - `CashSessionHistoryTable`: History of all past closed sessions with variances.
3. **Route & Navigation**:
   - Route: `/dashboard/shop-admin/cash` and `/dashboard/shop-admin/cash-management` in `shopAdminRoutes.tsx`.
   - Navigation: Added to Operations in `shop-admin-navigation.ts` with `Coins` icon.

---

## 7. Testing & Verification

- **Backend Tests**: 68 tests passing (0 failed, 0 ignored).
  - Migration 007 idempotency and constraints.
  - Expense categories lifecycle and unique naming.
  - Sequential expense numbering (`EXP-000001`).
  - Cash expense creation, cash movement generation, and cancellation compensation.
  - Cash session lifecycle, single open session constraint per branch.
  - Expected cash calculation, actual cash, positive/negative/zero variance.
  - Cash adjustments and closed session mutation prevention.
  - Non-cash isolation.
  - Atomic transaction rollbacks.
  - Full end-to-end operational financial flow.
- **Regressions**: Phase 14 (Sales/Invoices), Phase 15 (Customers/Ledger), Phase 16 (Suppliers/Purchasing) all passed without error.
- **Frontend Verification**:
  - `npm run build`: PASS (Vite v6.4.3 production build succeeded in 24s).
  - `npm run lint`: PASS (ESLint 0 errors, 0 warnings).
- **Legacy Audit**: 0 occurrences of Axios, fetch, Express, MongoDB, Electron, localhost backend, tenantId.

---

## 8. Limitations & Explicit Exclusions

Phase 17 is operational cash management and daily drawer closing. In strict accordance with Phase 17 specifications, the following are intentionally excluded:
- General Ledger & Chart of Accounts.
- Full double-entry accounting engine.
- P&L and Balance Sheet financial statements.
- Tax engine and payroll.
- Bank reconciliation.
