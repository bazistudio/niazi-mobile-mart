use chrono::Utc;
use rusqlite::{params, Connection};

use crate::db::connection::DatabaseConnection;
use crate::db::errors::{DbError, DbResult};
use crate::domain::customer::{
    Customer, CustomerDetailDto, CustomerFilter, CustomerLedgerEntry, CustomerLedgerEntryType,
    CustomerStatementDto, CustomerStatementRowDto, CustomerSummaryDto, UpdateCustomerDto,
};
use crate::errors::{AppError, AppResult};

#[derive(Clone)]
pub struct SQLiteCustomerRepository {
    db: DatabaseConnection,
}

impl SQLiteCustomerRepository {
    pub fn new(db: DatabaseConnection) -> Self {
        Self { db }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Transactional primitives (usable inside `with_transaction`)
    // ──────────────────────────────────────────────────────────────────────────

    /// Generates next sequential human-readable customer code inside transaction (e.g. CUS-000001)
    pub fn next_customer_code_in_tx(conn: &Connection) -> DbResult<String> {
        conn.execute(
            "UPDATE counters SET value = value + 1 WHERE name = 'customer_code'",
            [],
        )
        .map_err(|e| DbError::QueryError(format!("Failed to increment customer_code counter: {e}")))?;

        let val: i64 = conn
            .query_row(
                "SELECT value FROM counters WHERE name = 'customer_code'",
                [],
                |row| row.get(0),
            )
            .map_err(|e| DbError::QueryError(format!("Failed to read customer_code counter: {e}")))?;

        Ok(format!("CUS-{:06}", val))
    }

    /// Generates next sequential payment receipt number inside transaction (e.g. REC-000001)
    pub fn next_receipt_number_in_tx(conn: &Connection) -> DbResult<String> {
        conn.execute(
            "UPDATE counters SET value = value + 1 WHERE name = 'payment_receipt'",
            [],
        )
        .map_err(|e| DbError::QueryError(format!("Failed to increment payment_receipt counter: {e}")))?;

        let val: i64 = conn
            .query_row(
                "SELECT value FROM counters WHERE name = 'payment_receipt'",
                [],
                |row| row.get(0),
            )
            .map_err(|e| DbError::QueryError(format!("Failed to read payment_receipt counter: {e}")))?;

        Ok(format!("REC-{:06}", val))
    }

    /// Authoritative outstanding balance calculation from ledger inside transaction: SUM(debit) - SUM(credit)
    pub fn calculate_outstanding_balance_in_tx(conn: &Connection, customer_id: &str) -> DbResult<i64> {
        let bal: i64 = conn
            .query_row(
                "SELECT COALESCE(SUM(debit) - SUM(credit), 0) FROM customer_ledger_entries WHERE customer_id = ?1",
                params![customer_id],
                |row| row.get(0),
            )
            .map_err(|e| DbError::QueryError(format!("Failed to calculate customer ledger balance: {e}")))?;

        Ok(bal)
    }

    /// Appends an auditable customer ledger entry inside transaction
    pub fn insert_ledger_entry_in_tx(conn: &Connection, entry: &CustomerLedgerEntry) -> DbResult<()> {
        if entry.debit < 0 || entry.credit < 0 {
            return Err(DbError::ConstraintViolation("Ledger debit and credit must be non-negative".to_string()));
        }
        if entry.balance_after < 0 {
            return Err(DbError::ConstraintViolation("Customer balance cannot be negative".to_string()));
        }

        conn.execute(
            "INSERT INTO customer_ledger_entries (
                id, customer_id, reference_id, reference_number, entry_type,
                debit, credit, balance_after, description, performed_by, created_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                entry.id,
                entry.customer_id,
                entry.reference_id.as_deref(),
                entry.reference_number.as_deref(),
                entry.entry_type.as_str(),
                entry.debit,
                entry.credit,
                entry.balance_after,
                entry.description,
                entry.performed_by.as_deref(),
                entry.created_at,
            ],
        )
        .map_err(|e| DbError::QueryError(format!("Failed to insert customer ledger entry: {e}")))?;

        Ok(())
    }

