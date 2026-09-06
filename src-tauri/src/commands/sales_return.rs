use tauri::State;

use crate::domain::sales_return::{
    CreateSalesReturnDto, SaleReturnableInfoDto, SalesReturnDetailDto,
};
use crate::errors::AppResult;
use crate::services::auth_service::AuthService;
use crate::state::AppState;

#[tauri::command]
pub async fn sales_return_get_returnable(
    state: State<'_, AppState>,
    sale_id: String,
) -> AppResult<SaleReturnableInfoDto> {
    AuthService::require_permission(&state, Some("sales"), None).await?;
    state.sales_return_service.get_sale_returnable_info(&sale_id).await
}

#[tauri::command]
pub async fn sales_return_create(
    state: State<'_, AppState>,
    dto: CreateSalesReturnDto,
) -> AppResult<SalesReturnDetailDto> {
    AuthService::require_permission(&state, Some("sales"), None).await?;
    let user_id = { state.session.read().await.user_id.clone() };
    state
        .sales_return_service
        .create_sales_return(dto, user_id.as_deref())
        .await
}

#[tauri::command]
pub async fn sales_return_get(
    state: State<'_, AppState>,
    id: String,
) -> AppResult<Option<SalesReturnDetailDto>> {
    AuthService::require_permission(&state, Some("sales"), None).await?;
    state.sales_return_service.get_sales_return(&id).await
}

#[tauri::command]
pub async fn sales_return_list(
    state: State<'_, AppState>,
    branch_id: Option<String>,
    limit: Option<i64>,
) -> AppResult<Vec<SalesReturnDetailDto>> {
    AuthService::require_permission(&state, Some("sales"), None).await?;
    state
        .sales_return_service
        .list_sales_returns(branch_id.as_deref(), limit)
        .await
}

#[tauri::command]
pub async fn sales_return_get_by_sale(
    state: State<'_, AppState>,
    sale_id: String,
) -> AppResult<Vec<SalesReturnDetailDto>> {
    AuthService::require_permission(&state, Some("sales"), None).await?;
    state
        .sales_return_service
        .get_sales_returns_by_sale(&sale_id)
        .await
}
