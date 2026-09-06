use tauri::State;

use crate::domain::customer::{
    CreateCustomerDto, Customer, CustomerDetailDto, CustomerFilter, CustomerLedgerEntry,
    CustomerPaymentResultDto, CustomerStatementDto, CustomerSummaryDto, RecordCustomerPaymentDto,
    UpdateCustomerDto,
};
use crate::errors::AppResult;
use crate::services::auth_service::AuthService;
use crate::state::AppState;

#[tauri::command]
pub async fn customer_create(
    state: State<'_, AppState>,
    dto: CreateCustomerDto,
) -> AppResult<Customer> {
    AuthService::require_permission(&state, Some("customers"), None).await?;
    state.customer_service.create_customer(dto).await
}

#[tauri::command]
pub async fn customer_update(
    state: State<'_, AppState>,
    id: String,
    dto: UpdateCustomerDto,
) -> AppResult<Customer> {
    AuthService::require_permission(&state, Some("customers"), None).await?;
    state.customer_service.update_customer(&id, dto).await
}

#[tauri::command]
pub async fn customer_get_by_id(
    state: State<'_, AppState>,
    id: String,
) -> AppResult<Customer> {
    AuthService::require_permission(&state, Some("customers"), None).await?;
    state.customer_service.get_customer_by_id(&id).await
}

#[tauri::command]
pub async fn customer_get_detail(
    state: State<'_, AppState>,
    id: String,
) -> AppResult<CustomerDetailDto> {
    AuthService::require_permission(&state, Some("customers"), None).await?;
    state.customer_service.get_customer_detail(&id).await
}

#[tauri::command]
pub async fn customer_list(
    state: State<'_, AppState>,
    filter: Option<CustomerFilter>,
) -> AppResult<Vec<CustomerSummaryDto>> {
    AuthService::require_permission(&state, Some("customers"), None).await?;
    state
        .customer_service
        .list_customers(filter.unwrap_or_default())
        .await
}

#[tauri::command]
pub async fn customer_search(
    state: State<'_, AppState>,
    query: String,
) -> AppResult<Vec<CustomerSummaryDto>> {
    AuthService::require_permission(&state, Some("customers"), None).await?;
    state.customer_service.search_customers(&query).await
}

#[tauri::command]
pub async fn customer_get_ledger(
    state: State<'_, AppState>,
    customer_id: String,
    limit: Option<i64>,
    offset: Option<i64>,
) -> AppResult<Vec<CustomerLedgerEntry>> {
    AuthService::require_permission(&state, Some("customers"), None).await?;
    state
        .customer_service
        .get_ledger(&customer_id, limit, offset)
        .await
}

#[tauri::command]
pub async fn customer_get_statement(
    state: State<'_, AppState>,
    customer_id: String,
) -> AppResult<CustomerStatementDto> {
    AuthService::require_permission(&state, Some("customers"), None).await?;
    state.customer_service.get_statement(&customer_id).await
}

#[tauri::command]
pub async fn customer_get_balance(
    state: State<'_, AppState>,
    customer_id: String,
) -> AppResult<i64> {
    AuthService::require_permission(&state, Some("customers"), None).await?;
    state.customer_service.get_balance(&customer_id).await
}

#[tauri::command]
pub async fn customer_record_payment(
    state: State<'_, AppState>,
    dto: RecordCustomerPaymentDto,
) -> AppResult<CustomerPaymentResultDto> {
    AuthService::require_permission(&state, Some("customers"), None).await?;
    let session = state.get_session().await;
    state
        .customer_service
        .record_payment(session.user_id.as_deref(), dto)
        .await
}

#[tauri::command]
pub async fn customer_deactivate(
    state: State<'_, AppState>,
    id: String,
) -> AppResult<()> {
    AuthService::require_permission(&state, Some("customers"), None).await?;
    state.customer_service.deactivate_customer(&id).await
}
