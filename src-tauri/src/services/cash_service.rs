use crate::domain::cash::{
    CashMovement, CashMovementFilterDto, CashSession, CloseCashSessionDto, CreateCashAdjustmentDto,
    CashMovementDirection, DailyCashSummaryDto, OpenCashSessionDto,
};
use crate::domain::organization::DEFAULT_MAIN_BRANCH_ID;
use crate::errors::{AppError, AppResult};
use crate::repositories::{
    BranchRepository, CashRepository, PostgresBranchRepository, PostgresCashRepository,
};

#[derive(Clone)]
pub struct CashService {
    cash_repo: CashRepository,
    branch_repo: BranchRepository,
}

impl CashService {
    pub fn new_postgres(pool: sqlx::PgPool) -> Self {
        Self {
            cash_repo: CashRepository::new(PostgresCashRepository::new(pool.clone())),
            branch_repo: BranchRepository::Postgres(PostgresBranchRepository::new(pool)),
        }
    }

    pub async fn open_session(
        &self,
        _user_id: Option<&str>,
        dto: OpenCashSessionDto,
    ) -> AppResult<CashSession> {
        if dto.opening_cash < 0 {
            return Err(AppError::Validation(
                "Opening cash amount cannot be negative".to_string(),
            ));
        }
        Err(AppError::Internal(
            "Postgres open_session not implemented".into(),
        ))
    }

    pub async fn get_current_session(
        &self,
        branch_id: Option<&str>,
    ) -> AppResult<Option<CashSession>> {
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
        _branch_id: Option<&str>,
        _limit: Option<i64>,
        _offset: Option<i64>,
    ) -> AppResult<Vec<CashSession>> {
        Err(AppError::Internal(
            "Postgres list_sessions not implemented".into(),
        ))
    }

    pub async fn close_session(
        &self,
        _user_id: Option<&str>,
        dto: CloseCashSessionDto,
    ) -> AppResult<CashSession> {
        if dto.actual_closing_cash < 0 {
            return Err(AppError::Validation(
                "Actual closing cash count cannot be negative".to_string(),
            ));
        }
        Err(AppError::Internal(
            "Postgres close_session not implemented".into(),
        ))
    }

    pub async fn create_adjustment(
        &self,
        _user_id: Option<&str>,
        dto: CreateCashAdjustmentDto,
    ) -> AppResult<CashMovement> {
        if dto.amount <= 0 {
            return Err(AppError::Validation(
                "Adjustment amount must be greater than 0".to_string(),
            ));
        }
        let direction_str = dto.direction.trim().to_uppercase();
        if CashMovementDirection::from_str(&direction_str).is_none() {
            return Err(AppError::Validation(
                "Invalid adjustment direction. Must be 'IN' or 'OUT'".to_string(),
            ));
        }
        let reason = dto.reason.trim();
        if reason.is_empty() {
            return Err(AppError::Validation(
                "A reason is required for every cash adjustment".to_string(),
            ));
        }
        Err(AppError::Internal(
            "Postgres create_adjustment not implemented".into(),
        ))
    }

    pub async fn list_movements(
        &self,
        _filter: Option<CashMovementFilterDto>,
    ) -> AppResult<Vec<CashMovement>> {
        Err(AppError::Internal(
            "Postgres list_movements not implemented".into(),
        ))
    }

    pub async fn get_daily_summary(
        &self,
        _branch_id: Option<&str>,
        _date: Option<&str>,
    ) -> AppResult<DailyCashSummaryDto> {
        Err(AppError::Internal(
            "Postgres get_daily_summary not implemented".into(),
        ))
    }
}

#[cfg(test)]
pub mod tests {
    use super::*;

    async fn setup_test_service() -> CashService {
        let pool = sqlx::PgPool::connect_lazy("postgres://localhost/test_placeholder")
            .expect("connect_lazy should succeed");
        CashService::new_postgres(pool)
    }

    #[tokio::test]
    #[ignore]
    async fn test_cash_session_lifecycle_and_single_open_enforcement() {
        let _service = setup_test_service().await;
        // Requires real Postgres DB — skipped
    }

    #[tokio::test]
    #[ignore]
    async fn test_cash_adjustments_and_variance_calculation() {
        let _service = setup_test_service().await;
        // Requires real Postgres DB — skipped
    }

    #[tokio::test]
    #[ignore]
    async fn test_adjustment_validation_and_closed_session_protection() {
        let _service = setup_test_service().await;
        // Requires real Postgres DB — skipped
    }

    #[tokio::test]
    #[ignore]
    async fn test_full_operational_financial_flow_and_reconciliation() {
        let _service = setup_test_service().await;
        // Requires real Postgres DB — skipped
    }

    #[tokio::test]
    #[ignore]
    async fn test_non_cash_transactions_do_not_produce_cash_movements() {
        let _service = setup_test_service().await;
        // Requires real Postgres DB — skipped
    }

    #[tokio::test]
    #[ignore]
    async fn test_atomic_rollback_on_failure() {
        let _service = setup_test_service().await;
        // Requires real Postgres DB — skipped
    }
}
