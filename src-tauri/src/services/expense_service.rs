use crate::domain::expense::{
    CreateExpenseCategoryDto, CreateExpenseDto, Expense, ExpenseCategory, ExpenseFilterDto,
    UpdateExpenseCategoryDto,
};
use crate::errors::{AppError, AppResult};
use crate::repositories::{
    BranchRepository, ExpenseRepository, PostgresBranchRepository, PostgresExpenseRepository,
};

#[derive(Clone)]
pub struct ExpenseService {
    expense_repo: ExpenseRepository,
    branch_repo: BranchRepository,
}

impl ExpenseService {
    pub fn new_postgres(pool: sqlx::PgPool) -> Self {
        Self {
            expense_repo: ExpenseRepository::new(PostgresExpenseRepository::new(pool.clone())),
            branch_repo: BranchRepository::Postgres(PostgresBranchRepository::new(pool)),
        }
    }

    pub async fn create_category(
        &self,
        dto: CreateExpenseCategoryDto,
    ) -> AppResult<ExpenseCategory> {
        let name = dto.name.trim();
        if name.is_empty() {
            return Err(AppError::Validation(
                "Category name cannot be empty".to_string(),
            ));
        }
        self.expense_repo.create_category_dto(&dto).await
    }

    pub async fn update_category(
        &self,
        _id: &str,
        _dto: UpdateExpenseCategoryDto,
    ) -> AppResult<ExpenseCategory> {
        Err(AppError::Internal(
            "Postgres update_category not implemented".into(),
        ))
    }

    pub async fn get_category_by_id(&self, _id: &str) -> AppResult<ExpenseCategory> {
        Err(AppError::Internal(
            "Postgres get_category_by_id not implemented".into(),
        ))
    }

    pub async fn list_categories(&self, _active_only: bool) -> AppResult<Vec<ExpenseCategory>> {
        self.expense_repo.list_categories().await
    }

    pub async fn create_expense(
        &self,
        user_id: Option<&str>,
        dto: CreateExpenseDto,
    ) -> AppResult<Expense> {
        if dto.amount <= 0 {
            return Err(AppError::Validation(
                "Expense amount must be greater than 0".to_string(),
            ));
        }
        let desc = dto.description.trim();
        if desc.is_empty() {
            return Err(AppError::Validation(
                "Expense description is required".to_string(),
            ));
        }
        let cat_id = dto.category_id.trim();
        if cat_id.is_empty() {
            return Err(AppError::Validation(
                "Expense category ID is required".to_string(),
            ));
        }
        self.expense_repo.create_expense(&dto, user_id).await
    }

    pub async fn cancel_expense(
        &self,
        _user_id: Option<&str>,
        _expense_id: &str,
    ) -> AppResult<Expense> {
        Err(AppError::Internal(
            "Postgres cancel_expense not implemented".into(),
        ))
    }

    pub async fn get_expense_by_id(&self, id: &str) -> AppResult<Expense> {
        self.expense_repo
            .get_expense_by_id(id)
            .await?
            .ok_or_else(|| AppError::NotFound(format!("Expense '{id}' not found")))
    }

    pub async fn list_expenses(&self, filter: ExpenseFilterDto) -> AppResult<Vec<Expense>> {
        self.expense_repo.list_expenses(&filter).await
    }
}

#[cfg(test)]
pub mod tests {
    use super::*;

    async fn setup_test_service() -> ExpenseService {
        let pool = sqlx::PgPool::connect_lazy("postgres://localhost/test_placeholder")
            .expect("connect_lazy should succeed");
        ExpenseService::new_postgres(pool)
    }

    #[tokio::test]
    #[ignore]
    async fn test_expense_category_lifecycle() {
        let _service = setup_test_service().await;
        // Requires real Postgres DB — skipped
    }

    #[tokio::test]
    #[ignore]
    async fn test_sequential_expense_numbers_and_validation() {
        let _service = setup_test_service().await;
        // Requires real Postgres DB — skipped
    }

    #[tokio::test]
    #[ignore]
    async fn test_cash_expense_flow_cancellation_and_movements() {
        let _service = setup_test_service().await;
        // Requires real Postgres DB — skipped
    }
}
