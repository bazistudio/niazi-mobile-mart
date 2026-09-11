use sqlx::PgPool;

use crate::domain::access_control::{StaffAccessProfile, StaffOperationalLimits};
use crate::domain::user::{User, UserRole, UserStatus};
use crate::errors::{AppError, AppResult};

/// PostgreSQL-backed User Repository using SQLx PgPool
#[derive(Clone)]
pub struct PostgresUserRepository {
    pool: PgPool,
}

impl PostgresUserRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn has_any_users(&self) -> AppResult<bool> {
        let row: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM users")
            .fetch_one(&self.pool)
            .await
            .map_err(|e| AppError::Database(format!("Failed to count users: {e}")))?;

        Ok(row.0 > 0)
    }

    pub async fn count_active_admins(&self) -> AppResult<i64> {
        let row: (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM users WHERE role = 'ADMIN' AND is_active = 1",
        )
        .fetch_one(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to count active admins: {e}")))?;

        Ok(row.0)
    }

    pub async fn find_by_id(&self, id: &str) -> AppResult<Option<User>> {
        let sql = "
            SELECT 
                u.id, u.name, u.username, u.login_key_hash, u.pin_hash, u.role, u.is_active,
                u.failed_pin_attempts, u.pin_locked_until_ms, u.failed_login_attempts, u.login_locked_until_ms,
                u.created_at, u.updated_at, u.recovery_key_hash, u.must_change_password,
                p.allowed_pages, p.allowed_actions, p.max_discount_percent, p.can_price_override,
                p.can_refund, p.can_void_sale, p.can_view_profit
            FROM users u
            LEFT JOIN user_access_profiles p ON u.id = p.user_id
            WHERE u.id = $1;
        ";

        let row_opt = sqlx::query(sql)
            .bind(id)
            .fetch_optional(&self.pool)
            .await
            .map_err(|e| AppError::Database(format!("Error querying user by ID: {e}")))?;

        match row_opt {
            Some(row) => Ok(Some(Self::map_user_row(&row)?)),
            None => Ok(None),
        }
    }

    pub async fn find_by_username(&self, username: &str) -> AppResult<Option<User>> {
        let clean = username.trim();
        let sql = "
            SELECT 
                u.id, u.name, u.username, u.login_key_hash, u.pin_hash, u.role, u.is_active,
                u.failed_pin_attempts, u.pin_locked_until_ms, u.failed_login_attempts, u.login_locked_until_ms,
                u.created_at, u.updated_at, u.recovery_key_hash, u.must_change_password,
                p.allowed_pages, p.allowed_actions, p.max_discount_percent, p.can_price_override,
                p.can_refund, p.can_void_sale, p.can_view_profit
            FROM users u
            LEFT JOIN user_access_profiles p ON u.id = p.user_id
            WHERE LOWER(u.username) = LOWER($1);
        ";

        let row_opt = sqlx::query(sql)
            .bind(clean)
            .fetch_optional(&self.pool)
            .await
            .map_err(|e| AppError::Database(format!("Error querying user by username: {e}")))?;

        match row_opt {
            Some(row) => Ok(Some(Self::map_user_row(&row)?)),
            None => Ok(None),
        }
    }

    pub async fn save(&self, user: User) -> AppResult<()> {
        let mut tx = self
            .pool
            .begin()
            .await
            .map_err(|e| AppError::Database(format!("Transaction begin failed: {e}")))?;

        let role_str = user.role.to_string();
        let is_active_int = user.status.to_i32();
        let must_change_pwd_int = if user.must_change_password { 1 } else { 0 };

        sqlx::query(
            "INSERT INTO users (
                id, name, username, login_key_hash, pin_hash, role, is_active,
                failed_pin_attempts, pin_locked_until_ms, failed_login_attempts, login_locked_until_ms,
                created_at, updated_at, recovery_key_hash, must_change_password
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            ON CONFLICT(id) DO UPDATE SET
                name = EXCLUDED.name,
                username = EXCLUDED.username,
                login_key_hash = EXCLUDED.login_key_hash,
                pin_hash = EXCLUDED.pin_hash,
                role = EXCLUDED.role,
                is_active = EXCLUDED.is_active,
                failed_pin_attempts = EXCLUDED.failed_pin_attempts,
                pin_locked_until_ms = EXCLUDED.pin_locked_until_ms,
                failed_login_attempts = EXCLUDED.failed_login_attempts,
                login_locked_until_ms = EXCLUDED.login_locked_until_ms,
                updated_at = EXCLUDED.updated_at,
                recovery_key_hash = EXCLUDED.recovery_key_hash,
                must_change_password = EXCLUDED.must_change_password;",
        )
        .bind(&user.id)
        .bind(&user.name)
        .bind(&user.username)
        .bind(&user.login_key_hash)
        .bind(&user.pin_hash)
        .bind(&role_str)
        .bind(is_active_int)
        .bind(user.failed_pin_attempts)
        .bind(user.pin_locked_until_ms.map(|v| v as i64))
        .bind(user.failed_login_attempts)
        .bind(user.login_locked_until_ms.map(|v| v as i64))
        .bind(&user.created_at)
        .bind(&user.updated_at)
        .bind(&user.recovery_key_hash)
        .bind(must_change_pwd_int)
        .execute(&mut *tx)
        .await
        .map_err(|e| AppError::Database(format!("Failed to save user: {e}")))?;

        let pages_json = serde_json::to_string(&user.access_profile.allowed_pages)
            .map_err(|e| AppError::Internal(format!("Failed to serialize allowed_pages: {e}")))?;
        let actions_json = serde_json::to_string(&user.access_profile.allowed_actions)
            .map_err(|e| AppError::Internal(format!("Failed to serialize allowed_actions: {e}")))?;

        let limits = &user.access_profile.limits;

        sqlx::query(
            "INSERT INTO user_access_profiles (
                user_id, allowed_pages, allowed_actions, max_discount_percent,
                can_price_override, can_refund, can_void_sale, can_view_profit,
                created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ON CONFLICT(user_id) DO UPDATE SET
                allowed_pages = EXCLUDED.allowed_pages,
                allowed_actions = EXCLUDED.allowed_actions,
                max_discount_percent = EXCLUDED.max_discount_percent,
                can_price_override = EXCLUDED.can_price_override,
                can_refund = EXCLUDED.can_refund,
                can_void_sale = EXCLUDED.can_void_sale,
                can_view_profit = EXCLUDED.can_view_profit,
                updated_at = EXCLUDED.updated_at;",
        )
        .bind(&user.id)
        .bind(&pages_json)
        .bind(&actions_json)
        .bind(limits.max_discount_percent)
        .bind(if limits.can_price_override { 1 } else { 0 })
        .bind(if limits.can_refund { 1 } else { 0 })
        .bind(if limits.can_void_sale { 1 } else { 0 })
        .bind(if limits.can_view_profit { 1 } else { 0 })
        .bind(&user.created_at)
        .bind(&user.updated_at)
        .execute(&mut *tx)
        .await
        .map_err(|e| AppError::Database(format!("Failed to save user access profile: {e}")))?;

        tx.commit()
            .await
            .map_err(|e| AppError::Database(format!("Transaction commit failed: {e}")))?;

        Ok(())
    }

    pub async fn consume_recovery_key_and_reset_password(
        &self,
        user_id: &str,
        new_login_key_hash: &str,
    ) -> AppResult<()> {
        let now = chrono::Utc::now().to_rfc3339();
        let res = sqlx::query(
            "UPDATE users SET 
                login_key_hash = $1,
                recovery_key_hash = NULL,
                failed_login_attempts = 0,
                login_locked_until_ms = NULL,
                must_change_password = 0,
                is_active = 1,
                updated_at = $2
            WHERE id = $3 AND recovery_key_hash IS NOT NULL",
        )
        .bind(new_login_key_hash)
        .bind(&now)
        .bind(user_id)
        .execute(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to consume recovery key: {e}")))?;

        if res.rows_affected() == 0 {
            return Err(AppError::Forbidden(
                "Recovery key has already been consumed or administrator account is invalid."
                    .to_string(),
            ));
        }

        Ok(())
    }

    pub async fn list_all(&self) -> AppResult<Vec<User>> {
        let sql = "
            SELECT 
                u.id, u.name, u.username, u.login_key_hash, u.pin_hash, u.role, u.is_active,
                u.failed_pin_attempts, u.pin_locked_until_ms, u.failed_login_attempts, u.login_locked_until_ms,
                u.created_at, u.updated_at, u.recovery_key_hash, u.must_change_password,
                p.allowed_pages, p.allowed_actions, p.max_discount_percent, p.can_price_override,
                p.can_refund, p.can_void_sale, p.can_view_profit
            FROM users u
            LEFT JOIN user_access_profiles p ON u.id = p.user_id
            ORDER BY u.created_at ASC;
        ";

        let rows = sqlx::query(sql)
            .fetch_all(&self.pool)
            .await
            .map_err(|e| AppError::Database(format!("Query list users failed: {e}")))?;

        let mut users = Vec::with_capacity(rows.len());
        for row in rows {
            users.push(Self::map_user_row(&row)?);
        }

        Ok(users)
    }

    pub async fn delete(&self, id: &str) -> AppResult<()> {
        let res = sqlx::query("DELETE FROM users WHERE id = $1")
            .bind(id)
            .execute(&self.pool)
            .await
            .map_err(|e| AppError::Database(format!("Delete user failed: {e}")))?;

        if res.rows_affected() == 0 {
            Err(AppError::NotFound(format!("User with ID '{id}' not found")))
        } else {
            Ok(())
        }
    }

    fn map_user_row(row: &sqlx::postgres::PgRow) -> AppResult<User> {
        use sqlx::Row;

        let role_str: String = row.try_get(5).map_err(|e| AppError::Database(e.to_string()))?;
        let role = match role_str.to_uppercase().as_str() {
            "ADMIN" | "OWNER" | "SUPER_ADMIN" | "MULTI_ADMIN" => UserRole::Admin,
            "SHOP_ADMIN" | "BRANCH_ADMIN" => UserRole::ShopAdmin,
            "MANAGER" => UserRole::Manager,
            "ACCOUNTANT" => UserRole::Accountant,
            "SALESMAN" => UserRole::Salesman,
            "CASHIER" => UserRole::Cashier,
            "REPAIR_MECHANIC" | "MECHANIC" => UserRole::RepairMechanic,
            "PUBLIC_USER" => UserRole::PublicUser,
            _ => UserRole::Staff,
        };

        let is_active_int: i32 = row.try_get(6).map_err(|e| AppError::Database(e.to_string()))?;
        let status = UserStatus::from_i32(is_active_int);
        let pin_locked_ms: Option<i64> = row.try_get(8).unwrap_or(None);
        let login_locked_ms: Option<i64> = row.try_get(10).unwrap_or(None);
        let recovery_key_hash: Option<String> = row.try_get(13).unwrap_or(None);
        let must_change_pwd_int: i32 = row.try_get(14).unwrap_or(0);
        let must_change_password = must_change_pwd_int == 1;

        let pages_json: Option<String> = row.try_get(15).unwrap_or(None);
        let actions_json: Option<String> = row.try_get(16).unwrap_or(None);
        let max_discount: Option<f64> = row.try_get(17).unwrap_or(None);
        let can_override: Option<i32> = row.try_get(18).unwrap_or(None);
        let can_refund: Option<i32> = row.try_get(19).unwrap_or(None);
        let can_void: Option<i32> = row.try_get(20).unwrap_or(None);
        let can_profit: Option<i32> = row.try_get(21).unwrap_or(None);

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
                UserRole::ShopAdmin => StaffAccessProfile::shop_admin_default(),
                UserRole::Manager => StaffAccessProfile::manager_default(),
                UserRole::Accountant => StaffAccessProfile::accountant_default(),
                UserRole::Salesman => StaffAccessProfile::salesman_default(),
                UserRole::Cashier => StaffAccessProfile::cashier_default(),
                UserRole::RepairMechanic => StaffAccessProfile::repair_mechanic_default(),
                UserRole::Staff => StaffAccessProfile::staff_default(),
                UserRole::PublicUser => StaffAccessProfile::public_user_restricted(),
            }
        };

        Ok(User {
            id: row.try_get(0).map_err(|e| AppError::Database(e.to_string()))?,
            name: row.try_get(1).map_err(|e| AppError::Database(e.to_string()))?,
            username: row.try_get(2).map_err(|e| AppError::Database(e.to_string()))?,
            login_key_hash: row.try_get(3).map_err(|e| AppError::Database(e.to_string()))?,
            pin_hash: row.try_get(4).unwrap_or(None),
            role,
            status,
            is_active: status == UserStatus::Active,
            recovery_key_hash,
            must_change_password,
            access_profile,
            failed_pin_attempts: row.try_get(7).unwrap_or(0),
            pin_locked_until_ms: pin_locked_ms.map(|v| v as u128),
            failed_login_attempts: row.try_get(9).unwrap_or(0),
            login_locked_until_ms: login_locked_ms.map(|v| v as u128),
            created_at: row.try_get(11).map_err(|e| AppError::Database(e.to_string()))?,
            updated_at: row.try_get(12).map_err(|e| AppError::Database(e.to_string()))?,
        })
    }
}
