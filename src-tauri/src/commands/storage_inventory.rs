use std::collections::HashMap;
use tauri::State;

use crate::domain::inventory::{
    AdjustStockDto, DecreaseStockDto, IncreaseStockDto, LowStockItemDto, StockMovement,
    TransferStockDto,
};
use crate::errors::{AppError, AppResult};
use crate::state::AppState;

/// Validates IncreaseStockDto structural invariants
fn validate_increase_stock_dto(dto: &IncreaseStockDto) -> AppResult<()> {
    if dto.product_id.trim().is_empty() {
        return Err(AppError::Validation("Product ID cannot be empty".to_string()));
    }
    if dto.branch_id.trim().is_empty() {
        return Err(AppError::Validation("Branch ID cannot be empty".to_string()));
    }
    if dto.quantity <= 0 {
        return Err(AppError::Validation("Quantity must be greater than 0".to_string()));
    }
    Ok(())
}

/// Validates DecreaseStockDto structural invariants
fn validate_decrease_stock_dto(dto: &DecreaseStockDto) -> AppResult<()> {
    if dto.product_id.trim().is_empty() {
        return Err(AppError::Validation("Product ID cannot be empty".to_string()));
    }
    if dto.branch_id.trim().is_empty() {
        return Err(AppError::Validation("Branch ID cannot be empty".to_string()));
    }
    if dto.quantity <= 0 {
        return Err(AppError::Validation("Quantity must be greater than 0".to_string()));
    }
    Ok(())
}

/// Validates AdjustStockDto structural invariants
fn validate_adjust_stock_dto(dto: &AdjustStockDto) -> AppResult<()> {
    if dto.product_id.trim().is_empty() {
        return Err(AppError::Validation("Product ID cannot be empty".to_string()));
    }
    if dto.branch_id.trim().is_empty() {
        return Err(AppError::Validation("Branch ID cannot be empty".to_string()));
    }
    if dto.target_quantity < 0 {
        return Err(AppError::Validation("Target stock quantity cannot be negative".to_string()));
    }
    if dto.reason.trim().is_empty() {
        return Err(AppError::Validation("Reason is required for stock adjustment".to_string()));
    }
    Ok(())
}

/// Validates TransferStockDto structural invariants
fn validate_transfer_stock_dto(dto: &TransferStockDto) -> AppResult<()> {
    if dto.product_id.trim().is_empty() {
        return Err(AppError::Validation("Product ID cannot be empty".to_string()));
    }
    if dto.from_branch_id.trim().is_empty() {
        return Err(AppError::Validation("Source branch ID cannot be empty".to_string()));
    }
    if dto.to_branch_id.trim().is_empty() {
        return Err(AppError::Validation("Destination branch ID cannot be empty".to_string()));
    }
    if dto.from_branch_id == dto.to_branch_id {
        return Err(AppError::Validation("Source and destination branch cannot be the same".to_string()));
    }
    if dto.quantity <= 0 {
        return Err(AppError::Validation("Transfer quantity must be greater than 0".to_string()));
    }
    Ok(())
}

/// Typed storage command: Increases stock for a product at a branch
#[tauri::command]
pub async fn storage_inventory_increase(
    state: State<'_, AppState>,
    dto: IncreaseStockDto,
) -> AppResult<i64> {
    validate_increase_stock_dto(&dto)?;
    state.inventory_service.increase_stock(dto, None).await
}

/// Typed storage command: Decreases stock for a product at a branch
#[tauri::command]
pub async fn storage_inventory_decrease(
    state: State<'_, AppState>,
    dto: DecreaseStockDto,
) -> AppResult<i64> {
    validate_decrease_stock_dto(&dto)?;
    state.inventory_service.decrease_stock(dto, None).await
}

/// Typed storage command: Adjusts stock for a product at a branch to a target quantity
#[tauri::command]
pub async fn storage_inventory_adjust(
    state: State<'_, AppState>,
    dto: AdjustStockDto,
) -> AppResult<i64> {
    validate_adjust_stock_dto(&dto)?;
    state.inventory_service.adjust_stock(dto, None).await
}

/// Typed storage command: Transfers stock from source branch to destination branch
#[tauri::command]
pub async fn storage_inventory_transfer(
    state: State<'_, AppState>,
    dto: TransferStockDto,
) -> AppResult<()> {
    validate_transfer_stock_dto(&dto)?;
    state.inventory_service.transfer_stock(dto, None).await
}

