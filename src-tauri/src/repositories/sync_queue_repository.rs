use rusqlite::params;
use chrono::Utc;
use uuid::Uuid;

use crate::db::connection::DatabaseConnection;
use crate::domain::sync_queue::{EnqueueOfflineEventDto, SyncQueueItem, SyncQueueStatus};
use crate::errors::{AppError, AppResult};

/// Repository for persistent offline sync queue in SQLite
#[derive(Clone)]
pub struct SQLiteSyncQueueRepository {
    db: DatabaseConnection,
}

impl SQLiteSyncQueueRepository {
    pub fn new(db: DatabaseConnection) -> Self {
        Self { db }
    }

    /// Enqueues a new offline event into SQLite with unique client_event_id
    pub async fn enqueue(&self, dto: EnqueueOfflineEventDto) -> AppResult<SyncQueueItem> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        let id = Uuid::new_v4().to_string();
        let client_event_id = dto
            .client_event_id
            .unwrap_or_else(|| Uuid::new_v4().to_string());
        let now = Utc::now().to_rfc3339();

        let item = SyncQueueItem {
            id: id.clone(),
            client_event_id: client_event_id.clone(),
            terminal_id: dto.terminal_id,
            organization_id: dto.organization_id,
            branch_id: dto.branch_id,
            event_type: dto.event_type,
            payload: dto.payload,
            status: SyncQueueStatus::Pending,
            attempt_count: 0,
            last_error: None,
            last_attempt_at: None,
            server_event_id: None,
            created_at: now.clone(),
            updated_at: now.clone(),
        };

        let sql = "
            INSERT INTO offline_sync_queue (
                id, client_event_id, terminal_id, organization_id, branch_id,
                event_type, payload, status, attempt_count, last_error,
                last_attempt_at, server_event_id, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14);
        ";

        guard.execute(
            sql,
            params![
                &item.id,
                &item.client_event_id,
                &item.terminal_id,
                &item.organization_id,
                &item.branch_id,
                &item.event_type,
                &item.payload,
                item.status.as_str(),
                item.attempt_count,
                &item.last_error,
                &item.last_attempt_at,
                &item.server_event_id,
                &item.created_at,
                &item.updated_at,
            ],
        ).map_err(|e| {
            if let rusqlite::Error::SqliteFailure(code, _) = &e {
                if code.code == rusqlite::ErrorCode::ConstraintViolation {
                    return AppError::Conflict(format!("Duplicate client_event_id '{}'", client_event_id));
                }
            }
            AppError::Database(format!("Failed to enqueue offline event: {e}"))
        })?;

