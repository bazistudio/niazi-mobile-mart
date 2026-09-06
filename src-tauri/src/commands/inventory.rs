use tauri::State;

use crate::domain::inventory::{
    AdjustStockDto, DecreaseStockDto, IncreaseStockDto, LowStockItemDto, StockMovement,
    TransferStockDto,
};
use crate::errors::AppResult;
use crate::services::auth_service::AuthService;
use crate::state::AppState;

#[tauri::command]
pub async fn inventory_increase(
    state: State<'_, AppState>,
    dto: IncreaseStockDto,
) -> AppResult<i64> {
    AuthService::require_permission(&state, Some("inventory"), Some("inventory:write")).await?;
    let session = state.get_session().await;
    state
        .inventory_service
        .increase_stock(dto, session.user_id.as_deref())
        .await
}

#[tauri::command]
pub async fn inventory_decrease(
    state: State<'_, AppState>,
    dto: DecreaseStockDto,
) -> AppResult<i64> {
    AuthService::require_permission(&state, Some("inventory"), Some("inventory:write")).await?;
    let session = state.get_session().await;
    state
        .inventory_service
        .decrease_stock(dto, session.user_id.as_deref())
        .await
}

#[tauri::command]
pub async fn inventory_adjust(state: State<'_, AppState>, dto: AdjustStockDto) -> AppResult<i64> {
    AuthService::require_permission(&state, Some("inventory"), Some("inventory:adjust")).await?;
    let session = state.get_session().await;
    state
        .inventory_service
        .adjust_stock(dto, session.user_id.as_deref())
        .await
}

#[tauri::command]
pub async fn inventory_transfer(
    state: State<'_, AppState>,
    dto: TransferStockDto,
) -> AppResult<()> {
    AuthService::require_permission(&state, Some("inventory"), Some("inventory:transfer")).await?;
    let session = state.get_session().await;
    state
        .inventory_service
        .transfer_stock(dto, session.user_id.as_deref())
        .await
}

#[tauri::command]
pub async fn inventory_get_stock(
    state: State<'_, AppState>,
    product_id: String,
    branch_id: String,
) -> AppResult<i64> {
    AuthService::require_permission(&state, Some("inventory"), Some("inventory:read")).await?;
    state.inventory_service.get_stock(&product_id, &branch_id).await
}

#[tauri::command]
pub async fn inventory_get_movements(
    state: State<'_, AppState>,
    product_id: Option<String>,
    branch_id: Option<String>,
    limit: Option<u32>,
) -> AppResult<Vec<StockMovement>> {
    AuthService::require_permission(&state, Some("inventory"), Some("inventory:read")).await?;
    state
        .inventory_service
        .list_movements(product_id.as_deref(), branch_id.as_deref(), limit.unwrap_or(50))
        .await
}

#[tauri::command]
pub async fn inventory_get_low_stock(
    state: State<'_, AppState>,
    branch_id: String,
) -> AppResult<Vec<LowStockItemDto>> {
    AuthService::require_permission(&state, Some("inventory"), Some("inventory:read")).await?;
    state.inventory_service.get_low_stock(&branch_id).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::connection::DatabaseConnection;
    use crate::db::migrations::MigrationRunner;
    use crate::domain::access_control::StaffAccessProfile;
    use crate::domain::user::{User, UserRole};

    async fn setup_state_with_user(role: UserRole, access: StaffAccessProfile) -> AppState {
        let db = DatabaseConnection::open_in_memory().unwrap();
        {
            let conn_arc = db.inner();
            let mut guard = conn_arc.lock().await;
            MigrationRunner::run(&mut guard).unwrap();
        }

        let state = AppState::new("5.0.3", db);
        let user = User {
            id: "11111111-1111-1111-1111-111111111111".to_string(),
            name: "Test User".to_string(),
            username: "testuser".to_string(),
            login_key_hash: "hash".to_string(),
            pin_hash: None,
            role,
            is_active: true,
            failed_pin_attempts: 0,
            pin_locked_until_ms: None,
            failed_login_attempts: 0,
            login_locked_until_ms: None,
            access_profile: access,
            created_at: "2026-01-01T00:00:00Z".to_string(),
            updated_at: "2026-01-01T00:00:00Z".to_string(),
        };
        state.set_authenticated(&user).await;
        state
    }

    #[tokio::test]
    async fn test_unauthenticated_inventory_access_denied() {
        let db = DatabaseConnection::open_in_memory().unwrap();
        let state = AppState::new("5.0.3", db);

        let perm = AuthService::require_permission(&state, Some("inventory"), Some("inventory:read")).await;
        assert!(perm.is_err());
        assert!(matches!(perm.unwrap_err(), crate::errors::AppError::Unauthorized(_)));
    }

    #[tokio::test]
    async fn test_public_user_inventory_access_forbidden() {
        let state = setup_state_with_user(UserRole::PublicUser, StaffAccessProfile::public_user_restricted()).await;

        let perm = AuthService::require_permission(&state, Some("inventory"), Some("inventory:read")).await;
        assert!(perm.is_err());
        assert!(matches!(perm.unwrap_err(), crate::errors::AppError::Forbidden(_)));

        let perm_adj = AuthService::require_permission(&state, Some("inventory"), Some("inventory:adjust")).await;
        assert!(perm_adj.is_err());
        assert!(matches!(perm_adj.unwrap_err(), crate::errors::AppError::Forbidden(_)));
    }

    #[tokio::test]
    async fn test_admin_inventory_access_allowed() {
        let state = setup_state_with_user(UserRole::Admin, StaffAccessProfile::admin_unlimited()).await;

        let perm = AuthService::require_permission(&state, Some("inventory"), Some("inventory:read")).await;
        assert!(perm.is_ok());

        let perm_adj = AuthService::require_permission(&state, Some("inventory"), Some("inventory:adjust")).await;
        assert!(perm_adj.is_ok());
    }
}
