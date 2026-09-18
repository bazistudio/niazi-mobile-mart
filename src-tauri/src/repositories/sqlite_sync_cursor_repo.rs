use chrono::Utc;
use rusqlite::params;

use crate::db::connection::DatabaseConnection;
use crate::errors::{AppError, AppResult};

/// Repository for persistent downstream synchronization cursors in SQLite
#[derive(Clone)]
pub struct SQLiteSyncCursorRepository {
    db: DatabaseConnection,
}

impl SQLiteSyncCursorRepository {
    pub fn new(db: DatabaseConnection) -> Self {
        Self { db }
    }

    /// Fetches the last applied sequence for a stream and organization
    pub async fn get_last_applied_sequence(
        &self,
        stream_name: &str,
        organization_id: &str,
    ) -> AppResult<i64> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        let sql = "SELECT last_applied_sequence FROM sync_cursors WHERE stream_name = ?1 AND organization_id = ?2";
        let seq: Result<i64, _> = guard.query_row(sql, params![stream_name, organization_id], |r| r.get(0));
        match seq {
            Ok(s) => Ok(s),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(0),
            Err(e) => Err(AppError::Database(format!("Failed to get sync cursor: {e}"))),
        }
    }

    /// Updates the last applied sequence within an active SQLite transaction
    pub fn set_last_applied_sequence_in_tx(
        tx: &rusqlite::Transaction,
        stream_name: &str,
        organization_id: &str,
        sequence: i64,
    ) -> crate::db::errors::DbResult<()> {
        let now = Utc::now().to_rfc3339();
        let sql = "
            INSERT INTO sync_cursors (stream_name, organization_id, last_applied_sequence, updated_at)
            VALUES (?1, ?2, ?3, ?4)
            ON CONFLICT (stream_name, organization_id) DO UPDATE SET
                last_applied_sequence = EXCLUDED.last_applied_sequence,
                updated_at = EXCLUDED.updated_at
        ";
        tx.execute(sql, params![stream_name, organization_id, sequence, now])?;
        Ok(())
    }
}
