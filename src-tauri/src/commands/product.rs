use tauri::State;

use crate::domain::product::{CreateProductDto, Product, ProductFilter, UpdateProductDto};
use crate::errors::AppResult;
use crate::services::auth_service::AuthService;
use crate::state::AppState;

#[tauri::command]
pub async fn product_create(
    state: State<'_, AppState>,
    dto: CreateProductDto,
) -> AppResult<Product> {
    AuthService::require_permission(&state, Some("inventory"), Some("inventory:write")).await?;
    let session = state.get_session().await;
    state
        .product_service
        .create_product(dto, session.user_id.as_deref())
        .await
}

#[tauri::command]
pub async fn product_update(
    state: State<'_, AppState>,
    id: String,
    dto: UpdateProductDto,
) -> AppResult<Product> {
    AuthService::require_permission(&state, Some("inventory"), Some("inventory:write")).await?;
    state.product_service.update_product(&id, dto).await
}

#[tauri::command]
pub async fn product_get(state: State<'_, AppState>, id: String) -> AppResult<Product> {
    AuthService::require_permission(&state, Some("inventory"), Some("inventory:read")).await?;
    state.product_service.get_product(&id).await
}

#[tauri::command]
pub async fn product_get_by_sku(state: State<'_, AppState>, sku: String) -> AppResult<Product> {
    AuthService::require_permission(&state, Some("inventory"), Some("inventory:read")).await?;
    state.product_service.get_product_by_sku(&sku).await
}

#[tauri::command]
pub async fn product_get_by_barcode(
    state: State<'_, AppState>,
    barcode: String,
) -> AppResult<Product> {
    AuthService::require_permission(&state, Some("inventory"), Some("inventory:read")).await?;
    state.product_service.get_product_by_barcode(&barcode).await
}

#[tauri::command]
pub async fn product_list(
    state: State<'_, AppState>,
    filter: Option<ProductFilter>,
) -> AppResult<Vec<Product>> {
    AuthService::require_permission(&state, Some("inventory"), Some("inventory:read")).await?;
    state
        .product_service
        .list_products(filter.unwrap_or_default())
        .await
}

/// Deactivates a product. In accordance with Section 13, physical deletion is prohibited.
#[tauri::command]
pub async fn product_deactivate(state: State<'_, AppState>, id: String) -> AppResult<()> {
    AuthService::require_permission(&state, Some("inventory"), Some("inventory:write")).await?;
    state.product_service.deactivate_product(&id).await
}
