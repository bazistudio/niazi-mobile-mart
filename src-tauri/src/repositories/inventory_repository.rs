use rusqlite::{params, Connection};

use crate::db::connection::DatabaseConnection;
use crate::db::errors::{DbError, DbResult};
use crate::domain::inventory::{LowStockItemDto, StockMovement, StockMovementType};
use crate::errors::{AppError, AppResult};

#[derive(Clone)]
pub struct SQLiteInventoryRepository {
    db: DatabaseConnection,
}

impl SQLiteInventoryRepository {
    pub fn new(db: DatabaseConnection) -> Self {
        Self { db }
    }

    /// Reads current stock quantity for a product at a branch (defaults to 0 if not yet initialized)
    pub async fn get_stock(&self, product_id: &str, branch_id: &str) -> AppResult<i64> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;
        Self::get_stock_internal(&guard, product_id, branch_id).map_err(AppError::from)
    }

    /// Reads current stock quantity inside an active transaction
    pub fn get_stock_in_tx(conn: &Connection, product_id: &str, branch_id: &str) -> DbResult<i64> {
        Self::get_stock_internal(conn, product_id, branch_id)
    }

    fn get_stock_internal(conn: &Connection, product_id: &str, branch_id: &str) -> DbResult<i64> {
        let res = conn.query_row(
            "SELECT quantity FROM stock WHERE product_id = ?1 AND branch_id = ?2",
            params![product_id, branch_id],
            |row| row.get(0),
        );

        match res {
            Ok(qty) => Ok(qty),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(0),
            Err(e) => Err(DbError::QueryError(format!("Failed to query stock: {e}"))),
        }
    }

    /// Upserts current stock quantity inside an active transaction
    pub fn set_stock_in_tx(
        conn: &Connection,
        product_id: &str,
        branch_id: &str,
        quantity: i64,
        updated_at: &str,
    ) -> DbResult<()> {
        if quantity < 0 {
            return Err(DbError::ConstraintViolation("Stock quantity cannot be negative".to_string()));
        }

        conn.execute(
            "INSERT INTO stock (product_id, branch_id, quantity, updated_at)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(product_id, branch_id) DO UPDATE SET
                 quantity = excluded.quantity,
                 updated_at = excluded.updated_at",
            params![product_id, branch_id, quantity, updated_at],
        )
        .map_err(|e| DbError::QueryError(format!("Failed to upsert stock: {e}")))?;

        Ok(())
    }

    /// Inserts an immutable stock movement record inside an active transaction
    pub fn insert_movement_in_tx(conn: &Connection, movement: &StockMovement) -> DbResult<()> {
        if movement.quantity <= 0 {
            return Err(DbError::ConstraintViolation("Movement quantity must be greater than 0".to_string()));
        }
        if movement.resulting_stock < 0 {
            return Err(DbError::ConstraintViolation("Resulting stock cannot be negative".to_string()));
        }
        if movement.previous_stock < 0 {
            return Err(DbError::ConstraintViolation("Previous stock cannot be negative".to_string()));
        }

        conn.execute(
            "INSERT INTO stock_movements (id, product_id, branch_id, movement_type, quantity, previous_stock, resulting_stock, reason, performed_by, reference_id, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                movement.id,
                movement.product_id,
                movement.branch_id,
                movement.movement_type.as_str(),
                movement.quantity,
                movement.previous_stock,
                movement.resulting_stock,
                movement.reason.as_deref(),
                movement.performed_by.as_deref(),
                movement.reference_id.as_deref(),
                movement.created_at,
            ],
        )
        .map_err(|e| DbError::QueryError(format!("Failed to insert stock movement: {e}")))?;

        Ok(())
    }

    /// Lists recent stock movements with optional product and branch filters
    pub async fn list_movements(
        &self,
        product_id: Option<&str>,
        branch_id: Option<&str>,
        limit: u32,
    ) -> AppResult<Vec<StockMovement>> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        let mut query = "SELECT id, product_id, branch_id, movement_type, quantity, previous_stock, resulting_stock, reason, performed_by, reference_id, created_at FROM stock_movements WHERE 1=1".to_string();
        let mut param_values: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

        if let Some(pid) = product_id {
            query.push_str(" AND product_id = ?");
            param_values.push(Box::new(pid.to_string()));
        }
        if let Some(bid) = branch_id {
            query.push_str(" AND branch_id = ?");
            param_values.push(Box::new(bid.to_string()));
        }

        query.push_str(" ORDER BY created_at DESC LIMIT ?");
        param_values.push(Box::new(limit as i64));

        let mut stmt = guard
            .prepare(&query)
            .map_err(|e| AppError::Database(format!("Failed to prepare stock movements query: {e}")))?;

        let rusqlite_params: Vec<&dyn rusqlite::ToSql> = param_values.iter().map(|b| b.as_ref()).collect();

        let iter = stmt
            .query_map(&rusqlite_params[..], |row| {
                let mtype_str: String = row.get(3)?;
                let mtype = StockMovementType::from_str(&mtype_str)
                    .map_err(|e| rusqlite::Error::FromSqlConversionFailure(3, rusqlite::types::Type::Text, Box::new(std::io::Error::new(std::io::ErrorKind::InvalidData, e))))?;

                Ok(StockMovement {
                    id: row.get(0)?,
                    product_id: row.get(1)?,
                    branch_id: row.get(2)?,
                    movement_type: mtype,
                    quantity: row.get(4)?,
                    previous_stock: row.get(5)?,
                    resulting_stock: row.get(6)?,
                    reason: row.get(7)?,
                    performed_by: row.get(8)?,
                    reference_id: row.get(9)?,
                    created_at: row.get(10)?,
                })
            })
            .map_err(|e| AppError::Database(format!("Failed to query stock movements: {e}")))?;

        let mut list = Vec::new();
        for item in iter {
            list.push(item.map_err(|e| AppError::Database(format!("Stock movement row error: {e}")))?);
        }
        Ok(list)
    }

    /// Queries all products whose stock in the specified branch is at or below the low_stock_threshold
    pub async fn list_low_stock(&self, branch_id: &str) -> AppResult<Vec<LowStockItemDto>> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        let mut stmt = guard
            .prepare(
                "SELECT p.id, p.name, p.sku, b.id, b.name, COALESCE(s.quantity, 0), p.low_stock_threshold
                 FROM products p
                 CROSS JOIN branches b
                 LEFT JOIN stock s ON s.product_id = p.id AND s.branch_id = b.id
                 WHERE b.id = ?1 AND p.is_active = 1 AND COALESCE(s.quantity, 0) <= p.low_stock_threshold
                 ORDER BY COALESCE(s.quantity, 0) ASC, p.name ASC",
            )
            .map_err(|e| AppError::Database(format!("Failed to prepare low stock query: {e}")))?;

        let iter = stmt
            .query_map(params![branch_id], |row| {
                Ok(LowStockItemDto {
                    product_id: row.get(0)?,
                    product_name: row.get(1)?,
                    sku: row.get(2)?,
                    branch_id: row.get(3)?,
                    branch_name: row.get(4)?,
                    current_quantity: row.get(5)?,
                    threshold: row.get(6)?,
                })
            })
            .map_err(|e| AppError::Database(format!("Failed to query low stock: {e}")))?;

        let mut list = Vec::new();
        for item in iter {
            list.push(item.map_err(|e| AppError::Database(format!("Low stock row error: {e}")))?);
        }
        Ok(list)
    }
}
