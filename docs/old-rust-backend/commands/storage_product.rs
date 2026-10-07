use tauri::State;
use uuid::Uuid;

use crate::db::errors::DbError;
use crate::domain::product::{CreateProductDto, Product, ProductFilter, UpdateProductDto};
use crate::errors::{AppError, AppResult};
use crate::repositories::SQLiteProductRepository;
use crate::state::AppState;

/// Validates structural invariants for CreateProductDto
fn validate_create_product_dto(dto: &CreateProductDto) -> AppResult<()> {
    if dto.name.trim().is_empty() {
        return Err(AppError::Validation(
            "Product name cannot be empty".to_string(),
        ));
    }
    if dto.purchase_price < 0 {
        return Err(AppError::Validation(
            "Purchase price cannot be negative".to_string(),
        ));
    }
    if dto.sale_price < 0 {
        return Err(AppError::Validation(
            "Sale price cannot be negative".to_string(),
        ));
    }
    Ok(())
}

/// Validates structural invariants for UpdateProductDto
fn validate_update_product_dto(dto: &UpdateProductDto) -> AppResult<()> {
    if let Some(ref name) = dto.name {
        if name.trim().is_empty() {
            return Err(AppError::Validation(
                "Product name cannot be empty".to_string(),
            ));
        }
    }
    if let Some(price) = dto.purchase_price {
        if price < 0 {
            return Err(AppError::Validation(
                "Purchase price cannot be negative".to_string(),
            ));
        }
    }
    if let Some(price) = dto.sale_price {
        if price < 0 {
            return Err(AppError::Validation(
                "Sale price cannot be negative".to_string(),
            ));
        }
    }
    Ok(())
}

pub async fn storage_product_create_impl(
    state: &AppState,
    dto: CreateProductDto,
) -> AppResult<Product> {
    validate_create_product_dto(&dto)?;
    let session = state.get_session().await;
    state
        .product_service
        .create_product(dto, session.user_id.as_deref())
        .await
}

/// Typed storage command: Creates a new product directly in SQLite storage (off-thread via call_blocking)
#[tauri::command]
pub async fn storage_product_create(
    state: State<'_, AppState>,
    dto: CreateProductDto,
) -> AppResult<Product> {
    storage_product_create_impl(&state, dto).await
}

pub async fn storage_product_update_impl(
    state: &AppState,
    id: String,
    dto: UpdateProductDto,
) -> AppResult<Product> {
    if id.trim().is_empty() {
        return Err(AppError::Validation(
            "Product ID cannot be empty".to_string(),
        ));
    }
    validate_update_product_dto(&dto)?;
    state.product_service.update_product(&id, dto).await
}

/// Typed storage command: Updates an existing product record in SQLite storage
#[tauri::command]
pub async fn storage_product_update(
    state: State<'_, AppState>,
    id: String,
    dto: UpdateProductDto,
) -> AppResult<Product> {
    storage_product_update_impl(&state, id, dto).await
}

pub async fn storage_product_get_impl(
    state: &AppState,
    id: String,
) -> AppResult<Product> {
    if id.trim().is_empty() {
        return Err(AppError::Validation(
            "Product ID cannot be empty".to_string(),
        ));
    }

    let db = state
        .db
        .as_ref()
        .ok_or_else(|| AppError::Internal("Database connection unavailable".to_string()))?
        .clone();

    db.call_blocking(move |conn| {
        SQLiteProductRepository::get_product_by_id_in_tx(conn, &id)
    })
    .await
    .map_err(AppError::from)
}

/// Typed storage command: Retrieves a single product by ID from SQLite storage
#[tauri::command]
pub async fn storage_product_get(
    state: State<'_, AppState>,
    id: String,
) -> AppResult<Product> {
    storage_product_get_impl(&state, id).await
}

