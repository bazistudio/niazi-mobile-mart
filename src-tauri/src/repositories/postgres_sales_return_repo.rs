use chrono::Utc;
use sqlx::{PgPool, Row};
use uuid::Uuid;

use crate::domain::sales_return::{
    CreateSalesReturnDto, SalesReturn, SalesReturnFilterDto, SalesReturnLine,
    SalesReturnDetailDto,
};
use crate::errors::{AppError, AppResult};

#[derive(Clone)]
pub struct PostgresSalesReturnRepository {
    pool: PgPool,
}

impl PostgresSalesReturnRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn process_return(
        &self,
        dto: &CreateSalesReturnDto,
        user_id: Option<&str>,
    ) -> AppResult<SalesReturnDetailDto> {
        if dto.items.is_empty() {
            return Err(AppError::Validation("Return cart cannot be empty".to_string()));
        }

        let mut tx = self.pool.begin().await.map_err(|e| AppError::Database(e.to_string()))?;

        // Validate original sale
        let sale_row = sqlx::query("SELECT id, invoice_number, branch_id, customer_id, customer_name_snapshot, sale_status FROM sales WHERE id = $1")
            .bind(&dto.sale_id)
            .fetch_optional(&mut *tx)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;

        let (sale_id, invoice_number, branch_id, customer_id, customer_name_snapshot) = match sale_row {
            Some(row) => {
                let status: String = row.try_get(5).unwrap_or_default();
                if status != "COMPLETED" {
                    return Err(AppError::Validation(format!("Cannot return items from sale with status '{status}'")));
                }
                (
                    row.try_get::<String, _>(0).unwrap(),
                    row.try_get::<String, _>(1).unwrap(),
                    row.try_get::<String, _>(2).unwrap(),
                    row.try_get::<Option<String>, _>(3).unwrap_or(None),
                    row.try_get::<Option<String>, _>(4).unwrap_or(None),
                )
            }
            None => return Err(AppError::NotFound(format!("Original sale '{}' not found", dto.sale_id))),
        };

        struct PreparedReturnLine {
            sale_line_id: String,
            product_id: String,
            product_name: String,
            sku: String,
            unit_price: i64,
            return_quantity: i64,
            return_amount: i64,
        }

        let mut prepared_lines = Vec::with_capacity(dto.items.len());

        for item in &dto.items {
            if item.quantity <= 0 {
                return Err(AppError::Validation("Return quantity must be > 0".to_string()));
            }

            let line_row = sqlx::query("SELECT id, product_id, product_name_snapshot, sku_snapshot, unit_price, quantity FROM sale_lines WHERE id = $1 AND sale_id = $2")
                .bind(&item.sale_line_id)
                .bind(&sale_id)
                .fetch_optional(&mut *tx)
                .await
                .map_err(|e| AppError::Database(e.to_string()))?;

            let line = match line_row {
                Some(r) => r,
                None => return Err(AppError::NotFound(format!("Sale line '{}' not found for sale", item.sale_line_id))),
            };

            let orig_qty: i64 = line.try_get(5).unwrap();
            let prev_returned: (i64,) = sqlx::query_as(
                "SELECT COALESCE(SUM(quantity), 0) FROM sales_return_lines WHERE sale_line_id = $1",
            )
            .bind(&item.sale_line_id)
            .fetch_one(&mut *tx)
            .await
            .unwrap_or((0,));

            let max_returnable = orig_qty - prev_returned.0;
            if item.quantity > max_returnable {
                return Err(AppError::Validation(format!(
                    "Cannot return {} units of product '{}'. Maximum returnable is {}",
                    item.quantity, line.try_get::<String, _>(2).unwrap(), max_returnable
                )));
            }

            let unit_price: i64 = line.try_get(4).unwrap();
            let return_amount = unit_price * item.quantity;

            prepared_lines.push(PreparedReturnLine {
                sale_line_id: item.sale_line_id.clone(),
                product_id: line.try_get(1).unwrap(),
                product_name: line.try_get(2).unwrap(),
                sku: line.try_get(3).unwrap(),
                unit_price,
                return_quantity: item.quantity,
                return_amount,
            });
        }

        let total_return_amount: i64 = prepared_lines.iter().map(|l| l.return_amount).sum();
        let refund_method = dto.refund_method.to_uppercase();

        if refund_method == "CUSTOMER_CREDIT" && customer_id.is_none() {
            return Err(AppError::Validation("Customer credit refund requires a registered customer.".to_string()));
        }

        sqlx::query("UPDATE counters SET value = value + 1 WHERE name = 'sales_return_number'")
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;

        let ret_val: (i64,) = sqlx::query_as("SELECT value FROM counters WHERE name = 'sales_return_number'")
            .fetch_one(&mut *tx)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;

        let return_number = format!("SR-{:06}", ret_val.0);
        let return_id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        let uid = user_id.map(|s| s.to_string());

        let sales_return = SalesReturn {
            id: return_id.clone(),
            return_number: return_number.clone(),
            sale_id: sale_id.clone(),
            branch_id: branch_id.clone(),
            customer_id: customer_id.clone(),
            customer_name_snapshot,
            total_amount: total_return_amount,
            refund_method: refund_method.clone(),
            status: "COMPLETED".to_string(),
            reason: dto.reason.clone(),
            notes: dto.notes.clone(),
            performed_by: uid.clone(),
            created_at: now.clone(),
            updated_at: now.clone(),
        };

        sqlx::query(
            "INSERT INTO sales_returns (id, return_number, sale_id, branch_id, customer_id, customer_name_snapshot, total_amount, refund_method, status, reason, notes, performed_by, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)"
        )
        .bind(&sales_return.id)
        .bind(&sales_return.return_number)
        .bind(&sales_return.sale_id)
        .bind(&sales_return.branch_id)
        .bind(sales_return.customer_id.as_deref())
        .bind(sales_return.customer_name_snapshot.as_deref())
        .bind(sales_return.total_amount)
        .bind(&sales_return.refund_method)
        .bind(&sales_return.status)
        .bind(sales_return.reason.as_deref())
        .bind(sales_return.notes.as_deref())
        .bind(sales_return.performed_by.as_deref())
        .bind(&sales_return.created_at)
        .bind(&sales_return.updated_at)
        .execute(&mut *tx)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

        let mut inserted_lines = Vec::with_capacity(prepared_lines.len());

        for line in prepared_lines {
            let line_id = Uuid::new_v4().to_string();
            let rline = SalesReturnLine {
                id: line_id.clone(),
                return_id: return_id.clone(),
                sale_line_id: line.sale_line_id.clone(),
                product_id: line.product_id.clone(),
                product_name_snapshot: line.product_name.clone(),
                sku_snapshot: line.sku.clone(),
                unit_price: line.unit_price,
                quantity: line.return_quantity,
                return_amount: line.return_amount,
                created_at: now.clone(),
            };

            sqlx::query(
                "INSERT INTO sales_return_lines (id, return_id, sale_line_id, product_id, product_name_snapshot, sku_snapshot, unit_price, quantity, return_amount, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)"
            )
            .bind(&rline.id)
            .bind(&rline.return_id)
            .bind(&rline.sale_line_id)
            .bind(&rline.product_id)
            .bind(&rline.product_name_snapshot)
            .bind(&rline.sku_snapshot)
            .bind(rline.unit_price)
            .bind(rline.quantity)
            .bind(rline.return_amount)
            .bind(&rline.created_at)
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;

            // Restock inventory
            let current_stock: (i64,) = sqlx::query_as("SELECT quantity FROM stock WHERE product_id = $1 AND branch_id = $2")
                .bind(&line.product_id)
                .bind(&branch_id)
                .fetch_optional(&mut *tx)
                .await
                .map_err(|e| AppError::Database(e.to_string()))?
                .unwrap_or((0,));

            let new_stock = current_stock.0 + line.return_quantity;

            sqlx::query(
                "INSERT INTO stock (product_id, branch_id, quantity, updated_at)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (product_id, branch_id) DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = EXCLUDED.updated_at"
            )
            .bind(&line.product_id)
            .bind(&branch_id)
            .bind(new_stock)
            .bind(&now)
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;

            let m_id = Uuid::new_v4().to_string();
            let reason = format!("Sales Return {}", return_number);

            sqlx::query(
                "INSERT INTO stock_movements (id, product_id, branch_id, movement_type, quantity, previous_stock, resulting_stock, reason, performed_by, reference_id, created_at)
                 VALUES ($1, $2, $3, 'IN', $4, $5, $6, $7, $8, $9, $10)"
            )
            .bind(m_id)
            .bind(&line.product_id)
            .bind(&branch_id)
            .bind(line.return_quantity)
            .bind(current_stock.0)
            .bind(new_stock)
            .bind(reason)
            .bind(uid.as_deref())
            .bind(&return_id)
            .bind(&now)
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;

            inserted_lines.push(rline);
        }

        // Refund Settlement
        let mut customer_balance_after = None;
        if refund_method == "CASH" {
            let open_session_id: Option<String> = sqlx::query_as(
                "SELECT id FROM cash_sessions WHERE branch_id = $1 AND status = 'OPEN' LIMIT 1",
            )
            .bind(&branch_id)
            .fetch_optional(&mut *tx)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?
            .map(|r: (String,)| r.0);

            let c_id = Uuid::new_v4().to_string();
            let desc = format!("Sales Return Cash Refund {}", return_number);

            sqlx::query(
                "INSERT INTO cash_movements (id, session_id, branch_id, movement_type, direction, amount, reference_id, reference_number, payment_method, description, performed_by, created_at)
                 VALUES ($1, $2, $3, 'CASH_ADJUSTMENT', 'OUT', $4, $5, $6, 'CASH', $7, $8, $9)"
            )
            .bind(c_id)
            .bind(open_session_id.as_deref())
            .bind(&branch_id)
            .bind(total_return_amount)
            .bind(&return_id)
            .bind(&return_number)
            .bind(desc)
            .bind(uid.as_deref())
            .bind(&now)
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;
        } else if refund_method == "CUSTOMER_CREDIT" {
            let cid = customer_id.as_ref().unwrap();
            let current_outstanding: (i64,) = sqlx::query_as(
                "SELECT COALESCE(SUM(debit) - SUM(credit), 0) FROM customer_ledger_entries WHERE customer_id = $1",
            )
            .bind(cid)
            .fetch_one(&mut *tx)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;

            let new_bal = (current_outstanding.0 - total_return_amount).max(0);
            customer_balance_after = Some(new_bal);

            let l_id = Uuid::new_v4().to_string();
            let desc = format!("Sales Return Credit {}", return_number);

            sqlx::query(
                "INSERT INTO customer_ledger_entries (id, customer_id, reference_id, reference_number, entry_type, debit, credit, balance_after, description, performed_by, created_at)
                 VALUES ($1, $2, $3, $4, 'ADJUSTMENT', 0, $5, $6, $7, $8, $9)"
            )
            .bind(l_id)
            .bind(cid)
            .bind(&return_id)
            .bind(&return_number)
            .bind(total_return_amount)
            .bind(new_bal)
            .bind(desc)
            .bind(uid.as_deref())
            .bind(&now)
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;
        }

        tx.commit().await.map_err(|e| AppError::Database(e.to_string()))?;

        Ok(SalesReturnDetailDto {
            sales_return,
            lines: inserted_lines,
            customer_outstanding_balance: customer_balance_after,
        })
    }

    pub async fn get_return_by_id(&self, id: &str) -> AppResult<Option<SalesReturn>> {
        let sql = "SELECT id, return_number, sale_id, branch_id, customer_id, customer_name_snapshot, total_amount, refund_method, status, reason, notes, performed_by, created_at, updated_at FROM sales_returns WHERE id = $1";
        let row_opt = sqlx::query(sql)
            .bind(id)
            .fetch_optional(&self.pool)
            .await
            .map_err(|e| AppError::Database(format!("Failed to query sales return: {e}")))?;

        match row_opt {
            Some(row) => Ok(Some(Self::map_return_row(&row)?)),
            None => Ok(None),
        }
    }

    pub async fn list_returns(
        &self,
        filter: &Option<SalesReturnFilterDto>,
    ) -> AppResult<Vec<SalesReturn>> {
        let mut query = String::from("SELECT id, return_number, sale_id, branch_id, customer_id, customer_name_snapshot, total_amount, refund_method, status, reason, notes, performed_by, created_at, updated_at FROM sales_returns WHERE 1=1");
        let mut param_index = 1;

        if let Some(f) = filter {
            if f.sale_id.is_some() {
                query.push_str(&format!(" AND sale_id = ${param_index}"));
                param_index += 1;
            }
            if f.branch_id.is_some() {
                query.push_str(&format!(" AND branch_id = ${param_index}"));
                param_index += 1;
            }
            if f.customer_id.is_some() {
                query.push_str(&format!(" AND customer_id = ${param_index}"));
                param_index += 1;
            }
        }

        query.push_str(" ORDER BY created_at DESC, id DESC");

        let lim = filter.as_ref().and_then(|f| f.limit).unwrap_or(50);
        query.push_str(&format!(" LIMIT {lim}"));

        let mut q = sqlx::query(&query);

        if let Some(f) = filter {
            if let Some(sid) = &f.sale_id {
                q = q.bind(sid);
            }
            if let Some(bid) = &f.branch_id {
                q = q.bind(bid);
            }
            if let Some(cid) = &f.customer_id {
                q = q.bind(cid);
            }
        }

        let rows = q
            .fetch_all(&self.pool)
            .await
            .map_err(|e| AppError::Database(format!("Failed to query sales returns: {e}")))?;

        let mut list = Vec::with_capacity(rows.len());
        for row in rows {
            list.push(Self::map_return_row(&row)?);
        }

        Ok(list)
    }

    fn map_return_row(row: &sqlx::postgres::PgRow) -> AppResult<SalesReturn> {
        Ok(SalesReturn {
            id: row.try_get(0).map_err(|e| AppError::Database(e.to_string()))?,
            return_number: row.try_get(1).map_err(|e| AppError::Database(e.to_string()))?,
            sale_id: row.try_get(2).map_err(|e| AppError::Database(e.to_string()))?,
            branch_id: row.try_get(3).map_err(|e| AppError::Database(e.to_string()))?,
            customer_id: row.try_get(4).unwrap_or(None),
            customer_name_snapshot: row.try_get(5).unwrap_or(None),
            total_amount: row.try_get(6).map_err(|e| AppError::Database(e.to_string()))?,
            refund_method: row.try_get(7).map_err(|e| AppError::Database(e.to_string()))?,
            status: row.try_get(8).map_err(|e| AppError::Database(e.to_string()))?,
            reason: row.try_get(9).unwrap_or(None),
            notes: row.try_get(10).unwrap_or(None),
            performed_by: row.try_get(11).unwrap_or(None),
            created_at: row.try_get(12).map_err(|e| AppError::Database(e.to_string()))?,
            updated_at: row.try_get(13).map_err(|e| AppError::Database(e.to_string()))?,
        })
    }
}
