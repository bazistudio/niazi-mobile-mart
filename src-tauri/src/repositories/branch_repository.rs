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
                other => Err(AppError::Database(format!(
                    "Error querying main branch: {other}"
                ))),
            })?;

        Ok(branch)
    }

    pub async fn get_dashboard_stats(&self) -> AppResult<OrganizationDashboardStats> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        let product_count: i64 = guard
            .query_row(
                "SELECT COUNT(*) FROM products WHERE is_active = 1",
                [],
                |r| r.get(0),
            )
            .unwrap_or(0);

        let category_count: i64 = guard
            .query_row(
                "SELECT COUNT(*) FROM categories WHERE is_active = 1",
                [],
                |r| r.get(0),
            )
            .unwrap_or(0);

        let active_staff_count: i64 = guard
            .query_row("SELECT COUNT(*) FROM users WHERE is_active = 1", [], |r| {
                r.get(0)
            })
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
            .query_row(
                "SELECT COUNT(*) FROM branches WHERE is_active = 1",
                [],
                |r| r.get(0),
            )
            .unwrap_or(0);

        Ok(OrganizationDashboardStats {
            product_count,
            category_count,
            active_staff_count,
            low_stock_count,
            active_branch_count,
        })
    }

    /// Calculates global aggregate balances across all ledgers
    pub async fn get_dashboard_balances(
        &self,
    ) -> AppResult<crate::domain::organization::DashboardBalancesDto> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        let customer_receivables: i64 = guard
            .query_row(
                "SELECT COALESCE(SUM(debit) - SUM(credit), 0) FROM customer_ledger_entries",
                [],
                |r| r.get(0),
            )
            .unwrap_or(0);

        let supplier_payables: i64 = guard
            .query_row(
                "SELECT COALESCE(SUM(debit) - SUM(credit), 0) FROM supplier_ledger_entries",
                [],
                |r| r.get(0),
            )
            .unwrap_or(0);

        Ok(crate::domain::organization::DashboardBalancesDto {
            customer_receivables,
            supplier_payables,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::connection::DatabaseConnection;
    use crate::db::migrations::MigrationRunner;

    async fn setup_db() -> DatabaseConnection {
        let db = DatabaseConnection::open_in_memory().unwrap();
        {
            let conn_arc = db.inner();
            let mut guard = conn_arc.lock().await;
            MigrationRunner::run(&mut guard).unwrap();
        }
        db
    }

    #[tokio::test]
    async fn test_get_dashboard_balances() {
        let db = setup_db().await;
        let repo = BranchRepository::new(db.clone());

        // Test 1: Empty ledgers
        let balances = repo.get_dashboard_balances().await.unwrap();
        assert_eq!(balances.customer_receivables, 0);
        assert_eq!(balances.supplier_payables, 0);

        let cust_id = "00000000-0000-0000-0000-0000000000c0";
        let supp_id = "00000000-0000-0000-0000-0000000000s0";

        {
            let conn_arc = db.inner();
            let guard = conn_arc.lock().await;

            guard.execute(
                "INSERT INTO customers (id, customer_code, name, phone, is_active, created_at, updated_at) VALUES (?1, 'C1', 'Cust 1', '03001234567', 1, '2026', '2026')",
                rusqlite::params![cust_id],
            ).unwrap();

            guard.execute(
                "INSERT INTO suppliers (id, supplier_code, name, phone, is_active, created_at, updated_at) VALUES (?1, 'S1', 'Supp 1', '03007654321', 1, '2026', '2026')",
                rusqlite::params![supp_id],
            ).unwrap();

            // Test 2: Customer receivable (10000 debit, 3000 credit)
            guard.execute(
                "INSERT INTO customer_ledger_entries (id, customer_id, entry_type, debit, credit, balance_after, description, performed_by, created_at)
                 VALUES ('00000000-0000-0000-0000-0000000000c1', ?1, 'SALE', 10000, 3000, 7000, 'test', NULL, '2026')",
                rusqlite::params![cust_id],
            ).unwrap();

            // Test 3: Supplier payable (15000 debit, 5000 credit)
            guard.execute(
                "INSERT INTO supplier_ledger_entries (id, supplier_id, entry_type, debit, credit, balance_after, description, performed_by, created_at)
                 VALUES ('00000000-0000-0000-0000-0000000000s1', ?1, 'PURCHASE', 15000, 5000, 10000, 'test', NULL, '2026')",
                rusqlite::params![supp_id],
            ).unwrap();
        }

        let balances = repo.get_dashboard_balances().await.unwrap();
        assert_eq!(balances.customer_receivables, 7000);
        assert_eq!(balances.supplier_payables, 10000);

        // Test 4 & 5: Multiple entries & Settled account
        {
            let conn_arc = db.inner();
            let guard = conn_arc.lock().await;

            guard.execute(
                "INSERT INTO customer_ledger_entries (id, customer_id, entry_type, debit, credit, balance_after, description, performed_by, created_at)
                 VALUES ('00000000-0000-0000-0000-0000000000c2', ?1, 'PAYMENT', 0, 7000, 0, 'test', NULL, '2026')",
                rusqlite::params![cust_id],
            ).unwrap();

            guard.execute(
                "INSERT INTO supplier_ledger_entries (id, supplier_id, entry_type, debit, credit, balance_after, description, performed_by, created_at)
                 VALUES ('00000000-0000-0000-0000-0000000000s2', ?1, 'PAYMENT', 0, 10000, 0, 'test', NULL, '2026')",
                rusqlite::params![supp_id],
            ).unwrap();
        }

        let balances = repo.get_dashboard_balances().await.unwrap();
        assert_eq!(balances.customer_receivables, 0);
        assert_eq!(balances.supplier_payables, 0);
    }
}
