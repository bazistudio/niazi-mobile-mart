use tauri::State;

use crate::domain::purchases::{
    CompletePurchaseDto, Purchase, PurchaseFilterDto, PurchaseLine, PurchaseResultDto,
};
use crate::errors::AppResult;
use crate::services::auth_service::AuthService;
use crate::state::AppState;

#[tauri::command]
pub async fn purchase_complete(
    state: State<'_, AppState>,
    dto: CompletePurchaseDto,
) -> AppResult<PurchaseResultDto> {
    AuthService::require_permission(&state, Some("purchases"), None).await?;
    let user_id = { state.session.read().await.user_id.clone() };
    state
        .purchase_service
        .complete_purchase(user_id.as_deref(), dto)
        .await
}

#[tauri::command]
pub async fn purchase_get_by_id(
    state: State<'_, AppState>,
    id: String,
) -> AppResult<Option<Purchase>> {
    AuthService::require_permission(&state, Some("purchases"), None).await?;
    state.purchase_service.get_purchase_by_id(&id).await
}

#[tauri::command]
pub async fn purchase_get_by_number(
    state: State<'_, AppState>,
    purchase_number: String,
) -> AppResult<Option<Purchase>> {
    AuthService::require_permission(&state, Some("purchases"), None).await?;
    state.purchase_service.get_purchase_by_number(&purchase_number).await
}

#[tauri::command]
pub async fn purchase_list(
    state: State<'_, AppState>,
    filter: Option<PurchaseFilterDto>,
) -> AppResult<Vec<Purchase>> {
    AuthService::require_permission(&state, Some("purchases"), None).await?;
    state.purchase_service.list_purchases(filter).await
}

#[tauri::command]
pub async fn purchase_get_lines(
    state: State<'_, AppState>,
    purchase_id: String,
) -> AppResult<Vec<PurchaseLine>> {
    AuthService::require_permission(&state, Some("purchases"), None).await?;
    state.purchase_service.get_purchase_lines(&purchase_id).await
}
