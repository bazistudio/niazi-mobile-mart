use std::time::{SystemTime, UNIX_EPOCH};

use crate::domain::user::{SanitizedUser, UserStatus};
use crate::errors::{AppError, AppResult};
use crate::repositories::SQLiteUserRepository;
use crate::services::hasher::verify_credential;
use crate::state::{AppState, SessionContext};

fn current_time_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}

pub struct AuthService;

impl AuthService {
    /// Authenticates a staff member using username and login key
    pub async fn login(
        repo: &SQLiteUserRepository,
        app_state: &AppState,
        username: &str,
        login_key: &str,
    ) -> AppResult<SanitizedUser> {
        let clean_username = username.trim();
        if clean_username.is_empty() || login_key.is_empty() {
            return Err(AppError::Validation(
                "Username and login key are required".to_string(),
            ));
        }

        let mut user = match repo.find_by_username(clean_username).await? {
            Some(u) => u,
            None => {
                return Err(AppError::Unauthorized(
                    "Invalid credentials. Please verify your username and login key.".to_string(),
                ))
            }
        };

        // Validate account status
        match user.status {
            UserStatus::Active => {}
            UserStatus::Pending => {
                return Err(AppError::Forbidden(
                    "ACCOUNT_PENDING: Your registration is pending administrator approval.".to_string(),
                ));
            }
            UserStatus::Rejected => {
                return Err(AppError::Forbidden(
                    "ACCOUNT_REJECTED: Your account registration was rejected by administration.".to_string(),
                ));
            }
            UserStatus::Disabled => {
                return Err(AppError::Forbidden(
                    "ACCOUNT_DISABLED: This account is disabled. Please contact your administrator.".to_string(),
                ));
            }
        }

        let now = current_time_ms();

        // Check login lockout
        if let Some(locked_until) = user.login_locked_until_ms {
            if now < locked_until {
                let remaining_secs = (locked_until - now) / 1000;
                return Err(AppError::Locked(format!(
                    "Account temporarily locked due to excessive failed attempts. Try again in {} seconds.",
                    remaining_secs
                )));
            } else {
                user.login_locked_until_ms = None;
                user.failed_login_attempts = 0;
            }
        }

        // Verify Argon2id hash
        if !verify_credential(login_key, &user.login_key_hash) {
            user.failed_login_attempts += 1;
            if user.failed_login_attempts >= 5 {
                // 15 minute temporary lockout
                user.login_locked_until_ms = Some(now + (15 * 60 * 1000));
            }
            repo.save(user).await?;
            return Err(AppError::Unauthorized(
                "Invalid credentials. Please verify your username and login key.".to_string(),
            ));
        }

        // Login succeeded: reset counters
        user.failed_login_attempts = 0;
        user.login_locked_until_ms = None;
        repo.save(user.clone()).await?;

        // Establish active native session in AppState
        app_state.set_authenticated(&user).await;

        Ok(user.sanitize())
    }

    /// Changes password for the currently authenticated user
    pub async fn change_password(
        repo: &SQLiteUserRepository,
        app_state: &AppState,
        current_password: &str,
        new_password: &str,
    ) -> AppResult<()> {
        let session = app_state.get_session().await;
        if !session.is_authenticated {
            return Err(AppError::Unauthorized(
                "Authentication required to change password".to_string(),
            ));
        }

        let user_id = session
            .user_id
            .as_deref()
            .ok_or_else(|| AppError::Unauthorized("No user ID in active session".to_string()))?;

        let mut user = repo
            .find_by_id(user_id)
            .await?
            .ok_or_else(|| AppError::NotFound("User record not found".to_string()))?;

        if !verify_credential(current_password, &user.login_key_hash) {
            return Err(AppError::Unauthorized(
                "Current password is incorrect".to_string(),
            ));
        }

        if new_password.trim().len() < 6 {
            return Err(AppError::Validation(
                "New password must be at least 6 characters long".to_string(),
            ));
        }

        user.login_key_hash = crate::services::hasher::hash_credential(new_password.trim())?;
        user.must_change_password = false;
        user.failed_login_attempts = 0;
        user.login_locked_until_ms = None;
        user.updated_at = chrono::Utc::now().to_rfc3339();

        repo.save(user).await?;
        Ok(())
    }

    /// Forced password change when must_change_password is true
    pub async fn forced_change_password(
        repo: &SQLiteUserRepository,
        app_state: &AppState,
        new_password: &str,
    ) -> AppResult<()> {
        let session = app_state.get_session().await;
        if !session.is_authenticated {
            return Err(AppError::Unauthorized(
                "Authentication required to change password".to_string(),
            ));
        }

        let user_id = session
            .user_id
            .as_deref()
            .ok_or_else(|| AppError::Unauthorized("No user ID in active session".to_string()))?;

        let mut user = repo
            .find_by_id(user_id)
            .await?
            .ok_or_else(|| AppError::NotFound("User record not found".to_string()))?;

        if new_password.trim().len() < 6 {
            return Err(AppError::Validation(
                "New password must be at least 6 characters long".to_string(),
            ));
        }

        user.login_key_hash = crate::services::hasher::hash_credential(new_password.trim())?;
        user.must_change_password = false;
        user.failed_login_attempts = 0;
        user.login_locked_until_ms = None;
        user.updated_at = chrono::Utc::now().to_rfc3339();

        repo.save(user).await?;
        Ok(())
    }

