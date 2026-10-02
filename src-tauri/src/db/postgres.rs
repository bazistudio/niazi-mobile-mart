use sqlx::{postgres::PgPoolOptions, PgPool};
use tracing::info;

use crate::db::errors::{DbError, DbResult};

/// PostgreSQL connection pool for Cloud Run deployment.
///
/// This adapter is initialized only when `DATABASE_URL` points to a PostgreSQL instance.
/// The existing SQLite path via `DatabaseConnection` is untouched and remains active for
/// the desktop Tauri application.
#[derive(Debug)]
pub struct PostgresAdapter {
    pool: PgPool,
}

/// Default per-instance pool size. Cloud SQL db-f1-micro allows 25 connections in total;
/// with Cloud Run at up to 10 instances, 10 x 2 = 20 leaves headroom for admin sessions.
pub const DEFAULT_PG_POOL_MAX_CONNECTIONS: u32 = 2;

/// Upper bound for the `PG_POOL_MAX_CONNECTIONS` override, so a typo cannot exhaust Cloud SQL.
pub const MAX_PG_POOL_MAX_CONNECTIONS: u32 = 10;

/// Resolves the per-instance pool size from `PG_POOL_MAX_CONNECTIONS`.
/// Missing, unparsable or zero values fall back to the default; values above the cap are clamped.
pub fn pool_max_connections() -> u32 {
    parse_pool_max_connections(std::env::var("PG_POOL_MAX_CONNECTIONS").ok().as_deref())
}

fn parse_pool_max_connections(raw: Option<&str>) -> u32 {
    match raw.and_then(|v| v.trim().parse::<u32>().ok()) {
        Some(0) | None => DEFAULT_PG_POOL_MAX_CONNECTIONS,
        Some(n) => n.min(MAX_PG_POOL_MAX_CONNECTIONS),
    }
}

impl PostgresAdapter {
    /// Initialize a connection pool from `DATABASE_URL` environment variable.
    /// Returns an error if the env var is absent or the pool cannot connect.
    pub async fn from_env() -> DbResult<Self> {
        let database_url = std::env::var("DATABASE_URL").map_err(|_| {
            DbError::ConnectionError(
                "DATABASE_URL environment variable is required for PostgreSQL mode".to_string(),
            )
        })?;

        Self::from_url(&database_url).await
    }

    /// Initialize a connection pool from an explicit connection URL.
    pub async fn from_url(database_url: &str) -> DbResult<Self> {
        let max_connections = pool_max_connections();
        info!("Initializing PostgreSQL connection pool (max {max_connections} connections)...");

        // Cloud SQL db-f1-micro allows only 25 connections in total, shared by every
        // Cloud Run instance. Keep the per-instance pool small and hold no idle
        // connections, so (max instances x pool size) stays under the server limit.
        let pool = PgPoolOptions::new()
            .max_connections(max_connections)
            .min_connections(0)
            .acquire_timeout(std::time::Duration::from_secs(10))
            .connect(database_url)
            .await
            .map_err(|e| {
                DbError::ConnectionError(format!("Failed to connect to PostgreSQL: {e}"))
            })?;

        // Validate connection health immediately
        sqlx::query("SELECT 1").execute(&pool).await.map_err(|e| {
            DbError::ConnectionError(format!("PostgreSQL health check failed: {e}"))
        })?;

        info!("PostgreSQL connection pool initialized successfully ({max_connections} max connections)");

        Ok(Self { pool })
    }

    /// Returns a reference to the underlying sqlx PgPool for query execution.
    pub fn pool(&self) -> &PgPool {
        &self.pool
    }

