use chrono::Utc;
use sqlx::{PgPool, Row};
use uuid::Uuid;

use crate::domain::expense::{
    CreateExpenseCategoryDto, CreateExpenseDto, Expense, ExpenseCategory, ExpenseFilterDto,
    ExpenseStatus, ExpenseSummaryDto, UpdateExpenseDto,
};
use crate::errors::{AppError, AppResult};

#[derive(Clone)]
pub struct PostgresExpenseRepository {
    pool: PgPool,
}

impl PostgresExpenseRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn create_category(
        &self,
        dto: &CreateExpenseCategoryDto,
    ) -> AppResult<ExpenseCategory> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        let name = dto.name.trim();

        sqlx::query(
            "INSERT INTO expense_categories (id, name, description, is_active, created_at, updated_at)
             VALUES ($1, $2, $3, 1, $4, $5)"
        )
        .bind(&id)
        .bind(name)
        .bind(dto.description.as_deref())
        .bind(&now)
        .bind(&now)
        .execute(&self.pool)
        .await
        .map_err(|e| {
            let msg = e.to_string();
            if msg.contains("unique") || msg.contains("UNIQUE") {
                AppError::Conflict(format!("Expense category '{name}' already exists"))
            } else {
                AppError::Database(format!("Failed to create expense category: {e}"))
            }
        })?;

        Ok(ExpenseCategory {
            id,
            name: name.to_string(),
            description: dto.description.clone(),
            is_active: true,
            created_at: now.clone(),
            updated_at: now,
        })
    }

    pub async fn list_categories(&self) -> AppResult<Vec<ExpenseCategory>> {
        let sql = "SELECT id, name, description, is_active, created_at, updated_at FROM expense_categories WHERE is_active = 1 ORDER BY name ASC";
        let rows = sqlx::query(sql)
            .fetch_all(&self.pool)
            .await
            .map_err(|e| AppError::Database(format!("Failed to query expense categories: {e}")))?;

        let mut list = Vec::with_capacity(rows.len());
        for row in rows {
            let is_active_int: i32 = row.try_get(3).unwrap_or(1);
            list.push(ExpenseCategory {
                id: row.try_get(0).map_err(|e| AppError::Database(e.to_string()))?,
                name: row.try_get(1).map_err(|e| AppError::Database(e.to_string()))?,
                description: row.try_get(2).unwrap_or(None),
                is_active: is_active_int == 1,
                created_at: row.try_get(4).map_err(|e| AppError::Database(e.to_string()))?,
                updated_at: row.try_get(5).map_err(|e| AppError::Database(e.to_string()))?,
            });
        }
        Ok(list)
    }

    pub async fn create_expense(
        &self,
        dto: &CreateExpenseDto,
        user_id: Option<&str>,
    ) -> AppResult<Expense> {
        let mut tx = self.pool.begin().await.map_err(|e| AppError::Database(e.to_string()))?;

        sqlx::query("UPDATE counters SET value = value + 1 WHERE name = 'expense_number'")
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;

        let exp_val: (i64,) = sqlx::query_as("SELECT value FROM counters WHERE name = 'expense_number'")
            .fetch_one(&mut *tx)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;

        let exp_number = format!("EXP-{:06}", exp_val.0);
        let exp_id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        let p_method = dto.payment_method.clone().unwrap_or_else(|| "CASH".to_string()).to_uppercase();

        let expense = Expense {
            id: exp_id.clone(),
            expense_number: exp_number.clone(),
            category_id: dto.category_id.clone(),
            branch_id: dto.branch_id.clone(),
            amount: dto.amount,
            payment_method: p_method.clone(),
            description: dto.description.clone(),
            notes: dto.notes.clone(),
            expense_date: dto.expense_date.clone().unwrap_or_else(|| Utc::now().format("%Y-%m-%d").to_string()),
            status: "COMPLETED".to_string(),
            performed_by: user_id.map(|s| s.to_string()),
            created_at: now.clone(),
            updated_at: now.clone(),
        };

        sqlx::query(
            "INSERT INTO expenses (
                id, expense_number, category_id, branch_id, amount, payment_method,
                description, notes, expense_date, status, performed_by, created_at, updated_at
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)"
        )
        .bind(&expense.id)
        .bind(&expense.expense_number)
        .bind(&expense.category_id)
        .bind(&expense.branch_id)
        .bind(expense.amount)
        .bind(&expense.payment_method)
        .bind(&expense.description)
        .bind(expense.notes.as_deref())
        .bind(&expense.expense_date)
        .bind(expense.status.as_str())
        .bind(expense.performed_by.as_deref())
        .bind(&expense.created_at)
        .bind(&expense.updated_at)
        .execute(&mut *tx)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

        // Cash movement if cash payment
        if p_method == "CASH" {
            let open_session_id: Option<String> = sqlx::query_as(
                "SELECT id FROM cash_sessions WHERE branch_id = $1 AND status = 'OPEN' LIMIT 1",
            )
            .bind(&dto.branch_id)
            .fetch_optional(&mut *tx)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?
            .map(|r: (String,)| r.0);

            let mv_id = Uuid::new_v4().to_string();
            let desc = format!("Expense {}", exp_number);

            sqlx::query(
                "INSERT INTO cash_movements (id, session_id, branch_id, movement_type, direction, amount, reference_id, reference_number, payment_method, description, performed_by, created_at)
                 VALUES ($1, $2, $3, 'EXPENSE', 'OUT', $4, $5, $6, 'CASH', $7, $8, $9)"
            )
            .bind(mv_id)
            .bind(open_session_id.as_deref())
            .bind(&dto.branch_id)
            .bind(dto.amount)
            .bind(&exp_id)
            .bind(&exp_number)
            .bind(desc)
            .bind(user_id)
            .bind(&now)
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;
        }

        tx.commit().await.map_err(|e| AppError::Database(e.to_string()))?;
        Ok(expense)
    }

    pub async fn get_expense_by_id(&self, id: &str) -> AppResult<Option<Expense>> {
        let sql = "SELECT id, expense_number, category_id, branch_id, amount, payment_method, description, notes, expense_date, status, performed_by, created_at, updated_at FROM expenses WHERE id = $1";
        let row_opt = sqlx::query(sql)
            .bind(id)
            .fetch_optional(&self.pool)
            .await
            .map_err(|e| AppError::Database(format!("Failed to query expense: {e}")))?;

        match row_opt {
            Some(row) => Ok(Some(Self::map_expense_row(&row)?)),
            None => Ok(None),
        }
    }

    pub async fn list_expenses(
        &self,
        filter: &Option<ExpenseFilterDto>,
    ) -> AppResult<Vec<Expense>> {
        let mut query = String::from("SELECT id, expense_number, category_id, branch_id, amount, payment_method, description, notes, expense_date, status, performed_by, created_at, updated_at FROM expenses WHERE 1=1");
        let mut param_index = 1;

        if let Some(f) = filter {
            if f.category_id.is_some() {
                query.push_str(&format!(" AND category_id = ${param_index}"));
                param_index += 1;
            }
            if f.branch_id.is_some() {
                query.push_str(&format!(" AND branch_id = ${param_index}"));
                param_index += 1;
            }
            if f.start_date.is_some() {
                query.push_str(&format!(" AND expense_date >= ${param_index}"));
                param_index += 1;
            }
            if f.end_date.is_some() {
                query.push_str(&format!(" AND expense_date <= ${param_index}"));
                param_index += 1;
            }
        }

        query.push_str(" ORDER BY expense_date DESC, created_at DESC");

        let lim = filter.as_ref().and_then(|f| f.limit).unwrap_or(50);
        query.push_str(&format!(" LIMIT {lim}"));

        let mut q = sqlx::query(&query);

        if let Some(f) = filter {
            if let Some(cat) = &f.category_id {
                q = q.bind(cat);
            }
            if let Some(bid) = &f.branch_id {
                q = q.bind(bid);
            }
            if let Some(start) = &f.start_date {
                q = q.bind(start);
            }
            if let Some(end) = &f.end_date {
                q = q.bind(end);
            }
        }

        let rows = q
            .fetch_all(&self.pool)
            .await
            .map_err(|e| AppError::Database(format!("Failed to query expenses: {e}")))?;

        let mut list = Vec::with_capacity(rows.len());
        for row in rows {
            list.push(Self::map_expense_row(&row)?);
        }

        Ok(list)
    }

    fn map_expense_row(row: &sqlx::postgres::PgRow) -> AppResult<Expense> {
        let status_str: String = row.try_get(9).map_err(|e| AppError::Database(e.to_string()))?;
        let status = ExpenseStatus::from_str(&status_str)
            .ok_or_else(|| AppError::Database(format!("Invalid expense status: '{status_str}'")))?;

        Ok(Expense {
            id: row.try_get(0).map_err(|e| AppError::Database(e.to_string()))?,
            expense_number: row.try_get(1).map_err(|e| AppError::Database(e.to_string()))?,
            category_id: row.try_get(2).map_err(|e| AppError::Database(e.to_string()))?,
            category_name: None,
            branch_id: row.try_get(3).map_err(|e| AppError::Database(e.to_string()))?,
            amount: row.try_get(4).map_err(|e| AppError::Database(e.to_string()))?,
            payment_method: row.try_get(5).map_err(|e| AppError::Database(e.to_string()))?,
            description: row.try_get(6).map_err(|e| AppError::Database(e.to_string()))?,
            notes: row.try_get(7).unwrap_or(None),
            expense_date: row.try_get(8).map_err(|e| AppError::Database(e.to_string()))?,
            status,
            performed_by: row.try_get(10).unwrap_or(None),
            performed_by_name: None,
            created_at: row.try_get(11).map_err(|e| AppError::Database(e.to_string()))?,
            updated_at: row.try_get(12).map_err(|e| AppError::Database(e.to_string()))?,
        })
    }
}
