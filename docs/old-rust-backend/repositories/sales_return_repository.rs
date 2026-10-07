use rusqlite::{params, Connection};

use crate::db::connection::DatabaseConnection;
use crate::db::errors::{DbError, DbResult};
use crate::domain::sales_return::{
    SalesRefundMethod, SalesReturn, SalesReturnDetailDto, SalesReturnLine, SalesReturnStatus,
};
use crate::errors::{AppError, AppResult};

#[derive(Clone)]
pub struct SQLiteSalesReturnRepository {
    db: DatabaseConnection,
}

impl SQLiteSalesReturnRepository {
    pub fn new(db: DatabaseConnection) -> Self {
        Self { db }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Transactional primitives
    // ──────────────────────────────────────────────────────────────────────────

    /// Generates next collision-safe sequential sales return number (e.g. SRET-000001)
    pub fn next_return_number_in_tx(conn: &Connection) -> DbResult<String> {
        conn.execute(
            "UPDATE counters SET value = value + 1 WHERE name = 'sales_return_number'",
            [],
        )
        .map_err(|e| DbError::QueryError(format!("Failed to increment sales_return_number counter: {e}")))?;

        let val: i64 = conn
            .query_row(
                "SELECT value FROM counters WHERE name = 'sales_return_number'",
                [],
                |row| row.get(0),
            )
            .map_err(|e| DbError::QueryError(format!("Failed to read sales_return_number counter: {e}")))?;

        Ok(format!("SRET-{:06}", val))
    }

    /// Inserts sales return header inside transaction
    pub fn insert_sales_return_in_tx(conn: &Connection, ret: &SalesReturn) -> DbResult<()> {
        conn.execute(
            "INSERT INTO sales_returns (
                id, return_number, sale_id, branch_id, customer_id, customer_name_snapshot,
                total_amount, refund_method, status, reason, notes, performed_by, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
            params![
                ret.id,
                ret.return_number,
                ret.sale_id,
                ret.branch_id,
                ret.customer_id,
                ret.customer_name_snapshot,
                ret.total_amount,
                ret.refund_method.as_str(),
                ret.status.as_str(),
                ret.reason,
                ret.notes,
                ret.performed_by,
                ret.created_at,
                ret.updated_at,
            ],
        )
        .map_err(|e| DbError::QueryError(format!("Failed to insert sales return: {e}")))?;

        Ok(())
    }

    /// Inserts multiple sales return lines inside transaction
    pub fn insert_sales_return_lines_in_tx(conn: &Connection, lines: &[SalesReturnLine]) -> DbResult<()> {
        let mut stmt = conn
            .prepare(
                "INSERT INTO sales_return_lines (
                    id, return_id, sale_line_id, product_id, product_name_snapshot,
                    sku_snapshot, unit_price, quantity, return_amount, created_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            )
            .map_err(|e| DbError::QueryError(format!("Failed to prepare sales return lines insert: {e}")))?;

        for line in lines {
            stmt.execute(params![
                line.id,
                line.return_id,
                line.sale_line_id,
                line.product_id,
                line.product_name_snapshot,
                line.sku_snapshot,
                line.unit_price,
                line.quantity,
                line.return_amount,
                line.created_at,
            ])
            .map_err(|e| DbError::QueryError(format!("Failed to execute sales return line insert: {e}")))?;
        }

        Ok(())
    }

    /// Queries total completed returned quantity for a specific sale line
    pub fn get_returned_quantity_for_sale_line_in_tx(conn: &Connection, sale_line_id: &str) -> DbResult<i64> {
        let returned: i64 = conn
            .query_row(
                "SELECT COALESCE(SUM(srl.quantity), 0)
                 FROM sales_return_lines srl
                 JOIN sales_returns sr ON sr.id = srl.return_id
                 WHERE srl.sale_line_id = ?1 AND sr.status = 'COMPLETED'",
                params![sale_line_id],
                |row| row.get(0),
            )
            .map_err(|e| DbError::QueryError(format!("Failed to query returned quantity for sale line: {e}")))?;

        Ok(returned)
    }

    /// Reads a sales return by ID inside transaction
    pub fn get_by_id_in_tx(conn: &Connection, id: &str) -> DbResult<Option<SalesReturn>> {
        let res = conn.query_row(
            "SELECT id, return_number, sale_id, branch_id, customer_id, customer_name_snapshot,
                    total_amount, refund_method, status, reason, notes, performed_by, created_at, updated_at
             FROM sales_returns WHERE id = ?1",
            params![id],
            |row| {
                let refund_method_str: String = row.get(7)?;
                let status_str: String = row.get(8)?;

                Ok(SalesReturn {
                    id: row.get(0)?,
                    return_number: row.get(1)?,
                    sale_id: row.get(2)?,
                    branch_id: row.get(3)?,
                    customer_id: row.get(4)?,
                    customer_name_snapshot: row.get(5)?,
                    total_amount: row.get(6)?,
                    refund_method: SalesRefundMethod::from_str(&refund_method_str)
                        .unwrap_or(SalesRefundMethod::Cash),
                    status: SalesReturnStatus::from_str(&status_str)
                        .unwrap_or(SalesReturnStatus::Completed),
                    reason: row.get(9)?,
                    notes: row.get(10)?,
                    performed_by: row.get(11)?,
                    created_at: row.get(12)?,
                    updated_at: row.get(13)?,
                })
            },
        );

        match res {
            Ok(ret) => Ok(Some(ret)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(DbError::QueryError(format!("Failed to get sales return by id: {e}"))),
        }
    }

    /// Reads lines for a sales return inside transaction
    pub fn get_lines_by_return_id_in_tx(conn: &Connection, return_id: &str) -> DbResult<Vec<SalesReturnLine>> {
        let mut stmt = conn
            .prepare(
                "SELECT id, return_id, sale_line_id, product_id, product_name_snapshot,
                        sku_snapshot, unit_price, quantity, return_amount, created_at
                 FROM sales_return_lines
                 WHERE return_id = ?1",
            )
            .map_err(|e| DbError::QueryError(format!("Failed to prepare sales return lines query: {e}")))?;

        let rows = stmt
            .query_map(params![return_id], |row| {
                Ok(SalesReturnLine {
                    id: row.get(0)?,
                    return_id: row.get(1)?,
                    sale_line_id: row.get(2)?,
                    product_id: row.get(3)?,
                    product_name_snapshot: row.get(4)?,
                    sku_snapshot: row.get(5)?,
                    unit_price: row.get(6)?,
                    quantity: row.get(7)?,
                    return_amount: row.get(8)?,
                    created_at: row.get(9)?,
                })
            })
            .map_err(|e| DbError::QueryError(format!("Failed to query sales return lines: {e}")))?;

        let mut lines = Vec::new();
        for r in rows {
            lines.push(r.map_err(|e| DbError::QueryError(format!("Error reading sales return line: {e}")))?);
        }

        Ok(lines)
    }

    /// Reads a complete SalesReturnDetailDto inside transaction
    pub fn get_detail_in_tx(conn: &Connection, id: &str) -> DbResult<Option<SalesReturnDetailDto>> {
        let ret = match Self::get_by_id_in_tx(conn, id)? {
            Some(r) => r,
            None => return Ok(None),
        };

        let lines = Self::get_lines_by_return_id_in_tx(conn, id)?;

        let invoice_number: String = conn
            .query_row(
                "SELECT invoice_number FROM sales WHERE id = ?1",
                params![ret.sale_id],
                |row| row.get(0),
            )
            .unwrap_or_else(|_| "UNKNOWN".to_string());

        Ok(Some(SalesReturnDetailDto {
            sales_return: ret,
            lines,
            invoice_number,
            customer_balance_after: None,
            cash_refunded: None,
        }))
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Async Repository APIs
    // ──────────────────────────────────────────────────────────────────────────

    pub async fn get_by_id(&self, id: &str) -> AppResult<Option<SalesReturnDetailDto>> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;
        Self::get_detail_in_tx(&guard, id).map_err(AppError::from)
    }

    pub async fn list_sales_returns(
        &self,
        branch_id: Option<&str>,
        limit: Option<i64>,
    ) -> AppResult<Vec<SalesReturnDetailDto>> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        let lim = limit.unwrap_or(100);
        let mut query = "SELECT id FROM sales_returns WHERE 1=1".to_string();
        let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

        if let Some(bid) = branch_id {
            query.push_str(" AND branch_id = ?");
            params_vec.push(Box::new(bid.to_string()));
        }

        query.push_str(" ORDER BY created_at DESC LIMIT ?");
        params_vec.push(Box::new(lim));

        let params_slice: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|b| b.as_ref()).collect();

        let mut stmt = guard
            .prepare(&query)
            .map_err(|e| DbError::QueryError(format!("Failed to prepare list sales returns query: {e}")))?;

        let ids: Vec<String> = stmt
            .query_map(params_slice.as_slice(), |row| row.get(0))
            .map_err(|e| DbError::QueryError(format!("Failed to execute list sales returns query: {e}")))?
            .filter_map(|r| r.ok())
            .collect();

        let mut results = Vec::with_capacity(ids.len());
        for id in ids {
            if let Some(detail) = Self::get_detail_in_tx(&guard, &id)? {
                results.push(detail);
            }
        }

        Ok(results)
    }

    pub async fn get_by_sale_id(&self, sale_id: &str) -> AppResult<Vec<SalesReturnDetailDto>> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        let mut stmt = guard
            .prepare("SELECT id FROM sales_returns WHERE sale_id = ?1 ORDER BY created_at DESC")
            .map_err(|e| DbError::QueryError(format!("Failed to prepare sales returns by sale query: {e}")))?;

        let ids: Vec<String> = stmt
            .query_map(params![sale_id], |row| row.get(0))
            .map_err(|e| DbError::QueryError(format!("Failed to query returns for sale: {e}")))?
            .filter_map(|r| r.ok())
            .collect();

        let mut results = Vec::with_capacity(ids.len());
        for id in ids {
            if let Some(detail) = Self::get_detail_in_tx(&guard, &id)? {
                results.push(detail);
            }
        }

        Ok(results)
    }
}
