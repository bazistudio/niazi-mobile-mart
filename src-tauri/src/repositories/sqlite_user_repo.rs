use rusqlite::params;

use crate::db::connection::DatabaseConnection;
use crate::domain::access_control::{StaffAccessProfile, StaffOperationalLimits};
use crate::domain::user::{User, UserRole};
use crate::errors::{AppError, AppResult};
use crate::services::hasher::hash_credential;

/// SQLite-backed persistent User Repository enforcing relational integrity and transactions
#[derive(Clone)]
pub struct SQLiteUserRepository {
    db: DatabaseConnection,
}

impl SQLiteUserRepository {
    /// Creates a repository backed by the given SQLite database connection
    pub fn new(db: DatabaseConnection) -> Self {
        Self { db }
    }

    /// Checks if any staff user accounts exist in the database (used for first-launch detection)
    pub async fn has_any_users(&self) -> AppResult<bool> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        let count: i64 = guard
            .query_row("SELECT count(*) FROM users", [], |r| r.get(0))
            .map_err(|e| AppError::Database(format!("Failed to count users: {e}")))?;

        Ok(count > 0)
    }

    /// Seeds initial development administrator and cashier accounts if database is completely empty
    pub async fn seed_development_defaults_if_empty(&self) -> AppResult<()> {
        if self.has_any_users().await? {
            return Ok(());
        }

        // Canonical UUID v4 identifiers
        let admin_hash = hash_credential("Admin@Niazi2025!")?;
        let admin_pin_hash = hash_credential("1234")?;

        let admin_user = User {
            id: "550e8400-e29b-41d4-a716-446655440001".to_string(),
            name: "System Administrator".to_string(),
            username: "admin".to_string(),
            login_key_hash: admin_hash,
            pin_hash: Some(admin_pin_hash),
            role: UserRole::Admin,
            is_active: true,
            access_profile: StaffAccessProfile::admin_unlimited(),
            failed_pin_attempts: 0,
            pin_locked_until_ms: None,
            failed_login_attempts: 0,
            login_locked_until_ms: None,
            created_at: "2026-01-01T00:00:00Z".to_string(),
            updated_at: "2026-01-01T00:00:00Z".to_string(),
        };

        let cashier_hash = hash_credential("Cashier@123")?;
        let cashier_pin_hash = hash_credential("1234")?;

        let cashier_user = User {
            id: "550e8400-e29b-41d4-a716-446655440002".to_string(),
            name: "Counter Cashier 1".to_string(),
            username: "cashier1".to_string(),
            login_key_hash: cashier_hash,
            pin_hash: Some(cashier_pin_hash),
            role: UserRole::Cashier,
            is_active: true,
            access_profile: StaffAccessProfile::cashier_default(),
            failed_pin_attempts: 0,
            pin_locked_until_ms: None,
            failed_login_attempts: 0,
            login_locked_until_ms: None,
            created_at: "2026-01-01T00:00:00Z".to_string(),
            updated_at: "2026-01-01T00:00:00Z".to_string(),
        };

        self.save(admin_user).await?;
        self.save(cashier_user).await?;

        Ok(())
    }

    /// Finds a user by their canonical UUID v4
    pub async fn find_by_id(&self, id: &str) -> AppResult<Option<User>> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        let sql = "
            SELECT 
                u.id, u.name, u.username, u.login_key_hash, u.pin_hash, u.role, u.is_active,
                u.failed_pin_attempts, u.pin_locked_until_ms, u.failed_login_attempts, u.login_locked_until_ms,
                u.created_at, u.updated_at,
                p.allowed_pages, p.allowed_actions, p.max_discount_percent, p.can_price_override,
                p.can_refund, p.can_void_sale, p.can_view_profit
            FROM users u
            LEFT JOIN user_access_profiles p ON u.id = p.user_id
            WHERE u.id = ?1;
        ";

        let user = guard
            .query_row(sql, params![id], Self::map_user_row)
            .map(Some)
            .or_else(|e| match e {
                rusqlite::Error::QueryReturnedNoRows => Ok(None),
                other => Err(AppError::Database(format!("Error querying user by ID: {other}"))),
            })?;

        Ok(user)
    }

    /// Finds a user by their unique case-insensitive username
    pub async fn find_by_username(&self, username: &str) -> AppResult<Option<User>> {
        let clean = username.trim();
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        let sql = "
            SELECT 
                u.id, u.name, u.username, u.login_key_hash, u.pin_hash, u.role, u.is_active,
                u.failed_pin_attempts, u.pin_locked_until_ms, u.failed_login_attempts, u.login_locked_until_ms,
                u.created_at, u.updated_at,
                p.allowed_pages, p.allowed_actions, p.max_discount_percent, p.can_price_override,
                p.can_refund, p.can_void_sale, p.can_view_profit
            FROM users u
            LEFT JOIN user_access_profiles p ON u.id = p.user_id
            WHERE u.username = ?1 COLLATE NOCASE;
        ";

        let user = guard
            .query_row(sql, params![clean], Self::map_user_row)
            .map(Some)
            .or_else(|e| match e {
                rusqlite::Error::QueryReturnedNoRows => Ok(None),
                other => Err(AppError::Database(format!("Error querying user by username: {other}"))),
            })?;

        Ok(user)
    }

    /// Persists a user and their access profile atomically in a transaction
    pub async fn save(&self, user: User) -> AppResult<()> {
        let conn_arc = self.db.inner();
        let mut guard = conn_arc.lock().await;

        let tx = guard
            .transaction()
            .map_err(|e| AppError::Database(format!("Transaction begin failed: {e}")))?;

        // 1. Upsert users table
        let role_str = user.role.to_string();
        let is_active_int = if user.is_active { 1 } else { 0 };

        tx.execute(
            "INSERT INTO users (
                id, name, username, login_key_hash, pin_hash, role, is_active,
                failed_pin_attempts, pin_locked_until_ms, failed_login_attempts, login_locked_until_ms,
                created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                username = excluded.username,
                login_key_hash = excluded.login_key_hash,
                pin_hash = excluded.pin_hash,
                role = excluded.role,
                is_active = excluded.is_active,
                failed_pin_attempts = excluded.failed_pin_attempts,
                pin_locked_until_ms = excluded.pin_locked_until_ms,
                failed_login_attempts = excluded.failed_login_attempts,
                login_locked_until_ms = excluded.login_locked_until_ms,
                updated_at = excluded.updated_at;",
            params![
                user.id,
                user.name,
                user.username,
                user.login_key_hash,
                user.pin_hash,
                role_str,
                is_active_int,
                user.failed_pin_attempts,
                user.pin_locked_until_ms.map(|v| v as i64),
                user.failed_login_attempts,
                user.login_locked_until_ms.map(|v| v as i64),
                user.created_at,
                user.updated_at,
            ],
        )
        .map_err(|e| AppError::Database(format!("Failed to save user: {e}")))?;

        // 2. Upsert user_access_profiles table
        let pages_json = serde_json::to_string(&user.access_profile.allowed_pages)
            .map_err(|e| AppError::Internal(format!("Failed to serialize allowed_pages: {e}")))?;
        let actions_json = serde_json::to_string(&user.access_profile.allowed_actions)
            .map_err(|e| AppError::Internal(format!("Failed to serialize allowed_actions: {e}")))?;

        let limits = &user.access_profile.limits;

        tx.execute(
            "INSERT INTO user_access_profiles (
                user_id, allowed_pages, allowed_actions, max_discount_percent,
                can_price_override, can_refund, can_void_sale, can_view_profit,
                created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
            ON CONFLICT(user_id) DO UPDATE SET
                allowed_pages = excluded.allowed_pages,
                allowed_actions = excluded.allowed_actions,
                max_discount_percent = excluded.max_discount_percent,
                can_price_override = excluded.can_price_override,
                can_refund = excluded.can_refund,
                can_void_sale = excluded.can_void_sale,
                can_view_profit = excluded.can_view_profit,
                updated_at = excluded.updated_at;",
            params![
                user.id,
                pages_json,
                actions_json,
                limits.max_discount_percent,
                if limits.can_price_override { 1 } else { 0 },
                if limits.can_refund { 1 } else { 0 },
                if limits.can_void_sale { 1 } else { 0 },
                if limits.can_view_profit { 1 } else { 0 },
                user.created_at,
                user.updated_at,
            ],
        )
        .map_err(|e| AppError::Database(format!("Failed to save user access profile: {e}")))?;

        tx.commit()
            .map_err(|e| AppError::Database(format!("Transaction commit failed: {e}")))?;

        Ok(())
    }

    /// Lists all staff users with their access profiles
    pub async fn list_all(&self) -> AppResult<Vec<User>> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        let sql = "
            SELECT 
                u.id, u.name, u.username, u.login_key_hash, u.pin_hash, u.role, u.is_active,
                u.failed_pin_attempts, u.pin_locked_until_ms, u.failed_login_attempts, u.login_locked_until_ms,
                u.created_at, u.updated_at,
                p.allowed_pages, p.allowed_actions, p.max_discount_percent, p.can_price_override,
                p.can_refund, p.can_void_sale, p.can_view_profit
            FROM users u
            LEFT JOIN user_access_profiles p ON u.id = p.user_id
            ORDER BY u.created_at ASC;
        ";

        let mut stmt = guard
            .prepare(sql)
            .map_err(|e| AppError::Database(format!("Prepare list users failed: {e}")))?;

        let users = stmt
            .query_map([], Self::map_user_row)
            .map_err(|e| AppError::Database(format!("Query list users failed: {e}")))?
            .filter_map(|r| r.ok())
            .collect();

        Ok(users)
    }

    /// Deletes a staff user record by UUID
    pub async fn delete(&self, id: &str) -> AppResult<()> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        let rows = guard
            .execute("DELETE FROM users WHERE id = ?1;", params![id])
            .map_err(|e| AppError::Database(format!("Delete user failed: {e}")))?;

        if rows == 0 {
            Err(AppError::NotFound(format!("User with ID '{id}' not found")))
        } else {
            Ok(())
        }
    }

    /// Helper to map a combined user + access_profile SQL row into a domain User entity
    fn map_user_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<User> {
        let role_str: String = row.get(5)?;
        let role = match role_str.as_str() {
            "ADMIN" => UserRole::Admin,
            "MANAGER" => UserRole::Manager,
            "CASHIER" => UserRole::Cashier,
            "PUBLIC_USER" => UserRole::PublicUser,
            _ => UserRole::Staff,
        };

        let is_active_int: i32 = row.get(6)?;
        let pin_locked_ms: Option<i64> = row.get(8)?;
        let login_locked_ms: Option<i64> = row.get(10)?;

        let pages_json: Option<String> = row.get(13)?;
        let actions_json: Option<String> = row.get(14)?;
        let max_discount: Option<f64> = row.get(15)?;
        let can_override: Option<i32> = row.get(16)?;
        let can_refund: Option<i32> = row.get(17)?;
        let can_void: Option<i32> = row.get(18)?;
        let can_profit: Option<i32> = row.get(19)?;

        let access_profile = if let (Some(pages), Some(actions)) = (pages_json, actions_json) {
            let allowed_pages: Vec<String> = serde_json::from_str(&pages).unwrap_or_default();
            let allowed_actions: Vec<String> = serde_json::from_str(&actions).unwrap_or_default();
            StaffAccessProfile {
                allowed_pages,
                allowed_actions,
                limits: StaffOperationalLimits {
                    max_discount_percent: max_discount.unwrap_or(5.0),
                    can_price_override: can_override.unwrap_or(0) == 1,
                    can_refund: can_refund.unwrap_or(0) == 1,
                    can_void_sale: can_void.unwrap_or(0) == 1,
                    can_view_profit: can_profit.unwrap_or(0) == 1,
                },
            }
        } else {
            match role {
                UserRole::Admin => StaffAccessProfile::admin_unlimited(),
                UserRole::Manager => StaffAccessProfile::manager_default(),
                UserRole::Cashier => StaffAccessProfile::cashier_default(),
                UserRole::Staff => StaffAccessProfile::staff_default(),
                UserRole::PublicUser => StaffAccessProfile::public_user_restricted(),
            }
        };

        Ok(User {
            id: row.get(0)?,
            name: row.get(1)?,
            username: row.get(2)?,
            login_key_hash: row.get(3)?,
            pin_hash: row.get(4)?,
            role,
            is_active: is_active_int == 1,
            access_profile,
            failed_pin_attempts: row.get(7)?,
            pin_locked_until_ms: pin_locked_ms.map(|v| v as u128),
            failed_login_attempts: row.get(9)?,
            login_locked_until_ms: login_locked_ms.map(|v| v as u128),
            created_at: row.get(11)?,
            updated_at: row.get(12)?,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations::MigrationRunner;

    #[tokio::test]
    async fn test_sqlite_user_repo_crud_and_persistence() {
        let db = DatabaseConnection::open_in_memory().unwrap();
        {
            let conn_arc = db.inner();
            let mut guard = conn_arc.lock().await;
            MigrationRunner::run(&mut guard).unwrap();
        }

        let repo = SQLiteUserRepository::new(db);
        repo.seed_development_defaults_if_empty().await.unwrap();

        // 1. Find seeded admin
        let admin = repo.find_by_username("admin").await.unwrap();
        assert!(admin.is_some());
        let admin_user = admin.unwrap();
        assert_eq!(admin_user.role, UserRole::Admin);
        assert_eq!(admin_user.id.len(), 36);

        // 2. Update user and verify persistence
        let mut cashier = repo.find_by_username("cashier1").await.unwrap().unwrap();
        cashier.failed_login_attempts = 3;
        cashier.access_profile.limits.max_discount_percent = 7.5;
        repo.save(cashier).await.unwrap();

        let updated_cashier = repo.find_by_username("cashier1").await.unwrap().unwrap();
        assert_eq!(updated_cashier.failed_login_attempts, 3);
        assert_eq!(updated_cashier.access_profile.limits.max_discount_percent, 7.5);

        // 3. List all
        let all = repo.list_all().await.unwrap();
        assert_eq!(all.len(), 2);
    }
}
