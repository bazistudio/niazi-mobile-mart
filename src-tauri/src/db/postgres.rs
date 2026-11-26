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
        sqlx::query("SELECT 1")
            .execute(&pool)
            .await
            .map_err(|e| {
                DbError::ConnectionError(format!("PostgreSQL health check failed: {e}"))
            })?;

        info!("PostgreSQL connection pool initialized successfully ({max_connections} max connections)");

        Ok(Self { pool })
    }

    /// Returns a reference to the underlying sqlx PgPool for query execution.
    pub fn pool(&self) -> &PgPool {
        &self.pool
    }

    /// DEPRECATED & RETIRED: PostgreSQL migrations are authoritatively owned and executed
    /// by `backend/src/migrate.ts` upon server startup (`backend/src/server.ts`).
    ///
    /// This method is disabled to prevent accidental partial schema initialization or
    /// out-of-band migration execution from the desktop application shell.
    ///
    /// # Errors
    /// Returns `DbError::MigrationError` immediately directing operators to the authoritative runner.
    pub async fn run_migrations(&self) -> DbResult<()> {
        let msg = "PostgreSQL migrations are disabled in the Rust desktop adapter. Apply central PostgreSQL migrations through backend/src/migrate.ts.";
        tracing::error!("{msg}");
        Err(DbError::MigrationError(msg.to_string()))
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
        assert_eq!(parse_pool_max_connections(Some("50")), MAX_PG_POOL_MAX_CONNECTIONS);
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

    /// Live integration test — only runs when DATABASE_URL is set to an isolated test PostgreSQL instance.
    /// Run with: DATABASE_URL=postgres://... cargo test postgres -- --nocapture
    ///
    /// SAFETY: Strictly validates the connection URL via `reqwest::Url::parse`:
    /// - Scheme must be `postgres` or `postgresql`.
    /// - Host must be exactly loopback (`127.0.0.1`, `localhost`, or `[::1]`).
    /// - Database name must be an authorized test database (`niazi_mobile_mart_test`, `niazi_local_test`, or end with `_test`).
    /// - Explicitly rejects production database `niazi_mobile_mart`, remote hosts, and malformed targets.
    #[tokio::test]
    async fn test_postgres_live_connection_if_env_set() {
        let raw_url = match std::env::var("DATABASE_URL") {
            Ok(u) if u.starts_with("postgres") => u,
            _ => return, // Skip if not set or not PostgreSQL
        };

        // 1. Strict URL Parsing using existing reqwest::Url (backed by url crate)
        let parsed = reqwest::Url::parse(&raw_url)
            .expect("SECURITY ABORT: DATABASE_URL is malformed and cannot be parsed as a valid URL.");

        // 2. Strict Scheme Validation
        let scheme = parsed.scheme().to_lowercase();
        assert!(
            scheme == "postgres" || scheme == "postgresql",
            "SECURITY ABORT: Scheme must be 'postgres' or 'postgresql', got: '{scheme}'"
        );

        // 3. Strict Hostname Validation (Exact loopback only — rejects evil-localhost, subdomains, remote IPs)
        let host_str = parsed.host_str().unwrap_or("").to_lowercase();
        assert!(
            host_str == "127.0.0.1" || host_str == "localhost" || host_str == "::1" || host_str == "[::1]",
            "SECURITY ABORT: Integration test must only target loopback host (127.0.0.1 / localhost / [::1]), got: '{host_str}'"
        );

        // 4. Strict Database Name Validation (Extracted from path segment, isolated from credentials/params)
        let db_path = parsed.path().trim_start_matches('/');
        let db_name = db_path.split('?').next().unwrap_or("").trim().to_lowercase();

        assert!(
            !db_name.is_empty(),
            "SECURITY ABORT: Database name cannot be empty."
        );
        assert!(
            db_name != "niazi_mobile_mart" && db_name != "niazi_mobile_mart_local" && db_name != "postgres",
            "SECURITY ABORT: Direct execution against production/default database '{db_name}' is forbidden."
        );
        assert!(
            db_name == "niazi_mobile_mart_test" || db_name == "niazi_local_test" || db_name.ends_with("_test"),
            "SECURITY ABORT: Database '{db_name}' is not an authorized test database (must end with '_test' or match test suite convention)."
        );

        let adapter = PostgresAdapter::from_url(&raw_url)
            .await
            .expect("PostgreSQL pool should initialize");

        // Verify that the deprecated run_migrations fails closed and instructs caller
        let migration_res = adapter.run_migrations().await;
        assert!(
            migration_res.is_err(),
            "run_migrations in Rust adapter must fail-closed directing to backend/src/migrate.ts"
        );

        // Basic connectivity check
        let row: (i64,) = sqlx::query_as("SELECT 1")
            .fetch_one(adapter.pool())
            .await
            .expect("SELECT 1 should succeed");

        assert_eq!(row.0, 1, "SELECT 1 must return 1");

        // Check if schema is already initialized by checking for core table 'organizations'
        let schema_ready: Option<(String,)> = sqlx::query_as(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'organizations'"
        )
        .fetch_optional(adapter.pool())
        .await
        .expect("Information schema query should succeed");

        if schema_ready.is_none() {
            tracing::warn!("Skipping transactional tests: central schema not initialized. Run `npm run migrate` in backend/ first.");
            adapter.close().await;
            return;
        }

        // Test-Data Isolation: Run write & rollback tests entirely inside transactions so no test artifacts persist
        let mut tx = adapter
            .pool()
            .begin()
            .await
            .expect("Should be able to begin transaction");

        sqlx::query("INSERT INTO counters (name, value) VALUES ('test_counter_rollback', 100) ON CONFLICT (name) DO UPDATE SET value = 100")
            .execute(&mut *tx)
            .await
            .expect("Query inside transaction should work");

        // Roll back the transaction so zero test records remain in the counters table
        tx.rollback()
            .await
            .expect("Transaction rollback should succeed");

        // Verify value was NOT persisted
        let val: Option<(i64,)> = sqlx::query_as("SELECT value FROM counters WHERE name = 'test_counter_rollback'")
            .fetch_optional(adapter.pool())
            .await
            .expect("Select counter value query should succeed");
        assert!(val.is_none(), "Rolled back change must not persist in counters table");

        adapter.close().await;
    }
}
