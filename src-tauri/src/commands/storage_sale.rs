use tauri::State;

use crate::domain::sales::{
    CompleteSaleDto, Sale, SaleFilterDto, SaleLine, SalePayment, SaleResultDto,
};
use crate::errors::{AppError, AppResult};
use crate::state::AppState;

/// Validates CompleteSaleDto structural invariants
fn validate_complete_sale_dto(dto: &CompleteSaleDto) -> AppResult<()> {
    if dto.items.is_empty() {
        return Err(AppError::Validation("Cannot complete sale with empty cart".to_string()));
    }
    for item in &dto.items {
        if item.product_id.trim().is_empty() {
            return Err(AppError::Validation("Product ID in sale line cannot be empty".to_string()));
        }
        if item.quantity <= 0 {
            return Err(AppError::Validation("Sale item quantity must be greater than 0".to_string()));
        }
        if let Some(disc) = item.discount {
            if disc < 0 {
                return Err(AppError::Validation("Line discount cannot be negative".to_string()));
            }
        }
    }
    if let Some(disc) = dto.discount {
        if disc < 0 {
            return Err(AppError::Validation("Invoice discount cannot be negative".to_string()));
        }
    }
    if let Some(paid) = dto.paid_amount {
        if paid < 0 {
            return Err(AppError::Validation("Paid amount cannot be negative".to_string()));
        }
    }
    Ok(())
}

/// Typed storage command: Completes a retail sale atomically in SQLite storage
#[tauri::command]
pub async fn storage_sale_complete(
    state: State<'_, AppState>,
    dto: CompleteSaleDto,
) -> AppResult<SaleResultDto> {
    validate_complete_sale_dto(&dto)?;
    state.sale_service.complete_sale(None, dto).await
}

/// Typed storage command: Retrieves sale header by ID from SQLite storage
#[tauri::command]
pub async fn storage_sale_get_by_id(
    state: State<'_, AppState>,
    id: String,
) -> AppResult<Option<Sale>> {
    if id.trim().is_empty() {
        return Err(AppError::Validation("Sale ID cannot be empty".to_string()));
    }
    state.sale_service.get_sale_by_id(&id).await
}

/// Typed storage command: Retrieves sale header by invoice number from SQLite storage
#[tauri::command]
pub async fn storage_sale_get_by_invoice(
    state: State<'_, AppState>,
    invoice_number: String,
) -> AppResult<Option<Sale>> {
    if invoice_number.trim().is_empty() {
        return Err(AppError::Validation("Invoice number cannot be empty".to_string()));
    }
    state.sale_service.get_sale_by_invoice(&invoice_number).await
}

/// Typed storage command: Queries sales headers with filtering options from SQLite storage
#[tauri::command]
pub async fn storage_sale_list(
    state: State<'_, AppState>,
    filter: Option<SaleFilterDto>,
) -> AppResult<Vec<Sale>> {
    state
        .sale_service
        .list_sales(filter.unwrap_or_default())
        .await
}

/// Typed storage command: Retrieves itemized lines for a sale from SQLite storage
#[tauri::command]
pub async fn storage_sale_get_lines(
    state: State<'_, AppState>,
    sale_id: String,
) -> AppResult<Vec<SaleLine>> {
    if sale_id.trim().is_empty() {
        return Err(AppError::Validation("Sale ID cannot be empty".to_string()));
    }
    state.sale_service.get_sale_lines(&sale_id).await
}

