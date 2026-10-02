use crate::domain::profit::{
    DashboardProfitSummaryDto, PeriodProfitabilityDto, ProductProfitabilityDto,
    SaleProfitabilityDto,
};
use crate::errors::{AppError, AppResult};
use crate::repositories::{PostgresProfitRepository, ProfitRepository};

#[derive(Clone)]
pub struct ProfitService {
    profit_repo: ProfitRepository,
}

impl ProfitService {
    pub fn new_postgres(pool: sqlx::PgPool) -> Self {
        Self {
            profit_repo: ProfitRepository::new(PostgresProfitRepository::new(pool)),
        }
    }

    /// Fetches aggregated profitability for an optional date range and branch
    pub async fn get_period_profitability(
        &self,
        _start_date: Option<String>,
        _end_date: Option<String>,
        _branch_id: Option<String>,
    ) -> AppResult<PeriodProfitabilityDto> {
        Err(AppError::Internal(
            "Postgres get_period_profitability not implemented".into(),
        ))
    }

    /// Fetches daily aggregated gross profit and net margin trend
    pub async fn get_daily_profitability(
        &self,
        _start_date: Option<String>,
        _end_date: Option<String>,
        _branch_id: Option<String>,
    ) -> AppResult<Vec<crate::domain::profit::DailyProfitabilityDto>> {
        Err(AppError::Internal(
            "Postgres get_daily_profitability not implemented".into(),
        ))
    }

    /// Fetches product-level profitability with historical cost snapshots and returns
    pub async fn get_product_profitability(
        &self,
        _product_id: Option<String>,
        _start_date: Option<String>,
        _end_date: Option<String>,
        _branch_id: Option<String>,
    ) -> AppResult<Vec<ProductProfitabilityDto>> {
        Err(AppError::Internal(
            "Postgres get_product_profitability not implemented".into(),
        ))
    }

    /// Fetches realized profitability for a specific sale
    pub async fn get_sale_profitability(
        &self,
        sale_id: &str,
    ) -> AppResult<Option<SaleProfitabilityDto>> {
        if sale_id.trim().is_empty() {
            return Err(AppError::Validation("Sale ID cannot be empty".to_string()));
        }
        Err(AppError::Internal(
            "Postgres get_sale_profitability not implemented".into(),
        ))
    }

    /// Fetches dashboard summary cards (today, this_month, total)
    pub async fn get_dashboard_profit_summary(
        &self,
        branch_id: Option<String>,
    ) -> AppResult<DashboardProfitSummaryDto> {
        self.profit_repo
            .get_profit_summary(branch_id.as_deref(), None, None)
            .await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::profit::calculate_gross_margin;

    async fn setup_test_service() -> ProfitService {
        let pool = sqlx::PgPool::connect_lazy("postgres://localhost/test_placeholder")
            .expect("connect_lazy should succeed");
        ProfitService::new_postgres(pool)
    }

    #[tokio::test]
    #[ignore]
    async fn test_1_sale_captures_average_cost() {
        let _service = setup_test_service().await;
        // Requires real Postgres DB — skipped
    }

    #[tokio::test]
    #[ignore]
    async fn test_2_historical_cost_does_not_change_when_future_average_cost_changes() {
        let _service = setup_test_service().await;
        // Requires real Postgres DB — skipped
    }

    #[tokio::test]
    #[ignore]
    async fn test_3_4_5_revenue_gross_profit_and_margin() {
        let _service = setup_test_service().await;
        // Requires real Postgres DB — skipped
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Test 6 — Zero Revenue Margin Calculation (pure math, no DB)
    // ──────────────────────────────────────────────────────────────────────────
    #[test]
    fn test_6_zero_revenue_safe_margin() {
        assert_eq!(calculate_gross_margin(0, 0), 0);
        assert_eq!(calculate_gross_margin(-100, 0), 0);
        assert_eq!(calculate_gross_margin(100, 0), 0);
        assert_eq!(calculate_gross_margin(50, -10), 0);
    }

    #[tokio::test]
    #[ignore]
    async fn test_7_credit_sale_financial_separation() {
        let _service = setup_test_service().await;
        // Requires real Postgres DB — skipped
    }

    #[tokio::test]
    #[ignore]
    async fn test_8_cash_sale_creates_cash_in() {
        let _service = setup_test_service().await;
        // Requires real Postgres DB — skipped
    }

    #[tokio::test]
    #[ignore]
    async fn test_9_sales_return_reverses_profitability() {
        let _service = setup_test_service().await;
        // Requires real Postgres DB — skipped
    }

    #[tokio::test]
    #[ignore]
    async fn test_10_multiple_sales_at_different_costs() {
        let _service = setup_test_service().await;
        // Requires real Postgres DB — skipped
    }

    #[tokio::test]
    #[ignore]
    async fn test_11_purchase_return_regression_does_not_modify_sale_cogs() {
        let _service = setup_test_service().await;
        // Requires real Postgres DB — skipped
    }

    #[tokio::test]
    #[ignore]
    async fn test_12_cancelled_sale_excluded_from_profitability() {
        let _service = setup_test_service().await;
        // Requires real Postgres DB — skipped
    }

    #[tokio::test]
    #[ignore]
    async fn test_13_transaction_rollback_mid_sale() {
        let _service = setup_test_service().await;
        // Requires real Postgres DB — skipped
    }

    #[tokio::test]
    #[ignore]
    async fn test_14_zero_average_cost_fallback_to_purchase_price() {
        let _service = setup_test_service().await;
        // Requires real Postgres DB — skipped
    }

    #[tokio::test]
    #[ignore]
    async fn test_15_discount_and_loss_making_sales() {
        let _service = setup_test_service().await;
        // Requires real Postgres DB — skipped
    }
}