    /// Reads customer by ID inside transaction
    pub fn get_customer_by_id_in_tx(conn: &Connection, id: &str) -> DbResult<Option<Customer>> {
        let res = conn.query_row(
            "SELECT id, customer_code, name, phone, alternate_phone, email, address, notes, credit_limit, is_active, created_at, updated_at
             FROM customers WHERE id = ?1",
            params![id],
            |row| {
                let is_active_int: i64 = row.get(9)?;
                Ok(Customer {
                    id: row.get(0)?,
                    customer_code: row.get(1)?,
                    name: row.get(2)?,
                    phone: row.get(3)?,
                    alternate_phone: row.get(4)?,
                    email: row.get(5)?,
                    address: row.get(6)?,
                    notes: row.get(7)?,
                    credit_limit: row.get(8)?,
                    is_active: is_active_int == 1,
                    created_at: row.get(10)?,
                    updated_at: row.get(11)?,
                })
            },
        );

        match res {
            Ok(c) => Ok(Some(c)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(DbError::QueryError(format!("Failed to query customer: {e}"))),
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Async Repository APIs
    // ──────────────────────────────────────────────────────────────────────────

    /// Creates a new customer
    pub async fn create_customer(&self, customer: &Customer) -> AppResult<Customer> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        guard
            .execute(
                "INSERT INTO customers (
                    id, customer_code, name, phone, alternate_phone, email, address, notes, credit_limit, is_active, created_at, updated_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
                params![
                    customer.id,
                    customer.customer_code,
                    customer.name.trim(),
                    customer.phone.trim(),
                    customer.alternate_phone.as_deref().map(str::trim),
                    customer.email.as_deref().map(str::trim),
                    customer.address.as_deref().map(str::trim),
                    customer.notes.as_deref().map(str::trim),
                    customer.credit_limit,
                    if customer.is_active { 1 } else { 0 },
                    customer.created_at,
                    customer.updated_at,
                ],
            )
            .map_err(|e| {
                let s = e.to_string();
                if s.contains("UNIQUE constraint failed: customers.customer_code") {
                    AppError::Conflict(format!("Customer code '{}' already exists", customer.customer_code))
                } else {
                    AppError::Database(format!("Failed to insert customer: {e}"))
                }
            })?;

        Ok(customer.clone())
    }

    /// Updates an existing customer
    pub async fn update_customer(&self, id: &str, dto: &UpdateCustomerDto) -> AppResult<Customer> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        let existing = Self::get_customer_by_id_in_tx(&guard, id)?
            .ok_or_else(|| AppError::NotFound(format!("Customer with ID '{id}' not found")))?;

        let name = dto.name.as_deref().unwrap_or(&existing.name).trim();
        let phone = dto.phone.as_deref().unwrap_or(&existing.phone).trim();
        let alternate_phone = match &dto.alternate_phone {
            Some(p) => Some(p.trim().to_string()),
            None => existing.alternate_phone,
        };
        let email = match &dto.email {
            Some(e) => Some(e.trim().to_string()),
            None => existing.email,
        };
        let address = match &dto.address {
            Some(a) => Some(a.trim().to_string()),
            None => existing.address,
        };
        let notes = match &dto.notes {
            Some(n) => Some(n.trim().to_string()),
            None => existing.notes,
        };
        let credit_limit = dto.credit_limit.unwrap_or(existing.credit_limit);
        let is_active = dto.is_active.unwrap_or(existing.is_active);
        let now = Utc::now().to_rfc3339();

        guard
            .execute(
                "UPDATE customers SET
                    name = ?1, phone = ?2, alternate_phone = ?3, email = ?4,
                    address = ?5, notes = ?6, credit_limit = ?7, is_active = ?8, updated_at = ?9
                 WHERE id = ?10",
                params![
                    name,
                    phone,
                    alternate_phone,
                    email,
                    address,
                    notes,
                    credit_limit,
                    if is_active { 1 } else { 0 },
                    now,
                    id,
                ],
            )
            .map_err(|e| AppError::Database(format!("Failed to update customer: {e}")))?;

        Ok(Customer {
            id: id.to_string(),
            customer_code: existing.customer_code,
            name: name.to_string(),
            phone: phone.to_string(),
            alternate_phone,
            email,
            address,
            notes,
            credit_limit,
            is_active,
            created_at: existing.created_at,
            updated_at: now,
        })
    }

    /// Fetches customer by ID
    pub async fn get_customer_by_id(&self, id: &str) -> AppResult<Option<Customer>> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;
        Self::get_customer_by_id_in_tx(&guard, id).map_err(AppError::from)
    }

    /// Fetches customer by exact phone number
    pub async fn get_customer_by_phone(&self, phone: &str) -> AppResult<Option<Customer>> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        let res = guard.query_row(
            "SELECT id, customer_code, name, phone, alternate_phone, email, address, notes, credit_limit, is_active, created_at, updated_at
             FROM customers WHERE phone = ?1 LIMIT 1",
            params![phone.trim()],
            |row| {
                let is_active_int: i64 = row.get(9)?;
                Ok(Customer {
                    id: row.get(0)?,
                    customer_code: row.get(1)?,
                    name: row.get(2)?,
                    phone: row.get(3)?,
                    alternate_phone: row.get(4)?,
                    email: row.get(5)?,
                    address: row.get(6)?,
                    notes: row.get(7)?,
                    credit_limit: row.get(8)?,
                    is_active: is_active_int == 1,
                    created_at: row.get(10)?,
                    updated_at: row.get(11)?,
                })
            },
        );

