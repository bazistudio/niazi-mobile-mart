use std::collections::HashMap;
use chrono::Utc;
use rusqlite::params;
use uuid::Uuid;

use crate::db::connection::DatabaseConnection;
use crate::db::errors::DbError;
use crate::db::transaction::with_transaction;
use crate::domain::cash::{CashMovement, CashMovementDirection, CashMovementType};
use crate::domain::inventory::{StockMovement, StockMovementType};
use crate::domain::purchase_return::{
    CreatePurchaseReturnDto, PurchaseReturn, PurchaseReturnDetailDto, PurchaseReturnLine,
    PurchaseReturnStatus, PurchaseReturnableInfoDto, PurchaseReturnableLineDto,
    PurchaseSettlementMethod,
};
use crate::domain::purchases::PurchaseStatus;
use crate::domain::supplier::{SupplierLedgerEntry, SupplierLedgerEntryType};
use crate::errors::{AppError, AppResult};
use crate::repositories::{
    SQLiteCashRepository, SQLiteInventoryRepository, SQLitePurchaseRepository,
    SQLitePurchaseReturnRepository, SQLiteSupplierRepository,
};

#[derive(Clone)]
pub struct PurchaseReturnService {
    db: DatabaseConnection,
    repo: SQLitePurchaseReturnRepository,
}

impl PurchaseReturnService {
    pub fn new(db: DatabaseConnection) -> Self {
        let repo = SQLitePurchaseReturnRepository::new(db.clone());
        Self { db, repo }
    }

    /// Queries line-by-line returnable status for a purchase order
    pub async fn get_purchase_returnable_info(&self, purchase_id: &str) -> AppResult<PurchaseReturnableInfoDto> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        let purchase = SQLitePurchaseRepository::get_by_id_in_tx(&guard, purchase_id)?
            .ok_or_else(|| AppError::NotFound(format!("Purchase with id '{purchase_id}' not found")))?;

        if purchase.status != PurchaseStatus::Completed {
            return Err(AppError::Validation(format!(
                "Purchase '{}' has status '{}'. Only completed purchases can be returned.",
                purchase.purchase_number,
                purchase.status.as_str()
            )));
        }

        let lines = SQLitePurchaseRepository::get_purchase_lines_in_tx(&guard, purchase_id)?;

        let mut returnable_lines = Vec::with_capacity(lines.len());
        for line in lines {
            let already_returned =
                SQLitePurchaseReturnRepository::get_returned_quantity_for_purchase_line_in_tx(&guard, &line.id)?;
            let returnable_quantity = line.quantity.saturating_sub(already_returned);
            let current_stock =
                SQLiteInventoryRepository::get_stock_in_tx(&guard, &line.product_id, &purchase.branch_id)?;
            let effective_unit_cost = if line.quantity > 0 {
                line.line_total / line.quantity
            } else {
                line.unit_cost
            };

            returnable_lines.push(PurchaseReturnableLineDto {
                purchase_line_id: line.id,
                product_id: line.product_id,
                product_name: line.product_name_snapshot,
                sku: line.sku_snapshot,
                original_quantity: line.quantity,
                already_returned_quantity: already_returned,
                returnable_quantity,
                current_available_stock: current_stock,
                unit_cost: line.unit_cost,
                line_total: line.line_total,
                effective_unit_cost,
            });
        }

        let supplier_payable =
            SQLiteSupplierRepository::get_outstanding_balance_in_tx(&guard, &purchase.supplier_id).unwrap_or(0);

        let supplier_name: Option<String> = guard
            .query_row(
                "SELECT name FROM suppliers WHERE id = ?1",
                params![purchase.supplier_id],
                |r| r.get(0),
            )
            .ok();

