use chrono::Utc;
use sqlx::{PgPool, Row};

use crate::domain::supplier::{
    Supplier, SupplierDetailDto, SupplierFilter, SupplierLedgerEntry, SupplierLedgerEntryType,
    SupplierSummaryDto, UpdateSupplierDto,
};
use crate::errors::{AppError, AppResult};

#[derive(Clone)]
pub struct PostgresSupplierRepository {
    pool: PgPool,
}

impl PostgresSupplierRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn create_supplier(&self, supplier: &Supplier) -> AppResult<Supplier> {
        sqlx::query(
            "INSERT INTO suppliers (
                id, supplier_code, name, phone, alternate_phone, email, address, notes, credit_limit, is_active, created_at, updated_at
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)",
        )
        .bind(&supplier.id)
        .bind(&supplier.supplier_code)
        .bind(supplier.name.trim())
        .bind(supplier.phone.trim())
        .bind(supplier.alternate_phone.as_deref().map(str::trim))
        .bind(supplier.email.as_deref().map(str::trim))
        .bind(supplier.address.as_deref().map(str::trim))
        .bind(supplier.notes.as_deref().map(str::trim))
        .bind(supplier.credit_limit)
        .bind(if supplier.is_active { 1 } else { 0 })
        .bind(&supplier.created_at)
        .bind(&supplier.updated_at)
        .execute(&self.pool)
        .await
        .map_err(|e| {
            let msg = e.to_string();
            if msg.contains("unique") || msg.contains("UNIQUE") {
                AppError::Conflict(format!("Supplier code '{}' already exists", supplier.supplier_code))
            } else {
                AppError::Database(format!("Failed to insert supplier: {e}"))
            }
        })?;

        Ok(supplier.clone())
    }

    pub async fn update_supplier(&self, id: &str, dto: &UpdateSupplierDto) -> AppResult<Supplier> {
        let existing = self
            .get_supplier_by_id(id)
            .await?
            .ok_or_else(|| AppError::NotFound(format!("Supplier with ID '{id}' not found")))?;

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

        sqlx::query(
            "UPDATE suppliers SET
                name = $1, phone = $2, alternate_phone = $3, email = $4,
                address = $5, notes = $6, credit_limit = $7, is_active = $8, updated_at = $9
             WHERE id = $10",
        )
        .bind(name)
        .bind(phone)
        .bind(alternate_phone.as_deref())
        .bind(email.as_deref())
        .bind(address.as_deref())
        .bind(notes.as_deref())
        .bind(credit_limit)
        .bind(if is_active { 1 } else { 0 })
        .bind(&now)
        .bind(id)
        .execute(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to update supplier: {e}")))?;

        Ok(Supplier {
            id: id.to_string(),
            supplier_code: existing.supplier_code,
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

    pub async fn get_supplier_by_id(&self, id: &str) -> AppResult<Option<Supplier>> {
        let sql = "SELECT id, supplier_code, name, phone, alternate_phone, email, address, notes, credit_limit, is_active, created_at, updated_at FROM suppliers WHERE id = $1";
        let row_opt = sqlx::query(sql)
            .bind(id)
            .fetch_optional(&self.pool)
            .await
            .map_err(|e| AppError::Database(format!("Failed to query supplier: {e}")))?;

        match row_opt {
            Some(row) => Ok(Some(Self::map_supplier_row(&row)?)),
            None => Ok(None),
        }
    }

    pub async fn get_supplier_detail(&self, id: &str) -> AppResult<SupplierDetailDto> {
        let supplier = self
            .get_supplier_by_id(id)
            .await?
            .ok_or_else(|| AppError::NotFound(format!("Supplier '{id}' not found")))?;

        let balance = self.calculate_outstanding_balance(id).await?;

        let (purchases_count, purchases_amount): (i64, i64) = sqlx::query_as(
            "SELECT COUNT(*), COALESCE(SUM(total_amount), 0) FROM purchases WHERE supplier_id = $1 AND status = 'COMPLETED'",
        )
        .bind(id)
        .fetch_one(&self.pool)
        .await
        .unwrap_or((0, 0));

        let last_tx_date: Option<String> = sqlx::query_as(
            "SELECT created_at FROM supplier_ledger_entries WHERE supplier_id = $1 ORDER BY created_at DESC LIMIT 1",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await
        .unwrap_or(None)
        .map(|r: (String,)| r.0);

        Ok(SupplierDetailDto {
            supplier,
            outstanding_balance: balance,
            total_purchases_count: purchases_count,
            total_purchases_amount: purchases_amount,
            last_transaction_date: last_tx_date,
        })
    }

    pub async fn list_suppliers(
        &self,
        filter: &SupplierFilter,
    ) -> AppResult<Vec<SupplierSummaryDto>> {
        let mut query = String::from(
            "SELECT s.id, s.supplier_code, s.name, s.phone, s.credit_limit,
                    COALESCE(SUM(l.credit) - SUM(l.debit), 0) AS balance,
                    s.is_active, s.created_at
             FROM suppliers s
             LEFT JOIN supplier_ledger_entries l ON s.id = l.supplier_id
             WHERE 1=1",
        );

        let mut param_index = 1;

        if filter.is_active.is_some() {
            query.push_str(&format!(" AND s.is_active = ${param_index}"));
            param_index += 1;
        }

        if let Some(ref search_str) = filter.search {
            let s_trim = search_str.trim();
            if !s_trim.is_empty() {
                query.push_str(&format!(" AND (s.name ILIKE ${param_index} OR s.phone ILIKE ${param_index} OR s.supplier_code ILIKE ${param_index})"));
                param_index += 1;
            }
        }

        query.push_str(" GROUP BY s.id ORDER BY s.name ASC");

        if let Some(lim) = filter.limit {
            query.push_str(&format!(" LIMIT {lim}"));
            if let Some(off) = filter.offset {
                query.push_str(&format!(" OFFSET {off}"));
            }
        }

        let mut q = sqlx::query(&query);

        if let Some(active) = filter.is_active {
            q = q.bind(if active { 1 } else { 0 });
        }

        if let Some(ref search_str) = filter.search {
            let s_trim = search_str.trim();
            if !s_trim.is_empty() {
                let pattern = format!("%{s_trim}%");
                q = q.bind(pattern);
            }
        }

        let rows = q
            .fetch_all(&self.pool)
            .await
            .map_err(|e| AppError::Database(format!("Failed to query supplier summaries: {e}")))?;

        let mut result = Vec::with_capacity(rows.len());
        for row in rows {
            let is_active_int: i32 = row.try_get(6).unwrap_or(1);
            result.push(SupplierSummaryDto {
                id: row.try_get(0).map_err(|e| AppError::Database(e.to_string()))?,
                supplier_code: row.try_get(1).map_err(|e| AppError::Database(e.to_string()))?,
                name: row.try_get(2).map_err(|e| AppError::Database(e.to_string()))?,
                phone: row.try_get(3).map_err(|e| AppError::Database(e.to_string()))?,
                credit_limit: row.try_get(4).map_err(|e| AppError::Database(e.to_string()))?,
                outstanding_balance: row.try_get(5).unwrap_or(0),
                is_active: is_active_int == 1,
                created_at: row.try_get(7).map_err(|e| AppError::Database(e.to_string()))?,
            });
        }

        Ok(result)
    }

    pub async fn search_suppliers(&self, query: &str) -> AppResult<Vec<SupplierSummaryDto>> {
        self.list_suppliers(&SupplierFilter {
            search: Some(query.to_string()),
            is_active: Some(true),
            limit: Some(50),
            offset: None,
        })
        .await
    }

    pub async fn calculate_outstanding_balance(&self, supplier_id: &str) -> AppResult<i64> {
        let row: (i64,) = sqlx::query_as(
            "SELECT COALESCE(SUM(credit) - SUM(debit), 0) FROM supplier_ledger_entries WHERE supplier_id = $1",
        )
        .bind(supplier_id)
        .fetch_one(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to calculate supplier ledger balance: {e}")))?;

        Ok(row.0)
    }

    pub async fn get_ledger(
        &self,
        supplier_id: &str,
        limit: Option<i64>,
        offset: Option<i64>,
    ) -> AppResult<Vec<SupplierLedgerEntry>> {
        let lim = limit.unwrap_or(100);
        let off = offset.unwrap_or(0);

        let sql = "
            SELECT id, supplier_id, reference_id, reference_number, entry_type, debit, credit, balance_after, description, performed_by, created_at
            FROM supplier_ledger_entries
            WHERE supplier_id = $1
            ORDER BY created_at DESC, id DESC
            LIMIT $2 OFFSET $3
        ";

        let rows = sqlx::query(sql)
            .bind(supplier_id)
            .bind(lim)
            .bind(off)
            .fetch_all(&self.pool)
            .await
            .map_err(|e| AppError::Database(format!("Failed to query supplier ledger: {e}")))?;

        let mut list = Vec::with_capacity(rows.len());
        for row in rows {
            let type_str: String = row.try_get(4).map_err(|e| AppError::Database(e.to_string()))?;
            let entry_type = SupplierLedgerEntryType::from_str(&type_str)
                .unwrap_or(SupplierLedgerEntryType::Purchase);

            list.push(SupplierLedgerEntry {
                id: row.try_get(0).map_err(|e| AppError::Database(e.to_string()))?,
                supplier_id: row.try_get(1).map_err(|e| AppError::Database(e.to_string()))?,
                reference_id: row.try_get(2).unwrap_or(None),
                reference_number: row.try_get(3).unwrap_or(None),
                entry_type,
                debit: row.try_get(5).map_err(|e| AppError::Database(e.to_string()))?,
                credit: row.try_get(6).map_err(|e| AppError::Database(e.to_string()))?,
                balance_after: row.try_get(7).map_err(|e| AppError::Database(e.to_string()))?,
                description: row.try_get(8).map_err(|e| AppError::Database(e.to_string()))?,
                performed_by: row.try_get(9).unwrap_or(None),
                created_at: row.try_get(10).map_err(|e| AppError::Database(e.to_string()))?,
            });
        }

        Ok(list)
    }

    pub async fn deactivate_supplier(&self, id: &str) -> AppResult<()> {
        let now = Utc::now().to_rfc3339();
        let res = sqlx::query("UPDATE suppliers SET is_active = 0, updated_at = $1 WHERE id = $2")
            .bind(&now)
            .bind(id)
            .execute(&self.pool)
            .await
            .map_err(|e| AppError::Database(format!("Failed to deactivate supplier: {e}")))?;

        if res.rows_affected() == 0 {
            Err(AppError::NotFound(format!("Supplier '{id}' not found")))
        } else {
            Ok(())
        }
    }

    fn map_supplier_row(row: &sqlx::postgres::PgRow) -> AppResult<Supplier> {
        let is_active_int: i32 = row.try_get(9).unwrap_or(1);
        Ok(Supplier {
            id: row.try_get(0).map_err(|e| AppError::Database(e.to_string()))?,
            supplier_code: row.try_get(1).map_err(|e| AppError::Database(e.to_string()))?,
            name: row.try_get(2).map_err(|e| AppError::Database(e.to_string()))?,
            phone: row.try_get(3).map_err(|e| AppError::Database(e.to_string()))?,
            alternate_phone: row.try_get(4).unwrap_or(None),
            email: row.try_get(5).unwrap_or(None),
            address: row.try_get(6).unwrap_or(None),
            notes: row.try_get(7).unwrap_or(None),
            credit_limit: row.try_get(8).unwrap_or(0),
            is_active: is_active_int == 1,
            created_at: row.try_get(10).map_err(|e| AppError::Database(e.to_string()))?,
            updated_at: row.try_get(11).map_err(|e| AppError::Database(e.to_string()))?,
        })
    }
}
