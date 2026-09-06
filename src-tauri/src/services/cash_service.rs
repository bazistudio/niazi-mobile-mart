use chrono::Utc;
use uuid::Uuid;

use crate::db::connection::DatabaseConnection;
use crate::db::errors::DbError;
use crate::db::transaction::with_transaction;
use crate::domain::cash::{
    CashMovement, CashMovementDirection, CashMovementFilterDto, CashMovementType, CashSession,
    CashSessionStatus, CloseCashSessionDto, CreateCashAdjustmentDto, DailyCashSummaryDto,
    OpenCashSessionDto,
};
use crate::domain::organization::DEFAULT_MAIN_BRANCH_ID;
use crate::errors::{AppError, AppResult};
use crate::repositories::branch_repository::BranchRepository;
use crate::repositories::cash_repository::SQLiteCashRepository;

#[derive(Clone)]
pub struct CashService {
    db: DatabaseConnection,
    cash_repo: SQLiteCashRepository,
    branch_repo: BranchRepository,
}

impl CashService {
    pub fn new(db: DatabaseConnection) -> Self {
        Self {
            cash_repo: SQLiteCashRepository::new(db.clone()),
            branch_repo: BranchRepository::new(db.clone()),
            db,
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Cash Session Management
    // ──────────────────────────────────────────────────────────────────────────

    pub async fn open_session(
        &self,
        user_id: Option<&str>,
        dto: OpenCashSessionDto,
    ) -> AppResult<CashSession> {
        if dto.opening_cash < 0 {
            return Err(AppError::Validation(
                "Opening cash amount cannot be negative".to_string(),
            ));
        }

        let branch_id = match dto.branch_id.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
            Some(bid) => bid.to_string(),
            None => match self.branch_repo.get_main_branch().await? {
                Some(b) => b.id,
                None => DEFAULT_MAIN_BRANCH_ID.to_string(),
            },
        };

        let now = Utc::now().to_rfc3339();
        let business_date = dto
            .business_date
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string)
            .unwrap_or_else(|| now[0..10].to_string());

        let uid = user_id.map(str::to_string);
        let notes = dto.notes.map(|n| n.trim().to_string()).filter(|n| !n.is_empty());
        let opening_cash = dto.opening_cash;

        let session = with_transaction(&self.db, move |tx| {
            // Check if there is already an active OPEN session for this branch
            if let Some(active) = SQLiteCashRepository::get_open_session_in_tx(tx, &branch_id)? {
                return Err(DbError::ValidationError(format!(
                    "A cash session is already OPEN for this branch (Business Date: {}, Opened At: {})",
                    active.business_date, active.opened_at
                )));
            }

            let session_id = Uuid::new_v4().to_string();

            let session = CashSession {
                id: session_id,
                branch_id,
                branch_name: None,
                business_date,
                opening_cash,
                expected_closing_cash: None,
                actual_closing_cash: None,
                cash_variance: None,
                status: CashSessionStatus::Open,
                opened_at: now,
                closed_at: None,
                opened_by: uid,
                opened_by_name: None,
                closed_by: None,
                closed_by_name: None,
                notes,
            };

            SQLiteCashRepository::insert_session_in_tx(tx, &session)?;

            Ok(session)
        })
        .await?;

        Ok(session)
    }

    pub async fn get_current_session(&self, branch_id: Option<&str>) -> AppResult<Option<CashSession>> {
        let bid = match branch_id.map(str::trim).filter(|s| !s.is_empty()) {
            Some(b) => b.to_string(),
            None => match self.branch_repo.get_main_branch().await? {
                Some(b) => b.id,
                None => DEFAULT_MAIN_BRANCH_ID.to_string(),
            },
        };

        self.cash_repo.get_open_session(&bid).await
    }

    pub async fn get_session_by_id(&self, id: &str) -> AppResult<CashSession> {
        self.cash_repo
            .get_session_by_id(id)
            .await?
            .ok_or_else(|| AppError::NotFound(format!("Cash session '{id}' not found")))
    }

    pub async fn list_sessions(
        &self,
        branch_id: Option<&str>,
        limit: Option<i64>,
        offset: Option<i64>,
    ) -> AppResult<Vec<CashSession>> {
        self.cash_repo.list_sessions(branch_id, limit, offset).await
    }

