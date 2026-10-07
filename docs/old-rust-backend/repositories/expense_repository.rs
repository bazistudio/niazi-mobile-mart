use rusqlite::{params, Connection};

use crate::db::connection::DatabaseConnection;
use crate::db::errors::{DbError, DbResult};
use crate::domain::expense::{
    Expense, ExpenseCategory, ExpenseFilterDto, ExpenseStatus, UpdateExpenseCategoryDto,
};
use crate::errors::{AppError, AppResult};

#[derive(Clone)]
pub struct SQLiteExpenseRepository {
    db: DatabaseConnection,
}

impl SQLiteExpenseRepository {
    pub fn new(db: DatabaseConnection) -> Self {
        Self { db }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Transactional primitives (usable inside `with_transaction`)
    // ──────────────────────────────────────────────────────────────────────────

    /// Generates next sequential human-readable expense number inside transaction (e.g. EXP-000001)
    pub fn next_expense_number_in_tx(conn: &Connection) -> DbResult<String> {
        conn.execute(
            "UPDATE counters SET value = value + 1 WHERE name = 'expense_number'",
            [],
        )
        .map_err(|e| DbError::QueryError(format!("Failed to increment expense_number counter: {e}")))?;

        let val: i64 = conn
            .query_row(
                "SELECT value FROM counters WHERE name = 'expense_number'",
                [],
                |row| row.get(0),
            )
            .map_err(|e| DbError::QueryError(format!("Failed to read expense_number counter: {e}")))?;

        Ok(format!("EXP-{:06}", val))
    }

    /// Fetches an expense category by ID inside a transaction
    pub fn get_category_by_id_in_tx(conn: &Connection, id: &str) -> DbResult<Option<ExpenseCategory>> {
        let mut stmt = conn
            .prepare(
                "SELECT id, name, description, is_active, created_at, updated_at
                 FROM expense_categories WHERE id = ?1",
            )
            .map_err(|e| DbError::QueryError(format!("Failed to prepare query: {e}")))?;

        let mut rows = stmt
            .query_map(params![id], |row| {
                Ok(ExpenseCategory {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    description: row.get(2)?,
                    is_active: row.get::<_, i32>(3)? == 1,
                    created_at: row.get(4)?,
                    updated_at: row.get(5)?,
                })
            })
            .map_err(|e| DbError::QueryError(format!("Failed to execute query: {e}")))?;

        match rows.next() {
            Some(Ok(cat)) => Ok(Some(cat)),
            Some(Err(e)) => Err(DbError::QueryError(format!("Error reading row: {e}"))),
            None => Ok(None),
        }
    }

    /// Inserts an expense record inside an existing transaction
    pub fn insert_expense_in_tx(conn: &Connection, exp: &Expense) -> DbResult<()> {
        conn.execute(
            "INSERT INTO expenses (
                id, expense_number, category_id, branch_id, amount,
                payment_method, description, notes, expense_date, status,
                performed_by, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
            params![
                exp.id,
                exp.expense_number,
                exp.category_id,
                exp.branch_id,
                exp.amount,
                exp.payment_method,
                exp.description,
                exp.notes,
                exp.expense_date,
                exp.status.as_str(),
                exp.performed_by,
                exp.created_at,
                exp.updated_at,
            ],
        )
        .map_err(|e| DbError::QueryError(format!("Failed to insert expense: {e}")))?;

        Ok(())
    }

    /// Fetches an expense by ID inside a transaction
    pub fn get_expense_by_id_in_tx(conn: &Connection, id: &str) -> DbResult<Option<Expense>> {
        let mut stmt = conn
            .prepare(
                "SELECT e.id, e.expense_number, e.category_id, c.name, e.branch_id,
                        e.amount, e.payment_method, e.description, e.notes, e.expense_date,
                        e.status, e.performed_by, u.name, e.created_at, e.updated_at
                 FROM expenses e
                 LEFT JOIN expense_categories c ON e.category_id = c.id
                 LEFT JOIN users u ON e.performed_by = u.id
                 WHERE e.id = ?1",
            )
            .map_err(|e| DbError::QueryError(format!("Failed to prepare query: {e}")))?;

        let mut rows = stmt
            .query_map(params![id], |row| {
                let status_str: String = row.get(10)?;
                let status = ExpenseStatus::from_str(&status_str).unwrap_or(ExpenseStatus::Completed);
                Ok(Expense {
                    id: row.get(0)?,
                    expense_number: row.get(1)?,
                    category_id: row.get(2)?,
                    category_name: row.get(3)?,
                    branch_id: row.get(4)?,
                    amount: row.get(5)?,
                    payment_method: row.get(6)?,
                    description: row.get(7)?,
                    notes: row.get(8)?,
                    expense_date: row.get(9)?,
                    status,
                    performed_by: row.get(11)?,
                    performed_by_name: row.get(12)?,
                    created_at: row.get(13)?,
                    updated_at: row.get(14)?,
                })
            })
            .map_err(|e| DbError::QueryError(format!("Failed to execute query: {e}")))?;

        match rows.next() {
            Some(Ok(exp)) => Ok(Some(exp)),
            Some(Err(e)) => Err(DbError::QueryError(format!("Error reading row: {e}"))),
            None => Ok(None),
        }
    }

    /// Cancels an expense inside a transaction (marks status as CANCELLED)
    pub fn cancel_expense_in_tx(conn: &Connection, id: &str, now: &str) -> DbResult<()> {
        let rows = conn
            .execute(
                "UPDATE expenses SET status = 'CANCELLED', updated_at = ?1 WHERE id = ?2 AND status = 'COMPLETED'",
                params![now, id],
            )
            .map_err(|e| DbError::QueryError(format!("Failed to cancel expense: {e}")))?;

        if rows == 0 {
            return Err(DbError::NotFound(format!("Expense '{id}' not found or already cancelled")));
        }

        Ok(())
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Async Repository methods
    // ──────────────────────────────────────────────────────────────────────────

    pub async fn create_category(&self, cat: &ExpenseCategory) -> AppResult<ExpenseCategory> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        guard
            .execute(
                "INSERT INTO expense_categories (id, name, description, is_active, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    cat.id,
                    cat.name,
                    cat.description,
                    if cat.is_active { 1 } else { 0 },
                    cat.created_at,
                    cat.updated_at,
                ],
            )
            .map_err(|e| {
                if let rusqlite::Error::SqliteFailure(err, _) = &e {
                    if err.code == rusqlite::ErrorCode::ConstraintViolation {
                        return AppError::Conflict(format!("Expense category '{}' already exists", cat.name));
                    }
                }
                AppError::Database(format!("Failed to insert expense category: {e}"))
            })?;

        Ok(cat.clone())
    }

