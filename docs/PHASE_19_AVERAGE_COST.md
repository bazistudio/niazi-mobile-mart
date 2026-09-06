# PHASE 19 — PRODUCT AVERAGE COST & LAST PURCHASE COST FOUNDATION

## 1. Overview & Mission

Phase 19 establishes the permanent inventory costing foundation for **Niazi Mobile Mart**.
The system natively tracks two independent product cost metrics:
1. **Average Cost (`average_cost`)**: Weighted-average acquisition cost of inventory across all purchases.
2. **Last Purchase Cost (`purchase_price`)**: The most recent completed purchase unit cost.

The system remains an offline-first desktop ERP powered by Tauri v2 + Rust + SQLite.

---

## 2. Core Cost Definitions & Formulas

### Average Cost
Average Cost reflects the current weighted-average acquisition cost of inventory:
```text
new_average_cost =
    (
        existing_stock × existing_average_cost
        +
        received_quantity × purchase_unit_cost
    )
    ÷
    new_total_stock
```

### Last Purchase Cost
`products.purchase_price` is preserved as the Last Purchase Cost.
After a completed purchase:
- `products.average_cost = newly calculated weighted average`
- `products.purchase_price = incoming purchase line unit cost`

---

## 3. Whole-PKR & Rounding Policy

Authoritative financial values remain 64-bit signed integers (`i64` in Rust / SQLite `INTEGER`).
Floating-point money, decimal types, and paisa/minor units are strictly forbidden.

### Deterministic Rounding Rule
For positive inventory costs:
```text
quotient  = total_cost / new_total_stock
remainder = total_cost % new_total_stock

if remainder * 2 >= new_total_stock:
    round up (quotient + 1)
else:
    round down (quotient)
```

Example:
- Existing: 10 units @ PKR 100 = PKR 1,000
- New Purchase: 10 units @ PKR 105 = PKR 1,050
- Total: 20 units, PKR 2,050
- 2050 / 20 = 102 remainder 10
- 10 * 2 >= 20 -> rounded up to PKR 103

---

## 4. Zero-Stock Case

If `existing_stock <= 0`:
```text
new_average_cost = incoming_unit_cost
```
Example:
- Stock = 0
- Purchase = 10 units @ PKR 100
- Average Cost = PKR 100, Last Purchase Cost = PKR 100, Stock = 10

---

## 5. Purchase Transaction Integration & Atomicity

Average Cost and Last Purchase Cost updates execute inside the single atomic SQLite purchase transaction alongside:
1. Purchase header insertion (`purchases`)
2. Purchase lines insertion (`purchase_lines`)
3. Stock quantity increase (`stock`)
4. Stock movement audit insertion (`stock_movements`, direction `IN`)
5. Product costing update (`products.average_cost`, `products.purchase_price`)
6. Supplier payable ledger update (`supplier_ledger_entries`)
7. Cash movement (`cash_movements`, direction `OUT` if paid in cash)

If any operation fails, the entire transaction rolls back cleanly, leaving product stock and costs unchanged.

---

## 6. Purchase Returns & Sales Returns

- **Purchase Returns**: Stock is reduced using the historical acquisition cost of the purchase line (`purchase_lines.unit_cost`). The current product `average_cost` is NOT blindly rewritten or corrupted.
- **Sales Returns**: Stock is returned to inventory. Historical sales costing preserves the cost snapshot established at sale completion.

---

## 7. Migration 009 (`009_product_average_cost`)

Migration 009 was added additively to `src-tauri/src/db/migrations.rs`:
```sql
ALTER TABLE products ADD COLUMN average_cost INTEGER NOT NULL DEFAULT 0 CHECK(average_cost >= 0);
UPDATE products SET average_cost = purchase_price WHERE average_cost = 0;
```
Existing migrations 001–008 are untouched and fully preserved. Existing products are initialized using their established `purchase_price`.

---

## 8. Frontend UI & Display

- **Products Table (`ProductTable.tsx`)**:
  Displays:
  - **Avg Cost**: `PKR xxx`
  - **Last Cost**: `PKR xxx`
- **Product Details Drawer (`ProductDetailsDrawer.tsx`)**:
  Displays:
  - **Average Cost**: `PKR xxx`
  - **Last Purchase Cost**: `PKR xxx`
  - **Inventory Value**: `PKR (stock × average_cost)`
  - **Estimated Margin**: Percentage based on selling price vs cost.
- All displays use whole Pakistani Rupees formatted without decimals or paisas.

---

## 9. Test Verification Matrix

All 78 unit and integration tests pass with 0 failures:
- **Test 1**: Initial zero-stock purchase sets average cost and last purchase cost.
- **Test 2**: Equal quantity weighted-average calculation with rounding.
- **Test 3 & 4**: Unequal quantity and deterministic rounding upward/downward.
- **Test 5**: Multiple sequential purchases cost evolution.
- **Test 6**: Independence of Average Cost and Last Purchase Cost.
- **Test 7**: Zero stock initializes incoming unit cost.
- **Test 8**: Purchase rollback preserves stock and costs.
- **Test 9**: Purchase returns preserve inventory costing.
- **Test 10 & 11**: Inactive product and credit-limit failure atomic rollbacks preserve costs.
- **Regressions**: Phase 14, 15, 16, 17, and 18 tests all pass.
