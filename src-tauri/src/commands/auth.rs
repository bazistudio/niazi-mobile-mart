use serde::{Deserialize, Serialize};
use tauri::State;

use crate::domain::user::SanitizedUser;
use crate::errors::AppResult;
use crate::services::admin_service::{
    AdminService, BootstrapAdminPayload, BootstrapAdminResponse, CreateUserPayload,
    RegisterStaffPayload, ResetCredentialsPayload, UpdateUserPayload,
};
use crate::services::auth_service::AuthService;
use crate::state::{AppState, SessionContext};

#[derive(Debug, Serialize, Deserialize)]
pub struct AuthResponse {
    pub user: SanitizedUser,
    pub session: SessionContext,
}

/// Checks whether first-admin bootstrap is required (active admins == 0)
#[tauri::command]
pub async fn auth_check_bootstrap_status(state: State<'_, AppState>) -> AppResult<bool> {
    AdminService::check_bootstrap_status(&state.user_repo).await
}

/// One-time First Administrator bootstrap
#[tauri::command]
pub async fn auth_bootstrap_first_admin(
    state: State<'_, AppState>,
    payload: BootstrapAdminPayload,
) -> AppResult<BootstrapAdminResponse> {
    AdminService::bootstrap_first_admin(&state.user_repo, payload).await
}

/// Primary staff login command using username and login key
#[tauri::command]
pub async fn auth_login(
    state: State<'_, AppState>,
    username: String,
    login_key: String,
) -> AppResult<AuthResponse> {
    let sanitized_user = AuthService::login(&state.user_repo, &state, &username, &login_key).await?;
    let session = state.get_session().await;

    Ok(AuthResponse {
        user: sanitized_user,
        session,
    })
}

/// Destroys active native session
#[tauri::command]
pub async fn auth_logout(state: State<'_, AppState>) -> AppResult<()> {
    AuthService::logout(&state).await
}

/// Normal password change for authenticated user
#[tauri::command]
pub async fn auth_change_password(
    state: State<'_, AppState>,
    current_password: String,
    new_password: String,
) -> AppResult<()> {
    AuthService::change_password(&state.user_repo, &state, &current_password, &new_password).await
}

/// Forced password change when must_change_password is true
#[tauri::command]
pub async fn auth_forced_change_password(
    state: State<'_, AppState>,
    new_password: String,
) -> AppResult<()> {
    AuthService::forced_change_password(&state.user_repo, &state, &new_password).await
}

/// Public self-service staff signup (creates account in PENDING status)
#[tauri::command]
pub async fn auth_register_staff(
    state: State<'_, AppState>,
    payload: RegisterStaffPayload,
) -> AppResult<SanitizedUser> {
    AdminService::register_staff(&state.user_repo, payload).await
}

/// Locks the current terminal session
#[tauri::command]
pub async fn auth_lock(state: State<'_, AppState>) -> AppResult<SessionContext> {
    AuthService::lock(&state).await
}

/// Unlocks terminal using active user's PIN
#[tauri::command]
pub async fn auth_unlock(state: State<'_, AppState>, pin: String) -> AppResult<SessionContext> {
    AuthService::unlock(&state.user_repo, &state, &pin).await
}

/// Retrieves active session status
#[tauri::command]
pub async fn auth_get_current_session(state: State<'_, AppState>) -> AppResult<SessionContext> {
    Ok(state.get_session().await)
}

/// Retrieves current authenticated user record (sanitized)
#[tauri::command]
pub async fn auth_get_current_user(
    state: State<'_, AppState>,
) -> AppResult<Option<SanitizedUser>> {
    let session = state.get_session().await;
    if let Some(user_id) = &session.user_id {
        let user = state.user_repo.find_by_id(user_id).await?;
        Ok(user.map(|u| u.sanitize()))
    } else {
        Ok(None)
    }
}

/// Validates permission for a page or action
#[tauri::command]
pub async fn auth_check_permission(
    state: State<'_, AppState>,
    page: Option<String>,
    action: Option<String>,
) -> AppResult<bool> {
    AuthService::require_permission(
        &state,
        page.as_deref(),
        action.as_deref(),
    )
    .await?;
    Ok(true)
}

/// Validates maximum discount percentage limit
#[tauri::command]
pub async fn auth_check_discount_limit(
    state: State<'_, AppState>,
    requested_discount: f64,
) -> AppResult<bool> {
    AuthService::check_discount_limit(&state, requested_discount).await?;
    Ok(true)
}

// ─────────────────────────────────────────────────────────────
// Administrative Staff Management Commands
// ─────────────────────────────────────────────────────────────

/// Lists all staff accounts (admin only)
#[tauri::command]
pub async fn admin_list_users(state: State<'_, AppState>) -> AppResult<Vec<SanitizedUser>> {
    AdminService::list_users(&state.user_repo, &state).await
}

/// Approves a pending staff member account (admin only)
#[tauri::command]
pub async fn admin_approve_staff(
    state: State<'_, AppState>,
    user_id: String,
) -> AppResult<SanitizedUser> {
    AdminService::approve_staff(&state.user_repo, &state, &user_id).await
}

/// Rejects a staff member account (admin only)
#[tauri::command]
pub async fn admin_reject_staff(
    state: State<'_, AppState>,
    user_id: String,
) -> AppResult<SanitizedUser> {
    AdminService::reject_staff(&state.user_repo, &state, &user_id).await
}

/// Administrator resets a staff member's password to a temporary password,
/// setting must_change_password = true (admin only)
#[tauri::command]
pub async fn admin_reset_staff_password(
    state: State<'_, AppState>,
    user_id: String,
    temporary_password: String,
) -> AppResult<()> {
    AdminService::reset_staff_password(&state.user_repo, &state, &user_id, &temporary_password).await
}

/// Creates a new staff member (admin only)
#[tauri::command]
pub async fn admin_create_user(
    state: State<'_, AppState>,
    payload: CreateUserPayload,
) -> AppResult<SanitizedUser> {
    AdminService::create_user(&state.user_repo, &state, payload).await
}

/// Updates staff member properties (admin only)
#[tauri::command]
pub async fn admin_update_user(
    state: State<'_, AppState>,
    payload: UpdateUserPayload,
) -> AppResult<SanitizedUser> {
    AdminService::update_user(&state.user_repo, &state, payload).await
}

/// Resets staff login key or PIN (admin only)
#[tauri::command]
pub async fn admin_reset_credentials(
    state: State<'_, AppState>,
    payload: ResetCredentialsPayload,
) -> AppResult<()> {
    AdminService::reset_credentials(&state.user_repo, &state, payload).await
}

/// Emergency Administrator access recovery
#[tauri::command]
pub async fn admin_recover_access(
    state: State<'_, AppState>,
    recovery_token: String,
    new_login_key: String,
) -> AppResult<()> {
    AdminService::recover_admin_access(&state.user_repo, &state, &recovery_token, &new_login_key).await
}

