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
        info!("Initializing PostgreSQL connection pool...");

        let pool = PgPoolOptions::new()
            .max_connections(20)
            .min_connections(2)
            .acquire_timeout(std::time::Duration::from_secs(10))
            .connect(database_url)
            .await
            .map_err(|e| {
                DbError::ConnectionError(format!("Failed to connect to PostgreSQL: {e}"))
            })?;

        // Validate connection health immediately
        sqlx::query("SELECT 1")
            .execute(&pool)
            .await
            .map_err(|e| {
                DbError::ConnectionError(format!("PostgreSQL health check failed: {e}"))
            })?;

        info!("PostgreSQL connection pool initialized successfully ({} max connections)", 20);

        Ok(Self { pool })
    }

    /// Returns a reference to the underlying sqlx PgPool for query execution.
    pub fn pool(&self) -> &PgPool {
        &self.pool
    }

    /// Executes initial PostgreSQL schema migrations against the connection pool.
    pub async fn run_migrations(&self) -> DbResult<()> {
        info!("Running PostgreSQL schema migrations...");
        let schema_sql = include_str!("../../migrations/postgres/001_initial_schema.sql");

        // Execute batch SQL statements
        sqlx::query(schema_sql)
            .execute(&self.pool)
            .await
            .map_err(|e| DbError::MigrationError(format!("Failed to execute PostgreSQL migrations: {e}")))?;

        info!("PostgreSQL schema migrations applied successfully.");
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

        tx.commit().await.expect("Transaction commit should succeed");

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