/// Typed storage command: Retrieves stock for a single product at a branch
#[tauri::command]
pub async fn storage_inventory_get_stock(
    state: State<'_, AppState>,
    product_id: String,
    branch_id: String,
) -> AppResult<i64> {
    if product_id.trim().is_empty() || branch_id.trim().is_empty() {
        return Err(AppError::Validation("Product ID and Branch ID cannot be empty".to_string()));
    }
    state.inventory_service.get_stock(&product_id, &branch_id).await
}

/// Typed storage command: Retrieves product stock map for a branch
#[tauri::command]
pub async fn storage_inventory_get_stock_map(
    state: State<'_, AppState>,
    branch_id: String,
) -> AppResult<HashMap<String, i64>> {
    if branch_id.trim().is_empty() {
        return Err(AppError::Validation("Branch ID cannot be empty".to_string()));
    }
    state.inventory_service.get_stock_map(&branch_id).await
}

/// Typed storage command: Lists stock movement history
#[tauri::command]
pub async fn storage_inventory_get_movements(
    state: State<'_, AppState>,
    product_id: Option<String>,
    branch_id: Option<String>,
    limit: Option<u32>,
) -> AppResult<Vec<StockMovement>> {
    state
        .inventory_service
        .list_movements(
            product_id.as_deref(),
            branch_id.as_deref(),
            limit.unwrap_or(50),
        )
        .await
}

/// Typed storage command: Lists low stock items for a branch
#[tauri::command]
pub async fn storage_inventory_get_low_stock(
    state: State<'_, AppState>,
    branch_id: String,
) -> AppResult<Vec<LowStockItemDto>> {
    if branch_id.trim().is_empty() {
        return Err(AppError::Validation("Branch ID cannot be empty".to_string()));
    }
    state.inventory_service.get_low_stock(&branch_id).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::connection::DatabaseConnection;
    use crate::db::migrations::MigrationRunner;
    use crate::domain::catalog::{CreateCategoryDto, CreateUnitDto};
    use crate::domain::product::CreateProductDto;
    use crate::services::{CatalogService, ProductService};

    async fn setup_storage_inventory_test() -> (AppState, String, String, String) {
        let db = DatabaseConnection::open_in_memory().unwrap();
        {
            let conn_arc = db.inner();
            let mut guard = conn_arc.lock().await;
            MigrationRunner::run(&mut guard).unwrap();

            guard
                .execute(
                    "INSERT INTO branches (id, organization_id, name, code, is_active, created_at, updated_at)
                     VALUES ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Branch B', 'BRANCH-B', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
                    [],
                )
                .unwrap();
        }

        let main_branch = "00000000-0000-0000-0000-000000000002".to_string();
        let branch_b = "00000000-0000-0000-0000-000000000003".to_string();

        let cat_service = CatalogService::new(db.clone());
        let cat = cat_service
            .create_category(CreateCategoryDto {
                name: "Batteries".to_string(),
                code: "CAT-BAT".to_string(),
                description: None,
            })
            .await
            .unwrap();

        let unit = cat_service
            .create_unit(CreateUnitDto {
                name: "Piece".to_string(),
                symbol: Some("pcs".to_string()),
                conversion_factor: Some(1),
            })
            .await
            .unwrap();

        let prod_service = ProductService::new(db.clone());
        let prod = prod_service
            .create_product(
                CreateProductDto {
                    name: "5000mAh Power Bank".to_string(),
                    sku: "SKU-PB-5000".to_string(),
                    barcode: Some("9998887776665".to_string()),
                    category_id: cat.id,
                    brand_id: None,
                    unit_id: Some(unit.id),
                    company_id: None,
                    quality_id: None,
                    color_id: None,
                    purchase_price: 2500,
                    average_cost: None,
                    sale_price: 3500,
                    low_stock_threshold: Some(3),
                    description: None,
                    initial_quantity: None,
                    branch_id: None,
                },
                None,
            )
            .await
            .unwrap();

        let state = AppState::new_sqlite("1.2.15", db);
        (state, prod.id, main_branch, branch_b)
    }

    #[tokio::test]
    async fn test_storage_inventory_full_lifecycle() {
        let (state, prod_id, main_branch, branch_b) = setup_storage_inventory_test().await;

        // 1. Initial stock is 0
        let stock_0 = storage_inventory_get_stock_impl(&state, prod_id.clone(), main_branch.clone()).await.unwrap();
        assert_eq!(stock_0, 0);

        // 2. Increase stock +15
        let after_inc = storage_inventory_increase_impl(
            &state,
            IncreaseStockDto {
                product_id: prod_id.clone(),
                branch_id: main_branch.clone(),
                quantity: 15,
                reason: Some("Received shipment".to_string()),
                reference_id: Some("PO-900".to_string()),
            },
        )
        .await
        .unwrap();
        assert_eq!(after_inc, 15);

        // 3. Decrease stock -5 -> 10
        let after_dec = storage_inventory_decrease_impl(
            &state,
            DecreaseStockDto {
                product_id: prod_id.clone(),
                branch_id: main_branch.clone(),
                quantity: 5,
                reason: Some("Sale".to_string()),
                reference_id: Some("INV-900".to_string()),
            },
        )
        .await
        .unwrap();
        assert_eq!(after_dec, 10);

        // 4. Adjust stock to 8
        let after_adj = storage_inventory_adjust_impl(
            &state,
            AdjustStockDto {
                product_id: prod_id.clone(),
                branch_id: main_branch.clone(),
                target_quantity: 8,
                reason: "Audit correction".to_string(),
            },
        )
        .await
        .unwrap();
        assert_eq!(after_adj, 8);

        // 5. Transfer stock: 3 from main to branch_b
        storage_inventory_transfer_impl(
            &state,
            TransferStockDto {
                product_id: prod_id.clone(),
                from_branch_id: main_branch.clone(),
                to_branch_id: branch_b.clone(),
                quantity: 3,
                reason: Some("Rebalance".to_string()),
                reference_id: None,
            },
        )
        .await
        .unwrap();

        let stock_main = storage_inventory_get_stock_impl(&state, prod_id.clone(), main_branch.clone()).await.unwrap();
        let stock_b = storage_inventory_get_stock_impl(&state, prod_id.clone(), branch_b.clone()).await.unwrap();
        assert_eq!(stock_main, 5);
        assert_eq!(stock_b, 3);

        // 6. Stock map query
        let map = storage_inventory_get_stock_map_impl(&state, main_branch.clone()).await.unwrap();
        assert_eq!(map.get(&prod_id), Some(&5));

        // 7. Movements query
        let movements = storage_inventory_get_movements_impl(&state, Some(prod_id.clone()), None, Some(10)).await.unwrap();
        assert!(movements.len() >= 4);
    }
}