pub async fn storage_product_get_by_sku_impl(
    state: &AppState,
    sku: String,
) -> AppResult<Product> {
    let clean_sku = sku.trim().to_uppercase();
    if clean_sku.is_empty() {
        return Err(AppError::Validation(
            "Product SKU cannot be empty".to_string(),
        ));
    }

    let db = state
        .db
        .as_ref()
        .ok_or_else(|| AppError::Internal("Database connection unavailable".to_string()))?
        .clone();

    db.call_blocking(move |conn| {
        use rusqlite::params;
        conn.query_row(
            "SELECT id, name, normalized_name, sku, barcode, category_id, brand_id, company_id, quality_id, color_id, unit_id, purchase_price, average_cost, sale_price, low_stock_threshold, is_active, description, created_at, updated_at
             FROM products WHERE sku = ?1",
            params![clean_sku],
            |row| {
                Ok(Product {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    normalized_name: row.get(2)?,
                    sku: row.get(3)?,
                    barcode: row.get(4)?,
                    category_id: row.get(5)?,
                    brand_id: row.get(6)?,
                    company_id: row.get(7)?,
                    quality_id: row.get(8)?,
                    color_id: row.get(9)?,
                    unit_id: row.get(10)?,
                    purchase_price: row.get(11)?,
                    average_cost: row.get(12)?,
                    sale_price: row.get(13)?,
                    low_stock_threshold: row.get(14)?,
                    is_active: row.get::<_, i64>(15)? == 1,
                    description: row.get(16)?,
                    initial_quantity: None,
                    created_at: row.get(17)?,
                    updated_at: row.get(18)?,
                })
            },
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => {
                DbError::NotFound(format!("Product with SKU '{clean_sku}' not found"))
            }
            err => DbError::from(err),
        })
    })
    .await
    .map_err(AppError::from)
}

/// Typed storage command: Retrieves a single product by SKU from SQLite storage
#[tauri::command]
pub async fn storage_product_get_by_sku(
    state: State<'_, AppState>,
    sku: String,
) -> AppResult<Product> {
    storage_product_get_by_sku_impl(&state, sku).await
}

pub async fn storage_product_get_by_barcode_impl(
    state: &AppState,
    barcode: String,
) -> AppResult<Product> {
    let clean_bc = barcode.trim().to_string();
    if clean_bc.is_empty() {
        return Err(AppError::Validation(
            "Product Barcode cannot be empty".to_string(),
        ));
    }

    let db = state
        .db
        .as_ref()
        .ok_or_else(|| AppError::Internal("Database connection unavailable".to_string()))?
        .clone();

    db.call_blocking(move |conn| {
        use rusqlite::params;
        conn.query_row(
            "SELECT id, name, normalized_name, sku, barcode, category_id, brand_id, company_id, quality_id, color_id, unit_id, purchase_price, average_cost, sale_price, low_stock_threshold, is_active, description, created_at, updated_at
             FROM products WHERE barcode = ?1",
            params![clean_bc],
            |row| {
                Ok(Product {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    normalized_name: row.get(2)?,
                    sku: row.get(3)?,
                    barcode: row.get(4)?,
                    category_id: row.get(5)?,
                    brand_id: row.get(6)?,
                    company_id: row.get(7)?,
                    quality_id: row.get(8)?,
                    color_id: row.get(9)?,
                    unit_id: row.get(10)?,
                    purchase_price: row.get(11)?,
                    average_cost: row.get(12)?,
                    sale_price: row.get(13)?,
                    low_stock_threshold: row.get(14)?,
                    is_active: row.get::<_, i64>(15)? == 1,
                    description: row.get(16)?,
                    initial_quantity: None,
                    created_at: row.get(17)?,
                    updated_at: row.get(18)?,
                })
            },
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => {
                DbError::NotFound(format!("Product with Barcode '{clean_bc}' not found"))
            }
            err => DbError::from(err),
        })
    })
    .await
    .map_err(AppError::from)
}

/// Typed storage command: Retrieves a single product by Barcode from SQLite storage
#[tauri::command]
pub async fn storage_product_get_by_barcode(
    state: State<'_, AppState>,
    barcode: String,
) -> AppResult<Product> {
    storage_product_get_by_barcode_impl(&state, barcode).await
}

