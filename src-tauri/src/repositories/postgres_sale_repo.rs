use chrono::Utc;
use sqlx::{PgPool, Row};
use uuid::Uuid;

use crate::domain::cash::{CashMovement, CashMovementDirection, CashMovementType};
use crate::domain::customer::{CustomerLedgerEntry, CustomerLedgerEntryType};
use crate::domain::inventory::{StockMovement, StockMovementType};
use crate::domain::organization::DEFAULT_MAIN_BRANCH_ID;
use crate::domain::sales::{
    CompleteSaleDto, PaymentStatus, Sale, SaleFilterDto, SaleLine, SalePayment, SaleResultDto,
    SaleStatus,
};
use crate::errors::{AppError, AppResult};

#[derive(Clone)]
pub struct PostgresSaleRepository {
    pool: PgPool,
}

impl PostgresSaleRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn complete_sale(
        &self,
        dto: &CompleteSaleDto,
        user_id: Option<&str>,
    ) -> AppResult<SaleResultDto> {
        if dto.items.is_empty() {
            return Err(AppError::Validation("Cannot complete sale with empty cart".to_string()));
        }

        let mut tx = self.pool.begin().await.map_err(|e| AppError::Database(e.to_string()))?;

        // 1. Resolve Branch ID
        let branch_id = match dto.branch_id.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
            Some(bid) => bid.to_string(),
            None => {
                let row_opt: Option<(String,)> = sqlx::query_as("SELECT id FROM branches WHERE code = 'MAIN' LIMIT 1")
                    .fetch_optional(&mut *tx)
                    .await
                    .map_err(|e| AppError::Database(e.to_string()))?;
                row_opt.map(|r| r.0).unwrap_or_else(|| DEFAULT_MAIN_BRANCH_ID.to_string())
            }
        };

        // 2. Validate Customer if provided
        let mut customer_opt = None;
        if let Some(ref cid) = dto.customer_id {
            let cid_trim = cid.trim();
            if !cid_trim.is_empty() && cid_trim != "walk-in" {
                let row_opt = sqlx::query("SELECT id, name, credit_limit, is_active FROM customers WHERE id = $1")
                    .bind(cid_trim)
                    .fetch_optional(&mut *tx)
                    .await
                    .map_err(|e| AppError::Database(e.to_string()))?;

                if let Some(row) = row_opt {
                    let is_active_int: i32 = row.try_get(3).unwrap_or(1);
                    if is_active_int != 1 {
                        let name: String = row.try_get(1).unwrap_or_default();
                        return Err(AppError::Validation(format!(
                            "Customer '{name}' is inactive. Cannot complete sale."
                        )));
                    }
                    let id: String = row.try_get(0).map_err(|e| AppError::Database(e.to_string()))?;
                    let name: String = row.try_get(1).map_err(|e| AppError::Database(e.to_string()))?;
                    let credit_limit: i64 = row.try_get(2).unwrap_or(0);
                    customer_opt = Some((id, name, credit_limit));
                } else {
                    return Err(AppError::NotFound(format!("Customer '{cid_trim}' not found")));
                }
            }
        }

        // 3. Resolve Product details & Authoritative Pricing
        struct PreparedLine {
            product_id: String,
            product_name: String,
            sku: String,
            unit_price: i64,
            cost_price: i64,
            quantity: i64,
            discount: i64,
            line_total: i64,
        }

        let mut prepared_lines = Vec::with_capacity(dto.items.len());

        for item in &dto.items {
            if item.quantity <= 0 {
                return Err(AppError::Validation("Item quantity must be greater than 0".to_string()));
            }

            let row_opt = sqlx::query("SELECT id, name, sku, purchase_price, average_cost, sale_price, is_active FROM products WHERE id = $1")
                .bind(&item.product_id)
                .fetch_optional(&mut *tx)
                .await
                .map_err(|e| AppError::Database(e.to_string()))?;

            let row = match row_opt {
                Some(r) => r,
                None => return Err(AppError::NotFound(format!("Product '{}' not found", item.product_id))),
            };

            let is_active_int: i32 = row.try_get(6).unwrap_or(1);
            let name: String = row.try_get(1).map_err(|e| AppError::Database(e.to_string()))?;
            if is_active_int != 1 {
                return Err(AppError::Validation(format!(
                    "Product '{name}' is inactive. Cannot complete sale."
                )));
            }

            let sale_price: i64 = row.try_get(5).map_err(|e| AppError::Database(e.to_string()))?;
            let purchase_price: i64 = row.try_get(3).map_err(|e| AppError::Database(e.to_string()))?;
            let avg_cost: i64 = row.try_get(4).unwrap_or(0);
            let cost_price = if avg_cost > 0 { avg_cost } else { purchase_price };

            let line_disc = item.discount.unwrap_or(0).max(0);
            let subtotal = sale_price * item.quantity;
            let line_total = subtotal.saturating_sub(line_disc);

            prepared_lines.push(PreparedLine {
                product_id: row.try_get(0).map_err(|e| AppError::Database(e.to_string()))?,
                product_name: name,
                sku: row.try_get(2).map_err(|e| AppError::Database(e.to_string()))?,
                unit_price: sale_price,
                cost_price,
                quantity: item.quantity,
                discount: line_disc,
                line_total,
            });
        }

        // 4. Calculate Authoritative Totals
        let subtotal: i64 = prepared_lines.iter().map(|l| l.line_total).sum();
        let invoice_discount = dto.discount.unwrap_or(0).max(0);
        let total_amount = subtotal.saturating_sub(invoice_discount);

        let paid_input = dto.paid_amount.unwrap_or(total_amount).max(0);

        let (recorded_paid, change_amount, credit_amount, payment_status) = if paid_input >= total_amount {
            let change = paid_input - total_amount;
            (total_amount, change, 0, PaymentStatus::Paid)
        } else {
            let credit = total_amount - paid_input;
            let status = if paid_input > 0 {
                PaymentStatus::PartiallyPaid
            } else {
                PaymentStatus::Unpaid
            };
            (paid_input, 0, credit, status)
        };

        // 5. Enforce credit sale constraint
        if credit_amount > 0 && customer_opt.is_none() {
            return Err(AppError::Validation(
                "Credit sales require a registered active customer. Walk-in customers cannot make credit purchases.".to_string(),
            ));
        }

        let customer_id = customer_opt.as_ref().map(|c| c.0.clone());
        let customer_name_snapshot = customer_opt.as_ref().map(|c| c.1.clone());
        let customer_credit_limit = customer_opt.as_ref().map(|c| c.2).unwrap_or(0);

        let now = Utc::now().to_rfc3339();
        let uid = user_id.map(|s| s.to_string());
        let p_method = dto.payment_method.unwrap_or_else(|| "CASH".to_string()).to_uppercase();

        // 6. Validate stock availability for all lines
        for line in &prepared_lines {
            let current_stock: i64 = sqlx::query_as(
                "SELECT quantity FROM stock WHERE product_id = $1 AND branch_id = $2 FOR UPDATE",
            )
            .bind(&line.product_id)
            .bind(&branch_id)
            .fetch_optional(&mut *tx)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?
            .map(|r: (i64,)| r.0)
            .unwrap_or(0);

            if current_stock < line.quantity {
                return Err(AppError::Validation(format!(
                    "Insufficient stock for product '{}': available {}, requested {}",
                    line.product_name, current_stock, line.quantity
                )));
            }
        }

        // 7. Generate invoice number
        sqlx::query("UPDATE counters SET value = value + 1 WHERE name = 'invoice'")
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;

        let inv_val: (i64,) = sqlx::query_as("SELECT value FROM counters WHERE name = 'invoice'")
            .fetch_one(&mut *tx)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;

        let invoice_number = format!("INV-{:06}", inv_val.0);
        let sale_id = Uuid::new_v4().to_string();

        // 8. Handle Customer Credit & Ledger Entry
        let mut customer_balance_after = None;
        if credit_amount > 0 {
            let cid = customer_id.as_ref().unwrap();
            let current_outstanding: (i64,) = sqlx::query_as(
                "SELECT COALESCE(SUM(debit) - SUM(credit), 0) FROM customer_ledger_entries WHERE customer_id = $1",
            )
            .bind(cid)
            .fetch_one(&mut *tx)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;

            if customer_credit_limit > 0 {
                let potential_outstanding = current_outstanding.0 + credit_amount;
                if potential_outstanding > customer_credit_limit {
                    return Err(AppError::Validation(format!(
                        "Credit limit exceeded: current outstanding Rs {}, new credit Rs {}, credit limit Rs {}",
                        current_outstanding.0, credit_amount, customer_credit_limit
                    )));
                }
            }

            let new_balance = current_outstanding.0 + credit_amount;
            customer_balance_after = Some(new_balance);

            let ledger_id = Uuid::new_v4().to_string();
            let desc = format!("Credit Sale {}", invoice_number);

            sqlx::query(
                "INSERT INTO customer_ledger_entries (id, customer_id, reference_id, reference_number, entry_type, debit, credit, balance_after, description, performed_by, created_at)
                 VALUES ($1, $2, $3, $4, 'SALE', $5, 0, $6, $7, $8, $9)",
            )
            .bind(ledger_id)
            .bind(cid)
            .bind(&sale_id)
            .bind(&invoice_number)
            .bind(credit_amount)
            .bind(new_balance)
            .bind(desc)
            .bind(uid.as_deref())
            .bind(&now)
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;
        }

        // 9. Insert Sale Header
        let sale = Sale {
            id: sale_id.clone(),
            invoice_number: invoice_number.clone(),
            branch_id: branch_id.clone(),
            customer_id: customer_id.clone(),
            customer_name_snapshot: customer_name_snapshot.clone(),
            subtotal,
            discount: invoice_discount,
            tax_amount: 0,
            total_amount,
            paid_amount: recorded_paid,
            change_amount,
            payment_status,
            sale_status: SaleStatus::Completed,
            performed_by: uid.clone(),
            notes: dto.notes.clone(),
            created_at: now.clone(),
            updated_at: now.clone(),
        };

        sqlx::query(
            "INSERT INTO sales (
                id, invoice_number, branch_id, customer_id, customer_name_snapshot,
                subtotal, discount, tax_amount, total_amount, paid_amount, change_amount,
                payment_status, sale_status, performed_by, notes, created_at, updated_at
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)"
        )
        .bind(&sale.id)
        .bind(&sale.invoice_number)
        .bind(&sale.branch_id)
        .bind(sale.customer_id.as_deref())
        .bind(sale.customer_name_snapshot.as_deref())
        .bind(sale.subtotal)
        .bind(sale.discount)
        .bind(sale.tax_amount)
        .bind(sale.total_amount)
        .bind(sale.paid_amount)
        .bind(sale.change_amount)
        .bind(sale.payment_status.as_str())
        .bind(sale.sale_status.as_str())
        .bind(sale.performed_by.as_deref())
        .bind(sale.notes.as_deref())
        .bind(&sale.created_at)
        .bind(&sale.updated_at)
        .execute(&mut *tx)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

        // 10. Insert Sale Lines & Deduct Stock
        let mut inserted_lines = Vec::with_capacity(prepared_lines.len());

        for line in prepared_lines {
            let line_id = Uuid::new_v4().to_string();
            let sale_line = SaleLine {
                id: line_id.clone(),
                sale_id: sale_id.clone(),
                product_id: line.product_id.clone(),
                product_name_snapshot: line.product_name.clone(),
                sku_snapshot: line.sku.clone(),
                unit_price: line.unit_price,
                cost_price_snapshot: line.cost_price,
                quantity: line.quantity,
                discount: line.discount,
                line_total: line.line_total,
                created_at: now.clone(),
            };

            sqlx::query(
                "INSERT INTO sale_lines (
                    id, sale_id, product_id, product_name_snapshot, sku_snapshot,
                    unit_price, cost_price_snapshot, quantity, discount, line_total, created_at
                 ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)"
            )
            .bind(&sale_line.id)
            .bind(&sale_line.sale_id)
            .bind(&sale_line.product_id)
            .bind(&sale_line.product_name_snapshot)
            .bind(&sale_line.sku_snapshot)
            .bind(sale_line.unit_price)
            .bind(sale_line.cost_price_snapshot)
            .bind(sale_line.quantity)
            .bind(sale_line.discount)
            .bind(sale_line.line_total)
            .bind(&sale_line.created_at)
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;

            // Deduct stock
            let current_stock: (i64,) = sqlx::query_as("SELECT quantity FROM stock WHERE product_id = $1 AND branch_id = $2")
                .bind(&line.product_id)
                .bind(&branch_id)
                .fetch_one(&mut *tx)
                .await
                .map_err(|e| AppError::Database(e.to_string()))?;

            let new_stock = current_stock.0 - line.quantity;
            sqlx::query("UPDATE stock SET quantity = $1, updated_at = $2 WHERE product_id = $3 AND branch_id = $4")
                .bind(new_stock)
                .bind(&now)
                .bind(&line.product_id)
                .bind(&branch_id)
                .execute(&mut *tx)
                .await
                .map_err(|e| AppError::Database(e.to_string()))?;

            let movement_id = Uuid::new_v4().to_string();
            let reason = format!("Sale Checkout {}", invoice_number);

            sqlx::query(
                "INSERT INTO stock_movements (id, product_id, branch_id, movement_type, quantity, previous_stock, resulting_stock, reason, performed_by, reference_id, created_at)
                 VALUES ($1, $2, $3, 'OUT', $4, $5, $6, $7, $8, $9, $10)"
            )
            .bind(movement_id)
            .bind(&line.product_id)
            .bind(&branch_id)
            .bind(line.quantity)
            .bind(current_stock.0)
            .bind(new_stock)
            .bind(reason)
            .bind(uid.as_deref())
            .bind(&sale_id)
            .bind(&now)
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;

            inserted_lines.push(sale_line);
        }

        // 11. Insert Sale Payment Record
        let payment_id = Uuid::new_v4().to_string();
        let sale_payment = SalePayment {
            id: payment_id,
            sale_id: sale_id.clone(),
            amount: recorded_paid,
            payment_method: p_method.clone(),
            reference_number: dto.payment_reference.clone(),
            notes: dto.notes.clone(),
            created_at: now.clone(),
        };

        sqlx::query(
            "INSERT INTO sale_payments (id, sale_id, amount, payment_method, reference_number, notes, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)"
        )
        .bind(&sale_payment.id)
        .bind(&sale_payment.sale_id)
        .bind(sale_payment.amount)
        .bind(&sale_payment.payment_method)
        .bind(sale_payment.reference_number.as_deref())
        .bind(sale_payment.notes.as_deref())
        .bind(&sale_payment.created_at)
        .execute(&mut *tx)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

        // 12. Record Cash Movement if cash payment
        if recorded_paid > 0 && p_method == "CASH" {
            let open_session_id: Option<String> = sqlx::query_as(
                "SELECT id FROM cash_sessions WHERE branch_id = $1 AND status = 'OPEN' LIMIT 1",
            )
            .bind(&branch_id)
            .fetch_optional(&mut *tx)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?
            .map(|r: (String,)| r.0);

            let cash_mv_id = Uuid::new_v4().to_string();
            let desc = format!("Retail Sale Payment {}", invoice_number);

            sqlx::query(
                "INSERT INTO cash_movements (id, session_id, branch_id, movement_type, direction, amount, reference_id, reference_number, payment_method, description, performed_by, created_at)
                 VALUES ($1, $2, $3, 'SALE_PAYMENT', 'IN', $4, $5, $6, 'CASH', $7, $8, $9)"
            )
            .bind(cash_mv_id)
            .bind(open_session_id.as_deref())
            .bind(&branch_id)
            .bind(recorded_paid)
            .bind(&sale_id)
            .bind(&invoice_number)
            .bind(desc)
            .bind(uid.as_deref())
            .bind(&now)
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;
        }

        tx.commit().await.map_err(|e| AppError::Database(e.to_string()))?;

        Ok(SaleResultDto {
            sale,
            lines: inserted_lines,
            payments: vec![sale_payment],
            customer_outstanding_balance: customer_balance_after,
        })
    }

    pub async fn get_sale_by_id(&self, id: &str) -> AppResult<Option<Sale>> {
        let sql = "SELECT id, invoice_number, branch_id, customer_id, customer_name_snapshot,
                          subtotal, discount, tax_amount, total_amount, paid_amount, change_amount,
                          payment_status, sale_status, performed_by, notes, created_at, updated_at
                   FROM sales WHERE id = $1";
        let row_opt = sqlx::query(sql)
            .bind(id)
            .fetch_optional(&self.pool)
            .await
            .map_err(|e| AppError::Database(format!("Failed to query sale by id: {e}")))?;

        match row_opt {
            Some(row) => Ok(Some(Self::map_sale_row(&row)?)),
            None => Ok(None),
        }
    }

    pub async fn get_sale_by_invoice(&self, invoice_number: &str) -> AppResult<Option<Sale>> {
        let sql = "SELECT id, invoice_number, branch_id, customer_id, customer_name_snapshot,
                          subtotal, discount, tax_amount, total_amount, paid_amount, change_amount,
                          payment_status, sale_status, performed_by, notes, created_at, updated_at
                   FROM sales WHERE invoice_number = $1";
        let row_opt = sqlx::query(sql)
            .bind(invoice_number.trim())
            .fetch_optional(&self.pool)
            .await
            .map_err(|e| AppError::Database(format!("Failed to query sale by invoice: {e}")))?;

        match row_opt {
            Some(row) => Ok(Some(Self::map_sale_row(&row)?)),
            None => Ok(None),
        }
    }

    pub async fn get_sale_lines(&self, sale_id: &str) -> AppResult<Vec<SaleLine>> {
        let sql = "SELECT id, sale_id, product_id, product_name_snapshot, sku_snapshot,
                          unit_price, cost_price_snapshot, quantity, discount, line_total, created_at
                   FROM sale_lines WHERE sale_id = $1 ORDER BY created_at ASC, id ASC";

        let rows = sqlx::query(sql)
            .bind(sale_id)
            .fetch_all(&self.pool)
            .await
            .map_err(|e| AppError::Database(format!("Failed to query sale lines: {e}")))?;

        let mut list = Vec::with_capacity(rows.len());
        for row in rows {
            list.push(SaleLine {
                id: row.try_get(0).map_err(|e| AppError::Database(e.to_string()))?,
                sale_id: row.try_get(1).map_err(|e| AppError::Database(e.to_string()))?,
                product_id: row.try_get(2).map_err(|e| AppError::Database(e.to_string()))?,
                product_name_snapshot: row.try_get(3).map_err(|e| AppError::Database(e.to_string()))?,
                sku_snapshot: row.try_get(4).map_err(|e| AppError::Database(e.to_string()))?,
                unit_price: row.try_get(5).map_err(|e| AppError::Database(e.to_string()))?,
                cost_price_snapshot: row.try_get(6).map_err(|e| AppError::Database(e.to_string()))?,
                quantity: row.try_get(7).map_err(|e| AppError::Database(e.to_string()))?,
                discount: row.try_get(8).map_err(|e| AppError::Database(e.to_string()))?,
                line_total: row.try_get(9).map_err(|e| AppError::Database(e.to_string()))?,
                created_at: row.try_get(10).map_err(|e| AppError::Database(e.to_string()))?,
            });
        }
        Ok(list)
    }

    pub async fn get_sale_payments(&self, sale_id: &str) -> AppResult<Vec<SalePayment>> {
        let sql = "SELECT id, sale_id, amount, payment_method, reference_number, notes, created_at
                   FROM sale_payments WHERE sale_id = $1 ORDER BY created_at ASC, id ASC";

        let rows = sqlx::query(sql)
            .bind(sale_id)
            .fetch_all(&self.pool)
            .await
            .map_err(|e| AppError::Database(format!("Failed to query sale payments: {e}")))?;

        let mut list = Vec::with_capacity(rows.len());
        for row in rows {
            list.push(SalePayment {
                id: row.try_get(0).map_err(|e| AppError::Database(e.to_string()))?,
                sale_id: row.try_get(1).map_err(|e| AppError::Database(e.to_string()))?,
                amount: row.try_get(2).map_err(|e| AppError::Database(e.to_string()))?,
                payment_method: row.try_get(3).map_err(|e| AppError::Database(e.to_string()))?,
                reference_number: row.try_get(4).unwrap_or(None),
                notes: row.try_get(5).unwrap_or(None),
                created_at: row.try_get(6).map_err(|e| AppError::Database(e.to_string()))?,
            });
        }
        Ok(list)
    }

    pub async fn list_sales(&self, filter: &Option<SaleFilterDto>) -> AppResult<Vec<Sale>> {
        let mut query = String::from(
            "SELECT id, invoice_number, branch_id, customer_id, customer_name_snapshot,
                    subtotal, discount, tax_amount, total_amount, paid_amount, change_amount,
                    payment_status, sale_status, performed_by, notes, created_at, updated_at
             FROM sales WHERE 1=1",
        );

        let mut param_index = 1;

        if let Some(f) = filter {
            if f.customer_id.is_some() {
                query.push_str(&format!(" AND customer_id = ${param_index}"));
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
            if f.sale_status.is_some() {
                query.push_str(&format!(" AND sale_status = ${param_index}"));
                param_index += 1;
            }
            if f.start_date.is_some() {
                query.push_str(&format!(" AND created_at >= ${param_index}"));
                param_index += 1;
            }
            if f.end_date.is_some() {
                query.push_str(&format!(" AND created_at <= ${param_index}"));
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
            if let Some(cid) = &f.customer_id {
                q = q.bind(cid);
            }
            if let Some(bid) = &f.branch_id {
                q = q.bind(bid);
            }
            if let Some(ps) = &f.payment_status {
                q = q.bind(ps);
            }
            if let Some(ss) = &f.sale_status {
                q = q.bind(ss);
            }
            if let Some(start) = &f.start_date {
                q = q.bind(start);
            }
            if let Some(end) = &f.end_date {
                q = q.bind(end);
            }
        }

        let rows = q
            .fetch_all(&self.pool)
            .await
            .map_err(|e| AppError::Database(format!("Failed to query sales list: {e}")))?;

        let mut list = Vec::with_capacity(rows.len());
        for row in rows {
            list.push(Self::map_sale_row(&row)?);
        }

        Ok(list)
    }

    fn map_sale_row(row: &sqlx::postgres::PgRow) -> AppResult<Sale> {
        let p_status_str: String = row.try_get(11).map_err(|e| AppError::Database(e.to_string()))?;
        let s_status_str: String = row.try_get(12).map_err(|e| AppError::Database(e.to_string()))?;

        let payment_status = PaymentStatus::from_str(&p_status_str).unwrap_or(PaymentStatus::Paid);
        let sale_status = SaleStatus::from_str(&s_status_str).unwrap_or(SaleStatus::Completed);

        Ok(Sale {
            id: row.try_get(0).map_err(|e| AppError::Database(e.to_string()))?,
            invoice_number: row.try_get(1).map_err(|e| AppError::Database(e.to_string()))?,
            branch_id: row.try_get(2).map_err(|e| AppError::Database(e.to_string()))?,
            customer_id: row.try_get(3).unwrap_or(None),
            customer_name_snapshot: row.try_get(4).unwrap_or(None),
            subtotal: row.try_get(5).map_err(|e| AppError::Database(e.to_string()))?,
            discount: row.try_get(6).map_err(|e| AppError::Database(e.to_string()))?,
            tax_amount: row.try_get(7).map_err(|e| AppError::Database(e.to_string()))?,
            total_amount: row.try_get(8).map_err(|e| AppError::Database(e.to_string()))?,
            paid_amount: row.try_get(9).map_err(|e| AppError::Database(e.to_string()))?,
            change_amount: row.try_get(10).map_err(|e| AppError::Database(e.to_string()))?,
            payment_status,
            sale_status,
            performed_by: row.try_get(13).unwrap_or(None),
            notes: row.try_get(14).unwrap_or(None),
            created_at: row.try_get(15).map_err(|e| AppError::Database(e.to_string()))?,
            updated_at: row.try_get(16).map_err(|e| AppError::Database(e.to_string()))?,
        })
    }
}
