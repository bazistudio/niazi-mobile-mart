use chrono::Utc;
use sqlx::{PgPool, Row};
use uuid::Uuid;

use crate::domain::inventory::{
    AdjustStockDto, DecreaseStockDto, IncreaseStockDto, LowStockItemDto, StockMovement,
    StockMovementType, TransferStockDto,
};
use crate::errors::{AppError, AppResult};

#[derive(Clone)]
pub struct PostgresInventoryRepository {
    pool: PgPool,
}

impl PostgresInventoryRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn get_stock(&self, product_id: &str, branch_id: &str) -> AppResult<i64> {
        let row_opt: Option<(i64,)> =
            sqlx::query_as("SELECT quantity FROM stock WHERE product_id = $1 AND branch_id = $2")
                .bind(product_id)
                .bind(branch_id)
                .fetch_optional(&self.pool)
                .await
                .map_err(|e| AppError::Database(format!("Failed to query stock: {e}")))?;

        Ok(row_opt.map(|r| r.0).unwrap_or(0))
    }

    pub async fn get_stock_map(
        &self,
        branch_id: &str,
    ) -> AppResult<std::collections::HashMap<String, i64>> {
        let rows = sqlx::query("SELECT product_id, quantity FROM stock WHERE branch_id = $1")
            .bind(branch_id)
            .fetch_all(&self.pool)
            .await
            .map_err(|e| AppError::Database(format!("Failed to query stock map: {e}")))?;

        let mut map = std::collections::HashMap::with_capacity(rows.len());
        for row in rows {
            let pid: String = row.try_get(0).map_err(|e| AppError::Database(e.to_string()))?;
            let qty: i64 = row.try_get(1).map_err(|e| AppError::Database(e.to_string()))?;
            map.insert(pid, qty);
        }
        Ok(map)
    }

    pub async fn increase_stock(
        &self,
        dto: &IncreaseStockDto,
        user_id: Option<&str>,
    ) -> AppResult<i64> {
        let mut tx = self.pool.begin().await.map_err(|e| AppError::Database(e.to_string()))?;
        let now = Utc::now().to_rfc3339();

        let current: i64 = sqlx::query_as(
            "SELECT quantity FROM stock WHERE product_id = $1 AND branch_id = $2 FOR UPDATE",
        )
        .bind(&dto.product_id)
        .bind(&dto.branch_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?
        .map(|r: (i64,)| r.0)
        .unwrap_or(0);

        let new_qty = current.saturating_add(dto.quantity);

        sqlx::query(
            "INSERT INTO stock (product_id, branch_id, quantity, updated_at)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (product_id, branch_id) DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = EXCLUDED.updated_at",
        )
        .bind(&dto.product_id)
        .bind(&dto.branch_id)
        .bind(new_qty)
        .bind(&now)
        .execute(&mut *tx)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

        let m_id = Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO stock_movements (id, product_id, branch_id, movement_type, quantity, previous_stock, resulting_stock, reason, performed_by, reference_id, created_at)
             VALUES ($1, $2, $3, 'IN', $4, $5, $6, $7, $8, $9, $10)",
        )
        .bind(m_id)
        .bind(&dto.product_id)
        .bind(&dto.branch_id)
        .bind(dto.quantity)
        .bind(current)
        .bind(new_qty)
        .bind(dto.reason.as_deref())
        .bind(user_id)
        .bind(dto.reference_id.as_deref())
        .bind(&now)
        .execute(&mut *tx)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

        tx.commit().await.map_err(|e| AppError::Database(e.to_string()))?;
        Ok(new_qty)
    }

    pub async fn decrease_stock(
        &self,
        dto: &DecreaseStockDto,
        user_id: Option<&str>,
    ) -> AppResult<i64> {
        let mut tx = self.pool.begin().await.map_err(|e| AppError::Database(e.to_string()))?;
        let now = Utc::now().to_rfc3339();

        let current: i64 = sqlx::query_as(
            "SELECT quantity FROM stock WHERE product_id = $1 AND branch_id = $2 FOR UPDATE",
        )
        .bind(&dto.product_id)
        .bind(&dto.branch_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?
        .map(|r: (i64,)| r.0)
        .unwrap_or(0);

        if current < dto.quantity {
            return Err(AppError::Validation(format!(
                "Insufficient stock: current {current}, requested {}",
                dto.quantity
            )));
        }

        let new_qty = current - dto.quantity;

        sqlx::query(
            "UPDATE stock SET quantity = $1, updated_at = $2 WHERE product_id = $3 AND branch_id = $4",
        )
        .bind(new_qty)
        .bind(&now)
        .bind(&dto.product_id)
        .bind(&dto.branch_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

        let m_id = Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO stock_movements (id, product_id, branch_id, movement_type, quantity, previous_stock, resulting_stock, reason, performed_by, reference_id, created_at)
             VALUES ($1, $2, $3, 'OUT', $4, $5, $6, $7, $8, $9, $10)",
        )
        .bind(m_id)
        .bind(&dto.product_id)
        .bind(&dto.branch_id)
        .bind(dto.quantity)
        .bind(current)
        .bind(new_qty)
        .bind(dto.reason.as_deref())
        .bind(user_id)
        .bind(dto.reference_id.as_deref())
        .bind(&now)
        .execute(&mut *tx)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

        tx.commit().await.map_err(|e| AppError::Database(e.to_string()))?;
        Ok(new_qty)
    }

    pub async fn adjust_stock(
        &self,
        dto: &AdjustStockDto,
        user_id: Option<&str>,
    ) -> AppResult<i64> {
        let mut tx = self.pool.begin().await.map_err(|e| AppError::Database(e.to_string()))?;
        let now = Utc::now().to_rfc3339();

        let current: i64 = sqlx::query_as(
            "SELECT quantity FROM stock WHERE product_id = $1 AND branch_id = $2 FOR UPDATE",
        )
        .bind(&dto.product_id)
        .bind(&dto.branch_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?
        .map(|r: (i64,)| r.0)
        .unwrap_or(0);

        let diff = (dto.target_quantity - current).abs();

        sqlx::query(
            "INSERT INTO stock (product_id, branch_id, quantity, updated_at)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (product_id, branch_id) DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = EXCLUDED.updated_at",
        )
        .bind(&dto.product_id)
        .bind(&dto.branch_id)
        .bind(dto.target_quantity)
        .bind(&now)
        .execute(&mut *tx)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

        if diff > 0 {
            let m_id = Uuid::new_v4().to_string();
            sqlx::query(
                "INSERT INTO stock_movements (id, product_id, branch_id, movement_type, quantity, previous_stock, resulting_stock, reason, performed_by, reference_id, created_at)
                 VALUES ($1, $2, $3, 'ADJUSTMENT', $4, $5, $6, $7, $8, NULL, $9)",
            )
            .bind(m_id)
            .bind(&dto.product_id)
            .bind(&dto.branch_id)
            .bind(diff)
            .bind(current)
            .bind(dto.target_quantity)
            .bind(&dto.reason)
            .bind(user_id)
            .bind(&now)
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;
        }

        tx.commit().await.map_err(|e| AppError::Database(e.to_string()))?;
        Ok(dto.target_quantity)
    }

    pub async fn transfer_stock(
        &self,
        dto: &TransferStockDto,
        user_id: Option<&str>,
    ) -> AppResult<()> {
        let mut tx = self.pool.begin().await.map_err(|e| AppError::Database(e.to_string()))?;
        let now = Utc::now().to_rfc3339();

        let src_curr: i64 = sqlx::query_as(
            "SELECT quantity FROM stock WHERE product_id = $1 AND branch_id = $2 FOR UPDATE",
        )
        .bind(&dto.product_id)
        .bind(&dto.from_branch_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?
        .map(|r: (i64,)| r.0)
        .unwrap_or(0);

        if src_curr < dto.quantity {
            return Err(AppError::Validation(format!(
                "Insufficient stock for transfer: available {src_curr}, requested {}",
                dto.quantity
            )));
        }

        let dest_curr: i64 = sqlx::query_as(
            "SELECT quantity FROM stock WHERE product_id = $1 AND branch_id = $2 FOR UPDATE",
        )
        .bind(&dto.product_id)
        .bind(&dto.to_branch_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?
        .map(|r: (i64,)| r.0)
        .unwrap_or(0);

        let src_new = src_curr - dto.quantity;
        let dest_new = dest_curr + dto.quantity;

        sqlx::query(
            "UPDATE stock SET quantity = $1, updated_at = $2 WHERE product_id = $3 AND branch_id = $4",
        )
        .bind(src_new)
        .bind(&now)
        .bind(&dto.product_id)
        .bind(&dto.from_branch_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

        sqlx::query(
            "INSERT INTO stock (product_id, branch_id, quantity, updated_at)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (product_id, branch_id) DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = EXCLUDED.updated_at",
        )
        .bind(&dto.product_id)
        .bind(&dto.to_branch_id)
        .bind(dest_new)
        .bind(&now)
        .execute(&mut *tx)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

        let ref_id = format!("XFER-{}", Uuid::new_v4());

        // Transfer OUT movement
        let m1 = Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO stock_movements (id, product_id, branch_id, movement_type, quantity, previous_stock, resulting_stock, reason, performed_by, reference_id, created_at)
             VALUES ($1, $2, $3, 'TRANSFER_OUT', $4, $5, $6, $7, $8, $9, $10)",
        )
        .bind(m1)
        .bind(&dto.product_id)
        .bind(&dto.from_branch_id)
        .bind(dto.quantity)
        .bind(src_curr)
        .bind(src_new)
        .bind(dto.reason.as_deref())
        .bind(user_id)
        .bind(&ref_id)
        .bind(&now)
        .execute(&mut *tx)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

        // Transfer IN movement
        let m2 = Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO stock_movements (id, product_id, branch_id, movement_type, quantity, previous_stock, resulting_stock, reason, performed_by, reference_id, created_at)
             VALUES ($1, $2, $3, 'TRANSFER_IN', $4, $5, $6, $7, $8, $9, $10)",
        )
        .bind(m2)
        .bind(&dto.product_id)
        .bind(&dto.to_branch_id)
        .bind(dto.quantity)
        .bind(dest_curr)
        .bind(dest_new)
        .bind(dto.reason.as_deref())
        .bind(user_id)
        .bind(&ref_id)
        .bind(&now)
        .execute(&mut *tx)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

        tx.commit().await.map_err(|e| AppError::Database(e.to_string()))?;
        Ok(())
    }

    pub async fn list_movements(
        &self,
        product_id: Option<&str>,
        branch_id: Option<&str>,
        limit: u32,
    ) -> AppResult<Vec<StockMovement>> {
        let mut query = "SELECT id, product_id, branch_id, movement_type, quantity, previous_stock, resulting_stock, reason, performed_by, reference_id, created_at FROM stock_movements WHERE 1=1".to_string();
        let mut param_index = 1;

        if product_id.is_some() {
            query.push_str(&format!(" AND product_id = ${param_index}"));
            param_index += 1;
        }

        if branch_id.is_some() {
            query.push_str(&format!(" AND branch_id = ${param_index}"));
            param_index += 1;
        }

        query.push_str(&format!(" ORDER BY created_at DESC LIMIT ${param_index}"));

        let mut q = sqlx::query(&query);

        if let Some(pid) = product_id {
            q = q.bind(pid);
        }

        if let Some(bid) = branch_id {
            q = q.bind(bid);
        }

        q = q.bind(limit as i64);

        let rows = q
            .fetch_all(&self.pool)
            .await
            .map_err(|e| AppError::Database(format!("Failed to query stock movements: {e}")))?;

        let mut list = Vec::with_capacity(rows.len());
        for row in rows {
            let mtype_str: String = row.try_get(3).map_err(|e| AppError::Database(e.to_string()))?;
            let mtype = StockMovementType::from_str(&mtype_str)
                .map_err(|e| AppError::Database(e.to_string()))?;

            list.push(StockMovement {
                id: row.try_get(0).map_err(|e| AppError::Database(e.to_string()))?,
                product_id: row.try_get(1).map_err(|e| AppError::Database(e.to_string()))?,
                branch_id: row.try_get(2).map_err(|e| AppError::Database(e.to_string()))?,
                movement_type: mtype,
                quantity: row.try_get(4).map_err(|e| AppError::Database(e.to_string()))?,
                previous_stock: row.try_get(5).map_err(|e| AppError::Database(e.to_string()))?,
                resulting_stock: row.try_get(6).map_err(|e| AppError::Database(e.to_string()))?,
                reason: row.try_get(7).unwrap_or(None),
                performed_by: row.try_get(8).unwrap_or(None),
                reference_id: row.try_get(9).unwrap_or(None),
                created_at: row.try_get(10).map_err(|e| AppError::Database(e.to_string()))?,
            });
        }
        Ok(list)
    }

    pub async fn list_low_stock(&self, branch_id: &str) -> AppResult<Vec<LowStockItemDto>> {
        let sql = "
            SELECT p.id, p.name, p.sku, b.id, b.name, COALESCE(s.quantity, 0), p.low_stock_threshold
            FROM products p
            CROSS JOIN branches b
            LEFT JOIN stock s ON s.product_id = p.id AND s.branch_id = b.id
            WHERE b.id = $1 AND p.is_active = 1 AND COALESCE(s.quantity, 0) <= p.low_stock_threshold
            ORDER BY COALESCE(s.quantity, 0) ASC, p.name ASC
        ";

        let rows = sqlx::query(sql)
            .bind(branch_id)
            .fetch_all(&self.pool)
            .await
            .map_err(|e| AppError::Database(format!("Failed to query low stock: {e}")))?;

        let mut list = Vec::with_capacity(rows.len());
        for row in rows {
            list.push(LowStockItemDto {
                product_id: row.try_get(0).map_err(|e| AppError::Database(e.to_string()))?,
                product_name: row.try_get(1).map_err(|e| AppError::Database(e.to_string()))?,
                sku: row.try_get(2).map_err(|e| AppError::Database(e.to_string()))?,
                branch_id: row.try_get(3).map_err(|e| AppError::Database(e.to_string()))?,
                branch_name: row.try_get(4).map_err(|e| AppError::Database(e.to_string()))?,
                current_quantity: row.try_get(5).unwrap_or(0),
                threshold: row.try_get(6).unwrap_or(5),
            });
        }
        Ok(list)
    }
}
