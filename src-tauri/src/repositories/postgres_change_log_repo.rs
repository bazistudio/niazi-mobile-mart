use chrono::Utc;
use sqlx::{PgPool, Row};

use crate::domain::change_log::ChangeLogEntry;
use crate::errors::{AppError, AppResult};

/// Central PostgreSQL repository for appended change log and downstream delta queries
#[derive(Clone)]
pub struct PostgresChangeLogRepository {
    pool: PgPool,
}

impl PostgresChangeLogRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// Atomically appends a committed change log entry within an existing PostgreSQL transaction
    pub async fn append_change_log_tx(
        tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
        organization_id: &str,
        branch_id: &str,
        client_event_id: Option<&str>,
        event_type: &str,
        entity_type: &str,
        entity_id: &str,
        payload: &str,
    ) -> AppResult<i64> {
        let now = Utc::now().to_rfc3339();
        let row: (i64,) = sqlx::query_as(
            "INSERT INTO change_log (
                organization_id, branch_id, client_event_id, event_type, entity_type, entity_id, payload, created_at
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING sequence"
        )
        .bind(organization_id)
        .bind(branch_id)
        .bind(client_event_id)
        .bind(event_type)
        .bind(entity_type)
        .bind(entity_id)
        .bind(payload)
        .bind(&now)
        .fetch_one(&mut **tx)
        .await
        .map_err(|e| AppError::Database(format!("Failed to append to change_log: {e}")))?;

        Ok(row.0)
    }

    /// Queries bounded change log entries for downstream delta synchronization
    pub async fn get_changes(
        &self,
        organization_id: &str,
        after_sequence: i64,
        limit: i64,
    ) -> AppResult<Vec<ChangeLogEntry>> {
        let sql = "
            SELECT sequence, organization_id, branch_id, client_event_id, event_type, entity_type, entity_id, payload, created_at
            FROM change_log
            WHERE organization_id = $1 AND sequence > $2
            ORDER BY sequence ASC
            LIMIT $3
        ";

        let rows = sqlx::query(sql)
            .bind(organization_id)
            .bind(after_sequence)
            .bind(limit)
            .fetch_all(&self.pool)
            .await
            .map_err(|e| AppError::Database(format!("Failed to query change_log: {e}")))?;

        let mut list = Vec::with_capacity(rows.len());
        for r in rows {
            list.push(ChangeLogEntry {
                sequence: r.try_get(0).map_err(|e| AppError::Database(e.to_string()))?,
                organization_id: r.try_get(1).map_err(|e| AppError::Database(e.to_string()))?,
                branch_id: r.try_get(2).map_err(|e| AppError::Database(e.to_string()))?,
                client_event_id: r.try_get(3).unwrap_or(None),
                event_type: r.try_get(4).map_err(|e| AppError::Database(e.to_string()))?,
                entity_type: r.try_get(5).map_err(|e| AppError::Database(e.to_string()))?,
                entity_id: r.try_get(6).map_err(|e| AppError::Database(e.to_string()))?,
                payload: r.try_get(7).map_err(|e| AppError::Database(e.to_string()))?,
                created_at: r.try_get(8).map_err(|e| AppError::Database(e.to_string()))?,
            });
        }

        Ok(list)
    }
}