        Ok(PurchaseReturnableInfoDto {
            purchase_id: purchase.id,
            purchase_number: purchase.purchase_number,
            branch_id: purchase.branch_id,
            supplier_id: purchase.supplier_id,
            supplier_name,
            purchase_date: purchase.created_at,
            total_amount: purchase.total_amount,
            paid_amount: purchase.paid_amount,
            supplier_outstanding_payable: supplier_payable,
            lines: returnable_lines,
        })
    }

    /// Atomically executes a purchase return transaction
    pub async fn create_purchase_return(
        &self,
        dto: CreatePurchaseReturnDto,
        user_id: Option<&str>,
    ) -> AppResult<PurchaseReturnDetailDto> {
        if dto.lines.is_empty() {
            return Err(AppError::Validation("At least one line item must be returned".to_string()));
        }

        let settlement_method = PurchaseSettlementMethod::from_str(&dto.settlement_method)
            .map_err(|e| AppError::Validation(e))?;

        for line in &dto.lines {
            if line.quantity <= 0 {
                return Err(AppError::Validation("Return quantity must be greater than 0".to_string()));
            }
        }

        let now = Utc::now().to_rfc3339();
        let uid = user_id.map(|s| s.to_string());
        let purchase_id = dto.purchase_id.clone();
        let reason_cloned = dto.reason.clone();
        let notes_cloned = dto.notes.clone();
        let requested_lines = dto.lines.clone();

        let detail = with_transaction(&self.db, move |tx| {
            // 1. Validate purchase exists and is completed
            let purchase = SQLitePurchaseRepository::get_by_id_in_tx(tx, &purchase_id)?
                .ok_or_else(|| DbError::NotFound(format!("Purchase with id '{purchase_id}' not found")))?;

            if purchase.status != PurchaseStatus::Completed {
                return Err(DbError::ValidationError(format!(
                    "Purchase '{}' has status '{}'. Only COMPLETED purchases can be returned.",
                    purchase.purchase_number,
                    purchase.status.as_str()
                )));
            }

            // 2. Fetch original purchase lines
            let original_lines = SQLitePurchaseRepository::get_purchase_lines_in_tx(tx, &purchase_id)?;
            let orig_line_map: HashMap<String, _> = original_lines.into_iter().map(|l| (l.id.clone(), l)).collect();

            // 3. Validate lines, stock availability, and calculate return amounts
            let mut calculated_lines = Vec::with_capacity(requested_lines.len());
            let mut total_return_amount: i64 = 0;

            for req in &requested_lines {
                let orig = orig_line_map.get(&req.purchase_line_id).ok_or_else(|| {
                    DbError::ValidationError(format!(
                        "Purchase line '{}' does not belong to purchase '{}'",
                        req.purchase_line_id, purchase.purchase_number
                    ))
                })?;

                let already_returned =
                    SQLitePurchaseReturnRepository::get_returned_quantity_for_purchase_line_in_tx(tx, &orig.id)?;
                let returnable_quantity = orig.quantity.saturating_sub(already_returned);

                if req.quantity > returnable_quantity {
                    return Err(DbError::ValidationError(format!(
                        "Requested return quantity {} exceeds remaining returnable quantity {} for product '{}'",
                        req.quantity, returnable_quantity, orig.product_name_snapshot
                    )));
                }

                // Check available physical stock (reject if stock < return quantity to prevent negative stock)
                let current_stock =
                    SQLiteInventoryRepository::get_stock_in_tx(tx, &orig.product_id, &purchase.branch_id)?;
                if current_stock < req.quantity {
                    return Err(DbError::ValidationError(format!(
                        "Insufficient stock for product '{}' (SKU: {}). Current available stock is {}, requested return is {}. Return would produce negative stock.",
                        orig.product_name_snapshot, orig.sku_snapshot, current_stock, req.quantity
                    )));
                }

                // Return amount using historical purchase line unit cost
                let line_return_amount = (orig.line_total * req.quantity) / orig.quantity;
                total_return_amount += line_return_amount;

                calculated_lines.push((orig, req.quantity, line_return_amount));
            }

            if total_return_amount <= 0 {
                return Err(DbError::ValidationError("Total return amount must be greater than 0".to_string()));
            }

            // 4. Generate PRET number and IDs
            let return_number = SQLitePurchaseReturnRepository::next_return_number_in_tx(tx)?;
            let return_id = Uuid::new_v4().to_string();

            // 5. Stock Reversal (Inventory OUT)
            for (orig, qty, _) in &calculated_lines {
                let prev_stock = SQLiteInventoryRepository::get_stock_in_tx(tx, &orig.product_id, &purchase.branch_id)?;
                let resulting_stock = prev_stock - *qty;

                SQLiteInventoryRepository::set_stock_in_tx(
                    tx,
                    &orig.product_id,
                    &purchase.branch_id,
                    resulting_stock,
                    &now,
                )?;

                let movement = StockMovement {
                    id: Uuid::new_v4().to_string(),
                    product_id: orig.product_id.clone(),
                    branch_id: purchase.branch_id.clone(),
                    movement_type: StockMovementType::Out,
                    quantity: *qty,
                    previous_stock: prev_stock,
                    resulting_stock,
                    reason: Some(format!("Purchase Return {}", return_number)),
                    performed_by: uid.clone(),
                    reference_id: Some(return_id.clone()),
                    created_at: now.clone(),
                };

                SQLiteInventoryRepository::insert_movement_in_tx(tx, &movement)?;
            }

            // 6. Handle financial settlement
            let mut supplier_payable_after = None;
            let mut cash_settled = None;

            match settlement_method {
                PurchaseSettlementMethod::Cash => {
                    // Must have an active OPEN cash session on the branch
                    let open_session_id = SQLiteCashRepository::get_open_session_id_in_tx(tx, &purchase.branch_id)?
                        .ok_or_else(|| {
                            DbError::ValidationError(format!(
                                "Cannot process supplier cash settlement: No OPEN cash session found for branch '{}'. Please open a cash session first.",
                                purchase.branch_id
                            ))
                        })?;

                    let cash_movement = CashMovement {
                        id: Uuid::new_v4().to_string(),
                        session_id: Some(open_session_id),
                        branch_id: purchase.branch_id.clone(),
                        movement_type: CashMovementType::SupplierPayment,
                        direction: CashMovementDirection::In,
                        amount: total_return_amount,
                        reference_id: Some(return_id.clone()),
                        reference_number: Some(return_number.clone()),
                        payment_method: "CASH".to_string(),
                        description: format!("Cash refund for Purchase Return {}", return_number),
                        performed_by: uid.clone(),
                        performed_by_name: None,
                        created_at: now.clone(),
                    };

                    SQLiteCashRepository::insert_movement_in_tx(tx, &cash_movement)?;
                    cash_settled = Some(total_return_amount);
                }
                PurchaseSettlementMethod::SupplierCredit => {
                    let current_payable =
                        SQLiteSupplierRepository::get_outstanding_balance_in_tx(tx, &purchase.supplier_id)?;

                    if current_payable < total_return_amount {
                        return Err(DbError::ValidationError(format!(
                            "Supplier credit settlement of Rs {} cannot exceed current outstanding payable of Rs {} (negative payable is prohibited).",
                            total_return_amount, current_payable
                        )));
                    }

                    let new_balance = current_payable - total_return_amount;
                    supplier_payable_after = Some(new_balance);

                    let ledger_entry = SupplierLedgerEntry {
                        id: Uuid::new_v4().to_string(),
                        supplier_id: purchase.supplier_id.clone(),
                        reference_id: Some(return_id.clone()),
                        reference_number: Some(return_number.clone()),
                        entry_type: SupplierLedgerEntryType::Adjustment,
                        debit: 0,
                        credit: total_return_amount,
                        balance_after: new_balance,
                        description: format!("Purchase Return {} - Payable Credit", return_number),
                        performed_by: uid.clone(),
                        created_at: now.clone(),
                    };

                    SQLiteSupplierRepository::insert_ledger_entry_in_tx(tx, &ledger_entry)?;
                }
            }

            // Fetch supplier name snapshot
            let supplier_name: Option<String> = tx
                .query_row(
                    "SELECT name FROM suppliers WHERE id = ?1",
                    params![purchase.supplier_id],
                    |r| r.get(0),
                )
                .ok();

            // 7. Insert Purchase Return Header
            let purchase_return = PurchaseReturn {
                id: return_id.clone(),
                return_number: return_number.clone(),
                purchase_id: purchase.id.clone(),
                branch_id: purchase.branch_id.clone(),
                supplier_id: purchase.supplier_id.clone(),
                supplier_name_snapshot: supplier_name,
                total_amount: total_return_amount,
                settlement_method,
                status: PurchaseReturnStatus::Completed,
                reason: reason_cloned,
                notes: notes_cloned,
                performed_by: uid.clone(),
                created_at: now.clone(),
                updated_at: now.clone(),
            };

            SQLitePurchaseReturnRepository::insert_purchase_return_in_tx(tx, &purchase_return)?;

            // 8. Insert Purchase Return Lines
            let mut domain_lines = Vec::with_capacity(calculated_lines.len());
            for (orig, qty, ret_amount) in calculated_lines {
                let line = PurchaseReturnLine {
                    id: Uuid::new_v4().to_string(),
                    return_id: return_id.clone(),
                    purchase_line_id: orig.id.clone(),
                    product_id: orig.product_id.clone(),
                    product_name_snapshot: orig.product_name_snapshot.clone(),
                    sku_snapshot: orig.sku_snapshot.clone(),
                    unit_cost: orig.unit_cost,
                    quantity: qty,
                    return_amount: ret_amount,
                    created_at: now.clone(),
                };
                domain_lines.push(line);
            }

            SQLitePurchaseReturnRepository::insert_purchase_return_lines_in_tx(tx, &domain_lines)?;

            Ok(PurchaseReturnDetailDto {
                purchase_return,
                lines: domain_lines,
                purchase_number: purchase.purchase_number,
                supplier_payable_after,
                cash_settled,
            })
        })
        .await?;

        Ok(detail)
    }

    pub async fn get_purchase_return(&self, id: &str) -> AppResult<Option<PurchaseReturnDetailDto>> {
        self.repo.get_by_id(id).await
    }

    pub async fn list_purchase_returns(
        &self,
        branch_id: Option<&str>,
        limit: Option<i64>,
    ) -> AppResult<Vec<PurchaseReturnDetailDto>> {
        self.repo.list_purchase_returns(branch_id, limit).await
    }

    pub async fn get_purchase_returns_by_purchase(
        &self,
        purchase_id: &str,
    ) -> AppResult<Vec<PurchaseReturnDetailDto>> {
        self.repo.get_by_purchase_id(purchase_id).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::connection::DatabaseConnection;
    use crate::domain::cash::OpenCashSessionDto;
    use crate::domain::organization::DEFAULT_MAIN_BRANCH_ID;
    use crate::domain::purchases::{CompletePurchaseDto, PurchaseItemDto};
use crate::domain::supplier::CreateSupplierDto;
    use crate::services::cash_service::CashService;
    use crate::services::purchase_service::PurchaseService;
    use crate::services::supplier_service::SupplierService;

    use crate::db::migrations::MigrationRunner;

    async fn setup_test_db() -> (
        DatabaseConnection,
        PurchaseReturnService,
        PurchaseService,
        CashService,
        SupplierService,
        String,
        String,
    ) {
        let db = DatabaseConnection::open_in_memory().unwrap();
        {
            let conn_arc = db.inner();
            let mut guard = conn_arc.lock().await;
            guard.pragma_update(None, "foreign_keys", "ON").unwrap();
            MigrationRunner::run(&mut guard).expect("migrations");

            // Seed Admin User for tests
            guard.execute(
                "INSERT INTO users (id, name, username, login_key_hash, role, is_active, created_at, updated_at)
                 VALUES ('11111111-1111-1111-1111-111111111111', 'Admin User', 'admin1', 'hash', 'ADMIN', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
                [],
            ).unwrap();
        }

        let pr_service = PurchaseReturnService::new(db.clone());
        let purchase_service = PurchaseService::new(db.clone());
        let cash_service = CashService::new(db.clone());
        let supp_service = SupplierService::new(db.clone());

        // Create supplier
        let supp = supp_service
            .create_supplier(CreateSupplierDto {
                name: "Al-Rehman Electronics".to_string(),
                phone: "03211234567".to_string(),
                alternate_phone: None,
                email: None,
                address: None,
                notes: None,
                credit_limit: Some(1000000),
            })
            .await
            .unwrap();

        // Create product with 0 stock
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
                 VALUES ('00000000-0000-0000-0000-000000000011', 'Samsung', 'SAMSUNG', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
                [],
            ).unwrap();
            guard.execute(
                "INSERT INTO units (id, name, symbol, conversion_factor, is_active, created_at, updated_at)
                 VALUES ('00000000-0000-0000-0000-000000000012', 'Piece', 'PCS', 1, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
                [],
            ).unwrap();
            guard.execute(
                "INSERT INTO products (id, name, sku, category_id, brand_id, unit_id, purchase_price, sale_price, low_stock_threshold, is_active, created_at, updated_at)
                 VALUES (?1, 'Samsung Galaxy A55', 'SMA55-256', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000012', 110000, 130000, 5, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
                rusqlite::params![prod_id],
            ).unwrap();
            guard.execute(
                "INSERT INTO stock (product_id, branch_id, quantity, updated_at)
                 VALUES (?1, ?2, 0, '2026-01-01T00:00:00Z')",
                rusqlite::params![prod_id, DEFAULT_MAIN_BRANCH_ID],
            ).unwrap();
        }

        (
            db,
            pr_service,
            purchase_service,
            cash_service,
            supp_service,
            supp.id,
            prod_id,
        )
    }

    #[tokio::test]
    async fn test_full_cash_purchase_return_flow() {
        let (db, pr_svc, purch_svc, cash_svc, _, supp_id, prod_id) = setup_test_db().await;

        // Open cash session
        cash_svc
            .open_session(
                Some("11111111-1111-1111-1111-111111111111"),
                OpenCashSessionDto {
                    branch_id: Some(DEFAULT_MAIN_BRANCH_ID.to_string()),
                    business_date: Some("2026-01-01".to_string()),
                    opening_cash: 50000,
                    notes: None,
                },
            )
            .await
            .unwrap();

        // 1. Purchase 10 Samsung phones for Cash (10 * 110,000 = 1,100,000)
        let purch_res = purch_svc
            .complete_purchase(
                Some("11111111-1111-1111-1111-111111111111"),
                CompletePurchaseDto {
                    supplier_id: supp_id.clone(),
                    branch_id: Some(DEFAULT_MAIN_BRANCH_ID.to_string()),
                    items: vec![PurchaseItemDto {
                        product_id: prod_id.clone(),
                        quantity: 10,
                        unit_cost: Some(110000),
                        discount: None,
                    }],
                    discount: None,
                    paid_amount: Some(1100000),
                    payment_method: Some("CASH".to_string()),
                    notes: None,
                },
            )
            .await
            .unwrap();

        assert_eq!(purch_res.purchase.total_amount, 1100000);

        // Stock is now 10
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
        assert_eq!(stock_mid, 10);

        // Check returnable info
        let returnable_info = pr_svc.get_purchase_returnable_info(&purch_res.purchase.id).await.unwrap();
        assert_eq!(returnable_info.lines.len(), 1);
        assert_eq!(returnable_info.lines[0].original_quantity, 10);
        assert_eq!(returnable_info.lines[0].returnable_quantity, 10);
        assert_eq!(returnable_info.lines[0].current_available_stock, 10);

        let purch_line_id = returnable_info.lines[0].purchase_line_id.clone();

        // 2. Return 4 phones to supplier for CASH refund (4 * 110,000 = 440,000)
        let return_res = pr_svc
            .create_purchase_return(
                CreatePurchaseReturnDto {
                    purchase_id: purch_res.purchase.id.clone(),
                    lines: vec![crate::domain::purchase_return::CreatePurchaseReturnLineDto {
                        purchase_line_id: purch_line_id.clone(),
                        quantity: 4,
                    }],
                    settlement_method: "CASH".to_string(),
                    reason: Some("Defective batch returned to supplier".to_string()),
                    notes: None,
                },
                Some("11111111-1111-1111-1111-111111111111"),
            )
            .await
            .unwrap();

        assert_eq!(return_res.purchase_return.return_number, "PRET-000001");
        assert_eq!(return_res.purchase_return.total_amount, 440000);
        assert_eq!(return_res.cash_settled, Some(440000));

        // 3. Verify stock decreased: 10 - 4 = 6
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
        assert_eq!(stock_after, 6);

        // 4. Verify stock movement OUT created
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
        assert_eq!(last_movement.0, "OUT");
        assert_eq!(last_movement.1, 4);
        assert_eq!(last_movement.2, 10);
        assert_eq!(last_movement.3, 6);

        // 5. Cash drawer received 440,000 cash back from supplier (Cash IN)
        let summary = cash_svc.get_daily_summary(Some(DEFAULT_MAIN_BRANCH_ID), Some("2026-01-01")).await.unwrap();
        // Opening: 50,000 + Cash In (supplier refund): 440,000 - Cash Out (purchase): 1,100,000
        assert_eq!(summary.total_cash_in, 440000);
        assert_eq!(summary.total_cash_out, 1100000);
        assert_eq!(summary.expected_closing_cash, 50000 + 440000 - 1100000);
    }

    #[tokio::test]
    async fn test_supplier_credit_purchase_return_reduces_payable() {
        let (_, pr_svc, purch_svc, _, supp_svc, supp_id, prod_id) = setup_test_db().await;

        // 1. Credit purchase of 5 phones (5 * 110,000 = 550,000), 0 paid
        let purch_res = purch_svc
            .complete_purchase(
                Some("11111111-1111-1111-1111-111111111111"),
                CompletePurchaseDto {
                    supplier_id: supp_id.clone(),
                    branch_id: Some(DEFAULT_MAIN_BRANCH_ID.to_string()),
                    items: vec![PurchaseItemDto {
                        product_id: prod_id.clone(),
                        quantity: 5,
                        unit_cost: Some(110000),
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

        // Supplier payable is now 550,000
        let bal_before = supp_svc.get_outstanding_balance(&supp_id).await.unwrap();
        assert_eq!(bal_before, 550000);

        let purch_line_id = purch_res.lines[0].id.clone();

        // 2. Return 2 phones for SUPPLIER_CREDIT (2 * 110,000 = 220,000 reduction in payable)
        let return_res = pr_svc
            .create_purchase_return(
                CreatePurchaseReturnDto {
                    purchase_id: purch_res.purchase.id.clone(),
                    lines: vec![crate::domain::purchase_return::CreatePurchaseReturnLineDto {
                        purchase_line_id: purch_line_id,
                        quantity: 2,
                    }],
                    settlement_method: "SUPPLIER_CREDIT".to_string(),
                    reason: Some("Returning 2 phones on credit".to_string()),
                    notes: None,
                },
                Some("11111111-1111-1111-1111-111111111111"),
            )
            .await
            .unwrap();

        assert_eq!(return_res.purchase_return.total_amount, 220000);
        assert_eq!(return_res.supplier_payable_after, Some(330000));

        // 3. Supplier payable is now exactly 330,000
        let bal_after = supp_svc.get_outstanding_balance(&supp_id).await.unwrap();
        assert_eq!(bal_after, 330000);
    }

    #[tokio::test]
    async fn test_insufficient_stock_for_purchase_return_rejected() {
        let (db, pr_svc, purch_svc, _, _, supp_id, prod_id) = setup_test_db().await;

        // Purchase 5 units
        let purch_res = purch_svc
            .complete_purchase(
                Some("11111111-1111-1111-1111-111111111111"),
                CompletePurchaseDto {
                    supplier_id: supp_id.clone(),
                    branch_id: Some(DEFAULT_MAIN_BRANCH_ID.to_string()),
                    items: vec![PurchaseItemDto {
                        product_id: prod_id.clone(),
                        quantity: 5,
                        unit_cost: Some(110000),
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

        let purch_line_id = purch_res.lines[0].id.clone();

        // Manually simulate items sold so current stock drops from 5 to 1
        {
            let conn = db.inner();
            let g = conn.lock().await;
            g.execute(
                "UPDATE stock SET quantity = 1 WHERE product_id = ?1",
                rusqlite::params![prod_id],
            ).unwrap();
        }

        // Attempting to return 3 units when stock is only 1 MUST FAIL (prevent negative stock)
        let stock_err = pr_svc
            .create_purchase_return(
                CreatePurchaseReturnDto {
                    purchase_id: purch_res.purchase.id.clone(),
                    lines: vec![crate::domain::purchase_return::CreatePurchaseReturnLineDto {
                        purchase_line_id: purch_line_id,
                        quantity: 3,
                    }],
                    settlement_method: "SUPPLIER_CREDIT".to_string(),
                    reason: None,
                    notes: None,
                },
                Some("11111111-1111-1111-1111-111111111111"),
            )
            .await;

        assert!(stock_err.is_err());
        let err_msg = stock_err.unwrap_err().to_string();
        assert!(err_msg.contains("Insufficient stock for product"));
        assert!(err_msg.contains("Return would produce negative stock"));
    }
}
