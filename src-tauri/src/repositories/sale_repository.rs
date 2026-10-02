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

    /// Generates a collision-safe terminal-scoped monthly invoice number atomically.
    ///
    /// Format: `{branch_code}-{terminal_code}-{YYYYMM}-{SEQUENCE:06}`
    /// Example: `MAIN-T1-202609-000001`
    ///
    /// The counter key is `invoice_{terminal_id}_{billing_month}` where
    /// `billing_month` is formatted as `YYYYMM` in Asia/Karachi time (UTC+05:00).
    ///
    /// Each terminal+month combination has its own independent sequence starting
    /// at 1. The maximum sequence is 999_999; exceeding it returns a domain error.
    ///
    /// # Arguments
    /// * `conn` — open SQLite connection (must be inside a transaction)
    /// * `terminal_id` — stable UUID of the current terminal
    /// * `branch_code` — human-readable branch code (e.g. "MAIN")
    /// * `terminal_code` — human-readable terminal code (e.g. "T1")
    /// * `billing_month` — `YYYYMM` string in Asia/Karachi timezone
    pub fn next_invoice_number_in_tx(
        conn: &Connection,
        terminal_id: &str,
        branch_code: &str,
        terminal_code: &str,
        billing_month: &str,
    ) -> DbResult<String> {
        let counter_key = format!("invoice_{}_{}", terminal_id, billing_month);

        // Upsert: create row if first invoice of this terminal/month, else increment.
        conn.execute(
            "INSERT INTO counters (name, value) VALUES (?1, 1)
             ON CONFLICT(name) DO UPDATE SET value = value + 1",
            rusqlite::params![&counter_key],
        )
        .map_err(|e| DbError::QueryError(format!("Failed to increment invoice counter: {e}")))?;

        let val: i64 = conn
            .query_row(
                "SELECT value FROM counters WHERE name = ?1",
                rusqlite::params![&counter_key],
                |row| row.get(0),
            )
            .map_err(|e| DbError::QueryError(format!("Failed to read invoice counter: {e}")))?;

        // Overflow guard: terminal+month sequence capped at 999_999
        if val > 999_999 {
            return Err(DbError::ConstraintViolation(format!(
                "Invoice sequence overflow for terminal {} in {}: maximum 999999 invoices per terminal per month exceeded",
                terminal_code, billing_month
            )));
        }

        Ok(format!(
            "{}-{}-{}-{:06}",
            branch_code, terminal_code, billing_month, val
        ))
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
                DbError::ConstraintViolation(format!(
                    "Duplicate invoice number '{}'",
                    sale.invoice_number
                ))
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

    /// Reads lines for a sale inside transaction
    pub fn get_sale_lines_in_tx(conn: &Connection, sale_id: &str) -> DbResult<Vec<SaleLine>> {
        let mut stmt = conn
            .prepare(
                "SELECT id, sale_id, product_id, product_name_snapshot, sku_snapshot,
                        unit_price, cost_price_snapshot, quantity, discount, line_total, created_at
                 FROM sale_lines WHERE sale_id = ?1 ORDER BY created_at ASC, id ASC",
            )
            .map_err(|e| DbError::QueryError(format!("Failed to prepare sale lines query: {e}")))?;

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
            .map_err(|e| DbError::QueryError(format!("Failed to query sale lines: {e}")))?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r.map_err(|e| DbError::QueryError(format!("Error reading sale line: {e}")))?);
        }

        Ok(list)
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
    pub fn get_open_sales_by_customer_in_tx(
        conn: &Connection,
        customer_id: &str,
    ) -> DbResult<Vec<Sale>> {
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
            Err(e) => Err(DbError::QueryError(format!(
                "Failed to query sale by id: {e}"
            ))),
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
            Err(e) => Err(AppError::Database(format!(
                "Failed to query sale by invoice: {e}"
            ))),
        }
    }

    pub async fn get_sale_lines(&self, sale_id: &str) -> AppResult<Vec<SaleLine>> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;
        Self::get_sale_lines_in_tx(&guard, sale_id).map_err(AppError::from)
    }

    pub async fn get_sale_payments(&self, sale_id: &str) -> AppResult<Vec<SalePayment>> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        let mut stmt = guard
            .prepare(
                "SELECT id, sale_id, amount, payment_method, reference_number, notes, created_at
                 FROM sale_payments WHERE sale_id = ?1 ORDER BY created_at ASC, id ASC",
            )
            .map_err(|e| {
                AppError::Database(format!("Failed to prepare sale payments query: {e}"))
            })?;

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
             FROM sales WHERE 1=1",
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

        let params_slice: Vec<&dyn rusqlite::ToSql> =
            param_values.iter().map(|b| b.as_ref()).collect();

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

