use tauri::State;

use crate::domain::organization::Branch;
use crate::errors::AppResult;
use crate::repositories::OrganizationDashboardStats;
use crate::state::AppState;

/// Returns all branches registered for the organization from SQLite
#[tauri::command]
pub async fn branch_list(state: State<'_, AppState>) -> AppResult<Vec<Branch>> {
    state.branch_repo.list_branches().await
}

/// Returns the canonical permanent Main Branch from SQLite
#[tauri::command]
pub async fn branch_get_main(state: State<'_, AppState>) -> AppResult<Option<Branch>> {
    state.branch_repo.get_main_branch().await
}

/// Returns aggregate dashboard statistics directly from SQLite
#[tauri::command]
pub async fn organization_get_dashboard_stats(
    state: State<'_, AppState>,
) -> AppResult<OrganizationDashboardStats> {
    state.branch_repo.get_dashboard_stats().await
}
