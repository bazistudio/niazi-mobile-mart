use rusqlite::{params, Connection};

use crate::db::connection::DatabaseConnection;
use crate::db::errors::{DbError, DbResult};
use crate::domain::sales::{PaymentStatus, Sale, SaleFilterDto, SaleLine, SalePayment, SaleStatus};
use crate::errors::{AppError, AppResult};

#[derive(Clone)]
pub struct SQLiteSaleRepository {
    db: DatabaseConnection,
}

impl SQLiteSaleRepository {
    pub fn new(db: DatabaseConnection) -> Self {
        Self { db }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Transactional primitives (usable inside `with_transaction`)
    // ──────────────────────────────────────────────────────────────────────────

    /// Generates next sequential invoice number atomically (e.g. INV-000001)
    pub fn next_invoice_number_in_tx(conn: &Connection) -> DbResult<String> {
        conn.execute(
            "UPDATE counters SET value = value + 1 WHERE name = 'invoice'",
            [],
        )
        .map_err(|e| DbError::QueryError(format!("Failed to increment invoice counter: {e}")))?;

        let val: i64 = conn
            .query_row(
                "SELECT value FROM counters WHERE name = 'invoice'",
                [],
                |row| row.get(0),
            )
            .map_err(|e| DbError::QueryError(format!("Failed to read invoice counter: {e}")))?;

        Ok(format!("INV-{:06}", val))
    }

    /// Inserts a sale header inside transaction
    pub fn insert_sale_in_tx(conn: &Connection, sale: &Sale) -> DbResult<()> {
        conn.execute(
            "INSERT INTO sales (
                id, invoice_number, branch_id, customer_id, customer_name_snapshot,
                subtotal, discount, tax_amount, total_amount, paid_amount, change_amount,
                payment_status, sale_status, performed_by, notes, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)",
            params![
                sale.id,
                sale.invoice_number,
                sale.branch_id,
                sale.customer_id.as_deref(),
                sale.customer_name_snapshot.as_deref(),
                sale.subtotal,
                sale.discount,
                sale.tax_amount,
                sale.total_amount,
                sale.paid_amount,
                sale.change_amount,
                sale.payment_status.as_str(),
                sale.sale_status.as_str(),
                sale.performed_by.as_deref(),
                sale.notes.as_deref(),
                sale.created_at,
                sale.updated_at,
            ],
        )
        .map_err(|e| {
            let s = e.to_string();
            if s.contains("UNIQUE constraint failed: sales.invoice_number") {
                DbError::ConstraintViolation(format!("Duplicate invoice number '{}'", sale.invoice_number))
            } else {
                DbError::QueryError(format!("Failed to insert sale: {e}"))
            }
        })?;

        Ok(())
    }

    /// Inserts a sale line inside transaction
    pub fn insert_sale_line_in_tx(conn: &Connection, line: &SaleLine) -> DbResult<()> {
        conn.execute(
            "INSERT INTO sale_lines (
                id, sale_id, product_id, product_name_snapshot, sku_snapshot,
                unit_price, cost_price_snapshot, quantity, discount, line_total, created_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                line.id,
                line.sale_id,
                line.product_id,
                line.product_name_snapshot,
                line.sku_snapshot,
                line.unit_price,
                line.cost_price_snapshot,
                line.quantity,
                line.discount,
                line.line_total,
                line.created_at,
            ],
        )
        .map_err(|e| DbError::QueryError(format!("Failed to insert sale line: {e}")))?;