        match res {
            Ok(c) => Ok(Some(c)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(AppError::Database(format!("Failed to query customer by phone: {e}"))),
        }
    }

    /// Fetches customer detail with calculated outstanding balance and sale stats
    pub async fn get_customer_detail(&self, id: &str) -> AppResult<CustomerDetailDto> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        let customer = Self::get_customer_by_id_in_tx(&guard, id)?
            .ok_or_else(|| AppError::NotFound(format!("Customer '{id}' not found")))?;

        let balance = Self::calculate_outstanding_balance_in_tx(&guard, id)?;

        let (sales_count, sales_amount): (i64, i64) = guard
            .query_row(
                "SELECT COUNT(*), COALESCE(SUM(total_amount), 0) FROM sales WHERE customer_id = ?1 AND sale_status = 'COMPLETED'",
                params![id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap_or((0, 0));

        let last_tx_date: Option<String> = guard
            .query_row(
                "SELECT created_at FROM customer_ledger_entries WHERE customer_id = ?1 ORDER BY created_at DESC LIMIT 1",
                params![id],
                |row| row.get(0),
            )
            .ok();

        Ok(CustomerDetailDto {
            customer,
            outstanding_balance: balance,
            total_sales_count: sales_count,
            total_sales_amount: sales_amount,
            last_transaction_date: last_tx_date,
        })
    }

    /// Lists customers with summary information and outstanding balance
    pub async fn list_customers(&self, filter: &CustomerFilter) -> AppResult<Vec<CustomerSummaryDto>> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        let mut query = String::from(
            "SELECT c.id, c.customer_code, c.name, c.phone, c.credit_limit,
                    COALESCE(SUM(l.debit) - SUM(l.credit), 0) AS balance,
                    c.is_active, c.created_at
             FROM customers c
             LEFT JOIN customer_ledger_entries l ON c.id = l.customer_id
             WHERE 1=1"
        );

        let mut param_values: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

        if let Some(active) = filter.is_active {
            query.push_str(" AND c.is_active = ?");
            param_values.push(Box::new(if active { 1 } else { 0 }));
        }

        if let Some(ref s) = filter.search {
            let s_trim = s.trim();
            if !s_trim.is_empty() {
                let pattern = format!("%{s_trim}%");
                query.push_str(" AND (c.name LIKE ? COLLATE NOCASE OR c.phone LIKE ? OR c.customer_code LIKE ? COLLATE NOCASE)");
                param_values.push(Box::new(pattern.clone()));
                param_values.push(Box::new(pattern.clone()));
                param_values.push(Box::new(pattern));
            }
        }

        query.push_str(" GROUP BY c.id ORDER BY c.name ASC");

        if let Some(lim) = filter.limit {
            query.push_str(&format!(" LIMIT {lim}"));
            if let Some(off) = filter.offset {
                query.push_str(&format!(" OFFSET {off}"));
            }
        }

        let mut stmt = guard
            .prepare(&query)
            .map_err(|e| AppError::Database(format!("Failed to prepare customer list query: {e}")))?;

        let params_slice: Vec<&dyn rusqlite::ToSql> = param_values.iter().map(|b| b.as_ref()).collect();

        let rows = stmt
            .query_map(params_slice.as_slice(), |row| {
                let is_active_int: i64 = row.get(6)?;
                Ok(CustomerSummaryDto {
                    id: row.get(0)?,
                    customer_code: row.get(1)?,
                    name: row.get(2)?,
                    phone: row.get(3)?,
                    credit_limit: row.get(4)?,
                    outstanding_balance: row.get(5)?,
                    is_active: is_active_int == 1,
                    created_at: row.get(7)?,
                })
            })
            .map_err(|e| AppError::Database(format!("Failed to query customer summaries: {e}")))?;

        let mut result = Vec::new();
        for r in rows {
            result.push(r.map_err(|e| AppError::Database(format!("Row error: {e}")))?);
        }

        Ok(result)
    }

    /// Searches customers by keyword (name, phone, customer_code)
    pub async fn search_customers(&self, query: &str) -> AppResult<Vec<CustomerSummaryDto>> {
        self.list_customers(&CustomerFilter {
            search: Some(query.to_string()),
            is_active: Some(true),
            limit: Some(50),
            offset: None,
        })
        .await
    }

