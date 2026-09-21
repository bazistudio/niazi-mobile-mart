use tauri::State;

use crate::domain::catalog::{
    Brand, Category, Color, Company, CreateBrandDto, CreateCategoryDto, CreateColorDto,
    CreateCompanyDto, CreateQualityDto, CreateUnitDto, Quality, Unit, UpdateBrandDto,
    UpdateCategoryDto, UpdateColorDto, UpdateCompanyDto, UpdateQualityDto, UpdateUnitDto,
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

#[tauri::command]
pub async fn company_create(
    state: State<'_, AppState>,
    dto: CreateCompanyDto,
) -> AppResult<Company> {
    AuthService::require_permission(&state, Some("inventory"), Some("inventory:write")).await?;
    state.catalog_service.create_company(dto).await
}

#[tauri::command]
pub async fn company_get(state: State<'_, AppState>, id: String) -> AppResult<Company> {
    AuthService::require_permission(&state, Some("inventory"), Some("inventory:read")).await?;
    state.catalog_service.get_company(&id).await
}

#[tauri::command]
pub async fn company_list(state: State<'_, AppState>) -> AppResult<Vec<Company>> {
    AuthService::require_permission(&state, Some("inventory"), Some("inventory:read")).await?;
    state.catalog_service.list_companies().await
}

#[tauri::command]
pub async fn company_update(
    state: State<'_, AppState>,
    id: String,
    dto: UpdateCompanyDto,
) -> AppResult<Company> {
    AuthService::require_permission(&state, Some("inventory"), Some("inventory:write")).await?;
    state.catalog_service.update_company(&id, dto).await
}

#[tauri::command]
pub async fn quality_create(
    state: State<'_, AppState>,
    dto: CreateQualityDto,
) -> AppResult<Quality> {
    AuthService::require_permission(&state, Some("inventory"), Some("inventory:write")).await?;
    state.catalog_service.create_quality(dto).await
}

#[tauri::command]
pub async fn quality_get(state: State<'_, AppState>, id: String) -> AppResult<Quality> {
    AuthService::require_permission(&state, Some("inventory"), Some("inventory:read")).await?;
    state.catalog_service.get_quality(&id).await
}

#[tauri::command]
pub async fn quality_list(state: State<'_, AppState>) -> AppResult<Vec<Quality>> {
    AuthService::require_permission(&state, Some("inventory"), Some("inventory:read")).await?;
    state.catalog_service.list_qualities().await
}

#[tauri::command]
pub async fn quality_update(
    state: State<'_, AppState>,
    id: String,
    dto: UpdateQualityDto,
) -> AppResult<Quality> {
    AuthService::require_permission(&state, Some("inventory"), Some("inventory:write")).await?;
    state.catalog_service.update_quality(&id, dto).await
}

#[tauri::command]
pub async fn color_create(state: State<'_, AppState>, dto: CreateColorDto) -> AppResult<Color> {
    AuthService::require_permission(&state, Some("inventory"), Some("inventory:write")).await?;
    state.catalog_service.create_color(dto).await
}

#[tauri::command]
pub async fn color_get(state: State<'_, AppState>, id: String) -> AppResult<Color> {
    AuthService::require_permission(&state, Some("inventory"), Some("inventory:read")).await?;
    state.catalog_service.get_color(&id).await
}

#[tauri::command]
pub async fn color_list(state: State<'_, AppState>) -> AppResult<Vec<Color>> {
    AuthService::require_permission(&state, Some("inventory"), Some("inventory:read")).await?;
    state.catalog_service.list_colors().await
}

#[tauri::command]
pub async fn color_update(
    state: State<'_, AppState>,
    id: String,
    dto: UpdateColorDto,
) -> AppResult<Color> {
    AuthService::require_permission(&state, Some("inventory"), Some("inventory:write")).await?;
    state.catalog_service.update_color(&id, dto).await
}
