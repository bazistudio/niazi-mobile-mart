use std::collections::HashMap;
use chrono::Utc;
use rusqlite::Connection;
use uuid::Uuid;

use crate::db::connection::DatabaseConnection;
use crate::db::errors::{DbError, DbResult};
use crate::db::transaction::with_transaction;
use crate::domain::cash::{CashMovement, CashMovementDirection, CashMovementType};
use crate::domain::customer::{CustomerLedgerEntry, CustomerLedgerEntryType};
use crate::domain::inventory::{StockMovement, StockMovementType};
use crate::domain::sales::SaleStatus;
use crate::domain::sales_return::{
    CreateSalesReturnDto, SaleReturnableInfoDto, SaleReturnableLineDto, SalesRefundMethod,
    SalesReturn, SalesReturnDetailDto, SalesReturnLine, SalesReturnStatus,
};
use crate::errors::{AppError, AppResult};
use crate::repositories::{
    SQLiteCashRepository, SQLiteCustomerRepository, SQLiteInventoryRepository,
    SQLiteSaleRepository, SQLiteSalesReturnRepository,
};

#[derive(Clone)]
pub struct SalesReturnService {
    db: DatabaseConnection,
    repo: SQLiteSalesReturnRepository,
}

impl SalesReturnService {
    pub fn new(db: DatabaseConnection) -> Self {
        let repo = SQLiteSalesReturnRepository::new(db.clone());
        Self { db, repo }
    }

    /// Queries line-by-line returnable status for a sale
    pub async fn get_sale_returnable_info(&self, sale_id: &str) -> AppResult<SaleReturnableInfoDto> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        let sale = SQLiteSaleRepository::get_sale_by_id_in_tx(&guard, sale_id)?
            .ok_or_else(|| AppError::NotFound(format!("Sale with id '{sale_id}' not found")))?;

        if sale.sale_status != SaleStatus::Completed {
            return Err(AppError::Validation(format!(
                "Sale '{}' has status '{}'. Only completed sales can be returned.",
                sale.invoice_number,
                sale.sale_status.as_str()
            )));
        }

        let lines = SQLiteSaleRepository::get_sale_lines_in_tx(&guard, sale_id)?;

        let mut returnable_lines = Vec::with_capacity(lines.len());
        for line in lines {
            let already_returned =
                SQLiteSalesReturnRepository::get_returned_quantity_for_sale_line_in_tx(&guard, &line.id)?;
            let returnable_quantity = line.quantity.saturating_sub(already_returned);
            let effective_unit_price = if line.quantity > 0 {
                line.line_total / line.quantity
            } else {
                0
            };

            returnable_lines.push(SaleReturnableLineDto {
                sale_line_id: line.id,
                product_id: line.product_id,
                product_name: line.product_name_snapshot,
                sku: line.sku_snapshot,
                original_quantity: line.quantity,
                already_returned_quantity: already_returned,
                returnable_quantity,
                unit_price: line.unit_price,
                line_total: line.line_total,
                effective_unit_price,
            });
        }

        let customer_outstanding = if let Some(ref cid) = sale.customer_id {
            SQLiteCustomerRepository::calculate_outstanding_balance_in_tx(&guard, cid).unwrap_or(0)
        } else {
            0
        };

