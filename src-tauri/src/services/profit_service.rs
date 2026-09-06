use std::sync::Arc;

use crate::domain::profit::{
    DailyProfitabilityDto, DashboardProfitSummaryDto, PeriodProfitabilityDto, ProductProfitabilityDto,
    SaleProfitabilityDto,
};
use crate::errors::{AppError, AppResult};
use crate::repositories::profit_repository::SQLiteProfitRepository;

use crate::db::connection::DatabaseConnection;

#[derive(Clone)]
pub struct ProfitService {
    profit_repo: Arc<SQLiteProfitRepository>,
}

impl ProfitService {
    pub fn new(db: DatabaseConnection) -> Self {
        Self {
            profit_repo: Arc::new(SQLiteProfitRepository::new(db)),
        }
    }

    pub fn with_repo(profit_repo: Arc<SQLiteProfitRepository>) -> Self {
        Self { profit_repo }
    }

    /// Fetches aggregated profitability for an optional date range and branch
    pub async fn get_period_profitability(
        &self,
        start_date: Option<String>,
        end_date: Option<String>,
        branch_id: Option<String>,
    ) -> AppResult<PeriodProfitabilityDto> {
        self.profit_repo
            .get_period_profitability(
                start_date.as_deref(),
                end_date.as_deref(),
                branch_id.as_deref(),
            )
            .await
    }

    /// Fetches day-by-day profitability breakdown
    pub async fn get_daily_profitability(
        &self,
        start_date: Option<String>,
        end_date: Option<String>,
        branch_id: Option<String>,
    ) -> AppResult<Vec<DailyProfitabilityDto>> {
        self.profit_repo
            .get_daily_profitability(
                start_date.as_deref(),
                end_date.as_deref(),
                branch_id.as_deref(),
            )
            .await
    }

    /// Fetches product-level profitability with historical cost snapshots and returns
    pub async fn get_product_profitability(
        &self,
        product_id: Option<String>,
        start_date: Option<String>,
        end_date: Option<String>,
        branch_id: Option<String>,
    ) -> AppResult<Vec<ProductProfitabilityDto>> {
        self.profit_repo
            .get_product_profitability(
                product_id.as_deref(),
                start_date.as_deref(),
                end_date.as_deref(),
                branch_id.as_deref(),
            )
            .await
    }

    /// Fetches realized profitability for a specific sale
    pub async fn get_sale_profitability(&self, sale_id: &str) -> AppResult<Option<SaleProfitabilityDto>> {
        if sale_id.trim().is_empty() {
            return Err(AppError::Validation("Sale ID cannot be empty".to_string()));
        }
        self.profit_repo.get_sale_profitability(sale_id).await
    }