    /// Unlocks a locked terminal using the active staff member's 4-digit PIN
    pub async fn unlock(
        repo: &SQLiteUserRepository,
        app_state: &AppState,
        pin: &str,
    ) -> AppResult<SessionContext> {
        let clean_pin = pin.trim();
        if clean_pin.is_empty() {
            return Err(AppError::Validation("PIN cannot be empty".to_string()));
        }

        let session = app_state.get_session().await;
        if !session.is_authenticated {
            return Err(AppError::Unauthorized(
                "No active authenticated session found".to_string(),
            ));
        }

        if !session.is_locked {
            return Ok(session);
        }

        let user_id = session.user_id.as_deref().unwrap_or_default();
        let mut user = match repo.find_by_id(user_id).await? {
            Some(u) => u,
            None => {
                return Err(AppError::NotFound(
                    "Active session user record not found".to_string(),
                ))
            }
        };

        let now = current_time_ms();

        // Check PIN lockout
        if let Some(locked_until) = user.pin_locked_until_ms {
            if now < locked_until {
                let remaining_secs = (locked_until - now) / 1000;
                return Err(AppError::Locked(format!(
                    "Terminal unlock is locked due to repeated incorrect attempts. Please wait {} seconds.",
                    remaining_secs
                )));
            } else {
                user.pin_locked_until_ms = None;
                user.failed_pin_attempts = 0;
            }
        }

        let pin_hash = match &user.pin_hash {
            Some(h) => h.clone(),
            None => {
                return Err(AppError::Validation(
                    "No PIN is configured for this account. Contact your administrator.".to_string(),
                ))
            }
        };

        if !verify_credential(clean_pin, &pin_hash) {
            user.failed_pin_attempts += 1;
            if user.failed_pin_attempts >= 5 {
                // 5 minute temporary lockout
                user.pin_locked_until_ms = Some(now + (5 * 60 * 1000));
            }
            repo.save(user).await?;
            return Err(AppError::Unauthorized(
                "Incorrect PIN. Please try again.".to_string(),
            ));
        }

        // Unlock succeeded
        user.failed_pin_attempts = 0;
        user.pin_locked_until_ms = None;
        repo.save(user).await?;

        app_state.unlock_session().await;
        Ok(app_state.get_session().await)
    }

    /// Locks the active terminal session
    pub async fn lock(app_state: &AppState) -> AppResult<SessionContext> {
        let session = app_state.get_session().await;
        if !session.is_authenticated {
            return Err(AppError::Unauthorized(
                "Cannot lock unauthenticated session".to_string(),
            ));
        }

        app_state.lock_session().await;
        Ok(app_state.get_session().await)
    }

    /// Logs out and destroys the active session
    pub async fn logout(app_state: &AppState) -> AppResult<()> {
        app_state.clear_session().await;
        Ok(())
    }

    /// Validates page or action permissions for the active session
    pub async fn require_permission(
        app_state: &AppState,
        page: Option<&str>,
        action: Option<&str>,
    ) -> AppResult<()> {
        let session = app_state.get_session().await;
        if !session.is_authenticated {
            return Err(AppError::Unauthorized(
                "Authentication required to perform this action".to_string(),
            ));
        }

        if session.is_locked {
            return Err(AppError::Locked(
                "Terminal is locked. Please enter your PIN to resume.".to_string(),
            ));
        }

        let profile = match &session.access_profile {
            Some(p) => p,
            None => {
                return Err(AppError::Forbidden(
                    "No access profile assigned to active session".to_string(),
                ))
            }
        };

        if let Some(p) = page {
            if !profile.has_page_access(p) {
                return Err(AppError::Forbidden(format!(
                    "Access denied: You do not have permission to access page '{p}'"
                )));
            }
        }

        if let Some(a) = action {
            if !profile.has_action_access(a) {
                return Err(AppError::Forbidden(format!(
                    "Access denied: You do not have permission to execute action '{a}'"
                )));
            }
        }

        Ok(())
    }

