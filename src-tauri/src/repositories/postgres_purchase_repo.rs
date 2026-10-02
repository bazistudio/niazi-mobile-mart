use chrono::Utc;
use sqlx::{PgPool, Row};
use uuid::Uuid;

use crate::domain::organization::DEFAULT_MAIN_BRANCH_ID;
use crate::domain::purchases::{
    CompletePurchaseDto, Purchase, PurchaseFilterDto, PurchaseLine, PurchasePaymentStatus,
    PurchaseResultDto, PurchaseStatus,
};
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
        let mut tx = self
            .pool
            .begin()
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;
        let res = Self::complete_purchase_tx(&mut tx, dto, user_id, None).await?;
        tx.commit()
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;
        Ok(res)
    }

    pub async fn sync_purchase_tx(
        tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
        event: &crate::domain::purchases::PurchaseSyncEventDto,
    ) -> AppResult<crate::domain::purchases::PurchaseSyncEventDto> {
        let p = &event.purchase;
        sqlx::query(
            "INSERT INTO purchases (
                id, purchase_number, supplier_id, branch_id, subtotal, discount, total_amount,
                paid_amount, credit_amount, payment_status, status, notes, performed_by, created_at, updated_at
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)"
        )
        .bind(&p.id)
        .bind(&p.purchase_number)
        .bind(&p.supplier_id)
        .bind(&p.branch_id)
        .bind(p.subtotal)
        .bind(p.discount)
        .bind(p.total_amount)
        .bind(p.paid_amount)
        .bind(p.credit_amount)
        .bind(p.payment_status.as_str())
        .bind(p.status.as_str())
        .bind(p.notes.as_deref())
        .bind(p.performed_by.as_deref())
        .bind(&p.created_at)
        .bind(&p.updated_at)
        .execute(&mut **tx)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

        for pline in &event.lines {
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

        for p_cost in &event.product_cost_updates {
            sqlx::query("UPDATE products SET average_cost = $1, purchase_price = $2, updated_at = $3 WHERE id = $4")
                .bind(p_cost.new_average_cost)
                .bind(p_cost.last_purchase_price)
                .bind(&p.created_at)
                .bind(&p_cost.product_id)
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

    pub async fn complete_purchase_tx(
        tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
        dto: &CompletePurchaseDto,
        user_id: Option<&str>,
        purchase_id_override: Option<&str>,
    ) -> AppResult<PurchaseResultDto> {
        if dto.items.is_empty() {
            return Err(AppError::Validation(
                "Cannot complete purchase with empty items".to_string(),
            ));
        }

        // Validate supplier
        let supplier_row =
            sqlx::query("SELECT id, name, credit_limit, is_active FROM suppliers WHERE id = $1")
                .bind(&dto.supplier_id)
                .fetch_optional(&mut **tx)
                .await
                .map_err(|e| AppError::Database(e.to_string()))?;

        let (supplier_id, _supplier_name, _credit_limit) = match supplier_row {
            Some(row) => {
                let is_active_int: i32 = row.try_get(3).unwrap_or(1);
                if is_active_int != 1 {
                    let name: String = row.try_get(1).unwrap_or_default();
                    return Err(AppError::Validation(format!(
                        "Supplier '{name}' is inactive."
                    )));
                }
                (
                    row.try_get::<String, _>(0).unwrap(),
                    row.try_get::<String, _>(1).unwrap(),
                    row.try_get::<i64, _>(2).unwrap_or(0),
                )
            }
            None => {
                return Err(AppError::NotFound(format!(
                    "Supplier '{}' not found",
                    dto.supplier_id
                )))
            }
        };

        let branch_id = match dto
            .branch_id
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
        {
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
            let unit_cost = item.unit_cost.unwrap_or(0);
            if unit_cost < 0 {
                return Err(AppError::Validation(
                    "Unit cost cannot be negative".to_string(),
                ));
            }

            let prod_row =
                sqlx::query("SELECT id, name, sku, is_active FROM products WHERE id = $1")
                    .bind(&item.product_id)
                    .fetch_optional(&mut **tx)
                    .await
                    .map_err(|e| AppError::Database(e.to_string()))?;

            let prod = match prod_row {
                Some(r) => r,
                None => {
                    return Err(AppError::NotFound(format!(
                        "Product '{}' not found",
                        item.product_id
                    )))
                }
            };

            let is_active_int: i32 = prod.try_get(3).unwrap_or(1);
            if is_active_int != 1 {
                let name: String = prod.try_get(1).unwrap_or_default();
                return Err(AppError::Validation(format!(
                    "Product '{name}' is inactive."
                )));
            }

            let disc = item.discount.unwrap_or(0).max(0);
            let line_total = (unit_cost * item.quantity).saturating_sub(disc);

            prepared_lines.push(PreparedLine {
                product_id: prod.try_get(0).unwrap(),
                product_name: prod.try_get(1).unwrap(),
                sku: prod.try_get(2).unwrap(),
                quantity: item.quantity,
                unit_cost,
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
            PurchasePaymentStatus::Paid
        } else if paid_amount > 0 {
            PurchasePaymentStatus::PartiallyPaid
        } else {
            PurchasePaymentStatus::Unpaid
        };

        sqlx::query("UPDATE counters SET value = value + 1 WHERE name = 'purchase_number'")
            .execute(&mut **tx)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;

        let pur_val: (i64,) =
            sqlx::query_as("SELECT value FROM counters WHERE name = 'purchase_number'")
                .fetch_one(&mut **tx)
                .await
                .map_err(|e| AppError::Database(e.to_string()))?;

        let purchase_number = format!("PUR-{:06}", pur_val.0);
        let purchase_id = purchase_id_override
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(String::from)
            .unwrap_or_else(|| Uuid::new_v4().to_string());
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
            status: PurchaseStatus::Completed,
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
        .execute(&mut **tx)
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
            .execute(&mut **tx)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;

            // Add stock
            let current_stock: (i64,) = sqlx::query_as(
                "SELECT quantity FROM stock WHERE product_id = $1 AND branch_id = $2",
            )
            .bind(&line.product_id)
            .bind(&branch_id)
            .fetch_optional(&mut **tx)
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
            .execute(&mut **tx)
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
            .execute(&mut **tx)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;

            inserted_lines.push(pline);
        }

        // Supplier Ledger Entry
        let mut supplier_balance_after = None;
        if credit_amount > 0 {
            let current_outstanding: (i64,) = sqlx::query_as(
                "SELECT COALESCE(SUM(debit) - SUM(credit), 0)::BIGINT FROM supplier_ledger_entries WHERE supplier_id = $1",
            )
            .bind(&supplier_id)
            .fetch_one(&mut **tx)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;

            let new_bal = current_outstanding.0 + credit_amount;
            supplier_balance_after = Some(new_bal);

            let l_id = Uuid::new_v4().to_string();
            let desc = format!("Purchase Order {}", purchase_number);

            sqlx::query(
                "INSERT INTO supplier_ledger_entries (id, supplier_id, reference_id, reference_number, entry_type, debit, credit, balance_after, description, performed_by, created_at)
                 VALUES ($1, $2, $3, $4, 'PURCHASE', $5, 0, $6, $7, $8, $9)"
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
            .execute(&mut **tx)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;
        }

        // Cash Movement if paid
        if paid_amount > 0 {
            let open_session_id: Option<String> = sqlx::query_as(
                "SELECT id FROM cash_sessions WHERE branch_id = $1 AND status = 'OPEN' LIMIT 1",
            )
            .bind(&branch_id)
            .fetch_optional(&mut **tx)
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
            .execute(&mut **tx)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;
        }

        Ok(PurchaseResultDto {
            purchase,
            lines: inserted_lines,
            credit_amount,
            supplier_balance_after: supplier_balance_after.unwrap_or(0),
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
                id: row
                    .try_get(0)
                    .map_err(|e| AppError::Database(e.to_string()))?,
                purchase_id: row
                    .try_get(1)
                    .map_err(|e| AppError::Database(e.to_string()))?,
                product_id: row
                    .try_get(2)
                    .map_err(|e| AppError::Database(e.to_string()))?,
                product_name_snapshot: row
                    .try_get(3)
                    .map_err(|e| AppError::Database(e.to_string()))?,
                sku_snapshot: row
                    .try_get(4)
                    .map_err(|e| AppError::Database(e.to_string()))?,
                quantity: row
                    .try_get(5)
                    .map_err(|e| AppError::Database(e.to_string()))?,
                unit_cost: row
                    .try_get(6)
                    .map_err(|e| AppError::Database(e.to_string()))?,
                discount: row
                    .try_get(7)
                    .map_err(|e| AppError::Database(e.to_string()))?,
                line_total: row
                    .try_get(8)
                    .map_err(|e| AppError::Database(e.to_string()))?,
                created_at: row
                    .try_get(9)
                    .map_err(|e| AppError::Database(e.to_string()))?,
            });
        }
        Ok(list)
    }

    pub async fn record_supplier_payment_tx(
        tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
        dto: &crate::domain::supplier::SupplierPaymentSyncEventDto,
    ) -> AppResult<()> {
        let supplier_row = sqlx::query("SELECT id FROM suppliers WHERE id = $1")
            .bind(&dto.supplier_id)
            .fetch_optional(&mut **tx)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;

        if supplier_row.is_none() {
            return Err(AppError::NotFound(format!(
                "Supplier '{}' not found",
                dto.supplier_id
            )));
        }

        // Apply allocations
        for alloc in &dto.allocated_purchases {
            sqlx::query(
                "UPDATE purchases SET paid_amount = $1, credit_amount = total_amount - $1, payment_status = $2, updated_at = $3 WHERE id = $4"
            )
            .bind(alloc.new_paid)
            .bind(alloc.payment_status.as_str())
            .bind(&dto.created_at)
            .bind(&alloc.purchase_id)
            .execute(&mut **tx)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;
        }

        // Insert ledger entry
        let current_outstanding: (i64,) = sqlx::query_as(
            "SELECT COALESCE(SUM(debit) - SUM(credit), 0)::BIGINT FROM supplier_ledger_entries WHERE supplier_id = $1",
        )
        .bind(&dto.supplier_id)
        .fetch_one(&mut **tx)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

        let new_bal = current_outstanding.0 - dto.amount_paid;

        let desc = format!(
            "Payment to supplier ({}) Ref: {}",
            dto.payment_method,
            dto.reference_number
                .as_deref()
                .unwrap_or(&dto.receipt_number)
        );

        sqlx::query(
            "INSERT INTO supplier_ledger_entries (id, supplier_id, reference_id, reference_number, entry_type, debit, credit, balance_after, description, performed_by, created_at)
             VALUES ($1, $2, $3, $4, 'PAYMENT', $5, $6, $7, $8, $9, $10)"
        )
        .bind(&dto.payment_id)
        .bind(&dto.supplier_id)
        .bind(&dto.payment_id)
        .bind(&dto.receipt_number)
        .bind(0)
        .bind(dto.amount_paid)
        .bind(new_bal)
        .bind(desc)
        .bind(dto.performed_by.as_deref())
        .bind(&dto.created_at)
        .execute(&mut **tx)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

        Ok(())
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
                // param_index += 1;
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
        let p_status_str: String = row
            .try_get(9)
            .map_err(|e| AppError::Database(e.to_string()))?;
        let payment_status =
            PurchasePaymentStatus::from_str(&p_status_str).unwrap_or(PurchasePaymentStatus::Unpaid);
        let status_str: String = row
            .try_get(10)
            .map_err(|e| AppError::Database(e.to_string()))?;
        let status = PurchaseStatus::from_str(&status_str).unwrap_or(PurchaseStatus::Completed);

        Ok(Purchase {
            id: row
                .try_get(0)
                .map_err(|e| AppError::Database(e.to_string()))?,
            purchase_number: row
                .try_get(1)
                .map_err(|e| AppError::Database(e.to_string()))?,
            supplier_id: row
                .try_get(2)
                .map_err(|e| AppError::Database(e.to_string()))?,
            branch_id: row
                .try_get(3)
                .map_err(|e| AppError::Database(e.to_string()))?,
            subtotal: row
                .try_get(4)
                .map_err(|e| AppError::Database(e.to_string()))?,
            discount: row
                .try_get(5)
                .map_err(|e| AppError::Database(e.to_string()))?,
            total_amount: row
                .try_get(6)
                .map_err(|e| AppError::Database(e.to_string()))?,
            paid_amount: row
                .try_get(7)
                .map_err(|e| AppError::Database(e.to_string()))?,
            credit_amount: row
                .try_get(8)
                .map_err(|e| AppError::Database(e.to_string()))?,
            payment_status,
            status,
            notes: row.try_get(11).unwrap_or(None),
            performed_by: row.try_get(12).unwrap_or(None),
            created_at: row
                .try_get(13)
                .map_err(|e| AppError::Database(e.to_string()))?,
            updated_at: row
                .try_get(14)
                .map_err(|e| AppError::Database(e.to_string()))?,
        })
    }
}