        Ok(item)
    }

    /// Enqueues a new offline event directly within an existing SQLite transaction
    pub fn enqueue_in_tx(tx: &rusqlite::Transaction, dto: EnqueueOfflineEventDto) -> crate::db::errors::DbResult<SyncQueueItem> {
        let id = Uuid::new_v4().to_string();
        let client_event_id = dto
            .client_event_id
            .unwrap_or_else(|| Uuid::new_v4().to_string());
        let now = Utc::now().to_rfc3339();

        let item = SyncQueueItem {
            id: id.clone(),
            client_event_id: client_event_id.clone(),
            terminal_id: dto.terminal_id,
            organization_id: dto.organization_id,
            branch_id: dto.branch_id,
            event_type: dto.event_type,
            payload: dto.payload,
            status: SyncQueueStatus::Pending,
            attempt_count: 0,
            last_error: None,
            last_attempt_at: None,
            server_event_id: None,
            created_at: now.clone(),
            updated_at: now.clone(),
        };

        let sql = "
            INSERT INTO offline_sync_queue (
                id, client_event_id, terminal_id, organization_id, branch_id,
                event_type, payload, status, attempt_count, last_error,
                last_attempt_at, server_event_id, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14);
        ";

        tx.execute(
            sql,
            params![
                &item.id,
                &item.client_event_id,
                &item.terminal_id,
                &item.organization_id,
                &item.branch_id,
                &item.event_type,
                &item.payload,
                item.status.as_str(),
                item.attempt_count,
                &item.last_error,
                &item.last_attempt_at,
                &item.server_event_id,
                &item.created_at,
                &item.updated_at,
            ],
        )?;

        Ok(item)
    }

    /// Finds a queue item by unique client_event_id
    pub async fn get_by_client_event_id(&self, client_event_id: &str) -> AppResult<Option<SyncQueueItem>> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        let sql = "
            SELECT id, client_event_id, terminal_id, organization_id, branch_id,
                   event_type, payload, status, attempt_count, last_error,
                   last_attempt_at, server_event_id, created_at, updated_at
            FROM offline_sync_queue
            WHERE client_event_id = ?1;
        ";

        let item_opt = guard
            .query_row(sql, params![client_event_id], Self::map_row)
            .map(Some)
            .or_else(|e| match e {
                rusqlite::Error::QueryReturnedNoRows => Ok(None),
                other => Err(AppError::Database(format!("Error querying sync queue item: {other}"))),
            })?;

        Ok(item_opt)
    }

    /// Retrieves pending events from the queue up to limit, respecting backoff delays and max retries
    pub async fn get_pending(&self, limit: usize) -> AppResult<Vec<SyncQueueItem>> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        let fetch_limit = (limit * 5).max(100);

        let sql = "
            SELECT id, client_event_id, terminal_id, organization_id, branch_id,
                   event_type, payload, status, attempt_count, last_error,
                   last_attempt_at, server_event_id, created_at, updated_at
            FROM offline_sync_queue
            WHERE status = 'PENDING' AND attempt_count < 10
            ORDER BY created_at ASC
            LIMIT ?1;
        ";

        let mut stmt = guard
            .prepare(sql)
            .map_err(|e| AppError::Database(format!("Failed to prepare get_pending query: {e}")))?;

        let rows = stmt
            .query_map(params![fetch_limit as i64], Self::map_row)
            .map_err(|e| AppError::Database(format!("Query pending sync items failed: {e}")))?;

        let now = Utc::now();
        let mut items = Vec::new();
        for r in rows {
            let item = r.map_err(|e| AppError::Database(format!("Error mapping sync queue item: {e}")))?;
            if item.is_eligible_for_retry(now) {
                items.push(item);
                if items.len() >= limit {
                    break;
                }
            }
        }

        Ok(items)
    }

    /// Updates the status and attempt details of a queued item, capping retries at MAX_RETRIES (10)
    pub async fn update_status(
        &self,
        client_event_id: &str,
        status: SyncQueueStatus,
        error: Option<&str>,
        server_event_id: Option<&str>,
    ) -> AppResult<()> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        let now = Utc::now().to_rfc3339();

        let current_attempts: i32 = guard
            .query_row(
                "SELECT attempt_count FROM offline_sync_queue WHERE client_event_id = ?1",
                params![client_event_id],
                |r| r.get(0),
            )
            .unwrap_or(0);

        let new_attempt_count = current_attempts + 1;
        let mut final_status = status;

        if final_status == SyncQueueStatus::Pending && new_attempt_count >= crate::domain::sync_queue::MAX_RETRIES {
            final_status = SyncQueueStatus::FailedPermanent;
        }

        let sql = "
            UPDATE offline_sync_queue
            SET status = ?1,
                attempt_count = ?2,
                last_error = ?3,
                last_attempt_at = ?4,
                server_event_id = COALESCE(?5, server_event_id),
                updated_at = ?6
            WHERE client_event_id = ?7;
        ";

        guard
            .execute(
                sql,
                params![
                    final_status.as_str(),
                    new_attempt_count,
                    error,
                    &now,
                    server_event_id,
                    &now,
                    client_event_id,
                ],
            )
            .map_err(|e| AppError::Database(format!("Failed to update sync queue item status: {e}")))?;

        Ok(())
    }

    /// Returns total count of eligible pending items in queue
    pub async fn count_pending(&self) -> AppResult<i64> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        let count: i64 = guard
            .query_row(
                "SELECT count(*) FROM offline_sync_queue WHERE status = 'PENDING' AND attempt_count < 10",
                [],
                |r| r.get(0),
            )
            .unwrap_or(0);

        Ok(count)
    }

    /// Returns total count of conflict items in queue
    pub async fn count_conflict(&self) -> AppResult<i64> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        let count: i64 = guard
            .query_row(
                "SELECT count(*) FROM offline_sync_queue WHERE status = 'CONFLICT'",
                [],
                |r| r.get(0),
            )
            .unwrap_or(0);

        Ok(count)
    }

    /// Returns total count of permanently failed items in queue
    pub async fn count_failed_permanent(&self) -> AppResult<i64> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        let count: i64 = guard
            .query_row(
                "SELECT count(*) FROM offline_sync_queue WHERE status = 'FAILED_PERMANENT' OR status = 'FAILED' OR (status = 'PENDING' AND attempt_count >= 10)",
                [],
                |r| r.get(0),
            )
            .unwrap_or(0);

        Ok(count)
    }

    fn map_row(r: &rusqlite::Row<'_>) -> rusqlite::Result<SyncQueueItem> {
        let status_str: String = r.get(7)?;
        Ok(SyncQueueItem {
            id: r.get(0)?,
            client_event_id: r.get(1)?,
            terminal_id: r.get(2)?,
            organization_id: r.get(3)?,
            branch_id: r.get(4)?,
            event_type: r.get(5)?,
            payload: r.get(6)?,
            status: SyncQueueStatus::from_str(&status_str),
            attempt_count: r.get(8)?,
            last_error: r.get(9)?,
            last_attempt_at: r.get(10)?,
            server_event_id: r.get(11)?,
            created_at: r.get(12)?,
            updated_at: r.get(13)?,
        })
    }
}