    /// Executes PostgreSQL schema migrations (001 to 009) against the connection pool.
    pub async fn run_migrations(&self) -> DbResult<()> {
        info!("Running PostgreSQL schema migrations...");
        let schema_001 = include_str!("../../migrations/postgres/001_initial_schema.sql");
        let schema_002 =
            include_str!("../../migrations/postgres/002_add_terminals_and_sync_queue.sql");
        let schema_003 = include_str!("../../migrations/postgres/003_add_change_log.sql");
        let schema_004 =
            include_str!("../../migrations/postgres/004_add_master_data_foundation.sql");
        let schema_005 =
            include_str!("../../migrations/postgres/005_product_identity_and_normalization.sql");
        let schema_006 = include_str!("../../migrations/postgres/006_multi_payment.sql");
        let schema_007 = include_str!("../../migrations/postgres/007_parties_foundation.sql");
        let schema_008 = include_str!("../../migrations/postgres/008_search_index_parity.sql");
        let schema_009 = include_str!("../../migrations/postgres/009_fix_public_rates_fk.sql");
        let schema_010 = include_str!(
            "../../migrations/postgres/010_add_terminal_code_for_invoice_numbering.sql"
        );
        let schema_011 =
            include_str!("../../migrations/postgres/011_terminal_invoice_counters.sql");

        let mut tx = self.pool.begin().await.map_err(|e| {
            DbError::MigrationError(format!("Failed to begin migration transaction: {e}"))
        })?;

        sqlx::raw_sql(schema_001)
            .execute(&mut *tx)
            .await
            .map_err(|e| {
                DbError::MigrationError(format!("Failed to execute PostgreSQL migration 001: {e}"))
            })?;

        sqlx::raw_sql(schema_002)
            .execute(&mut *tx)
            .await
            .map_err(|e| {
                DbError::MigrationError(format!("Failed to execute PostgreSQL migration 002: {e}"))
            })?;

        sqlx::raw_sql(schema_003)
            .execute(&mut *tx)
            .await
            .map_err(|e| {
                DbError::MigrationError(format!("Failed to execute PostgreSQL migration 003: {e}"))
            })?;

        sqlx::raw_sql(schema_004)
            .execute(&mut *tx)
            .await
            .map_err(|e| {
                DbError::MigrationError(format!("Failed to execute PostgreSQL migration 004: {e}"))
            })?;

        sqlx::raw_sql(schema_005)
            .execute(&mut *tx)
            .await
            .map_err(|e| {
                DbError::MigrationError(format!("Failed to execute PostgreSQL migration 005: {e}"))
            })?;

        sqlx::raw_sql(schema_006)
            .execute(&mut *tx)
            .await
            .map_err(|e| {
                DbError::MigrationError(format!("Failed to execute PostgreSQL migration 006: {e}"))
            })?;

        sqlx::raw_sql(schema_007)
            .execute(&mut *tx)
            .await
            .map_err(|e| {
                DbError::MigrationError(format!("Failed to execute PostgreSQL migration 007: {e}"))
            })?;

        sqlx::raw_sql(schema_008)
            .execute(&mut *tx)
            .await
            .map_err(|e| {
                DbError::MigrationError(format!("Failed to execute PostgreSQL migration 008: {e}"))
            })?;

        sqlx::raw_sql(schema_009)
            .execute(&mut *tx)
            .await
            .map_err(|e| {
                DbError::MigrationError(format!("Failed to execute PostgreSQL migration 009: {e}"))
            })?;

        sqlx::raw_sql(schema_010)
            .execute(&mut *tx)
            .await
            .map_err(|e| {
                DbError::MigrationError(format!("Failed to execute PostgreSQL migration 010: {e}"))
            })?;

        sqlx::raw_sql(schema_011)
            .execute(&mut *tx)
            .await
            .map_err(|e| {
                DbError::MigrationError(format!("Failed to execute PostgreSQL migration 011: {e}"))
            })?;

        tx.commit().await.map_err(|e| {
            DbError::MigrationError(format!("Failed to commit migration transaction: {e}"))
        })?;

        info!("PostgreSQL schema migrations applied successfully (001 to 011).");
        Ok(())
    }

