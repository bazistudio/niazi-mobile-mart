use tauri::State;

use crate::domain::cash::{
    CashMovement, CashMovementFilterDto, CashSession, CloseCashSessionDto, CreateCashAdjustmentDto,
    DailyCashSummaryDto, OpenCashSessionDto,
};
use crate::errors::AppResult;
use crate::services::auth_service::AuthService;
use crate::state::AppState;

#[tauri::command]
pub async fn cash_session_open(
    state: State<'_, AppState>,
    mut dto: OpenCashSessionDto,
) -> AppResult<CashSession> {
    AuthService::require_permission(&state, Some("cash_management"), None).await?;
    let authorized_branch = AuthService::require_branch_access(&state, dto.branch_id.as_deref()).await?;
    dto.branch_id = Some(authorized_branch);
    let session = state.get_session().await;
    state.cash_service.open_session(session.user_id.as_deref(), dto).await
}

#[tauri::command]
pub async fn cash_session_get_current(
    state: State<'_, AppState>,
    branch_id: Option<String>,
) -> AppResult<Option<CashSession>> {
    AuthService::require_permission(&state, Some("cash_management"), None).await?;
    let authorized_branch = AuthService::require_branch_access(&state, branch_id.as_deref()).await?;
    state.cash_service.get_current_session(Some(&authorized_branch)).await
}

#[tauri::command]
pub async fn cash_session_get_by_id(
    state: State<'_, AppState>,
    id: String,
) -> AppResult<CashSession> {
    AuthService::require_permission(&state, Some("cash_management"), None).await?;
    let cash_session = state.cash_service.get_session_by_id(&id).await?;
    AuthService::require_branch_access(&state, Some(&cash_session.branch_id)).await?;
    Ok(cash_session)
}

#[tauri::command]
pub async fn cash_session_list(
    state: State<'_, AppState>,
    branch_id: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
) -> AppResult<Vec<CashSession>> {
    AuthService::require_permission(&state, Some("cash_management"), None).await?;
    let authorized_branch = AuthService::require_branch_access(&state, branch_id.as_deref()).await?;
    state.cash_service.list_sessions(Some(&authorized_branch), limit, offset).await
}

#[tauri::command]
pub async fn cash_session_close(
    state: State<'_, AppState>,
    dto: CloseCashSessionDto,
) -> AppResult<CashSession> {
    AuthService::require_permission(&state, Some("cash_management"), None).await?;
    let cash_session = state.cash_service.get_session_by_id(&dto.session_id).await?;
    AuthService::require_branch_access(&state, Some(&cash_session.branch_id)).await?;
    let session = state.get_session().await;
    state.cash_service.close_session(session.user_id.as_deref(), dto).await
}

#[tauri::command]
pub async fn cash_adjustment_create(
    state: State<'_, AppState>,
    mut dto: CreateCashAdjustmentDto,
) -> AppResult<CashMovement> {
    AuthService::require_permission(&state, Some("cash_management"), None).await?;
    let authorized_branch = AuthService::require_branch_access(&state, dto.branch_id.as_deref()).await?;
    dto.branch_id = Some(authorized_branch);
    let session = state.get_session().await;
    state.cash_service.create_adjustment(session.user_id.as_deref(), dto).await
}

#[tauri::command]
pub async fn cash_movement_list(
    state: State<'_, AppState>,
    mut filter: Option<CashMovementFilterDto>,
) -> AppResult<Vec<CashMovement>> {
    AuthService::require_permission(&state, Some("cash_management"), None).await?;
    if let Some(ref mut f) = filter {
        if let Some(ref bid) = f.branch_id {
            AuthService::require_branch_access(&state, Some(bid)).await?;
        } else {
            let authorized_branch = AuthService::require_branch_access(&state, None).await?;
            let session = state.get_session().await;
            let is_org_admin = match session.role {
                Some(crate::domain::user::UserRole::Admin) => true,
                _ => session.access_profile.as_ref().map_or(false, |p| p.allowed_pages.iter().any(|pg| pg == "*")),
            };
            if !is_org_admin {
                f.branch_id = Some(authorized_branch);
            }
        }
    }
    state.cash_service.list_movements(filter).await
}

#[tauri::command]
pub async fn cash_get_daily_summary(
    state: State<'_, AppState>,
    branch_id: Option<String>,
    date: Option<String>,
) -> AppResult<DailyCashSummaryDto> {
    AuthService::require_permission(&state, Some("cash_management"), None).await?;
    let authorized_branch = AuthService::require_branch_access(&state, branch_id.as_deref()).await?;
    state.cash_service.get_daily_summary(Some(&authorized_branch), date.as_deref()).await
}
