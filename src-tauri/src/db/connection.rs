use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;
use rusqlite::Connection;
use tokio::sync::Mutex;
use tracing::info;

use crate::db::errors::{DbError, DbResult};

/// Thread-safe wrapper around a SQLite connection configured with enterprise-grade durability pragmas
#[derive(Clone)]
pub struct DatabaseConnection {
    conn: Arc<Mutex<Connection>>,
    db_path: Option<PathBuf>,
}

impl DatabaseConnection {
    /// Opens or creates a file-backed SQLite database at the specified path
    pub fn open_file(path: impl AsRef<Path>) -> DbResult<Self> {
        let path_ref = path.as_ref();
        if let Some(parent) = path_ref.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| DbError::ConnectionError(format!("Failed to create database directory: {e}")))?;
        }

        let mut conn = Connection::open(path_ref)?;
        Self::apply_pragmas(&conn)?;
        crate::db::migrations::MigrationRunner::run(&mut conn)?;

        info!("SQLite database initialized at: {}", path_ref.display());

        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
            db_path: Some(path_ref.to_path_buf()),
        })
    }

    /// Opens an isolated in-memory SQLite database (for unit tests and diagnostics)
    pub fn open_in_memory() -> DbResult<Self> {
        let mut conn = Connection::open_in_memory()?;
        Self::apply_pragmas(&conn)?;
        crate::db::migrations::MigrationRunner::run(&mut conn)?;

        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
            db_path: None,
        })
    }

    /// Applies permanent SQLite configuration pragmas:
    /// - foreign_keys = ON (enforces relational integrity)
    /// - journal_mode = WAL (Write-Ahead Logging for non-blocking concurrent reads)
    /// - synchronous = NORMAL (ACID compliance in WAL mode with fast write performance)
    /// - busy_timeout = 5000ms (avoids immediate locks under concurrency)
    /// - temp_store = MEMORY (fast temporary tables/sorts)
    fn apply_pragmas(conn: &Connection) -> DbResult<()> {
        conn.busy_timeout(Duration::from_millis(5000))?;

        conn.pragma_update(None, "foreign_keys", "ON")?;
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "synchronous", "NORMAL")?;
        conn.pragma_update(None, "temp_store", "MEMORY")?;

        Ok(())
    }

    /// Returns a reference to the inner Tokio mutex for thread-safe access
    pub fn inner(&self) -> Arc<Mutex<Connection>> {
        self.conn.clone()
    }

    /// Path to the physical database file (None if in-memory)
    pub fn path(&self) -> Option<&Path> {
        self.db_path.as_deref()
    }

    /// Resolves the default persistent application database path
    pub fn default_db_path() -> PathBuf {
        if let Ok(custom_path) = std::env::var("NIAZI_DB_PATH") {
            return PathBuf::from(custom_path);
        }

        // Standard OS AppData path
        if let Some(app_data) = dirs_sys_app_data() {
            app_data.join("com.bazi.niazimobilemart").join("data").join("niazi_local.db")
        } else {
            PathBuf::from("./niazi_local.db")
        }
    }
}

/// Fallback cross-platform AppData directory resolver
fn dirs_sys_app_data() -> Option<PathBuf> {
    if let Ok(appdata) = std::env::var("APPDATA") {
        Some(PathBuf::from(appdata))
    } else if let Ok(home) = std::env::var("USERPROFILE") {
        Some(PathBuf::from(home).join("AppData").join("Roaming"))
    } else if let Ok(home) = std::env::var("HOME") {
        Some(PathBuf::from(home).join(".local").join("share"))
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_pragmas_applied() {
        let db = DatabaseConnection::open_in_memory().unwrap();
        let conn = db.inner();
        let guard = conn.lock().await;

        let fk: i64 = guard.query_row("PRAGMA foreign_keys;", [], |r| r.get(0)).unwrap();
        assert_eq!(fk, 1, "Foreign keys must be enabled");

        let busy: i64 = guard.query_row("PRAGMA busy_timeout;", [], |r| r.get(0)).unwrap();
        assert_eq!(busy, 5000, "Busy timeout must be 5000ms");
    }
}
