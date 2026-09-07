use tauri::State;

use crate::domain::sales::{
    CompleteSaleDto, Sale, SaleFilterDto, SaleLine, SalePayment, SaleResultDto,
};
use crate::errors::AppResult;
use crate::services::auth_service::AuthService;
use crate::state::AppState;

#[tauri::command]
pub async fn sale_complete(
    state: State<'_, AppState>,
    mut dto: CompleteSaleDto,
) -> AppResult<SaleResultDto> {
    AuthService::require_permission(&state, Some("pos"), Some("pos:sale")).await?;
    let authorized_branch = AuthService::require_branch_access(&state, dto.branch_id.as_deref()).await?;
    dto.branch_id = Some(authorized_branch);
    let session = state.get_session().await;
    state
        .sale_service
        .complete_sale(session.user_id.as_deref(), dto)
        .await
}

#[tauri::command]
pub async fn sale_get_by_id(
    state: State<'_, AppState>,
    id: String,
) -> AppResult<Option<Sale>> {
    AuthService::require_permission(&state, Some("pos"), None).await?;
    let sale = state.sale_service.get_sale_by_id(&id).await?;
    if let Some(ref s) = sale {
        AuthService::require_branch_access(&state, Some(&s.branch_id)).await?;
    }
    Ok(sale)
}

#[tauri::command]
pub async fn sale_get_by_invoice(
    state: State<'_, AppState>,
    invoice_number: String,
) -> AppResult<Option<Sale>> {
    AuthService::require_permission(&state, Some("pos"), None).await?;
    let sale = state.sale_service.get_sale_by_invoice(&invoice_number).await?;
    if let Some(ref s) = sale {
        AuthService::require_branch_access(&state, Some(&s.branch_id)).await?;
    }
    Ok(sale)
}

#[tauri::command]
pub async fn sale_list(
    state: State<'_, AppState>,
    filter: Option<SaleFilterDto>,
) -> AppResult<Vec<Sale>> {
    AuthService::require_permission(&state, Some("pos"), None).await?;
    let mut f = filter.unwrap_or_default();
    if let Some(ref bid) = f.branch_id {
        AuthService::require_branch_access(&state, Some(bid)).await?;
    } else {
        let authorized_branch = AuthService::require_branch_access(&state, None).await?;
        // For non-org admins, restrict query to authorized branch
        let session = state.get_session().await;
        let is_org_admin = match session.role {
            Some(crate::domain::user::UserRole::Admin) => true,
            _ => session.access_profile.as_ref().map_or(false, |p| p.allowed_pages.iter().any(|pg| pg == "*")),
        };
        if !is_org_admin {
            f.branch_id = Some(authorized_branch);
        }
    }
    state
        .sale_service
        .list_sales(f)
        .await
}

#[tauri::command]
pub async fn sale_get_lines(
    state: State<'_, AppState>,
    sale_id: String,
) -> AppResult<Vec<SaleLine>> {
    AuthService::require_permission(&state, Some("pos"), None).await?;
    let sale = state.sale_service.get_sale_by_id(&sale_id).await?;
    if let Some(ref s) = sale {
        AuthService::require_branch_access(&state, Some(&s.branch_id)).await?;
    }
    state.sale_service.get_sale_lines(&sale_id).await
}

#[tauri::command]
pub async fn sale_get_payments(
    state: State<'_, AppState>,
    sale_id: String,
) -> AppResult<Vec<SalePayment>> {
    AuthService::require_permission(&state, Some("pos"), None).await?;
    let sale = state.sale_service.get_sale_by_id(&sale_id).await?;
    if let Some(ref s) = sale {
        AuthService::require_branch_access(&state, Some(&s.branch_id)).await?;
    }
    state.sale_service.get_sale_payments(&sale_id).await
}