        Ok(())
    }

    /// Inserts a sale payment record inside transaction
    pub fn insert_sale_payment_in_tx(conn: &Connection, payment: &SalePayment) -> DbResult<()> {
        conn.execute(
            "INSERT INTO sale_payments (
                id, sale_id, amount, payment_method, reference_number, notes, created_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                payment.id,
                payment.sale_id,
                payment.amount,
                payment.payment_method,
                payment.reference_number.as_deref(),
                payment.notes.as_deref(),
                payment.created_at,
            ],
        )
        .map_err(|e| DbError::QueryError(format!("Failed to insert sale payment: {e}")))?;

        Ok(())
    }

    /// Fetches all open (UNPAID or PARTIALLY_PAID) sales for a customer ordered chronologically (FIFO for payment allocation)
    pub fn get_open_sales_by_customer_in_tx(conn: &Connection, customer_id: &str) -> DbResult<Vec<Sale>> {
        let mut stmt = conn
            .prepare(
                "SELECT id, invoice_number, branch_id, customer_id, customer_name_snapshot,
                        subtotal, discount, tax_amount, total_amount, paid_amount, change_amount,
                        payment_status, sale_status, performed_by, notes, created_at, updated_at
                 FROM sales
                 WHERE customer_id = ?1
                   AND payment_status IN ('UNPAID', 'PARTIALLY_PAID')
                   AND sale_status = 'COMPLETED'
                 ORDER BY created_at ASC, id ASC",
            )
            .map_err(|e| DbError::QueryError(format!("Failed to prepare open sales query: {e}")))?;

        let rows = stmt
            .query_map(params![customer_id], |row| Self::map_sale_row(row))
            .map_err(|e| DbError::QueryError(format!("Failed to query open sales: {e}")))?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r.map_err(|e| DbError::QueryError(format!("Row map error: {e}")))?);
        }

        Ok(list)
    }

    /// Updates paid_amount and payment_status on an individual sale inside transaction
    pub fn update_sale_payment_status_in_tx(
        conn: &Connection,
        sale_id: &str,
        new_paid_amount: i64,
        new_status: PaymentStatus,
        updated_at: &str,
    ) -> DbResult<()> {
        conn.execute(
            "UPDATE sales SET paid_amount = ?1, payment_status = ?2, updated_at = ?3 WHERE id = ?4",
            params![new_paid_amount, new_status.as_str(), updated_at, sale_id],
        )
        .map_err(|e| DbError::QueryError(format!("Failed to update sale payment status: {e}")))?;

        Ok(())
    }

    /// Reads sale by ID inside transaction
    pub fn get_sale_by_id_in_tx(conn: &Connection, id: &str) -> DbResult<Option<Sale>> {
        let res = conn.query_row(
            "SELECT id, invoice_number, branch_id, customer_id, customer_name_snapshot,
                    subtotal, discount, tax_amount, total_amount, paid_amount, change_amount,
                    payment_status, sale_status, performed_by, notes, created_at, updated_at
             FROM sales WHERE id = ?1",
            params![id],
            |row| Self::map_sale_row(row),
        );

        match res {
            Ok(s) => Ok(Some(s)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(DbError::QueryError(format!("Failed to query sale by id: {e}"))),
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Async Repository APIs
    // ──────────────────────────────────────────────────────────────────────────

    pub async fn get_sale_by_id(&self, id: &str) -> AppResult<Option<Sale>> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;
        Self::get_sale_by_id_in_tx(&guard, id).map_err(AppError::from)
    }

    pub async fn get_sale_by_invoice(&self, invoice_number: &str) -> AppResult<Option<Sale>> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        let res = guard.query_row(
            "SELECT id, invoice_number, branch_id, customer_id, customer_name_snapshot,
                    subtotal, discount, tax_amount, total_amount, paid_amount, change_amount,
                    payment_status, sale_status, performed_by, notes, created_at, updated_at
             FROM sales WHERE invoice_number = ?1",
            params![invoice_number.trim()],
            |row| Self::map_sale_row(row),
        );

        match res {
            Ok(s) => Ok(Some(s)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(AppError::Database(format!("Failed to query sale by invoice: {e}"))),
        }
    }

    pub async fn get_sale_lines(&self, sale_id: &str) -> AppResult<Vec<SaleLine>> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        let mut stmt = guard
            .prepare(
                "SELECT id, sale_id, product_id, product_name_snapshot, sku_snapshot,
                        unit_price, cost_price_snapshot, quantity, discount, line_total, created_at
                 FROM sale_lines WHERE sale_id = ?1 ORDER BY created_at ASC, id ASC",
            )
            .map_err(|e| AppError::Database(format!("Failed to prepare sale lines query: {e}")))?;

        let rows = stmt
            .query_map(params![sale_id], |row| {
                Ok(SaleLine {
                    id: row.get(0)?,
                    sale_id: row.get(1)?,
                    product_id: row.get(2)?,
                    product_name_snapshot: row.get(3)?,
                    sku_snapshot: row.get(4)?,
                    unit_price: row.get(5)?,
                    cost_price_snapshot: row.get(6)?,
                    quantity: row.get(7)?,
                    discount: row.get(8)?,
                    line_total: row.get(9)?,
                    created_at: row.get(10)?,
                })
            })
            .map_err(|e| AppError::Database(format!("Failed to query sale lines: {e}")))?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r.map_err(|e| AppError::Database(format!("Row error: {e}")))?);
        }

        Ok(list)
    }

    pub async fn get_sale_payments(&self, sale_id: &str) -> AppResult<Vec<SalePayment>> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        let mut stmt = guard
            .prepare(
                "SELECT id, sale_id, amount, payment_method, reference_number, notes, created_at
                 FROM sale_payments WHERE sale_id = ?1 ORDER BY created_at ASC, id ASC",
            )
            .map_err(|e| AppError::Database(format!("Failed to prepare sale payments query: {e}")))?;

        let rows = stmt
            .query_map(params![sale_id], |row| {
                Ok(SalePayment {
                    id: row.get(0)?,
                    sale_id: row.get(1)?,
                    amount: row.get(2)?,
                    payment_method: row.get(3)?,
                    reference_number: row.get(4)?,
                    notes: row.get(5)?,
                    created_at: row.get(6)?,
                })
            })
            .map_err(|e| AppError::Database(format!("Failed to query sale payments: {e}")))?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r.map_err(|e| AppError::Database(format!("Row error: {e}")))?);
        }

        Ok(list)
    }

    pub async fn list_sales(&self, filter: &SaleFilterDto) -> AppResult<Vec<Sale>> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        let mut query = String::from(
            "SELECT id, invoice_number, branch_id, customer_id, customer_name_snapshot,
                    subtotal, discount, tax_amount, total_amount, paid_amount, change_amount,
                    payment_status, sale_status, performed_by, notes, created_at, updated_at
             FROM sales WHERE 1=1"
        );

        let mut param_values: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

        if let Some(ref cid) = filter.customer_id {
            query.push_str(" AND customer_id = ?");
            param_values.push(Box::new(cid.clone()));
        }

        if let Some(ref bid) = filter.branch_id {
            query.push_str(" AND branch_id = ?");
            param_values.push(Box::new(bid.clone()));
        }

        if let Some(ref ps) = filter.payment_status {
            query.push_str(" AND payment_status = ?");
            param_values.push(Box::new(ps.clone()));
        }

        if let Some(ref ss) = filter.sale_status {
            query.push_str(" AND sale_status = ?");
            param_values.push(Box::new(ss.clone()));
        }

        if let Some(ref start) = filter.start_date {
            query.push_str(" AND created_at >= ?");
            param_values.push(Box::new(start.clone()));
        }

        if let Some(ref end) = filter.end_date {
            query.push_str(" AND created_at <= ?");
            param_values.push(Box::new(end.clone()));
        }

        query.push_str(" ORDER BY created_at DESC, id DESC");

        let lim = filter.limit.unwrap_or(50);
        query.push_str(&format!(" LIMIT {lim}"));

        if let Some(off) = filter.offset {
            query.push_str(&format!(" OFFSET {off}"));
        }

        let mut stmt = guard
            .prepare(&query)
            .map_err(|e| AppError::Database(format!("Failed to prepare sales list query: {e}")))?;

        let params_slice: Vec<&dyn rusqlite::ToSql> = param_values.iter().map(|b| b.as_ref()).collect();

        let rows = stmt
            .query_map(params_slice.as_slice(), |row| Self::map_sale_row(row))
            .map_err(|e| AppError::Database(format!("Failed to query sales list: {e}")))?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r.map_err(|e| AppError::Database(format!("Row error: {e}")))?);
        }

        Ok(list)
    }

    fn map_sale_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Sale> {
        let p_status_str: String = row.get(11)?;
        let s_status_str: String = row.get(12)?;

        let payment_status = PaymentStatus::from_str(&p_status_str).unwrap_or(PaymentStatus::Paid);
        let sale_status = SaleStatus::from_str(&s_status_str).unwrap_or(SaleStatus::Completed);

        Ok(Sale {
            id: row.get(0)?,
            invoice_number: row.get(1)?,
            branch_id: row.get(2)?,
            customer_id: row.get(3)?,
            customer_name_snapshot: row.get(4)?,
            subtotal: row.get(5)?,
            discount: row.get(6)?,
            tax_amount: row.get(7)?,
            total_amount: row.get(8)?,
            paid_amount: row.get(9)?,
            change_amount: row.get(10)?,
            payment_status,
            sale_status,
            performed_by: row.get(13)?,
            notes: row.get(14)?,
            created_at: row.get(15)?,
            updated_at: row.get(16)?,
        })
    }
}
