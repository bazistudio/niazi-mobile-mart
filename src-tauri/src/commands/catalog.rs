use tauri::State;

use crate::domain::catalog::{
    Brand, Category, CreateBrandDto, CreateCategoryDto, CreateUnitDto, Unit, UpdateBrandDto,
    UpdateCategoryDto, UpdateUnitDto,
};
use crate::errors::AppResult;
use crate::services::auth_service::AuthService;
use crate::state::AppState;

#[tauri::command]
pub async fn category_create(
    state: State<'_, AppState>,
    dto: CreateCategoryDto,
) -> AppResult<Category> {
    AuthService::require_permission(&state, Some("inventory"), Some("inventory:write")).await?;
    state.catalog_service.create_category(dto).await
}

#[tauri::command]
pub async fn category_get(state: State<'_, AppState>, id: String) -> AppResult<Category> {
    AuthService::require_permission(&state, Some("inventory"), Some("inventory:read")).await?;
    state.catalog_service.get_category(&id).await
}

#[tauri::command]
pub async fn category_list(state: State<'_, AppState>) -> AppResult<Vec<Category>> {
    AuthService::require_permission(&state, Some("inventory"), Some("inventory:read")).await?;
    state.catalog_service.list_categories().await
}

#[tauri::command]
pub async fn category_update(
    state: State<'_, AppState>,
    id: String,
    dto: UpdateCategoryDto,
) -> AppResult<Category> {
    AuthService::require_permission(&state, Some("inventory"), Some("inventory:write")).await?;
    state.catalog_service.update_category(&id, dto).await
}

#[tauri::command]
pub async fn brand_create(state: State<'_, AppState>, dto: CreateBrandDto) -> AppResult<Brand> {
    AuthService::require_permission(&state, Some("inventory"), Some("inventory:write")).await?;
    state.catalog_service.create_brand(dto).await
}

#[tauri::command]
pub async fn brand_get(state: State<'_, AppState>, id: String) -> AppResult<Brand> {
    AuthService::require_permission(&state, Some("inventory"), Some("inventory:read")).await?;
    state.catalog_service.get_brand(&id).await
}

#[tauri::command]
pub async fn brand_list(state: State<'_, AppState>) -> AppResult<Vec<Brand>> {
    AuthService::require_permission(&state, Some("inventory"), Some("inventory:read")).await?;
    state.catalog_service.list_brands().await
}

#[tauri::command]
pub async fn brand_update(
    state: State<'_, AppState>,
    id: String,
    dto: UpdateBrandDto,
) -> AppResult<Brand> {
    AuthService::require_permission(&state, Some("inventory"), Some("inventory:write")).await?;
    state.catalog_service.update_brand(&id, dto).await
}

#[tauri::command]
pub async fn unit_create(state: State<'_, AppState>, dto: CreateUnitDto) -> AppResult<Unit> {
    AuthService::require_permission(&state, Some("inventory"), Some("inventory:write")).await?;
    state.catalog_service.create_unit(dto).await
}

#[tauri::command]
pub async fn unit_get(state: State<'_, AppState>, id: String) -> AppResult<Unit> {
    AuthService::require_permission(&state, Some("inventory"), Some("inventory:read")).await?;
    state.catalog_service.get_unit(&id).await
}

#[tauri::command]
pub async fn unit_list(state: State<'_, AppState>) -> AppResult<Vec<Unit>> {
    AuthService::require_permission(&state, Some("inventory"), Some("inventory:read")).await?;
    state.catalog_service.list_units().await
}

#[tauri::command]
pub async fn unit_update(
    state: State<'_, AppState>,
    id: String,
    dto: UpdateUnitDto,
) -> AppResult<Unit> {
    AuthService::require_permission(&state, Some("inventory"), Some("inventory:write")).await?;
    state.catalog_service.update_unit(&id, dto).await
}
