use crate::db::connection::DatabaseConnection;
use crate::db::errors::{DbError, DbResult};

/// Executes an operation inside an atomic database transaction.
/// Automatically commits on Ok(_) and rolls back on Err(_).
pub async fn with_transaction<F, T>(db: &DatabaseConnection, f: F) -> DbResult<T>
where
    F: FnOnce(&rusqlite::Transaction<'_>) -> DbResult<T>,
{
    let conn_arc = db.inner();
    let mut guard = conn_arc.lock().await;

    let tx = guard.transaction().map_err(|e| {
        DbError::TransactionError(format!("Failed to begin database transaction: {e}"))
    })?;

    match f(&tx) {
        Ok(result) => {
            tx.commit().map_err(|e| {
                DbError::TransactionError(format!("Failed to commit database transaction: {e}"))
            })?;
            Ok(result)
        }
        Err(err) => {
            let _ = tx.rollback();
            Err(err)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations::MigrationRunner;

    #[tokio::test]
    async fn test_transaction_commit_and_rollback() {
        let db = DatabaseConnection::open_in_memory().unwrap();
        {
            let conn_arc = db.inner();
            let mut guard = conn_arc.lock().await;
            MigrationRunner::run(&mut guard).unwrap();
        }

        // Test Commit
        let commit_res = with_transaction(&db, |tx| {
            tx.execute(
                "INSERT INTO users (id, name, username, login_key_hash, role, created_at, updated_at)
                 VALUES ('11111111-1111-1111-1111-111111111111', 'Tx Test', 'txtest', 'hash', 'ADMIN', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
                [],
            )?;
            Ok("committed")
        }).await;
        assert!(commit_res.is_ok());

        // Verify committed record exists
        {
            let conn_arc = db.inner();
            let guard = conn_arc.lock().await;
            let count: i64 = guard
                .query_row("SELECT count(*) FROM users WHERE username='txtest'", [], |r| r.get(0))
                .unwrap();
            assert_eq!(count, 1);
        }

        // Test Rollback on Error
        let rollback_res: DbResult<()> = with_transaction(&db, |tx| {
            tx.execute(
                "INSERT INTO users (id, name, username, login_key_hash, role, created_at, updated_at)
                 VALUES ('22222222-2222-2222-2222-222222222222', 'Rollback Test', 'rollbackuser', 'hash', 'ADMIN', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
                [],
            )?;
            // Deliberate error to trigger rollback
            Err(DbError::QueryError("Forced rollback".to_string()))
        }).await;
        assert!(rollback_res.is_err());

        // Verify rolled back record does NOT exist
        {
            let conn_arc = db.inner();
            let guard = conn_arc.lock().await;
            let count: i64 = guard
                .query_row("SELECT count(*) FROM users WHERE username='rollbackuser'", [], |r| r.get(0))
                .unwrap();
            assert_eq!(count, 0);
        }
    }
}
