use chrono::Utc;
use rand_core::{OsRng, RngCore};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::domain::access_control::StaffAccessProfile;
use crate::domain::user::{SanitizedUser, User, UserRole, UserStatus};
use crate::errors::{AppError, AppResult};
use crate::repositories::SQLiteUserRepository;
use crate::services::hasher::{hash_credential, verify_credential};
use crate::state::AppState;

/// Generates a cryptographically secure random recovery key formatted as NZRCV-XXXX-XXXX-XXXX-XXXX
pub fn generate_recovery_key() -> String {
    const CHARSET: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Base32 unambiguous
    let mut rng = OsRng;
    let mut random_chunk = || {
        (0..4)
            .map(|_| {
                let idx = (rng.next_u32() as usize) % CHARSET.len();
                CHARSET[idx] as char
            })
            .collect::<String>()
    };
    format!(
        "NZRCV-{}-{}-{}-{}",
        random_chunk(),
        random_chunk(),
        random_chunk(),
        random_chunk()
    )
}

#[derive(Debug, Deserialize)]
pub struct BootstrapAdminPayload {
    pub name: String,
    pub username: String,
    pub password: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BootstrapAdminResponse {
    pub user: SanitizedUser,
    pub recovery_key: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateUserPayload {
    pub name: String,
    pub username: String,
    pub login_key: String,
    pub pin: Option<String>,
    pub role: UserRole,
    pub access_profile: Option<StaffAccessProfile>,
}

#[derive(Debug, Deserialize)]
pub struct RegisterStaffPayload {
    pub name: String,
    pub username: String,
    pub password: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateUserPayload {
    pub user_id: String,
    pub name: Option<String>,
    pub role: Option<UserRole>,
    pub status: Option<UserStatus>,
    pub is_active: Option<bool>,
    pub access_profile: Option<StaffAccessProfile>,
}

#[derive(Debug, Deserialize)]
pub struct ResetCredentialsPayload {
    pub user_id: String,
    pub new_login_key: Option<String>,
    pub new_pin: Option<String>,
}

pub struct AdminService;

impl AdminService {
    /// Verifies that the active caller has the Admin role
    pub async fn ensure_admin(app_state: &AppState) -> AppResult<()> {
        let session = app_state.get_session().await;
        if !session.is_authenticated {
            return Err(AppError::Unauthorized(
                "Authentication required for administrative actions".to_string(),
            ));
        }

        if session.role != Some(UserRole::Admin) {
            return Err(AppError::Forbidden(
                "Access denied: Administrative privileges required".to_string(),
            ));
        }

        Ok(())
    }

    /// Checks whether first-admin bootstrap is required (count active admins == 0)
    pub async fn check_bootstrap_status(repo: &SQLiteUserRepository) -> AppResult<bool> {
        let count = repo.count_active_admins().await?;
        Ok(count == 0)
    }

    /// Creates the very first system administrator with one-time recovery key.
    /// Strictly locked if an active administrator already exists.
    pub async fn bootstrap_first_admin(
        repo: &SQLiteUserRepository,
        payload: BootstrapAdminPayload,
    ) -> AppResult<BootstrapAdminResponse> {
        let active_admins = repo.count_active_admins().await?;
        if active_admins > 0 {
            return Err(AppError::Forbidden(
                "Bootstrap is permanently locked: An active administrator already exists."
                    .to_string(),
            ));
        }

        let clean_username = payload.username.trim().to_lowercase();
        if clean_username.is_empty() {
            return Err(AppError::Validation("Username is required".to_string()));
        }

        let clean_name = payload.name.trim();
        if clean_name.is_empty() {
            return Err(AppError::Validation("Full name is required".to_string()));
        }

        if payload.password.trim().len() < 6 {
            return Err(AppError::Validation(
                "Password must be at least 6 characters long".to_string(),
            ));
        }

        if repo.find_by_username(&clean_username).await?.is_some() {
            return Err(AppError::Conflict(format!(
                "Account with username '{clean_username}' already exists"
            )));
        }

        // Generate cryptographically secure one-time recovery key
        let plaintext_recovery_key = generate_recovery_key();
        let recovery_key_hash = hash_credential(&plaintext_recovery_key)?;
        let password_hash = hash_credential(payload.password.trim())?;

        let now = Utc::now().to_rfc3339();
        let admin_user = User {
            id: Uuid::new_v4().to_string(),
            name: clean_name.to_string(),
            username: clean_username,
            login_key_hash: password_hash,
            pin_hash: None,
            role: UserRole::Admin,
            status: UserStatus::Active,
            is_active: true,
            recovery_key_hash: Some(recovery_key_hash),
            must_change_password: false,
            access_profile: StaffAccessProfile::admin_unlimited(),
            failed_pin_attempts: 0,
            pin_locked_until_ms: None,
            failed_login_attempts: 0,
            login_locked_until_ms: None,
            created_at: now.clone(),
            updated_at: now,
        };

        let sanitized = admin_user.sanitize();
        repo.save(admin_user).await?;

        Ok(BootstrapAdminResponse {
            user: sanitized,
            recovery_key: plaintext_recovery_key,
        })
    }

    /// Emergency Administrator credential recovery using the one-time recovery key.
    /// Strictly consumes the recovery key upon successful password reset.
    pub async fn recover_admin_access(
        repo: &SQLiteUserRepository,
        app_state: &AppState,
        recovery_token: &str,
        new_password: &str,
    ) -> AppResult<()> {
        let clean_key = recovery_token.trim();
        if clean_key.is_empty() {
            return Err(AppError::Validation("Recovery key is required".to_string()));
        }

        if new_password.trim().len() < 6 {
            return Err(AppError::Validation(
                "New administrator password must be at least 6 characters".to_string(),
            ));
        }

        // Find administrator with matching recovery key hash
        let all_users = repo.list_all().await?;
        let matching_admin = all_users.into_iter().find(|u| {
            u.role == UserRole::Admin
                && u.recovery_key_hash
                    .as_deref()
                    .map(|hash| verify_credential(clean_key, hash))
                    .unwrap_or(false)
        });

        let admin = match matching_admin {
            Some(u) => u,
            None => {
                return Err(AppError::Forbidden(
                    "Invalid, expired, or already consumed recovery key. Recovery rejected."
                        .to_string(),
                ));
            }
        };

        // Atomically hash new password, update user, and invalidate recovery key
        let new_hash = hash_credential(new_password.trim())?;
        repo.consume_recovery_key_and_reset_password(&admin.id, &new_hash)
            .await?;

        // Invalidate active session
        app_state.clear_session().await;

        Ok(())
    }

    /// Registers a new staff account from public self-service signup.
    /// Resulting account is ALWAYS initialized in PENDING status.
    pub async fn register_staff(
        repo: &SQLiteUserRepository,
        payload: RegisterStaffPayload,
    ) -> AppResult<SanitizedUser> {
        let clean_username = payload.username.trim().to_lowercase();
        if clean_username.is_empty() {
            return Err(AppError::Validation("Username is required".to_string()));
        }

        let clean_name = payload.name.trim();
        if clean_name.is_empty() {
            return Err(AppError::Validation("Full name is required".to_string()));
        }

        if payload.password.trim().len() < 6 {
            return Err(AppError::Validation(
                "Password must be at least 6 characters long".to_string(),
            ));
        }

        if repo.find_by_username(&clean_username).await?.is_some() {
            return Err(AppError::Conflict(format!(
                "Staff account with username '{clean_username}' already exists"
            )));
        }

        let login_key_hash = hash_credential(payload.password.trim())?;
        let now = Utc::now().to_rfc3339();

        let new_user = User {
            id: Uuid::new_v4().to_string(),
            name: clean_name.to_string(),
            username: clean_username,
            login_key_hash,
            pin_hash: None,
            role: UserRole::Staff,
            status: UserStatus::Pending, // PENDING until approved by Administrator
            is_active: false,
            recovery_key_hash: None,
            must_change_password: false,
            access_profile: StaffAccessProfile::staff_default(),
            failed_pin_attempts: 0,
            pin_locked_until_ms: None,
            failed_login_attempts: 0,
            login_locked_until_ms: None,
            created_at: now.clone(),
            updated_at: now,
        };

        let sanitized = new_user.sanitize();
        repo.save(new_user).await?;
        Ok(sanitized)
    }

    /// Approves a pending staff member account (Admin only)
    pub async fn approve_staff(
        repo: &SQLiteUserRepository,
        app_state: &AppState,
        user_id: &str,
    ) -> AppResult<SanitizedUser> {
        Self::ensure_admin(app_state).await?;

        let mut user = match repo.find_by_id(user_id).await? {
            Some(u) => u,
            None => {
                return Err(AppError::NotFound(format!(
                    "Staff member with ID '{user_id}' not found"
                )))
            }
        };

        user.status = UserStatus::Active;
        user.is_active = true;
        user.updated_at = Utc::now().to_rfc3339();

        let sanitized = user.sanitize();
        repo.save(user).await?;
        Ok(sanitized)
    }

    /// Rejects a staff member account (Admin only)
    pub async fn reject_staff(
        repo: &SQLiteUserRepository,
        app_state: &AppState,
        user_id: &str,
    ) -> AppResult<SanitizedUser> {
        Self::ensure_admin(app_state).await?;

        let session = app_state.get_session().await;
        if session.user_id.as_deref() == Some(user_id) {
            return Err(AppError::Forbidden(
                "Administrators cannot reject their own account".to_string(),
            ));
        }

        let mut user = match repo.find_by_id(user_id).await? {
            Some(u) => u,
            None => {
                return Err(AppError::NotFound(format!(
                    "Staff member with ID '{user_id}' not found"
                )))
            }
        };

        user.status = UserStatus::Rejected;
        user.is_active = false;
        user.updated_at = Utc::now().to_rfc3339();

        let sanitized = user.sanitize();
        repo.save(user).await?;
        Ok(sanitized)
    }

    /// Administrator resets a staff member's password to a temporary password,
    /// flagging must_change_password = true.
    pub async fn reset_staff_password(
        repo: &SQLiteUserRepository,
        app_state: &AppState,
        user_id: &str,
        temporary_password: &str,
    ) -> AppResult<()> {
        Self::ensure_admin(app_state).await?;

        let session = app_state.get_session().await;
        if session.user_id.as_deref() == Some(user_id) {
            return Err(AppError::Forbidden(
                "Use the personal password change workflow to update your own administrator password".to_string(),
            ));
        }

        let clean_pwd = temporary_password.trim();
        if clean_pwd.len() < 6 {
            return Err(AppError::Validation(
                "Temporary password must be at least 6 characters long".to_string(),
            ));
        }

        let mut user = match repo.find_by_id(user_id).await? {
            Some(u) => u,
            None => {
                return Err(AppError::NotFound(format!(
                    "Staff member with ID '{user_id}' not found"
                )))
            }
        };

        user.login_key_hash = hash_credential(clean_pwd)?;
        user.must_change_password = true;
        user.failed_login_attempts = 0;
        user.login_locked_until_ms = None;
        user.updated_at = Utc::now().to_rfc3339();

        repo.save(user).await?;
        Ok(())
    }

    /// Lists all staff accounts (sanitized view)
    pub async fn list_users(
        repo: &SQLiteUserRepository,
        app_state: &AppState,
    ) -> AppResult<Vec<SanitizedUser>> {
        Self::ensure_admin(app_state).await?;
        let users = repo.list_all().await?;
        Ok(users.into_iter().map(|u| u.sanitize()).collect())
    }

    /// Creates a new staff member account (admin only)
    pub async fn create_user(
        repo: &SQLiteUserRepository,
        app_state: &AppState,
        payload: CreateUserPayload,
    ) -> AppResult<SanitizedUser> {
        Self::ensure_admin(app_state).await?;

        let clean_username = payload.username.trim().to_lowercase();
        if clean_username.is_empty() {
            return Err(AppError::Validation("Username is required".to_string()));
        }

        if payload.login_key.trim().len() < 6 {
            return Err(AppError::Validation(
                "Login key must be at least 6 characters long".to_string(),
            ));
        }

        if repo.find_by_username(&clean_username).await?.is_some() {
            return Err(AppError::Conflict(format!(
                "Staff account with username '{clean_username}' already exists"
            )));
        }

        let login_key_hash = hash_credential(&payload.login_key)?;
        let pin_hash = if let Some(pin) = payload.pin.filter(|p| !p.trim().is_empty()) {
            let clean = pin.trim();
            if clean.len() != 4 || !clean.chars().all(|c| c.is_ascii_digit()) {
                return Err(AppError::Validation(
                    "Staff PIN must be exactly 4 digits".to_string(),
                ));
            }
            Some(hash_credential(clean)?)
        } else {
            None
        };

        let profile = payload.access_profile.unwrap_or_else(|| match payload.role {
            UserRole::Admin => StaffAccessProfile::admin_unlimited(),
            UserRole::Manager => StaffAccessProfile::manager_default(),
            UserRole::Cashier => StaffAccessProfile::cashier_default(),
            UserRole::Staff => StaffAccessProfile::staff_default(),
            UserRole::PublicUser => StaffAccessProfile::public_user_restricted(),
        });

        let now = Utc::now().to_rfc3339();
        let new_user = User {
            id: Uuid::new_v4().to_string(),
            name: payload.name.trim().to_string(),
            username: clean_username,
            login_key_hash,
            pin_hash,
            role: payload.role,
            status: UserStatus::Active,
            is_active: true,
            recovery_key_hash: None,
            must_change_password: false,
            access_profile: profile,
            failed_pin_attempts: 0,
            pin_locked_until_ms: None,
            failed_login_attempts: 0,
            login_locked_until_ms: None,
            created_at: now.clone(),
            updated_at: now,
        };

        let sanitized = new_user.sanitize();
        repo.save(new_user).await?;
        Ok(sanitized)
    }

    /// Updates staff member properties and access profile
    pub async fn update_user(
        repo: &SQLiteUserRepository,
        app_state: &AppState,
        payload: UpdateUserPayload,
    ) -> AppResult<SanitizedUser> {
        Self::ensure_admin(app_state).await?;

        let mut user = match repo.find_by_id(&payload.user_id).await? {
            Some(u) => u,
            None => {
                return Err(AppError::NotFound(format!(
                    "Staff member with ID '{}' not found",
                    payload.user_id
                )))
            }
        };

        if let Some(name) = payload.name {
            user.name = name.trim().to_string();
        }

        if let Some(role) = payload.role {
            user.role = role;
        }

        if let Some(status) = payload.status {
            user.status = status;
            user.is_active = status == UserStatus::Active;
        } else if let Some(is_active) = payload.is_active {
            user.status = if is_active {
                UserStatus::Active
            } else {
                UserStatus::Disabled
            };
            user.is_active = is_active;
        }

        if let Some(profile) = payload.access_profile {
            user.access_profile = profile;
        }

        user.updated_at = Utc::now().to_rfc3339();
        let sanitized = user.sanitize();
        repo.save(user).await?;
        Ok(sanitized)
    }

    /// Resets staff login key or PIN
    pub async fn reset_credentials(
        repo: &SQLiteUserRepository,
        app_state: &AppState,
        payload: ResetCredentialsPayload,
    ) -> AppResult<()> {
        Self::ensure_admin(app_state).await?;

        let mut user = match repo.find_by_id(&payload.user_id).await? {
            Some(u) => u,
            None => {
                return Err(AppError::NotFound(format!(
                    "Staff member with ID '{}' not found",
                    payload.user_id
                )))
            }
        };

        if let Some(new_key) = payload.new_login_key {
            if new_key.trim().len() < 6 {
                return Err(AppError::Validation(
                    "New login key must be at least 6 characters long".to_string(),
                ));
            }
            user.login_key_hash = hash_credential(&new_key)?;
            user.failed_login_attempts = 0;
            user.login_locked_until_ms = None;
        }

        if let Some(new_pin) = payload.new_pin {
            let clean = new_pin.trim();
            if clean.len() != 4 || !clean.chars().all(|c| c.is_ascii_digit()) {
                return Err(AppError::Validation(
                    "New PIN must be exactly 4 digits".to_string(),
                ));
            }
            user.pin_hash = Some(hash_credential(clean)?);
            user.failed_pin_attempts = 0;
            user.pin_locked_until_ms = None;
        }

        user.updated_at = Utc::now().to_rfc3339();
        repo.save(user).await?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_first_admin_bootstrap_and_recovery_flow() {
        let state = AppState::in_memory("5.0.3");
        let repo = &state.user_repo;

        // 1. Initial state: bootstrap required
        assert!(AdminService::check_bootstrap_status(repo).await.unwrap());

        // 2. Perform bootstrap
        let res = AdminService::bootstrap_first_admin(
            repo,
            BootstrapAdminPayload {
                name: "Niazi Admin".to_string(),
                username: "admin".to_string(),
                password: "SecureAdminPassword2026!".to_string(),
            },
        )
        .await
        .expect("First admin bootstrap should succeed");

        assert_eq!(res.user.role, UserRole::Admin);
        assert!(res.recovery_key.starts_with("NZRCV-"));
        assert_eq!(res.recovery_key.len(), 25); // "NZRCV-XXXX-XXXX-XXXX-XXXX"

        // 3. Second bootstrap attempt must fail
        assert!(!AdminService::check_bootstrap_status(repo).await.unwrap());
        let second_attempt = AdminService::bootstrap_first_admin(
            repo,
            BootstrapAdminPayload {
                name: "Attacker".to_string(),
                username: "attacker".to_string(),
                password: "Password123!".to_string(),
            },
        )
        .await;
        assert!(matches!(second_attempt, Err(AppError::Forbidden(_))));

        // 4. Emergency recovery with valid key
        let recovery_res = AdminService::recover_admin_access(
            repo,
            &state,
            &res.recovery_key,
            "NewAdminPassword2026!",
        )
        .await;
        assert!(recovery_res.is_ok());

        // 5. Reusing the recovery key MUST fail
        let reuse_res = AdminService::recover_admin_access(
            repo,
            &state,
            &res.recovery_key,
            "AnotherPassword123!",
        )
        .await;
        assert!(matches!(reuse_res, Err(AppError::Forbidden(_))));
    }

    #[tokio::test]
    async fn test_staff_onboarding_and_approval_flow() {
        let state = AppState::in_memory("5.0.3");
        let repo = &state.user_repo;

        // Bootstrap admin
        AdminService::bootstrap_first_admin(
            repo,
            BootstrapAdminPayload {
                name: "Main Admin".to_string(),
                username: "main_admin".to_string(),
                password: "AdminPassword123!".to_string(),
            },
        )
        .await
        .unwrap();

        // Login as admin
        crate::services::auth_service::AuthService::login(
            repo,
            &state,
            "main_admin",
            "AdminPassword123!",
        )
        .await
        .unwrap();

        // Staff self-signup creates PENDING account
        let staff = AdminService::register_staff(
            repo,
            RegisterStaffPayload {
                name: "Counter Staff".to_string(),
                username: "counter1".to_string(),
                password: "StaffPassword123!".to_string(),
            },
        )
        .await
        .unwrap();

        assert_eq!(staff.status, UserStatus::Pending);
        assert!(!staff.is_active);

        // Staff login fails while pending
        let pending_login = crate::services::auth_service::AuthService::login(
            repo,
            &state,
            "counter1",
            "StaffPassword123!",
        )
        .await;
        assert!(pending_login.is_err());

        // Admin approves staff
        let approved = AdminService::approve_staff(repo, &state, &staff.id)
            .await
            .unwrap();
        assert_eq!(approved.status, UserStatus::Active);
        assert!(approved.is_active);

        // Approved staff can now log in
        let staff_state = AppState::in_memory("5.0.3");
        let active_login = crate::services::auth_service::AuthService::login(
            repo,
            &staff_state,
            "counter1",
            "StaffPassword123!",
        )
        .await;
        assert!(active_login.is_ok());

        // Admin resets staff password
        AdminService::reset_staff_password(repo, &state, &staff.id, "TempSecret789!")
            .await
            .unwrap();

        let staff_record = repo.find_by_id(&staff.id).await.unwrap().unwrap();
        assert!(staff_record.must_change_password);
    }
}