    pub async fn close_session(
        &self,
        user_id: Option<&str>,
        dto: CloseCashSessionDto,
    ) -> AppResult<CashSession> {
        if dto.actual_closing_cash < 0 {
            return Err(AppError::Validation(
                "Actual closing cash count cannot be negative".to_string(),
            ));
        }

        let sid = dto.session_id.trim().to_string();
        let actual_closing = dto.actual_closing_cash;
        let notes = dto.notes.map(|n| n.trim().to_string()).filter(|n| !n.is_empty());
        let uid = user_id.map(str::to_string);

        let closed_session = with_transaction(&self.db, move |tx| {
            let now = Utc::now().to_rfc3339();

            // 1. Verify session exists and is OPEN
            let current = SQLiteCashRepository::get_session_by_id_in_tx(tx, &sid)?
                .ok_or_else(|| DbError::NotFound(format!("Cash session '{sid}' not found")))?;

            if current.status != CashSessionStatus::Open {
                return Err(DbError::ValidationError(format!(
                    "Cash session '{sid}' is already CLOSED"
                )));
            }

            // 2. Authoritative Expected Cash Calculation inside transaction
            let summary = SQLiteCashRepository::calculate_session_summary_in_tx(tx, &sid)?;
            let expected_closing = summary.expected_closing_cash;
            let variance = actual_closing - expected_closing;

            // 3. Atomically close session
            SQLiteCashRepository::close_session_in_tx(
                tx,
                &sid,
                expected_closing,
                actual_closing,
                variance,
                uid.as_deref(),
                &now,
                notes.as_deref(),
            )?;

            // 4. Return updated closed session record
            let mut closed = current;
            closed.expected_closing_cash = Some(expected_closing);
            closed.actual_closing_cash = Some(actual_closing);
            closed.cash_variance = Some(variance);
            closed.status = CashSessionStatus::Closed;
            closed.closed_at = Some(now);
            closed.closed_by = uid;
            if notes.is_some() {
                closed.notes = notes;
            }

            Ok(closed)
        })
        .await?;

        Ok(closed_session)
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Cash Adjustments & Movements
    // ──────────────────────────────────────────────────────────────────────────

    pub async fn create_adjustment(
        &self,
        user_id: Option<&str>,
        dto: CreateCashAdjustmentDto,
    ) -> AppResult<CashMovement> {
        if dto.amount <= 0 {
            return Err(AppError::Validation(
                "Adjustment amount must be greater than 0".to_string(),
            ));
        }

        let direction_str = dto.direction.trim().to_uppercase();
        let direction = match CashMovementDirection::from_str(&direction_str) {
            Some(d) => d,
            None => {
                return Err(AppError::Validation(
                    "Invalid adjustment direction. Must be 'IN' or 'OUT'".to_string(),
                ))
            }
        };

        let reason = dto.reason.trim();
        if reason.is_empty() {
            return Err(AppError::Validation(
                "A reason is required for every cash adjustment".to_string(),
            ));
        }

        let branch_id = match dto.branch_id.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
            Some(bid) => bid.to_string(),
            None => match self.branch_repo.get_main_branch().await? {
                Some(b) => b.id,
                None => DEFAULT_MAIN_BRANCH_ID.to_string(),
            },
        };

        let uid = user_id.map(str::to_string);
        let amount = dto.amount;
        let desc = format!("Cash Adjustment ({}): {}", direction.as_str(), reason);

        let movement = with_transaction(&self.db, move |tx| {
            let now = Utc::now().to_rfc3339();
            let open_session_id = SQLiteCashRepository::get_open_session_id_in_tx(tx, &branch_id)?
                .ok_or_else(|| DbError::ValidationError(format!(
                    "Cannot perform cash adjustment: No cash session is currently OPEN for branch '{branch_id}'."
                )))?;

            let movement = CashMovement {
                id: Uuid::new_v4().to_string(),
                session_id: Some(open_session_id),
                branch_id,
                movement_type: CashMovementType::CashAdjustment,
                direction,
                amount,
                reference_id: None,
                reference_number: None,
                payment_method: "CASH".to_string(),
                description: desc,
                performed_by: uid,
                performed_by_name: None,
                created_at: now,
            };

            SQLiteCashRepository::insert_movement_in_tx(tx, &movement)?;

            Ok(movement)
        })
        .await?;

        Ok(movement)
    }

