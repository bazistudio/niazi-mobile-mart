use serde::{Deserialize, Serialize};
use tauri::State;

use crate::domain::user::SanitizedUser;
use crate::errors::AppResult;
use crate::services::admin_service::{
    AdminService, CreateUserPayload, ResetCredentialsPayload, UpdateUserPayload,
};
use crate::services::auth_service::AuthService;
use crate::state::{AppState, SessionContext};

#[derive(Debug, Serialize, Deserialize)]
pub struct AuthResponse {
    pub user: SanitizedUser,
    pub session: SessionContext,
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
    AdminService::recover_admin_access(&state.user_repo, &recovery_token, &new_login_key).await
}
