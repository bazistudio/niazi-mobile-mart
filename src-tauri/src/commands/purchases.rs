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
    mut dto: CompletePurchaseDto,
) -> AppResult<PurchaseResultDto> {
    AuthService::require_permission(&state, Some("purchases"), None).await?;
    let authorized_branch = AuthService::require_branch_access(&state, dto.branch_id.as_deref()).await?;
    dto.branch_id = Some(authorized_branch);
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
    let purchase = state.purchase_service.get_purchase_by_id(&id).await?;
    if let Some(ref p) = purchase {
        AuthService::require_branch_access(&state, Some(&p.branch_id)).await?;
    }
    Ok(purchase)
}

#[tauri::command]
pub async fn purchase_get_by_number(
    state: State<'_, AppState>,
    purchase_number: String,
) -> AppResult<Option<Purchase>> {
    AuthService::require_permission(&state, Some("purchases"), None).await?;
    let purchase = state.purchase_service.get_purchase_by_number(&purchase_number).await?;
    if let Some(ref p) = purchase {
        AuthService::require_branch_access(&state, Some(&p.branch_id)).await?;
    }
    Ok(purchase)
}

#[tauri::command]
pub async fn purchase_list(
    state: State<'_, AppState>,
    filter: Option<PurchaseFilterDto>,
) -> AppResult<Vec<Purchase>> {
    AuthService::require_permission(&state, Some("purchases"), None).await?;
    let mut f = filter.unwrap_or_default();
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
    state.purchase_service.list_purchases(Some(f)).await
}

#[tauri::command]
pub async fn purchase_get_lines(
    state: State<'_, AppState>,
    purchase_id: String,
) -> AppResult<Vec<PurchaseLine>> {
    AuthService::require_permission(&state, Some("purchases"), None).await?;
    let purchase = state.purchase_service.get_purchase_by_id(&purchase_id).await?;
    if let Some(ref p) = purchase {
        AuthService::require_branch_access(&state, Some(&p.branch_id)).await?;
    }
    state.purchase_service.get_purchase_lines(&purchase_id).await
}
