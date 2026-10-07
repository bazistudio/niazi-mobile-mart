use rusqlite::params;

use crate::db::connection::DatabaseConnection;
use crate::domain::auth_snapshot::AuthSnapshot;
use crate::domain::user::{UserRole, UserStatus};
use crate::errors::{AppError, AppResult};

/// Helper to parse role string stored in SQLite
fn parse_role(role_str: &str) -> UserRole {
    match serde_json::from_str::<UserRole>(&format!("\"{role_str}\"")) {
        Ok(r) => r,
        Err(_) => match role_str.to_uppercase().as_str() {
            "ADMIN" => UserRole::Admin,
            "SHOP_ADMIN" | "BRANCH_ADMIN" => UserRole::ShopAdmin,
            "MANAGER" => UserRole::Manager,
            "ACCOUNTANT" => UserRole::Accountant,
            "SALESMAN" => UserRole::Salesman,
            "CASHIER" => UserRole::Cashier,
            "REPAIR_MECHANIC" | "MECHANIC" => UserRole::RepairMechanic,
            "PUBLIC_USER" => UserRole::PublicUser,
            _ => UserRole::Staff,
        },
    }
}

/// Helper to parse status string stored in SQLite
fn parse_status(status_str: &str) -> UserStatus {
    match serde_json::from_str::<UserStatus>(&format!("\"{status_str}\"")) {
        Ok(s) => s,
        Err(_) => match status_str.to_uppercase().as_str() {
            "ACTIVE" => UserStatus::Active,
            "PENDING" => UserStatus::Pending,
            "REJECTED" => UserStatus::Rejected,
            _ => UserStatus::Disabled,
        },
    }
}

/// Convert status enum to string for database persistence
fn status_to_string(status: &UserStatus) -> String {
    match status {
        UserStatus::Active => "ACTIVE".to_string(),
        UserStatus::Pending => "PENDING".to_string(),
        UserStatus::Rejected => "REJECTED".to_string(),
        UserStatus::Disabled => "DISABLED".to_string(),
    }
}

/// SQLite-backed persistent repository for local authentication snapshots
#[derive(Clone)]
pub struct SQLiteAuthSnapshotRepository {
    db: DatabaseConnection,
}

impl SQLiteAuthSnapshotRepository {
    pub fn new(db: DatabaseConnection) -> Self {
        Self { db }
    }

    /// Atomically inserts a new snapshot or updates an existing snapshot identified by user_id
    pub async fn upsert(&self, snapshot: &AuthSnapshot) -> AppResult<()> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        let role_str = snapshot.role.to_string();
        let status_str = status_to_string(&snapshot.status);

        let sql = "
            INSERT INTO local_auth_snapshot (
                user_id, username, organization_id, branch_id, role, credential_hash,
                access_profile_json, credential_version, status, synced_at, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
            ON CONFLICT(user_id) DO UPDATE SET
                username = excluded.username,
                organization_id = excluded.organization_id,
                branch_id = excluded.branch_id,
                role = excluded.role,
                credential_hash = excluded.credential_hash,
                access_profile_json = excluded.access_profile_json,
                credential_version = excluded.credential_version,
                status = excluded.status,
                synced_at = excluded.synced_at,
                updated_at = excluded.updated_at
        ";

        guard
            .execute(
                sql,
                params![
                    &snapshot.user_id,
                    &snapshot.username,
                    &snapshot.organization_id,
                    &snapshot.branch_id,
                    &role_str,
                    &snapshot.credential_hash,
                    &snapshot.access_profile_json,
                    snapshot.credential_version,
                    &status_str,
                    &snapshot.synced_at,
                    &snapshot.created_at,
                    &snapshot.updated_at,
                ],
            )
            .map_err(|e| AppError::Database(format!("Failed to upsert auth snapshot: {e}")))?;

        Ok(())
    }

    /// Finds a snapshot by user ID
    pub async fn find_by_user_id(&self, user_id: &str) -> AppResult<Option<AuthSnapshot>> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        let sql = "
            SELECT user_id, username, organization_id, branch_id, role, credential_hash,
                   access_profile_json, credential_version, status, synced_at, created_at, updated_at
            FROM local_auth_snapshot
            WHERE user_id = ?1
        ";

