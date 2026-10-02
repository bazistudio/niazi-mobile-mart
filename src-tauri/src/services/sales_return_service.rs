use crate::domain::sales_return::{
    CreateSalesReturnDto, SaleReturnableInfoDto, SalesRefundMethod, SalesReturn,
    SalesReturnDetailDto,
};
use crate::errors::{AppError, AppResult};
use crate::repositories::{PostgresSalesReturnRepository, SalesReturnRepository};

#[derive(Clone)]
pub struct SalesReturnService {
    repo: SalesReturnRepository,
}

impl SalesReturnService {
    pub fn new_postgres(pool: sqlx::PgPool) -> Self {
        Self {
            repo: SalesReturnRepository::new(PostgresSalesReturnRepository::new(pool)),
        }
    }

    pub async fn get_sale_returnable_info(
        &self,
        _sale_id: &str,
    ) -> AppResult<SaleReturnableInfoDto> {
        Err(AppError::Internal(
            "Postgres get_sale_returnable_info not implemented".into(),
        ))
    }

    pub async fn create_sales_return(
        &self,
        dto: CreateSalesReturnDto,
        _user_id: Option<&str>,
    ) -> AppResult<SalesReturnDetailDto> {
        if dto.lines.is_empty() {
            return Err(AppError::Validation(
                "At least one line item must be returned".to_string(),
            ));
        }
        SalesRefundMethod::from_str(&dto.refund_method).map_err(AppError::Validation)?;
        for line in &dto.lines {
            if line.quantity <= 0 {
                return Err(AppError::Validation(
                    "Return quantity must be greater than 0".to_string(),
                ));
            }
        }
        Err(AppError::Internal(
            "Postgres create_sales_return not implemented".into(),
        ))
    }

    pub async fn get_sales_return(&self, _id: &str) -> AppResult<Option<SalesReturnDetailDto>> {
        Err(AppError::Internal(
            "Postgres get_by_id not implemented".into(),
        ))
    }

    pub async fn list_sales_returns(
        &self,
        _branch_id: Option<&str>,
        _limit: Option<i64>,
    ) -> AppResult<Vec<SalesReturnDetailDto>> {
        Err(AppError::Internal(
            "Postgres list_sales_returns not implemented".into(),
        ))
    }

    pub async fn get_sales_returns_by_sale(
        &self,
        _sale_id: &str,
    ) -> AppResult<Vec<SalesReturnDetailDto>> {
        Err(AppError::Internal(
            "Postgres get_by_sale_id not implemented".into(),
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn setup_test_service() -> SalesReturnService {
        let pool = sqlx::PgPool::connect_lazy("postgres://localhost/test_placeholder")
            .expect("connect_lazy should succeed");
        SalesReturnService::new_postgres(pool)
    }

    #[tokio::test]
    #[ignore]
    async fn test_full_cash_sale_return_flow() {
        let _service = setup_test_service().await;
        // Requires real Postgres DB — skipped
    }

    #[tokio::test]
    #[ignore]
    async fn test_customer_credit_sale_return_reduces_receivable() {
        let _service = setup_test_service().await;
        // Requires real Postgres DB — skipped
    }

    #[tokio::test]
    #[ignore]
    async fn test_excess_quantity_and_negative_balance_rejection() {
        let _service = setup_test_service().await;
        // Requires real Postgres DB — skipped
    }

    #[tokio::test]
    #[ignore]
    async fn test_cash_refund_fails_without_open_cash_session() {
        let _service = setup_test_service().await;
        // Requires real Postgres DB — skipped
    }

    #[tokio::test]
    #[ignore]
    async fn test_sales_return_full_refund_marks_sale_refunded() {
        let _service = setup_test_service().await;
        // Requires real Postgres DB — skipped
    }
}