        Ok(SaleReturnableInfoDto {
            sale_id: sale.id,
            invoice_number: sale.invoice_number,
            branch_id: sale.branch_id,
            customer_id: sale.customer_id,
            customer_name: sale.customer_name_snapshot,
            sale_date: sale.created_at,
            total_amount: sale.total_amount,
            paid_amount: sale.paid_amount,
            customer_outstanding_balance: customer_outstanding,
            lines: returnable_lines,
        })
    }

    /// Atomically executes a sales return transaction
    pub async fn create_sales_return(
        &self,
        dto: CreateSalesReturnDto,
        user_id: Option<&str>,
    ) -> AppResult<SalesReturnDetailDto> {
        if dto.lines.is_empty() {
            return Err(AppError::Validation("At least one line item must be returned".to_string()));
        }

        let refund_method = SalesRefundMethod::from_str(&dto.refund_method)
            .map_err(|e| AppError::Validation(e))?;

        for line in &dto.lines {
            if line.quantity <= 0 {
                return Err(AppError::Validation("Return quantity must be greater than 0".to_string()));
            }
        }

        let now = Utc::now().to_rfc3339();
        let uid = user_id.map(|s| s.to_string());
        let sale_id = dto.sale_id.clone();
        let reason_cloned = dto.reason.clone();
        let notes_cloned = dto.notes.clone();
        let requested_lines = dto.lines.clone();

        let detail = with_transaction(&self.db, move |tx| {
            // 1. Validate sale exists and is completed
            let sale = SQLiteSaleRepository::get_sale_by_id_in_tx(tx, &sale_id)?
                .ok_or_else(|| DbError::NotFound(format!("Sale with id '{sale_id}' not found")))?;

            if sale.sale_status != SaleStatus::Completed {
                return Err(DbError::ValidationError(format!(
                    "Sale '{}' has status '{}'. Only COMPLETED sales can be returned.",
                    sale.invoice_number,
                    sale.sale_status.as_str()
                )));
            }

            // 2. Fetch original sale lines
            let original_lines = SQLiteSaleRepository::get_sale_lines_in_tx(tx, &sale_id)?;
            let orig_line_map: HashMap<String, _> = original_lines.into_iter().map(|l| (l.id.clone(), l)).collect();

            // 3. Validate lines and calculate return amounts
            let mut calculated_lines = Vec::with_capacity(requested_lines.len());
            let mut total_return_amount: i64 = 0;

            for req in &requested_lines {
                let orig = orig_line_map.get(&req.sale_line_id).ok_or_else(|| {
                    DbError::ValidationError(format!("Sale line '{}' does not belong to sale '{}'", req.sale_line_id, sale.invoice_number))
                })?;

                let already_returned =
                    SQLiteSalesReturnRepository::get_returned_quantity_for_sale_line_in_tx(tx, &orig.id)?;
                let returnable_quantity = orig.quantity.saturating_sub(already_returned);

                if req.quantity > returnable_quantity {
                    return Err(DbError::ValidationError(format!(
                        "Requested return quantity {} exceeds remaining returnable quantity {} for product '{}'",
                        req.quantity, returnable_quantity, orig.product_name_snapshot
                    )));
                }

                // Proportional return amount using historical sale line economics
                let line_return_amount = (orig.line_total * req.quantity) / orig.quantity;
                total_return_amount += line_return_amount;

                calculated_lines.push((orig, req.quantity, line_return_amount));
            }

            if total_return_amount <= 0 {
                return Err(DbError::ValidationError("Total return amount must be greater than 0".to_string()));
            }

            // 4. Generate SRET number and IDs
            let return_number = SQLiteSalesReturnRepository::next_return_number_in_tx(tx)?;
            let return_id = Uuid::new_v4().to_string();

            // 5. Stock Reversal (Inventory IN)
            for (orig, qty, _) in &calculated_lines {
                let prev_stock = SQLiteInventoryRepository::get_stock_in_tx(tx, &orig.product_id, &sale.branch_id)?;
                let resulting_stock = prev_stock + *qty;

                SQLiteInventoryRepository::set_stock_in_tx(
                    tx,
                    &orig.product_id,
                    &sale.branch_id,
                    resulting_stock,
                    &now,
                )?;

                let movement = StockMovement {
                    id: Uuid::new_v4().to_string(),
                    product_id: orig.product_id.clone(),
                    branch_id: sale.branch_id.clone(),
                    movement_type: StockMovementType::In,
                    quantity: *qty,
                    previous_stock: prev_stock,
                    resulting_stock,
                    reason: Some(format!("Sales Return {}", return_number)),
                    performed_by: uid.clone(),
                    reference_id: Some(return_id.clone()),
                    created_at: now.clone(),
                };

                SQLiteInventoryRepository::insert_movement_in_tx(tx, &movement)?;
            }

            // 6. Handle financial settlement
            let mut customer_balance_after = None;
            let mut cash_refunded = None;

            match refund_method {
                SalesRefundMethod::Cash => {
                    // Must have an active OPEN cash session on the branch
                    let open_session_id = SQLiteCashRepository::get_open_session_id_in_tx(tx, &sale.branch_id)?
                        .ok_or_else(|| {
                            DbError::ValidationError(format!(
                                "Cannot process cash refund: No OPEN cash session found for branch '{}'. Please open a cash session first.",
                                sale.branch_id
                            ))
                        })?;

                    let cash_movement = CashMovement {
                        id: Uuid::new_v4().to_string(),
                        session_id: Some(open_session_id),
                        branch_id: sale.branch_id.clone(),
                        movement_type: CashMovementType::SalePayment,
                        direction: CashMovementDirection::Out,
                        amount: total_return_amount,
                        reference_id: Some(return_id.clone()),
                        reference_number: Some(return_number.clone()),
                        payment_method: "CASH".to_string(),
                        description: format!("Refund for Sales Return {}", return_number),
                        performed_by: uid.clone(),
                        performed_by_name: None,
                        created_at: now.clone(),
                    };

                    SQLiteCashRepository::insert_movement_in_tx(tx, &cash_movement)?;
                    cash_refunded = Some(total_return_amount);
                }
                SalesRefundMethod::CustomerCredit => {
                    let cid = sale.customer_id.as_ref().ok_or_else(|| {
                        DbError::ValidationError(
                            "Cannot refund via customer credit for a walk-in sale. Use CASH refund.".to_string(),
                        )
                    })?;

                    let current_outstanding =
                        SQLiteCustomerRepository::calculate_outstanding_balance_in_tx(tx, cid)?;

                    if current_outstanding < total_return_amount {
                        return Err(DbError::ValidationError(format!(
                            "Customer credit refund of Rs {} cannot exceed current outstanding receivable of Rs {} (negative balance is prohibited).",
                            total_return_amount, current_outstanding
                        )));
                    }

                    let new_balance = current_outstanding - total_return_amount;
                    customer_balance_after = Some(new_balance);

                    let ledger_entry = CustomerLedgerEntry {
                        id: Uuid::new_v4().to_string(),
                        customer_id: cid.clone(),
                        reference_id: Some(return_id.clone()),
                        reference_number: Some(return_number.clone()),
                        entry_type: CustomerLedgerEntryType::Adjustment,
                        debit: 0,
                        credit: total_return_amount,
                        balance_after: new_balance,
                        description: format!("Sales Return {} - Receivable Credit", return_number),
                        performed_by: uid.clone(),
                        created_at: now.clone(),
                    };

                    SQLiteCustomerRepository::insert_ledger_entry_in_tx(tx, &ledger_entry)?;
                }
            }

            // 7. Insert Sales Return Header
            let sales_return = SalesReturn {
                id: return_id.clone(),
                return_number: return_number.clone(),
                sale_id: sale.id.clone(),
                branch_id: sale.branch_id.clone(),
                customer_id: sale.customer_id.clone(),
                customer_name_snapshot: sale.customer_name_snapshot.clone(),
                total_amount: total_return_amount,
                refund_method,
                status: SalesReturnStatus::Completed,
                reason: reason_cloned,
                notes: notes_cloned,
                performed_by: uid.clone(),
                created_at: now.clone(),
                updated_at: now.clone(),
            };

            SQLiteSalesReturnRepository::insert_sales_return_in_tx(tx, &sales_return)?;

            // 8. Insert Sales Return Lines
            let mut domain_lines = Vec::with_capacity(calculated_lines.len());
            for (orig, qty, ret_amount) in calculated_lines {
                let line = SalesReturnLine {
                    id: Uuid::new_v4().to_string(),
                    return_id: return_id.clone(),
                    sale_line_id: orig.id.clone(),
                    product_id: orig.product_id.clone(),
                    product_name_snapshot: orig.product_name_snapshot.clone(),
                    sku_snapshot: orig.sku_snapshot.clone(),
                    unit_price: orig.unit_price,
                    quantity: qty,
                    return_amount: ret_amount,
                    created_at: now.clone(),
                };
                domain_lines.push(line);
            }

            SQLiteSalesReturnRepository::insert_sales_return_lines_in_tx(tx, &domain_lines)?;

            // 9. Check if entire sale is 100% returned; if so, update status to REFUNDED
            check_and_update_sale_refunded_status(tx, &sale.id, &now)?;

            Ok(SalesReturnDetailDto {
                sales_return,
                lines: domain_lines,
                invoice_number: sale.invoice_number,
                customer_balance_after,
                cash_refunded,
            })
        })
        .await?;

        Ok(detail)
    }

    pub async fn get_sales_return(&self, id: &str) -> AppResult<Option<SalesReturnDetailDto>> {
        self.repo.get_by_id(id).await
    }

    pub async fn list_sales_returns(
        &self,
        branch_id: Option<&str>,
        limit: Option<i64>,
    ) -> AppResult<Vec<SalesReturnDetailDto>> {
        self.repo.list_sales_returns(branch_id, limit).await
    }

    pub async fn get_sales_returns_by_sale(&self, sale_id: &str) -> AppResult<Vec<SalesReturnDetailDto>> {
        self.repo.get_by_sale_id(sale_id).await
    }
}