    pub async fn list_movements(
        &self,
        filter: Option<CashMovementFilterDto>,
    ) -> AppResult<Vec<CashMovement>> {
        let f = filter.unwrap_or_default();
        self.cash_repo.list_movements(&f).await
    }

    pub async fn get_daily_summary(
        &self,
        branch_id: Option<&str>,
        date: Option<&str>,
    ) -> AppResult<DailyCashSummaryDto> {
        let bid = match branch_id.map(str::trim).filter(|s| !s.is_empty()) {
            Some(b) => b.to_string(),
            None => match self.branch_repo.get_main_branch().await? {
                Some(b) => b.id,
                None => DEFAULT_MAIN_BRANCH_ID.to_string(),
            },
        };

        let now = Utc::now().to_rfc3339();
        let target_date = match date.map(str::trim).filter(|s| !s.is_empty()) {
            Some(d) => d.to_string(),
            None => now[0..10].to_string(),
        };

        self.cash_repo.get_daily_summary(&bid, &target_date).await
    }
}

#[cfg(test)]
pub mod tests {
    use super::*;
    use crate::db::connection::DatabaseConnection;
    use crate::domain::customer::{CreateCustomerDto, RecordCustomerPaymentDto};
    use crate::domain::expense::CreateExpenseDto;
    use crate::domain::purchases::{CompletePurchaseDto, PurchaseItemDto};
    use crate::domain::sales::{CompleteSaleDto, SaleItemDto};
    use crate::domain::supplier::{CreateSupplierDto, RecordSupplierPaymentDto};
    use crate::services::customer_service::CustomerService;
    use crate::services::expense_service::ExpenseService;
    use crate::services::purchase_service::PurchaseService;
    use crate::services::sale_service::SaleService;
    use crate::services::supplier_service::SupplierService;

    const TEST_USER_ID: &str = "99999999-9999-9999-9999-999999999999";

