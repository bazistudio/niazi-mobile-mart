use tauri::State;

use crate::domain::purchase_return::{
    CreatePurchaseReturnDto, PurchaseReturnDetailDto, PurchaseReturnableInfoDto,
};
use crate::errors::AppResult;
use crate::services::auth_service::AuthService;
use crate::state::AppState;

#[tauri::command]
pub async fn purchase_return_get_returnable(
    state: State<'_, AppState>,
    purchase_id: String,
) -> AppResult<PurchaseReturnableInfoDto> {
    AuthService::require_permission(&state, Some("purchases"), None).await?;
    state
        .purchase_return_service
        .get_purchase_returnable_info(&purchase_id)
        .await
}

#[tauri::command]
pub async fn purchase_return_create(
    state: State<'_, AppState>,
    dto: CreatePurchaseReturnDto,
) -> AppResult<PurchaseReturnDetailDto> {
    AuthService::require_permission(&state, Some("purchases"), None).await?;
    let user_id = { state.session.read().await.user_id.clone() };
    state
        .purchase_return_service
        .create_purchase_return(dto, user_id.as_deref())
        .await
}

#[tauri::command]
pub async fn purchase_return_get(
    state: State<'_, AppState>,
    id: String,
) -> AppResult<Option<PurchaseReturnDetailDto>> {
    AuthService::require_permission(&state, Some("purchases"), None).await?;
    state.purchase_return_service.get_purchase_return(&id).await
}

#[tauri::command]
pub async fn purchase_return_list(
    state: State<'_, AppState>,
    branch_id: Option<String>,
    limit: Option<i64>,
) -> AppResult<Vec<PurchaseReturnDetailDto>> {
    AuthService::require_permission(&state, Some("purchases"), None).await?;
    state
        .purchase_return_service
        .list_purchase_returns(branch_id.as_deref(), limit)
        .await
}

#[tauri::command]
pub async fn purchase_return_get_by_purchase(
    state: State<'_, AppState>,
    purchase_id: String,
) -> AppResult<Vec<PurchaseReturnDetailDto>> {
    AuthService::require_permission(&state, Some("purchases"), None).await?;
    state
        .purchase_return_service
        .get_purchase_returns_by_purchase(&purchase_id)
        .await
}