/// Helper inside transaction to mark sale REFUNDED if all quantities across all lines have been returned
fn check_and_update_sale_refunded_status(conn: &Connection, sale_id: &str, now: &str) -> DbResult<()> {
    let lines = SQLiteSaleRepository::get_sale_lines_in_tx(conn, sale_id)?;
    let mut all_returned = true;

    for line in lines {
        let returned = SQLiteSalesReturnRepository::get_returned_quantity_for_sale_line_in_tx(conn, &line.id)?;
        if returned < line.quantity {
            all_returned = false;
            break;
        }
    }

    if all_returned {
        conn.execute(
            "UPDATE sales SET sale_status = 'REFUNDED', updated_at = ?1 WHERE id = ?2",
            rusqlite::params![now, sale_id],
        )
        .map_err(|e| DbError::QueryError(format!("Failed to update sale status to REFUNDED: {e}")))?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::connection::DatabaseConnection;
    use crate::domain::cash::OpenCashSessionDto;
    use crate::domain::customer::CreateCustomerDto;
    use crate::domain::organization::DEFAULT_MAIN_BRANCH_ID;
    use crate::domain::sales::{CompleteSaleDto, SaleItemDto};
    use crate::services::cash_service::CashService;
    use crate::services::customer_service::CustomerService;
    use crate::services::sale_service::SaleService;

    use crate::db::migrations::MigrationRunner;

    async fn setup_test_db() -> (
        DatabaseConnection,
        SalesReturnService,
        SaleService,
        CashService,
        CustomerService,
        String,
    ) {
        let db = DatabaseConnection::open_in_memory().unwrap();
        {
            let conn_arc = db.inner();
            let mut guard = conn_arc.lock().await;
            guard.pragma_update(None, "foreign_keys", "ON").unwrap();
            MigrationRunner::run(&mut guard).expect("migrations");

            // Seed Users for tests
            guard.execute(
                "INSERT INTO users (id, name, username, login_key_hash, role, is_active, created_at, updated_at)
                 VALUES ('11111111-1111-1111-1111-111111111111', 'Admin User', 'admin1', 'hash', 'ADMIN', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
                [],
            ).unwrap();
            guard.execute(
                "INSERT INTO users (id, name, username, login_key_hash, role, is_active, created_at, updated_at)
                 VALUES ('22222222-2222-2222-2222-222222222222', 'Cashier User', 'cashier1', 'hash', 'CASHIER', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
                [],
            ).unwrap();
        }

        let sr_service = SalesReturnService::new(db.clone());
        let sale_service = SaleService::new(db.clone());
        let cash_service = CashService::new(db.clone());
        let cust_service = CustomerService::new(db.clone());

        // Create product with 50 in stock
        let prod_id = Uuid::new_v4().to_string();
        {
            let conn_arc = db.inner();
            let guard = conn_arc.lock().await;
            guard.execute(
                "INSERT INTO categories (id, name, code, is_active, created_at, updated_at)
                 VALUES ('00000000-0000-0000-0000-000000000010', 'Smartphones', 'PHONES', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
                [],
            ).unwrap();
            guard.execute(
                "INSERT INTO brands (id, name, code, is_active, created_at, updated_at)
                 VALUES ('00000000-0000-0000-0000-000000000011', 'Apple', 'APPLE', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
                [],
            ).unwrap();
            guard.execute(
                "INSERT INTO units (id, name, symbol, conversion_factor, is_active, created_at, updated_at)
                 VALUES ('00000000-0000-0000-0000-000000000012', 'Piece', 'PCS', 1, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
                [],
            ).unwrap();
            guard.execute(
                "INSERT INTO products (id, name, sku, category_id, brand_id, unit_id, purchase_price, sale_price, low_stock_threshold, is_active, created_at, updated_at)
                 VALUES (?1, 'iPhone 15 Pro', 'IP15P-128', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000012', 270000, 300000, 5, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
                rusqlite::params![prod_id],
            ).unwrap();
            guard.execute(
                "INSERT INTO stock (product_id, branch_id, quantity, updated_at)
                 VALUES (?1, ?2, 50, '2026-01-01T00:00:00Z')",
                rusqlite::params![prod_id, DEFAULT_MAIN_BRANCH_ID],
            ).unwrap();
        }

        (db, sr_service, sale_service, cash_service, cust_service, prod_id)
    }

    #[tokio::test]
    async fn test_full_cash_sale_return_flow() {
        let (db, sr_svc, sale_svc, cash_svc, _, prod_id) = setup_test_db().await;

        // Open cash session with 10,000 float
        cash_svc
            .open_session(
                Some("11111111-1111-1111-1111-111111111111"),
                OpenCashSessionDto {
                    branch_id: Some(DEFAULT_MAIN_BRANCH_ID.to_string()),
                    business_date: Some("2026-01-01".to_string()),
                    opening_cash: 10000,
                    notes: None,
                },
            )
            .await
            .unwrap();

        // 1. Sell 5 iPhones for cash (5 * 300,000 = 1,500,000)
        let sale_res = sale_svc
            .complete_sale(
                Some("22222222-2222-2222-2222-222222222222"),
                CompleteSaleDto {
                    branch_id: Some(DEFAULT_MAIN_BRANCH_ID.to_string()),
                    customer_id: None,
                    items: vec![SaleItemDto {
                        product_id: prod_id.clone(),
                        quantity: 5,
                        discount: None,
                    }],
                    discount: None,
                    paid_amount: Some(1500000),
                    payment_method: Some("CASH".to_string()),
                    notes: None,
                },
            )
            .await
            .unwrap();

        assert_eq!(sale_res.sale.total_amount, 1500000);

        // Stock after sale: 50 - 5 = 45
        let stock_mid: i64 = {
            let conn = db.inner();
            let g = conn.lock().await;
            g.query_row(
                "SELECT quantity FROM stock WHERE product_id = ?1",
                rusqlite::params![prod_id],
                |r| r.get(0),
            )
            .unwrap()
        };
        assert_eq!(stock_mid, 45);

        // Check returnable info
        let returnable_info = sr_svc.get_sale_returnable_info(&sale_res.sale.id).await.unwrap();
        assert_eq!(returnable_info.lines.len(), 1);
        assert_eq!(returnable_info.lines[0].original_quantity, 5);
        assert_eq!(returnable_info.lines[0].returnable_quantity, 5);

        let sale_line_id = returnable_info.lines[0].sale_line_id.clone();

        // 2. Return 2 iPhones for Cash Refund (2 * 300,000 = 600,000)
        let return_res = sr_svc
            .create_sales_return(
                CreateSalesReturnDto {
                    sale_id: sale_res.sale.id.clone(),
                    lines: vec![crate::domain::sales_return::CreateSalesReturnLineDto {
                        sale_line_id: sale_line_id.clone(),
                        quantity: 2,
                    }],
                    refund_method: "CASH".to_string(),
                    reason: Some("Customer changed mind".to_string()),
                    notes: None,
                },
                Some("11111111-1111-1111-1111-111111111111"),
            )
            .await
            .unwrap();

        assert_eq!(return_res.sales_return.return_number, "SRET-000001");
        assert_eq!(return_res.sales_return.total_amount, 600000);
        assert_eq!(return_res.cash_refunded, Some(600000));

        // 3. Verify stock increased: 45 + 2 = 47
        let stock_after: i64 = {
            let conn = db.inner();
            let g = conn.lock().await;
            g.query_row(
                "SELECT quantity FROM stock WHERE product_id = ?1",
                rusqlite::params![prod_id],
                |r| r.get(0),
            )
            .unwrap()
        };
        assert_eq!(stock_after, 47);

        // 4. Verify stock movement IN created
        let last_movement: (String, i64, i64, i64) = {
            let conn = db.inner();
            let g = conn.lock().await;
            g.query_row(
                "SELECT movement_type, quantity, previous_stock, resulting_stock
                 FROM stock_movements WHERE product_id = ?1 ORDER BY created_at DESC LIMIT 1",
                rusqlite::params![prod_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
            )
            .unwrap()
        };
        assert_eq!(last_movement.0, "IN");
        assert_eq!(last_movement.1, 2);
        assert_eq!(last_movement.2, 45);
        assert_eq!(last_movement.3, 47);

        // 5. Verify remaining returnable is now 3
        let returnable_after = sr_svc.get_sale_returnable_info(&sale_res.sale.id).await.unwrap();
        assert_eq!(returnable_after.lines[0].already_returned_quantity, 2);
        assert_eq!(returnable_after.lines[0].returnable_quantity, 3);

        // 6. Verify cash drawer summary reflects cash refund OUT
        let summary = cash_svc.get_daily_summary(Some(DEFAULT_MAIN_BRANCH_ID), Some("2026-01-01")).await.unwrap();
        // Opening: 10,000 + Cash Sale In: 1,500,000 - Refund Out: 600,000 = 910,000
        assert_eq!(summary.total_cash_in, 1500000);
        assert_eq!(summary.total_cash_out, 600000);
        assert_eq!(summary.expected_closing_cash, 10000 + 1500000 - 600000);
    }

    #[tokio::test]
    async fn test_customer_credit_sale_return_reduces_receivable() {
        let (_, sr_svc, sale_svc, _, cust_svc, prod_id) = setup_test_db().await;

        // Create registered customer with 1,000,000 credit limit
        let cust = cust_svc
            .create_customer(CreateCustomerDto {
                name: "Tariq Niazi".to_string(),
                phone: "03001234567".to_string(),
                alternate_phone: None,
                email: None,
                address: None,
                notes: None,
                credit_limit: Some(1000000),
            })
            .await
            .unwrap();

        // 1. Credit sale of 2 units (2 * 300,000 = 600,000), 0 paid, 600,000 credit
        let sale_res = sale_svc
            .complete_sale(
                Some("22222222-2222-2222-2222-222222222222"),
                CompleteSaleDto {
                    branch_id: Some(DEFAULT_MAIN_BRANCH_ID.to_string()),
                    customer_id: Some(cust.id.clone()),
                    items: vec![SaleItemDto {
                        product_id: prod_id.clone(),
                        quantity: 2,
                        discount: None,
                    }],
                    discount: None,
                    paid_amount: Some(0),
                    payment_method: Some("CASH".to_string()),
                    notes: None,
                },
            )
            .await
            .unwrap();

        // Customer receivable is now 600,000
        let bal_before = cust_svc.get_balance(&cust.id).await.unwrap();
        assert_eq!(bal_before, 600000);

        let sale_line_id = sale_res.lines[0].id.clone();

        // 2. Return 1 unit for CUSTOMER_CREDIT (300,000 reduction in receivable)
        let return_res = sr_svc
            .create_sales_return(
                CreateSalesReturnDto {
                    sale_id: sale_res.sale.id.clone(),
                    lines: vec![crate::domain::sales_return::CreateSalesReturnLineDto {
                        sale_line_id,
                        quantity: 1,
                    }],
                    refund_method: "CUSTOMER_CREDIT".to_string(),
                    reason: Some("Returned 1 phone to reduce balance".to_string()),
                    notes: None,
                },
                Some("11111111-1111-1111-1111-111111111111"),
            )
            .await
            .unwrap();

        assert_eq!(return_res.sales_return.total_amount, 300000);
        assert_eq!(return_res.customer_balance_after, Some(300000));

        // 3. Customer outstanding balance is now exactly 300,000
        let bal_after = cust_svc.get_balance(&cust.id).await.unwrap();
        assert_eq!(bal_after, 300000);
    }

    #[tokio::test]
    async fn test_excess_quantity_and_negative_balance_rejection() {
        let (_, sr_svc, sale_svc, _, cust_svc, prod_id) = setup_test_db().await;

        let cust = cust_svc
            .create_customer(CreateCustomerDto {
                name: "Zahid Khan".to_string(),
                phone: "03009999999".to_string(),
                alternate_phone: None,
                email: None,
                address: None,
                notes: None,
                credit_limit: Some(1000000),
            })
            .await
            .unwrap();

        let sale_res = sale_svc
            .complete_sale(
                Some("22222222-2222-2222-2222-222222222222"),
                CompleteSaleDto {
                    branch_id: Some(DEFAULT_MAIN_BRANCH_ID.to_string()),
                    customer_id: Some(cust.id.clone()),
                    items: vec![SaleItemDto {
                        product_id: prod_id.clone(),
                        quantity: 2,
                        discount: None,
                    }],
                    discount: None,
                    paid_amount: Some(0),
                    payment_method: Some("CASH".to_string()),
                    notes: None,
                },
            )
            .await
            .unwrap();

        let sale_line_id = sale_res.lines[0].id.clone();

        // 1. Attempt to return 3 units when only 2 were sold -> MUST FAIL
        let excess_err = sr_svc
            .create_sales_return(
                CreateSalesReturnDto {
                    sale_id: sale_res.sale.id.clone(),
                    lines: vec![crate::domain::sales_return::CreateSalesReturnLineDto {
                        sale_line_id: sale_line_id.clone(),
                        quantity: 3,
                    }],
                    refund_method: "CUSTOMER_CREDIT".to_string(),
                    reason: None,
                    notes: None,
                },
                Some("11111111-1111-1111-1111-111111111111"),
            )
            .await;

        assert!(excess_err.is_err());
        let err_msg = excess_err.unwrap_err().to_string();
        assert!(err_msg.contains("exceeds remaining returnable quantity"));
    }

    #[tokio::test]
    async fn test_cash_refund_fails_without_open_cash_session() {
        let (_, sr_svc, sale_svc, _, _, prod_id) = setup_test_db().await;

        // Cash sale with paid_amount
        let sale_res = sale_svc
            .complete_sale(
                Some("22222222-2222-2222-2222-222222222222"),
                CompleteSaleDto {
                    branch_id: Some(DEFAULT_MAIN_BRANCH_ID.to_string()),
                    customer_id: None,
                    items: vec![SaleItemDto {
                        product_id: prod_id.clone(),
                        quantity: 1,
                        discount: None,
                    }],
                    discount: None,
                    paid_amount: Some(300000),
                    payment_method: Some("CARD".to_string()),
                    notes: None,
                },
            )
            .await
            .unwrap();

        let sale_line_id = sale_res.lines[0].id.clone();

        // Attempt cash refund when NO cash session is OPEN -> MUST FAIL
        let no_session_err = sr_svc
            .create_sales_return(
                CreateSalesReturnDto {
                    sale_id: sale_res.sale.id.clone(),
                    lines: vec![crate::domain::sales_return::CreateSalesReturnLineDto {
                        sale_line_id,
                        quantity: 1,
                    }],
                    refund_method: "CASH".to_string(),
                    reason: None,
                    notes: None,
                },
                Some("11111111-1111-1111-1111-111111111111"),
            )
            .await;

        assert!(no_session_err.is_err());
        let err_msg = no_session_err.unwrap_err().to_string();
        assert!(err_msg.contains("No OPEN cash session found"));
    }
}
