# PHASE 20 — COGS, GROSS PROFIT & GROSS MARGIN FOUNDATION

## 1. Overview & Mission

Phase 20 establishes the permanent, authoritative profitability foundation for **Niazi Mobile Mart**.
Connecting completed sales and completed sales returns to:
1. **Historical Cost of Goods Sold (COGS)**
2. **Gross Revenue & Discounts**
3. **Net Revenue**
4. **Gross Profit**
5. **Gross Margin %**
6. **Product, Sale, Daily, and Period Profitability**
7. **Live Dashboard Profitability KPIs**

The system remains strictly offline-first, desktop-native, and SQLite-based (Tauri v2 + Rust + SQLite + React 19).

---

## 2. Historical Cost Snapshot Model (Authoritative Principle)

The fundamental architectural principle of Phase 20 is:
- `product.average_cost` represents the product's **current average cost**.
- `sale_lines.cost_price_snapshot` represents the **historical cost at the exact time the sale was completed**.

Once a sale is completed:
- `sale_lines.cost_price_snapshot` is permanently immutable.
- Future changes to `product.average_cost` (from new purchases, inventory adjustments, or supplier price changes) never modify past sale snapshots.
- Historical COGS and gross profits remain reproducible and audit-compliant.

---

## 3. Mathematical Definitions & Financial Calculations

All financial values are whole Pakistani Rupees represented by 64-bit signed integers (`i64` in Rust, `INTEGER` in SQLite). Floating-point arithmetic is strictly prohibited.

### 3.1 Formulas
- **Gross Revenue**:
  $$\text{Gross Revenue} = \sum (\text{unit\_sale\_price} \times \text{quantity})$$
- **Discounts**:
  $$\text{Discounts} = \text{total line and order discounts}$$
- **Net Revenue**:
  $$\text{Net Revenue} = \text{Gross Revenue} - \text{Discounts}$$
- **Historical COGS**:
  $$\text{COGS} = \sum (\text{quantity} \times \text{cost\_price\_snapshot})$$
- **Gross Profit**:
  $$\text{Gross Profit} = \text{Net Revenue} - \text{COGS}$$
- **Gross Margin %**:
  Deterministic checked integer calculation:
  $$\text{Gross Margin} = \begin{cases} 0 & \text{if Net Revenue} \le 0 \\ (\text{Gross Profit} \times 100) / \text{Net Revenue} & \text{if Net Revenue} > 0 \end{cases}$$
  Uses checked arithmetic (`checked_mul`, `checked_div`, `checked_sub`) to prevent runtime overflow or division-by-zero panics.

---

## 4. Sales Returns Profitability Reversal

When a completed sales return occurs:
- **Revenue Reversal**: `sales_return_lines.return_amount`
- **COGS Reversal**:
  $$\text{Returned Quantity} \times \text{original sale\_lines.cost\_price\_snapshot}$$

The calculation strictly follows:
$$\text{sales\_return\_lines.sale\_line\_id} \longrightarrow \text{original sale\_lines.cost\_price\_snapshot}$$

Current `product.average_cost` is **never** used for sales return COGS calculations. Net profitability reflects:
$$\text{Net Revenue} = \text{Sales Net Revenue} - \text{Return Revenue}$$
$$\text{Net COGS} = \text{Sales COGS} - \text{Return COGS Reversal}$$
$$\text{Gross Profit} = \text{Net Revenue} - \text{Net COGS}$$

---

## 5. Cancelled & Voided Transactions

- Cancelled and voided sales (`sale_status = 'VOIDED'`) are strictly excluded from profitability metrics.
- They contribute:
  $$\text{Revenue} = 0, \quad \text{COGS} = 0, \quad \text{Gross Profit} = 0$$
- Only completed sales (`sale_status = 'COMPLETED'`) and completed returns (`status = 'COMPLETED'`) enter profitability calculations.

---

## 6. Financial Separation Principles

The application maintains strict boundaries between independent financial concepts:
1. **Cash $\neq$ Revenue**:
   - Cash sale generates Revenue, COGS, and Cash IN.
   - Credit sale generates Revenue and COGS, but **NO** Cash movement (records Customer Receivable in customer ledger).
   - Profitability is derived strictly from completed sales and returns, never from cash drawer movements.
