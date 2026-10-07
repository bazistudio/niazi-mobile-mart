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
    AuthService::require_permission(&state, Some("expenses"), Some("expenses:write")).await?;
    state.expense_service.create_category(dto).await
}

#[tauri::command]
pub async fn expense_category_update(
    state: State<'_, AppState>,
    id: String,
    dto: UpdateExpenseCategoryDto,
) -> AppResult<ExpenseCategory> {
    AuthService::require_permission(&state, Some("expenses"), Some("expenses:write")).await?;
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
    mut dto: CreateExpenseDto,
) -> AppResult<Expense> {
    AuthService::require_permission(&state, Some("expenses"), None).await?;
    let authorized_branch = AuthService::require_branch_access(&state, dto.branch_id.as_deref()).await?;
    dto.branch_id = Some(authorized_branch);
    let session = state.get_session().await;
    state.expense_service.create_expense(session.user_id.as_deref(), dto).await
}
#[tauri::command]
pub async fn expense_get_by_id(
    state: State<'_, AppState>,
    id: String,
) -> AppResult<Expense> {
    AuthService::require_permission(&state, Some("expenses"), None).await?;
    let expense = state.expense_service.get_expense_by_id(&id).await?;
    AuthService::require_branch_access(&state, Some(&expense.branch_id)).await?;
    Ok(expense)
}

#[tauri::command]
pub async fn expense_list(
    state: State<'_, AppState>,
    filter: Option<ExpenseFilterDto>,
) -> AppResult<Vec<Expense>> {
    AuthService::require_permission(&state, Some("expenses"), None).await?;
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
    state.expense_service.list_expenses(f).await
}

#[tauri::command]
pub async fn expense_cancel(
    state: State<'_, AppState>,
    id: String,
) -> AppResult<Expense> {
    AuthService::require_permission(&state, Some("expenses"), None).await?;
    let expense = state.expense_service.get_expense_by_id(&id).await?;
    AuthService::require_branch_access(&state, Some(&expense.branch_id)).await?;
    let session = state.get_session().await;
    state.expense_service.cancel_expense(session.user_id.as_deref(), &id).await
}
