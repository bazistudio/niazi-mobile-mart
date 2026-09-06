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
    dto: CompleteSaleDto,
) -> AppResult<SaleResultDto> {
    AuthService::require_permission(&state, Some("pos"), Some("pos:sale")).await?;
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
    state.sale_service.get_sale_by_id(&id).await
}

#[tauri::command]
pub async fn sale_get_by_invoice(
    state: State<'_, AppState>,
    invoice_number: String,
) -> AppResult<Option<Sale>> {
    AuthService::require_permission(&state, Some("pos"), None).await?;
    state.sale_service.get_sale_by_invoice(&invoice_number).await
}

#[tauri::command]
pub async fn sale_list(
    state: State<'_, AppState>,
    filter: Option<SaleFilterDto>,
) -> AppResult<Vec<Sale>> {
    AuthService::require_permission(&state, Some("pos"), None).await?;
    state
        .sale_service
        .list_sales(filter.unwrap_or_default())
        .await
}

#[tauri::command]
pub async fn sale_get_lines(
    state: State<'_, AppState>,
    sale_id: String,
) -> AppResult<Vec<SaleLine>> {
    AuthService::require_permission(&state, Some("pos"), None).await?;
    state.sale_service.get_sale_lines(&sale_id).await
}

#[tauri::command]
pub async fn sale_get_payments(
    state: State<'_, AppState>,
    sale_id: String,
) -> AppResult<Vec<SalePayment>> {
    AuthService::require_permission(&state, Some("pos"), None).await?;
    state.sale_service.get_sale_payments(&sale_id).await
}
