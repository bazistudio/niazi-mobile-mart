use rusqlite::{params, Connection};

use crate::db::connection::DatabaseConnection;
use crate::db::errors::{DbError, DbResult};
use crate::domain::cash::{
    CashMovement, CashMovementDirection, CashMovementFilterDto, CashMovementType, CashSession,
    CashSessionStatus, DailyCashSummaryDto,
};
use crate::errors::{AppError, AppResult};

#[derive(Clone)]
pub struct SQLiteCashRepository {
    db: DatabaseConnection,
}

impl SQLiteCashRepository {
    pub fn new(db: DatabaseConnection) -> Self {
        Self { db }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Transactional primitives (usable inside `with_transaction`)
    // ──────────────────────────────────────────────────────────────────────────

    /// Returns the active OPEN session for a branch, if any
    pub fn get_open_session_in_tx(conn: &Connection, branch_id: &str) -> DbResult<Option<CashSession>> {
        let mut stmt = conn
            .prepare(
                "SELECT s.id, s.branch_id, b.name, s.business_date, s.opening_cash,
                        s.expected_closing_cash, s.actual_closing_cash, s.cash_variance,
                        s.status, s.opened_at, s.closed_at, s.opened_by, u1.name,
                        s.closed_by, u2.name, s.notes
                 FROM cash_sessions s
                 LEFT JOIN branches b ON s.branch_id = b.id
                 LEFT JOIN users u1 ON s.opened_by = u1.id
                 LEFT JOIN users u2 ON s.closed_by = u2.id
                 WHERE s.branch_id = ?1 AND s.status = 'OPEN'",
            )
            .map_err(|e| DbError::QueryError(format!("Failed to prepare get_open_session query: {e}")))?;

        let mut rows = stmt
            .query_map(params![branch_id], Self::map_session_row)
            .map_err(|e| DbError::QueryError(format!("Failed to execute get_open_session query: {e}")))?;

        match rows.next() {
            Some(Ok(s)) => Ok(Some(s)),
            Some(Err(e)) => Err(DbError::QueryError(format!("Error reading session row: {e}"))),
            None => Ok(None),
        }
    }

    /// Returns just the ID of the active OPEN session for a branch, if any
    pub fn get_open_session_id_in_tx(conn: &Connection, branch_id: &str) -> DbResult<Option<String>> {
        let mut stmt = conn
            .prepare("SELECT id FROM cash_sessions WHERE branch_id = ?1 AND status = 'OPEN'")
            .map_err(|e| DbError::QueryError(format!("Failed to prepare get_open_session_id: {e}")))?;

        let mut rows = stmt
            .query_map(params![branch_id], |r| r.get::<_, String>(0))
            .map_err(|e| DbError::QueryError(format!("Failed to query open session id: {e}")))?;

        match rows.next() {
            Some(Ok(id)) => Ok(Some(id)),
            Some(Err(e)) => Err(DbError::QueryError(format!("Error reading session id: {e}"))),
            None => Ok(None),
        }
    }

    /// Inserts a new cash session record inside an existing transaction
    pub fn insert_session_in_tx(conn: &Connection, s: &CashSession) -> DbResult<()> {
        conn.execute(
            "INSERT INTO cash_sessions (
                id, branch_id, business_date, opening_cash,
                expected_closing_cash, actual_closing_cash, cash_variance,
                status, opened_at, closed_at, opened_by, closed_by, notes
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
            params![
                s.id,
                s.branch_id,
                s.business_date,
                s.opening_cash,
                s.expected_closing_cash,
                s.actual_closing_cash,
                s.cash_variance,
                s.status.as_str(),
                s.opened_at,
                s.closed_at,
                s.opened_by,
                s.closed_by,
                s.notes,
            ],
        )
        .map_err(|e| {
            if let rusqlite::Error::SqliteFailure(err, msg) = &e {
                if err.code == rusqlite::ErrorCode::ConstraintViolation {
                    let msg_str = msg.as_deref().unwrap_or("");
                    if msg_str.contains("idx_one_open_session_per_branch") || msg_str.contains("UNIQUE") {
                        return DbError::ConstraintViolation(format!(
                            "An open cash session already exists for branch '{}'",
                            s.branch_id
                        ));
                    }
                }
            }
            DbError::QueryError(format!("Failed to insert cash session: {e}"))
        })?;

        Ok(())
    }

    /// Fetches a cash session by ID inside a transaction
    pub fn get_session_by_id_in_tx(conn: &Connection, id: &str) -> DbResult<Option<CashSession>> {
        let mut stmt = conn
            .prepare(
                "SELECT s.id, s.branch_id, b.name, s.business_date, s.opening_cash,
                        s.expected_closing_cash, s.actual_closing_cash, s.cash_variance,
                        s.status, s.opened_at, s.closed_at, s.opened_by, u1.name,
                        s.closed_by, u2.name, s.notes
                 FROM cash_sessions s
                 LEFT JOIN branches b ON s.branch_id = b.id
                 LEFT JOIN users u1 ON s.opened_by = u1.id
                 LEFT JOIN users u2 ON s.closed_by = u2.id
                 WHERE s.id = ?1",
            )
            .map_err(|e| DbError::QueryError(format!("Failed to prepare get_session_by_id query: {e}")))?;

        let mut rows = stmt
            .query_map(params![id], Self::map_session_row)
            .map_err(|e| DbError::QueryError(format!("Failed to query session by id: {e}")))?;

        match rows.next() {
            Some(Ok(s)) => Ok(Some(s)),
            Some(Err(e)) => Err(DbError::QueryError(format!("Error reading session: {e}"))),
            None => Ok(None),
        }
    }

    /// Closes a cash session with calculated expected cash, actual count, and variance
    pub fn close_session_in_tx(
        conn: &Connection,
        id: &str,
        expected: i64,
        actual: i64,
        variance: i64,
        closed_by: Option<&str>,
        closed_at: &str,
        notes: Option<&str>,
    ) -> DbResult<()> {
        let rows = conn
            .execute(
                "UPDATE cash_sessions
                 SET expected_closing_cash = ?1,
                     actual_closing_cash = ?2,
                     cash_variance = ?3,
                     status = 'CLOSED',
                     closed_at = ?4,
                     closed_by = ?5,
                     notes = COALESCE(?6, notes)
                 WHERE id = ?7 AND status = 'OPEN'",
                params![expected, actual, variance, closed_at, closed_by, notes, id],
            )
            .map_err(|e| DbError::QueryError(format!("Failed to close cash session: {e}")))?;

        if rows == 0 {
            return Err(DbError::NotFound(format!(
                "Cash session '{id}' not found or already closed"
            )));
        }

        Ok(())
    }

    /// Inserts an append-only cash movement inside a transaction
    pub fn insert_movement_in_tx(conn: &Connection, m: &CashMovement) -> DbResult<()> {
        conn.execute(
            "INSERT INTO cash_movements (
                id, session_id, branch_id, movement_type, direction, amount,
                reference_id, reference_number, payment_method, description,
                performed_by, created_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            params![
                m.id,
                m.session_id,
                m.branch_id,
                m.movement_type.as_str(),
                m.direction.as_str(),
                m.amount,
                m.reference_id,
                m.reference_number,
                m.payment_method,
                m.description,
                m.performed_by,
                m.created_at,
            ],
        )
        .map_err(|e| DbError::QueryError(format!("Failed to insert cash movement: {e}")))?;

        Ok(())
    }

    /// Calculates operational cash summary for a specific session inside a transaction
    pub fn calculate_session_summary_in_tx(
        conn: &Connection,
        session_id: &str,
    ) -> DbResult<DailyCashSummaryDto> {
        // Fetch session
        let session = Self::get_session_by_id_in_tx(conn, session_id)?
            .ok_or_else(|| DbError::NotFound(format!("Cash session '{session_id}' not found")))?;

        let mut stmt = conn
            .prepare(
                "SELECT movement_type, direction, COALESCE(SUM(amount), 0)
                 FROM cash_movements
                 WHERE session_id = ?1
                 GROUP BY movement_type, direction",
            )
            .map_err(|e| DbError::QueryError(format!("Failed to prepare summary query: {e}")))?;

        let rows = stmt
            .query_map(params![session_id], |r| {
                let m_type: String = r.get(0)?;
                let dir: String = r.get(1)?;
                let total: i64 = r.get(2)?;
                Ok((m_type, dir, total))
            })
            .map_err(|e| DbError::QueryError(format!("Failed to execute summary query: {e}")))?;

        let mut cash_sales: i64 = 0;
        let mut customer_payments: i64 = 0;
        let mut supplier_payments: i64 = 0;
        let mut cash_expenses: i64 = 0;
        let mut cash_adjustments_net: i64 = 0;
        let mut total_cash_in: i64 = 0;
        let mut total_cash_out: i64 = 0;

        for r in rows {
            let (m_type, dir, amount) =
                r.map_err(|e| DbError::QueryError(format!("Error reading summary row: {e}")))?;

            if dir == "IN" {
                total_cash_in += amount;
            } else if dir == "OUT" {
                total_cash_out += amount;
            }

            match m_type.as_str() {
                "SALE_PAYMENT" => {
                    if dir == "IN" {
                        cash_sales += amount;
                    } else {
                        cash_sales -= amount;
                    }
                }
                "CUSTOMER_PAYMENT" => {
                    if dir == "IN" {
                        customer_payments += amount;
                    } else {
                        customer_payments -= amount;
                    }
                }
                "SUPPLIER_PAYMENT" => {
                    if dir == "OUT" {
                        supplier_payments += amount;
                    } else {
                        supplier_payments -= amount;
                    }
                }
                "EXPENSE" => {
                    if dir == "OUT" {
                        cash_expenses += amount;
                    } else {
                        // Reversal of expense adds back / reduces expense
                        cash_expenses -= amount;
                    }
                }
                "CASH_ADJUSTMENT" => {
                    if dir == "IN" {
                        cash_adjustments_net += amount;
                    } else {
                        cash_adjustments_net -= amount;
                    }
                }
                _ => {}
            }
        }

        let expected_closing_cash = session.opening_cash + total_cash_in - total_cash_out;
        let variance = session.actual_closing_cash.map(|actual| actual - expected_closing_cash);

        Ok(DailyCashSummaryDto {
            business_date: session.business_date,
            session_id: Some(session.id),
            session_status: Some(session.status.as_str().to_string()),
            opening_cash: session.opening_cash,
            cash_sales,
            customer_payments,
            supplier_payments,
            cash_expenses,
            cash_adjustments: cash_adjustments_net,
            total_cash_in,
            total_cash_out,
            expected_closing_cash,
            actual_closing_cash: session.actual_closing_cash,
            variance: session.cash_variance.or(variance),
        })
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Async Repository methods
    // ──────────────────────────────────────────────────────────────────────────

    pub async fn get_open_session(&self, branch_id: &str) -> AppResult<Option<CashSession>> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;
        Ok(Self::get_open_session_in_tx(&guard, branch_id)?)
    }

    pub async fn get_session_by_id(&self, id: &str) -> AppResult<Option<CashSession>> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;
        Ok(Self::get_session_by_id_in_tx(&guard, id)?)
    }