2. **Customer Ledger $\neq$ Revenue**:
   - Customer payment of past balance increases Cash and reduces Customer Receivable; it produces **0** revenue and **0** COGS.
3. **Supplier Ledger $\neq$ COGS**:
   - Supplier payments or payables track liability; COGS is strictly inventory cost snapshot upon sale.

---

## 7. Migration 010 (`010_profitability_and_cogs`)

Migration 010 was additively registered in `src-tauri/src/db/migrations.rs`:
```sql
CREATE INDEX IF NOT EXISTS idx_sales_status_created
    ON sales(sale_status, created_at);

CREATE INDEX IF NOT EXISTS idx_sales_returns_status_created
    ON sales_returns(status, created_at);

CREATE INDEX IF NOT EXISTS idx_sale_lines_product_cost
    ON sale_lines(product_id, cost_price_snapshot);

CREATE INDEX IF NOT EXISTS idx_sales_return_lines_sale_line
    ON sales_return_lines(sale_line_id);
```

### Legacy Zero Snapshot Backfill
For legacy rows created prior to cost tracking where `cost_price_snapshot = 0`:
- Backfill safely populates non-zero cost using product purchase pricing:
  ```sql
  UPDATE sale_lines
  SET cost_price_snapshot = (
      SELECT COALESCE(
          NULLIF(products.average_cost, 0),
          products.purchase_price
      )
      FROM products
      WHERE products.id = sale_lines.product_id
  )
  WHERE cost_price_snapshot = 0
    AND EXISTS (
        SELECT 1 FROM products
        WHERE products.id = sale_lines.product_id
          AND (products.average_cost > 0 OR products.purchase_price > 0)
    );
  ```
- Any existing non-zero snapshot is never modified.
- Migration is strictly idempotent and safe for repeated execution.

---

## 8. Repositories & Services Architecture

### 8.1 Domain (`src-tauri/src/domain/profit.rs`)
DTOs defined with integer fields:
- `PeriodProfitabilityDto`: Period totals with sales and return counts.
- `DailyProfitabilityDto`: Daily breakdown by `YYYY-MM-DD`.
- `ProductProfitabilityDto`: Product-level revenue, returns, net quantity, COGS, and profit.
- `SaleProfitabilityDto`: Invoice-level profitability.
- `DashboardProfitSummaryDto`: Metrics for today, this month, and all time.
- `SaleResultDto` (in `sales.rs`): Extended with `cogs`, `gross_profit`, `gross_margin`.

### 8.2 Repository (`src-tauri/src/repositories/profit_repository.rs`)
`SQLiteProfitRepository` executes authoritative queries against `sales`, `sale_lines`, `sales_returns`, and `sales_return_lines` with optional branch and date filtering.

### 8.3 Service (`src-tauri/src/services/profit_service.rs`)
`ProfitService` validates parameters, handles boundary conditions, executes checked integer arithmetic, and wraps repository calls.

### 8.4 Tauri Commands (`src-tauri/src/commands/profit.rs`)
Exposes 5 commands:
- `profit_get_period`
- `profit_get_daily`
- `profit_get_product`
- `profit_get_sale`
- `profit_get_dashboard_summary`

---

## 9. Frontend Integration

1. **Tauri Client (`frontend/src/lib/tauri/tauriClient.ts`)**:
   - TypeScript interfaces mirroring Rust DTOs.
   - Wrappers: `profitGetPeriod`, `profitGetDaily`, `profitGetProduct`, `profitGetSale`, `profitGetDashboardSummary`.
2. **Dashboard API (`frontend/src/services/dashboard.api.ts`)**:
   - `dashboardApi.getMetrics` queries live SQLite profitability via `profitGetDashboardSummary()`.
3. **Product Details Drawer (`ProductDetailsDrawer.tsx`)**:
   - Clearly distinguishes **Estimated Margin** (Current `sale_price - average_cost`) from **Realized Gross Margin** (Historical completed sales net revenue vs historical COGS).

---

## 10. Quality Gate Results

- **Rust Tests**: 92 passed, 0 failed.
- **Rust Check**: 0 errors, 0 warnings.
- **Frontend Build**: `vite v6.4.3` production build passed.
- **Frontend Lint**: ESLint passed with 0 errors.
- **Legacy Architecture Audit**: 0 forbidden legacy strings (`axios`, `mongodb`, `supabase`, `electron`, `express`, `localhost:5000`, `/api/v1`).
