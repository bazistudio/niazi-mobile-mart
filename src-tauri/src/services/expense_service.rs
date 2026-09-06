use chrono::Utc;
use uuid::Uuid;

use crate::db::connection::DatabaseConnection;
use crate::db::errors::DbError;
use crate::db::transaction::with_transaction;
use crate::domain::cash::{CashMovement, CashMovementDirection, CashMovementType};
use crate::domain::expense::{
    CreateExpenseCategoryDto, CreateExpenseDto, Expense, ExpenseCategory, ExpenseFilterDto,
    ExpenseStatus, UpdateExpenseCategoryDto,
};
use crate::domain::organization::DEFAULT_MAIN_BRANCH_ID;
use crate::errors::{AppError, AppResult};
use crate::repositories::branch_repository::BranchRepository;
use crate::repositories::{SQLiteCashRepository, SQLiteExpenseRepository};

#[derive(Clone)]
pub struct ExpenseService {
    db: DatabaseConnection,
    expense_repo: SQLiteExpenseRepository,
    branch_repo: BranchRepository,
}

impl ExpenseService {
    pub fn new(db: DatabaseConnection) -> Self {
        Self {
            expense_repo: SQLiteExpenseRepository::new(db.clone()),
            branch_repo: BranchRepository::new(db.clone()),
            db,
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Category Management
    // ──────────────────────────────────────────────────────────────────────────

    pub async fn create_category(&self, dto: CreateExpenseCategoryDto) -> AppResult<ExpenseCategory> {
        let name = dto.name.trim();
        if name.is_empty() {
            return Err(AppError::Validation("Category name cannot be empty".to_string()));
        }

        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();

        let cat = ExpenseCategory {
            id,
            name: name.to_string(),
            description: dto.description.map(|d| d.trim().to_string()).filter(|d| !d.is_empty()),
            is_active: true,
            created_at: now.clone(),
            updated_at: now,
        };

        self.expense_repo.create_category(&cat).await
    }

    pub async fn update_category(
        &self,
        id: &str,
        dto: UpdateExpenseCategoryDto,
    ) -> AppResult<ExpenseCategory> {
        let now = Utc::now().to_rfc3339();
        self.expense_repo.update_category(id, &dto, &now).await
    }

    pub async fn get_category_by_id(&self, id: &str) -> AppResult<ExpenseCategory> {
        self.expense_repo
            .get_category_by_id(id)
            .await?
            .ok_or_else(|| AppError::NotFound(format!("Expense category '{id}' not found")))
    }

    pub async fn list_categories(&self, active_only: bool) -> AppResult<Vec<ExpenseCategory>> {
        self.expense_repo.list_categories(active_only).await
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Expense Lifecycle
    // ──────────────────────────────────────────────────────────────────────────

    pub async fn create_expense(
        &self,
        user_id: Option<&str>,
        dto: CreateExpenseDto,
    ) -> AppResult<Expense> {
        if dto.amount <= 0 {
            return Err(AppError::Validation("Expense amount must be greater than 0".to_string()));
        }

        let desc = dto.description.trim();
        if desc.is_empty() {
            return Err(AppError::Validation("Expense description is required".to_string()));
        }

        let cat_id = dto.category_id.trim().to_string();
        if cat_id.is_empty() {
            return Err(AppError::Validation("Expense category ID is required".to_string()));
        }

        let branch_id = match dto.branch_id.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
            Some(bid) => bid.to_string(),
            None => match self.branch_repo.get_main_branch().await? {
                Some(b) => b.id,
                None => DEFAULT_MAIN_BRANCH_ID.to_string(),
            },
        };

        let payment_method = dto
            .payment_method
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or("CASH")
            .to_uppercase();

        let expense_date = dto
            .expense_date
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string)
            .unwrap_or_else(|| Utc::now().to_rfc3339());

        let notes = dto.notes.map(|n| n.trim().to_string()).filter(|n| !n.is_empty());
        let uid = user_id.map(str::to_string);
        let amount = dto.amount;

        let result = with_transaction(&self.db, move |tx| {
            let now = Utc::now().to_rfc3339();

            // 1. Verify Category exists and is active
            let category = SQLiteExpenseRepository::get_category_by_id_in_tx(tx, &cat_id)?
                .ok_or_else(|| DbError::NotFound(format!("Expense category '{cat_id}' not found")))?;

            if !category.is_active {
                return Err(DbError::ValidationError(format!(
                    "Expense category '{}' is inactive. Cannot record expenses against it.",
                    category.name
                )));
            }

            // 2. Generate sequential human-readable expense number (EXP-000001)
            let expense_number = SQLiteExpenseRepository::next_expense_number_in_tx(tx)?;
            let expense_id = Uuid::new_v4().to_string();

            let expense = Expense {
                id: expense_id.clone(),
                expense_number: expense_number.clone(),
                category_id: cat_id.clone(),
                category_name: Some(category.name.clone()),
                branch_id: branch_id.clone(),
                amount,
                payment_method: payment_method.clone(),
                description: desc.to_string(),
                notes: notes.clone(),
                expense_date: expense_date.clone(),
                status: ExpenseStatus::Completed,
                performed_by: uid.clone(),
                performed_by_name: None,
                created_at: now.clone(),
                updated_at: now.clone(),
            };

            SQLiteExpenseRepository::insert_expense_in_tx(tx, &expense)?;

            // 3. If CASH payment method, record authoritative Cash Movement OUT
            if payment_method == "CASH" {
                let open_session_id = SQLiteCashRepository::get_open_session_id_in_tx(tx, &branch_id)?;

                let cash_movement = CashMovement {
                    id: Uuid::new_v4().to_string(),
                    session_id: open_session_id,
                    branch_id: branch_id.clone(),
                    movement_type: CashMovementType::Expense,
                    direction: CashMovementDirection::Out,
                    amount,
                    reference_id: Some(expense_id.clone()),
                    reference_number: Some(expense_number.clone()),
                    payment_method: "CASH".to_string(),
                    description: format!("Expense {}: {}", expense_number, desc),
                    performed_by: uid.clone(),
                    performed_by_name: None,
                    created_at: now.clone(),
                };

                SQLiteCashRepository::insert_movement_in_tx(tx, &cash_movement)?;
            }

            Ok(expense)
        })
        .await?;

        Ok(result)
    }

    pub async fn cancel_expense(
        &self,
        user_id: Option<&str>,
        expense_id: &str,
    ) -> AppResult<Expense> {
        let eid = expense_id.trim().to_string();
        let uid = user_id.map(str::to_string);

        let cancelled_expense = with_transaction(&self.db, move |tx| {
            let now = Utc::now().to_rfc3339();

            let current = SQLiteExpenseRepository::get_expense_by_id_in_tx(tx, &eid)?
                .ok_or_else(|| DbError::NotFound(format!("Expense '{eid}' not found")))?;

            if current.status == ExpenseStatus::Cancelled {
                return Err(DbError::ValidationError(format!(
                    "Expense '{}' is already cancelled",
                    current.expense_number
                )));
            }

            // Mark status = CANCELLED
            SQLiteExpenseRepository::cancel_expense_in_tx(tx, &eid, &now)?;

            // If it was a CASH expense, create immutable compensating Cash Movement IN
            if current.payment_method == "CASH" {
                let open_session_id = SQLiteCashRepository::get_open_session_id_in_tx(tx, &current.branch_id)?;

                let reversal_movement = CashMovement {
                    id: Uuid::new_v4().to_string(),
                    session_id: open_session_id,
                    branch_id: current.branch_id.clone(),
                    movement_type: CashMovementType::Expense,
                    direction: CashMovementDirection::In,
                    amount: current.amount,
                    reference_id: Some(current.id.clone()),
                    reference_number: Some(current.expense_number.clone()),
                    payment_method: "CASH".to_string(),
                    description: format!("Reversal of Cancelled Expense {}", current.expense_number),
                    performed_by: uid,
                    performed_by_name: None,
                    created_at: now.clone(),
                };

                SQLiteCashRepository::insert_movement_in_tx(tx, &reversal_movement)?;
            }

            let mut updated = current;
            updated.status = ExpenseStatus::Cancelled;
            updated.updated_at = now;

            Ok(updated)
        })
        .await?;

        Ok(cancelled_expense)
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
    use crate::db::connection::DatabaseConnection;
    use crate::domain::cash::OpenCashSessionDto;
    use crate::domain::expense::CreateExpenseCategoryDto;
    use crate::services::cash_service::CashService;

    const TEST_USER_ID: &str = "99999999-9999-9999-9999-999999999999";

    async fn setup_test_context() -> (DatabaseConnection, ExpenseService, CashService) {
        let db = DatabaseConnection::open_in_memory().unwrap();
        {
            let conn_arc = db.inner();
            let conn = conn_arc.lock().await;
            conn.pragma_update(None, "foreign_keys", "ON").unwrap();
            conn.execute(
                "INSERT OR IGNORE INTO users (id, name, username, login_key_hash, role, is_active, created_at, updated_at)
                 VALUES ('99999999-9999-9999-9999-999999999999', 'Admin User', 'admin_user', 'hash', 'admin', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
                [],
            ).unwrap();
        }

        let expense_service = ExpenseService::new(db.clone());
        let cash_service = CashService::new(db.clone());

        (db, expense_service, cash_service)
    }

    #[tokio::test]
    async fn test_expense_category_lifecycle() {
        let (_db, expense_svc, _) = setup_test_context().await;

        // 1. Check seeded categories (Migration 007 seeded 8)
        let categories = expense_svc.list_categories(true).await.unwrap();
        assert_eq!(categories.len(), 8);

        // 2. Create custom category
        let new_cat = expense_svc
            .create_category(CreateExpenseCategoryDto {
                name: "Courier Services".to_string(),
                description: Some("Shipping and delivery costs".to_string()),
            })
            .await
            .unwrap();
        assert_eq!(new_cat.name, "Courier Services");
        assert!(new_cat.is_active);

        // 3. Reject duplicate category name
        let dup_err = expense_svc
            .create_category(CreateExpenseCategoryDto {
                name: "courier services".to_string(), // case-insensitive check
                description: None,
            })
            .await;
        assert!(dup_err.is_err());

        // 4. Update category active -> inactive
        let updated = expense_svc
            .update_category(
                &new_cat.id,
                crate::domain::expense::UpdateExpenseCategoryDto {
                    name: None,
                    description: None,
                    is_active: Some(false),
                },
            )
            .await
            .unwrap();
        assert!(!updated.is_active);

        // 5. Active only list should exclude it, all should include it
        let active_only = expense_svc.list_categories(true).await.unwrap();
        assert_eq!(active_only.len(), 8);

        let all_cats = expense_svc.list_categories(false).await.unwrap();
        assert_eq!(all_cats.len(), 9);
    }

    #[tokio::test]
    async fn test_sequential_expense_numbers_and_validation() {
        let (_db, expense_svc, _) = setup_test_context().await;

        let categories = expense_svc.list_categories(true).await.unwrap();
        let cat_id = categories[0].id.clone();

        // 1. Validation: Amount <= 0 should fail
        let zero_amount_err = expense_svc
            .create_expense(
                Some(TEST_USER_ID),
                CreateExpenseDto {
                    category_id: cat_id.clone(),
                    branch_id: None,
                    amount: 0,
                    payment_method: Some("CASH".to_string()),
                    description: "Zero amount".to_string(),
                    notes: None,
                    expense_date: None,
                },
            )
            .await;
        assert!(zero_amount_err.is_err());

        // 2. Validation: Inactive category should fail
        let new_cat = expense_svc
            .create_category(CreateExpenseCategoryDto {
                name: "Disabled Category".to_string(),
                description: None,
            })
            .await
            .unwrap();
        expense_svc
            .update_category(
                &new_cat.id,
                crate::domain::expense::UpdateExpenseCategoryDto {
                    name: None,
                    description: None,
                    is_active: Some(false),
                },
            )
            .await
            .unwrap();

        let inactive_err = expense_svc
            .create_expense(
                Some(TEST_USER_ID),
                CreateExpenseDto {
                    category_id: new_cat.id,
                    branch_id: None,
                    amount: 1000,
                    payment_method: Some("CASH".to_string()),
                    description: "Inactive test".to_string(),
                    notes: None,
                    expense_date: None,
                },
            )
            .await;
        assert!(inactive_err.is_err());

        // 3. Create expense 1 -> EXP-000001
        let exp1 = expense_svc
            .create_expense(
                Some(TEST_USER_ID),
                CreateExpenseDto {
                    category_id: cat_id.clone(),
                    branch_id: None,
                    amount: 1500,
                    payment_method: Some("CASH".to_string()),
                    description: "Stationery".to_string(),
                    notes: None,
                    expense_date: None,
                },
            )
            .await
            .unwrap();
        assert_eq!(exp1.expense_number, "EXP-000001");
        assert_eq!(exp1.amount, 1500);
        assert_eq!(exp1.status, ExpenseStatus::Completed);

        // 4. Create expense 2 -> EXP-000002
        let exp2 = expense_svc
            .create_expense(
                Some(TEST_USER_ID),
                CreateExpenseDto {
                    category_id: cat_id.clone(),
                    branch_id: None,
                    amount: 4500,
                    payment_method: Some("CASH".to_string()),
                    description: "Internet Bill".to_string(),
                    notes: None,
                    expense_date: None,
                },
            )
            .await
            .unwrap();
        assert_eq!(exp2.expense_number, "EXP-000002");
    }

    #[tokio::test]
    async fn test_cash_expense_flow_cancellation_and_movements() {
        let (_db, expense_svc, cash_svc) = setup_test_context().await;

        // Open cash session with 50,000 PKR opening cash
        cash_svc
            .open_session(
                Some(TEST_USER_ID),
                OpenCashSessionDto {
                    branch_id: None,
                    business_date: None,
                    opening_cash: 50000,
                    notes: Some("Morning shift".to_string()),
                },
            )
            .await
            .unwrap();

        let categories = expense_svc.list_categories(true).await.unwrap();
        let cat_id = categories[0].id.clone();

        // 1. Create CASH expense of 5,000 PKR -> Must create CashMovement OUT
        let cash_exp = expense_svc
            .create_expense(
                Some(TEST_USER_ID),
                CreateExpenseDto {
                    category_id: cat_id.clone(),
                    branch_id: None,
                    amount: 5000,
                    payment_method: Some("CASH".to_string()),
                    description: "Office Maintenance".to_string(),
                    notes: None,
                    expense_date: None,
                },
            )
            .await
            .unwrap();

        // Check expected cash: 50,000 - 5,000 = 45,000
        let summary1 = cash_svc.get_daily_summary(None, None).await.unwrap();
        assert_eq!(summary1.opening_cash, 50000);
        assert_eq!(summary1.cash_expenses, 5000);
        assert_eq!(summary1.expected_closing_cash, 45000);

        // 2. Create NON-CASH (BANK_TRANSFER) expense of 12,000 PKR -> Must NOT affect cash movements
        let non_cash_exp = expense_svc
            .create_expense(
                Some(TEST_USER_ID),
                CreateExpenseDto {
                    category_id: cat_id.clone(),
                    branch_id: None,
                    amount: 12000,
                    payment_method: Some("BANK_TRANSFER".to_string()),
                    description: "Quarterly Rent via Bank".to_string(),
                    notes: None,
                    expense_date: None,
                },
            )
            .await
            .unwrap();

        assert_eq!(non_cash_exp.payment_method, "BANK_TRANSFER");
        // Physical cash must remain 45,000!
        let summary2 = cash_svc.get_daily_summary(None, None).await.unwrap();
        assert_eq!(summary2.cash_expenses, 5000);
        assert_eq!(summary2.expected_closing_cash, 45000);

        // 3. Cancel the CASH expense -> Must create compensating CashMovement IN (append-only)
        let cancelled_exp = expense_svc
            .cancel_expense(Some(TEST_USER_ID), &cash_exp.id)
            .await
            .unwrap();
        assert_eq!(cancelled_exp.status, ExpenseStatus::Cancelled);

        // Verify summary after cancellation: cash restored to 50,000
        let summary3 = cash_svc.get_daily_summary(None, None).await.unwrap();
        assert_eq!(summary3.expected_closing_cash, 50000);

        // Verify movements in DB directly:
        // Movement 1: Out 5,000
        // Movement 2: In 5,000 (reversal)
        let movements = cash_svc.list_movements(None).await.unwrap();
        assert_eq!(movements.len(), 2);
        assert_eq!(movements[0].direction, CashMovementDirection::In);
        assert_eq!(movements[0].amount, 5000);
        assert_eq!(movements[1].direction, CashMovementDirection::Out);
        assert_eq!(movements[1].amount, 5000);

        // 4. Double cancellation must fail
        let double_cancel_err = expense_svc
            .cancel_expense(Some(TEST_USER_ID), &cash_exp.id)
            .await;
        assert!(double_cancel_err.is_err());
    }
}
