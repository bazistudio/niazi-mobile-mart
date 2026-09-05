use std::time::{SystemTime, UNIX_EPOCH};

use crate::domain::user::SanitizedUser;
use crate::errors::{AppError, AppResult};
use crate::repositories::InMemoryUserRepository;
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
        repo: &InMemoryUserRepository,
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

        if !user.is_active {
            return Err(AppError::Forbidden(
                "Account is disabled. Please contact your system administrator.".to_string(),
            ));
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

    /// Unlocks a locked terminal using the active staff member's 4-digit PIN
    pub async fn unlock(
        repo: &InMemoryUserRepository,
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

    #[tokio::test]
    async fn test_full_login_and_session_flow() {
        let state = AppState::new("5.0.3");
        let repo = &state.user_repo;

        // 1. Invalid login fails
        let invalid = AuthService::login(repo, &state, "admin", "WrongPassword!").await;
        assert!(invalid.is_err());

        // 2. Valid login succeeds
        let valid = AuthService::login(repo, &state, "admin", "Admin@Niazi2025!")
            .await
            .expect("Login should succeed");
        assert_eq!(valid.username, "admin");

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
    async fn test_disabled_user_login_rejection() {
        let state = AppState::new("5.0.3");
        let repo = &state.user_repo;

        // Fetch cashier and disable account
        let mut cashier = repo.find_by_username("cashier1").await.unwrap().unwrap();
        cashier.is_active = false;
        repo.save(cashier).await.unwrap();

        // Attempt login
        let res = AuthService::login(repo, &state, "cashier1", "Cashier@123").await;
        assert!(matches!(res, Err(AppError::Forbidden(_))));
    }

    #[tokio::test]
    async fn test_pin_brute_force_lockout() {
        let state = AppState::new("5.0.3");
        let repo = &state.user_repo;

        // Login as cashier
        AuthService::login(repo, &state, "cashier1", "Cashier@123")
            .await
            .unwrap();

        // Lock terminal
        AuthService::lock(&state).await.unwrap();

        // Fail PIN 5 times
        for _ in 0..5 {
            let res = AuthService::unlock(repo, &state, "0000").await;
            assert!(res.is_err());
        }

        // 6th attempt should return Locked error due to temporary lockout
        let locked_res = AuthService::unlock(repo, &state, "1234").await;
        assert!(matches!(locked_res, Err(AppError::Locked(_))));
    }

    #[tokio::test]
    async fn test_discount_operational_limits() {
        let state = AppState::new("5.0.3");
        let repo = &state.user_repo;

        // Cashier has 5% discount limit
        AuthService::login(repo, &state, "cashier1", "Cashier@123")
            .await
            .unwrap();

        assert!(AuthService::check_discount_limit(&state, 4.5).await.is_ok());
        assert!(AuthService::check_discount_limit(&state, 5.0).await.is_ok());
        assert!(matches!(
            AuthService::check_discount_limit(&state, 5.1).await,
            Err(AppError::Forbidden(_))
        ));
    }
}