pub async fn storage_product_list_impl(
    state: &AppState,
    filter: Option<ProductFilter>,
) -> AppResult<Vec<Product>> {
    let db = state
        .db
        .as_ref()
        .ok_or_else(|| AppError::Internal("Database connection unavailable".to_string()))?
        .clone();

    let active_filter = filter.unwrap_or_default();

    db.call_blocking(move |conn| {
        let mut query = "SELECT id, name, normalized_name, sku, barcode, category_id, brand_id, company_id, quality_id, color_id, unit_id, purchase_price, average_cost, sale_price, low_stock_threshold, is_active, description, created_at, updated_at FROM products WHERE 1=1".to_string();
        let mut param_values: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
        let mut idx = 1;

        if let Some(ref search) = active_filter.search {
            let clean = search.trim();
            if !clean.is_empty() {
                query.push_str(&format!(
                    " AND (name LIKE ?{idx} OR sku LIKE ?{idx} OR barcode LIKE ?{idx} OR normalized_name LIKE ?{idx})",
                    idx = idx
                ));
                param_values.push(Box::new(format!("%{clean}%")));
                idx += 1;
            }
        }

        if let Some(ref cat_id) = active_filter.category_id {
            query.push_str(&format!(" AND category_id = ?{idx}", idx = idx));
            param_values.push(Box::new(cat_id.clone()));
            idx += 1;
        }

        if let Some(active_only) = active_filter.is_active {
            let active_val = if active_only { 1i64 } else { 0i64 };
            query.push_str(&format!(" AND is_active = ?{idx}", idx = idx));
            param_values.push(Box::new(active_val));
        }

        query.push_str(" ORDER BY name ASC");

        let mut stmt = conn
            .prepare(&query)
            .map_err(|e| DbError::QueryError(format!("Failed to prepare product storage list query: {e}")))?;

        let rusqlite_params: Vec<&dyn rusqlite::ToSql> = param_values.iter().map(|b| b.as_ref()).collect();

        let iter = stmt
            .query_map(&rusqlite_params[..], |row| {
                Ok(Product {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    normalized_name: row.get(2)?,
                    sku: row.get(3)?,
                    barcode: row.get(4)?,
                    category_id: row.get(5)?,
                    brand_id: row.get(6)?,
                    company_id: row.get(7)?,
                    quality_id: row.get(8)?,
                    color_id: row.get(9)?,
                    unit_id: row.get(10)?,
                    purchase_price: row.get(11)?,
                    average_cost: row.get(12)?,
                    sale_price: row.get(13)?,
                    low_stock_threshold: row.get(14)?,
                    is_active: row.get::<_, i64>(15)? == 1,
                    description: row.get(16)?,
                    initial_quantity: None,
                    created_at: row.get(17)?,
                    updated_at: row.get(18)?,
                })
            })
            .map_err(|e| DbError::QueryError(format!("Failed to query products from storage: {e}")))?;

        let mut products = Vec::new();
        for p in iter {
            products.push(p.map_err(|e| DbError::QueryError(format!("Product row error: {e}")))?);
        }
        Ok(products)
    })
    .await
    .map_err(AppError::from)
}

/// Typed storage command: Queries products from SQLite storage using filter criteria
#[tauri::command]
pub async fn storage_product_list(
    state: State<'_, AppState>,
    filter: Option<ProductFilter>,
) -> AppResult<Vec<Product>> {
    storage_product_list_impl(&state, filter).await
}

pub async fn storage_product_deactivate_impl(
    state: &AppState,
    id: String,
) -> AppResult<()> {
    if id.trim().is_empty() {
        return Err(AppError::Validation(
            "Product ID cannot be empty".to_string(),
        ));
    }

    let db = state
        .db
        .as_ref()
        .ok_or_else(|| AppError::Internal("Database connection unavailable".to_string()))?
        .clone();

    db.call_blocking(move |conn| {
        use chrono::Utc;
        use rusqlite::params;
        let now = Utc::now().to_rfc3339();
        let affected = conn
            .execute(
                "UPDATE products SET is_active = 0, updated_at = ?1 WHERE id = ?2",
                params![now, id],
            )
            .map_err(|e| DbError::QueryError(format!("Failed to deactivate product: {e}")))?;

        if affected == 0 {
            return Err(DbError::NotFound(format!("Product '{id}' not found")));
        }

        Ok(())
    })
    .await
    .map_err(AppError::from)
}