    pub async fn list_sessions(
        &self,
        branch_id: Option<&str>,
        limit: Option<i64>,
        offset: Option<i64>,
    ) -> AppResult<Vec<CashSession>> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        let mut sql = String::from(
            "SELECT s.id, s.branch_id, b.name, s.business_date, s.opening_cash,
                    s.expected_closing_cash, s.actual_closing_cash, s.cash_variance,
                    s.status, s.opened_at, s.closed_at, s.opened_by, u1.name,
                    s.closed_by, u2.name, s.notes
             FROM cash_sessions s
             LEFT JOIN branches b ON s.branch_id = b.id
             LEFT JOIN users u1 ON s.opened_by = u1.id
             LEFT JOIN users u2 ON s.closed_by = u2.id
             WHERE 1=1",
        );

        let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

        if let Some(bid) = branch_id {
            sql.push_str(" AND s.branch_id = ?");
            params_vec.push(Box::new(bid.to_string()));
        }

        sql.push_str(" ORDER BY s.opened_at DESC");

        let lim = limit.unwrap_or(30).max(1);
        let off = offset.unwrap_or(0).max(0);
        sql.push_str(&format!(" LIMIT {lim} OFFSET {off}"));

        let mut stmt = guard
            .prepare(&sql)
            .map_err(|e| AppError::Database(format!("Failed to prepare query: {e}")))?;