/// Central PostgreSQL repository for sync audit logging & idempotency checks
#[derive(Clone)]
pub struct PostgresSyncAuditRepository {
    pool: sqlx::PgPool,
}

impl PostgresSyncAuditRepository {
    pub fn new(pool: sqlx::PgPool) -> Self {
        Self { pool }
    }

    /// Checks if a client_event_id has already been processed centrally
    pub async fn find_existing_event_id(&self, client_event_id: &str) -> AppResult<Option<String>> {
        let row: Option<(String,)> = sqlx::query_as("SELECT id FROM sync_audit WHERE client_event_id = $1")
            .bind(client_event_id)
            .fetch_optional(&self.pool)
            .await
            .map_err(|e| AppError::Database(format!("Postgres sync audit query failed: {e}")))?;

        Ok(row.map(|r| r.0))
    }

    /// Checks idempotency within an active PostgreSQL transaction handle
    pub async fn find_existing_event_id_tx(
        tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
        client_event_id: &str,
    ) -> AppResult<Option<String>> {
        let row: Option<(String,)> = sqlx::query_as("SELECT id FROM sync_audit WHERE client_event_id = $1")
            .bind(client_event_id)
            .fetch_optional(&mut **tx)
            .await
            .map_err(|e| AppError::Database(format!("Postgres sync audit tx query failed: {e}")))?;

        Ok(row.map(|r| r.0))
    }