/// Typed storage command: Deactivates a product in SQLite storage
#[tauri::command]
pub async fn storage_product_deactivate(
    state: State<'_, AppState>,
    id: String,
) -> AppResult<()> {
    storage_product_deactivate_impl(&state, id).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::connection::DatabaseConnection;
    use crate::db::migrations::MigrationRunner;
    use crate::domain::catalog::{CreateCategoryDto, CreateUnitDto};
    use crate::services::CatalogService;

    async fn setup_test_context() -> (AppState, String, String) {
        let db = DatabaseConnection::open_in_memory().unwrap();
        {
            let conn_arc = db.inner();
            let mut guard = conn_arc.lock().await;
            MigrationRunner::run(&mut guard).unwrap();
        }

        let cat_service = CatalogService::new(db.clone());
        let cat = cat_service
            .create_category(CreateCategoryDto {
                name: "Electronics".to_string(),
                code: "CAT-ELEC".to_string(),
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

        let state = AppState::new_sqlite("1.2.15", db);
        (state, cat.id, unit.id)
    }

    #[tokio::test]
    async fn test_storage_product_full_lifecycle_and_validation() {
        let (state, cat_id, unit_id) = setup_test_context().await;

        // 1. Structural validation rejections
        let invalid_name_dto = CreateProductDto {
            name: "   ".to_string(),
            sku: "SKU-INV-1".to_string(),
            barcode: None,
            category_id: cat_id.clone(),
            brand_id: None,
            company_id: None,
            quality_id: None,
            color_id: None,
            unit_id: Some(unit_id.clone()),
            purchase_price: 100,
            average_cost: None,
            sale_price: 150,
            low_stock_threshold: None,
            description: None,
            initial_quantity: None,
            branch_id: None,
        };
        assert!(
            storage_product_create_impl(&state, invalid_name_dto).await.is_err(),
            "Empty name must be rejected"
        );

        let invalid_price_dto = CreateProductDto {
            name: "Invalid Price Phone".to_string(),
            sku: "SKU-INV-2".to_string(),
            barcode: None,
            category_id: cat_id.clone(),
            brand_id: None,
            company_id: None,
            quality_id: None,
            color_id: None,
            unit_id: Some(unit_id.clone()),
            purchase_price: -50,
            average_cost: None,
            sale_price: 150,
            low_stock_threshold: None,
            description: None,
            initial_quantity: None,
            branch_id: None,
        };
        assert!(
            storage_product_create_impl(&state, invalid_price_dto).await.is_err(),
            "Negative purchase price must be rejected"
        );

        // 2. Create valid product via typed storage command (without session/auth requirement)
        let valid_create_dto = CreateProductDto {
            name: "Tauri Pilot Phone".to_string(),
            sku: "SKU-PILOT-100".to_string(),
            barcode: Some("9876543210123".to_string()),
            category_id: cat_id.clone(),
            brand_id: None,
            company_id: None,
            quality_id: None,
            color_id: None,
            unit_id: Some(unit_id.clone()),
            purchase_price: 45000,
            average_cost: None,
            sale_price: 55000,
            low_stock_threshold: Some(5),
            description: Some("Storage pilot item".to_string()),
            initial_quantity: None,
            branch_id: None,
        };

        let created = storage_product_create_impl(&state, valid_create_dto)
            .await
            .expect("storage_product_create_impl must succeed");
        assert_eq!(created.name, "Tauri Pilot Phone");
        assert_eq!(created.sku, "SKU-PILOT-100");
        assert_eq!(created.barcode, Some("9876543210123".to_string()));
        assert!(created.is_active);

        // 3. Get product by ID
        let fetched_by_id = storage_product_get_impl(&state, created.id.clone())
            .await
            .expect("storage_product_get_impl must succeed");
        assert_eq!(fetched_by_id.id, created.id);
        assert_eq!(fetched_by_id.name, "Tauri Pilot Phone");

        // 4. Get product by SKU
        let fetched_by_sku = storage_product_get_by_sku_impl(&state, "sku-pilot-100".to_string())
            .await
            .expect("storage_product_get_by_sku_impl must succeed with case-insensitivity");
        assert_eq!(fetched_by_sku.id, created.id);

        // 5. Get product by Barcode
        let fetched_by_barcode = storage_product_get_by_barcode_impl(&state, "9876543210123".to_string())
            .await
            .expect("storage_product_get_by_barcode_impl must succeed");
        assert_eq!(fetched_by_barcode.id, created.id);

        // 6. Update product
        let update_dto = UpdateProductDto {
            name: Some("Tauri Pilot Phone Pro".to_string()),
            barcode: None,
            category_id: None,
            brand_id: None,
            company_id: None,
            quality_id: None,
            color_id: None,
            unit_id: None,
            purchase_price: None,
            average_cost: None,
            sale_price: Some(60000),
            low_stock_threshold: None,
            description: None,
            is_active: None,
        };

        let updated = storage_product_update_impl(&state, created.id.clone(), update_dto)
            .await
            .expect("storage_product_update_impl must succeed");
        assert_eq!(updated.name, "Tauri Pilot Phone Pro");
        assert_eq!(updated.sale_price, 60000);

        // 7. List products with filter
        let list_filter = ProductFilter {
            search: Some("Pilot".to_string()),
            category_id: Some(cat_id.clone()),
            brand_id: None,
            company_id: None,
            quality_id: None,
            color_id: None,
            is_active: Some(true),
        };
        let products = storage_product_list_impl(&state, Some(list_filter))
            .await
            .expect("storage_product_list_impl must succeed");
        assert_eq!(products.len(), 1);
        assert_eq!(products[0].id, created.id);

        // 8. Deactivate product
        storage_product_deactivate_impl(&state, created.id.clone())
            .await
            .expect("storage_product_deactivate_impl must succeed");

        let deactivated_fetch = storage_product_get_impl(&state, created.id.clone())
            .await
            .expect("storage_product_get_impl on deactivated product must succeed");
        assert!(!deactivated_fetch.is_active);
    }

    #[tokio::test]
    async fn test_storage_product_opening_stock_and_outbox_events() {
        let (state, cat_id, unit_id) = setup_test_context().await;

        let create_dto = CreateProductDto {
            name: "Galaxy Ultra S26".to_string(),
            sku: "SKU-ULTRA-S26".to_string(),
            barcode: Some("1122334455667".to_string()),
            category_id: cat_id.clone(),
            brand_id: None,
            company_id: None,
            quality_id: None,
            color_id: None,
            unit_id: Some(unit_id.clone()),
            purchase_price: 150000,
            average_cost: None,
            sale_price: 180000,
            low_stock_threshold: Some(10),
            description: Some("Flagship phone with initial stock".to_string()),
            initial_quantity: Some(25),
            branch_id: Some("00000000-0000-0000-0000-000000000002".to_string()),
        };

        // 1. Create product with initial stock = 25
        let created = storage_product_create_impl(&state, create_dto)
            .await
            .expect("storage_product_create_impl must succeed with opening stock");

        assert_eq!(created.name, "Galaxy Ultra S26");
        assert_eq!(created.sku, "SKU-ULTRA-S26");

        // 2. Verify stock record created in 'stock' table with quantity = 25
        let db = state.db.as_ref().unwrap();
        let conn_arc = db.inner();
        let guard = conn_arc.lock().await;

        let stock_qty: i64 = guard
            .query_row(
                "SELECT quantity FROM stock WHERE product_id = ?1 AND branch_id = ?2",
                rusqlite::params![created.id, "00000000-0000-0000-0000-000000000002"],
                |r| r.get(0),
            )
            .expect("Stock record must exist for newly created product");
        assert_eq!(stock_qty, 25, "Initial stock quantity must match CreateProductDto.initial_quantity");

        // 3. Verify stock movement recorded in 'stock_movements'
        let movement_qty: i64 = guard
            .query_row(
                "SELECT quantity FROM stock_movements WHERE product_id = ?1 AND movement_type = 'IN'",
                rusqlite::params![created.id],
                |r| r.get(0),
            )
            .expect("Opening stock movement must be recorded");
        assert_eq!(movement_qty, 25);

        // 4. Verify PRODUCT_CREATED outbox event enqueued in 'offline_sync_queue'
        let outbox_created_count: i64 = guard
            .query_row(
                "SELECT COUNT(*) FROM offline_sync_queue WHERE event_type = 'PRODUCT_CREATED' AND client_event_id = ?1",
                rusqlite::params![created.id],
                |r| r.get(0),
            )
            .expect("PRODUCT_CREATED event query must succeed");
        assert_eq!(outbox_created_count, 1, "PRODUCT_CREATED event must be enqueued into offline_sync_queue");

        drop(guard);

        // 5. Update product and verify PRODUCT_UPDATED outbox event
        let update_dto = UpdateProductDto {
            name: Some("Galaxy Ultra S26 Plus".to_string()),
            barcode: None,
            category_id: None,
            brand_id: None,
            company_id: None,
            quality_id: None,
            color_id: None,
            unit_id: None,
            purchase_price: None,
            average_cost: None,
            sale_price: Some(195000),
            low_stock_threshold: None,
            description: None,
            is_active: None,
        };

        let updated = storage_product_update_impl(&state, created.id.clone(), update_dto)
            .await
            .expect("storage_product_update_impl must succeed");
        assert_eq!(updated.name, "Galaxy Ultra S26 Plus");

        let guard = conn_arc.lock().await;
        let outbox_updated_count: i64 = guard
            .query_row(
                "SELECT COUNT(*) FROM offline_sync_queue WHERE event_type = 'PRODUCT_UPDATED'",
                [],
                |r| r.get(0),
            )
            .expect("PRODUCT_UPDATED event query must succeed");
        assert!(outbox_updated_count >= 1, "PRODUCT_UPDATED event must be enqueued into offline_sync_queue");
    }
}