        let rusqlite_params: Vec<&dyn rusqlite::ToSql> =
            params_vec.iter().map(|p| p.as_ref()).collect();

        let rows = stmt
            .query_map(rusqlite_params.as_slice(), Self::map_session_row)
            .map_err(|e| AppError::Database(format!("Failed to execute list_sessions: {e}")))?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r.map_err(|e| AppError::Database(format!("Row error: {e}")))?)
        }

        Ok(list)
    }

    pub async fn list_movements(&self, filter: &CashMovementFilterDto) -> AppResult<Vec<CashMovement>> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        let mut sql = String::from(
            "SELECT m.id, m.session_id, m.branch_id, m.movement_type, m.direction,
                    m.amount, m.reference_id, m.reference_number, m.payment_method,
                    m.description, m.performed_by, u.name, m.created_at
             FROM cash_movements m
             LEFT JOIN users u ON m.performed_by = u.id
             WHERE 1=1",
        );

        let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

        if let Some(ref sid) = filter.session_id {
            sql.push_str(" AND m.session_id = ?");
            params_vec.push(Box::new(sid.clone()));
        }

        if let Some(ref bid) = filter.branch_id {
            sql.push_str(" AND m.branch_id = ?");
            params_vec.push(Box::new(bid.clone()));
        }

        if let Some(ref mtype) = filter.movement_type {
            sql.push_str(" AND m.movement_type = ?");
            params_vec.push(Box::new(mtype.clone()));
        }

        if let Some(ref dir) = filter.direction {
            sql.push_str(" AND m.direction = ?");
            params_vec.push(Box::new(dir.clone()));
        }

        if let Some(ref start) = filter.start_date {
            sql.push_str(" AND m.created_at >= ?");
            params_vec.push(Box::new(start.clone()));
        }

        if let Some(ref end) = filter.end_date {
            sql.push_str(" AND m.created_at <= ?");
            params_vec.push(Box::new(end.clone()));
        }

        sql.push_str(" ORDER BY m.created_at DESC");

        let lim = filter.limit.unwrap_or(50).max(1);
        let off = filter.offset.unwrap_or(0).max(0);
        sql.push_str(&format!(" LIMIT {lim} OFFSET {off}"));

        let mut stmt = guard
            .prepare(&sql)
            .map_err(|e| AppError::Database(format!("Failed to prepare query: {e}")))?;

        let rusqlite_params: Vec<&dyn rusqlite::ToSql> =
            params_vec.iter().map(|p| p.as_ref()).collect();

        let rows = stmt
            .query_map(rusqlite_params.as_slice(), |r| {
                let m_type_str: String = r.get(3)?;
                let m_type = CashMovementType::from_str(&m_type_str).unwrap_or(CashMovementType::CashAdjustment);
                let dir_str: String = r.get(4)?;
                let dir = CashMovementDirection::from_str(&dir_str).unwrap_or(CashMovementDirection::In);

                Ok(CashMovement {
                    id: r.get(0)?,
                    session_id: r.get(1)?,
                    branch_id: r.get(2)?,
                    movement_type: m_type,
                    direction: dir,
                    amount: r.get(5)?,
                    reference_id: r.get(6)?,
                    reference_number: r.get(7)?,
                    payment_method: r.get(8)?,
                    description: r.get(9)?,
                    performed_by: r.get(10)?,
                    performed_by_name: r.get(11)?,
                    created_at: r.get(12)?,
                })
            })
            .map_err(|e| AppError::Database(format!("Failed to execute list_movements: {e}")))?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r.map_err(|e| AppError::Database(format!("Row error: {e}")))?)
        }

        Ok(list)
    }

    pub async fn get_daily_summary(
        &self,
        branch_id: &str,
        date: &str,
    ) -> AppResult<DailyCashSummaryDto> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        // Check if there's a session for this business_date & branch
        let mut stmt = guard
            .prepare(
                "SELECT id FROM cash_sessions WHERE branch_id = ?1 AND business_date = ?2
                 ORDER BY opened_at DESC LIMIT 1",
            )
            .map_err(|e| AppError::Database(format!("Failed to prepare session lookup: {e}")))?;

        let session_id_opt: Option<String> = stmt
            .query_row(params![branch_id, date], |r| r.get(0))
            .ok();

        if let Some(session_id) = session_id_opt {
            return Ok(Self::calculate_session_summary_in_tx(&guard, &session_id)?);
        }

        // If no session exists for this date, aggregate movements directly for branch & date
        let start_ts = format!("{date}T00:00:00Z");
        let end_ts = format!("{date}T23:59:59Z");

        let mut stmt = guard
            .prepare(
                "SELECT movement_type, direction, COALESCE(SUM(amount), 0)
                 FROM cash_movements
                 WHERE branch_id = ?1 AND created_at >= ?2 AND created_at <= ?3
                 GROUP BY movement_type, direction",
            )
            .map_err(|e| AppError::Database(format!("Failed to prepare query: {e}")))?;

        let rows = stmt
            .query_map(params![branch_id, start_ts, end_ts], |r| {
                let m_type: String = r.get(0)?;
                let dir: String = r.get(1)?;
                let total: i64 = r.get(2)?;
                Ok((m_type, dir, total))
            })
            .map_err(|e| AppError::Database(format!("Failed to execute query: {e}")))?;

        let mut cash_sales: i64 = 0;
        let mut customer_payments: i64 = 0;
        let mut supplier_payments: i64 = 0;
        let mut cash_expenses: i64 = 0;
        let mut cash_adjustments_net: i64 = 0;
        let mut total_cash_in: i64 = 0;
        let mut total_cash_out: i64 = 0;

        for r in rows {
            let (m_type, dir, amount) =
                r.map_err(|e| AppError::Database(format!("Error reading row: {e}")))?;

            if dir == "IN" {
                total_cash_in += amount;
            } else if dir == "OUT" {
                total_cash_out += amount;
            }

            match m_type.as_str() {
                "SALE_PAYMENT" => {
                    if dir == "IN" {
                        cash_sales += amount;
                    } else {
                        cash_sales -= amount;
                    }
                }
                "CUSTOMER_PAYMENT" => {
                    if dir == "IN" {
                        customer_payments += amount;
                    } else {
                        customer_payments -= amount;
                    }
                }
                "SUPPLIER_PAYMENT" => {
                    if dir == "OUT" {
                        supplier_payments += amount;
                    } else {
                        supplier_payments -= amount;
                    }
                }
                "EXPENSE" => {
                    if dir == "OUT" {
                        cash_expenses += amount;
                    } else {
                        cash_expenses -= amount;
                    }
                }
                "CASH_ADJUSTMENT" => {
                    if dir == "IN" {
                        cash_adjustments_net += amount;
                    } else {
                        cash_adjustments_net -= amount;
                    }
                }
                _ => {}
            }
        }

        Ok(DailyCashSummaryDto {
            business_date: date.to_string(),
            session_id: None,
            session_status: None,
            opening_cash: 0,
            cash_sales,
            customer_payments,
            supplier_payments,
            cash_expenses,
            cash_adjustments: cash_adjustments_net,
            total_cash_in,
            total_cash_out,
            expected_closing_cash: total_cash_in - total_cash_out,
            actual_closing_cash: None,
            variance: None,
        })
    }

    fn map_session_row(row: &rusqlite::Row) -> rusqlite::Result<CashSession> {
        let status_str: String = row.get(8)?;
        let status = CashSessionStatus::from_str(&status_str).unwrap_or(CashSessionStatus::Open);

        Ok(CashSession {
            id: row.get(0)?,
            branch_id: row.get(1)?,
            branch_name: row.get(2)?,
            business_date: row.get(3)?,
            opening_cash: row.get(4)?,
            expected_closing_cash: row.get(5)?,
            actual_closing_cash: row.get(6)?,
            cash_variance: row.get(7)?,
            status,
            opened_at: row.get(9)?,
            closed_at: row.get(10)?,
            opened_by: row.get(11)?,
            opened_by_name: row.get(12)?,
            closed_by: row.get(13)?,
            closed_by_name: row.get(14)?,
            notes: row.get(15)?,
        })
    }
}
