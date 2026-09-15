use rusqlite::params;
use sqlx::PgPool;
use std::sync::Arc;
use chrono::Utc;
use uuid::Uuid;

use crate::db::connection::DatabaseConnection;
use crate::domain::organization::{DEFAULT_MAIN_BRANCH_ID, NIAZI_ORGANIZATION_ID};
use crate::domain::terminal::Terminal;
use crate::errors::{AppError, AppResult};

/// SQLite repository for terminal identity persistence
#[derive(Clone)]
pub struct SQLiteTerminalRepository {
    db: DatabaseConnection,
}

impl SQLiteTerminalRepository {
    pub fn new(db: DatabaseConnection) -> Self {
        Self { db }
    }

    /// Finds a terminal by ID in SQLite
    pub async fn find_by_id(&self, id: &str) -> AppResult<Option<Terminal>> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        let sql = "SELECT id, organization_id, branch_id, device_name, is_active, is_offline_terminal, registered_centrally, created_at, updated_at, last_seen_at FROM terminals WHERE id = ?1";

        let term_opt = guard
            .query_row(sql, params![id], |r| {
                Ok(Terminal {
                    id: r.get(0)?,
                    organization_id: r.get(1)?,
                    branch_id: r.get(2)?,
                    device_name: r.get(3)?,
                    is_active: r.get::<_, i32>(4)? == 1,
                    is_offline_terminal: r.get::<_, i32>(5)? == 1,
                    registered_centrally: r.get::<_, i32>(6)? == 1,
                    created_at: r.get(7)?,
                    updated_at: r.get(8)?,
                    last_seen_at: r.get(9)?,
                })
            })
            .map(Some)
            .or_else(|e| match e {
                rusqlite::Error::QueryReturnedNoRows => Ok(None),
                other => Err(AppError::Database(format!("Error querying terminal: {other}"))),
            })?;

        Ok(term_opt)
    }

    /// Gets or creates the stable single terminal identity for this installation
    pub async fn get_or_create_current_terminal(&self) -> AppResult<Terminal> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        let sql = "SELECT id, organization_id, branch_id, device_name, is_active, is_offline_terminal, registered_centrally, created_at, updated_at, last_seen_at FROM terminals ORDER BY created_at ASC LIMIT 1";

        let existing: Option<Terminal> = guard
            .query_row(sql, [], |r| {
                Ok(Terminal {
                    id: r.get(0)?,
                    organization_id: r.get(1)?,
                    branch_id: r.get(2)?,
                    device_name: r.get(3)?,
                    is_active: r.get::<_, i32>(4)? == 1,
                    is_offline_terminal: r.get::<_, i32>(5)? == 1,
                    registered_centrally: r.get::<_, i32>(6)? == 1,
                    created_at: r.get(7)?,
                    updated_at: r.get(8)?,
                    last_seen_at: r.get(9)?,
                })
            })
            .map(Some)
            .or_else(|e| match e {
                rusqlite::Error::QueryReturnedNoRows => Ok(None),
                other => Err(AppError::Database(format!("Error querying current terminal: {other}"))),
            })?;

        if let Some(t) = existing {
            return Ok(t);
        }

        // Generate stable terminal UUID v4
        let new_id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();

        let device_name = hostname::get()
            .map(|h| h.to_string_lossy().to_string())
            .unwrap_or_else(|_| "Niazi Terminal".to_string());

        let new_terminal = Terminal {
            id: new_id.clone(),
            organization_id: NIAZI_ORGANIZATION_ID.to_string(),
            branch_id: Some(DEFAULT_MAIN_BRANCH_ID.to_string()),
            device_name: device_name.clone(),
            is_active: true,
            is_offline_terminal: false,
            registered_centrally: false,
            created_at: now.clone(),
            updated_at: now.clone(),
            last_seen_at: Some(now.clone()),
        };

        guard.execute(
            "INSERT INTO terminals (id, organization_id, branch_id, device_name, is_active, is_offline_terminal, registered_centrally, created_at, updated_at, last_seen_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                &new_terminal.id,
                &new_terminal.organization_id,
                &new_terminal.branch_id,
                &new_terminal.device_name,
                if new_terminal.is_active { 1 } else { 0 },
                if new_terminal.is_offline_terminal { 1 } else { 0 },
                if new_terminal.registered_centrally { 1 } else { 0 },
                &new_terminal.created_at,
                &new_terminal.updated_at,
                &new_terminal.last_seen_at,
            ],
        ).map_err(|e| AppError::Database(format!("Failed to insert terminal: {e}")))?;

        Ok(new_terminal)
    }

    /// Saves or updates a terminal
    pub async fn save(&self, terminal: &Terminal) -> AppResult<()> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        guard.execute(
            "INSERT INTO terminals (id, organization_id, branch_id, device_name, is_active, is_offline_terminal, registered_centrally, created_at, updated_at, last_seen_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
             ON CONFLICT(id) DO UPDATE SET
               branch_id = excluded.branch_id,
               device_name = excluded.device_name,
               is_active = excluded.is_active,
               is_offline_terminal = excluded.is_offline_terminal,
               registered_centrally = excluded.registered_centrally,
               updated_at = excluded.updated_at,
               last_seen_at = excluded.last_seen_at",
            params![
                &terminal.id,
                &terminal.organization_id,
                &terminal.branch_id,
                &terminal.device_name,
                if terminal.is_active { 1 } else { 0 },
                if terminal.is_offline_terminal { 1 } else { 0 },
                if terminal.registered_centrally { 1 } else { 0 },
                &terminal.created_at,
                &terminal.updated_at,
                &terminal.last_seen_at,
            ],
        ).map_err(|e| AppError::Database(format!("Failed to save terminal: {e}")))?;

        Ok(())
    }
}

