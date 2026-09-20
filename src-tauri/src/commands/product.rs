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
    tracing::info!(
        "[product_create] Received request to create product: name='{}', sku='{}', purchase_price={}, sale_price={}, initial_quantity={:?}, branch_id={:?}",
        dto.name,
        dto.sku,
        dto.purchase_price,
        dto.sale_price,
        dto.initial_quantity,
        dto.branch_id
    );

    if dto.name.trim().is_empty() {
        tracing::error!("[product_create] Validation Error: Product name is empty");
        return Err(crate::errors::AppError::Validation("Product name cannot be empty".to_string()));
    }
    if dto.sku.trim().is_empty() {
        tracing::error!("[product_create] Validation Error: Product SKU is empty");
        return Err(crate::errors::AppError::Validation("Product SKU cannot be empty".to_string()));
    }
    if dto.purchase_price < 0 {
        tracing::error!("[product_create] Validation Error: Purchase price is negative ({})", dto.purchase_price);
        return Err(crate::errors::AppError::Validation("Purchase price cannot be negative".to_string()));
    }
    if dto.sale_price < 0 {
        tracing::error!("[product_create] Validation Error: Sale price is negative ({})", dto.sale_price);
        return Err(crate::errors::AppError::Validation("Sale price cannot be negative".to_string()));
    }

    if let Err(auth_err) = AuthService::require_permission(&state, Some("inventory"), Some("inventory:write")).await {
        let session = state.get_session().await;
        tracing::error!(
            "[product_create] Permission check failed for user_id={:?}, role={:?}: {:?}",
            session.user_id,
            session.role,
            auth_err
        );
        return Err(auth_err);
    }

    let session = state.get_session().await;
    tracing::info!(
        "[product_create] Initiating product database transaction for user_id={:?}",
        session.user_id
    );

    let result = state
        .product_service
        .create_product(dto, session.user_id.as_deref())
        .await;

    match &result {
        Ok(prod) => {
            tracing::info!(
                "[product_create] Product successfully created and persisted: id='{}', name='{}', sku='{}'",
                prod.id,
                prod.name,
                prod.sku
            );
        }
        Err(err) => {
            tracing::error!(
                "[product_create] Database / Service execution failed: {:?}",
                err
            );
        }
    }

    result
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
