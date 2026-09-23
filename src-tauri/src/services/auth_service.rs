use std::time::{SystemTime, UNIX_EPOCH};

use crate::domain::access_control::StaffAccessProfile;
use crate::domain::user::{SanitizedUser, UserStatus};
use crate::errors::{AppError, AppResult};
use crate::repositories::{SQLiteAuthSnapshotRepository, SQLiteUserRepository, UserRepository};
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
                "Invalid credentials. Please verify your username and login key or PIN.".to_string(),
            ));
        }

        // Login succeeded: reset counters
        user.failed_login_attempts = 0;
        user.login_locked_until_ms = None;
        repo.save(user.clone()).await?;

        let sanitized = user.sanitize();
        let token = app_state.token_manager.create_token(sanitized.clone()).await;

        // Establish active native session in AppState with active token
        app_state.set_authenticated_with_token(&user, Some(token)).await;

        Ok(sanitized)
    }

    /// Authenticates a staff member against a local SQLite authentication snapshot
    pub async fn login_with_snapshot(
        snapshot_repo: &SQLiteAuthSnapshotRepository,
        app_state: &AppState,
        username: &str,
        credential: &str,
    ) -> AppResult<SessionContext> {
        let clean_username = username.trim();
        if clean_username.is_empty() || credential.is_empty() {
            return Err(AppError::Validation(
                "Username and credential are required".to_string(),
            ));
        }

        // 1. Retrieve snapshot by username (respects COLLATE NOCASE)
        let snapshot = match snapshot_repo.find_by_username(clean_username).await? {
            Some(s) => s,
            None => {
                return Err(AppError::Unauthorized(
                    "Invalid credentials. Please verify your username and credential.".to_string(),
                ));
            }
        };

        // 2. Validate snapshot status (Active allowed; Disabled, Pending, Rejected fail closed)
        match snapshot.status {
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

        // 3. Verify Argon2id credential hash
        if !verify_credential(credential, &snapshot.credential_hash) {
            return Err(AppError::Unauthorized(
                "Invalid credentials. Please verify your username and credential.".to_string(),
            ));
        }

        // 4. Parse access_profile_json (FAIL CLOSED if deserialization fails)
        let access_profile = serde_json::from_str::<StaffAccessProfile>(&snapshot.access_profile_json)
            .map_err(|e| {
                AppError::Unauthorized(format!(
                    "Invalid or malformed access profile in authentication snapshot: {}",
                    e
                ))
            })?;

        // 5. Establish native AppState.session with active_token = None
        app_state.set_authenticated_from_snapshot(&snapshot, access_profile).await;

        Ok(app_state.get_session().await)
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

    /// Bootstraps native authentication snapshots from the Central Server
    /// using a recently verified Central API Bearer JWT token.
    /// This resolves the first-time login deadlock on empty/new native installations.
    pub async fn bootstrap_snapshots_from_central(
        app_state: &AppState,
        token: &str,
    ) -> AppResult<()> {
        let clean_token = token.trim().strip_prefix("Bearer ").unwrap_or(token).trim();
        if clean_token.is_empty() {
            return Err(AppError::Unauthorized("Missing authorization token for snapshot bootstrap".to_string()));
        }

        let db = match &app_state.db {
            Some(db) => db.clone(),
            None => return Err(AppError::Internal("No SQLite database available for snapshots".to_string())),
        };

        let server_url = std::env::var("CENTRAL_SERVER_URL")
            .unwrap_or_else(|_| crate::services::sync_worker::DEFAULT_CENTRAL_SERVER_URL.to_string());

        let client = reqwest::Client::builder().timeout(std::time::Duration::from_secs(10)).build()
            .map_err(|e| AppError::Internal(format!("HTTP client error: {}", e)))?;

        let snapshot_url = format!("{}/api/v1/users/credential-snapshots", server_url.trim_end_matches('/'));

        let resp = client
            .get(&snapshot_url)
            .header("Authorization", format!("Bearer {}", clean_token))
            .send()
            .await
            .map_err(|e| AppError::Internal(format!("Snapshot sync network error: {}", e)))?;

        if !resp.status().is_success() {
            return Err(AppError::Unauthorized("Central server rejected the token during snapshot bootstrap".to_string()));
        }

        let snapshots: Vec<crate::domain::auth_snapshot::AuthSnapshot> = resp.json().await
            .map_err(|e| AppError::Internal(format!("Failed to parse snapshots: {}", e)))?;

        let snapshot_repo = crate::repositories::SQLiteAuthSnapshotRepository::new(db);
        let now = chrono::Utc::now().to_rfc3339();

        for mut snapshot in snapshots {
            if snapshot.user_id.trim().is_empty() || snapshot.credential_hash.trim().is_empty() {
                continue;
            }
            if serde_json::from_str::<crate::domain::access_control::StaffAccessProfile>(&snapshot.access_profile_json).is_err() {
                continue;
            }
            snapshot.synced_at = now.clone();
            let _ = snapshot_repo.upsert(&snapshot).await;
        }

        Ok(())
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
            app_state.set_active_token(Some(clean_token.to_string())).await;
            return Ok(app_state.get_session().await);
        }

        // If native session is unauthenticated, resolve token using local TokenManager
        let identity = app_state.token_manager.resolve_identity(clean_token).await?;

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
                "Access denied: Organization Admin authority required for this operation".to_string(),
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

        // 3. Normal staff must only access their assigned branch
        let user_id = session.user_id.as_deref().unwrap_or_default();
        let user_branch_id = {
            let db = app_state.db.as_ref().expect("SQLite database connection required");
            let conn_arc = db.inner();
            let guard = conn_arc.lock().await;

            let snapshot_branch: Result<Option<String>, _> = guard.query_row(
                "SELECT branch_id FROM local_auth_snapshot WHERE user_id = ?1",
                rusqlite::params![user_id],
                |row| row.get(0),
            );

            match snapshot_branch {
                Ok(branch) => branch,
                Err(_) => guard
                    .query_row(
                        "SELECT branch_id FROM users WHERE id = ?1",
                        rusqlite::params![user_id],
                        |row| row.get::<_, Option<String>>(0),
                    )
                    .map_err(|e| AppError::Database(format!("Failed to retrieve user branch: {e}")))?,
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::access_control::StaffAccessProfile;
    use crate::domain::user::{User, UserRole};
    use crate::services::hasher::hash_credential;

    async fn create_test_user(
        repo: &UserRepository,
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

    #[tokio::test]
    async fn test_sync_session_from_token_lifecycle() {
        let state = AppState::in_memory("5.0.3");
        let repo = &state.user_repo;

        let user = create_test_user(
            repo,
            "jwt_sync_admin",
            "Pass123!",
            None,
            UserRole::Admin,
            UserStatus::Active,
        )
        .await;

        let sanitized = user.sanitize();
        let valid_token = state.token_manager.create_token(sanitized.clone()).await;

        // 1. Valid JWT synchronization populates native AppState.session
        let sync_res = AuthService::sync_session_from_token(&state, &valid_token).await;
        assert!(sync_res.is_ok());

        let session = state.get_session().await;
        assert!(session.is_authenticated);
        assert!(!session.is_locked);
        assert_eq!(session.username, Some("jwt_sync_admin".to_string()));
        assert_eq!(session.role, Some(UserRole::Admin));
        assert_eq!(session.active_token, Some(valid_token.clone()));

        // 2. Verified session preserves access profile and passes require_permission
        assert!(AuthService::require_permission(&state, Some("inventory"), Some("inventory:write")).await.is_ok());

        // 3. Expired / Invalid token synchronization fails and leaves unauthenticated
        let state_unauth = AppState::in_memory("5.0.3");
        let empty_res = AuthService::sync_session_from_token(&state_unauth, "").await;
        assert!(matches!(empty_res, Err(AppError::Unauthorized(_))));
        assert!(!state_unauth.get_session().await.is_authenticated);

        let tampered_token = format!("{valid_token}tampered");
        let tampered_res = AuthService::sync_session_from_token(&state_unauth, &tampered_token).await;
        assert!(matches!(tampered_res, Err(AppError::Unauthorized(_))));
        assert!(!state_unauth.get_session().await.is_authenticated);

        // 4. Central JWT token synchronization on an already authenticated native session attaches active_token
        let central_jwt = "header.payload.signature_from_cloud_run_server";
        let sync_central_res = AuthService::sync_session_from_token(&state, central_jwt).await;
        assert!(sync_central_res.is_ok());

        let central_synced_session = state.get_session().await;
        assert!(central_synced_session.is_authenticated);
        assert_eq!(central_synced_session.username, Some("jwt_sync_admin".to_string()));
        assert_eq!(central_synced_session.active_token, Some(central_jwt.to_string()));
    }

    #[tokio::test]
    async fn test_central_jwt_sync_on_authenticated_native_session() {
        let state = AppState::in_memory("5.0.3");
        let repo = &state.user_repo;

        // 1. Unauthenticated native session rejects central JWT token
        let unauth_sync = AuthService::sync_session_from_token(&state, "unverified_central_jwt").await;
        assert!(matches!(unauth_sync, Err(AppError::Unauthorized(_))));
        assert!(!state.get_session().await.is_authenticated);

        // 2. Authenticate user natively via local login (Argon2id credential verification)
        create_test_user(
            repo,
            "native_staff",
            "ValidPass123!",
            None,
            UserRole::Staff,
            UserStatus::Active,
        )
        .await;

        AuthService::login(repo, &state, "native_staff", "ValidPass123!").await.unwrap();
        let session_before = state.get_session().await;
        assert!(session_before.is_authenticated);

        // 3. Sync central Bearer JWT token onto authenticated native session
        let central_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.central_token_payload";
        let sync_res = AuthService::sync_session_from_token(&state, central_token).await;
        assert!(sync_res.is_ok());

        let session_after = state.get_session().await;
        assert!(session_after.is_authenticated);
        assert_eq!(session_after.username, Some("native_staff".to_string()));
        assert_eq!(session_after.active_token, Some(central_token.to_string()));
    }

    #[tokio::test]
    async fn test_require_org_admin_authorization_boundary() {
        let state = AppState::in_memory("5.0.3");
        let repo = &state.user_repo;

        // 1. Unauthenticated state rejects with Unauthorized
        let unauth_res = AuthService::require_org_admin(&state).await;
        assert!(matches!(unauth_res, Err(AppError::Unauthorized(ref msg)) if msg.contains("Authentication required")));

        // 2. Admin native session passes require_org_admin
        let _admin_user = create_test_user(
            repo,
            "org_admin_test",
            "Pass123!",
            None,
            UserRole::Admin,
            UserStatus::Active,
        )
        .await;

        let login_res = AuthService::login(repo, &state, "org_admin_test", "Pass123!").await;
        assert!(login_res.is_ok());

        let admin_res = AuthService::require_org_admin(&state).await;
        assert!(admin_res.is_ok(), "Admin session must pass require_org_admin");

        // 3. Cashier native session is rejected with Forbidden
        let _cashier_user = create_test_user(
            repo,
            "cashier_test",
            "Pass123!",
            None,
            UserRole::Cashier,
            UserStatus::Active,
        )
        .await;

        let cashier_login = AuthService::login(repo, &state, "cashier_test", "Pass123!").await;
        assert!(cashier_login.is_ok());

        let cashier_res = AuthService::require_org_admin(&state).await;
        assert!(matches!(cashier_res, Err(AppError::Forbidden(ref msg)) if msg.contains("Organization Admin authority required")));

        // 4. Logout clears native session back to Unauthorized
        AuthService::logout(&state).await.unwrap();
        let logout_res = AuthService::require_org_admin(&state).await;
        assert!(matches!(logout_res, Err(AppError::Unauthorized(_))));
    }

    #[tokio::test]
    async fn test_native_login_credential_validation_and_invalid_user_rejection() {
        let state = AppState::in_memory("5.0.3");
        let repo = &state.user_repo;

        // 1. Empty username or password rejected with Validation
        let empty_res = AuthService::login(repo, &state, "", "").await;
        assert!(matches!(empty_res, Err(AppError::Validation(_))));

        // 2. Non-existent user rejected with Unauthorized invalid credentials message
        let invalid_user_res = AuthService::login(repo, &state, "unknown_user", "Pass123!").await;
        assert!(matches!(invalid_user_res, Err(AppError::Unauthorized(ref msg)) if msg.contains("Invalid credentials")));

        // 3. Register user and verify wrong password rejection
        let _user = create_test_user(
            repo,
            "valid_user",
            "CorrectPass123!",
            None,
            UserRole::Admin,
            UserStatus::Active,
        )
        .await;

        let wrong_pass_res = AuthService::login(repo, &state, "valid_user", "WrongPass!").await;
        assert!(matches!(wrong_pass_res, Err(AppError::Unauthorized(ref msg)) if msg.contains("Invalid credentials")));

        // 4. Correct credentials succeed and populate AppState.session
        let valid_res = AuthService::login(repo, &state, "valid_user", "CorrectPass123!").await;
        assert!(valid_res.is_ok());
        let session = state.get_session().await;
        assert!(session.is_authenticated);
        assert_eq!(session.username, Some("valid_user".to_string()));
        assert_eq!(session.role, Some(UserRole::Admin));
    }

    // ─────────────────────────────────────────────────────────────
    // Phase D — Local Authentication Snapshot Unit Tests
    // ─────────────────────────────────────────────────────────────

    use crate::domain::auth_snapshot::AuthSnapshot;

    fn make_test_snapshot(
        user_id: &str,
        username: &str,
        credential: &str,
        role: UserRole,
        status: UserStatus,
        branch_id: Option<String>,
        access_profile_json: Option<String>,
    ) -> AuthSnapshot {
        let hash = hash_credential(credential).unwrap();
        let profile_json = access_profile_json.unwrap_or_else(|| {
            serde_json::to_string(&match role {
                UserRole::Admin => StaffAccessProfile::admin_unlimited(),
                UserRole::Cashier => StaffAccessProfile::cashier_default(),
                _ => StaffAccessProfile::staff_default(),
            })
            .unwrap()
        });

        AuthSnapshot {
            user_id: user_id.to_string(),
            username: username.to_string(),
            organization_id: "test-org-123".to_string(),
            branch_id,
            role,
            credential_hash: hash,
            access_profile_json: profile_json,
            credential_version: 1,
            status,
            synced_at: "2026-01-01T00:00:00Z".to_string(),
            created_at: "2026-01-01T00:00:00Z".to_string(),
            updated_at: "2026-01-01T00:00:00Z".to_string(),
        }
    }

    #[tokio::test]
    async fn test_snapshot_auth_test_1_valid_credential() {
        let state = AppState::in_memory("1.2.15");
        let snapshot_repo = state.auth_snapshot_repo().unwrap();
        let snapshot = make_test_snapshot(
            "test-user-1",
            "snapshot_user",
            "ValidCred123!",
            UserRole::Cashier,
            UserStatus::Active,
            Some("branch-1".to_string()),
            None,
        );

        snapshot_repo.upsert(&snapshot).await.unwrap();

        let session = AuthService::login_with_snapshot(&snapshot_repo, &state, "snapshot_user", "ValidCred123!")
            .await
            .expect("Snapshot login should succeed");

        assert!(session.is_authenticated);
        assert!(!session.is_locked);
        assert_eq!(session.user_id, Some("test-user-1".to_string()));
        assert_eq!(session.username, Some("snapshot_user".to_string()));
        assert_eq!(session.role, Some(UserRole::Cashier));
        assert!(session.active_token.is_none(), "Snapshot session must have active_token = None");
    }

    #[tokio::test]
    async fn test_snapshot_auth_test_2_invalid_credential() {
        let state = AppState::in_memory("1.2.15");
        let snapshot_repo = state.auth_snapshot_repo().unwrap();
        let snapshot = make_test_snapshot(
            "test-user-2",
            "snapshot_user2",
            "ValidCred123!",
            UserRole::Cashier,
            UserStatus::Active,
            None,
            None,
        );

        snapshot_repo.upsert(&snapshot).await.unwrap();

        let res = AuthService::login_with_snapshot(&snapshot_repo, &state, "snapshot_user2", "WrongCred!")
            .await;
        assert!(matches!(res, Err(AppError::Unauthorized(_))));

        let session = state.get_session().await;
        assert!(!session.is_authenticated);
    }

    #[tokio::test]
    async fn test_snapshot_auth_test_3_disabled_user() {
        let state = AppState::in_memory("1.2.15");
        let snapshot_repo = state.auth_snapshot_repo().unwrap();
        let snapshot = make_test_snapshot(
            "test-user-disabled",
            "disabled_snap",
            "ValidCred123!",
            UserRole::Staff,
            UserStatus::Disabled,
            None,
            None,
        );

        snapshot_repo.upsert(&snapshot).await.unwrap();

        let res = AuthService::login_with_snapshot(&snapshot_repo, &state, "disabled_snap", "ValidCred123!").await;
        assert!(matches!(res, Err(AppError::Forbidden(_))));
        assert!(!state.get_session().await.is_authenticated);
    }

    #[tokio::test]
    async fn test_snapshot_auth_test_4_pending_user() {
        let state = AppState::in_memory("1.2.15");
        let snapshot_repo = state.auth_snapshot_repo().unwrap();
        let snapshot = make_test_snapshot(
            "test-user-pending",
            "pending_snap",
            "ValidCred123!",
            UserRole::Staff,
            UserStatus::Pending,
            None,
            None,
        );

        snapshot_repo.upsert(&snapshot).await.unwrap();

        let res = AuthService::login_with_snapshot(&snapshot_repo, &state, "pending_snap", "ValidCred123!").await;
        assert!(matches!(res, Err(AppError::Forbidden(_))));
        assert!(!state.get_session().await.is_authenticated);
    }

    #[tokio::test]
    async fn test_snapshot_auth_test_5_rejected_user() {
        let state = AppState::in_memory("1.2.15");
        let snapshot_repo = state.auth_snapshot_repo().unwrap();
        let snapshot = make_test_snapshot(
            "test-user-rejected",
            "rejected_snap",
            "ValidCred123!",
            UserRole::Staff,
            UserStatus::Rejected,
            None,
            None,
        );

        snapshot_repo.upsert(&snapshot).await.unwrap();

        let res = AuthService::login_with_snapshot(&snapshot_repo, &state, "rejected_snap", "ValidCred123!").await;
        assert!(matches!(res, Err(AppError::Forbidden(_))));
        assert!(!state.get_session().await.is_authenticated);
    }

    #[tokio::test]
    async fn test_snapshot_auth_test_6_unknown_status_fails_closed() {
        let state = AppState::in_memory("1.2.15");
        let db = state.db.as_ref().unwrap();
        let conn_arc = db.inner();
        let guard = conn_arc.lock().await;

        let hash = hash_credential("ValidCred123!").unwrap();
        let profile = serde_json::to_string(&StaffAccessProfile::staff_default()).unwrap();
        guard.execute(
            "INSERT INTO local_auth_snapshot (
                user_id, username, organization_id, branch_id, role, credential_hash,
                access_profile_json, credential_version, status, synced_at, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            rusqlite::params![
                "unknown-status-user", "unknown_snap", "org-1", None::<String>, "STAFF",
                hash, profile, 1, "SUSPENDED_UNKNOWN", "2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z"
            ],
        ).unwrap();
        drop(guard);

        let snapshot_repo = state.auth_snapshot_repo().unwrap();
        let res = AuthService::login_with_snapshot(&snapshot_repo, &state, "unknown_snap", "ValidCred123!").await;
        assert!(matches!(res, Err(AppError::Forbidden(_))));
        assert!(!state.get_session().await.is_authenticated);
    }

    #[tokio::test]
    async fn test_snapshot_auth_test_7_malformed_access_profile() {
        let state = AppState::in_memory("1.2.15");
        let snapshot_repo = state.auth_snapshot_repo().unwrap();
        let snapshot = make_test_snapshot(
            "test-user-malformed",
            "malformed_snap",
            "ValidCred123!",
            UserRole::Cashier,
            UserStatus::Active,
            None,
            Some("invalid { json content".to_string()),
        );

        snapshot_repo.upsert(&snapshot).await.unwrap();

        let res = AuthService::login_with_snapshot(&snapshot_repo, &state, "malformed_snap", "ValidCred123!").await;
        assert!(matches!(res, Err(AppError::Unauthorized(_))));
        assert!(!state.get_session().await.is_authenticated, "Malformed access profile must fail closed without creating session");
    }

    #[tokio::test]
    async fn test_snapshot_auth_test_8_nullable_branch() {
        let state = AppState::in_memory("1.2.15");
        let snapshot_repo = state.auth_snapshot_repo().unwrap();
        let snapshot = make_test_snapshot(
            "test-user-null-branch",
            "null_branch_user",
            "ValidCred123!",
            UserRole::Cashier,
            UserStatus::Active,
            None,
            None,
        );

        snapshot_repo.upsert(&snapshot).await.unwrap();

        let session = AuthService::login_with_snapshot(&snapshot_repo, &state, "null_branch_user", "ValidCred123!")
            .await
            .unwrap();

        assert!(session.is_authenticated);
        let branch_res = AuthService::require_branch_access(&state, None).await;
        assert!(branch_res.is_ok());
    }

    #[tokio::test]
    async fn test_snapshot_auth_test_9_existing_authorization_boundaries() {
        let state = AppState::in_memory("1.2.15");
        let snapshot_repo = state.auth_snapshot_repo().unwrap();

        let staff_snap = make_test_snapshot(
            "staff-1",
            "staff_user",
            "ValidCred123!",
            UserRole::Cashier,
            UserStatus::Active,
            Some("branch-1".to_string()),
            None,
        );
        snapshot_repo.upsert(&staff_snap).await.unwrap();

        AuthService::login_with_snapshot(&snapshot_repo, &state, "staff_user", "ValidCred123!").await.unwrap();

        assert!(AuthService::require_permission(&state, Some("pos"), Some("pos:sale")).await.is_ok());
        assert!(matches!(AuthService::require_org_admin(&state).await, Err(AppError::Forbidden(_))));

        let admin_snap = make_test_snapshot(
            "admin-1",
            "admin_user",
            "ValidCred123!",
            UserRole::Admin,
            UserStatus::Active,
            None,
            None,
        );
        snapshot_repo.upsert(&admin_snap).await.unwrap();

        AuthService::login_with_snapshot(&snapshot_repo, &state, "admin_user", "ValidCred123!").await.unwrap();
        assert!(AuthService::require_org_admin(&state).await.is_ok());
    }

    #[tokio::test]
    async fn test_snapshot_auth_test_10_logout_session_reset() {
        let state = AppState::in_memory("1.2.15");
        let snapshot_repo = state.auth_snapshot_repo().unwrap();
        let snapshot = make_test_snapshot(
            "logout-user",
            "logout_user",
            "ValidCred123!",
            UserRole::Staff,
            UserStatus::Active,
            None,
            None,
        );

        snapshot_repo.upsert(&snapshot).await.unwrap();

        AuthService::login_with_snapshot(&snapshot_repo, &state, "logout_user", "ValidCred123!").await.unwrap();
        assert!(state.get_session().await.is_authenticated);

        AuthService::logout(&state).await.unwrap();
        let post_logout = state.get_session().await;
        assert!(!post_logout.is_authenticated);
        assert!(post_logout.user_id.is_none());
        assert!(AuthService::require_permission(&state, Some("dashboard"), None).await.is_err());
    }

    #[tokio::test]
    async fn test_snapshot_auth_test_11_jwt_independence() {
        let state = AppState::in_memory("1.2.15");
        let snapshot_repo = state.auth_snapshot_repo().unwrap();
        let snapshot = make_test_snapshot(
            "jwt-indep-user",
            "jwt_indep_user",
            "ValidCred123!",
            UserRole::Cashier,
            UserStatus::Active,
            None,
            None,
        );

        snapshot_repo.upsert(&snapshot).await.unwrap();

        let session = AuthService::login_with_snapshot(&snapshot_repo, &state, "jwt_indep_user", "ValidCred123!")
            .await
            .unwrap();

        assert!(session.active_token.is_none());
        assert!(session.is_authenticated);
    }
}
