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
    let info = state.sales_return_service.get_sale_returnable_info(&sale_id).await?;
    AuthService::require_branch_access(&state, Some(&info.branch_id)).await?;
    Ok(info)
}

#[tauri::command]
pub async fn sales_return_create(
    state: State<'_, AppState>,
    dto: CreateSalesReturnDto,
) -> AppResult<SalesReturnDetailDto> {
    AuthService::require_permission(&state, Some("sales"), Some("pos:refund")).await?;
    let info = state.sales_return_service.get_sale_returnable_info(&dto.sale_id).await?;
    AuthService::require_branch_access(&state, Some(&info.branch_id)).await?;
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
    let ret = state.sales_return_service.get_sales_return(&id).await?;
    if let Some(ref r) = ret {
        AuthService::require_branch_access(&state, Some(&r.sales_return.branch_id)).await?;
    }
    Ok(ret)
}

#[tauri::command]
pub async fn sales_return_list(
    state: State<'_, AppState>,
    branch_id: Option<String>,
    limit: Option<i64>,
) -> AppResult<Vec<SalesReturnDetailDto>> {
    AuthService::require_permission(&state, Some("sales"), None).await?;
    let target_branch = if let Some(ref bid) = branch_id {
        Some(AuthService::require_branch_access(&state, Some(bid)).await?)
    } else {
        let authorized_branch = AuthService::require_branch_access(&state, None).await?;
        let session = state.get_session().await;
        let is_org_admin = match session.role {
            Some(crate::domain::user::UserRole::Admin) => true,
            _ => session.access_profile.as_ref().map_or(false, |p| p.allowed_pages.iter().any(|pg| pg == "*")),
        };
        if !is_org_admin {
            Some(authorized_branch)
        } else {
            None
        }
    };
    state
        .sales_return_service
        .list_sales_returns(target_branch.as_deref(), limit)
        .await
}

#[tauri::command]
pub async fn sales_return_get_by_sale(
    state: State<'_, AppState>,
    sale_id: String,
) -> AppResult<Vec<SalesReturnDetailDto>> {
    AuthService::require_permission(&state, Some("sales"), None).await?;
    let info = state.sales_return_service.get_sale_returnable_info(&sale_id).await?;
    AuthService::require_branch_access(&state, Some(&info.branch_id)).await?;
    state
        .sales_return_service
        .get_sales_returns_by_sale(&sale_id)
        .await
}
