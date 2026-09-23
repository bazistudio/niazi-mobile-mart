use tauri::State;

use crate::domain::purchases::{
    CompletePurchaseDto, Purchase, PurchaseFilterDto, PurchaseLine, PurchaseResultDto,
};
use crate::errors::{AppError, AppResult};
use crate::state::AppState;

/// Validates structural invariants for CompletePurchaseDto
fn validate_complete_purchase_dto(dto: &CompletePurchaseDto) -> AppResult<()> {
    if dto.supplier_id.trim().is_empty() {
        return Err(AppError::Validation(
            "Supplier ID is required for a purchase".to_string(),
        ));
    }
    if dto.items.is_empty() {
        return Err(AppError::Validation(
            "Cannot complete purchase with no items".to_string(),
        ));
    }
    for item in &dto.items {
        if item.product_id.trim().is_empty() {
            return Err(AppError::Validation(
                "Product ID in purchase item cannot be empty".to_string(),
            ));
        }
        if item.quantity <= 0 {
            return Err(AppError::Validation(
                "Purchase item quantity must be greater than 0".to_string(),
            ));
        }
        if let Some(cost) = item.unit_cost {
            if cost < 0 {
                return Err(AppError::Validation(
                    "Purchase item unit cost cannot be negative".to_string(),
                ));
            }
        }
    }
    if let Some(disc) = dto.discount {
        if disc < 0 {
            return Err(AppError::Validation(
                "Purchase discount cannot be negative".to_string(),
            ));
        }
    }
    if let Some(paid) = dto.paid_amount {
        if paid < 0 {
            return Err(AppError::Validation(
                "Paid amount cannot be negative".to_string(),
            ));
        }
    }
    Ok(())
}

pub async fn storage_purchase_complete_impl(
    state: &AppState,
    dto: CompletePurchaseDto,
) -> AppResult<PurchaseResultDto> {
    validate_complete_purchase_dto(&dto)?;
    let session = state.get_session().await;
    state
        .purchase_service
        .complete_purchase(session.user_id.as_deref(), dto)
        .await
}

/// Typed storage command: Completes a supplier purchase atomically in SQLite storage
#[tauri::command]
pub async fn storage_purchase_complete(
    state: State<'_, AppState>,
    dto: CompletePurchaseDto,
) -> AppResult<PurchaseResultDto> {
    storage_purchase_complete_impl(&state, dto).await
}

pub async fn storage_purchase_get_by_id_impl(
    state: &AppState,
    id: String,
) -> AppResult<Option<Purchase>> {
    if id.trim().is_empty() {
        return Err(AppError::Validation(
            "Purchase ID cannot be empty".to_string(),
        ));
    }
    state.purchase_service.get_purchase_by_id(&id).await
}

/// Typed storage command: Retrieves purchase header by ID from SQLite storage
#[tauri::command]
pub async fn storage_purchase_get_by_id(
    state: State<'_, AppState>,
    id: String,
) -> AppResult<Option<Purchase>> {
    storage_purchase_get_by_id_impl(&state, id).await
}

pub async fn storage_purchase_get_by_number_impl(
    state: &AppState,
    purchase_number: String,
) -> AppResult<Option<Purchase>> {
    if purchase_number.trim().is_empty() {
        return Err(AppError::Validation(
            "Purchase number cannot be empty".to_string(),
        ));
    }
    state
        .purchase_service
        .get_purchase_by_number(&purchase_number)
        .await
}

/// Typed storage command: Retrieves purchase header by purchase number from SQLite storage
#[tauri::command]
pub async fn storage_purchase_get_by_number(
    state: State<'_, AppState>,
    purchase_number: String,
) -> AppResult<Option<Purchase>> {
    storage_purchase_get_by_number_impl(&state, purchase_number).await
}

pub async fn storage_purchase_list_impl(
    state: &AppState,
    filter: Option<PurchaseFilterDto>,
) -> AppResult<Vec<Purchase>> {
    state.purchase_service.list_purchases(filter).await
}