async fn storage_inventory_get_stock_impl(state: &AppState, product_id: String, branch_id: String) -> AppResult<i64> {
    state.inventory_service.get_stock(&product_id, &branch_id).await
}

async fn storage_inventory_increase_impl(state: &AppState, dto: IncreaseStockDto) -> AppResult<i64> {
    validate_increase_stock_dto(&dto)?;
    state.inventory_service.increase_stock(dto, None).await
}

async fn storage_inventory_decrease_impl(state: &AppState, dto: DecreaseStockDto) -> AppResult<i64> {
    validate_decrease_stock_dto(&dto)?;
    state.inventory_service.decrease_stock(dto, None).await
}

async fn storage_inventory_adjust_impl(state: &AppState, dto: AdjustStockDto) -> AppResult<i64> {
    validate_adjust_stock_dto(&dto)?;
    state.inventory_service.adjust_stock(dto, None).await
}

async fn storage_inventory_transfer_impl(state: &AppState, dto: TransferStockDto) -> AppResult<()> {
    validate_transfer_stock_dto(&dto)?;
    state.inventory_service.transfer_stock(dto, None).await
}

async fn storage_inventory_get_stock_map_impl(state: &AppState, branch_id: String) -> AppResult<HashMap<String, i64>> {
    state.inventory_service.get_stock_map(&branch_id).await
}

async fn storage_inventory_get_movements_impl(state: &AppState, product_id: Option<String>, branch_id: Option<String>, limit: Option<u32>) -> AppResult<Vec<StockMovement>> {
    state.inventory_service.list_movements(product_id.as_deref(), branch_id.as_deref(), limit.unwrap_or(50)).await
}
