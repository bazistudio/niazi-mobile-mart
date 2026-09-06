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
    dto: OpenCashSessionDto,
) -> AppResult<CashSession> {
    AuthService::require_permission(&state, Some("cash_management"), None).await?;
    let session = state.get_session().await;
    state.cash_service.open_session(session.user_id.as_deref(), dto).await
}

#[tauri::command]
pub async fn cash_session_get_current(
    state: State<'_, AppState>,
    branch_id: Option<String>,
) -> AppResult<Option<CashSession>> {
    AuthService::require_permission(&state, Some("cash_management"), None).await?;
    state.cash_service.get_current_session(branch_id.as_deref()).await
}

#[tauri::command]
pub async fn cash_session_get_by_id(
    state: State<'_, AppState>,
    id: String,
) -> AppResult<CashSession> {
    AuthService::require_permission(&state, Some("cash_management"), None).await?;
    state.cash_service.get_session_by_id(&id).await
}

#[tauri::command]
pub async fn cash_session_list(
    state: State<'_, AppState>,
    branch_id: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
) -> AppResult<Vec<CashSession>> {
    AuthService::require_permission(&state, Some("cash_management"), None).await?;
    state.cash_service.list_sessions(branch_id.as_deref(), limit, offset).await
}

#[tauri::command]
pub async fn cash_session_close(
    state: State<'_, AppState>,
    dto: CloseCashSessionDto,
) -> AppResult<CashSession> {
    AuthService::require_permission(&state, Some("cash_management"), None).await?;
    let session = state.get_session().await;
    state.cash_service.close_session(session.user_id.as_deref(), dto).await
}

#[tauri::command]
pub async fn cash_adjustment_create(
    state: State<'_, AppState>,
    dto: CreateCashAdjustmentDto,
) -> AppResult<CashMovement> {
    AuthService::require_permission(&state, Some("cash_management"), None).await?;
    let session = state.get_session().await;
    state.cash_service.create_adjustment(session.user_id.as_deref(), dto).await
}

#[tauri::command]
pub async fn cash_movement_list(
    state: State<'_, AppState>,
    filter: Option<CashMovementFilterDto>,
) -> AppResult<Vec<CashMovement>> {
    AuthService::require_permission(&state, Some("cash_management"), None).await?;
    state.cash_service.list_movements(filter).await
}

#[tauri::command]
pub async fn cash_get_daily_summary(
    state: State<'_, AppState>,
    branch_id: Option<String>,
    date: Option<String>,
) -> AppResult<DailyCashSummaryDto> {
    AuthService::require_permission(&state, Some("cash_management"), None).await?;
    state.cash_service.get_daily_summary(branch_id.as_deref(), date.as_deref()).await
}
