use chrono::Utc;
use rusqlite::params;
use uuid::Uuid;

use crate::db::connection::DatabaseConnection;
use crate::db::errors::DbError;
use crate::db::transaction::with_transaction;
use crate::domain::cash::{CashMovement, CashMovementDirection, CashMovementType};
use crate::domain::inventory::{StockMovement, StockMovementType};
use crate::domain::organization::DEFAULT_MAIN_BRANCH_ID;
use crate::domain::purchases::{
    CompletePurchaseDto, Purchase, PurchaseFilterDto, PurchaseLine, PurchasePaymentStatus,
    PurchaseResultDto, PurchaseStatus,
};
use crate::domain::supplier::{
    AllocatedPurchaseDto, RecordSupplierPaymentDto, SupplierLedgerEntry, SupplierLedgerEntryType,
    SupplierPaymentResultDto,
};
use crate::errors::{AppError, AppResult};
use crate::repositories::inventory_repository::SQLiteInventoryRepository;
use crate::repositories::{
    SQLiteCashRepository, SQLitePurchaseRepository, SQLiteSupplierRepository,
};

#[derive(Clone)]
pub struct PurchaseService {
    db: DatabaseConnection,
    purchase_repo: SQLitePurchaseRepository,
}

impl PurchaseService {
    pub fn new(db: DatabaseConnection) -> Self {
        Self {
            purchase_repo: SQLitePurchaseRepository::new(db.clone()),
            db,
        }
    }

