use tauri::State;

use crate::domain::supplier::{
    CreateSupplierDto, RecordSupplierPaymentDto, Supplier, SupplierDetailDto, SupplierFilter,
    SupplierLedgerEntry, SupplierPaymentResultDto, SupplierStatementDto, SupplierSummaryDto,
    UpdateSupplierDto,
};
use crate::errors::AppResult;
use crate::services::auth_service::AuthService;
use crate::state::AppState;

#[tauri::command]
pub async fn supplier_create(
    state: State<'_, AppState>,
    dto: CreateSupplierDto,
) -> AppResult<Supplier> {
    AuthService::require_permission(&state, Some("suppliers"), None).await?;
    state.supplier_service.create_supplier(dto).await
}

#[tauri::command]
pub async fn supplier_update(
    state: State<'_, AppState>,
    id: String,
    dto: UpdateSupplierDto,
) -> AppResult<Supplier> {
    AuthService::require_permission(&state, Some("suppliers"), None).await?;
    state.supplier_service.update_supplier(&id, dto).await
}

#[tauri::command]
pub async fn supplier_get_by_id(
    state: State<'_, AppState>,
    id: String,
) -> AppResult<Option<Supplier>> {
    AuthService::require_permission(&state, Some("suppliers"), None).await?;
    state.supplier_service.get_supplier_by_id(&id).await
}

#[tauri::command]
pub async fn supplier_get_detail(
    state: State<'_, AppState>,
    id: String,
) -> AppResult<SupplierDetailDto> {
    AuthService::require_permission(&state, Some("suppliers"), None).await?;
    state.supplier_service.get_detail(&id).await
}

#[tauri::command]
pub async fn supplier_list(
    state: State<'_, AppState>,
    filter: Option<SupplierFilter>,
) -> AppResult<Vec<SupplierSummaryDto>> {
    AuthService::require_permission(&state, Some("suppliers"), None).await?;
    state.supplier_service.list_suppliers(filter).await
}

#[tauri::command]
pub async fn supplier_search(
    state: State<'_, AppState>,
    query: String,
) -> AppResult<Vec<SupplierSummaryDto>> {
    AuthService::require_permission(&state, Some("suppliers"), None).await?;
    state.supplier_service.search_suppliers(&query).await
}

#[tauri::command]
pub async fn supplier_get_ledger(
    state: State<'_, AppState>,
    supplier_id: String,
    limit: Option<i64>,
    offset: Option<i64>,
) -> AppResult<Vec<SupplierLedgerEntry>> {
    AuthService::require_permission(&state, Some("suppliers"), None).await?;
    let repo = crate::repositories::SQLiteSupplierRepository::new(state.db.clone());
    repo.get_ledger_entries(&supplier_id, limit, offset).await
}

#[tauri::command]
pub async fn supplier_get_statement(
    state: State<'_, AppState>,
    supplier_id: String,
) -> AppResult<SupplierStatementDto> {
    AuthService::require_permission(&state, Some("suppliers"), None).await?;
    state.supplier_service.get_statement(&supplier_id).await
}

#[tauri::command]
pub async fn supplier_get_balance(
    state: State<'_, AppState>,
    supplier_id: String,
) -> AppResult<i64> {
    AuthService::require_permission(&state, Some("suppliers"), None).await?;
    state.supplier_service.get_outstanding_balance(&supplier_id).await
}

#[tauri::command]
pub async fn supplier_record_payment(
    state: State<'_, AppState>,
    dto: RecordSupplierPaymentDto,
) -> AppResult<SupplierPaymentResultDto> {
    AuthService::require_permission(&state, Some("suppliers"), None).await?;
    let user_id = { state.session.read().await.user_id.clone() };
    state
        .purchase_service
        .record_supplier_payment(user_id.as_deref(), dto)
        .await
}

#[tauri::command]
pub async fn supplier_deactivate(
    state: State<'_, AppState>,
    id: String,
) -> AppResult<()> {
    AuthService::require_permission(&state, Some("suppliers"), None).await?;
    state.supplier_service.deactivate_supplier(&id).await
}
