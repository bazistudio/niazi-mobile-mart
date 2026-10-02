use chrono::Utc;
use sqlx::{PgPool, Row};
use uuid::Uuid;

use crate::domain::purchase_return::{
    CreatePurchaseReturnDto, PurchaseReturn, PurchaseReturnFilterDto, PurchaseReturnLine,
    PurchaseReturnDetailDto, PurchaseReturnStatus, PurchaseSettlementMethod,
};
use crate::errors::{AppError, AppResult};

#[derive(Clone)]
pub struct PostgresPurchaseReturnRepository {
    pool: PgPool,
}

impl PostgresPurchaseReturnRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn sync_purchase_return_tx(
        tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
        event: &crate::domain::purchase_return::PurchaseReturnSyncEventDto,
    ) -> AppResult<crate::domain::purchase_return::PurchaseReturnSyncEventDto> {
        let p = &event.purchase_return;
        sqlx::query(
            "INSERT INTO purchase_returns (
                id, return_number, purchase_id, branch_id, supplier_id, supplier_name_snapshot,
                total_amount, settlement_method, status, reason, notes, performed_by, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)"
        )
        .bind(&p.id)
        .bind(&p.return_number)
        .bind(&p.purchase_id)
        .bind(&p.branch_id)
        .bind(&p.supplier_id)
        .bind(p.supplier_name_snapshot.as_deref())
        .bind(p.total_amount)
        .bind(p.settlement_method.as_str())
        .bind(p.status.as_str())
        .bind(p.reason.as_deref())
        .bind(p.notes.as_deref())
        .bind(p.performed_by.as_deref())
        .bind(&p.created_at)
        .bind(&p.updated_at)
        .execute(&mut **tx)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

        for line in &event.lines {
            sqlx::query(
                "INSERT INTO purchase_return_lines (
                    id, return_id, purchase_line_id, product_id, product_name_snapshot,
                    sku_snapshot, unit_cost, quantity, return_amount, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)"
            )
            .bind(&line.id)
            .bind(&line.return_id)
            .bind(&line.purchase_line_id)
            .bind(&line.product_id)
            .bind(&line.product_name_snapshot)
            .bind(&line.sku_snapshot)
            .bind(line.unit_cost)
            .bind(line.quantity)
            .bind(line.return_amount)
            .bind(&line.created_at)
            .execute(&mut **tx)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;
        }

        for m in &event.stock_movements {
            sqlx::query(
                "INSERT INTO stock (product_id, branch_id, quantity, updated_at)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (product_id, branch_id) DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = EXCLUDED.updated_at"
            )
            .bind(&m.product_id)
            .bind(&m.branch_id)
            .bind(m.resulting_stock)
            .bind(&m.created_at)
            .execute(&mut **tx)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;

            sqlx::query(
                "INSERT INTO stock_movements (id, product_id, branch_id, movement_type, quantity, previous_stock, resulting_stock, reason, performed_by, reference_id, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)"
            )
            .bind(&m.id)
            .bind(&m.product_id)
            .bind(&m.branch_id)
            .bind(m.movement_type.as_str())
            .bind(m.quantity)
            .bind(m.previous_stock)
            .bind(m.resulting_stock)
            .bind(m.reason.as_deref())
            .bind(m.performed_by.as_deref())
            .bind(m.reference_id.as_deref())
            .bind(&m.created_at)
            .execute(&mut **tx)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;
        }

        if let Some(c) = &event.cash_movement {
            sqlx::query(
                "INSERT INTO cash_movements (id, session_id, branch_id, movement_type, direction, amount, reference_id, reference_number, payment_method, description, performed_by, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)"
            )
            .bind(&c.id)
            .bind(c.session_id.as_deref())
            .bind(&c.branch_id)
            .bind(c.movement_type.as_str())
            .bind(c.direction.as_str())
            .bind(c.amount)
            .bind(c.reference_id.as_deref())
            .bind(c.reference_number.as_deref())
            .bind(&c.payment_method)
            .bind(&c.description)
            .bind(c.performed_by.as_deref())
            .bind(&c.created_at)
            .execute(&mut **tx)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;
        }

        if let Some(l) = &event.supplier_ledger_entry {
            sqlx::query(
                "INSERT INTO supplier_ledger_entries (id, supplier_id, reference_id, reference_number, entry_type, debit, credit, balance_after, description, performed_by, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)"
            )
            .bind(&l.id)
            .bind(&l.supplier_id)
            .bind(l.reference_id.as_deref())
            .bind(l.reference_number.as_deref())
            .bind(l.entry_type.as_str())
            .bind(l.debit)
            .bind(l.credit)
            .bind(l.balance_after)
            .bind(&l.description)
            .bind(l.performed_by.as_deref())
            .bind(&l.created_at)
            .execute(&mut **tx)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;
        }

        Ok(event.clone())
    }

    pub async fn process_return(
        &self,
        dto: &CreatePurchaseReturnDto,
        user_id: Option<&str>,
    ) -> AppResult<PurchaseReturnDetailDto> {
        if dto.lines.is_empty() {
            return Err(AppError::Validation("Return items cannot be empty".to_string()));
        }

        let mut tx = self.pool.begin().await.map_err(|e| AppError::Database(e.to_string()))?;

        // Validate purchase
        let pur_row = sqlx::query("SELECT id, purchase_number, branch_id, supplier_id, status FROM purchases WHERE id = $1")
            .bind(&dto.purchase_id)
            .fetch_optional(&mut *tx)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;

        let (purchase_id, purchase_number, branch_id, supplier_id) = match pur_row {
            Some(row) => {
                let status: String = row.try_get(4).unwrap_or_default();
                if status != "COMPLETED" {
                    return Err(AppError::Validation(format!("Cannot return items for purchase with status '{status}'")));
                }
                (
                    row.try_get::<String, _>(0).unwrap(),
                    row.try_get::<String, _>(1).unwrap(),
                    row.try_get::<String, _>(2).unwrap(),
                    row.try_get::<String, _>(3).unwrap(),
                )
            }
            None => return Err(AppError::NotFound(format!("Original purchase '{}' not found", dto.purchase_id))),
        };

        // Supplier name
        let supplier_name: Option<String> = sqlx::query_as("SELECT name FROM suppliers WHERE id = $1")
            .bind(&supplier_id)
            .fetch_optional(&mut *tx)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?
            .map(|r: (String,)| r.0);

        struct PreparedReturnLine {
            purchase_line_id: String,
            product_id: String,
            product_name: String,
            sku: String,
            unit_cost: i64,
            return_quantity: i64,
            return_amount: i64,
        }

        let mut prepared_lines = Vec::with_capacity(dto.lines.len());

        for item in &dto.lines {
            if item.quantity <= 0 {
                return Err(AppError::Validation("Return quantity must be > 0".to_string()));
            }

            let line_row = sqlx::query("SELECT id, product_id, product_name_snapshot, sku_snapshot, unit_cost, quantity FROM purchase_lines WHERE id = $1 AND purchase_id = $2")
                .bind(&item.purchase_line_id)
                .bind(&purchase_id)
                .fetch_optional(&mut *tx)
                .await
                .map_err(|e| AppError::Database(e.to_string()))?;

            let line = match line_row {
                Some(r) => r,
                None => return Err(AppError::NotFound(format!("Purchase line '{}' not found for purchase", item.purchase_line_id))),
            };

            let orig_qty: i64 = line.try_get(5).unwrap();
            let prev_returned: (i64,) = sqlx::query_as(
                "SELECT COALESCE(SUM(quantity), 0)::BIGINT FROM purchase_return_lines WHERE purchase_line_id = $1",
            )
            .bind(&item.purchase_line_id)
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

            let unit_cost: i64 = line.try_get(4).unwrap();
            let return_amount = unit_cost * item.quantity;

            prepared_lines.push(PreparedReturnLine {
                purchase_line_id: item.purchase_line_id.clone(),
                product_id: line.try_get(1).unwrap(),
                product_name: line.try_get(2).unwrap(),
                sku: line.try_get(3).unwrap(),
                unit_cost,
                return_quantity: item.quantity,
                return_amount,
            });
        }

        let total_return_amount: i64 = prepared_lines.iter().map(|l| l.return_amount).sum();
        let settlement_method = PurchaseSettlementMethod::from_str(&dto.settlement_method)
            .map_err(|e| AppError::Validation(e))?;

        sqlx::query("UPDATE counters SET value = value + 1 WHERE name = 'purchase_return_number'")
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;

        let ret_val: (i64,) = sqlx::query_as("SELECT value FROM counters WHERE name = 'purchase_return_number'")
            .fetch_one(&mut *tx)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;

        let return_number = format!("PR-{:06}", ret_val.0);
        let return_id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        let uid = user_id.map(|s| s.to_string());

        let purchase_return = PurchaseReturn {
            id: return_id.clone(),
            return_number: return_number.clone(),
            purchase_id: purchase_id.clone(),
            branch_id: branch_id.clone(),
            supplier_id: supplier_id.clone(),
            supplier_name_snapshot: supplier_name,
            total_amount: total_return_amount,
            settlement_method,
            status: PurchaseReturnStatus::Completed,
            reason: dto.reason.clone(),
            notes: dto.notes.clone(),
            performed_by: uid.clone(),
            created_at: now.clone(),
            updated_at: now.clone(),
        };

        sqlx::query(
            "INSERT INTO purchase_returns (id, return_number, purchase_id, branch_id, supplier_id, supplier_name_snapshot, total_amount, settlement_method, status, reason, notes, performed_by, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)"
        )
        .bind(&purchase_return.id)
        .bind(&purchase_return.return_number)
        .bind(&purchase_return.purchase_id)
        .bind(&purchase_return.branch_id)
        .bind(&purchase_return.supplier_id)
        .bind(purchase_return.supplier_name_snapshot.as_deref())
        .bind(purchase_return.total_amount)
        .bind(purchase_return.settlement_method.as_str())
        .bind(purchase_return.status.as_str())
        .bind(purchase_return.reason.as_deref())
        .bind(purchase_return.notes.as_deref())
        .bind(purchase_return.performed_by.as_deref())
        .bind(&purchase_return.created_at)
        .bind(&purchase_return.updated_at)
        .execute(&mut *tx)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

        let mut inserted_lines = Vec::with_capacity(prepared_lines.len());

        for line in prepared_lines {
            let line_id = Uuid::new_v4().to_string();
            let prline = PurchaseReturnLine {
                id: line_id.clone(),
                return_id: return_id.clone(),
                purchase_line_id: line.purchase_line_id.clone(),
                product_id: line.product_id.clone(),
                product_name_snapshot: line.product_name.clone(),
                sku_snapshot: line.sku.clone(),
                unit_cost: line.unit_cost,
                quantity: line.return_quantity,
                return_amount: line.return_amount,
                created_at: now.clone(),
            };

            sqlx::query(
                "INSERT INTO purchase_return_lines (id, return_id, purchase_line_id, product_id, product_name_snapshot, sku_snapshot, unit_cost, quantity, return_amount, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)"
            )
            .bind(&prline.id)
            .bind(&prline.return_id)
            .bind(&prline.purchase_line_id)
            .bind(&prline.product_id)
            .bind(&prline.product_name_snapshot)
            .bind(&prline.sku_snapshot)
            .bind(prline.unit_cost)
            .bind(prline.quantity)
            .bind(prline.return_amount)
            .bind(&prline.created_at)
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;

            // Deduct stock
            let current_stock: (i64,) = sqlx::query_as("SELECT quantity FROM stock WHERE product_id = $1 AND branch_id = $2")
                .bind(&line.product_id)
                .bind(&branch_id)
                .fetch_optional(&mut *tx)
                .await
                .map_err(|e| AppError::Database(e.to_string()))?
                .unwrap_or((0,));

            if current_stock.0 < line.return_quantity {
                return Err(AppError::Validation(format!(
                    "Insufficient stock for purchase return of '{}': available {}, requested {}",
                    line.product_name, current_stock.0, line.return_quantity
                )));
            }

            let new_stock = current_stock.0 - line.return_quantity;

            sqlx::query("UPDATE stock SET quantity = $1, updated_at = $2 WHERE product_id = $3 AND branch_id = $4")
                .bind(new_stock)
                .bind(&now)
                .bind(&line.product_id)
                .bind(&branch_id)
                .execute(&mut *tx)
                .await
                .map_err(|e| AppError::Database(e.to_string()))?;

            let m_id = Uuid::new_v4().to_string();
            let reason = format!("Purchase Return {}", return_number);

            sqlx::query(
                "INSERT INTO stock_movements (id, product_id, branch_id, movement_type, quantity, previous_stock, resulting_stock, reason, performed_by, reference_id, created_at)
                 VALUES ($1, $2, $3, 'OUT', $4, $5, $6, $7, $8, $9, $10)"
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

            inserted_lines.push(prline);
        }

        // Settlement
        let mut supplier_balance_after = None;
        if settlement_method == PurchaseSettlementMethod::Cash {
            let open_session_id: Option<String> = sqlx::query_as(
                "SELECT id FROM cash_sessions WHERE branch_id = $1 AND status = 'OPEN' LIMIT 1",
            )
            .bind(&branch_id)
            .fetch_optional(&mut *tx)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?
            .map(|r: (String,)| r.0);

            let c_id = Uuid::new_v4().to_string();
            let desc = format!("Purchase Return Cash Settlement {}", return_number);

            sqlx::query(
                "INSERT INTO cash_movements (id, session_id, branch_id, movement_type, direction, amount, reference_id, reference_number, payment_method, description, performed_by, created_at)
                 VALUES ($1, $2, $3, 'CASH_ADJUSTMENT', 'IN', $4, $5, $6, 'CASH', $7, $8, $9)"
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
        } else if settlement_method == PurchaseSettlementMethod::SupplierCredit {
            let current_outstanding: (i64,) = sqlx::query_as(
                "SELECT COALESCE(SUM(debit) - SUM(credit), 0)::BIGINT FROM supplier_ledger_entries WHERE supplier_id = $1",
            )
            .bind(&supplier_id)
            .fetch_one(&mut *tx)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;

            let new_bal = (current_outstanding.0 - total_return_amount).max(0);
            supplier_balance_after = Some(new_bal);

            let l_id = Uuid::new_v4().to_string();
            let desc = format!("Purchase Return Credit {}", return_number);

            sqlx::query(
                "INSERT INTO supplier_ledger_entries (id, supplier_id, reference_id, reference_number, entry_type, debit, credit, balance_after, description, performed_by, created_at)
                 VALUES ($1, $2, $3, $4, 'ADJUSTMENT', 0, $5, $6, $7, $8, $9)"
            )
            .bind(l_id)
            .bind(&supplier_id)
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

        Ok(PurchaseReturnDetailDto {
            purchase_return,
            lines: inserted_lines,
            purchase_number: purchase_number,
            supplier_payable_after: supplier_balance_after,
            cash_settled: if settlement_method == PurchaseSettlementMethod::Cash { Some(total_return_amount) } else { None },
        })
    }

    pub async fn get_return_by_id(&self, id: &str) -> AppResult<Option<PurchaseReturn>> {
        let sql = "SELECT id, return_number, purchase_id, branch_id, supplier_id, supplier_name_snapshot, total_amount, settlement_method, status, reason, notes, performed_by, created_at, updated_at FROM purchase_returns WHERE id = $1";
        let row_opt = sqlx::query(sql)
            .bind(id)
            .fetch_optional(&self.pool)
            .await
            .map_err(|e| AppError::Database(format!("Failed to query purchase return: {e}")))?;

        match row_opt {
            Some(row) => Ok(Some(Self::map_return_row(&row)?)),
            None => Ok(None),
        }
    }

    pub async fn list_returns(
        &self,
        filter: &Option<PurchaseReturnFilterDto>,
    ) -> AppResult<Vec<PurchaseReturn>> {
        let mut query = String::from("SELECT id, return_number, purchase_id, branch_id, supplier_id, supplier_name_snapshot, total_amount, settlement_method, status, reason, notes, performed_by, created_at, updated_at FROM purchase_returns WHERE 1=1");
        let mut param_index = 1;

        if let Some(f) = filter {
            if f.purchase_id.is_some() {
                query.push_str(&format!(" AND purchase_id = ${param_index}"));
                param_index += 1;
            }
            if f.branch_id.is_some() {
                query.push_str(&format!(" AND branch_id = ${param_index}"));
                param_index += 1;
            }
            if f.supplier_id.is_some() {
                query.push_str(&format!(" AND supplier_id = ${param_index}"));
                // param_index += 1;
            }
        }

        query.push_str(" ORDER BY created_at DESC, id DESC");

        let lim = filter.as_ref().and_then(|f| f.limit).unwrap_or(50);
        query.push_str(&format!(" LIMIT {lim}"));

        let mut q = sqlx::query(&query);

        if let Some(f) = filter {
            if let Some(pid) = &f.purchase_id {
                q = q.bind(pid);
            }
            if let Some(bid) = &f.branch_id {
                q = q.bind(bid);
            }
            if let Some(sid) = &f.supplier_id {
                q = q.bind(sid);
            }
        }

        let rows = q
            .fetch_all(&self.pool)
            .await
            .map_err(|e| AppError::Database(format!("Failed to query purchase returns: {e}")))?;

        let mut list = Vec::with_capacity(rows.len());
        for row in rows {
            list.push(Self::map_return_row(&row)?);
        }

        Ok(list)
    }

    fn map_return_row(row: &sqlx::postgres::PgRow) -> AppResult<PurchaseReturn> {
        let settlement_method_str: String = row.try_get(7).map_err(|e| AppError::Database(e.to_string()))?;
        let status_str: String = row.try_get(8).map_err(|e| AppError::Database(e.to_string()))?;

        Ok(PurchaseReturn {
            id: row.try_get(0).map_err(|e| AppError::Database(e.to_string()))?,
            return_number: row.try_get(1).map_err(|e| AppError::Database(e.to_string()))?,
            purchase_id: row.try_get(2).map_err(|e| AppError::Database(e.to_string()))?,
            branch_id: row.try_get(3).map_err(|e| AppError::Database(e.to_string()))?,
            supplier_id: row.try_get(4).unwrap_or_default(),
            supplier_name_snapshot: row.try_get(5).unwrap_or(None),
            total_amount: row.try_get(6).map_err(|e| AppError::Database(e.to_string()))?,
            settlement_method: PurchaseSettlementMethod::from_str(&settlement_method_str)
                .map_err(|e| AppError::Database(e.to_string()))?,
            status: PurchaseReturnStatus::from_str(&status_str)
                .map_err(|e| AppError::Database(e.to_string()))?,
            reason: row.try_get(9).unwrap_or(None),
            notes: row.try_get(10).unwrap_or(None),
            performed_by: row.try_get(11).unwrap_or(None),
            created_at: row.try_get(12).map_err(|e| AppError::Database(e.to_string()))?,
            updated_at: row.try_get(13).map_err(|e| AppError::Database(e.to_string()))?,
        })
    }
}