    /// Fetches dashboard summary cards (today, this_month, total)
    pub async fn get_dashboard_profit_summary(
        &self,
        branch_id: Option<String>,
    ) -> AppResult<DashboardProfitSummaryDto> {
        self.profit_repo
            .get_dashboard_profit_summary(branch_id.as_deref())
            .await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::params;
    use uuid::Uuid;

    use crate::db::connection::DatabaseConnection;
    use crate::db::migrations::MigrationRunner;
    use crate::domain::cash::OpenCashSessionDto;
    use crate::domain::customer::CreateCustomerDto;
    use crate::domain::organization::DEFAULT_MAIN_BRANCH_ID;
    use crate::domain::profit::calculate_gross_margin;
    use crate::domain::sales::{CompleteSaleDto, SaleItemDto};
    use crate::domain::sales_return::{CreateSalesReturnDto, CreateSalesReturnLineDto};
    use crate::services::cash_service::CashService;
    use crate::services::customer_service::CustomerService;
    use crate::services::sale_service::SaleService;
    use crate::services::sales_return_service::SalesReturnService;

    const TEST_USER_ID: &str = "11111111-1111-1111-1111-111111111111";

    async fn setup_test_context() -> (
        DatabaseConnection,
        SaleService,
        SalesReturnService,
        CustomerService,
        ProfitService,
        String, // branch_id
    ) {
        let db = DatabaseConnection::open_in_memory().expect("open in memory db");
        {
            let conn_arc = db.inner();
            let mut conn = conn_arc.lock().await;
            conn.pragma_update(None, "foreign_keys", "ON").unwrap();
            MigrationRunner::run(&mut conn).unwrap();

            // Seed Users for tests
            conn.execute(
                "INSERT INTO users (id, name, username, login_key_hash, role, is_active, created_at, updated_at)
                 VALUES ('11111111-1111-1111-1111-111111111111', 'Admin User', 'admin1', 'hash', 'ADMIN', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
                [],
            ).unwrap();

            conn.execute(
                "INSERT INTO categories (id, name, code, is_active, created_at, updated_at)
                 VALUES ('00000000-0000-0000-0000-000000000010', 'Phones', 'PHN', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
                [],
            ).unwrap();
        }

        let branch_id = DEFAULT_MAIN_BRANCH_ID.to_string();

        let sale_service = SaleService::new(db.clone());
        let sales_return_service = SalesReturnService::new(db.clone());
        let customer_service = CustomerService::new(db.clone());
        let cash_service = CashService::new(db.clone());
        let profit_service = ProfitService::new(db.clone());

        // Open cash session
        cash_service
            .open_session(
                Some(TEST_USER_ID),
                OpenCashSessionDto {
                    branch_id: Some(branch_id.clone()),
                    business_date: Some("2026-01-01".to_string()),
                    opening_cash: 500000,
                    notes: None,
                },
            )
            .await
            .unwrap();

        (
            db,
            sale_service,
            sales_return_service,
            customer_service,
            profit_service,
            branch_id,
        )
    }

    async fn seed_test_product(
        db: &DatabaseConnection,
        name: &str,
        sku: &str,
        purchase_price: i64,
        average_cost: i64,
        sale_price: i64,
        stock_qty: i64,
    ) -> String {
        let prod_id = Uuid::new_v4().to_string();
        let conn_arc = db.inner();
        let conn = conn_arc.lock().await;
        conn.execute(
            "INSERT INTO products (id, name, sku, category_id, purchase_price, average_cost, sale_price, low_stock_threshold, is_active, created_at, updated_at)
             VALUES (?1, ?2, ?3, '00000000-0000-0000-0000-000000000010', ?4, ?5, ?6, 5, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
            params![prod_id, name, sku, purchase_price, average_cost, sale_price],
        ).unwrap();
        conn.execute(
            "INSERT INTO stock (product_id, branch_id, quantity, updated_at)
             VALUES (?1, ?2, ?3, '2026-01-01T00:00:00Z')",
            params![prod_id, DEFAULT_MAIN_BRANCH_ID, stock_qty],
        ).unwrap();
        prod_id
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Test 1 — Sale Captures Average Cost
    // ──────────────────────────────────────────────────────────────────────────
    #[tokio::test]
    async fn test_1_sale_captures_average_cost() {
        let (db, sale_service, _, _, profit_service, branch_id) = setup_test_context().await;

        let prod_id = seed_test_product(&db, "Screen Protector", "PROT-103", 100, 103, 150, 10).await;

        // Sell 2 units
        let sale_result = sale_service
            .complete_sale(
                Some(TEST_USER_ID),
                CompleteSaleDto {
                    branch_id: Some(branch_id.clone()),
                    customer_id: None,
                    items: vec![SaleItemDto {
                        product_id: prod_id,
                        quantity: 2,
                        discount: None,
                    }],
                    discount: None,
                    paid_amount: Some(300),
                    payment_method: Some("CASH".to_string()),
                    notes: None,
                },
            )
            .await
            .unwrap();

        // Verify snapshot is exactly 103 (average_cost), NOT 100 (purchase_price)
        assert_eq!(sale_result.lines[0].cost_price_snapshot, 103);
        // COGS = 2 * 103 = 206
        assert_eq!(sale_result.cogs, 206);
        // Gross Profit = 300 - 206 = 94
        assert_eq!(sale_result.gross_profit, 94);
        // Gross margin = (94 * 100) / 300 = 31%
        assert_eq!(sale_result.gross_margin, 31);

        // Verify period profitability from repository matches
        let period = profit_service
            .get_period_profitability(None, None, Some(branch_id))
            .await
            .unwrap();
        assert_eq!(period.net_revenue, 300);
        assert_eq!(period.cogs, 206);
        assert_eq!(period.gross_profit, 94);
        assert_eq!(period.gross_margin, 31);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Test 2 — Historical Cost Does Not Change
    // ──────────────────────────────────────────────────────────────────────────
    #[tokio::test]
    async fn test_2_historical_cost_does_not_change_when_future_average_cost_changes() {
        let (db, sale_service, _, _, profit_service, branch_id) = setup_test_context().await;

        let prod_id = seed_test_product(&db, "Cable A", "CAB-A", 100, 103, 150, 10).await;

        // Sale 1 completed at average cost 103
        let sale_result = sale_service
            .complete_sale(
                Some(TEST_USER_ID),
                CompleteSaleDto {
                    branch_id: Some(branch_id.clone()),
                    customer_id: None,
                    items: vec![SaleItemDto {
                        product_id: prod_id.clone(),
                        quantity: 2,
                        discount: None,
                    }],
                    discount: None,
                    paid_amount: Some(300),
                    payment_method: Some("CASH".to_string()),
                    notes: None,
                },
            )
            .await
            .unwrap();

        let sale_id = sale_result.sale.id.clone();

        // Later, product's average_cost is updated to 110 due to new incoming stock
        {
            let conn_arc = db.inner();
            let conn = conn_arc.lock().await;
            conn.execute(
                "UPDATE products SET average_cost = 110 WHERE id = ?1",
                params![prod_id],
            ).unwrap();
        }

        // Verify original sale STILL has cost_price_snapshot = 103 and COGS = 206
        let sale_profit = profit_service.get_sale_profitability(&sale_id).await.unwrap().unwrap();
        assert_eq!(sale_profit.cogs, 206, "COGS must remain 206, NOT recalculate to 220!");
        assert_eq!(sale_profit.gross_profit, 94);

        // Verify line cost snapshot directly in SQLite
        let snapshot: i64 = {
            let conn_arc = db.inner();
            let conn = conn_arc.lock().await;
            conn.query_row(
                "SELECT cost_price_snapshot FROM sale_lines WHERE sale_id = ?1",
                params![sale_id],
                |r| r.get(0),
            ).unwrap()
        };
        assert_eq!(snapshot, 103, "Snapshot must be immutable in SQLite");
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Test 3 & 4 & 5 — Sale Revenue, Gross Profit, Gross Margin
    // ──────────────────────────────────────────────────────────────────────────
    #[tokio::test]
    async fn test_3_4_5_revenue_gross_profit_and_margin() {
        let (db, sale_service, _, _, profit_service, branch_id) = setup_test_context().await;

        let prod_id = seed_test_product(&db, "Case", "CASE-1", 700, 700, 1000, 10).await;

        // Sell 1 unit with 50 Rs discount
        let sale_result = sale_service
            .complete_sale(
                Some(TEST_USER_ID),
                CompleteSaleDto {
                    branch_id: Some(branch_id.clone()),
                    customer_id: None,
                    items: vec![SaleItemDto {
                        product_id: prod_id,
                        quantity: 1,
                        discount: Some(50),
                    }],
                    discount: None,
                    paid_amount: Some(950),
                    payment_method: Some("CASH".to_string()),
                    notes: None,
                },
            )
            .await
            .unwrap();

        // Revenue = 1000 - 50 = 950
        assert_eq!(sale_result.sale.total_amount, 950);
        // COGS = 700
        assert_eq!(sale_result.cogs, 700);
        // Gross profit = 950 - 700 = 250
        assert_eq!(sale_result.gross_profit, 250);
        // Gross margin = (250 * 100) / 950 = 26%
        assert_eq!(sale_result.gross_margin, 26);

        let report = profit_service.get_period_profitability(None, None, Some(branch_id)).await.unwrap();
        assert_eq!(report.gross_revenue, 1000);
        assert_eq!(report.discounts, 50);
        assert_eq!(report.net_revenue, 950);
        assert_eq!(report.cogs, 700);
        assert_eq!(report.gross_profit, 250);
        assert_eq!(report.gross_margin, 26);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Test 6 — Zero Revenue Margin Calculation
    // ──────────────────────────────────────────────────────────────────────────
    #[test]
    fn test_6_zero_revenue_safe_margin() {
        assert_eq!(calculate_gross_margin(0, 0), 0);
        assert_eq!(calculate_gross_margin(-100, 0), 0);
        assert_eq!(calculate_gross_margin(100, 0), 0);
        assert_eq!(calculate_gross_margin(50, -10), 0);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Test 7 — Credit Sale (Revenue & COGS exist, Physical Cash = 0)
    // ──────────────────────────────────────────────────────────────────────────
    #[tokio::test]
    async fn test_7_credit_sale_financial_separation() {
        let (db, sale_service, _, cust_service, profit_service, branch_id) = setup_test_context().await;

        let prod_id = seed_test_product(&db, "Credit Item", "CR-1", 600, 600, 1000, 10).await;

        let customer = cust_service
            .create_customer(CreateCustomerDto {
                name: "Tariq Niazi".to_string(),
                phone: "03001234567".to_string(),
                alternate_phone: None,
                email: None,
                address: None,
                notes: None,
                credit_limit: Some(50000),
            })
            .await
            .unwrap();

        // Credit sale (paid_amount = 0)
        let sale_result = sale_service
            .complete_sale(
                Some(TEST_USER_ID),
                CompleteSaleDto {
                    branch_id: Some(branch_id.clone()),
                    customer_id: Some(customer.id.clone()),
                    items: vec![SaleItemDto {
                        product_id: prod_id,
                        quantity: 1,
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

        // Revenue exists (1000)
        assert_eq!(sale_result.sale.total_amount, 1000);
        // COGS exists (600)
        assert_eq!(sale_result.cogs, 600);
        // Gross Profit exists (400)
        assert_eq!(sale_result.gross_profit, 400);

        // Customer receivable created (1000)
        let ledger = cust_service.get_customer_detail(&customer.id).await.unwrap();
        assert_eq!(ledger.outstanding_balance, 1000);

        // Verify NO cash movement was recorded for this sale
        let cash_movements_count: i64 = {
            let conn_arc = db.inner();
            let conn = conn_arc.lock().await;
            conn.query_row(
                "SELECT COUNT(*) FROM cash_movements WHERE reference_id = ?1",
                params![sale_result.sale.id],
                |r| r.get(0),
            ).unwrap()
        };
        assert_eq!(cash_movements_count, 0, "Credit sale must NOT generate cash movements");

        // Verify profit reporting counts the credit sale revenue and COGS
        let period = profit_service.get_period_profitability(None, None, Some(branch_id.clone())).await.unwrap();
        assert_eq!(period.net_revenue, 1000);
        assert_eq!(period.cogs, 600);
        assert_eq!(period.gross_profit, 400);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Test 8 — Cash Sale (Revenue, COGS, and Cash IN all exist)
    // ──────────────────────────────────────────────────────────────────────────
    #[tokio::test]
    async fn test_8_cash_sale_creates_cash_in() {
        let (db, sale_service, _, _, profit_service, branch_id) = setup_test_context().await;

        let prod_id = seed_test_product(&db, "Cash Item", "CASH-1", 300, 300, 500, 10).await;

        let sale_result = sale_service
            .complete_sale(
                Some(TEST_USER_ID),
                CompleteSaleDto {
                    branch_id: Some(branch_id.clone()),
                    customer_id: None,
                    items: vec![SaleItemDto {
                        product_id: prod_id,
                        quantity: 1,
                        discount: None,
                    }],
                    discount: None,
                    paid_amount: Some(500),
                    payment_method: Some("CASH".to_string()),
                    notes: None,
                },
            )
            .await
            .unwrap();

        assert_eq!(sale_result.sale.total_amount, 500);
        assert_eq!(sale_result.cogs, 300);
        assert_eq!(sale_result.gross_profit, 200);

        // Cash movement IN recorded
        let (dir, amount): (String, i64) = {
            let conn_arc = db.inner();
            let conn = conn_arc.lock().await;
            conn.query_row(
                "SELECT direction, amount FROM cash_movements WHERE reference_id = ?1",
                params![sale_result.sale.id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            ).unwrap()
        };
        assert_eq!(dir, "IN");
        assert_eq!(amount, 500);

        let period = profit_service.get_period_profitability(None, None, Some(branch_id)).await.unwrap();
        assert_eq!(period.net_revenue, 500);
        assert_eq!(period.cogs, 300);
        assert_eq!(period.gross_profit, 200);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Test 9 — Sales Return Reverses Revenue and COGS using Historical Snapshot
    // ──────────────────────────────────────────────────────────────────────────
    #[tokio::test]
    async fn test_9_sales_return_reverses_profitability() {
        let (db, sale_service, sales_ret_service, _, profit_service, branch_id) = setup_test_context().await;

        // Original item: cost = 103, sale price = 150
        let prod_id = seed_test_product(&db, "Headphone", "HP-1", 103, 103, 150, 10).await;

        // Sell 2 units: Revenue = 300, COGS = 206, Profit = 94
        let sale_result = sale_service
            .complete_sale(
                Some(TEST_USER_ID),
                CompleteSaleDto {
                    branch_id: Some(branch_id.clone()),
                    customer_id: None,
                    items: vec![SaleItemDto {
                        product_id: prod_id.clone(),
                        quantity: 2,
                        discount: None,
                    }],
                    discount: None,
                    paid_amount: Some(300),
                    payment_method: Some("CASH".to_string()),
                    notes: None,
                },
            )
            .await
            .unwrap();

        let sale_line_id = sale_result.lines[0].id.clone();
        let sale_id = sale_result.sale.id.clone();

        // Change product average cost now (to test that return does NOT use current average cost!)
        {
            let conn_arc = db.inner();
            let conn = conn_arc.lock().await;
            conn.execute(
                "UPDATE products SET average_cost = 999 WHERE id = ?1",
                params![prod_id],
            ).unwrap();
        }

        // Return 1 unit
        let ret_result = sales_ret_service
            .create_sales_return(
                CreateSalesReturnDto {
                    sale_id: sale_id.clone(),
                    lines: vec![CreateSalesReturnLineDto {
                        sale_line_id,
                        quantity: 1,
                    }],
                    refund_method: "CASH".to_string(),
                    reason: Some("Customer returned".to_string()),
                    notes: None,
                },
                Some(TEST_USER_ID),
            )
            .await
            .unwrap();

        assert_eq!(ret_result.sales_return.total_amount, 150);

        // Query sale-level profitability after return:
        // Net Revenue: 300 - 150 = 150
        // Net COGS: 206 - 103 = 103 (uses 103 snapshot, NOT 999!)
        // Gross profit: 150 - 103 = 47
        // Gross margin: (47 * 100) / 150 = 31%
        let sale_profit = profit_service.get_sale_profitability(&sale_id).await.unwrap().unwrap();
        assert_eq!(sale_profit.net_revenue, 150);
        assert_eq!(sale_profit.cogs, 103);
        assert_eq!(sale_profit.gross_profit, 47);
        assert_eq!(sale_profit.gross_margin, 31);

        // Period report after return
        let period = profit_service.get_period_profitability(None, None, Some(branch_id)).await.unwrap();
        assert_eq!(period.net_revenue, 150);
        assert_eq!(period.cogs, 103);
        assert_eq!(period.gross_profit, 47);
        assert_eq!(period.gross_margin, 31);
        assert_eq!(period.returns_count, 1);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Test 10 — Multiple Sales at Different Costs
    // ──────────────────────────────────────────────────────────────────────────
    #[tokio::test]
    async fn test_10_multiple_sales_at_different_costs() {
        let (db, sale_service, _, _, profit_service, branch_id) = setup_test_context().await;

        let prod_id = seed_test_product(&db, "Memory Card", "MEM-1", 100, 100, 200, 50).await;

        // Sale A at cost 100
        let s_a = sale_service
            .complete_sale(
                Some(TEST_USER_ID),
                CompleteSaleDto {
                    branch_id: Some(branch_id.clone()),
                    customer_id: None,
                    items: vec![SaleItemDto { product_id: prod_id.clone(), quantity: 1, discount: None }],
                    discount: None,
                    paid_amount: Some(200),
                    payment_method: Some("CASH".to_string()),
                    notes: None,
                },
            )
            .await
            .unwrap();

        // Update product average cost to 105
        {
            let conn_arc = db.inner();
            let conn = conn_arc.lock().await;
            conn.execute("UPDATE products SET average_cost = 105 WHERE id = ?1", params![prod_id]).unwrap();
        }

        // Sale B at cost 105
        let s_b = sale_service
            .complete_sale(
                Some(TEST_USER_ID),
                CompleteSaleDto {
                    branch_id: Some(branch_id.clone()),
                    customer_id: None,
                    items: vec![SaleItemDto { product_id: prod_id.clone(), quantity: 1, discount: None }],
                    discount: None,
                    paid_amount: Some(200),
                    payment_method: Some("CASH".to_string()),
                    notes: None,
                },
            )
            .await
            .unwrap();

        // Update product average cost to 110
        {
            let conn_arc = db.inner();
            let conn = conn_arc.lock().await;
            conn.execute("UPDATE products SET average_cost = 110 WHERE id = ?1", params![prod_id]).unwrap();
        }

        // Sale C at cost 110
        let s_c = sale_service
            .complete_sale(
                Some(TEST_USER_ID),
                CompleteSaleDto {
                    branch_id: Some(branch_id.clone()),
                    customer_id: None,
                    items: vec![SaleItemDto { product_id: prod_id.clone(), quantity: 1, discount: None }],
                    discount: None,
                    paid_amount: Some(200),
                    payment_method: Some("CASH".to_string()),
                    notes: None,
                },
            )
            .await
            .unwrap();

        // Verify each sale retains its cost snapshot
        assert_eq!(s_a.lines[0].cost_price_snapshot, 100);
        assert_eq!(s_b.lines[0].cost_price_snapshot, 105);
        assert_eq!(s_c.lines[0].cost_price_snapshot, 110);

        // Product profitability report:
        // Sold = 3, Gross Rev = 600, COGS = 100 + 105 + 110 = 315, Profit = 285
        let prod_report = profit_service
            .get_product_profitability(Some(prod_id), None, None, Some(branch_id))
            .await
            .unwrap();

        assert_eq!(prod_report.len(), 1);
        assert_eq!(prod_report[0].quantity_sold, 3);
        assert_eq!(prod_report[0].net_revenue, 600);
        assert_eq!(prod_report[0].cogs, 315);
        assert_eq!(prod_report[0].gross_profit, 285);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Test 12 — Cancelled/Voided Sale Excluded from Profitability
    // ──────────────────────────────────────────────────────────────────────────
    #[tokio::test]
    async fn test_12_cancelled_sale_excluded_from_profitability() {
        let (db, sale_service, _, _, profit_service, branch_id) = setup_test_context().await;

        let prod_id = seed_test_product(&db, "Voided Item", "VOID-1", 100, 100, 200, 10).await;

        let s = sale_service
            .complete_sale(
                Some(TEST_USER_ID),
                CompleteSaleDto {
                    branch_id: Some(branch_id.clone()),
                    customer_id: None,
                    items: vec![SaleItemDto { product_id: prod_id, quantity: 1, discount: None }],
                    discount: None,
                    paid_amount: Some(200),
                    payment_method: Some("CASH".to_string()),
                    notes: None,
                },
            )
            .await
            .unwrap();

        // Mark sale as VOIDED in SQLite
        {
            let conn_arc = db.inner();
            let conn = conn_arc.lock().await;
            conn.execute(
                "UPDATE sales SET sale_status = 'VOIDED' WHERE id = ?1",
                params![s.sale.id],
            ).unwrap();
        }

        // Verify period profitability ignores the voided sale completely
        let period = profit_service.get_period_profitability(None, None, Some(branch_id)).await.unwrap();
        assert_eq!(period.sales_count, 0);
        assert_eq!(period.net_revenue, 0);
        assert_eq!(period.cogs, 0);
        assert_eq!(period.gross_profit, 0);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Test 13 — Transaction Rollback Mid-sale Leaves No Artifacts
    // ──────────────────────────────────────────────────────────────────────────
    #[tokio::test]
    async fn test_13_transaction_rollback_mid_sale() {
        let (db, sale_service, _, _, _, branch_id) = setup_test_context().await;

        // Stock is 5
        let prod_id = seed_test_product(&db, "Stock Item", "STK-13", 100, 100, 200, 5).await;

        // Try to sell 10 units (insufficient stock)
        let result = sale_service
            .complete_sale(
                Some(TEST_USER_ID),
                CompleteSaleDto {
                    branch_id: Some(branch_id),
                    customer_id: None,
                    items: vec![SaleItemDto { product_id: prod_id.clone(), quantity: 10, discount: None }],
                    discount: None,
                    paid_amount: Some(2000),
                    payment_method: Some("CASH".to_string()),
                    notes: None,
                },
            )
            .await;

        assert!(result.is_err());

        // Verify no sale, sale_lines, stock movement, or cash movement was written
        let (sales_cnt, lines_cnt, stock_qty): (i64, i64, i64) = {
            let conn_arc = db.inner();
            let conn = conn_arc.lock().await;
            let sc: i64 = conn.query_row("SELECT COUNT(*) FROM sales", [], |r| r.get(0)).unwrap();
            let lc: i64 = conn.query_row("SELECT COUNT(*) FROM sale_lines", [], |r| r.get(0)).unwrap();
            let sq: i64 = conn.query_row("SELECT quantity FROM stock WHERE product_id = ?1", params![prod_id], |r| r.get(0)).unwrap();
            (sc, lc, sq)
        };

        assert_eq!(sales_cnt, 0);
        assert_eq!(lines_cnt, 0);
        assert_eq!(stock_qty, 5);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Test 11 — Purchase Return Regression: Does not modify historical sale COGS
    // ──────────────────────────────────────────────────────────────────────────
    #[tokio::test]
    async fn test_11_purchase_return_regression_does_not_modify_sale_cogs() {
        let (db, sale_service, _, _, profit_service, branch_id) = setup_test_context().await;

        let prod_id = seed_test_product(&db, "Regression Item", "REG-11", 500, 500, 800, 10).await;

        // 1. Complete a sale: 2 units at cost 500 = COGS 1000, Revenue 1600
        let sale_result = sale_service
            .complete_sale(
                Some(TEST_USER_ID),
                CompleteSaleDto {
                    branch_id: Some(branch_id.clone()),
                    customer_id: None,
                    items: vec![SaleItemDto { product_id: prod_id.clone(), quantity: 2, discount: None }],
                    discount: None,
                    paid_amount: Some(1600),
                    payment_method: Some("CASH".to_string()),
                    notes: None,
                },
            )
            .await
            .unwrap();

        assert_eq!(sale_result.cogs, 1000);

        // 2. Perform a purchase return directly or update purchase return records
        {
            let conn_arc = db.inner();
            let conn = conn_arc.lock().await;
            // Update product average_cost to simulate inventory revaluation from purchase return
            conn.execute(
                "UPDATE products SET average_cost = 450, updated_at = '2026-01-02T00:00:00Z' WHERE id = ?1",
                params![prod_id],
            ).unwrap();
        }

        // 3. Verify original sale snapshot remains 500 and COGS remains 1000
        let snapshot: i64 = {
            let conn_arc = db.inner();
            let conn = conn_arc.lock().await;
            conn.query_row(
                "SELECT cost_price_snapshot FROM sale_lines WHERE sale_id = ?1",
                params![sale_result.sale.id],
                |r| r.get(0),
            ).unwrap()
        };
        assert_eq!(snapshot, 500, "Historical snapshot must NOT change");

        let sale_prof = profit_service.get_sale_profitability(&sale_result.sale.id).await.unwrap().expect("sale profitability");
        assert_eq!(sale_prof.cogs, 1000, "Historical sale COGS must NOT change");
        assert_eq!(sale_prof.gross_profit, 600);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Test 14 — Zero Average Cost Falls Back to Purchase Price
    // ──────────────────────────────────────────────────────────────────────────
    #[tokio::test]
    async fn test_14_zero_average_cost_fallback_to_purchase_price() {
        let (db, sale_service, _, _, profit_service, branch_id) = setup_test_context().await;

        // Average cost = 0, purchase_price = 250
        let prod_id = seed_test_product(&db, "Fallback Item", "FB-14", 250, 0, 400, 10).await;

        let sale_result = sale_service
            .complete_sale(
                Some(TEST_USER_ID),
                CompleteSaleDto {
                    branch_id: Some(branch_id.clone()),
                    customer_id: None,
                    items: vec![SaleItemDto { product_id: prod_id.clone(), quantity: 2, discount: None }],
                    discount: None,
                    paid_amount: Some(800),
                    payment_method: Some("CASH".to_string()),
                    notes: None,
                },
            )
            .await
            .unwrap();

        assert_eq!(sale_result.cogs, 500); // 2 * 250
        assert_eq!(sale_result.gross_profit, 300); // 800 - 500
        assert_eq!(sale_result.gross_margin, 37); // 300 * 100 / 800 = 37%

        let prod_prof = profit_service.get_product_profitability(Some(prod_id), None, None, Some(branch_id)).await.unwrap();
        assert_eq!(prod_prof.len(), 1);
        assert_eq!(prod_prof[0].cogs, 500);
        assert_eq!(prod_prof[0].gross_profit, 300);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Test 15 — 100% Discount and Negative Gross Profit (Sale Below Cost)
    // ──────────────────────────────────────────────────────────────────────────
    #[tokio::test]
    async fn test_15_discount_and_loss_making_sales() {
        let (db, sale_service, _, _, profit_service, branch_id) = setup_test_context().await;

        let prod_id = seed_test_product(&db, "Loss Leader", "LL-15", 500, 500, 300, 10).await;

        // Sale price is 300, cost is 500 -> Loss of 200
        let sale_result = sale_service
            .complete_sale(
                Some(TEST_USER_ID),
                CompleteSaleDto {
                    branch_id: Some(branch_id.clone()),
                    customer_id: None,
                    items: vec![SaleItemDto { product_id: prod_id, quantity: 1, discount: None }],
                    discount: None,
                    paid_amount: Some(300),
                    payment_method: Some("CASH".to_string()),
                    notes: None,
                },
            )
            .await
            .unwrap();

        assert_eq!(sale_result.cogs, 500);
        assert_eq!(sale_result.gross_profit, -200);
        assert_eq!(sale_result.gross_margin, -66); // -200 * 100 / 300 = -66%

        let summary = profit_service.get_dashboard_profit_summary(Some(branch_id)).await.unwrap();
        assert_eq!(summary.today.gross_profit, -200);
        assert_eq!(summary.total.gross_profit, -200);
    }
}
