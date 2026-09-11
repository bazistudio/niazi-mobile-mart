use sqlx::PgPool;

use crate::domain::organization::Branch;
use crate::errors::{AppError, AppResult};
use crate::repositories::branch_repository::OrganizationDashboardStats;

#[derive(Clone)]
pub struct PostgresBranchRepository {
    pool: PgPool,
}

impl PostgresBranchRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn list_branches(&self) -> AppResult<Vec<Branch>> {
        let sql = "SELECT id, organization_id, name, code, is_active, created_at, updated_at FROM branches ORDER BY name ASC";
        let rows = sqlx::query(sql)
            .fetch_all(&self.pool)
            .await
            .map_err(|e| AppError::Database(format!("Failed to query branches: {e}")))?;

        let mut branches = Vec::with_capacity(rows.len());
        for row in rows {
            use sqlx::Row;
            let is_active_int: i32 = row.try_get(4).unwrap_or(1);
            branches.push(Branch {
                id: row.try_get(0).map_err(|e| AppError::Database(e.to_string()))?,
                organization_id: row.try_get(1).map_err(|e| AppError::Database(e.to_string()))?,
                name: row.try_get(2).map_err(|e| AppError::Database(e.to_string()))?,
                code: row.try_get(3).map_err(|e| AppError::Database(e.to_string()))?,
                is_active: is_active_int == 1,
                created_at: row.try_get(5).map_err(|e| AppError::Database(e.to_string()))?,
                updated_at: row.try_get(6).map_err(|e| AppError::Database(e.to_string()))?,
            });
        }

        Ok(branches)
    }

    pub async fn get_main_branch(&self) -> AppResult<Option<Branch>> {
        let sql = "SELECT id, organization_id, name, code, is_active, created_at, updated_at FROM branches WHERE code = 'MAIN' LIMIT 1";
        let row_opt = sqlx::query(sql)
            .fetch_optional(&self.pool)
            .await
            .map_err(|e| AppError::Database(format!("Error querying main branch: {e}")))?;

        match row_opt {
            Some(row) => {
                use sqlx::Row;
                let is_active_int: i32 = row.try_get(4).unwrap_or(1);
                Ok(Some(Branch {
                    id: row.try_get(0).map_err(|e| AppError::Database(e.to_string()))?,
                    organization_id: row.try_get(1).map_err(|e| AppError::Database(e.to_string()))?,
                    name: row.try_get(2).map_err(|e| AppError::Database(e.to_string()))?,
                    code: row.try_get(3).map_err(|e| AppError::Database(e.to_string()))?,
                    is_active: is_active_int == 1,
                    created_at: row.try_get(5).map_err(|e| AppError::Database(e.to_string()))?,
                    updated_at: row.try_get(6).map_err(|e| AppError::Database(e.to_string()))?,
                }))
            }
            None => Ok(None),
        }
    }

    pub async fn get_dashboard_stats(&self) -> AppResult<OrganizationDashboardStats> {
        let product_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM products WHERE is_active = 1")
            .fetch_one(&self.pool)
            .await
            .unwrap_or((0,));

        let category_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM categories WHERE is_active = 1")
            .fetch_one(&self.pool)
            .await
            .unwrap_or((0,));

        let active_staff_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM users WHERE is_active = 1")
            .fetch_one(&self.pool)
            .await
            .unwrap_or((0,));

        let low_stock_sql = "
            SELECT COUNT(*) FROM products p 
            LEFT JOIN (SELECT product_id, SUM(quantity) as total_qty FROM stock GROUP BY product_id) s ON p.id = s.product_id 
            WHERE p.is_active = 1 AND COALESCE(s.total_qty, 0) <= p.low_stock_threshold
        ";
        let low_stock_count: (i64,) = sqlx::query_as(low_stock_sql)
            .fetch_one(&self.pool)
            .await
            .unwrap_or((0,));

        let active_branch_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM branches WHERE is_active = 1")
            .fetch_one(&self.pool)
            .await
            .unwrap_or((0,));

        Ok(OrganizationDashboardStats {
            product_count: product_count.0,
            category_count: category_count.0,
            active_staff_count: active_staff_count.0,
            low_stock_count: low_stock_count.0,
            active_branch_count: active_branch_count.0,
        })
    }
}
