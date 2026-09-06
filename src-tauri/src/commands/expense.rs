use tauri::State;

use crate::domain::expense::{
    CreateExpenseCategoryDto, CreateExpenseDto, Expense, ExpenseCategory, ExpenseFilterDto,
    UpdateExpenseCategoryDto,
};
use crate::errors::AppResult;
use crate::services::auth_service::AuthService;
use crate::state::AppState;

#[tauri::command]
pub async fn expense_category_create(
    state: State<'_, AppState>,
    dto: CreateExpenseCategoryDto,
) -> AppResult<ExpenseCategory> {
    AuthService::require_permission(&state, Some("expenses"), None).await?;
    state.expense_service.create_category(dto).await
}

#[tauri::command]
pub async fn expense_category_update(
    state: State<'_, AppState>,
    id: String,
    dto: UpdateExpenseCategoryDto,
) -> AppResult<ExpenseCategory> {
    AuthService::require_permission(&state, Some("expenses"), None).await?;
    state.expense_service.update_category(&id, dto).await
}

#[tauri::command]
pub async fn expense_category_list(
    state: State<'_, AppState>,
    active_only: Option<bool>,
) -> AppResult<Vec<ExpenseCategory>> {
    AuthService::require_permission(&state, Some("expenses"), None).await?;
    state.expense_service.list_categories(active_only.unwrap_or(false)).await
}

#[tauri::command]
pub async fn expense_create(
    state: State<'_, AppState>,
    dto: CreateExpenseDto,
) -> AppResult<Expense> {
    AuthService::require_permission(&state, Some("expenses"), None).await?;
    let session = state.get_session().await;
    state.expense_service.create_expense(session.user_id.as_deref(), dto).await
}

#[tauri::command]
pub async fn expense_get_by_id(
    state: State<'_, AppState>,
    id: String,
) -> AppResult<Expense> {
    AuthService::require_permission(&state, Some("expenses"), None).await?;
    state.expense_service.get_expense_by_id(&id).await
}

#[tauri::command]
pub async fn expense_list(
    state: State<'_, AppState>,
    filter: Option<ExpenseFilterDto>,
) -> AppResult<Vec<Expense>> {
    AuthService::require_permission(&state, Some("expenses"), None).await?;
    state.expense_service.list_expenses(filter.unwrap_or_default()).await
}

#[tauri::command]
pub async fn expense_cancel(
    state: State<'_, AppState>,
    id: String,
) -> AppResult<Expense> {
    AuthService::require_permission(&state, Some("expenses"), None).await?;
    let session = state.get_session().await;
    state.expense_service.cancel_expense(session.user_id.as_deref(), &id).await
}