/// Typed storage command: Retrieves payment entries for a sale from SQLite storage
#[tauri::command]
pub async fn storage_sale_get_payments(
    state: State<'_, AppState>,
    sale_id: String,
) -> AppResult<Vec<SalePayment>> {
    if sale_id.trim().is_empty() {
        return Err(AppError::Validation("Sale ID cannot be empty".to_string()));
    }
    state.sale_service.get_sale_payments(&sale_id).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::connection::DatabaseConnection;
    use crate::db::migrations::MigrationRunner;
    use crate::domain::catalog::{CreateCategoryDto, CreateUnitDto};
    use crate::domain::organization::DEFAULT_MAIN_BRANCH_ID;
    use crate::domain::product::CreateProductDto;
    use crate::domain::sales::{PaymentStatus, SaleItemDto};
    use crate::services::{CatalogService, ProductService};

    async fn setup_storage_sale_test() -> (AppState, String) {
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
                code: "CAT-ELEC-SALE".to_string(),
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
                    name: "Wireless Earbuds".to_string(),
                    sku: "SKU-EARBUDS-1".to_string(),
                    barcode: Some("1122334455667".to_string()),
                    category_id: cat.id,
                    brand_id: None,
                    unit_id: Some(unit.id),
                    company_id: None,
                    quality_id: None,
                    color_id: None,
                    purchase_price: 1200,
                    average_cost: None,
                    sale_price: 2500,
                    low_stock_threshold: Some(5),
                    description: None,
                    initial_quantity: Some(10),
                    branch_id: Some(DEFAULT_MAIN_BRANCH_ID.to_string()),
                },
                None,
            )
            .await
            .unwrap();

        let state = AppState::new_sqlite("1.2.15", db);
        (state, prod.id)
    }

    #[tokio::test]
    async fn test_storage_sale_complete_lifecycle() {
        let (state, prod_id) = setup_storage_sale_test().await;

        // 1. DTO Structural Rejection: Empty Cart
        let empty_cart_dto = CompleteSaleDto {
            branch_id: None,
            customer_id: None,
            items: vec![],
            discount: None,
            paid_amount: Some(2500),
            payment_method: Some("CASH".to_string()),
            notes: None,
        };
        assert!(
            validate_complete_sale_dto(&empty_cart_dto).is_err(),
            "Empty cart must be rejected"
        );

        // 2. Complete Valid Cash Sale via Typed Storage Command
        let valid_sale_dto = CompleteSaleDto {
            branch_id: Some(DEFAULT_MAIN_BRANCH_ID.to_string()),
            customer_id: None, // Walk-in
            items: vec![SaleItemDto {
                product_id: prod_id.clone(),
                quantity: 2,
                discount: None,
            }],
            discount: None,
            paid_amount: Some(5000),
            payment_method: Some("CASH".to_string()),
            notes: Some("Storage sale test".to_string()),
        };

        let result = storage_sale_complete_impl(&state, valid_sale_dto)
            .await
            .expect("storage_sale_complete_impl must succeed");

        assert_eq!(result.sale.total_amount, 5000);
        assert_eq!(result.sale.paid_amount, 5000);
        assert_eq!(result.sale.payment_status, PaymentStatus::Paid);
        assert_eq!(result.lines.len(), 1);
        assert_eq!(result.lines[0].quantity, 2);
        assert_eq!(result.lines[0].unit_price, 2500);

        // 3. Get Sale by ID
        let fetched_by_id = storage_sale_get_by_id_impl(&state, result.sale.id.clone())
            .await
            .expect("storage_sale_get_by_id_impl must succeed");
        assert!(fetched_by_id.is_some());
        assert_eq!(fetched_by_id.unwrap().invoice_number, result.sale.invoice_number);

        // 4. Get Sale by Invoice Number
        let fetched_by_inv = storage_sale_get_by_invoice_impl(&state, result.sale.invoice_number.clone())
            .await
            .expect("storage_sale_get_by_invoice_impl must succeed");
        assert!(fetched_by_inv.is_some());
        assert_eq!(fetched_by_inv.unwrap().id, result.sale.id);

        // 5. Get Sale Lines
        let lines = storage_sale_get_lines_impl(&state, result.sale.id.clone())
            .await
            .expect("storage_sale_get_lines_impl must succeed");
        assert_eq!(lines.len(), 1);
        assert_eq!(lines[0].product_id, prod_id);

        // 6. Get Sale Payments
        let payments = storage_sale_get_payments_impl(&state, result.sale.id.clone())
            .await
            .expect("storage_sale_get_payments_impl must succeed");
        assert_eq!(payments.len(), 1);
        assert_eq!(payments[0].amount, 5000);

        // 7. List Sales
        let sales_list = storage_sale_list_impl(&state, None)
            .await
            .expect("storage_sale_list_impl must succeed");
        assert_eq!(sales_list.len(), 1);
        assert_eq!(sales_list[0].id, result.sale.id);

        // 8. Verify Stock Decremented: Initial 10 - 2 = 8
        let stock = state
            .inventory_service
            .get_stock(&prod_id, DEFAULT_MAIN_BRANCH_ID)
            .await
            .unwrap();
        assert_eq!(stock, 8);
    }
}

async fn storage_sale_complete_impl(state: &AppState, dto: CompleteSaleDto) -> AppResult<SaleResultDto> {
    validate_complete_sale_dto(&dto)?;
    state.sale_service.complete_sale(None, dto).await
}

async fn storage_sale_get_by_id_impl(state: &AppState, id: String) -> AppResult<Option<Sale>> {
    state.sale_service.get_sale_by_id(&id).await
}

async fn storage_sale_get_by_invoice_impl(state: &AppState, invoice_number: String) -> AppResult<Option<Sale>> {
    state.sale_service.get_sale_by_invoice(&invoice_number).await
}

async fn storage_sale_list_impl(state: &AppState, filter: Option<SaleFilterDto>) -> AppResult<Vec<Sale>> {
    state.sale_service.list_sales(filter.unwrap_or_default()).await
}

async fn storage_sale_get_lines_impl(state: &AppState, sale_id: String) -> AppResult<Vec<SaleLine>> {
    state.sale_service.get_sale_lines(&sale_id).await
}

async fn storage_sale_get_payments_impl(state: &AppState, sale_id: String) -> AppResult<Vec<SalePayment>> {
    state.sale_service.get_sale_payments(&sale_id).await
}