// ─────────────────────────────────────────────────────────────────────────────
// B07 — Invoice Number Unit Tests
// ─────────────────────────────────────────────────────────────────────────────
#[cfg(test)]
mod invoice_tests {
    use super::*;
    use crate::db::migrations::MigrationRunner;
    use rusqlite::Connection;

    fn open_test_db() -> Connection {
        let mut conn = Connection::open_in_memory().expect("in-memory db");
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        MigrationRunner::run(&mut conn).expect("migrations must run");
        conn
    }

    // ── Helper ────────────────────────────────────────────────────────────────

    fn gen(
        conn: &Connection,
        terminal_id: &str,
        branch_code: &str,
        terminal_code: &str,
        billing_month: &str,
    ) -> String {
        SQLiteSaleRepository::next_invoice_number_in_tx(
            conn,
            terminal_id,
            branch_code,
            terminal_code,
            billing_month,
        )
        .expect("invoice generation must succeed")
    }

    fn gen_result(
        conn: &Connection,
        terminal_id: &str,
        branch_code: &str,
        terminal_code: &str,
        billing_month: &str,
    ) -> crate::db::errors::DbResult<String> {
        SQLiteSaleRepository::next_invoice_number_in_tx(
            conn,
            terminal_id,
            branch_code,
            terminal_code,
            billing_month,
        )
    }

    const TID1: &str = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const TID2: &str = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    const MONTH_SEP: &str = "202609";
    const MONTH_OCT: &str = "202610";

    // ── 1. Basic format ───────────────────────────────────────────────────────

    #[test]
    fn b07_format_first_invoice() {
        let conn = open_test_db();
        let inv = gen(&conn, TID1, "MAIN", "T1", MONTH_SEP);
        assert_eq!(
            inv, "MAIN-T1-202609-000001",
            "First invoice must be ...000001"
        );
    }

    #[test]
    fn b07_format_second_invoice() {
        let conn = open_test_db();
        gen(&conn, TID1, "MAIN", "T1", MONTH_SEP);
        let inv = gen(&conn, TID1, "MAIN", "T1", MONTH_SEP);
        assert_eq!(inv, "MAIN-T1-202609-000002");
    }

    #[test]
    fn b07_format_sequence_increments_monotonically() {
        let conn = open_test_db();
        for expected in 1u64..=10 {
            let inv = gen(&conn, TID1, "MAIN", "T1", MONTH_SEP);
            let parts: Vec<&str> = inv.splitn(4, '-').collect();
            let seq: u64 = parts[3].parse().expect("sequence must be numeric");
            assert_eq!(seq, expected, "Expected sequence {expected}, got {seq}");
        }
    }

    #[test]
    fn b07_format_six_digit_zero_padded() {
        let conn = open_test_db();
        let inv = gen(&conn, TID1, "MAIN", "T1", MONTH_SEP);
        let parts: Vec<&str> = inv.split('-').collect();
        // format: MAIN - T1 - 202609 - 000001 (4 parts)
        assert_eq!(
            parts.len(),
            4,
            "Invoice must have exactly 4 dash-separated parts"
        );
        assert_eq!(parts[3].len(), 6, "Sequence must be exactly 6 digits");
    }

    #[test]
    fn b07_format_contains_billing_month() {
        let conn = open_test_db();
        let inv = gen(&conn, TID1, "MAIN", "T1", MONTH_OCT);
        assert!(
            inv.contains("202610"),
            "Invoice must contain billing month 202610"
        );
    }

    #[test]
    fn b07_format_contains_branch_and_terminal_code() {
        let conn = open_test_db();
        let inv = gen(&conn, TID1, "NORTH", "T3", MONTH_SEP);
        assert!(inv.starts_with("NORTH-T3-"), "Must start with NORTH-T3-");
    }

    // ── 2. Terminal isolation ─────────────────────────────────────────────────

