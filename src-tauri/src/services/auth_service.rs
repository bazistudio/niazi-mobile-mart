use std::time::{SystemTime, UNIX_EPOCH};

use crate::domain::access_control::StaffAccessProfile;
use crate::domain::user::{SanitizedUser, UserStatus};
use crate::errors::{AppError, AppResult};
use crate::repositories::UserRepository;
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
        repo: &UserRepository,
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
                    "ACCOUNT_PENDING: Your registration is pending administrator approval."
                        .to_string(),
                ));
            }
            UserStatus::Rejected => {
                return Err(AppError::Forbidden(
                    "ACCOUNT_REJECTED: Your account registration was rejected by administration."
                        .to_string(),
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

        // Verify Argon2id hash against password OR terminal PIN
        let password_valid = verify_credential(login_key, &user.login_key_hash);
        let pin_valid = user
            .pin_hash
            .as_deref()
            .map(|h| verify_credential(login_key, h))
            .unwrap_or(false);

        if !password_valid && !pin_valid {
            user.failed_login_attempts += 1;
            if user.failed_login_attempts >= 5 {
                // 15 minute temporary lockout
                user.login_locked_until_ms = Some(now + (15 * 60 * 1000));
            }
            repo.save(user).await?;
            return Err(AppError::Unauthorized(
                "Invalid credentials. Please verify your username and login key or PIN."
                    .to_string(),
            ));
        }

        // Login succeeded: reset counters
        user.failed_login_attempts = 0;
        user.login_locked_until_ms = None;
        repo.save(user.clone()).await?;

        let sanitized = user.sanitize();
        // Only a server holding the private signing key may mint tokens. Desktop builds carry
        // the public verification key only, so a local login establishes a session without a
        // central token (central tokens come from the server's /auth/login).
        let token = if app_state.token_manager.can_sign() {
            Some(
                app_state
                    .token_manager
                    .create_token(sanitized.clone())
                    .await,
            )
        } else {
            None
        };

        // Establish active native session in AppState with active token
        app_state.set_authenticated_with_token(&user, token).await;

        Ok(sanitized)
    }

    /// Changes password for the currently authenticated user
    pub async fn change_password(
        repo: &UserRepository,
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
        repo: &UserRepository,
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
        repo: &UserRepository,
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
                    "No PIN is configured for this account. Contact your administrator."
                        .to_string(),
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

    /// Synchronizes native SessionContext from a verified Central API Bearer JWT token
    pub async fn sync_session_from_token(
        app_state: &AppState,
        token: &str,
    ) -> AppResult<SessionContext> {
        let clean_token = token.trim().strip_prefix("Bearer ").unwrap_or(token).trim();
        if clean_token.is_empty() {
            return Err(AppError::Unauthorized(
                "Missing or empty authorization token".to_string(),
            ));
        }

        let session = app_state.get_session().await;

        if clean_token == "native-tauri-session" {
            if session.is_authenticated {
                return Ok(session);
            }
        }

        // If active native session is ALREADY authenticated authoritatively in Rust
        // (via authLogin or authLoginSnapshot), attach the provided token (e.g. Central API Bearer JWT)
        // as active_token for downstream sync operations without requiring desktop to possess Central Server's secret.
        if session.is_authenticated {
            app_state
                .set_active_token(Some(clean_token.to_string()))
                .await;
            return Ok(app_state.get_session().await);
        }

        // If native session is unauthenticated, resolve token using local TokenManager
        let identity = app_state
            .token_manager
            .resolve_identity(clean_token)
            .await?;

        app_state
            .set_authenticated_from_identity(identity, clean_token.to_string())
            .await;

        Ok(app_state.get_session().await)
    }

    /// Logs out and destroys the active session
    pub async fn logout(app_state: &AppState) -> AppResult<()> {
        app_state.clear_session().await;
        Ok(())
    }

    /// Checks if the active session has Organization Admin authority
    pub async fn is_org_admin(app_state: &AppState) -> bool {
        let session = app_state.get_session().await;
        if !session.is_authenticated || session.is_locked {
            return false;
        }
        match session.role {
            Some(crate::domain::user::UserRole::Admin) => true,
            _ => {
                if let Some(ref profile) = session.access_profile {
                    profile.allowed_pages.iter().any(|p| p == "*")
                } else {
                    false
                }
            }
        }
    }

    /// Requires Organization Admin authority for organization-level operations
    pub async fn require_org_admin(app_state: &AppState) -> AppResult<()> {
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

        if Self::is_org_admin(app_state).await {
            Ok(())
        } else {
            Err(AppError::Forbidden(
                "Access denied: Organization Admin authority required for this operation"
                    .to_string(),
            ))
        }
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

        if Self::is_org_admin(app_state).await {
            return Ok(());
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

    /// Authoritative backend enforcement of branch access.
    /// - Organization Admin (Admin role or '*' access) can access ANY branch within the organization.
    /// - Normal staff can ONLY access their explicitly authorized branch.
    /// Returns the authorized branch ID as a clean String.
    pub async fn require_branch_access(
        app_state: &AppState,
        requested_branch_id: Option<&str>,
    ) -> AppResult<String> {
        let session = app_state.get_session().await;
        if !session.is_authenticated {
            return Err(AppError::Unauthorized(
                "Authentication required to perform branch-scoped operations".to_string(),
            ));
        }

        if session.is_locked {
            return Err(AppError::Locked(
                "Terminal is locked. Please enter your PIN to resume.".to_string(),
            ));
        }

        let is_org_admin = match session.role {
            Some(crate::domain::user::UserRole::Admin) => true,
            _ => {
                if let Some(ref profile) = session.access_profile {
                    profile.allowed_pages.iter().any(|p| p == "*")
                } else {
                    false
                }
            }
        };

        let target_branch_id = match requested_branch_id.map(str::trim).filter(|s| !s.is_empty()) {
            Some(bid) => bid.to_string(),
            None => match app_state.branch_repo.get_main_branch().await? {
                Some(b) => b.id,
                None => crate::domain::organization::DEFAULT_MAIN_BRANCH_ID.to_string(),
            },
        };

        // 1. Verify that the target branch actually exists in the database
        let all_branches = app_state.branch_repo.list_branches().await?;
        let branch_exists = all_branches.iter().any(|b| b.id == target_branch_id);
        if !branch_exists {
            return Err(AppError::NotFound(format!(
                "Requested branch '{target_branch_id}' does not exist"
            )));
        }

        // 2. Organization Admin has unrestricted access across all existing organization branches
        if is_org_admin {
            return Ok(target_branch_id);
        }

        // 3. Normal staff must only access their assigned branch.
        // Branch is read exclusively from the PostgreSQL-backed user_repo — no SQLite fallback.
        let user_id = session.user_id.as_deref().unwrap_or_default();
        let user_branch_id = match app_state.user_repo.find_by_id(user_id).await? {
            Some(u) => u.branch_id,
            None => {
                return Err(AppError::Unauthorized(
                    "Active session user record not found in repository".to_string(),
                ))
            }
        };

        let authorized_branch = match user_branch_id {
            Some(bid) if !bid.trim().is_empty() => bid,
            _ => {
                // If user has no specific branch assigned, default to canonical main branch
                match app_state.branch_repo.get_main_branch().await? {
                    Some(b) => b.id,
                    None => crate::domain::organization::DEFAULT_MAIN_BRANCH_ID.to_string(),
                }
            }
        };

        if authorized_branch != target_branch_id {
            return Err(AppError::Forbidden(
                "Access denied: You are not authorized to operate on or view data for this branch"
                    .to_string(),
            ));
        }

        Ok(target_branch_id)
    }
}