    pub async fn update_category(
        &self,
        id: &str,
        dto: &UpdateExpenseCategoryDto,
        now: &str,
    ) -> AppResult<ExpenseCategory> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        let current = Self::get_category_by_id_in_tx(&guard, id)?
            .ok_or_else(|| AppError::NotFound(format!("Expense category '{id}' not found")))?;

        let new_name = dto.name.as_ref().map(|s| s.trim()).filter(|s| !s.is_empty()).unwrap_or(&current.name);
        let new_desc = dto.description.clone().or(current.description);
        let new_active = dto.is_active.unwrap_or(current.is_active);

        guard
            .execute(
                "UPDATE expense_categories SET name = ?1, description = ?2, is_active = ?3, updated_at = ?4 WHERE id = ?5",
                params![new_name, new_desc, if new_active { 1 } else { 0 }, now, id],
            )
            .map_err(|e| {
                if let rusqlite::Error::SqliteFailure(err, _) = &e {
                    if err.code == rusqlite::ErrorCode::ConstraintViolation {
                        return AppError::Conflict(format!("Expense category '{new_name}' already exists"));
                    }
                }
                AppError::Database(format!("Failed to update expense category: {e}"))
            })?;

        Ok(ExpenseCategory {
            id: id.to_string(),
            name: new_name.to_string(),
            description: new_desc,
            is_active: new_active,
            created_at: current.created_at,
            updated_at: now.to_string(),
        })
    }

    pub async fn get_category_by_id(&self, id: &str) -> AppResult<Option<ExpenseCategory>> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;
        Ok(Self::get_category_by_id_in_tx(&guard, id)?)
    }

    pub async fn list_categories(&self, active_only: bool) -> AppResult<Vec<ExpenseCategory>> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        let sql = if active_only {
            "SELECT id, name, description, is_active, created_at, updated_at
             FROM expense_categories WHERE is_active = 1 ORDER BY name ASC"
        } else {
            "SELECT id, name, description, is_active, created_at, updated_at
             FROM expense_categories ORDER BY name ASC"
        };

        let mut stmt = guard
            .prepare(sql)
            .map_err(|e| AppError::Database(format!("Failed to prepare query: {e}")))?;

        let rows = stmt
            .query_map([], |row| {
                Ok(ExpenseCategory {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    description: row.get(2)?,
                    is_active: row.get::<_, i32>(3)? == 1,
                    created_at: row.get(4)?,
                    updated_at: row.get(5)?,
                })
            })
            .map_err(|e| AppError::Database(format!("Failed to execute query: {e}")))?;

        let mut categories = Vec::new();
        for r in rows {
            categories.push(r.map_err(|e| AppError::Database(format!("Row error: {e}")))?)
        }

        Ok(categories)
    }

    pub async fn get_expense_by_id(&self, id: &str) -> AppResult<Option<Expense>> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;
        Ok(Self::get_expense_by_id_in_tx(&guard, id)?)
    }

    pub async fn list_expenses(&self, filter: &ExpenseFilterDto) -> AppResult<Vec<Expense>> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        let mut query = String::from(
            "SELECT e.id, e.expense_number, e.category_id, c.name, e.branch_id,
                    e.amount, e.payment_method, e.description, e.notes, e.expense_date,
                    e.status, e.performed_by, u.name, e.created_at, e.updated_at
             FROM expenses e
             LEFT JOIN expense_categories c ON e.category_id = c.id
             LEFT JOIN users u ON e.performed_by = u.id
             WHERE 1=1",
        );

        let mut param_values: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

        if let Some(ref cat_id) = filter.category_id {
            query.push_str(" AND e.category_id = ?");
            param_values.push(Box::new(cat_id.clone()));
        }

        if let Some(ref branch_id) = filter.branch_id {
            query.push_str(" AND e.branch_id = ?");
            param_values.push(Box::new(branch_id.clone()));
        }

        if let Some(ref p_method) = filter.payment_method {
            query.push_str(" AND e.payment_method = ?");
            param_values.push(Box::new(p_method.clone()));
        }

        if let Some(ref status) = filter.status {
            query.push_str(" AND e.status = ?");
            param_values.push(Box::new(status.clone()));
        }

        if let Some(ref s) = filter.search {
            let search_term = format!("%{}%", s.trim());
            query.push_str(" AND (e.expense_number LIKE ? OR e.description LIKE ? OR c.name LIKE ?)");
            param_values.push(Box::new(search_term.clone()));
            param_values.push(Box::new(search_term.clone()));
            param_values.push(Box::new(search_term));
        }

        if let Some(ref start) = filter.start_date {
            query.push_str(" AND e.expense_date >= ?");
            param_values.push(Box::new(start.clone()));
        }

        if let Some(ref end) = filter.end_date {
            query.push_str(" AND e.expense_date <= ?");
            param_values.push(Box::new(end.clone()));
        }

        query.push_str(" ORDER BY e.expense_date DESC, e.created_at DESC");

        let limit = filter.limit.unwrap_or(50).max(1);
        let offset = filter.offset.unwrap_or(0).max(0);
        query.push_str(&format!(" LIMIT {limit} OFFSET {offset}"));

        let mut stmt = guard
            .prepare(&query)
            .map_err(|e| AppError::Database(format!("Failed to prepare query: {e}")))?;

        let rusqlite_params: Vec<&dyn rusqlite::ToSql> =
            param_values.iter().map(|p| p.as_ref()).collect();

        let rows = stmt
            .query_map(rusqlite_params.as_slice(), |row| {
                let status_str: String = row.get(10)?;
                let status = ExpenseStatus::from_str(&status_str).unwrap_or(ExpenseStatus::Completed);
                Ok(Expense {
                    id: row.get(0)?,
                    expense_number: row.get(1)?,
                    category_id: row.get(2)?,
                    category_name: row.get(3)?,
                    branch_id: row.get(4)?,
                    amount: row.get(5)?,
                    payment_method: row.get(6)?,
                    description: row.get(7)?,
                    notes: row.get(8)?,
                    expense_date: row.get(9)?,
                    status,
                    performed_by: row.get(11)?,
                    performed_by_name: row.get(12)?,
                    created_at: row.get(13)?,
                    updated_at: row.get(14)?,
                })
            })
            .map_err(|e| AppError::Database(format!("Failed to execute query: {e}")))?;

        let mut items = Vec::new();
        for r in rows {
            items.push(r.map_err(|e| AppError::Database(format!("Row read error: {e}")))?)
        }

        Ok(items)
    }
}