    /// Atomically completes a supplier purchase inside a single SQLite transaction
    pub async fn complete_purchase(
        &self,
        user_id: Option<&str>,
        dto: CompletePurchaseDto,
    ) -> AppResult<PurchaseResultDto> {
        if dto.items.is_empty() {
            return Err(AppError::Validation(
                "Cannot complete purchase with no items".to_string(),
            ));
        }

        let branch_id = dto
            .branch_id
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or(DEFAULT_MAIN_BRANCH_ID)
            .to_string();

        let supplier_id = dto.supplier_id.trim().to_string();
        if supplier_id.is_empty() {
            return Err(AppError::Validation(
                "Supplier ID is required for a purchase".to_string(),
            ));
        }

        let user_id_owned = user_id.map(str::to_string);

        let result = with_transaction(&self.db, move |tx| {
            let now = Utc::now().to_rfc3339();

            // 1. Validate Supplier
            let supplier = SQLiteSupplierRepository::get_by_id_in_tx(tx, &supplier_id)?
                .ok_or_else(|| DbError::NotFound(format!("Supplier '{supplier_id}' not found")))?;

            if !supplier.is_active {
                return Err(DbError::ValidationError(format!(
                    "Supplier '{}' is inactive. Cannot process purchase.",
                    supplier.name
                )));
            }

            // 2. Validate Branch
            let branch_active: bool = tx
                .query_row(
                    "SELECT is_active FROM branches WHERE id = ?1",
                    params![branch_id],
                    |row| {
                        let a: i64 = row.get(0)?;
                        Ok(a == 1)
                    },
                )
                .map_err(|_| DbError::NotFound(format!("Branch '{branch_id}' not found")))?;

            if !branch_active {
                return Err(DbError::ValidationError(format!(
                    "Branch '{branch_id}' is inactive. Cannot process purchase."
                )));
            }

            // 3. Validate and resolve products and line totals
            struct PreparedLine {
                product_id: String,
                product_name: String,
                sku: String,
                quantity: i64,
                unit_cost: i64,
                discount: i64,
                line_total: i64,
            }

            let mut prepared_lines = Vec::with_capacity(dto.items.len());
            let mut subtotal: i64 = 0;

            for item in &dto.items {
                if item.quantity <= 0 {
                    return Err(DbError::ValidationError(
                        "Item quantity must be greater than 0".to_string(),
                    ));
                }

                let line_disc = item.discount.unwrap_or(0).max(0);

                let (prod_name, prod_sku, default_cost, is_prod_active): (String, String, i64, bool) = tx
                    .query_row(
                        "SELECT name, sku, purchase_price, is_active FROM products WHERE id = ?1",
                        params![item.product_id],
                        |row| {
                            let active_int: i64 = row.get(3)?;
                            Ok((row.get(0)?, row.get(1)?, row.get(2)?, active_int == 1))
                        },
                    )
                    .map_err(|_| DbError::NotFound(format!("Product '{}' not found", item.product_id)))?;

                if !is_prod_active {
                    return Err(DbError::ValidationError(format!(
                        "Product '{prod_name}' is inactive. Cannot process purchase."
                    )));
                }

                let unit_cost = match item.unit_cost {
                    Some(c) => {
                        if c < 0 {
                            return Err(DbError::ValidationError(
                                "Unit cost cannot be negative".to_string(),
                            ));
                        }
                        c
                    }
                    None => default_cost,
                };

                let gross = unit_cost.checked_mul(item.quantity).ok_or_else(|| {
                    DbError::ValidationError("Line total calculation overflow".to_string())
                })?;

                if line_disc > gross {
                    return Err(DbError::ValidationError(format!(
                        "Line discount {line_disc} cannot exceed gross total {gross}"
                    )));
                }

                let line_total = gross - line_disc;
                subtotal = subtotal.checked_add(line_total).ok_or_else(|| {
                    DbError::ValidationError("Subtotal calculation overflow".to_string())
                })?;

                prepared_lines.push(PreparedLine {
                    product_id: item.product_id.clone(),
                    product_name: prod_name,
                    sku: prod_sku,
                    quantity: item.quantity,
                    unit_cost,
                    discount: line_disc,
                    line_total,
                });
            }

            // 4. Calculate total and payment / credit breakdown
            let discount = dto.discount.unwrap_or(0).max(0);
            if discount > subtotal {
                return Err(DbError::ValidationError(format!(
                    "Purchase discount {discount} cannot exceed subtotal {subtotal}"
                )));
            }

            let total_amount = subtotal - discount;

            let paid_amount = match dto.paid_amount {
                Some(p) => {
                    if p < 0 {
                        return Err(DbError::ValidationError(
                            "Paid amount cannot be negative".to_string(),
                        ));
                    }
                    if p > total_amount {
                        return Err(DbError::ValidationError(format!(
                            "Paid amount {p} cannot exceed purchase total {total_amount}"
                        )));
                    }
                    p
                }
                None => 0, // Default to unpaid credit purchase if paid_amount omitted
            };

            let credit_amount = total_amount - paid_amount;

            let payment_status = if paid_amount == total_amount {
                PurchasePaymentStatus::Paid
            } else if paid_amount == 0 {
                PurchasePaymentStatus::Unpaid
            } else {
                PurchasePaymentStatus::PartiallyPaid
            };

            // 5. Enforce Supplier Credit Limit if credit purchase
            let current_outstanding =
                SQLiteSupplierRepository::get_outstanding_balance_in_tx(tx, &supplier.id)?;

            if credit_amount > 0 && supplier.credit_limit > 0 {
                let projected_balance = current_outstanding
                    .checked_add(credit_amount)
                    .ok_or_else(|| {
                        DbError::ValidationError("Credit balance calculation overflow".to_string())
                    })?;

                if projected_balance > supplier.credit_limit {
                    return Err(DbError::ValidationError(format!(
                        "Purchase exceeds credit limit of Rs {}. Current payable: Rs {}, new credit: Rs {}, projected: Rs {}",
                        supplier.credit_limit, current_outstanding, credit_amount, projected_balance
                    )));
                }
            }

            // 6. Generate Purchase Number & UUID
            let purchase_number = SQLitePurchaseRepository::next_purchase_number_in_tx(tx)?;
            let purchase_id = Uuid::new_v4().to_string();

            let purchase = Purchase {
                id: purchase_id.clone(),
                purchase_number: purchase_number.clone(),
                supplier_id: supplier.id.clone(),
                branch_id: branch_id.clone(),
                subtotal,
                discount,
                total_amount,
                paid_amount,
                credit_amount,
                payment_status,
                status: PurchaseStatus::Completed,
                notes: dto.notes.clone(),
                performed_by: user_id_owned.clone(),
                created_at: now.clone(),
                updated_at: now.clone(),
            };

            SQLitePurchaseRepository::insert_purchase_in_tx(tx, &purchase)?;

            let p_method = dto.payment_method.as_deref().unwrap_or("CASH").trim().to_uppercase();

            // 7. Insert Purchase Lines & Update Stock & Snapshot
            let mut domain_lines = Vec::with_capacity(prepared_lines.len());

            for line in prepared_lines {
                let line_id = Uuid::new_v4().to_string();

                let p_line = PurchaseLine {
                    id: line_id,
                    purchase_id: purchase_id.clone(),
                    product_id: line.product_id.clone(),
                    product_name_snapshot: line.product_name,
                    sku_snapshot: line.sku,
                    quantity: line.quantity,
                    unit_cost: line.unit_cost,
                    discount: line.discount,
                    line_total: line.line_total,
                    created_at: now.clone(),
                };

                // Read current stock for branch
                let current_stock: i64 = tx
                    .query_row(
                        "SELECT quantity FROM stock WHERE product_id = ?1 AND branch_id = ?2",
                        params![line.product_id, branch_id],
                        |row| row.get(0),
                    )
                    .unwrap_or(0);

                let resulting_stock = current_stock + line.quantity;

                SQLiteInventoryRepository::set_stock_in_tx(
                    tx,
                    &line.product_id,
                    &branch_id,
                    resulting_stock,
                    &now,
                )?;

                let movement = StockMovement {
                    id: Uuid::new_v4().to_string(),
                    product_id: line.product_id.clone(),
                    branch_id: branch_id.clone(),
                    movement_type: StockMovementType::In,
                    quantity: line.quantity,
                    previous_stock: current_stock,
                    resulting_stock,
                    reason: Some(format!("Supplier Purchase {purchase_number}")),
                    performed_by: user_id_owned.clone(),
                    reference_id: Some(purchase_id.clone()),
                    created_at: now.clone(),
                };

                SQLiteInventoryRepository::insert_movement_in_tx(tx, &movement)?;

                // Update catalog purchase_price to latest cost
                tx.execute(
                    "UPDATE products SET purchase_price = ?1, updated_at = ?2 WHERE id = ?3",
                    params![line.unit_cost, now, line.product_id],
                )
                .map_err(|e| DbError::QueryError(format!("Failed to update product cost: {e}")))?;

                domain_lines.push(p_line);
            }

            SQLitePurchaseRepository::insert_purchase_lines_in_tx(tx, &domain_lines)?;

            // 7b. If paid_amount > 0 and payment method is CASH, record Cash Movement OUT
            if paid_amount > 0 && p_method == "CASH" {
                let open_session_id = SQLiteCashRepository::get_open_session_id_in_tx(tx, &branch_id)?;
                let cash_movement = CashMovement {
                    id: Uuid::new_v4().to_string(),
                    session_id: open_session_id,
                    branch_id: branch_id.clone(),
                    movement_type: CashMovementType::SupplierPayment,
                    direction: CashMovementDirection::Out,
                    amount: paid_amount,
                    reference_id: Some(purchase_id.clone()),
                    reference_number: Some(purchase_number.clone()),
                    payment_method: "CASH".to_string(),
                    description: format!("Purchase Payment {}", purchase_number),
                    performed_by: user_id_owned.clone(),
                    performed_by_name: None,
                    created_at: now.clone(),
                };
                SQLiteCashRepository::insert_movement_in_tx(tx, &cash_movement)?;
            }

            // 8. If credit > 0, insert Supplier Ledger DEBIT
            let supplier_balance_after = if credit_amount > 0 {
                let new_balance = current_outstanding + credit_amount;
                let ledger_entry = SupplierLedgerEntry {
                    id: Uuid::new_v4().to_string(),
                    supplier_id: supplier.id.clone(),
                    reference_id: Some(purchase_id.clone()),
                    reference_number: Some(purchase_number.clone()),
                    entry_type: SupplierLedgerEntryType::Purchase,
                    debit: credit_amount,
                    credit: 0,
                    balance_after: new_balance,
                    description: format!("Purchase {} (Payable credit)", purchase_number),
                    performed_by: user_id_owned,
                    created_at: now,
                };
                SQLiteSupplierRepository::insert_ledger_entry_in_tx(tx, &ledger_entry)?;
                new_balance
            } else {
                current_outstanding
            };

            Ok(PurchaseResultDto {
                purchase,
                lines: domain_lines,
                credit_amount,
                supplier_balance_after,
            })
        })
        .await?;

        Ok(result)
    }

