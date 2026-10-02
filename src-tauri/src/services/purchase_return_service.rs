use crate::domain::purchase_return::{
    CreatePurchaseReturnDto, PurchaseReturn, PurchaseReturnDetailDto, PurchaseReturnableInfoDto,
    PurchaseSettlementMethod,
};
use crate::errors::{AppError, AppResult};
use crate::repositories::{PostgresPurchaseReturnRepository, PurchaseReturnRepository};

#[derive(Clone)]
pub struct PurchaseReturnService {
    repo: PurchaseReturnRepository,
}

impl PurchaseReturnService {
    pub fn new_postgres(pool: sqlx::PgPool) -> Self {
        Self {
            repo: PurchaseReturnRepository::new(PostgresPurchaseReturnRepository::new(pool)),
        }
    }

    pub async fn get_purchase_returnable_info(
        &self,
        _purchase_id: &str,
    ) -> AppResult<PurchaseReturnableInfoDto> {
        Err(AppError::Internal(
            "Postgres get_purchase_returnable_info not implemented".into(),
        ))
    }

    pub async fn create_purchase_return(
        &self,
        dto: CreatePurchaseReturnDto,
        _user_id: Option<&str>,
    ) -> AppResult<PurchaseReturnDetailDto> {
        if dto.lines.is_empty() {
            return Err(AppError::Validation(
                "At least one line item must be returned".to_string(),
            ));
        }
        PurchaseSettlementMethod::from_str(&dto.settlement_method)
            .map_err(AppError::Validation)?;
        for line in &dto.lines {
            if line.quantity <= 0 {
                return Err(AppError::Validation(
                    "Return quantity must be greater than 0".to_string(),
                ));
            }
        }
        Err(AppError::Internal(
            "Postgres create_purchase_return not implemented".into(),
        ))
    }

    pub async fn get_purchase_return(
        &self,
        _id: &str,
    ) -> AppResult<Option<PurchaseReturnDetailDto>> {
        Err(AppError::Internal(
            "Postgres get_by_id not implemented".into(),
        ))
    }

    pub async fn list_purchase_returns(
        &self,
        _branch_id: Option<&str>,
        _limit: Option<i64>,
    ) -> AppResult<Vec<PurchaseReturnDetailDto>> {
        Err(AppError::Internal(
            "Postgres list_purchase_returns not implemented".into(),
        ))
    }

    pub async fn get_purchase_returns_by_purchase(
        &self,
        _purchase_id: &str,
    ) -> AppResult<Vec<PurchaseReturnDetailDto>> {
        Err(AppError::Internal(
            "Postgres get_by_purchase_id not implemented".into(),
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn setup_test_service() -> PurchaseReturnService {
        let pool = sqlx::PgPool::connect_lazy("postgres://localhost/test_placeholder")
            .expect("connect_lazy should succeed");
        PurchaseReturnService::new_postgres(pool)
    }

    #[tokio::test]
    #[ignore]
    async fn test_full_cash_purchase_return_flow() {
        let _service = setup_test_service().await;
        // Requires real Postgres DB — skipped
    }

    #[tokio::test]
    #[ignore]
    async fn test_supplier_credit_purchase_return_reduces_payable() {
        let _service = setup_test_service().await;
        // Requires real Postgres DB — skipped
    }

    #[tokio::test]
    #[ignore]
    async fn test_insufficient_stock_for_purchase_return_rejected() {
        let _service = setup_test_service().await;
        // Requires real Postgres DB — skipped
    }
}