    /// Inserts a sync_audit record within an active PostgreSQL transaction
    pub async fn record_audit_tx(
        tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
        server_event_id: &str,
        client_event_id: &str,
        terminal_id: &str,
        organization_id: &str,
        branch_id: &str,
        event_type: &str,
        payload: &str,
        status: &str,
    ) -> AppResult<()> {
        sqlx::query(
            "INSERT INTO sync_audit (id, client_event_id, terminal_id, organization_id, branch_id, event_type, payload, status, processed_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
             ON CONFLICT (client_event_id) DO NOTHING;"
        )
        .bind(server_event_id)
        .bind(client_event_id)
        .bind(terminal_id)
        .bind(organization_id)
        .bind(branch_id)
        .bind(event_type)
        .bind(payload)
        .bind(status)
        .execute(&mut **tx)
        .await
        .map_err(|e| AppError::Database(format!("Failed to record sync audit in Postgres transaction: {e}")))?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::connection::DatabaseConnection;
    use crate::domain::organization::{DEFAULT_MAIN_BRANCH_ID, NIAZI_ORGANIZATION_ID};

    #[tokio::test]
    async fn test_sync_queue_persistence_and_uniqueness() {
        let db = DatabaseConnection::open_in_memory().unwrap();
        {
            let conn_arc = db.inner();
            let mut conn = conn_arc.lock().await;
            crate::db::migrations::MigrationRunner::run(&mut conn).unwrap();
        }
        let repo = SQLiteSyncQueueRepository::new(db.clone());

        let client_event_id = Uuid::new_v4().to_string();
        let terminal_id = Uuid::new_v4().to_string();

        {
            let conn_arc = db.inner();
            let conn = conn_arc.lock().await;
            conn.execute(
                "INSERT INTO terminals (id, organization_id, branch_id, device_name, is_active, created_at, updated_at)
                 VALUES (?1, ?2, ?3, 'Test Terminal', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
                rusqlite::params![terminal_id, NIAZI_ORGANIZATION_ID, DEFAULT_MAIN_BRANCH_ID],
            ).unwrap();
        }

        let dto = EnqueueOfflineEventDto {
            client_event_id: Some(client_event_id.clone()),
            terminal_id: terminal_id.clone(),
            organization_id: NIAZI_ORGANIZATION_ID.to_string(),
            branch_id: DEFAULT_MAIN_BRANCH_ID.to_string(),
            event_type: "SALE_CREATED".to_string(),
            payload: r#"{"invoice":"INV-1001","total":1500}"#.to_string(),
        };

        // 1. Enqueue event
        let item = repo.enqueue(dto.clone()).await.expect("Enqueue should succeed");
        assert_eq!(item.client_event_id, client_event_id);
        assert_eq!(item.status, SyncQueueStatus::Pending);
        assert_eq!(item.attempt_count, 0);

        // 2. Query pending queue
        let pending = repo.get_pending(10).await.unwrap();
        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0].client_event_id, client_event_id);

        // 3. Attempt to insert duplicate client_event_id -> MUST BE REJECTED
        let duplicate_res = repo.enqueue(dto).await;
        assert!(duplicate_res.is_err(), "Duplicate client_event_id must be rejected");

        // 4. Update status to SYNCING then SYNCED
        repo.update_status(&client_event_id, SyncQueueStatus::Syncing, None, None).await.unwrap();
        let item_syncing = repo.get_by_client_event_id(&client_event_id).await.unwrap().unwrap();
        assert_eq!(item_syncing.status, SyncQueueStatus::Syncing);
        assert_eq!(item_syncing.attempt_count, 1);

        repo.update_status(&client_event_id, SyncQueueStatus::Synced, None, Some("SRV-EVT-999")).await.unwrap();
        let item_synced = repo.get_by_client_event_id(&client_event_id).await.unwrap().unwrap();
        assert_eq!(item_synced.status, SyncQueueStatus::Synced);
        assert_eq!(item_synced.server_event_id, Some("SRV-EVT-999".to_string()));

        // Count pending should now be 0
        let count = repo.count_pending().await.unwrap();
        assert_eq!(count, 0);
    }