    /// Atomically records a payment made to a supplier with FIFO allocation across oldest open purchases
    pub async fn record_supplier_payment(
        &self,
        user_id: Option<&str>,
        dto: RecordSupplierPaymentDto,
    ) -> AppResult<SupplierPaymentResultDto> {
        let supplier_id = dto.supplier_id.trim().to_string();
        if supplier_id.is_empty() {
            return Err(AppError::Validation("Supplier ID is required".to_string()));
        }

        if dto.amount <= 0 {
            return Err(AppError::Validation(
                "Payment amount must be greater than 0".to_string(),
            ));
        }

        let user_id_owned = user_id.map(str::to_string);

        let result = with_transaction(&self.db, move |tx| {
            let now = Utc::now().to_rfc3339();

            // 1. Validate Supplier
            let supplier = SQLiteSupplierRepository::get_by_id_in_tx(tx, &supplier_id)?
                .ok_or_else(|| DbError::NotFound(format!("Supplier '{supplier_id}' not found")))?;

            if !supplier.is_active {
                return Err(DbError::ValidationError(format!(
                    "Supplier '{}' is inactive. Cannot record payment.",
                    supplier.name
                )));
            }

            // 2. Authoritative Outstanding Balance Check
            let current_balance =
                SQLiteSupplierRepository::get_outstanding_balance_in_tx(tx, &supplier_id)?;

            if current_balance <= 0 {
                return Err(DbError::ValidationError(format!(
                    "Supplier '{}' has no outstanding payable balance (Rs 0)",
                    supplier.name
                )));
            }

            // Overpayment Rejection
            if dto.amount > current_balance {
                return Err(DbError::ValidationError(format!(
                    "Payment amount Rs {} exceeds supplier outstanding payable balance of Rs {}",
                    dto.amount, current_balance
                )));
            }

            // 3. Generate Payment Receipt Number & ID
            let receipt_number = SQLiteSupplierRepository::next_receipt_number_in_tx(tx)?;
            let payment_id = Uuid::new_v4().to_string();

            // 4. FIFO Allocation across oldest purchases (created_at ASC)
            let open_purchases =
                SQLitePurchaseRepository::get_unpaid_or_partial_purchases_in_tx(tx, &supplier_id)?;

            let mut remaining_to_allocate = dto.amount;
            let mut allocated_purchases = Vec::new();

            for purchase in open_purchases {
                if remaining_to_allocate <= 0 {
                    break;
                }

                let remaining_due_on_purchase = purchase.total_amount - purchase.paid_amount;
                if remaining_due_on_purchase <= 0 {
                    continue;
                }

                let alloc = remaining_to_allocate.min(remaining_due_on_purchase);
                let new_paid = purchase.paid_amount + alloc;
                let new_credit = purchase.total_amount - new_paid;
                let new_status = if new_paid >= purchase.total_amount {
                    PurchasePaymentStatus::Paid
                } else {
                    PurchasePaymentStatus::PartiallyPaid
                };

                SQLitePurchaseRepository::update_purchase_payment_in_tx(
                    tx,
                    &purchase.id,
                    new_paid,
                    new_credit,
                    new_status,
                    &now,
                )?;

                allocated_purchases.push(AllocatedPurchaseDto {
                    purchase_id: purchase.id,
                    purchase_number: purchase.purchase_number,
                    amount_allocated: alloc,
                    previous_paid: purchase.paid_amount,
                    new_paid,
                    total_amount: purchase.total_amount,
                    payment_status: new_status.as_str().to_string(),
                });

                remaining_to_allocate -= alloc;
            }

            // 5. Insert Supplier Ledger CREDIT Entry
            let new_balance = current_balance - dto.amount;

            let ledger_entry = SupplierLedgerEntry {
                id: Uuid::new_v4().to_string(),
                supplier_id: supplier.id.clone(),
                reference_id: Some(payment_id.clone()),
                reference_number: Some(receipt_number.clone()),
                entry_type: SupplierLedgerEntryType::Payment,
                debit: 0,
                credit: dto.amount,
                balance_after: new_balance,
                description: format!(
                    "Payment to supplier ({}) Ref: {}",
                    dto.payment_method,
                    dto.reference_number.as_deref().unwrap_or(&receipt_number)
                ),
                performed_by: user_id_owned.clone(),
                created_at: now.clone(),
            };

            SQLiteSupplierRepository::insert_ledger_entry_in_tx(tx, &ledger_entry)?;

            // 6. If payment method is CASH, record authoritative Cash Movement OUT
            if dto.payment_method.trim().to_uppercase() == "CASH" {
                let open_session_id = SQLiteCashRepository::get_open_session_id_in_tx(tx, DEFAULT_MAIN_BRANCH_ID)?;
                let cash_movement = CashMovement {
                    id: Uuid::new_v4().to_string(),
                    session_id: open_session_id,
                    branch_id: DEFAULT_MAIN_BRANCH_ID.to_string(),
                    movement_type: CashMovementType::SupplierPayment,
                    direction: CashMovementDirection::Out,
                    amount: dto.amount,
                    reference_id: Some(payment_id.clone()),
                    reference_number: Some(receipt_number.clone()),
                    payment_method: "CASH".to_string(),
                    description: format!("Supplier Payment Receipt {}", receipt_number),
                    performed_by: user_id_owned,
                    performed_by_name: None,
                    created_at: now,
                };
                SQLiteCashRepository::insert_movement_in_tx(tx, &cash_movement)?;
            }

            Ok(SupplierPaymentResultDto {
                payment_id,
                receipt_number,
                supplier_id: supplier.id,
                amount_paid: dto.amount,
                previous_balance: current_balance,
                new_balance,
                allocated_purchases,
            })
        })
        .await?;

        Ok(result)
    }