    /// Validates operational discount threshold
    pub async fn check_discount_limit(
        app_state: &AppState,
        requested_discount: f64,
    ) -> AppResult<()> {
        let session = app_state.get_session().await;
        if !session.is_authenticated || session.is_locked {
            return Err(AppError::Unauthorized(
                "Active session required for discount validation".to_string(),
            ));
        }

        let profile = match &session.access_profile {
            Some(p) => p,
            None => {
                return Err(AppError::Forbidden(
                    "No access profile assigned to active session".to_string(),
                ))
            }
        };

        if !profile.check_discount_limit(requested_discount) {
            return Err(AppError::Forbidden(format!(
                "Requested discount of {:.1}% exceeds your authorized limit of {:.1}%",
                requested_discount, profile.limits.max_discount_percent
            )));
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::access_control::StaffAccessProfile;
    use crate::domain::user::{User, UserRole};
    use crate::services::hasher::hash_credential;

    async fn create_test_user(
        repo: &SQLiteUserRepository,
        username: &str,
        password: &str,
        pin: Option<&str>,
        role: UserRole,
        status: UserStatus,
    ) -> User {
        let user = User {
            id: uuid::Uuid::new_v4().to_string(),
            name: format!("Test {}", username),
            username: username.to_string(),
            login_key_hash: hash_credential(password).unwrap(),
            pin_hash: pin.map(|p| hash_credential(p).unwrap()),
            role,
            status,
            is_active: status == UserStatus::Active,
            recovery_key_hash: None,
            must_change_password: false,
            access_profile: match role {
                UserRole::Admin => StaffAccessProfile::admin_unlimited(),
                UserRole::Cashier => StaffAccessProfile::cashier_default(),
                _ => StaffAccessProfile::staff_default(),
            },
            failed_pin_attempts: 0,
            pin_locked_until_ms: None,
            failed_login_attempts: 0,
            login_locked_until_ms: None,
            created_at: "2026-01-01T00:00:00Z".to_string(),
            updated_at: "2026-01-01T00:00:00Z".to_string(),
        };
        repo.save(user.clone()).await.unwrap();
        user
    }

    #[tokio::test]
    async fn test_full_login_and_session_flow() {
        let state = AppState::in_memory("5.0.3");
        let repo = &state.user_repo;

        create_test_user(
            repo,
            "admin_test",
            "ValidPassword123!",
            Some("1234"),
            UserRole::Admin,
            UserStatus::Active,
        )
        .await;

        // 1. Invalid login fails
        let invalid = AuthService::login(repo, &state, "admin_test", "WrongPassword!").await;
        assert!(invalid.is_err());

        // 2. Valid login succeeds
        let valid = AuthService::login(repo, &state, "admin_test", "ValidPassword123!")
            .await
            .expect("Login should succeed");
        assert_eq!(valid.username, "admin_test");

        let session = state.get_session().await;
        assert!(session.is_authenticated);
        assert!(!session.is_locked);

        // 3. Permission checks
        assert!(AuthService::require_permission(&state, Some("dashboard"), None).await.is_ok());
        assert!(AuthService::require_permission(&state, None, Some("pos:sale")).await.is_ok());

        // 4. Lock terminal
        AuthService::lock(&state).await.expect("Lock should succeed");
        let locked_session = state.get_session().await;
        assert!(locked_session.is_locked);

        // While locked, permissions fail with Locked error
        let locked_perm = AuthService::require_permission(&state, Some("dashboard"), None).await;
        assert!(matches!(locked_perm, Err(AppError::Locked(_))));

        // 5. Unlock with wrong PIN fails
        let bad_unlock = AuthService::unlock(repo, &state, "9999").await;
        assert!(bad_unlock.is_err());

        // 6. Unlock with valid PIN succeeds
        let good_unlock = AuthService::unlock(repo, &state, "1234")
            .await
            .expect("Unlock should succeed");
        assert!(!good_unlock.is_locked);

        // 7. Logout
        AuthService::logout(&state).await.expect("Logout should succeed");
        let post_logout = state.get_session().await;
        assert!(!post_logout.is_authenticated);
    }

    #[tokio::test]
    async fn test_pending_and_disabled_user_login_rejection() {
        let state = AppState::in_memory("5.0.3");
        let repo = &state.user_repo;

        create_test_user(
            repo,
            "pending_user",
            "Password123!",
            None,
            UserRole::Staff,
            UserStatus::Pending,
        )
        .await;

        let res_pending = AuthService::login(repo, &state, "pending_user", "Password123!").await;
        assert!(matches!(res_pending, Err(AppError::Forbidden(_))));

        create_test_user(
            repo,
            "disabled_user",
            "Password123!",
            None,
            UserRole::Staff,
            UserStatus::Disabled,
        )
        .await;

        let res_disabled = AuthService::login(repo, &state, "disabled_user", "Password123!").await;
        assert!(matches!(res_disabled, Err(AppError::Forbidden(_))));
    }

    #[tokio::test]
    async fn test_password_change_flow() {
        let state = AppState::in_memory("5.0.3");
        let repo = &state.user_repo;

        create_test_user(
            repo,
            "change_pwd_user",
            "InitialPwd123!",
            None,
            UserRole::Staff,
            UserStatus::Active,
        )
        .await;

        // Login first
        AuthService::login(repo, &state, "change_pwd_user", "InitialPwd123!").await.unwrap();

        // Change password
        let change_res = AuthService::change_password(
            repo,
            &state,
            "InitialPwd123!",
            "BrandNewPwd456!",
        ).await;
        assert!(change_res.is_ok());

        // Old password fails
        let old_res = AuthService::login(repo, &state, "change_pwd_user", "InitialPwd123!").await;
        assert!(old_res.is_err());

        // New password succeeds
        let new_res = AuthService::login(repo, &state, "change_pwd_user", "BrandNewPwd456!").await;
        assert!(new_res.is_ok());
    }
}
