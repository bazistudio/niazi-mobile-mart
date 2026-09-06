use chrono::Utc;
use rusqlite::{params, Connection};

use crate::db::connection::DatabaseConnection;
use crate::db::errors::{DbError, DbResult};
use crate::domain::supplier::{
    Supplier, SupplierDetailDto, SupplierFilter, SupplierLedgerEntry, SupplierLedgerEntryType,
    SupplierStatementDto, SupplierStatementRowDto, SupplierSummaryDto, UpdateSupplierDto,
};
use crate::errors::{AppError, AppResult};

#[derive(Clone)]
pub struct SQLiteSupplierRepository {
    db: DatabaseConnection,
}

impl SQLiteSupplierRepository {
    pub fn new(db: DatabaseConnection) -> Self {
        Self { db }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Transactional primitives (usable inside `with_transaction`)
    // ──────────────────────────────────────────────────────────────────────────

    /// Generates next sequential human-readable supplier code inside transaction (e.g. SUP-000001)
    pub fn next_supplier_code_in_tx(conn: &Connection) -> DbResult<String> {
        conn.execute(
            "UPDATE counters SET value = value + 1 WHERE name = 'supplier_code'",
            [],
        )
        .map_err(|e| DbError::QueryError(format!("Failed to increment supplier_code counter: {e}")))?;

        let val: i64 = conn
            .query_row(
                "SELECT value FROM counters WHERE name = 'supplier_code'",
                [],
                |row| row.get(0),
            )
            .map_err(|e| DbError::QueryError(format!("Failed to read supplier_code counter: {e}")))?;

        Ok(format!("SUP-{:06}", val))
    }

    /// Generates next sequential payment receipt number inside transaction (e.g. PAY-000001)
    pub fn next_receipt_number_in_tx(conn: &Connection) -> DbResult<String> {
        conn.execute(
            "UPDATE counters SET value = value + 1 WHERE name = 'supplier_payment_receipt'",
            [],
        )
        .map_err(|e| DbError::QueryError(format!("Failed to increment supplier_payment_receipt counter: {e}")))?;

        let val: i64 = conn
            .query_row(
                "SELECT value FROM counters WHERE name = 'supplier_payment_receipt'",
                [],
                |row| row.get(0),
            )
            .map_err(|e| DbError::QueryError(format!("Failed to read supplier_payment_receipt counter: {e}")))?;

        Ok(format!("PAY-{:06}", val))
    }

    /// Inserts a supplier entity inside an existing transaction
    pub fn insert_supplier_in_tx(conn: &Connection, s: &Supplier) -> DbResult<()> {
        conn.execute(
            "INSERT INTO suppliers (
                id, supplier_code, name, phone, alternate_phone, email, address, notes, credit_limit, is_active, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            params![
                s.id,
                s.supplier_code,
                s.name,
                s.phone,
                s.alternate_phone,
                s.email,
                s.address,
                s.notes,
                s.credit_limit,
                if s.is_active { 1 } else { 0 },
                s.created_at,
                s.updated_at,
            ],
        )
        .map_err(|e| DbError::QueryError(format!("Failed to insert supplier: {e}")))?;

        Ok(())
    }

    /// Reads a supplier by ID inside an existing transaction
    pub fn get_by_id_in_tx(conn: &Connection, id: &str) -> DbResult<Option<Supplier>> {
        let res = conn.query_row(
            "SELECT id, supplier_code, name, phone, alternate_phone, email, address, notes, credit_limit, is_active, created_at, updated_at
             FROM suppliers WHERE id = ?1",
            params![id],
            |row| {
                let active_int: i64 = row.get(9)?;
                Ok(Supplier {
                    id: row.get(0)?,
                    supplier_code: row.get(1)?,
                    name: row.get(2)?,
                    phone: row.get(3)?,
                    alternate_phone: row.get(4)?,
                    email: row.get(5)?,
                    address: row.get(6)?,
                    notes: row.get(7)?,
                    credit_limit: row.get(8)?,
                    is_active: active_int == 1,
                    created_at: row.get(10)?,
                    updated_at: row.get(11)?,
                })
            },
        );

        match res {
            Ok(s) => Ok(Some(s)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(DbError::QueryError(format!("Failed to query supplier: {e}"))),
        }
    }

    /// Calculates authoritative outstanding payable balance for a supplier inside a transaction
    /// Payable = SUM(debit) - SUM(credit)
    pub fn get_outstanding_balance_in_tx(conn: &Connection, supplier_id: &str) -> DbResult<i64> {
        let balance: i64 = conn
            .query_row(
                "SELECT COALESCE(SUM(debit) - SUM(credit), 0) FROM supplier_ledger_entries WHERE supplier_id = ?1",
                params![supplier_id],
                |row| row.get(0),
            )
            .map_err(|e| DbError::QueryError(format!("Failed to calculate supplier balance: {e}")))?;

        Ok(balance)
    }

    /// Inserts an append-only supplier ledger entry inside an active transaction
    pub fn insert_ledger_entry_in_tx(conn: &Connection, entry: &SupplierLedgerEntry) -> DbResult<()> {
        conn.execute(
            "INSERT INTO supplier_ledger_entries (
                id, supplier_id, reference_id, reference_number, entry_type, debit, credit, balance_after, description, performed_by, created_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                entry.id,
                entry.supplier_id,
                entry.reference_id,
                entry.reference_number,
                entry.entry_type.as_str(),
                entry.debit,
                entry.credit,
                entry.balance_after,
                entry.description,
                entry.performed_by,
                entry.created_at,
            ],
        )
        .map_err(|e| DbError::QueryError(format!("Failed to insert supplier ledger entry: {e}")))?;

        Ok(())
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Async Repository APIs
    // ──────────────────────────────────────────────────────────────────────────

    pub async fn get_by_id(&self, id: &str) -> AppResult<Option<Supplier>> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;
        Self::get_by_id_in_tx(&guard, id).map_err(AppError::from)
    }

    pub async fn get_by_code(&self, code: &str) -> AppResult<Option<Supplier>> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        let res = guard.query_row(
            "SELECT id, supplier_code, name, phone, alternate_phone, email, address, notes, credit_limit, is_active, created_at, updated_at
             FROM suppliers WHERE supplier_code = ?1",
            params![code],
            |row| {
                let active_int: i64 = row.get(9)?;
                Ok(Supplier {
                    id: row.get(0)?,
                    supplier_code: row.get(1)?,
                    name: row.get(2)?,
                    phone: row.get(3)?,
                    alternate_phone: row.get(4)?,
                    email: row.get(5)?,
                    address: row.get(6)?,
                    notes: row.get(7)?,
                    credit_limit: row.get(8)?,
                    is_active: active_int == 1,
                    created_at: row.get(10)?,
                    updated_at: row.get(11)?,
                })
            },
        );

        match res {
            Ok(s) => Ok(Some(s)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(AppError::Database(format!("Failed to query supplier by code: {e}"))),
        }
    }

    pub async fn list(&self, filter: Option<SupplierFilter>) -> AppResult<Vec<SupplierSummaryDto>> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;
        let filter = filter.unwrap_or_default();

        let mut sql = String::from(
            "SELECT s.id, s.supplier_code, s.name, s.phone, s.credit_limit,
                    COALESCE((SELECT SUM(l.debit) - SUM(l.credit) FROM supplier_ledger_entries l WHERE l.supplier_id = s.id), 0) AS outstanding,
                    s.is_active, s.created_at
             FROM suppliers s
             WHERE 1=1 ",
        );

        let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

        if let Some(ref search) = filter.search {
            if !search.trim().is_empty() {
                sql.push_str(" AND (s.name LIKE ? OR s.phone LIKE ? OR s.supplier_code LIKE ?) ");
                let pattern = format!("%{}%", search.trim());
                params_vec.push(Box::new(pattern.clone()));
                params_vec.push(Box::new(pattern.clone()));
                params_vec.push(Box::new(pattern));
            }
        }

        if let Some(active) = filter.is_active {
            sql.push_str(" AND s.is_active = ? ");
            params_vec.push(Box::new(if active { 1 } else { 0 }));
        }

        sql.push_str(" ORDER BY s.created_at DESC ");

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
                let active_int: i64 = row.get(6).unwrap_or(1);
                Ok(SupplierSummaryDto {
                    id: row.get(0)?,
                    supplier_code: row.get(1)?,
                    name: row.get(2)?,
                    phone: row.get(3)?,
                    credit_limit: row.get(4)?,
                    outstanding_balance: row.get(5)?,
                    is_active: active_int == 1,
                    created_at: row.get(7)?,
                })
            })
            .map_err(|e| AppError::Database(e.to_string()))?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r.map_err(|e| AppError::Database(e.to_string()))?);
        }

        Ok(list)
    }

    pub async fn search(&self, query: &str) -> AppResult<Vec<SupplierSummaryDto>> {
        self.list(Some(SupplierFilter {
            search: Some(query.to_string()),
            is_active: Some(true),
            limit: Some(50),
            offset: None,
        }))
        .await
    }

    pub async fn update(&self, id: &str, dto: &UpdateSupplierDto) -> AppResult<Supplier> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        let existing = Self::get_by_id_in_tx(&guard, id)?
            .ok_or_else(|| AppError::NotFound(format!("Supplier with ID {id} not found")))?;

        let name = dto.name.as_ref().unwrap_or(&existing.name);
        let phone = dto.phone.as_ref().unwrap_or(&existing.phone);
        let alternate_phone = match &dto.alternate_phone {
            Some(v) => Some(v.clone()),
            None => existing.alternate_phone,
        };
        let email = match &dto.email {
            Some(v) => Some(v.clone()),
            None => existing.email,
        };
        let address = match &dto.address {
            Some(v) => Some(v.clone()),
            None => existing.address,
        };
        let notes = match &dto.notes {
            Some(v) => Some(v.clone()),
            None => existing.notes,
        };
        let credit_limit = dto.credit_limit.unwrap_or(existing.credit_limit);
        let is_active = dto.is_active.unwrap_or(existing.is_active);
        let now = Utc::now().to_rfc3339();

        guard
            .execute(
                "UPDATE suppliers SET
                    name = ?1, phone = ?2, alternate_phone = ?3, email = ?4, address = ?5,
                    notes = ?6, credit_limit = ?7, is_active = ?8, updated_at = ?9
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
            .map_err(|e| AppError::Database(format!("Failed to update supplier: {e}")))?;

        drop(guard);
        self.get_by_id(id)
            .await?
            .ok_or_else(|| AppError::NotFound(format!("Supplier with ID {id} not found after update")))
    }

    pub async fn deactivate(&self, id: &str) -> AppResult<()> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;
        let now = Utc::now().to_rfc3339();
        let rows_affected = guard
            .execute(
                "UPDATE suppliers SET is_active = 0, updated_at = ?1 WHERE id = ?2",
                params![now, id],
            )
            .map_err(|e| AppError::Database(format!("Failed to deactivate supplier: {e}")))?;

        if rows_affected == 0 {
            return Err(AppError::NotFound(format!("Supplier with ID {id} not found")));
        }

        Ok(())
    }

    pub async fn get_outstanding_balance(&self, supplier_id: &str) -> AppResult<i64> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;
        let bal = Self::get_outstanding_balance_in_tx(&guard, supplier_id).map_err(AppError::from)?;
        Ok(bal)
    }

    pub async fn get_ledger_entries(
        &self,
        supplier_id: &str,
        limit: Option<i64>,
        offset: Option<i64>,
    ) -> AppResult<Vec<SupplierLedgerEntry>> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;
        let limit_val = limit.unwrap_or(100);
        let offset_val = offset.unwrap_or(0);

        let mut stmt = guard
            .prepare(
                "SELECT id, supplier_id, reference_id, reference_number, entry_type, debit, credit, balance_after, description, performed_by, created_at
                 FROM supplier_ledger_entries
                 WHERE supplier_id = ?1
                 ORDER BY created_at ASC
                 LIMIT ?2 OFFSET ?3",
            )
            .map_err(|e| AppError::Database(e.to_string()))?;

        let rows = stmt
            .query_map(params![supplier_id, limit_val, offset_val], |row| {
                let entry_str: String = row.get(4)?;
                let entry_type = SupplierLedgerEntryType::from_str(&entry_str)
                    .unwrap_or(SupplierLedgerEntryType::Adjustment);

                Ok(SupplierLedgerEntry {
                    id: row.get(0)?,
                    supplier_id: row.get(1)?,
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
            .map_err(|e| AppError::Database(e.to_string()))?;

        let mut entries = Vec::new();
        for r in rows {
            entries.push(r.map_err(|e| AppError::Database(e.to_string()))?);
        }

        Ok(entries)
    }

    pub async fn get_statement(&self, supplier_id: &str) -> AppResult<SupplierStatementDto> {
        let supplier = self
            .get_by_id(supplier_id)
            .await?
            .ok_or_else(|| AppError::NotFound(format!("Supplier with ID {supplier_id} not found")))?;

        let entries_raw = self.get_ledger_entries(supplier_id, Some(1000), Some(0)).await?;
        let current_balance = self.get_outstanding_balance(supplier_id).await?;

        let entries = entries_raw
            .into_iter()
            .map(|e| SupplierStatementRowDto {
                id: e.id,
                date: e.created_at,
                reference_number: e.reference_number,
                description: e.description,
                entry_type: e.entry_type.as_str().to_string(),
                debit: e.debit,
                credit: e.credit,
                balance: e.balance_after,
            })
            .collect();

        Ok(SupplierStatementDto {
            supplier_id: supplier.id,
            supplier_name: supplier.name,
            supplier_code: supplier.supplier_code,
            phone: supplier.phone,
            credit_limit: supplier.credit_limit,
            current_balance,
            entries,
        })
    }

    pub async fn get_detail(&self, supplier_id: &str) -> AppResult<SupplierDetailDto> {
        let supplier = self
            .get_by_id(supplier_id)
            .await?
            .ok_or_else(|| AppError::NotFound(format!("Supplier with ID {supplier_id} not found")))?;

        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        let outstanding_balance =
            Self::get_outstanding_balance_in_tx(&guard, supplier_id).map_err(AppError::from)?;

        let (total_purchases_count, total_purchases_amount): (i64, i64) = guard
            .query_row(
                "SELECT count(id), COALESCE(sum(total_amount), 0) FROM purchases WHERE supplier_id = ?1 AND status = 'COMPLETED'",
                params![supplier_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap_or((0, 0));

        let last_transaction_date: Option<String> = guard
            .query_row(
                "SELECT created_at FROM supplier_ledger_entries WHERE supplier_id = ?1 ORDER BY created_at DESC LIMIT 1",
                params![supplier_id],
                |row| row.get(0),
            )
            .ok();

        Ok(SupplierDetailDto {
            supplier,
            outstanding_balance,
            total_purchases_count,
            total_purchases_amount,
            last_transaction_date,
        })
    }
}
