use rusqlite::{params, Connection};

use crate::db::connection::DatabaseConnection;
use crate::db::errors::{DbError, DbResult};
use crate::domain::purchases::{
    Purchase, PurchaseFilterDto, PurchaseLine, PurchasePaymentStatus, PurchaseStatus,
};
use crate::errors::{AppError, AppResult};

#[derive(Clone)]
pub struct SQLitePurchaseRepository {
    db: DatabaseConnection,
}

impl SQLitePurchaseRepository {
    pub fn new(db: DatabaseConnection) -> Self {
        Self { db }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Transactional primitives (usable inside `with_transaction`)
    // ──────────────────────────────────────────────────────────────────────────

    /// Generates next sequential purchase number atomically (e.g. PUR-000001)
    pub fn next_purchase_number_in_tx(conn: &Connection) -> DbResult<String> {
        conn.execute(
            "UPDATE counters SET value = value + 1 WHERE name = 'purchase_number'",
            [],
        )
        .map_err(|e| DbError::QueryError(format!("Failed to increment purchase_number counter: {e}")))?;

        let val: i64 = conn
            .query_row(
                "SELECT value FROM counters WHERE name = 'purchase_number'",
                [],
                |row| row.get(0),
            )
            .map_err(|e| DbError::QueryError(format!("Failed to read purchase_number counter: {e}")))?;

        Ok(format!("PUR-{:06}", val))
    }

    /// Inserts a purchase header inside transaction
    pub fn insert_purchase_in_tx(conn: &Connection, purchase: &Purchase) -> DbResult<()> {
        conn.execute(
            "INSERT INTO purchases (
                id, purchase_number, supplier_id, branch_id, subtotal, discount,
                total_amount, paid_amount, credit_amount, payment_status, status,
                notes, performed_by, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
            params![
                purchase.id,
                purchase.purchase_number,
                purchase.supplier_id,
                purchase.branch_id,
                purchase.subtotal,
                purchase.discount,
                purchase.total_amount,
                purchase.paid_amount,
                purchase.credit_amount,
                purchase.payment_status.as_str(),
                purchase.status.as_str(),
                purchase.notes.as_deref(),
                purchase.performed_by.as_deref(),
                purchase.created_at,
                purchase.updated_at,
            ],
        )
        .map_err(|e| DbError::QueryError(format!("Failed to insert purchase: {e}")))?;

        Ok(())
    }

    /// Inserts purchase lines inside transaction
    pub fn insert_purchase_lines_in_tx(conn: &Connection, lines: &[PurchaseLine]) -> DbResult<()> {
        let mut stmt = conn
            .prepare(
                "INSERT INTO purchase_lines (
                    id, purchase_id, product_id, product_name_snapshot, sku_snapshot,
                    quantity, unit_cost, discount, line_total, created_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            )
            .map_err(|e| DbError::QueryError(format!("Failed to prepare purchase_lines insert: {e}")))?;

        for line in lines {
            stmt.execute(params![
                line.id,
                line.purchase_id,
                line.product_id,
                line.product_name_snapshot,
                line.sku_snapshot,
                line.quantity,
                line.unit_cost,
                line.discount,
                line.line_total,
                line.created_at,
            ])
            .map_err(|e| DbError::QueryError(format!("Failed to insert purchase line: {e}")))?;
        }

        Ok(())
    }

    /// Reads a purchase header by ID inside transaction
    pub fn get_by_id_in_tx(conn: &Connection, id: &str) -> DbResult<Option<Purchase>> {
        let res = conn.query_row(
            "SELECT id, purchase_number, supplier_id, branch_id, subtotal, discount,
                    total_amount, paid_amount, credit_amount, payment_status, status,
                    notes, performed_by, created_at, updated_at
             FROM purchases WHERE id = ?1",
            params![id],
            |row| {
                let pay_str: String = row.get(9)?;
                let status_str: String = row.get(10)?;

                Ok(Purchase {
                    id: row.get(0)?,
                    purchase_number: row.get(1)?,
                    supplier_id: row.get(2)?,
                    branch_id: row.get(3)?,
                    subtotal: row.get(4)?,
                    discount: row.get(5)?,
                    total_amount: row.get(6)?,
                    paid_amount: row.get(7)?,
                    credit_amount: row.get(8)?,
                    payment_status: PurchasePaymentStatus::from_str(&pay_str)
                        .unwrap_or(PurchasePaymentStatus::Unpaid),
                    status: PurchaseStatus::from_str(&status_str).unwrap_or(PurchaseStatus::Completed),
                    notes: row.get(11)?,
                    performed_by: row.get(12)?,
                    created_at: row.get(13)?,
                    updated_at: row.get(14)?,
                })
            },
        );

        match res {
            Ok(p) => Ok(Some(p)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(DbError::QueryError(format!("Failed to query purchase by id: {e}"))),
        }
    }

    /// Reads lines for a purchase inside transaction
    pub fn get_purchase_lines_in_tx(conn: &Connection, purchase_id: &str) -> DbResult<Vec<PurchaseLine>> {
        let mut stmt = conn
            .prepare(
                "SELECT id, purchase_id, product_id, product_name_snapshot, sku_snapshot,
                        quantity, unit_cost, discount, line_total, created_at
                 FROM purchase_lines WHERE purchase_id = ?1 ORDER BY created_at ASC, id ASC",
            )
            .map_err(|e| DbError::QueryError(format!("Failed to prepare purchase lines query: {e}")))?;

        let rows = stmt
            .query_map(params![purchase_id], |row| {
                Ok(PurchaseLine {
                    id: row.get(0)?,
                    purchase_id: row.get(1)?,
                    product_id: row.get(2)?,
                    product_name_snapshot: row.get(3)?,
                    sku_snapshot: row.get(4)?,
                    quantity: row.get(5)?,
                    unit_cost: row.get(6)?,
                    discount: row.get(7)?,
                    line_total: row.get(8)?,
                    created_at: row.get(9)?,
                })
            })
            .map_err(|e| DbError::QueryError(format!("Failed to query purchase lines: {e}")))?;

        let mut lines = Vec::new();
        for r in rows {
            lines.push(r.map_err(|e| DbError::QueryError(format!("Error reading purchase line: {e}")))?);
        }

        Ok(lines)
    }

    /// Retrieves all unpaid or partially paid purchases for a supplier, ordered FIFO (created_at ASC)
    pub fn get_unpaid_or_partial_purchases_in_tx(
        conn: &Connection,
        supplier_id: &str,
    ) -> DbResult<Vec<Purchase>> {
        let mut stmt = conn
            .prepare(
                "SELECT id, purchase_number, supplier_id, branch_id, subtotal, discount,
                        total_amount, paid_amount, credit_amount, payment_status, status,
                        notes, performed_by, created_at, updated_at
                 FROM purchases
                 WHERE supplier_id = ?1
                   AND status = 'COMPLETED'
                   AND payment_status IN ('UNPAID', 'PARTIALLY_PAID')
                 ORDER BY created_at ASC, purchase_number ASC",
            )
            .map_err(|e| DbError::QueryError(format!("Failed to prepare FIFO purchases query: {e}")))?;

        let rows = stmt
            .query_map(params![supplier_id], |row| {
                let pay_str: String = row.get(9)?;
                let status_str: String = row.get(10)?;

                Ok(Purchase {
                    id: row.get(0)?,
                    purchase_number: row.get(1)?,
                    supplier_id: row.get(2)?,
                    branch_id: row.get(3)?,
                    subtotal: row.get(4)?,
                    discount: row.get(5)?,
                    total_amount: row.get(6)?,
                    paid_amount: row.get(7)?,
                    credit_amount: row.get(8)?,
                    payment_status: PurchasePaymentStatus::from_str(&pay_str)
                        .unwrap_or(PurchasePaymentStatus::Unpaid),
                    status: PurchaseStatus::from_str(&status_str).unwrap_or(PurchaseStatus::Completed),
                    notes: row.get(11)?,
                    performed_by: row.get(12)?,
                    created_at: row.get(13)?,
                    updated_at: row.get(14)?,
                })
            })
            .map_err(|e| DbError::QueryError(e.to_string()))?;

        let mut purchases = Vec::new();
        for r in rows {
            purchases.push(r.map_err(|e| DbError::QueryError(e.to_string()))?);
        }

        Ok(purchases)
    }

    /// Updates paid_amount, credit_amount, and payment_status on a purchase inside transaction
    pub fn update_purchase_payment_in_tx(
        conn: &Connection,
        purchase_id: &str,
        new_paid: i64,
        new_credit: i64,
        new_status: PurchasePaymentStatus,
        now: &str,
    ) -> DbResult<()> {
        conn.execute(
            "UPDATE purchases SET paid_amount = ?1, credit_amount = ?2, payment_status = ?3, updated_at = ?4 WHERE id = ?5",
            params![new_paid, new_credit, new_status.as_str(), now, purchase_id],
        )
        .map_err(|e| DbError::QueryError(format!("Failed to update purchase payment: {e}")))?;

        Ok(())
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Async Repository APIs
    // ──────────────────────────────────────────────────────────────────────────

    pub async fn get_by_id(&self, id: &str) -> AppResult<Option<Purchase>> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        let res = guard.query_row(
            "SELECT id, purchase_number, supplier_id, branch_id, subtotal, discount,
                    total_amount, paid_amount, credit_amount, payment_status, status,
                    notes, performed_by, created_at, updated_at
             FROM purchases WHERE id = ?1",
            params![id],
            |row| {
                let pay_str: String = row.get(9)?;
                let status_str: String = row.get(10)?;

                Ok(Purchase {
                    id: row.get(0)?,
                    purchase_number: row.get(1)?,
                    supplier_id: row.get(2)?,
                    branch_id: row.get(3)?,
                    subtotal: row.get(4)?,
                    discount: row.get(5)?,
                    total_amount: row.get(6)?,
                    paid_amount: row.get(7)?,
                    credit_amount: row.get(8)?,
                    payment_status: PurchasePaymentStatus::from_str(&pay_str)
                        .unwrap_or(PurchasePaymentStatus::Unpaid),
                    status: PurchaseStatus::from_str(&status_str).unwrap_or(PurchaseStatus::Completed),
                    notes: row.get(11)?,
                    performed_by: row.get(12)?,
                    created_at: row.get(13)?,
                    updated_at: row.get(14)?,
                })
            },
        );

        match res {
            Ok(p) => Ok(Some(p)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(AppError::Database(format!("Failed to query purchase by id: {e}"))),
        }
    }

    pub async fn get_by_number(&self, purchase_number: &str) -> AppResult<Option<Purchase>> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        let res = guard.query_row(
            "SELECT id, purchase_number, supplier_id, branch_id, subtotal, discount,
                    total_amount, paid_amount, credit_amount, payment_status, status,
                    notes, performed_by, created_at, updated_at
             FROM purchases WHERE purchase_number = ?1",
            params![purchase_number],
            |row| {
                let pay_str: String = row.get(9)?;
                let status_str: String = row.get(10)?;

                Ok(Purchase {
                    id: row.get(0)?,
                    purchase_number: row.get(1)?,
                    supplier_id: row.get(2)?,
                    branch_id: row.get(3)?,
                    subtotal: row.get(4)?,
                    discount: row.get(5)?,
                    total_amount: row.get(6)?,
                    paid_amount: row.get(7)?,
                    credit_amount: row.get(8)?,
                    payment_status: PurchasePaymentStatus::from_str(&pay_str)
                        .unwrap_or(PurchasePaymentStatus::Unpaid),
                    status: PurchaseStatus::from_str(&status_str).unwrap_or(PurchaseStatus::Completed),
                    notes: row.get(11)?,
                    performed_by: row.get(12)?,
                    created_at: row.get(13)?,
                    updated_at: row.get(14)?,
                })
            },
        );

        match res {
            Ok(p) => Ok(Some(p)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(AppError::Database(format!("Failed to query purchase by number: {e}"))),
        }
    }

    pub async fn get_lines(&self, purchase_id: &str) -> AppResult<Vec<PurchaseLine>> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        let mut stmt = guard
            .prepare(
                "SELECT id, purchase_id, product_id, product_name_snapshot, sku_snapshot,
                        quantity, unit_cost, discount, line_total, created_at
                 FROM purchase_lines WHERE purchase_id = ?1",
            )
            .map_err(|e| AppError::Database(e.to_string()))?;

        let rows = stmt
            .query_map(params![purchase_id], |row| {
                Ok(PurchaseLine {
                    id: row.get(0)?,
                    purchase_id: row.get(1)?,
                    product_id: row.get(2)?,
                    product_name_snapshot: row.get(3)?,
                    sku_snapshot: row.get(4)?,
                    quantity: row.get(5)?,
                    unit_cost: row.get(6)?,
                    discount: row.get(7)?,
                    line_total: row.get(8)?,
                    created_at: row.get(9)?,
                })
            })
            .map_err(|e| AppError::Database(e.to_string()))?;

        let mut lines = Vec::new();
        for r in rows {
            lines.push(r.map_err(|e| AppError::Database(e.to_string()))?);
        }

        Ok(lines)
    }

    pub async fn list(&self, filter: Option<PurchaseFilterDto>) -> AppResult<Vec<Purchase>> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;
        let filter = filter.unwrap_or_default();

        let mut sql = String::from(
            "SELECT id, purchase_number, supplier_id, branch_id, subtotal, discount,
                    total_amount, paid_amount, credit_amount, payment_status, status,
                    notes, performed_by, created_at, updated_at
             FROM purchases
             WHERE 1=1 ",
        );

        let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

        if let Some(ref sup_id) = filter.supplier_id {
            sql.push_str(" AND supplier_id = ? ");
            params_vec.push(Box::new(sup_id.clone()));
        }

        if let Some(ref br_id) = filter.branch_id {
            sql.push_str(" AND branch_id = ? ");
            params_vec.push(Box::new(br_id.clone()));
        }

        if let Some(ref pay_status) = filter.payment_status {
            sql.push_str(" AND payment_status = ? ");
            params_vec.push(Box::new(pay_status.clone()));
        }

        if let Some(ref st) = filter.status {
            sql.push_str(" AND status = ? ");
            params_vec.push(Box::new(st.clone()));
        }

        if let Some(ref start) = filter.start_date {
            sql.push_str(" AND created_at >= ? ");
            params_vec.push(Box::new(start.clone()));
        }

        if let Some(ref end) = filter.end_date {
            sql.push_str(" AND created_at <= ? ");
            params_vec.push(Box::new(end.clone()));
        }

        sql.push_str(" ORDER BY created_at DESC ");

        if let Some(limit) = filter.limit {
            sql.push_str(" LIMIT ? ");
            params_vec.push(Box::new(limit));
        }

        if let Some(offset) = filter.offset {
            sql.push_str(" OFFSET ? ");
            params_vec.push(Box::new(offset));
        }

        let mut stmt = guard
            .prepare(&sql)
            .map_err(|e| AppError::Database(e.to_string()))?;

        let params_slice: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|b| b.as_ref()).collect();

        let rows = stmt
            .query_map(params_slice.as_slice(), |row| {
                let pay_str: String = row.get(9)?;
                let status_str: String = row.get(10)?;

                Ok(Purchase {
                    id: row.get(0)?,
                    purchase_number: row.get(1)?,
                    supplier_id: row.get(2)?,
                    branch_id: row.get(3)?,
                    subtotal: row.get(4)?,
                    discount: row.get(5)?,
                    total_amount: row.get(6)?,
                    paid_amount: row.get(7)?,
                    credit_amount: row.get(8)?,
                    payment_status: PurchasePaymentStatus::from_str(&pay_str)
                        .unwrap_or(PurchasePaymentStatus::Unpaid),
                    status: PurchaseStatus::from_str(&status_str).unwrap_or(PurchaseStatus::Completed),
                    notes: row.get(11)?,
                    performed_by: row.get(12)?,
                    created_at: row.get(13)?,
                    updated_at: row.get(14)?,
                })
            })
            .map_err(|e| AppError::Database(e.to_string()))?;

        let mut purchases = Vec::new();
        for r in rows {
            purchases.push(r.map_err(|e| AppError::Database(e.to_string()))?);
        }

        Ok(purchases)
    }
}