    #[tokio::test]
    async fn test_sync_queue_fairness_and_skipping_blocked_items() {
        let db = DatabaseConnection::open_in_memory().unwrap();
        {
            let conn_arc = db.inner();
            let mut conn = conn_arc.lock().await;
            crate::db::migrations::MigrationRunner::run(&mut conn).unwrap();
        }
        let repo = SQLiteSyncQueueRepository::new(db.clone());
        let terminal_id = Uuid::new_v4().to_string();

        {
            let conn_arc = db.inner();
            let conn = conn_arc.lock().await;
            conn.execute(
                "INSERT INTO terminals (id, organization_id, branch_id, device_name, is_active, created_at, updated_at)
                 VALUES (?1, ?2, ?3, 'Test Terminal', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
                rusqlite::params![terminal_id, NIAZI_ORGANIZATION_ID, DEFAULT_MAIN_BRANCH_ID],
            ).unwrap();
        }

        let id_a = Uuid::new_v4().to_string();
        let id_b = Uuid::new_v4().to_string();
        let id_c = Uuid::new_v4().to_string();

        let evt_a = repo.enqueue(EnqueueOfflineEventDto {
            client_event_id: Some(id_a.clone()),
            terminal_id: terminal_id.clone(),
            organization_id: NIAZI_ORGANIZATION_ID.to_string(),
            branch_id: DEFAULT_MAIN_BRANCH_ID.to_string(),
            event_type: "SALE_CREATED".to_string(),
            payload: r#"{"id":"A"}"#.to_string(),
        }).await.unwrap();

        let evt_b = repo.enqueue(EnqueueOfflineEventDto {
            client_event_id: Some(id_b.clone()),
            terminal_id: terminal_id.clone(),
            organization_id: NIAZI_ORGANIZATION_ID.to_string(),
            branch_id: DEFAULT_MAIN_BRANCH_ID.to_string(),
            event_type: "SALE_CREATED".to_string(),
            payload: r#"{"id":"B"}"#.to_string(),
        }).await.unwrap();

        let _evt_c = repo.enqueue(EnqueueOfflineEventDto {
            client_event_id: Some(id_c.clone()),
            terminal_id: terminal_id.clone(),
            organization_id: NIAZI_ORGANIZATION_ID.to_string(),
            branch_id: DEFAULT_MAIN_BRANCH_ID.to_string(),
            event_type: "SALE_CREATED".to_string(),
            payload: r#"{"id":"C"}"#.to_string(),
        }).await.unwrap();

        // Mark A as CONFLICT
        repo.update_status(&evt_a.client_event_id, SyncQueueStatus::Conflict, Some("409 Conflict"), None).await.unwrap();

        // Query pending items -> Must skip A and return B and C
        let pending = repo.get_pending(10).await.unwrap();
        assert_eq!(pending.len(), 2);
        assert_eq!(pending[0].client_event_id, id_b);
        assert_eq!(pending[1].client_event_id, id_c);

        // Mark B as FAILED_PERMANENT
        repo.update_status(&evt_b.client_event_id, SyncQueueStatus::FailedPermanent, Some("422 Invalid"), None).await.unwrap();

        // Query pending items -> Must return only C
        let pending_after_b_fail = repo.get_pending(10).await.unwrap();
        assert_eq!(pending_after_b_fail.len(), 1);
        assert_eq!(pending_after_b_fail[0].client_event_id, id_c);
    }

    #[tokio::test]
    async fn test_sync_queue_attempt_limit_and_failed_permanent() {
        let db = DatabaseConnection::open_in_memory().unwrap();
        {
            let conn_arc = db.inner();
            let mut conn = conn_arc.lock().await;
            crate::db::migrations::MigrationRunner::run(&mut conn).unwrap();
        }
        let repo = SQLiteSyncQueueRepository::new(db.clone());
        let terminal_id = Uuid::new_v4().to_string();

        {
            let conn_arc = db.inner();
            let conn = conn_arc.lock().await;
            conn.execute(
                "INSERT INTO terminals (id, organization_id, branch_id, device_name, is_active, created_at, updated_at)
                 VALUES (?1, ?2, ?3, 'Test Terminal', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
                rusqlite::params![terminal_id, NIAZI_ORGANIZATION_ID, DEFAULT_MAIN_BRANCH_ID],
            ).unwrap();
        }

        let evt_id = Uuid::new_v4().to_string();
        let evt = repo.enqueue(EnqueueOfflineEventDto {
            client_event_id: Some(evt_id.clone()),
            terminal_id: terminal_id.clone(),
            organization_id: NIAZI_ORGANIZATION_ID.to_string(),
            branch_id: DEFAULT_MAIN_BRANCH_ID.to_string(),
            event_type: "SALE_CREATED".to_string(),
            payload: r#"{"id":"L"}"#.to_string(),
        }).await.unwrap();

        // Update status 9 times with PENDING (simulating 9 failed attempts)
        for i in 1..=9 {
            repo.update_status(&evt.client_event_id, SyncQueueStatus::Pending, Some("500 Server Error"), None).await.unwrap();
            let item = repo.get_by_client_event_id(&evt.client_event_id).await.unwrap().unwrap();
            assert_eq!(item.attempt_count, i);
            assert_eq!(item.status, SyncQueueStatus::Pending);
        }

        // 10th attempt update -> must transition to FailedPermanent
        repo.update_status(&evt.client_event_id, SyncQueueStatus::Pending, Some("500 Server Error"), None).await.unwrap();
        let item_10 = repo.get_by_client_event_id(&evt.client_event_id).await.unwrap().unwrap();
        assert_eq!(item_10.attempt_count, 10);
        assert_eq!(item_10.status, SyncQueueStatus::FailedPermanent);

        // Pending count must now be 0
        assert_eq!(repo.count_pending().await.unwrap(), 0);
        assert_eq!(repo.count_failed_permanent().await.unwrap(), 1);
    }

    #[tokio::test]
    async fn test_sync_queue_payload_immutability() {
        let db = DatabaseConnection::open_in_memory().unwrap();
        {
            let conn_arc = db.inner();
            let mut conn = conn_arc.lock().await;
            crate::db::migrations::MigrationRunner::run(&mut conn).unwrap();
        }
        let repo = SQLiteSyncQueueRepository::new(db.clone());
        let terminal_id = Uuid::new_v4().to_string();

        {
            let conn_arc = db.inner();
            let conn = conn_arc.lock().await;
            conn.execute(
                "INSERT INTO terminals (id, organization_id, branch_id, device_name, is_active, created_at, updated_at)
                 VALUES (?1, ?2, ?3, 'Test Terminal', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
                rusqlite::params![terminal_id, NIAZI_ORGANIZATION_ID, DEFAULT_MAIN_BRANCH_ID],
            ).unwrap();
        }

        let raw_payload = r#"{"product_id":"prod_100","price":25.50,"items":["a","b"]}"#;
        let evt_id = Uuid::new_v4().to_string();
        let evt = repo.enqueue(EnqueueOfflineEventDto {
            client_event_id: Some(evt_id),
            terminal_id: terminal_id.clone(),
            organization_id: NIAZI_ORGANIZATION_ID.to_string(),
            branch_id: DEFAULT_MAIN_BRANCH_ID.to_string(),
            event_type: "PRODUCT_CREATED".to_string(),
            payload: raw_payload.to_string(),
        }).await.unwrap();

        repo.update_status(&evt.client_event_id, SyncQueueStatus::Conflict, Some("409 Conflict"), None).await.unwrap();
        let fetched = repo.get_by_client_event_id(&evt.client_event_id).await.unwrap().unwrap();
        assert_eq!(fetched.payload, raw_payload);
    }

    #[tokio::test]
    async fn test_sync_queue_persistence_across_reload() {
        let db = DatabaseConnection::open_in_memory().unwrap();
        {
            let conn_arc = db.inner();
            let mut conn = conn_arc.lock().await;
            crate::db::migrations::MigrationRunner::run(&mut conn).unwrap();
        }
        let repo1 = SQLiteSyncQueueRepository::new(db.clone());
        let terminal_id = Uuid::new_v4().to_string();

        {
            let conn_arc = db.inner();
            let conn = conn_arc.lock().await;
            conn.execute(
                "INSERT INTO terminals (id, organization_id, branch_id, device_name, is_active, created_at, updated_at)
                 VALUES (?1, ?2, ?3, 'Test Terminal', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
                rusqlite::params![terminal_id, NIAZI_ORGANIZATION_ID, DEFAULT_MAIN_BRANCH_ID],
            ).unwrap();
        }

        let evt_id = Uuid::new_v4().to_string();
        let evt = repo1.enqueue(EnqueueOfflineEventDto {
            client_event_id: Some(evt_id.clone()),
            terminal_id: terminal_id.clone(),
            organization_id: NIAZI_ORGANIZATION_ID.to_string(),
            branch_id: DEFAULT_MAIN_BRANCH_ID.to_string(),
            event_type: "EXPENSE_CREATED".to_string(),
            payload: r#"{"amount":500}"#.to_string(),
        }).await.unwrap();

        repo1.update_status(&evt.client_event_id, SyncQueueStatus::FailedPermanent, Some("403 Forbidden"), None).await.unwrap();

        // Simulate repository reload by creating a new repository handle to same DB
        let repo2 = SQLiteSyncQueueRepository::new(db.clone());
        let item = repo2.get_by_client_event_id(&evt_id).await.unwrap().unwrap();

        assert_eq!(item.status, SyncQueueStatus::FailedPermanent);
        assert_eq!(item.attempt_count, 1);
        assert_eq!(item.last_error, Some("403 Forbidden".to_string()));
    }
}