        let result = guard
            .query_row(sql, params![user_id], |r| {
                let role_raw: String = r.get(4)?;
                let status_raw: String = r.get(8)?;
                Ok(AuthSnapshot {
                    user_id: r.get(0)?,
                    username: r.get(1)?,
                    organization_id: r.get(2)?,
                    branch_id: r.get(3)?,
                    role: parse_role(&role_raw),
                    credential_hash: r.get(5)?,
                    access_profile_json: r.get(6)?,
                    credential_version: r.get(7)?,
                    status: parse_status(&status_raw),
                    synced_at: r.get(9)?,
                    created_at: r.get(10)?,
                    updated_at: r.get(11)?,
                })
            })
            .map(Some)
            .or_else(|e| match e {
                rusqlite::Error::QueryReturnedNoRows => Ok(None),
                other => Err(AppError::Database(format!("Error querying auth snapshot by user_id: {other}"))),
            })?;

        Ok(result)
    }

    /// Finds a snapshot by username (case-insensitive lookup using COLLATE NOCASE)
    pub async fn find_by_username(&self, username: &str) -> AppResult<Option<AuthSnapshot>> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        let sql = "
            SELECT user_id, username, organization_id, branch_id, role, credential_hash,
                   access_profile_json, credential_version, status, synced_at, created_at, updated_at
            FROM local_auth_snapshot
            WHERE username = ?1 COLLATE NOCASE
        ";

        let result = guard
            .query_row(sql, params![username.trim()], |r| {
                let role_raw: String = r.get(4)?;
                let status_raw: String = r.get(8)?;
                Ok(AuthSnapshot {
                    user_id: r.get(0)?,
                    username: r.get(1)?,
                    organization_id: r.get(2)?,
                    branch_id: r.get(3)?,
                    role: parse_role(&role_raw),
                    credential_hash: r.get(5)?,
                    access_profile_json: r.get(6)?,
                    credential_version: r.get(7)?,
                    status: parse_status(&status_raw),
                    synced_at: r.get(9)?,
                    created_at: r.get(10)?,
                    updated_at: r.get(11)?,
                })
            })
            .map(Some)
            .or_else(|e| match e {
                rusqlite::Error::QueryReturnedNoRows => Ok(None),
                other => Err(AppError::Database(format!("Error querying auth snapshot by username: {other}"))),
            })?;

        Ok(result)
    }

    /// Lists all active auth snapshots
    pub async fn list_active(&self) -> AppResult<Vec<AuthSnapshot>> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        let sql = "
            SELECT user_id, username, organization_id, branch_id, role, credential_hash,
                   access_profile_json, credential_version, status, synced_at, created_at, updated_at
            FROM local_auth_snapshot
            WHERE status = 'ACTIVE'
            ORDER BY username ASC
        ";

        let mut stmt = guard
            .prepare(sql)
            .map_err(|e| AppError::Database(format!("Failed to prepare list_active query: {e}")))?;

        let rows = stmt
            .query_map([], |r| {
                let role_raw: String = r.get(4)?;
                let status_raw: String = r.get(8)?;
                Ok(AuthSnapshot {
                    user_id: r.get(0)?,
                    username: r.get(1)?,
                    organization_id: r.get(2)?,
                    branch_id: r.get(3)?,
                    role: parse_role(&role_raw),
                    credential_hash: r.get(5)?,
                    access_profile_json: r.get(6)?,
                    credential_version: r.get(7)?,
                    status: parse_status(&status_raw),
                    synced_at: r.get(9)?,
                    created_at: r.get(10)?,
                    updated_at: r.get(11)?,
                })
            })
            .map_err(|e| AppError::Database(format!("Failed to query active auth snapshots: {e}")))?;

        let mut snapshots = Vec::new();
        for row in rows {
            snapshots.push(row.map_err(|e| AppError::Database(format!("Failed to read auth snapshot row: {e}")))?);
        }

        Ok(snapshots)
    }

    /// Lists all auth snapshots regardless of status
    pub async fn list_all(&self) -> AppResult<Vec<AuthSnapshot>> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        let sql = "
            SELECT user_id, username, organization_id, branch_id, role, credential_hash,
                   access_profile_json, credential_version, status, synced_at, created_at, updated_at
            FROM local_auth_snapshot
            ORDER BY username ASC
        ";

        let mut stmt = guard
            .prepare(sql)
            .map_err(|e| AppError::Database(format!("Failed to prepare list_all query: {e}")))?;

        let rows = stmt
            .query_map([], |r| {
                let role_raw: String = r.get(4)?;
                let status_raw: String = r.get(8)?;
                Ok(AuthSnapshot {
                    user_id: r.get(0)?,
                    username: r.get(1)?,
                    organization_id: r.get(2)?,
                    branch_id: r.get(3)?,
                    role: parse_role(&role_raw),
                    credential_hash: r.get(5)?,
                    access_profile_json: r.get(6)?,
                    credential_version: r.get(7)?,
                    status: parse_status(&status_raw),
                    synced_at: r.get(9)?,
                    created_at: r.get(10)?,
                    updated_at: r.get(11)?,
                })
            })
            .map_err(|e| AppError::Database(format!("Failed to query auth snapshots: {e}")))?;

        let mut snapshots = Vec::new();
        for row in rows {
            snapshots.push(row.map_err(|e| AppError::Database(format!("Failed to read auth snapshot row: {e}")))?);
        }

        Ok(snapshots)
    }

    /// Revokes (disables) a local auth snapshot by setting status = 'DISABLED'
    pub async fn revoke(&self, user_id: &str) -> AppResult<()> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        let now = chrono::Utc::now().to_rfc3339();

        guard
            .execute(
                "UPDATE local_auth_snapshot SET status = 'DISABLED', updated_at = ?2 WHERE user_id = ?1",
                params![user_id, &now],
            )
            .map_err(|e| AppError::Database(format!("Failed to revoke auth snapshot: {e}")))?;

        Ok(())
    }

    /// Deletes a snapshot by user ID
    pub async fn delete_user(&self, user_id: &str) -> AppResult<()> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        guard
            .execute(
                "DELETE FROM local_auth_snapshot WHERE user_id = ?1",
                params![user_id],
            )
            .map_err(|e| AppError::Database(format!("Failed to delete auth snapshot: {e}")))?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_synthetic_snapshot(user_id: &str, username: &str) -> AuthSnapshot {
        AuthSnapshot {
            user_id: user_id.to_string(),
            username: username.to_string(),
            organization_id: "00000000-0000-0000-0000-000000000001".to_string(),
            branch_id: Some("00000000-0000-0000-0000-000000000002".to_string()),
            role: UserRole::Cashier,
            credential_hash: "$argon2id$v=19$m=19456,t=2,p=1$synthetic_salt$synthetic_hash".to_string(),
            access_profile_json: r#"{"allowed_pages":["pos","dashboard"],"allowed_actions":["pos:sale"]}"#.to_string(),
            credential_version: 1,
            status: UserStatus::Active,
            synced_at: "2026-01-01T00:00:00Z".to_string(),
            created_at: "2026-01-01T00:00:00Z".to_string(),
            updated_at: "2026-01-01T00:00:00Z".to_string(),
        }
    }

    #[tokio::test]
    async fn test_1_insert_and_read() {
        let db = DatabaseConnection::open_in_memory().unwrap();
        let repo = SQLiteAuthSnapshotRepository::new(db);

        let snapshot = make_synthetic_snapshot("test-usr-01", "Naveed");
        repo.upsert(&snapshot).await.unwrap();

        let found = repo.find_by_username("Naveed").await.unwrap().expect("Snapshot should exist");
        assert_eq!(found.user_id, "test-usr-01");
        assert_eq!(found.username, "Naveed");
        assert_eq!(found.role, UserRole::Cashier);
        assert_eq!(found.status, UserStatus::Active);
        assert_eq!(found.credential_version, 1);
        assert_eq!(found.branch_id, Some("00000000-0000-0000-0000-000000000002".to_string()));
    }

    #[tokio::test]
    async fn test_2_case_insensitive_username_lookup() {
        let db = DatabaseConnection::open_in_memory().unwrap();
        let repo = SQLiteAuthSnapshotRepository::new(db);

        let snapshot = make_synthetic_snapshot("test-usr-02", "Imran Khan");
        repo.upsert(&snapshot).await.unwrap();

        let lowercase = repo.find_by_username("imran khan").await.unwrap().expect("Case-insensitive lookup should succeed");
        assert_eq!(lowercase.user_id, "test-usr-02");

        let uppercase = repo.find_by_username("IMRAN KHAN").await.unwrap().expect("Case-insensitive lookup should succeed");
        assert_eq!(uppercase.user_id, "test-usr-02");
    }

    #[tokio::test]
    async fn test_3_read_by_user_id() {
        let db = DatabaseConnection::open_in_memory().unwrap();
        let repo = SQLiteAuthSnapshotRepository::new(db);

        let snapshot = make_synthetic_snapshot("test-usr-03", "Ahmad");
        repo.upsert(&snapshot).await.unwrap();

        let found = repo.find_by_user_id("test-usr-03").await.unwrap().expect("Lookup by user_id should succeed");
        assert_eq!(found.username, "Ahmad");

        let missing = repo.find_by_user_id("non-existent-id").await.unwrap();
        assert!(missing.is_none());
    }

    #[tokio::test]
    async fn test_4_upsert_replaces_existing_user() {
        let db = DatabaseConnection::open_in_memory().unwrap();
        let repo = SQLiteAuthSnapshotRepository::new(db);

        let mut v1 = make_synthetic_snapshot("test-usr-04", "Cashier1");
        repo.upsert(&v1).await.unwrap();

        // Update credential hash, version, role, status, updated_at
        v1.credential_hash = "$argon2id$v=19$m=19456,t=2,p=1$new_salt$new_hash".to_string();
        v1.credential_version = 2;
        v1.role = UserRole::Admin;
        v1.status = UserStatus::Disabled;
        v1.updated_at = "2026-01-02T00:00:00Z".to_string();

        repo.upsert(&v1).await.unwrap();

        let found = repo.find_by_user_id("test-usr-04").await.unwrap().expect("Updated snapshot should exist");
        assert_eq!(found.credential_version, 2);
        assert_eq!(found.role, UserRole::Admin);
        assert_eq!(found.status, UserStatus::Disabled);
        assert_eq!(found.credential_hash, "$argon2id$v=19$m=19456,t=2,p=1$new_salt$new_hash");

        // Ensure total count remains 1
        let list = repo.list_all().await.unwrap();
        assert_eq!(list.len(), 1);
    }

    #[tokio::test]
    async fn test_5_nullable_branch() {
        let db = DatabaseConnection::open_in_memory().unwrap();
        let repo = SQLiteAuthSnapshotRepository::new(db);

        let mut snapshot = make_synthetic_snapshot("test-usr-05", "GlobalAdmin");
        snapshot.branch_id = None;
        repo.upsert(&snapshot).await.unwrap();

        let found = repo.find_by_user_id("test-usr-05").await.unwrap().expect("Snapshot should exist");
        assert_eq!(found.branch_id, None);
    }

    #[tokio::test]
    async fn test_6_delete() {
        let db = DatabaseConnection::open_in_memory().unwrap();
        let repo = SQLiteAuthSnapshotRepository::new(db);

        let snapshot = make_synthetic_snapshot("test-usr-06", "TemporaryUser");
        repo.upsert(&snapshot).await.unwrap();

        assert!(repo.find_by_user_id("test-usr-06").await.unwrap().is_some());

        repo.delete_user("test-usr-06").await.unwrap();

        assert!(repo.find_by_user_id("test-usr-06").await.unwrap().is_none());
    }
}
