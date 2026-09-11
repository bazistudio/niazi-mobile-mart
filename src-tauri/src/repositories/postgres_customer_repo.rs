use chrono::Utc;
use sqlx::{PgPool, Row};

use crate::domain::cash::{CashMovement, CashMovementDirection, CashMovementType};
use crate::domain::customer::{
    Customer, CustomerDetailDto, CustomerFilter, CustomerLedgerEntry, CustomerLedgerEntryType,
    CustomerPaymentResultDto, CustomerStatementDto, CustomerStatementRowDto, CustomerSummaryDto,
    RecordCustomerPaymentDto, UpdateCustomerDto,
};
use crate::errors::{AppError, AppResult};

#[derive(Clone)]
pub struct PostgresCustomerRepository {
    pool: PgPool,
}

impl PostgresCustomerRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn create_customer(&self, customer: &Customer) -> AppResult<Customer> {
        sqlx::query(
            "INSERT INTO customers (
                id, customer_code, name, phone, alternate_phone, email, address, notes, credit_limit, is_active, created_at, updated_at
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)",
        )
        .bind(&customer.id)
        .bind(&customer.customer_code)
        .bind(customer.name.trim())
        .bind(customer.phone.trim())
        .bind(customer.alternate_phone.as_deref().map(str::trim))
        .bind(customer.email.as_deref().map(str::trim))
        .bind(customer.address.as_deref().map(str::trim))
        .bind(customer.notes.as_deref().map(str::trim))
        .bind(customer.credit_limit)
        .bind(if customer.is_active { 1 } else { 0 })
        .bind(&customer.created_at)
        .bind(&customer.updated_at)
        .execute(&self.pool)
        .await
        .map_err(|e| {
            let msg = e.to_string();
            if msg.contains("unique") || msg.contains("UNIQUE") {
                AppError::Conflict(format!("Customer code '{}' already exists", customer.customer_code))
            } else {
                AppError::Database(format!("Failed to insert customer: {e}"))
            }
        })?;

        Ok(customer.clone())
    }

    pub async fn update_customer(&self, id: &str, dto: &UpdateCustomerDto) -> AppResult<Customer> {
        let existing = self
            .get_customer_by_id(id)
            .await?
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

        sqlx::query(
            "UPDATE customers SET
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

    pub async fn get_customer_by_id(&self, id: &str) -> AppResult<Option<Customer>> {
        let sql = "SELECT id, customer_code, name, phone, alternate_phone, email, address, notes, credit_limit, is_active, created_at, updated_at FROM customers WHERE id = $1";
        let row_opt = sqlx::query(sql)
            .bind(id)
            .fetch_optional(&self.pool)
            .await
            .map_err(|e| AppError::Database(format!("Failed to query customer: {e}")))?;

        match row_opt {
            Some(row) => Ok(Some(Self::map_customer_row(&row)?)),
            None => Ok(None),
        }
    }

    pub async fn get_customer_by_phone(&self, phone: &str) -> AppResult<Option<Customer>> {
        let sql = "SELECT id, customer_code, name, phone, alternate_phone, email, address, notes, credit_limit, is_active, created_at, updated_at FROM customers WHERE phone = $1 LIMIT 1";
        let row_opt = sqlx::query(sql)
            .bind(phone.trim())
            .fetch_optional(&self.pool)
            .await
            .map_err(|e| AppError::Database(format!("Failed to query customer by phone: {e}")))?;

        match row_opt {
            Some(row) => Ok(Some(Self::map_customer_row(&row)?)),
            None => Ok(None),
        }
    }

    pub async fn get_customer_detail(&self, id: &str) -> AppResult<CustomerDetailDto> {
        let customer = self
            .get_customer_by_id(id)
            .await?
            .ok_or_else(|| AppError::NotFound(format!("Customer '{id}' not found")))?;

        let balance = self.calculate_outstanding_balance(id).await?;

        let (sales_count, sales_amount): (i64, i64) = sqlx::query_as(
            "SELECT COUNT(*), COALESCE(SUM(total_amount), 0) FROM sales WHERE customer_id = $1 AND sale_status = 'COMPLETED'",
        )
        .bind(id)
        .fetch_one(&self.pool)
        .await
        .unwrap_or((0, 0));

        let last_tx_date: Option<String> = sqlx::query_as(
            "SELECT created_at FROM customer_ledger_entries WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 1",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await
        .unwrap_or(None)
        .map(|r: (String,)| r.0);

        Ok(CustomerDetailDto {
            customer,
            outstanding_balance: balance,
            total_sales_count: sales_count,
            total_sales_amount: sales_amount,
            last_transaction_date: last_tx_date,
        })
    }

    pub async fn list_customers(
        &self,
        filter: &CustomerFilter,
    ) -> AppResult<Vec<CustomerSummaryDto>> {
        let mut query = String::from(
            "SELECT c.id, c.customer_code, c.name, c.phone, c.credit_limit,
                    COALESCE(SUM(l.debit) - SUM(l.credit), 0) AS balance,
                    c.is_active, c.created_at
             FROM customers c
             LEFT JOIN customer_ledger_entries l ON c.id = l.customer_id
             WHERE 1=1",
        );

        let mut param_index = 1;

        if filter.is_active.is_some() {
            query.push_str(&format!(" AND c.is_active = ${param_index}"));
            param_index += 1;
        }

        if let Some(ref s) = filter.search {
            let s_trim = s.trim();
            if !s_trim.is_empty() {
                query.push_str(&format!(" AND (c.name ILIKE ${param_index} OR c.phone ILIKE ${param_index} OR c.customer_code ILIKE ${param_index})"));
                param_index += 1;
            }
        }

        query.push_str(" GROUP BY c.id ORDER BY c.name ASC");

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

        if let Some(ref s) = filter.search {
            let s_trim = s.trim();
            if !s_trim.is_empty() {
                let pattern = format!("%{s_trim}%");
                q = q.bind(pattern);
            }
        }

        let rows = q
            .fetch_all(&self.pool)
            .await
            .map_err(|e| AppError::Database(format!("Failed to query customer summaries: {e}")))?;

        let mut result = Vec::with_capacity(rows.len());
        for row in rows {
            let is_active_int: i32 = row.try_get(6).unwrap_or(1);
            result.push(CustomerSummaryDto {
                id: row.try_get(0).map_err(|e| AppError::Database(e.to_string()))?,
                customer_code: row.try_get(1).map_err(|e| AppError::Database(e.to_string()))?,
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

    pub async fn search_customers(&self, query: &str) -> AppResult<Vec<CustomerSummaryDto>> {
        self.list_customers(&CustomerFilter {
            search: Some(query.to_string()),
            is_active: Some(true),
            limit: Some(50),
            offset: None,
        })
        .await
    }

    pub async fn calculate_outstanding_balance(&self, customer_id: &str) -> AppResult<i64> {
        let row: (i64,) = sqlx::query_as(
            "SELECT COALESCE(SUM(debit) - SUM(credit), 0) FROM customer_ledger_entries WHERE customer_id = $1",
        )
        .bind(customer_id)
        .fetch_one(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to calculate ledger balance: {e}")))?;

        Ok(row.0)
    }

    pub async fn get_ledger(
        &self,
        customer_id: &str,
        limit: Option<i64>,
        offset: Option<i64>,
    ) -> AppResult<Vec<CustomerLedgerEntry>> {
        let lim = limit.unwrap_or(100);
        let off = offset.unwrap_or(0);

        let sql = "
            SELECT id, customer_id, reference_id, reference_number, entry_type, debit, credit, balance_after, description, performed_by, created_at
            FROM customer_ledger_entries
            WHERE customer_id = $1
            ORDER BY created_at DESC, id DESC
            LIMIT $2 OFFSET $3
        ";

        let rows = sqlx::query(sql)
            .bind(customer_id)
            .bind(lim)
            .bind(off)
            .fetch_all(&self.pool)
            .await
            .map_err(|e| AppError::Database(format!("Failed to query ledger: {e}")))?;

        let mut list = Vec::with_capacity(rows.len());
        for row in rows {
            let type_str: String = row.try_get(4).map_err(|e| AppError::Database(e.to_string()))?;
            let entry_type = CustomerLedgerEntryType::from_str(&type_str)
                .unwrap_or(CustomerLedgerEntryType::Sale);

            list.push(CustomerLedgerEntry {
                id: row.try_get(0).map_err(|e| AppError::Database(e.to_string()))?,
                customer_id: row.try_get(1).map_err(|e| AppError::Database(e.to_string()))?,
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

    pub async fn get_statement(&self, customer_id: &str) -> AppResult<CustomerStatementDto> {
        let customer = self
            .get_customer_by_id(customer_id)
            .await?
            .ok_or_else(|| AppError::NotFound(format!("Customer '{customer_id}' not found")))?;

        let sql = "
            SELECT id, created_at, reference_number, description, entry_type, debit, credit, balance_after
            FROM customer_ledger_entries
            WHERE customer_id = $1
            ORDER BY created_at ASC, id ASC
        ";

        let rows = sqlx::query(sql)
            .bind(customer_id)
            .fetch_all(&self.pool)
            .await
            .map_err(|e| AppError::Database(format!("Failed to query statement rows: {e}")))?;

        let mut entries = Vec::with_capacity(rows.len());
        let mut current_bal = 0;
        for row in rows {
            let bal: i64 = row.try_get(7).map_err(|e| AppError::Database(e.to_string()))?;
            current_bal = bal;
            entries.push(CustomerStatementRowDto {
                id: row.try_get(0).map_err(|e| AppError::Database(e.to_string()))?,
                date: row.try_get(1).map_err(|e| AppError::Database(e.to_string()))?,
                reference_number: row.try_get(2).unwrap_or(None),
                description: row.try_get(3).map_err(|e| AppError::Database(e.to_string()))?,
                entry_type: row.try_get(4).map_err(|e| AppError::Database(e.to_string()))?,
                debit: row.try_get(5).map_err(|e| AppError::Database(e.to_string()))?,
                credit: row.try_get(6).map_err(|e| AppError::Database(e.to_string()))?,
                balance: bal,
            });
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

    pub async fn deactivate_customer(&self, id: &str) -> AppResult<()> {
        let now = Utc::now().to_rfc3339();
        let res = sqlx::query("UPDATE customers SET is_active = 0, updated_at = $1 WHERE id = $2")
            .bind(&now)
            .bind(id)
            .execute(&self.pool)
            .await
            .map_err(|e| AppError::Database(format!("Failed to deactivate customer: {e}")))?;

        if res.rows_affected() == 0 {
            Err(AppError::NotFound(format!("Customer '{id}' not found")))
        } else {
            Ok(())
        }
    }

    fn map_customer_row(row: &sqlx::postgres::PgRow) -> AppResult<Customer> {
        let is_active_int: i32 = row.try_get(9).unwrap_or(1);
        Ok(Customer {
            id: row.try_get(0).map_err(|e| AppError::Database(e.to_string()))?,
            customer_code: row.try_get(1).map_err(|e| AppError::Database(e.to_string()))?,
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