/// Typed storage command: Queries purchase headers with filtering options from SQLite storage
#[tauri::command]
pub async fn storage_purchase_list(
    state: State<'_, AppState>,
    filter: Option<PurchaseFilterDto>,
) -> AppResult<Vec<Purchase>> {
    storage_purchase_list_impl(&state, filter).await
}

pub async fn storage_purchase_get_lines_impl(
    state: &AppState,
    purchase_id: String,
) -> AppResult<Vec<PurchaseLine>> {
    if purchase_id.trim().is_empty() {
        return Err(AppError::Validation(
            "Purchase ID cannot be empty".to_string(),
        ));
    }
    state.purchase_service.get_purchase_lines(&purchase_id).await
}

/// Typed storage command: Retrieves itemized lines for a purchase from SQLite storage
#[tauri::command]
pub async fn storage_purchase_get_lines(
    state: State<'_, AppState>,
    purchase_id: String,
) -> AppResult<Vec<PurchaseLine>> {
    storage_purchase_get_lines_impl(&state, purchase_id).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::connection::DatabaseConnection;
    use crate::db::migrations::MigrationRunner;
    use crate::domain::catalog::{CreateCategoryDto, CreateUnitDto};
    use crate::domain::product::CreateProductDto;
    use crate::domain::purchases::PurchaseItemDto;
    use crate::domain::supplier::CreateSupplierDto;

    async fn setup_test_context() -> (AppState, String, String) {
        let db = DatabaseConnection::open_in_memory().unwrap();
        {
            let conn_arc = db.inner();
            let mut guard = conn_arc.lock().await;
            MigrationRunner::run(&mut guard).unwrap();
            guard
                .execute(
                    "INSERT INTO users (id, name, username, login_key_hash, role, is_active, created_at, updated_at)
                     VALUES ('99999999-9999-9999-9999-999999999999', 'Admin User', 'admin', 'hash', 'ADMIN', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
                    [],
                )
                .unwrap();
        }

        let state = AppState::new_sqlite("1.2.15", db);

        let cat = state
            .catalog_service
            .create_category(CreateCategoryDto {
                name: "Parts".to_string(),
                code: "CAT-PARTS".to_string(),
                description: None,
            })
            .await
            .unwrap();

        let unit = state
            .catalog_service
            .create_unit(CreateUnitDto {
                name: "Piece".to_string(),
                symbol: Some("pcs".to_string()),
                conversion_factor: Some(1),
            })
            .await
            .unwrap();

        let prod = state
            .product_service
            .create_product(
                CreateProductDto {
                    name: "OLED Screen Panel".to_string(),
                    sku: "SKU-OLED-99".to_string(),
                    barcode: None,
                    category_id: cat.id,
                    brand_id: None,
                    company_id: None,
                    quality_id: None,
                    color_id: None,
                    unit_id: Some(unit.id),
                    purchase_price: 12000,
                    average_cost: None,
                    sale_price: 16000,
                    low_stock_threshold: Some(3),
                    description: None,
                    initial_quantity: None,
                    branch_id: None,
                },
                None,
            )
            .await
            .unwrap();

        let supplier = state
            .supplier_service
            .create_supplier(CreateSupplierDto {
                name: "Screen Wholesale Ltd".to_string(),
                phone: "03009990000".to_string(),
                alternate_phone: None,
                email: None,
                address: None,
                notes: None,
                credit_limit: Some(300000),
            })
            .await
            .unwrap();

        (state, prod.id, supplier.id)
    }

    #[tokio::test]
    async fn test_storage_purchase_complete_lifecycle() {
        let (state, prod_id, supplier_id) = setup_test_context().await;

        // 1. Structural Validation Rejections
        let invalid_empty_supplier = CompletePurchaseDto {
            branch_id: None,
            supplier_id: "   ".to_string(),
            items: vec![PurchaseItemDto {
                product_id: prod_id.clone(),
                quantity: 5,
                unit_cost: Some(10000),
                discount: None,
            }],
            discount: None,
            paid_amount: Some(50000),
            payment_method: Some("CASH".to_string()),
            notes: None,
        };
        assert!(
            storage_purchase_complete_impl(&state, invalid_empty_supplier).await.is_err(),
            "Empty supplier ID must be rejected"
        );

        let invalid_no_items = CompletePurchaseDto {
            branch_id: None,
            supplier_id: supplier_id.clone(),
            items: vec![],
            discount: None,
            paid_amount: Some(0),
            payment_method: None,
            notes: None,
        };
        assert!(
            storage_purchase_complete_impl(&state, invalid_no_items).await.is_err(),
            "Empty items list must be rejected"
        );

        let invalid_item_qty = CompletePurchaseDto {
            branch_id: None,
            supplier_id: supplier_id.clone(),
            items: vec![PurchaseItemDto {
                product_id: prod_id.clone(),
                quantity: 0,
                unit_cost: Some(10000),
                discount: None,
            }],
            discount: None,
            paid_amount: None,
            payment_method: None,
            notes: None,
        };
        assert!(
            storage_purchase_complete_impl(&state, invalid_item_qty).await.is_err(),
            "Non-positive quantity must be rejected"
        );

        // 2. Open Cash Session so cash payment succeeds
        let session_dto = crate::domain::cash::OpenCashSessionDto {
            branch_id: Some(crate::domain::organization::DEFAULT_MAIN_BRANCH_ID.to_string()),
            opening_cash: 500000,
            business_date: None,
            notes: Some("Test session".to_string()),
        };
        state
            .cash_service
            .open_session(Some("99999999-9999-9999-9999-999999999999"), session_dto)
            .await
            .expect("open cash session");

        // 3. Complete valid purchase via typed storage command
        let purchase_dto = CompletePurchaseDto {
            branch_id: None,
            supplier_id: supplier_id.clone(),
            items: vec![PurchaseItemDto {
                product_id: prod_id.clone(),
                quantity: 10,
                unit_cost: Some(11000),
                discount: None,
            }],
            discount: Some(1000),
            paid_amount: Some(50000), // Total 109,000, paid 50,000, credit 59,000
            payment_method: Some("CASH".to_string()),
            notes: Some("Procurement of OLED panels".to_string()),
        };

        let result = storage_purchase_complete_impl(&state, purchase_dto)
            .await
            .expect("complete purchase must succeed");

        assert!(result.purchase.purchase_number.starts_with("PUR-"));
        assert_eq!(result.purchase.supplier_id, supplier_id);
        assert_eq!(result.purchase.total_amount, 109000);
        assert_eq!(result.purchase.paid_amount, 50000);
        assert_eq!(result.credit_amount, 59000);
        assert_eq!(result.lines.len(), 1);

        let purchase_id = result.purchase.id.clone();
        let purchase_num = result.purchase.purchase_number.clone();

        // 4. Get by ID
        let fetched_by_id = storage_purchase_get_by_id_impl(&state, purchase_id.clone())
            .await
            .expect("get by id must succeed")
            .expect("purchase must be found");
        assert_eq!(fetched_by_id.id, purchase_id);
        assert_eq!(fetched_by_id.total_amount, 109000);

        // 5. Get by Number
        let fetched_by_num = storage_purchase_get_by_number_impl(&state, purchase_num.clone())
            .await
            .expect("get by number must succeed")
            .expect("purchase must be found");
        assert_eq!(fetched_by_num.id, purchase_id);

        // 6. Get Lines
        let lines = storage_purchase_get_lines_impl(&state, purchase_id.clone())
            .await
            .expect("get lines must succeed");
        assert_eq!(lines.len(), 1);
        assert_eq!(lines[0].product_id, prod_id);
        assert_eq!(lines[0].quantity, 10);
        assert_eq!(lines[0].unit_cost, 11000);

        // 7. List Purchases
        let list = storage_purchase_list_impl(&state, None)
            .await
            .expect("list purchases must succeed");
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, purchase_id);
    }
}