    #[test]
    fn b07_isolation_different_terminals_independent_sequences() {
        let conn = open_test_db();
        // Terminal 1: 3 invoices
        gen(&conn, TID1, "MAIN", "T1", MONTH_SEP);
        gen(&conn, TID1, "MAIN", "T1", MONTH_SEP);
        gen(&conn, TID1, "MAIN", "T1", MONTH_SEP);

        // Terminal 2: first invoice must still be 000001
        let inv_t2 = gen(&conn, TID2, "MAIN", "T2", MONTH_SEP);
        assert_eq!(
            inv_t2, "MAIN-T2-202609-000001",
            "T2's first invoice must be 000001 regardless of T1's sequence"
        );
    }

    #[test]
    fn b07_isolation_t1_continues_after_t2_usage() {
        let conn = open_test_db();
        gen(&conn, TID1, "MAIN", "T1", MONTH_SEP); // T1 = 1
        gen(&conn, TID2, "MAIN", "T2", MONTH_SEP); // T2 = 1
        gen(&conn, TID2, "MAIN", "T2", MONTH_SEP); // T2 = 2

        let inv = gen(&conn, TID1, "MAIN", "T1", MONTH_SEP); // T1 = 2
        assert_eq!(
            inv, "MAIN-T1-202609-000002",
            "T1 must continue its own sequence unaffected by T2"
        );
    }

    #[test]
    fn b07_isolation_no_collision_same_seq_different_terminal() {
        let conn = open_test_db();
        let inv1 = gen(&conn, TID1, "MAIN", "T1", MONTH_SEP);
        let inv2 = gen(&conn, TID2, "MAIN", "T2", MONTH_SEP);
        assert_ne!(
            inv1, inv2,
            "Two terminals must never produce the same invoice number"
        );
    }

    // ── 3. Branch isolation ───────────────────────────────────────────────────

    #[test]
    fn b07_branch_isolation_codes_differ() {
        let conn = open_test_db();
        let inv_main = gen(&conn, TID1, "MAIN", "T1", MONTH_SEP);
        let inv_north = gen(&conn, TID2, "NORTH", "T1", MONTH_SEP);
        assert!(
            inv_main.starts_with("MAIN-"),
            "Main branch invoice must start with MAIN-"
        );
        assert!(
            inv_north.starts_with("NORTH-"),
            "North branch invoice must start with NORTH-"
        );
        assert_ne!(
            inv_main, inv_north,
            "Different branches must produce different invoices"
        );
    }

    #[test]
    fn b07_branch_code_appears_in_invoice() {
        let conn = open_test_db();
        let inv = gen(&conn, TID1, "EAST", "T1", MONTH_SEP);
        assert!(
            inv.starts_with("EAST-T1-"),
            "Invoice must embed branch code EAST"
        );
    }

    // ── 4. Monthly reset ──────────────────────────────────────────────────────

    #[test]
    fn b07_monthly_reset_new_month_starts_at_1() {
        let conn = open_test_db();
        // Three invoices in September
        gen(&conn, TID1, "MAIN", "T1", MONTH_SEP);
        gen(&conn, TID1, "MAIN", "T1", MONTH_SEP);
        gen(&conn, TID1, "MAIN", "T1", MONTH_SEP);

        // October must start fresh at 000001
        let inv_oct = gen(&conn, TID1, "MAIN", "T1", MONTH_OCT);
        assert_eq!(
            inv_oct, "MAIN-T1-202610-000001",
            "New month must reset sequence to 000001"
        );
    }

    #[test]
    fn b07_monthly_reset_september_resumes_correctly() {
        let conn = open_test_db();
        gen(&conn, TID1, "MAIN", "T1", MONTH_SEP); // Sep 1
        gen(&conn, TID1, "MAIN", "T1", MONTH_OCT); // Oct 1 — new month
        let inv = gen(&conn, TID1, "MAIN", "T1", MONTH_SEP); // Sep 2 (backfill test)
        assert_eq!(
            inv, "MAIN-T1-202609-000002",
            "September counter must be independent from October"
        );
    }

    #[test]
    fn b07_monthly_reset_twelve_months_all_independent() {
        let conn = open_test_db();
        let months = [
            "202601", "202602", "202603", "202604", "202605", "202606", "202607", "202608",
            "202609", "202610", "202611", "202612",
        ];
        for (i, month) in months.iter().enumerate() {
            let inv = gen(&conn, TID1, "MAIN", "T1", month);
            let expected = format!("MAIN-T1-{}-000001", month);
            assert_eq!(
                inv, expected,
                "Month {} (index {}) must start at 000001",
                month, i
            );
        }
    }