    /// Gets authoritative outstanding balance
    pub async fn get_outstanding_balance(&self, customer_id: &str) -> AppResult<i64> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;
        Self::calculate_outstanding_balance_in_tx(&guard, customer_id).map_err(AppError::from)
    }

    /// Gets recent ledger entries for a customer
    pub async fn get_ledger(
        &self,
        customer_id: &str,
        limit: Option<i64>,
        offset: Option<i64>,
    ) -> AppResult<Vec<CustomerLedgerEntry>> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        let lim = limit.unwrap_or(100);
        let off = offset.unwrap_or(0);

        let mut stmt = guard
            .prepare(
                "SELECT id, customer_id, reference_id, reference_number, entry_type, debit, credit, balance_after, description, performed_by, created_at
                 FROM customer_ledger_entries
                 WHERE customer_id = ?1
                 ORDER BY created_at DESC, id DESC
                 LIMIT ?2 OFFSET ?3",
            )
            .map_err(|e| AppError::Database(format!("Failed to prepare ledger query: {e}")))?;

        let rows = stmt
            .query_map(params![customer_id, lim, off], |row| {
                let type_str: String = row.get(4)?;
                let entry_type = CustomerLedgerEntryType::from_str(&type_str)
                    .unwrap_or(CustomerLedgerEntryType::Sale);

                Ok(CustomerLedgerEntry {
                    id: row.get(0)?,
                    customer_id: row.get(1)?,
                    reference_id: row.get(2)?,
                    reference_number: row.get(3)?,
                    entry_type,
                    debit: row.get(5)?,
                    credit: row.get(6)?,
                    balance_after: row.get(7)?,
                    description: row.get(8)?,
                    performed_by: row.get(9)?,
                    created_at: row.get(10)?,
                })
            })
            .map_err(|e| AppError::Database(format!("Failed to query ledger: {e}")))?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r.map_err(|e| AppError::Database(format!("Row error: {e}")))?);
        }

        Ok(list)
    }

    /// Generates customer statement showing full chronological ledger timeline
    pub async fn get_statement(&self, customer_id: &str) -> AppResult<CustomerStatementDto> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        let customer = Self::get_customer_by_id_in_tx(&guard, customer_id)?
            .ok_or_else(|| AppError::NotFound(format!("Customer '{customer_id}' not found")))?;

        let mut stmt = guard
            .prepare(
                "SELECT id, created_at, reference_number, description, entry_type, debit, credit, balance_after
                 FROM customer_ledger_entries
                 WHERE customer_id = ?1
                 ORDER BY created_at ASC, id ASC",
            )
            .map_err(|e| AppError::Database(format!("Failed to prepare statement query: {e}")))?;

        let rows = stmt
            .query_map(params![customer_id], |row| {
                Ok(CustomerStatementRowDto {
                    id: row.get(0)?,
                    date: row.get(1)?,
                    reference_number: row.get(2)?,
                    description: row.get(3)?,
                    entry_type: row.get(4)?,
                    debit: row.get(5)?,
                    credit: row.get(6)?,
                    balance: row.get(7)?,
                })
            })
            .map_err(|e| AppError::Database(format!("Failed to query statement rows: {e}")))?;

        let mut entries = Vec::new();
        let mut current_bal = 0;
        for r in rows {
            let row_dto = r.map_err(|e| AppError::Database(format!("Row error: {e}")))?;
            current_bal = row_dto.balance;
            entries.push(row_dto);
        }

        Ok(CustomerStatementDto {
            customer_id: customer.id,
            customer_name: customer.name,
            customer_code: customer.customer_code,
            phone: customer.phone,
            credit_limit: customer.credit_limit,
            current_balance: current_bal,
            entries,
        })
    }

    /// Checks if customer has financial transactions (ledger entries or sales)
    pub async fn has_financial_history(&self, id: &str) -> AppResult<bool> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        let ledger_count: i64 = guard
            .query_row(
                "SELECT COUNT(*) FROM customer_ledger_entries WHERE customer_id = ?1",
                params![id],
                |row| row.get(0),
            )
            .unwrap_or(0);

        if ledger_count > 0 {
            return Ok(true);
        }

        let sales_count: i64 = guard
            .query_row(
                "SELECT COUNT(*) FROM sales WHERE customer_id = ?1",
                params![id],
                |row| row.get(0),
            )
            .unwrap_or(0);

        Ok(sales_count > 0)
    }

    /// Deactivates a customer (safe archival - never physical deletion)
    pub async fn deactivate_customer(&self, id: &str) -> AppResult<()> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;
        let now = Utc::now().to_rfc3339();

        let updated = guard
            .execute(
                "UPDATE customers SET is_active = 0, updated_at = ?1 WHERE id = ?2",
                params![now, id],
            )
            .map_err(|e| AppError::Database(format!("Failed to deactivate customer: {e}")))?;

        if updated == 0 {
            return Err(AppError::NotFound(format!("Customer '{id}' not found")));
        }

        Ok(())
    }
}
