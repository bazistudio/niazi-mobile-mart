use rusqlite::{params, Connection};

use crate::db::connection::DatabaseConnection;
use crate::db::errors::{DbError, DbResult};
use crate::domain::purchase_return::{
    PurchaseReturn, PurchaseReturnDetailDto, PurchaseReturnLine, PurchaseReturnStatus,
    PurchaseSettlementMethod,
};
use crate::errors::{AppError, AppResult};

#[derive(Clone)]
pub struct SQLitePurchaseReturnRepository {
    db: DatabaseConnection,
}

impl SQLitePurchaseReturnRepository {
    pub fn new(db: DatabaseConnection) -> Self {
        Self { db }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Transactional primitives
    // ──────────────────────────────────────────────────────────────────────────

    /// Generates next collision-safe sequential purchase return number (e.g. PRET-000001)
    pub fn next_return_number_in_tx(conn: &Connection) -> DbResult<String> {
        conn.execute(
            "UPDATE counters SET value = value + 1 WHERE name = 'purchase_return_number'",
            [],
        )
        .map_err(|e| DbError::QueryError(format!("Failed to increment purchase_return_number counter: {e}")))?;

        let val: i64 = conn
            .query_row(
                "SELECT value FROM counters WHERE name = 'purchase_return_number'",
                [],
                |row| row.get(0),
            )
            .map_err(|e| DbError::QueryError(format!("Failed to read purchase_return_number counter: {e}")))?;

        Ok(format!("PRET-{:06}", val))
    }

    /// Inserts purchase return header inside transaction
    pub fn insert_purchase_return_in_tx(conn: &Connection, ret: &PurchaseReturn) -> DbResult<()> {
        conn.execute(
            "INSERT INTO purchase_returns (
                id, return_number, purchase_id, branch_id, supplier_id, supplier_name_snapshot,
                total_amount, settlement_method, status, reason, notes, performed_by, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
            params![
                ret.id,
                ret.return_number,
                ret.purchase_id,
                ret.branch_id,
                ret.supplier_id,
                ret.supplier_name_snapshot,
                ret.total_amount,
                ret.settlement_method.as_str(),
                ret.status.as_str(),
                ret.reason,
                ret.notes,
                ret.performed_by,
                ret.created_at,
                ret.updated_at,
            ],
        )
        .map_err(|e| DbError::QueryError(format!("Failed to insert purchase return: {e}")))?;

        Ok(())
    }

    /// Inserts multiple purchase return lines inside transaction
    pub fn insert_purchase_return_lines_in_tx(
        conn: &Connection,
        lines: &[PurchaseReturnLine],
    ) -> DbResult<()> {
        let mut stmt = conn
            .prepare(
                "INSERT INTO purchase_return_lines (
                    id, return_id, purchase_line_id, product_id, product_name_snapshot,
                    sku_snapshot, unit_cost, quantity, return_amount, created_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            )
            .map_err(|e| DbError::QueryError(format!("Failed to prepare purchase return lines insert: {e}")))?;

        for line in lines {
            stmt.execute(params![
                line.id,
                line.return_id,
                line.purchase_line_id,
                line.product_id,
                line.product_name_snapshot,
                line.sku_snapshot,
                line.unit_cost,
                line.quantity,
                line.return_amount,
                line.created_at,
            ])
            .map_err(|e| DbError::QueryError(format!("Failed to execute purchase return line insert: {e}")))?;
        }

        Ok(())
    }

    /// Queries total completed returned quantity for a specific purchase line
    pub fn get_returned_quantity_for_purchase_line_in_tx(
        conn: &Connection,
        purchase_line_id: &str,
    ) -> DbResult<i64> {
        let returned: i64 = conn
            .query_row(
                "SELECT COALESCE(SUM(prl.quantity), 0)
                 FROM purchase_return_lines prl
                 JOIN purchase_returns pr ON pr.id = prl.return_id
                 WHERE prl.purchase_line_id = ?1 AND pr.status = 'COMPLETED'",
                params![purchase_line_id],
                |row| row.get(0),
            )
            .map_err(|e| DbError::QueryError(format!("Failed to query returned quantity for purchase line: {e}")))?;

        Ok(returned)
    }

    /// Reads a purchase return by ID inside transaction
    pub fn get_by_id_in_tx(conn: &Connection, id: &str) -> DbResult<Option<PurchaseReturn>> {
        let res = conn.query_row(
            "SELECT id, return_number, purchase_id, branch_id, supplier_id, supplier_name_snapshot,
                    total_amount, settlement_method, status, reason, notes, performed_by, created_at, updated_at
             FROM purchase_returns WHERE id = ?1",
            params![id],
            |row| {
                let settlement_method_str: String = row.get(7)?;
                let status_str: String = row.get(8)?;

                Ok(PurchaseReturn {
                    id: row.get(0)?,
                    return_number: row.get(1)?,
                    purchase_id: row.get(2)?,
                    branch_id: row.get(3)?,
                    supplier_id: row.get(4)?,
                    supplier_name_snapshot: row.get(5)?,
                    total_amount: row.get(6)?,
                    settlement_method: PurchaseSettlementMethod::from_str(&settlement_method_str)
                        .unwrap_or(PurchaseSettlementMethod::Cash),
                    status: PurchaseReturnStatus::from_str(&status_str)
                        .unwrap_or(PurchaseReturnStatus::Completed),
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
            Err(e) => Err(DbError::QueryError(format!("Failed to get purchase return by id: {e}"))),
        }
    }

    /// Reads lines for a purchase return inside transaction
    pub fn get_lines_by_return_id_in_tx(
        conn: &Connection,
        return_id: &str,
    ) -> DbResult<Vec<PurchaseReturnLine>> {
        let mut stmt = conn
            .prepare(
                "SELECT id, return_id, purchase_line_id, product_id, product_name_snapshot,
                        sku_snapshot, unit_cost, quantity, return_amount, created_at
                 FROM purchase_return_lines
                 WHERE return_id = ?1",
            )
            .map_err(|e| DbError::QueryError(format!("Failed to prepare purchase return lines query: {e}")))?;

        let rows = stmt
            .query_map(params![return_id], |row| {
                Ok(PurchaseReturnLine {
                    id: row.get(0)?,
                    return_id: row.get(1)?,
                    purchase_line_id: row.get(2)?,
                    product_id: row.get(3)?,
                    product_name_snapshot: row.get(4)?,
                    sku_snapshot: row.get(5)?,
                    unit_cost: row.get(6)?,
                    quantity: row.get(7)?,
                    return_amount: row.get(8)?,
                    created_at: row.get(9)?,
                })
            })
            .map_err(|e| DbError::QueryError(format!("Failed to query purchase return lines: {e}")))?;

        let mut lines = Vec::new();
        for r in rows {
            lines.push(r.map_err(|e| DbError::QueryError(format!("Error reading purchase return line: {e}")))?);
        }

        Ok(lines)
    }

    /// Reads a complete PurchaseReturnDetailDto inside transaction
    pub fn get_detail_in_tx(conn: &Connection, id: &str) -> DbResult<Option<PurchaseReturnDetailDto>> {
        let ret = match Self::get_by_id_in_tx(conn, id)? {
            Some(r) => r,
            None => return Ok(None),
        };

        let lines = Self::get_lines_by_return_id_in_tx(conn, id)?;

        let purchase_number: String = conn
            .query_row(
                "SELECT purchase_number FROM purchases WHERE id = ?1",
                params![ret.purchase_id],
                |row| row.get(0),
            )
            .unwrap_or_else(|_| "UNKNOWN".to_string());

        Ok(Some(PurchaseReturnDetailDto {
            purchase_return: ret,
            lines,
            purchase_number,
            supplier_payable_after: None,
            cash_settled: None,
        }))
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Async Repository APIs
    // ──────────────────────────────────────────────────────────────────────────

    pub async fn get_by_id(&self, id: &str) -> AppResult<Option<PurchaseReturnDetailDto>> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;
        Self::get_detail_in_tx(&guard, id).map_err(AppError::from)
    }

    pub async fn list_purchase_returns(
        &self,
        branch_id: Option<&str>,
        limit: Option<i64>,
    ) -> AppResult<Vec<PurchaseReturnDetailDto>> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        let lim = limit.unwrap_or(100);
        let mut query = "SELECT id FROM purchase_returns WHERE 1=1".to_string();
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
            .map_err(|e| DbError::QueryError(format!("Failed to prepare list purchase returns query: {e}")))?;

        let ids: Vec<String> = stmt
            .query_map(params_slice.as_slice(), |row| row.get(0))
            .map_err(|e| DbError::QueryError(format!("Failed to execute list purchase returns query: {e}")))?
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

    pub async fn get_by_purchase_id(&self, purchase_id: &str) -> AppResult<Vec<PurchaseReturnDetailDto>> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        let mut stmt = guard
            .prepare("SELECT id FROM purchase_returns WHERE purchase_id = ?1 ORDER BY created_at DESC")
            .map_err(|e| DbError::QueryError(format!("Failed to prepare purchase returns by purchase query: {e}")))?;

        let ids: Vec<String> = stmt
            .query_map(params![purchase_id], |row| row.get(0))
            .map_err(|e| DbError::QueryError(format!("Failed to query returns for purchase: {e}")))?
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