/// PostgreSQL repository for central terminal registry
#[derive(Clone)]
pub struct PostgresTerminalRepository {
    pool: PgPool,
}

impl PostgresTerminalRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn find_by_id(&self, id: &str) -> AppResult<Option<Terminal>> {
        let sql = "SELECT id, organization_id, branch_id, device_name, is_active, is_offline_terminal, registered_centrally, created_at, updated_at, last_seen_at FROM terminals WHERE id = $1";

        let row_opt = sqlx::query(sql)
            .bind(id)
            .fetch_optional(&self.pool)
            .await
            .map_err(|e| AppError::Database(format!("PG query terminal by ID failed: {e}")))?;

        if let Some(r) = row_opt {
            use sqlx::Row;
            Ok(Some(Terminal {
                id: r.get("id"),
                organization_id: r.get("organization_id"),
                branch_id: r.get("branch_id"),
                device_name: r.get("device_name"),
                is_active: r.get::<i32, _>("is_active") == 1,
                is_offline_terminal: r.get::<i32, _>("is_offline_terminal") == 1,
                registered_centrally: r.get::<i32, _>("registered_centrally") == 1,
                created_at: r.get("created_at"),
                updated_at: r.get("updated_at"),
                last_seen_at: r.get("last_seen_at"),
            }))
        } else {
            Ok(None)
        }
    }

    pub async fn save(&self, terminal: &Terminal) -> AppResult<()> {
        let sql = "
            INSERT INTO terminals (id, organization_id, branch_id, device_name, is_active, is_offline_terminal, registered_centrally, created_at, updated_at, last_seen_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ON CONFLICT (id) DO UPDATE SET
                branch_id = EXCLUDED.branch_id,
                device_name = EXCLUDED.device_name,
                is_active = EXCLUDED.is_active,
                is_offline_terminal = EXCLUDED.is_offline_terminal,
                registered_centrally = EXCLUDED.registered_centrally,
                updated_at = EXCLUDED.updated_at,
                last_seen_at = EXCLUDED.last_seen_at;
        ";

        sqlx::query(sql)
            .bind(&terminal.id)
            .bind(&terminal.organization_id)
            .bind(&terminal.branch_id)
            .bind(&terminal.device_name)
            .bind(if terminal.is_active { 1 } else { 0 })
            .bind(if terminal.is_offline_terminal { 1 } else { 0 })
            .bind(if terminal.registered_centrally { 1 } else { 0 })
            .bind(&terminal.created_at)
            .bind(&terminal.updated_at)
            .bind(&terminal.last_seen_at)
            .execute(&self.pool)
            .await
            .map_err(|e| AppError::Database(format!("PG save terminal failed: {e}")))?;

        Ok(())
    }
}

/// Unified TerminalRepository Enum
#[derive(Clone)]
pub enum TerminalRepository {
    SQLite(SQLiteTerminalRepository),
    Postgres(PostgresTerminalRepository),
}

impl TerminalRepository {
    pub async fn get_or_create_current_terminal(&self) -> AppResult<Terminal> {
        match self {
            Self::SQLite(r) => r.get_or_create_current_terminal().await,
            Self::Postgres(r) => {
                let id = "00000000-0000-0000-0000-000000000099";
                if let Some(t) = r.find_by_id(id).await? {
                    Ok(t)
                } else {
                    let now = Utc::now().to_rfc3339();
                    let term = Terminal {
                        id: id.to_string(),
                        organization_id: NIAZI_ORGANIZATION_ID.to_string(),
                        branch_id: Some(DEFAULT_MAIN_BRANCH_ID.to_string()),
                        device_name: "Central Server".to_string(),
                        is_active: true,
                        is_offline_terminal: false,
                        registered_centrally: true,
                        created_at: now.clone(),
                        updated_at: now.clone(),
                        last_seen_at: Some(now),
                    };
                    r.save(&term).await?;
                    Ok(term)
                }
            }
        }
    }

    pub async fn find_by_id(&self, id: &str) -> AppResult<Option<Terminal>> {
        match self {
            Self::SQLite(r) => r.find_by_id(id).await,
            Self::Postgres(r) => r.find_by_id(id).await,
        }
    }

    pub async fn save(&self, terminal: &Terminal) -> AppResult<()> {
        match self {
            Self::SQLite(r) => r.save(terminal).await,
            Self::Postgres(r) => r.save(terminal).await,
        }
    }
}