    async fn setup_test_context() -> (
        DatabaseConnection,
        CashService,
        ExpenseService,
        SaleService,
        CustomerService,
        SupplierService,
        PurchaseService,
        String, // prod_id
    ) {
        let db = DatabaseConnection::open_in_memory().unwrap();
        {
            let conn_arc = db.inner();
            let conn = conn_arc.lock().await;
            conn.pragma_update(None, "foreign_keys", "ON").unwrap();

            // Seed User
            conn.execute(
                "INSERT OR IGNORE INTO users (id, name, username, login_key_hash, role, is_active, created_at, updated_at)
                 VALUES ('99999999-9999-9999-9999-999999999999', 'Admin User', 'admin_user', 'hash', 'admin', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
                [],
            ).unwrap();

            // Seed Category, Unit, Product
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
                 VALUES ('00000000-0000-0000-0000-000000000030', 'Galaxy S24', 'GAL-S24', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000020', 60000, 75000, 5, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
                [],
            ).unwrap();

            // Seed initial stock
            conn.execute(
                "INSERT INTO stock (product_id, branch_id, quantity, updated_at)
                 VALUES ('00000000-0000-0000-0000-000000000030', '00000000-0000-0000-0000-000000000002', 50, '2026-01-01T00:00:00Z')",
                [],
            ).unwrap();
        }

        let cash_service = CashService::new(db.clone());
        let expense_service = ExpenseService::new(db.clone());
        let sale_service = SaleService::new(db.clone());
        let customer_service = CustomerService::new(db.clone());
        let supplier_service = SupplierService::new(db.clone());
        let purchase_service = PurchaseService::new(db.clone());

        (
            db,
            cash_service,
            expense_service,
            sale_service,
            customer_service,
            supplier_service,
            purchase_service,
            "00000000-0000-0000-0000-000000000030".to_string(),
        )
    }

    #[tokio::test]
    async fn test_cash_session_lifecycle_and_single_open_enforcement() {
        let (_db, cash_svc, _, _, _, _, _, _) = setup_test_context().await;

        // 1. Initially no current session
        let initial = cash_svc.get_current_session(None).await.unwrap();
        assert!(initial.is_none());

        // 2. Open cash session
        let session = cash_svc
            .open_session(
                Some(TEST_USER_ID),
                OpenCashSessionDto {
                    branch_id: None,
                    business_date: None,
                    opening_cash: 25000,
                    notes: Some("Opening drawer".to_string()),
                },
            )
            .await
            .unwrap();
        assert_eq!(session.status, CashSessionStatus::Open);
        assert_eq!(session.opening_cash, 25000);
        assert!(session.expected_closing_cash.is_none());
        assert!(session.closed_at.is_none());

        // 3. Current session should return this session
        let current = cash_svc.get_current_session(None).await.unwrap();
        assert!(current.is_some());
        assert_eq!(current.unwrap().id, session.id);

        // 4. Duplicate open on same branch must be rejected
        let dup_err = cash_svc
            .open_session(
                Some(TEST_USER_ID),
                OpenCashSessionDto {
                    branch_id: None,
                    business_date: None,
                    opening_cash: 10000,
                    notes: None,
                },
            )
            .await;
        assert!(dup_err.is_err());

        // 5. Close session with exact match (Actual = 25000)
        let closed = cash_svc
            .close_session(
                Some(TEST_USER_ID),
                CloseCashSessionDto {
                    session_id: session.id.clone(),
                    actual_closing_cash: 25000,
                    notes: Some("Drawer balanced".to_string()),
                },
            )
            .await
            .unwrap();
        assert_eq!(closed.status, CashSessionStatus::Closed);
        assert_eq!(closed.actual_closing_cash, Some(25000));
        assert_eq!(closed.cash_variance, Some(0));
        assert!(closed.closed_at.is_some());

        // 6. Current session is now None
        let after_close = cash_svc.get_current_session(None).await.unwrap();
        assert!(after_close.is_none());

        // 7. Now can open a new session for the next shift
        let next_session = cash_svc
            .open_session(
                Some(TEST_USER_ID),
                OpenCashSessionDto {
                    branch_id: None,
                    business_date: None,
                    opening_cash: 25000,
                    notes: Some("Evening shift".to_string()),
                },
            )
            .await
            .unwrap();
        assert_eq!(next_session.status, CashSessionStatus::Open);
    }

    #[tokio::test]
    async fn test_cash_adjustments_and_variance_calculation() {
        let (_db, cash_svc, _, _, _, _, _, _) = setup_test_context().await;

        // Open session with 20,000 PKR
        let session = cash_svc
            .open_session(
                Some(TEST_USER_ID),
                OpenCashSessionDto {
                    branch_id: None,
                    business_date: None,
                    opening_cash: 20000,
                    notes: None,
                },
            )
            .await
            .unwrap();

        // 1. Adjustment IN: +5,000 PKR
        let adj_in = cash_svc
            .create_adjustment(
                Some(TEST_USER_ID),
                CreateCashAdjustmentDto {
                    branch_id: None,
                    amount: 5000,
                    direction: "IN".to_string(),
                    reason: "Drawer replenishment".to_string(),
                },
            )
            .await
            .unwrap();
        assert_eq!(adj_in.direction, CashMovementDirection::In);
        assert_eq!(adj_in.amount, 5000);

        // 2. Adjustment OUT: -2,000 PKR
        let adj_out = cash_svc
            .create_adjustment(
                Some(TEST_USER_ID),
                CreateCashAdjustmentDto {
                    branch_id: None,
                    amount: 2000,
                    direction: "OUT".to_string(),
                    reason: "Petty cash drawer transfer".to_string(),
                },
            )
            .await
            .unwrap();
        assert_eq!(adj_out.direction, CashMovementDirection::Out);
        assert_eq!(adj_out.amount, 2000);

        // Expected = 20,000 + 5,000 - 2,000 = 23,000
        let summary = cash_svc.get_daily_summary(None, None).await.unwrap();
        assert_eq!(summary.opening_cash, 20000);
        assert_eq!(summary.cash_adjustments, 3000); // Net +3000
        assert_eq!(summary.expected_closing_cash, 23000);

        // 3. Close with actual 22,500 (Shortage of 500 PKR)
        let closed = cash_svc
            .close_session(
                Some(TEST_USER_ID),
                CloseCashSessionDto {
                    session_id: session.id.clone(),
                    actual_closing_cash: 22500,
                    notes: Some("Shortage noted".to_string()),
                },
            )
            .await
            .unwrap();

        assert_eq!(closed.expected_closing_cash, Some(23000));
        assert_eq!(closed.actual_closing_cash, Some(22500));
        assert_eq!(closed.cash_variance, Some(-500)); // Negative variance
    }

    #[tokio::test]
    async fn test_adjustment_validation_and_closed_session_protection() {
        let (_db, cash_svc, _, _, _, _, _, _) = setup_test_context().await;

        // No session open yet -> adjustment must fail
        let no_session_err = cash_svc
            .create_adjustment(
                Some(TEST_USER_ID),
                CreateCashAdjustmentDto {
                    branch_id: None,
                    amount: 1000,
                    direction: "IN".to_string(),
                    reason: "Before session".to_string(),
                },
            )
            .await;
        assert!(no_session_err.is_err());

        // Open session
        let session = cash_svc
            .open_session(
                Some(TEST_USER_ID),
                OpenCashSessionDto {
                    branch_id: None,
                    business_date: None,
                    opening_cash: 10000,
                    notes: None,
                },
            )
            .await
            .unwrap();

        // Amount <= 0 must fail
        let zero_amount_err = cash_svc
            .create_adjustment(
                Some(TEST_USER_ID),
                CreateCashAdjustmentDto {
                    branch_id: None,
                    amount: 0,
                    direction: "IN".to_string(),
                    reason: "Zero".to_string(),
                },
            )
            .await;
        assert!(zero_amount_err.is_err());

        // Empty reason must fail
        let empty_reason_err = cash_svc
            .create_adjustment(
                Some(TEST_USER_ID),
                CreateCashAdjustmentDto {
                    branch_id: None,
                    amount: 500,
                    direction: "IN".to_string(),
                    reason: "   ".to_string(),
                },
            )
            .await;
        assert!(empty_reason_err.is_err());

        // Invalid direction must fail
        let bad_dir_err = cash_svc
            .create_adjustment(
                Some(TEST_USER_ID),
                CreateCashAdjustmentDto {
                    branch_id: None,
                    amount: 500,
                    direction: "UNKNOWN".to_string(),
                    reason: "Bad dir".to_string(),
                },
            )
            .await;
        assert!(bad_dir_err.is_err());

        // Close session
        cash_svc
            .close_session(
                Some(TEST_USER_ID),
                CloseCashSessionDto {
                    session_id: session.id.clone(),
                    actual_closing_cash: 10000,
                    notes: None,
                },
            )
            .await
            .unwrap();

        // Double closing must fail
        let double_close_err = cash_svc
            .close_session(
                Some(TEST_USER_ID),
                CloseCashSessionDto {
                    session_id: session.id.clone(),
                    actual_closing_cash: 10000,
                    notes: None,
                },
            )
            .await;
        assert!(double_close_err.is_err());
    }

    #[tokio::test]
    async fn test_full_operational_financial_flow_and_reconciliation() {
        let (
            _db,
            cash_svc,
            expense_svc,
            sale_svc,
            customer_svc,
            supplier_svc,
            purchase_svc,
            prod_id,
        ) = setup_test_context().await;

        // 1. OPEN CASH SESSION: 20,000 PKR
        let session = cash_svc
            .open_session(
                Some(TEST_USER_ID),
                OpenCashSessionDto {
                    branch_id: None,
                    business_date: None,
                    opening_cash: 20000,
                    notes: Some("Main morning shift".to_string()),
                },
            )
            .await
            .unwrap();

        // 2. CASH SALE: +75,000 PKR
        // 1 unit of Galaxy S24 @ 75,000 PKR, paid in CASH
        let sale_res = sale_svc
            .complete_sale(
                Some(TEST_USER_ID),
                CompleteSaleDto {
                    branch_id: None,
                    customer_id: None, // Walk-in
                    items: vec![SaleItemDto {
                        product_id: prod_id.clone(),
                        quantity: 1,
                        discount: None,
                    }],
                    discount: None,
                    paid_amount: Some(75000),
                    payment_method: Some("CASH".to_string()),
                    notes: Some("Walkin cash sale".to_string()),
                },
            )
            .await
            .unwrap();
        assert_eq!(sale_res.sale.total_amount, 75000);

        // 3. CUSTOMER PAYMENT: +15,000 PKR CASH
        let cust = customer_svc
            .create_customer(CreateCustomerDto {
                name: "Tariq Niazi".to_string(),
                phone: "03001234567".to_string(),
                alternate_phone: None,
                email: None,
                address: None,
                notes: None,
                credit_limit: Some(100000),
            })
            .await
            .unwrap();

        // Generate customer receivable via credit sale
        sale_svc
            .complete_sale(
                Some(TEST_USER_ID),
                CompleteSaleDto {
                    branch_id: None,
                    customer_id: Some(cust.id.clone()),
                    items: vec![SaleItemDto {
                        product_id: prod_id.clone(),
                        quantity: 1,
                        discount: Some(50000), // 75,000 - 50,000 = 25,000
                    }],
                    discount: None,
                    paid_amount: Some(0),
                    payment_method: None,
                    notes: None,
                },
            )
            .await
            .unwrap();

        let cust_pay = customer_svc
            .record_payment(
                Some(TEST_USER_ID),
                RecordCustomerPaymentDto {
                    customer_id: cust.id.clone(),
                    amount: 15000,
                    payment_method: "CASH".to_string(),
                    reference_number: Some("REC-001".to_string()),
                    notes: Some("Installment payment in cash".to_string()),
                },
            )
            .await
            .unwrap();
        assert_eq!(cust_pay.amount_paid, 15000);

        // 4. SUPPLIER PAYMENT: -30,000 PKR CASH
        let supplier = supplier_svc
            .create_supplier(CreateSupplierDto {
                name: "Apex Wholesalers".to_string(),
                phone: "03219876543".to_string(),
                alternate_phone: None,
                email: None,
                address: None,
                notes: None,
                credit_limit: Some(200000),
            })
            .await
            .unwrap();

        // Generate supplier payable via credit purchase
        purchase_svc
            .complete_purchase(
                Some(TEST_USER_ID),
                CompletePurchaseDto {
                    branch_id: None,
                    supplier_id: supplier.id.clone(),
                    items: vec![PurchaseItemDto {
                        product_id: prod_id.clone(),
                        quantity: 1,
                        unit_cost: Some(50000),
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

        let supp_pay = purchase_svc
            .record_supplier_payment(
                Some(TEST_USER_ID),
                RecordSupplierPaymentDto {
                    supplier_id: supplier.id.clone(),
                    amount: 30000,
                    payment_method: "CASH".to_string(),
                    reference_number: Some("CHQ-001".to_string()),
                    notes: Some("Supplier cash payment".to_string()),
                },
            )
            .await
            .unwrap();
        assert_eq!(supp_pay.amount_paid, 30000);

        // 5. CASH EXPENSE: -10,000 PKR
        let categories = expense_svc.list_categories(true).await.unwrap();
        let rent_cat = categories.iter().find(|c| c.name == "Rent").unwrap();

        let exp = expense_svc
            .create_expense(
                Some(TEST_USER_ID),
                CreateExpenseDto {
                    category_id: rent_cat.id.clone(),
                    branch_id: None,
                    amount: 10000,
                    payment_method: Some("CASH".to_string()),
                    description: "Partial Shop Rent in Cash".to_string(),
                    notes: None,
                    expense_date: None,
                },
            )
            .await
            .unwrap();
        assert_eq!(exp.amount, 10000);

        // 6. CASH ADJUSTMENT: +1,000 PKR IN
        let adj = cash_svc
            .create_adjustment(
                Some(TEST_USER_ID),
                CreateCashAdjustmentDto {
                    branch_id: None,
                    amount: 1000,
                    direction: "IN".to_string(),
                    reason: "Opening cash correction".to_string(),
                },
            )
            .await
            .unwrap();
        assert_eq!(adj.amount, 1000);

        // 7. VERIFY DAILY CASH SUMMARY AGAINST SPECIFICATION
        // Opening Cash:        20,000
        // Cash Sales:         +75,000
        // Customer Payments:  +15,000
        // Supplier Payments:  -30,000
        // Cash Expenses:      -10,000
        // Adjustments:         +1,000
        // ---------------------------
        // Expected Closing:    71,000
        let summary = cash_svc.get_daily_summary(None, None).await.unwrap();
        assert_eq!(summary.opening_cash, 20000);
        assert_eq!(summary.cash_sales, 75000);
        assert_eq!(summary.customer_payments, 15000);
        assert_eq!(summary.supplier_payments, 30000);
        assert_eq!(summary.cash_expenses, 10000);
        assert_eq!(summary.cash_adjustments, 1000);
        assert_eq!(summary.total_cash_in, 91000); // 75000 + 15000 + 1000
        assert_eq!(summary.total_cash_out, 40000); // 30000 + 10000
        assert_eq!(summary.expected_closing_cash, 71000);

        // 8. CLOSE DAY WITH ACTUAL CASH COUNT 70,500 PKR
        // Actual Closing:      70,500
        // Variance:              -500
        let closed_session = cash_svc
            .close_session(
                Some(TEST_USER_ID),
                CloseCashSessionDto {
                    session_id: session.id.clone(),
                    actual_closing_cash: 70500,
                    notes: Some("Evening closing verified".to_string()),
                },
            )
            .await
            .unwrap();

        assert_eq!(closed_session.status, CashSessionStatus::Closed);
        assert_eq!(closed_session.expected_closing_cash, Some(71000));
        assert_eq!(closed_session.actual_closing_cash, Some(70500));
        assert_eq!(closed_session.cash_variance, Some(-500));

        // 9. Verify Closed Summary shows actual and variance
        let final_summary = cash_svc.get_daily_summary(None, None).await.unwrap();
        assert_eq!(final_summary.expected_closing_cash, 71000);
        assert_eq!(final_summary.actual_closing_cash, Some(70500));
        assert_eq!(final_summary.variance, Some(-500));
    }

    #[tokio::test]
    async fn test_non_cash_transactions_do_not_produce_cash_movements() {
        let (
            _db,
            cash_svc,
            expense_svc,
            sale_svc,
            customer_svc,
            supplier_svc,
            purchase_svc,
            prod_id,
        ) = setup_test_context().await;

        // Open cash session with 10,000 PKR
        cash_svc
            .open_session(
                Some(TEST_USER_ID),
                OpenCashSessionDto {
                    branch_id: None,
                    business_date: None,
                    opening_cash: 10000,
                    notes: None,
                },
            )
            .await
            .unwrap();

        // 1. BANK_TRANSFER Sale payment
        sale_svc
            .complete_sale(
                Some(TEST_USER_ID),
                CompleteSaleDto {
                    branch_id: None,
                    customer_id: None,
                    items: vec![SaleItemDto {
                        product_id: prod_id.clone(),
                        quantity: 1,
                        discount: None,
                    }],
                    discount: None,
                    paid_amount: Some(75000),
                    payment_method: Some("BANK_TRANSFER".to_string()),
                    notes: None,
                },
            )
            .await
            .unwrap();

        // 2. BANK_TRANSFER Customer payment
        let cust = customer_svc
            .create_customer(CreateCustomerDto {
                name: "Bank Customer".to_string(),
                phone: "03009998877".to_string(),
                alternate_phone: None,
                email: None,
                address: None,
                notes: None,
                credit_limit: Some(100000),
            })
            .await
            .unwrap();

        sale_svc
            .complete_sale(
                Some(TEST_USER_ID),
                CompleteSaleDto {
                    branch_id: None,
                    customer_id: Some(cust.id.clone()),
                    items: vec![SaleItemDto {
                        product_id: prod_id.clone(),
                        quantity: 1,
                        discount: Some(25000),
                    }],
                    discount: None,
                    paid_amount: Some(0),
                    payment_method: None,
                    notes: None,
                },
            )
            .await
            .unwrap();

        customer_svc
            .record_payment(
                Some(TEST_USER_ID),
                RecordCustomerPaymentDto {
                    customer_id: cust.id.clone(),
                    amount: 20000,
                    payment_method: "BANK_TRANSFER".to_string(),
                    reference_number: Some("RAST-001".to_string()),
                    notes: None,
                },
            )
            .await
            .unwrap();

        // 3. ONLINE Supplier payment
        let supp = supplier_svc
            .create_supplier(CreateSupplierDto {
                name: "Bank Supplier".to_string(),
                phone: "03001112233".to_string(),
                alternate_phone: None,
                email: None,
                address: None,
                notes: None,
                credit_limit: Some(100000),
            })
            .await
            .unwrap();

        purchase_svc
            .complete_purchase(
                Some(TEST_USER_ID),
                CompletePurchaseDto {
                    branch_id: None,
                    supplier_id: supp.id.clone(),
                    items: vec![PurchaseItemDto {
                        product_id: prod_id.clone(),
                        quantity: 1,
                        unit_cost: Some(30000),
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

        purchase_svc
            .record_supplier_payment(
                Some(TEST_USER_ID),
                RecordSupplierPaymentDto {
                    supplier_id: supp.id.clone(),
                    amount: 15000,
                    payment_method: "ONLINE".to_string(),
                    reference_number: Some("IBFT-999".to_string()),
                    notes: None,
                },
            )
            .await
            .unwrap();

        // 4. CARD Expense
        let cats = expense_svc.list_categories(true).await.unwrap();
        expense_svc
            .create_expense(
                Some(TEST_USER_ID),
                CreateExpenseDto {
                    category_id: cats[0].id.clone(),
                    branch_id: None,
                    amount: 5000,
                    payment_method: Some("CARD".to_string()),
                    description: "Card purchase".to_string(),
                    notes: None,
                    expense_date: None,
                },
            )
            .await
            .unwrap();

        // Check movements: ZERO cash movements should have been recorded!
        let movements = cash_svc.list_movements(None).await.unwrap();
        assert_eq!(movements.len(), 0);

        // Expected cash remains untouched at exactly 10,000 PKR!
        let summary = cash_svc.get_daily_summary(None, None).await.unwrap();
        assert_eq!(summary.opening_cash, 10000);
        assert_eq!(summary.cash_sales, 0);
        assert_eq!(summary.customer_payments, 0);
        assert_eq!(summary.supplier_payments, 0);
        assert_eq!(summary.cash_expenses, 0);
        assert_eq!(summary.cash_adjustments, 0);
        assert_eq!(summary.expected_closing_cash, 10000);
    }

    #[tokio::test]
    async fn test_atomic_rollback_on_failure() {
        let (db, cash_svc, expense_svc, sale_svc, _, _, _, prod_id) = setup_test_context().await;

        // Open session
        cash_svc
            .open_session(
                Some(TEST_USER_ID),
                OpenCashSessionDto {
                    branch_id: None,
                    business_date: None,
                    opening_cash: 10000,
                    notes: None,
                },
            )
            .await
            .unwrap();

        // 1. Attempt sale with quantity greater than available stock (Stock = 50, Request = 100)
        // Sale will fail during inventory deduction.
        // Cash payment must NOT be recorded, CashMovement must NOT exist.
        let over_sale_err = sale_svc
            .complete_sale(
                Some(TEST_USER_ID),
                CompleteSaleDto {
                    branch_id: None,
                    customer_id: None,
                    items: vec![SaleItemDto {
                        product_id: prod_id.clone(),
                        quantity: 100,
                        discount: None,
                    }],
                    discount: None,
                    paid_amount: Some(7500000),
                    payment_method: Some("CASH".to_string()),
                    notes: None,
                },
            )
            .await;
        assert!(over_sale_err.is_err());

        // Verify zero cash movements exist and expected cash is unchanged
        let movements = cash_svc.list_movements(None).await.unwrap();
        assert_eq!(movements.len(), 0);
        let summary = cash_svc.get_daily_summary(None, None).await.unwrap();
        assert_eq!(summary.expected_closing_cash, 10000);

        // 2. Direct atomic rollback verification: insert cash movement then return Err
        let rollback_res: Result<(), DbError> = crate::db::transaction::with_transaction(&db, |tx| {
            let m = CashMovement {
                id: uuid::Uuid::new_v4().to_string(),
                session_id: None,
                branch_id: DEFAULT_MAIN_BRANCH_ID.to_string(),
                movement_type: CashMovementType::CashAdjustment,
                direction: CashMovementDirection::In,
                amount: 999999,
                reference_id: None,
                reference_number: None,
                payment_method: "CASH".to_string(),
                description: "Test rollback movement".to_string(),
                performed_by: None,
                performed_by_name: None,
                created_at: chrono::Utc::now().to_rfc3339(),
            };
            SQLiteCashRepository::insert_movement_in_tx(tx, &m)?;
            Err(DbError::ValidationError("Simulated transactional abort".to_string()))
        }).await;
        assert!(rollback_res.is_err());

        // Verify movement was rolled back completely
        let movements_after = cash_svc.list_movements(None).await.unwrap();
        assert_eq!(movements_after.len(), 0);

        // 3. Expense creation failure: invalid category_id
        let bad_exp_err = expense_svc
            .create_expense(
                Some(TEST_USER_ID),
                CreateExpenseDto {
                    category_id: "non-existent-category-id".to_string(),
                    branch_id: None,
                    amount: 5000,
                    payment_method: Some("CASH".to_string()),
                    description: "Fail expense".to_string(),
                    notes: None,
                    expense_date: None,
                },
            )
            .await;
        assert!(bad_exp_err.is_err());

        // Ensure zero movements exist
        let movements_final = cash_svc.list_movements(None).await.unwrap();
        assert_eq!(movements_final.len(), 0);
    }
}
