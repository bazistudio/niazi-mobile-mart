use chrono::Utc;
use sqlx::{PgPool, Row};
use uuid::Uuid;

use crate::domain::organization::DEFAULT_MAIN_BRANCH_ID;
use crate::domain::purchases::{
    CompletePurchaseDto, Purchase, PurchaseFilterDto, PurchaseLine, PurchaseResultDto,
};
use crate::domain::sales::PaymentStatus;
use crate::errors::{AppError, AppResult};

#[derive(Clone)]
pub struct PostgresPurchaseRepository {
    pool: PgPool,
}

impl PostgresPurchaseRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn complete_purchase(
        &self,
        dto: &CompletePurchaseDto,
        user_id: Option<&str>,
    ) -> AppResult<PurchaseResultDto> {
        if dto.items.is_empty() {
            return Err(AppError::Validation("Cannot complete purchase with empty items".to_string()));
        }

        let mut tx = self.pool.begin().await.map_err(|e| AppError::Database(e.to_string()))?;

        // Validate supplier
        let supplier_row = sqlx::query("SELECT id, name, credit_limit, is_active FROM suppliers WHERE id = $1")
            .bind(&dto.supplier_id)
            .fetch_optional(&mut *tx)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;

        let (supplier_id, supplier_name, _credit_limit) = match supplier_row {
            Some(row) => {
                let is_active_int: i32 = row.try_get(3).unwrap_or(1);
                if is_active_int != 1 {
                    let name: String = row.try_get(1).unwrap_or_default();
                    return Err(AppError::Validation(format!("Supplier '{name}' is inactive.")));
                }
                (
                    row.try_get::<String, _>(0).unwrap(),
                    row.try_get::<String, _>(1).unwrap(),
                    row.try_get::<i64, _>(2).unwrap_or(0),
                )
            }
            None => return Err(AppError::NotFound(format!("Supplier '{}' not found", dto.supplier_id))),
        };

        let branch_id = match dto.branch_id.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
            Some(bid) => bid.to_string(),
            None => DEFAULT_MAIN_BRANCH_ID.to_string(),
        };

        struct PreparedLine {
            product_id: String,
            product_name: String,
            sku: String,
            quantity: i64,
            unit_cost: i64,
            discount: i64,
            line_total: i64,
        }

        let mut prepared_lines = Vec::with_capacity(dto.items.len());

        for item in &dto.items {
            if item.quantity <= 0 {
                return Err(AppError::Validation("Quantity must be > 0".to_string()));
            }
            if item.unit_cost < 0 {
                return Err(AppError::Validation("Unit cost cannot be negative".to_string()));
            }

            let prod_row = sqlx::query("SELECT id, name, sku, is_active FROM products WHERE id = $1")
                .bind(&item.product_id)
                .fetch_optional(&mut *tx)
                .await
                .map_err(|e| AppError::Database(e.to_string()))?;

            let prod = match prod_row {
                Some(r) => r,
                None => return Err(AppError::NotFound(format!("Product '{}' not found", item.product_id))),
            };

            let is_active_int: i32 = prod.try_get(3).unwrap_or(1);
            if is_active_int != 1 {
                let name: String = prod.try_get(1).unwrap_or_default();
                return Err(AppError::Validation(format!("Product '{name}' is inactive.")));
            }

            let disc = item.discount.unwrap_or(0).max(0);
            let line_total = (item.unit_cost * item.quantity).saturating_sub(disc);

            prepared_lines.push(PreparedLine {
                product_id: prod.try_get(0).unwrap(),
                product_name: prod.try_get(1).unwrap(),
                sku: prod.try_get(2).unwrap(),
                quantity: item.quantity,
                unit_cost: item.unit_cost,
                discount: disc,
                line_total,
            });
        }

        let subtotal: i64 = prepared_lines.iter().map(|l| l.line_total).sum();
        let discount = dto.discount.unwrap_or(0).max(0);
        let total_amount = subtotal.saturating_sub(discount);
        let paid_amount = dto.paid_amount.unwrap_or(0).max(0);

        let credit_amount = total_amount.saturating_sub(paid_amount);
        let payment_status = if paid_amount >= total_amount {
            PaymentStatus::Paid
        } else if paid_amount > 0 {
            PaymentStatus::PartiallyPaid
        } else {
            PaymentStatus::Unpaid
        };

        sqlx::query("UPDATE counters SET value = value + 1 WHERE name = 'purchase_number'")
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;

        let pur_val: (i64,) = sqlx::query_as("SELECT value FROM counters WHERE name = 'purchase_number'")
            .fetch_one(&mut *tx)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;

        let purchase_number = format!("PUR-{:06}", pur_val.0);
        let purchase_id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        let uid = user_id.map(|s| s.to_string());

        let purchase = Purchase {
            id: purchase_id.clone(),
            purchase_number: purchase_number.clone(),
            supplier_id: supplier_id.clone(),
            branch_id: branch_id.clone(),
            subtotal,
            discount,
            total_amount,
            paid_amount,
            credit_amount,
            payment_status,
            status: "COMPLETED".to_string(),
            notes: dto.notes.clone(),
            performed_by: uid.clone(),
            created_at: now.clone(),
            updated_at: now.clone(),
        };

        sqlx::query(
            "INSERT INTO purchases (
                id, purchase_number, supplier_id, branch_id, subtotal, discount, total_amount,
                paid_amount, credit_amount, payment_status, status, notes, performed_by, created_at, updated_at
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)"
        )
        .bind(&purchase.id)
        .bind(&purchase.purchase_number)
        .bind(&purchase.supplier_id)
        .bind(&purchase.branch_id)
        .bind(purchase.subtotal)
        .bind(purchase.discount)
        .bind(purchase.total_amount)
        .bind(purchase.paid_amount)
        .bind(purchase.credit_amount)
        .bind(purchase.payment_status.as_str())
        .bind(purchase.status.as_str())
        .bind(purchase.notes.as_deref())
        .bind(purchase.performed_by.as_deref())
        .bind(&purchase.created_at)
        .bind(&purchase.updated_at)
        .execute(&mut *tx)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

        let mut inserted_lines = Vec::with_capacity(prepared_lines.len());

        for line in prepared_lines {
            let line_id = Uuid::new_v4().to_string();
            let pline = PurchaseLine {
                id: line_id.clone(),
                purchase_id: purchase_id.clone(),
                product_id: line.product_id.clone(),
                product_name_snapshot: line.product_name.clone(),
                sku_snapshot: line.sku.clone(),
                quantity: line.quantity,
                unit_cost: line.unit_cost,
                discount: line.discount,
                line_total: line.line_total,
                created_at: now.clone(),
            };

            sqlx::query(
                "INSERT INTO purchase_lines (id, purchase_id, product_id, product_name_snapshot, sku_snapshot, quantity, unit_cost, discount, line_total, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)"
            )
            .bind(&pline.id)
            .bind(&pline.purchase_id)
            .bind(&pline.product_id)
            .bind(&pline.product_name_snapshot)
            .bind(&pline.sku_snapshot)
            .bind(pline.quantity)
            .bind(pline.unit_cost)
            .bind(pline.discount)
            .bind(pline.line_total)
            .bind(&pline.created_at)
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;

            // Add stock
            let current_stock: (i64,) = sqlx::query_as("SELECT quantity FROM stock WHERE product_id = $1 AND branch_id = $2")
                .bind(&line.product_id)
                .bind(&branch_id)
                .fetch_optional(&mut *tx)
                .await
                .map_err(|e| AppError::Database(e.to_string()))?
                .unwrap_or((0,));

            let new_stock = current_stock.0 + line.quantity;

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
            let reason = format!("Stock Receive {}", purchase_number);

            sqlx::query(
                "INSERT INTO stock_movements (id, product_id, branch_id, movement_type, quantity, previous_stock, resulting_stock, reason, performed_by, reference_id, created_at)
                 VALUES ($1, $2, $3, 'IN', $4, $5, $6, $7, $8, $9, $10)"
            )
            .bind(m_id)
            .bind(&line.product_id)
            .bind(&branch_id)
            .bind(line.quantity)
            .bind(current_stock.0)
            .bind(new_stock)
            .bind(reason)
            .bind(uid.as_deref())
            .bind(&purchase_id)
            .bind(&now)
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;

            inserted_lines.push(pline);
        }

        // Supplier Ledger Entry
        let mut supplier_balance_after = None;
        if credit_amount > 0 {
            let current_outstanding: (i64,) = sqlx::query_as(
                "SELECT COALESCE(SUM(credit) - SUM(debit), 0) FROM supplier_ledger_entries WHERE supplier_id = $1",
            )
            .bind(&supplier_id)
            .fetch_one(&mut *tx)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;

            let new_bal = current_outstanding.0 + credit_amount;
            supplier_balance_after = Some(new_bal);

            let l_id = Uuid::new_v4().to_string();
            let desc = format!("Purchase Order {}", purchase_number);

            sqlx::query(
                "INSERT INTO supplier_ledger_entries (id, supplier_id, reference_id, reference_number, entry_type, debit, credit, balance_after, description, performed_by, created_at)
                 VALUES ($1, $2, $3, $4, 'PURCHASE', 0, $5, $6, $7, $8, $9)"
            )
            .bind(l_id)
            .bind(&supplier_id)
            .bind(&purchase_id)
            .bind(&purchase_number)
            .bind(credit_amount)
            .bind(new_bal)
            .bind(desc)
            .bind(uid.as_deref())
            .bind(&now)
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;
        }

        // Cash Movement if paid
        if paid_amount > 0 {
            let open_session_id: Option<String> = sqlx::query_as(
                "SELECT id FROM cash_sessions WHERE branch_id = $1 AND status = 'OPEN' LIMIT 1",
            )
            .bind(&branch_id)
            .fetch_optional(&mut *tx)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?
            .map(|r: (String,)| r.0);

            let c_id = Uuid::new_v4().to_string();
            let desc = format!("Purchase Payment {}", purchase_number);

            sqlx::query(
                "INSERT INTO cash_movements (id, session_id, branch_id, movement_type, direction, amount, reference_id, reference_number, payment_method, description, performed_by, created_at)
                 VALUES ($1, $2, $3, 'SUPPLIER_PAYMENT', 'OUT', $4, $5, $6, 'CASH', $7, $8, $9)"
            )
            .bind(c_id)
            .bind(open_session_id.as_deref())
            .bind(&branch_id)
            .bind(paid_amount)
            .bind(&purchase_id)
            .bind(&purchase_number)
            .bind(desc)
            .bind(uid.as_deref())
            .bind(&now)
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;
        }

        tx.commit().await.map_err(|e| AppError::Database(e.to_string()))?;

        Ok(PurchaseResultDto {
            purchase,
            lines: inserted_lines,
            supplier_outstanding_balance: supplier_balance_after,
        })
    }

    pub async fn get_purchase_by_id(&self, id: &str) -> AppResult<Option<Purchase>> {
        let sql = "SELECT id, purchase_number, supplier_id, branch_id, subtotal, discount, total_amount, paid_amount, credit_amount, payment_status, status, notes, performed_by, created_at, updated_at FROM purchases WHERE id = $1";
        let row_opt = sqlx::query(sql)
            .bind(id)
            .fetch_optional(&self.pool)
            .await
            .map_err(|e| AppError::Database(format!("Failed to query purchase by id: {e}")))?;

        match row_opt {
            Some(row) => Ok(Some(Self::map_purchase_row(&row)?)),
            None => Ok(None),
        }
    }

    pub async fn get_purchase_by_number(&self, number: &str) -> AppResult<Option<Purchase>> {
        let sql = "SELECT id, purchase_number, supplier_id, branch_id, subtotal, discount, total_amount, paid_amount, credit_amount, payment_status, status, notes, performed_by, created_at, updated_at FROM purchases WHERE purchase_number = $1";
        let row_opt = sqlx::query(sql)
            .bind(number.trim())
            .fetch_optional(&self.pool)
            .await
            .map_err(|e| AppError::Database(format!("Failed to query purchase by number: {e}")))?;

        match row_opt {
            Some(row) => Ok(Some(Self::map_purchase_row(&row)?)),
            None => Ok(None),
        }
    }

    pub async fn get_purchase_lines(&self, purchase_id: &str) -> AppResult<Vec<PurchaseLine>> {
        let sql = "SELECT id, purchase_id, product_id, product_name_snapshot, sku_snapshot, quantity, unit_cost, discount, line_total, created_at FROM purchase_lines WHERE purchase_id = $1 ORDER BY created_at ASC, id ASC";

        let rows = sqlx::query(sql)
            .bind(purchase_id)
            .fetch_all(&self.pool)
            .await
            .map_err(|e| AppError::Database(format!("Failed to query purchase lines: {e}")))?;

        let mut list = Vec::with_capacity(rows.len());
        for row in rows {
            list.push(PurchaseLine {
                id: row.try_get(0).map_err(|e| AppError::Database(e.to_string()))?,
                purchase_id: row.try_get(1).map_err(|e| AppError::Database(e.to_string()))?,
                product_id: row.try_get(2).map_err(|e| AppError::Database(e.to_string()))?,
                product_name_snapshot: row.try_get(3).map_err(|e| AppError::Database(e.to_string()))?,
                sku_snapshot: row.try_get(4).map_err(|e| AppError::Database(e.to_string()))?,
                quantity: row.try_get(5).map_err(|e| AppError::Database(e.to_string()))?,
                unit_cost: row.try_get(6).map_err(|e| AppError::Database(e.to_string()))?,
                discount: row.try_get(7).map_err(|e| AppError::Database(e.to_string()))?,
                line_total: row.try_get(8).map_err(|e| AppError::Database(e.to_string()))?,
                created_at: row.try_get(9).map_err(|e| AppError::Database(e.to_string()))?,
            });
        }
        Ok(list)
    }

    pub async fn list_purchases(
        &self,
        filter: &Option<PurchaseFilterDto>,
    ) -> AppResult<Vec<Purchase>> {
        let mut query = String::from(
            "SELECT id, purchase_number, supplier_id, branch_id, subtotal, discount, total_amount, paid_amount, credit_amount, payment_status, status, notes, performed_by, created_at, updated_at FROM purchases WHERE 1=1"
        );

        let mut param_index = 1;

        if let Some(f) = filter {
            if f.supplier_id.is_some() {
                query.push_str(&format!(" AND supplier_id = ${param_index}"));
                param_index += 1;
            }
            if f.branch_id.is_some() {
                query.push_str(&format!(" AND branch_id = ${param_index}"));
                param_index += 1;
            }
            if f.payment_status.is_some() {
                query.push_str(&format!(" AND payment_status = ${param_index}"));
                param_index += 1;
            }
        }

        query.push_str(" ORDER BY created_at DESC, id DESC");

        let lim = filter.as_ref().and_then(|f| f.limit).unwrap_or(50);
        query.push_str(&format!(" LIMIT {lim}"));

        if let Some(off) = filter.as_ref().and_then(|f| f.offset) {
            query.push_str(&format!(" OFFSET {off}"));
        }

        let mut q = sqlx::query(&query);

        if let Some(f) = filter {
            if let Some(sid) = &f.supplier_id {
                q = q.bind(sid);
            }
            if let Some(bid) = &f.branch_id {
                q = q.bind(bid);
            }
            if let Some(ps) = &f.payment_status {
                q = q.bind(ps);
            }
        }

        let rows = q
            .fetch_all(&self.pool)
            .await
            .map_err(|e| AppError::Database(format!("Failed to query purchases list: {e}")))?;

        let mut list = Vec::with_capacity(rows.len());
        for row in rows {
            list.push(Self::map_purchase_row(&row)?);
        }

        Ok(list)
    }

    fn map_purchase_row(row: &sqlx::postgres::PgRow) -> AppResult<Purchase> {
        let p_status_str: String = row.try_get(9).map_err(|e| AppError::Database(e.to_string()))?;
        let payment_status = PurchasePaymentStatus::from_str(&p_status_str);
        let status_str: String = row.try_get(10).map_err(|e| AppError::Database(e.to_string()))?;
        let status = PurchaseStatus::from_str(&status_str).unwrap_or(PurchaseStatus::Completed);

        Ok(Purchase {
            id: row.try_get(0).map_err(|e| AppError::Database(e.to_string()))?,
            purchase_number: row.try_get(1).map_err(|e| AppError::Database(e.to_string()))?,
            supplier_id: row.try_get(2).map_err(|e| AppError::Database(e.to_string()))?,
            branch_id: row.try_get(3).map_err(|e| AppError::Database(e.to_string()))?,
            subtotal: row.try_get(4).map_err(|e| AppError::Database(e.to_string()))?,
            discount: row.try_get(5).map_err(|e| AppError::Database(e.to_string()))?,
            total_amount: row.try_get(6).map_err(|e| AppError::Database(e.to_string()))?,
            paid_amount: row.try_get(7).map_err(|e| AppError::Database(e.to_string()))?,
            credit_amount: row.try_get(8).map_err(|e| AppError::Database(e.to_string()))?,
            payment_status,
            status,
            notes: row.try_get(11).unwrap_or(None),
            performed_by: row.try_get(12).unwrap_or(None),
            created_at: row.try_get(13).map_err(|e| AppError::Database(e.to_string()))?,
            updated_at: row.try_get(14).map_err(|e| AppError::Database(e.to_string()))?,
        })
    }
}