    // ── 5. Overflow guard ─────────────────────────────────────────────────────

    #[test]
    fn b07_overflow_guard_at_999999() {
        let conn = open_test_db();
        // Seed the counter to 999_999 directly (avoid slow loop)
        conn.execute(
            "INSERT INTO counters (name, value) VALUES ('invoice_aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa_202609', 999999)",
            [],
        ).expect("counter seed");

        // The NEXT call (which would be 1_000_000) must fail
        let result = gen_result(&conn, TID1, "MAIN", "T1", MONTH_SEP);
        assert!(result.is_err(), "Sequence must fail after reaching 999999");
        let err_str = format!("{:?}", result.unwrap_err());
        assert!(
            err_str.contains("overflow") || err_str.contains("999999"),
            "Error must mention overflow or 999999, got: {}",
            err_str
        );
    }

    #[test]
    fn b07_overflow_guard_999999_itself_succeeds() {
        let conn = open_test_db();
        // Seed counter to 999_998
        conn.execute(
            "INSERT INTO counters (name, value) VALUES ('invoice_aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa00_202609', 999998)",
            [],
        ).expect("counter seed");

        let tid = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa00";
        let result = gen_result(&conn, tid, "MAIN", "T1", MONTH_SEP);
        assert!(result.is_ok(), "Sequence 999999 must still succeed");
        assert_eq!(result.unwrap(), "MAIN-T1-202609-999999");
    }

    // ── 6. Historical INV-NNNNNN compatibility ────────────────────────────────

    #[test]
    fn b07_historical_counter_untouched() {
        let conn = open_test_db();
        // Verify legacy 'invoice' counter still exists and was seeded at 0
        let val: i64 = conn
            .query_row(
                "SELECT value FROM counters WHERE name = 'invoice'",
                [],
                |r| r.get(0),
            )
            .expect("legacy counter must exist");
        assert_eq!(
            val, 0,
            "Legacy 'invoice' counter must remain at 0 (seeded value)"
        );
    }

    #[test]
    fn b07_historical_counter_unaffected_by_new_invoices() {
        let conn = open_test_db();
        // Generate several new-format invoices
        gen(&conn, TID1, "MAIN", "T1", MONTH_SEP);
        gen(&conn, TID1, "MAIN", "T1", MONTH_SEP);

        // Legacy counter must still be 0
        let val: i64 = conn
            .query_row(
                "SELECT value FROM counters WHERE name = 'invoice'",
                [],
                |r| r.get(0),
            )
            .expect("legacy counter must exist");
        assert_eq!(
            val, 0,
            "New-format invoice generation must NOT touch legacy counter"
        );
    }

    #[test]
    fn b07_new_counter_key_distinct_from_legacy() {
        let conn = open_test_db();
        gen(&conn, TID1, "MAIN", "T1", MONTH_SEP);

        // New counter key exists
        let new_key = format!("invoice_{}_{}", TID1, MONTH_SEP);
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM counters WHERE name = ?1",
                rusqlite::params![&new_key],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(
            count, 1,
            "New-style counter key must exist after invoice generation"
        );

        // Legacy key is untouched
        let legacy_val: i64 = conn
            .query_row(
                "SELECT value FROM counters WHERE name = 'invoice'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(legacy_val, 0, "Legacy counter value must be 0");
    }

    // ── 7. Concurrent-safe idempotency (counter key structure) ───────────────

    #[test]
    fn b07_counter_key_includes_terminal_id() {
        // Verify counter key format used in DB
        let conn = open_test_db();
        gen(&conn, TID1, "MAIN", "T1", MONTH_SEP);
        gen(&conn, TID2, "MAIN", "T2", MONTH_SEP);

        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM counters WHERE name LIKE 'invoice_%'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        // One counter per terminal per month (2 terminals, 1 month = 2 counters + 1 legacy)
        assert!(
            count >= 2,
            "Each terminal must have its own counter row; got {count} counter rows"
        );
    }

    #[test]
    fn b07_counter_key_includes_billing_month() {
        let conn = open_test_db();
        gen(&conn, TID1, "MAIN", "T1", MONTH_SEP);
        gen(&conn, TID1, "MAIN", "T1", MONTH_OCT);

        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM counters WHERE name LIKE ?1",
                rusqlite::params![format!("invoice_{}_%", TID1)],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(
            count, 2,
            "Terminal 1 must have 2 counter rows (Sep and Oct)"
        );
    }
}
