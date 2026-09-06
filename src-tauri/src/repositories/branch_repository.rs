use rusqlite::params;
use serde::{Deserialize, Serialize};

use crate::db::connection::DatabaseConnection;
use crate::domain::organization::Branch;
use crate::errors::{AppError, AppResult};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrganizationDashboardStats {
    pub product_count: i64,
    pub category_count: i64,
    pub active_staff_count: i64,
    pub low_stock_count: i64,
    pub active_branch_count: i64,
}

#[derive(Clone)]
pub struct BranchRepository {
    db: DatabaseConnection,
}

impl BranchRepository {
    pub fn new(db: DatabaseConnection) -> Self {
        Self { db }
    }

    pub async fn list_branches(&self) -> AppResult<Vec<Branch>> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        let mut stmt = guard
            .prepare("SELECT id, organization_id, name, code, is_active, created_at, updated_at FROM branches ORDER BY name ASC")
            .map_err(|e| AppError::Database(format!("Failed to prepare branch query: {e}")))?;

        let branches = stmt
            .query_map([], |row| {
                Ok(Branch {
                    id: row.get(0)?,
                    organization_id: row.get(1)?,
                    name: row.get(2)?,
                    code: row.get(3)?,
                    is_active: row.get::<_, i64>(4)? == 1,
                    created_at: row.get(5)?,
                    updated_at: row.get(6)?,
                })
            })
            .map_err(|e| AppError::Database(format!("Failed to query branches: {e}")))?
            .collect::<Result<Vec<Branch>, rusqlite::Error>>()
            .map_err(|e| AppError::Database(format!("Failed to parse branches: {e}")))?;

        Ok(branches)
    }

    pub async fn get_main_branch(&self) -> AppResult<Option<Branch>> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        let sql = "SELECT id, organization_id, name, code, is_active, created_at, updated_at FROM branches WHERE code = 'MAIN' LIMIT 1";
        let branch = guard
            .query_row(sql, [], |row| {
                Ok(Branch {
                    id: row.get(0)?,
                    organization_id: row.get(1)?,
                    name: row.get(2)?,
                    code: row.get(3)?,
                    is_active: row.get::<_, i64>(4)? == 1,
                    created_at: row.get(5)?,
                    updated_at: row.get(6)?,
                })
            })
            .map(Some)
            .or_else(|e| match e {
                rusqlite::Error::QueryReturnedNoRows => Ok(None),
                other => Err(AppError::Database(format!("Error querying main branch: {other}"))),
            })?;

        Ok(branch)
    }

    pub async fn get_dashboard_stats(&self) -> AppResult<OrganizationDashboardStats> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        let product_count: i64 = guard
            .query_row("SELECT COUNT(*) FROM products WHERE is_active = 1", [], |r| r.get(0))
            .unwrap_or(0);

        let category_count: i64 = guard
            .query_row("SELECT COUNT(*) FROM categories WHERE is_active = 1", [], |r| r.get(0))
            .unwrap_or(0);

        let active_staff_count: i64 = guard
            .query_row("SELECT COUNT(*) FROM users WHERE is_active = 1", [], |r| r.get(0))
            .unwrap_or(0);

        let low_stock_count: i64 = guard
            .query_row(
                "SELECT COUNT(*) FROM products p 
                 LEFT JOIN (SELECT product_id, SUM(quantity) as total_qty FROM stock GROUP BY product_id) s ON p.id = s.product_id 
                 WHERE p.is_active = 1 AND COALESCE(s.total_qty, 0) <= p.low_stock_threshold",
                [],
                |r| r.get(0),
            )
            .unwrap_or(0);

        let active_branch_count: i64 = guard
            .query_row("SELECT COUNT(*) FROM branches WHERE is_active = 1", [], |r| r.get(0))
            .unwrap_or(0);

        Ok(OrganizationDashboardStats {
            product_count,
            category_count,
            active_staff_count,
            low_stock_count,
            active_branch_count,
        })
    }
}