    pub async fn get_purchase_by_id(&self, id: &str) -> AppResult<Option<Purchase>> {
        self.purchase_repo.get_by_id(id).await
    }

    pub async fn get_purchase_by_number(&self, number: &str) -> AppResult<Option<Purchase>> {
        self.purchase_repo.get_by_number(number).await
    }

    pub async fn get_purchase_lines(&self, purchase_id: &str) -> AppResult<Vec<PurchaseLine>> {
        self.purchase_repo.get_lines(purchase_id).await
    }

    pub async fn list_purchases(&self, filter: Option<PurchaseFilterDto>) -> AppResult<Vec<Purchase>> {
        self.purchase_repo.list(filter).await
    }
}

#[cfg(test)]
pub mod tests {
    use super::*;
    use crate::db::connection::DatabaseConnection;
    use crate::db::migrations::MigrationRunner;
    use crate::domain::purchases::PurchaseItemDto;
    use crate::domain::supplier::CreateSupplierDto;
    use crate::services::supplier_service::SupplierService;

    async fn setup_test_context() -> (DatabaseConnection, PurchaseService, SupplierService, String, String) {
        let db = DatabaseConnection::open_in_memory().unwrap();
        {
            let conn_arc = db.inner();
            let mut conn = conn_arc.lock().await;
            conn.pragma_update(None, "foreign_keys", "ON").unwrap();
            MigrationRunner::run(&mut conn).unwrap();

            // Seed Category, Unit, Product with 36-char valid UUIDs
            conn.execute(
                "INSERT INTO categories (id, name, code, is_active, created_at, updated_at)
                 VALUES ('00000000-0000-0000-0000-000000000010', 'Phones', 'PHN', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
                [],
            ).unwrap();

            conn.execute(
                "INSERT INTO units (id, name, is_active, created_at, updated_at)
                 VALUES ('00000000-0000-0000-0000-000000000020', 'Piece', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
                [],
            ).unwrap();

            conn.execute(
                "INSERT INTO products (id, name, sku, category_id, unit_id, purchase_price, sale_price, low_stock_threshold, is_active, created_at, updated_at)
                 VALUES ('00000000-0000-0000-0000-000000000030', 'Samsung A15', 'SAM-A15', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000020', 30000, 35000, 5, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
                [],
            ).unwrap();

            conn.execute(
                "INSERT INTO products (id, name, sku, category_id, unit_id, purchase_price, sale_price, low_stock_threshold, is_active, created_at, updated_at)
                 VALUES ('00000000-0000-0000-0000-000000000031', 'Redmi Note 13', 'RED-N13', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000020', 40000, 46000, 5, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
                [],
            ).unwrap();
        }

        let purchase_service = PurchaseService::new(db.clone());
        let supplier_service = SupplierService::new(db.clone());

        (
            db,
            purchase_service,
            supplier_service,
            "00000000-0000-0000-0000-000000000030".to_string(),
            "00000000-0000-0000-0000-000000000031".to_string(),
        )
    }

    #[tokio::test]
    async fn test_cash_purchase_full_flow() {
        let (db, purchase_svc, supplier_svc, prod_id, _) = setup_test_context().await;

        let supplier = supplier_svc
            .create_supplier(CreateSupplierDto {
                name: "Mega Mobile Wholesale".to_string(),
                phone: "03001234567".to_string(),
                alternate_phone: None,
                email: None,
                address: None,
                notes: None,
                credit_limit: Some(100000),
            })
            .await
            .unwrap();

        let res = purchase_svc
            .complete_purchase(
                None,
                CompletePurchaseDto {
                    branch_id: None,
                    supplier_id: supplier.id.clone(),
                    items: vec![PurchaseItemDto {
                        product_id: prod_id.clone(),
                        quantity: 10,
                        unit_cost: Some(30000), // 10 * 30000 = 300,000
                        discount: None,
                    }],
                    discount: Some(10000), // Total = 290,000
                    paid_amount: Some(290000), // Fully paid cash purchase
                    payment_method: Some("CASH".to_string()),
                    notes: Some("Cash shipment".to_string()),
                },
            )
            .await
            .unwrap();

        assert_eq!(res.purchase.purchase_number, "PUR-000001");
        assert_eq!(res.purchase.total_amount, 290000);
        assert_eq!(res.purchase.paid_amount, 290000);
        assert_eq!(res.purchase.credit_amount, 0);
        assert_eq!(res.purchase.payment_status, PurchasePaymentStatus::Paid);
        assert_eq!(res.credit_amount, 0);
        assert_eq!(res.supplier_balance_after, 0);

        // Verify stock increased
        let conn_arc = db.inner();
        let conn = conn_arc.lock().await;
        let qty: i64 = conn
            .query_row(
                "SELECT quantity FROM stock WHERE product_id = ?1 AND branch_id = ?2",
                params![prod_id, DEFAULT_MAIN_BRANCH_ID],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(qty, 10);

        // Verify stock movement IN
        let mov_type: String = conn
            .query_row(
                "SELECT movement_type FROM stock_movements WHERE product_id = ?1 AND reference_id = ?2",
                params![prod_id, res.purchase.id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(mov_type, "IN");
        drop(conn);

        // Verify supplier payable is 0
        let payable = supplier_svc.get_outstanding_balance(&supplier.id).await.unwrap();
        assert_eq!(payable, 0);
    }

    #[tokio::test]
    async fn test_credit_purchase_and_credit_limit() {
        let (_db, purchase_svc, supplier_svc, prod_id, _) = setup_test_context().await;

        let supplier = supplier_svc
            .create_supplier(CreateSupplierDto {
                name: "Karachi Parts Depot".to_string(),
                phone: "03211112222".to_string(),
                alternate_phone: None,
                email: None,
                address: None,
                notes: None,
                credit_limit: Some(100000), // 100k credit limit
            })
            .await
            .unwrap();

        // 1. Partial credit purchase within limit (Total 50k, paid 20k -> credit 30k)
        let res = purchase_svc
            .complete_purchase(
                None,
                CompletePurchaseDto {
                    branch_id: None,
                    supplier_id: supplier.id.clone(),
                    items: vec![PurchaseItemDto {
                        product_id: prod_id.clone(),
                        quantity: 2,
                        unit_cost: Some(25000), // 50,000
                        discount: None,
                    }],
                    discount: None,
                    paid_amount: Some(20000), // 30,000 credit
                    payment_method: Some("CASH".to_string()),
                    notes: None,
                },
            )
            .await
            .unwrap();

        assert_eq!(res.purchase.payment_status, PurchasePaymentStatus::PartiallyPaid);
        assert_eq!(res.credit_amount, 30000);
        assert_eq!(res.supplier_balance_after, 30000);

        let payable = supplier_svc.get_outstanding_balance(&supplier.id).await.unwrap();
        assert_eq!(payable, 30000);

        // 2. Purchase exceeding credit limit (outstanding 30k + new credit 80k = 110k > 100k limit)
        let limit_err = purchase_svc
            .complete_purchase(
                None,
                CompletePurchaseDto {
                    branch_id: None,
                    supplier_id: supplier.id.clone(),
                    items: vec![PurchaseItemDto {
                        product_id: prod_id.clone(),
                        quantity: 2,
                        unit_cost: Some(40000), // 80,000
                        discount: None,
                    }],
                    discount: None,
                    paid_amount: Some(0), // 80k credit -> exceeds 100k limit!
                    payment_method: None,
                    notes: None,
                },
            )
            .await;

        assert!(limit_err.is_err(), "Must reject purchase exceeding supplier credit limit");

        // Verify balance remained 30,000 and was not mutated
        let payable_after_err = supplier_svc.get_outstanding_balance(&supplier.id).await.unwrap();
        assert_eq!(payable_after_err, 30000);
    }

    #[tokio::test]
    async fn test_fifo_payment_allocation_across_purchases() {
        let (_db, purchase_svc, supplier_svc, prod_id, prod_id2) = setup_test_context().await;

        let supplier = supplier_svc
            .create_supplier(CreateSupplierDto {
                name: "Prime Wholesale".to_string(),
                phone: "03335557777".to_string(),
                alternate_phone: None,
                email: None,
                address: None,
                notes: None,
                credit_limit: Some(200000),
            })
            .await
            .unwrap();

        // Purchase 1: 40,000 credit (UNPAID)
        let pur1 = purchase_svc
            .complete_purchase(
                None,
                CompletePurchaseDto {
                    branch_id: None,
                    supplier_id: supplier.id.clone(),
                    items: vec![PurchaseItemDto {
                        product_id: prod_id.clone(),
                        quantity: 1,
                        unit_cost: Some(40000),
                        discount: None,
                    }],
                    discount: None,
                    paid_amount: Some(0),
                    payment_method: None,
                    notes: None,
                },
            )
            .await
            .unwrap();

        // Purchase 2: 25,000 credit (UNPAID)
        let pur2 = purchase_svc
            .complete_purchase(
                None,
                CompletePurchaseDto {
                    branch_id: None,
                    supplier_id: supplier.id.clone(),
                    items: vec![PurchaseItemDto {
                        product_id: prod_id2.clone(),
                        quantity: 1,
                        unit_cost: Some(25000),
                        discount: None,
                    }],
                    discount: None,
                    paid_amount: Some(0),
                    payment_method: None,
                    notes: None,
                },
            )
            .await
            .unwrap();

        let total_outstanding = supplier_svc.get_outstanding_balance(&supplier.id).await.unwrap();
        assert_eq!(total_outstanding, 65000); // 40k + 25k

        // Payment: 50,000
        // Expected FIFO:
        // Pur 1 receives 40,000 -> PAID (remaining 0)
        // Pur 2 receives 10,000 -> PARTIALLY_PAID (remaining 15,000)
        let pay_res = purchase_svc
            .record_supplier_payment(
                None,
                RecordSupplierPaymentDto {
                    supplier_id: supplier.id.clone(),
                    amount: 50000,
                    payment_method: "Bank Transfer".to_string(),
                    reference_number: Some("IBFT-8899".to_string()),
                    notes: None,
                },
            )
            .await
            .unwrap();

        assert_eq!(pay_res.receipt_number, "PAY-000001");
        assert_eq!(pay_res.previous_balance, 65000);
        assert_eq!(pay_res.new_balance, 15000);
        assert_eq!(pay_res.allocated_purchases.len(), 2);

        assert_eq!(pay_res.allocated_purchases[0].purchase_id, pur1.purchase.id);
        assert_eq!(pay_res.allocated_purchases[0].amount_allocated, 40000);
        assert_eq!(pay_res.allocated_purchases[0].payment_status, "PAID");

        assert_eq!(pay_res.allocated_purchases[1].purchase_id, pur2.purchase.id);
        assert_eq!(pay_res.allocated_purchases[1].amount_allocated, 10000);
        assert_eq!(pay_res.allocated_purchases[1].payment_status, "PARTIALLY_PAID");

        // Overpayment test: attempt to pay 20,000 when only 15,000 outstanding -> rejected!
        let overpay_err = purchase_svc
            .record_supplier_payment(
                None,
                RecordSupplierPaymentDto {
                    supplier_id: supplier.id.clone(),
                    amount: 20000,
                    payment_method: "Cash".to_string(),
                    reference_number: None,
                    notes: None,
                },
            )
            .await;

        assert!(overpay_err.is_err(), "Must reject overpayment");
        let balance_final = supplier_svc.get_outstanding_balance(&supplier.id).await.unwrap();
        assert_eq!(balance_final, 15000);
    }

    #[tokio::test]
    async fn test_atomic_rollback_on_invalid_data() {
        let (db, purchase_svc, supplier_svc, prod_id, _) = setup_test_context().await;

        let supplier = supplier_svc
            .create_supplier(CreateSupplierDto {
                name: "Rollback Test Wholesale".to_string(),
                phone: "03119998888".to_string(),
                alternate_phone: None,
                email: None,
                address: None,
                notes: None,
                credit_limit: Some(100000),
            })
            .await
            .unwrap();

        // Attempt purchase with invalid product quantity (0)
        let res = purchase_svc
            .complete_purchase(
                None,
                CompletePurchaseDto {
                    branch_id: None,
                    supplier_id: supplier.id.clone(),
                    items: vec![PurchaseItemDto {
                        product_id: prod_id.clone(),
                        quantity: 0, // Invalid!
                        unit_cost: Some(1000),
                        discount: None,
                    }],
                    discount: None,
                    paid_amount: None,
                    payment_method: None,
                    notes: None,
                },
            )
            .await;

        assert!(res.is_err());

        // Verify 0 purchases exist
        let conn_arc = db.inner();
        let conn = conn_arc.lock().await;
        let count: i64 = conn.query_row("SELECT count(*) FROM purchases", [], |r| r.get(0)).unwrap();
        assert_eq!(count, 0);

        let stock_count: i64 = conn.query_row("SELECT count(*) FROM stock_movements", [], |r| r.get(0)).unwrap();
        assert_eq!(stock_count, 0);

        let ledger_count: i64 = conn.query_row("SELECT count(*) FROM supplier_ledger_entries", [], |r| r.get(0)).unwrap();
        assert_eq!(ledger_count, 0);
    }
}