    /// Closes all connections in the pool gracefully.
    pub async fn close(&self) {
        self.pool.close().await;
        info!("PostgreSQL connection pool closed.");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pool_max_connections_parsing() {
        assert_eq!(parse_pool_max_connections(None), 2);
        assert_eq!(parse_pool_max_connections(Some("")), 2);
        assert_eq!(parse_pool_max_connections(Some("abc")), 2);
        assert_eq!(parse_pool_max_connections(Some("0")), 2);
        assert_eq!(parse_pool_max_connections(Some("-3")), 2);
        assert_eq!(parse_pool_max_connections(Some(" 4 ")), 4);
        assert_eq!(
            parse_pool_max_connections(Some("50")),
            MAX_PG_POOL_MAX_CONNECTIONS
        );
    }

    /// Verifies that the PostgresAdapter correctly rejects a missing DATABASE_URL.
    /// Does NOT require a live PostgreSQL instance.
    #[tokio::test]
    async fn test_postgres_adapter_rejects_missing_env() {
        // Temporarily remove DATABASE_URL for this test
        let saved = std::env::var("DATABASE_URL").ok();
        // Only run the "missing" assertion when DATABASE_URL genuinely isn't set.
        // If it IS set (CI with real PG), skip this check to avoid masking it.
        if saved.is_none() {
            let result = PostgresAdapter::from_env().await;
            assert!(
                result.is_err(),
                "Expected error when DATABASE_URL is absent"
            );
            let err_msg = result.unwrap_err().to_string();
            assert!(
                err_msg.contains("DATABASE_URL"),
                "Error should mention DATABASE_URL, got: {err_msg}"
            );
        }
        // Restore env var if it was set
        if let Some(url) = saved {
            std::env::set_var("DATABASE_URL", url);
        }
    }

    /// Live integration test — only runs when DATABASE_URL is set to a real PostgreSQL instance.
    /// Run with: DATABASE_URL=postgres://... cargo test postgres -- --nocapture
    #[tokio::test]
    async fn test_postgres_live_connection_if_env_set() {
        let url = match std::env::var("DATABASE_URL") {
            Ok(u) if u.starts_with("postgres") => u,
            _ => return, // Skip if not set or not PostgreSQL
        };

        let adapter = PostgresAdapter::from_url(&url)
            .await
            .expect("PostgreSQL pool should initialize");

        // Execute migrations on live PG instance
        adapter
            .run_migrations()
            .await
            .expect("PostgreSQL migrations should succeed");

        // Basic connectivity check
        let row: (i64,) = sqlx::query_as("SELECT 1")
            .fetch_one(adapter.pool())
            .await
            .expect("SELECT 1 should succeed");

        assert_eq!(row.0, 1, "SELECT 1 must return 1");

        // Validate multi-step transaction commit
        let mut tx = adapter
            .pool()
            .begin()
            .await
            .expect("Should be able to begin transaction");

        sqlx::query("INSERT INTO counters (name, value) VALUES ('test_counter', 100) ON CONFLICT (name) DO UPDATE SET value = 100")
            .execute(&mut *tx)
            .await
            .expect("Query inside transaction should work");

        tx.commit()
            .await
            .expect("Transaction commit should succeed");

        // Validate transaction rollback
        let mut tx2 = adapter
            .pool()
            .begin()
            .await
            .expect("Should be able to begin second transaction");

        sqlx::query("UPDATE counters SET value = 999 WHERE name = 'test_counter'")
            .execute(&mut *tx2)
            .await
            .expect("Query inside second transaction should work");

        tx2.rollback()
            .await
            .expect("Transaction rollback should succeed");

        // Verify value was NOT updated to 999 (rollback succeeded)
        let val: (i64,) = sqlx::query_as("SELECT value FROM counters WHERE name = 'test_counter'")
            .fetch_one(adapter.pool())
            .await
            .expect("Select counter value should succeed");
        assert_eq!(val.0, 100, "Rolled back change must not persist");

        // Cleanup test counter
        sqlx::query("DELETE FROM counters WHERE name = 'test_counter'")
            .execute(adapter.pool())
            .await
            .ok();

        adapter.close().await;
    }
}
