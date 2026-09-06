use chrono::Utc;
use uuid::Uuid;

use crate::db::connection::DatabaseConnection;
use crate::db::transaction::with_transaction;
use crate::domain::inventory::{StockMovement, StockMovementType};
use crate::domain::product::{CreateProductDto, Product, ProductFilter, UpdateProductDto};
use crate::errors::{AppError, AppResult};
use crate::repositories::{SQLiteInventoryRepository, SQLiteProductRepository};

#[derive(Clone)]
pub struct ProductService {
    db: DatabaseConnection,
    repo: SQLiteProductRepository,
}

impl ProductService {
    pub fn new(db: DatabaseConnection) -> Self {
        Self {
            repo: SQLiteProductRepository::new(db.clone()),
            db,
        }
    }

    /// Creates a new product with business validation and optional opening stock
    pub async fn create_product(&self, dto: CreateProductDto, user_id: Option<&str>) -> AppResult<Product> {
        if dto.name.trim().is_empty() {
            return Err(AppError::Validation("Product name is required".to_string()));
        }
        if dto.sku.trim().is_empty() {
            return Err(AppError::Validation("Product SKU is required".to_string()));
        }
        if dto.purchase_price < 0 {
            return Err(AppError::Validation("Purchase price cannot be negative".to_string()));
        }
        if dto.sale_price < 0 {
            return Err(AppError::Validation("Sale price cannot be negative".to_string()));
        }
        if let Some(threshold) = dto.low_stock_threshold {
            if threshold < 0 {
                return Err(AppError::Validation("Low stock threshold cannot be negative".to_string()));
            }
        }

        let product_id = Uuid::new_v4().to_string();
        let product = self.repo.create_product(&product_id, &dto).await?;

        // Optional opening stock initialization
        if let (Some(qty), Some(branch_id)) = (dto.initial_quantity, dto.branch_id) {
            if qty > 0 {
                let now = Utc::now().to_rfc3339();
                let pid = product_id.clone();
                let bid = branch_id.clone();
                let uid = user_id.map(|s| s.to_string());

                with_transaction(&self.db, move |tx| {
                    SQLiteInventoryRepository::set_stock_in_tx(tx, &pid, &bid, qty, &now)?;

                    let movement = StockMovement {
                        id: Uuid::new_v4().to_string(),
                        product_id: pid,
                        branch_id: bid,
                        movement_type: StockMovementType::In,
                        quantity: qty,
                        previous_stock: 0,
                        resulting_stock: qty,
                        reason: Some("Opening Stock".to_string()),
                        performed_by: uid,
                        reference_id: Some("OPENING_BALANCE".to_string()),
                        created_at: now,
                    };
                    SQLiteInventoryRepository::insert_movement_in_tx(tx, &movement)?;
                    Ok(())
                })
                .await?;
            }
        }

        Ok(product)
    }

    pub async fn update_product(&self, id: &str, dto: UpdateProductDto) -> AppResult<Product> {
        if let Some(name) = &dto.name {
            if name.trim().is_empty() {
                return Err(AppError::Validation("Product name cannot be empty".to_string()));
            }
        }
        if let Some(p) = dto.purchase_price {
            if p < 0 {
                return Err(AppError::Validation("Purchase price cannot be negative".to_string()));
            }
        }
        if let Some(s) = dto.sale_price {
            if s < 0 {
                return Err(AppError::Validation("Sale price cannot be negative".to_string()));
            }
        }
        if let Some(t) = dto.low_stock_threshold {
            if t < 0 {
                return Err(AppError::Validation("Low stock threshold cannot be negative".to_string()));
            }
        }

        self.repo.update_product(id, &dto).await
    }

    pub async fn get_product(&self, id: &str) -> AppResult<Product> {
        self.repo.get_product_by_id(id).await
    }

    pub async fn get_product_by_sku(&self, sku: &str) -> AppResult<Product> {
        self.repo.get_product_by_sku(sku).await
    }

    pub async fn get_product_by_barcode(&self, barcode: &str) -> AppResult<Product> {
        self.repo.get_product_by_barcode(barcode).await
    }

    pub async fn list_products(&self, filter: ProductFilter) -> AppResult<Vec<Product>> {
        self.repo.list_products(&filter).await
    }

    /// Deactivates a product. Guardrail: physical deletion is strictly rejected in business logic.
    pub async fn deactivate_product(&self, id: &str) -> AppResult<()> {
        self.repo.deactivate_product(id).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations::MigrationRunner;
    use crate::domain::catalog::{CreateCategoryDto, CreateUnitDto};
    use crate::services::CatalogService;

    async fn setup_test_context() -> (DatabaseConnection, ProductService, String, String) {
        let db = DatabaseConnection::open_in_memory().unwrap();
        {
            let conn_arc = db.inner();
            let mut guard = conn_arc.lock().await;
            MigrationRunner::run(&mut guard).unwrap();
        }

        let cat_service = CatalogService::new(db.clone());
        let cat = cat_service
            .create_category(CreateCategoryDto {
                name: "Smartphones".to_string(),
                code: "CAT-SMART".to_string(),
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
        (db, prod_service, cat.id, unit.id)
    }

    #[tokio::test]
    async fn test_product_lifecycle_and_uniqueness_constraints() {
        let (_db, service, cat_id, unit_id) = setup_test_context().await;

        // 1. Create valid product with whole PKR rupee prices
        let prod1 = service
            .create_product(
                CreateProductDto {
                    name: "Samsung Galaxy S24 Ultra".to_string(),
                    sku: "SKU-S24U".to_string(),
                    barcode: Some("8806091234567".to_string()),
                    category_id: cat_id.clone(),
                    brand_id: None,
                    unit_id: Some(unit_id.clone()),
                    purchase_price: 320000, // Rs 320,000
                    average_cost: None,
                    sale_price: 380000,     // Rs 380,000
                    low_stock_threshold: Some(5),
                    description: Some("Flagship phone".to_string()),
                    initial_quantity: None,
                    branch_id: None,
                },
                None,
            )
            .await
            .expect("Product creation should succeed");

        assert_eq!(prod1.purchase_price, 320000);
        assert_eq!(prod1.sale_price, 380000);
        assert!(prod1.is_active);

        // 2. Duplicate SKU rejected
        let dup_sku = service
            .create_product(
                CreateProductDto {
                    name: "Another S24".to_string(),
                    sku: "sku-s24u".to_string(), // case-insensitive check
                    barcode: Some("9999999999999".to_string()),
                    category_id: cat_id.clone(),
                    brand_id: None,
                    unit_id: Some(unit_id.clone()),
                    purchase_price: 300000,
                    average_cost: None,
                    sale_price: 350000,
                    low_stock_threshold: None,
                    description: None,
                    initial_quantity: None,
                    branch_id: None,
                },
                None,
            )
            .await;
        assert!(dup_sku.is_err(), "Duplicate SKU must be rejected");

        // 3. Duplicate Barcode rejected
        let dup_barcode = service
            .create_product(
                CreateProductDto {
                    name: "Another S24 with same barcode".to_string(),
                    sku: "SKU-S24U-2".to_string(),
                    barcode: Some("8806091234567".to_string()), // same as prod1
                    category_id: cat_id.clone(),
                    brand_id: None,
                    unit_id: Some(unit_id.clone()),
                    purchase_price: 300000,
                    average_cost: None,
                    sale_price: 350000,
                    low_stock_threshold: None,
                    description: None,
                    initial_quantity: None,
                    branch_id: None,
                },
                None,
            )
            .await;
        assert!(dup_barcode.is_err(), "Duplicate Barcode must be rejected");

        // 4. Nullable Barcode allowed for multiple products
        let prod_no_barcode_1 = service
            .create_product(
                CreateProductDto {
                    name: "Cable A".to_string(),
                    sku: "SKU-CABLE-A".to_string(),
                    barcode: None,
                    category_id: cat_id.clone(),
                    brand_id: None,
                    unit_id: Some(unit_id.clone()),
                    purchase_price: 200,
                    average_cost: None,
                    sale_price: 500,
                    low_stock_threshold: None,
                    description: None,
                    initial_quantity: None,
                    branch_id: None,
                },
                None,
            )
            .await
            .expect("First null barcode product must succeed");

        let prod_no_barcode_2 = service
            .create_product(
                CreateProductDto {
                    name: "Cable B".to_string(),
                    sku: "SKU-CABLE-B".to_string(),
                    barcode: None,
                    category_id: cat_id.clone(),
                    brand_id: None,
                    unit_id: Some(unit_id.clone()),
                    purchase_price: 300,
                    average_cost: None,
                    sale_price: 600,
                    low_stock_threshold: None,
                    description: None,
                    initial_quantity: None,
                    branch_id: None,
                },
                None,
            )
            .await
            .expect("Second null barcode product must succeed (nullable uniqueness allows multiple NULLs)");

        assert_eq!(prod_no_barcode_1.barcode, None);
        assert_eq!(prod_no_barcode_2.barcode, None);

        // 5. Invalid prices rejected (< 0)
        let neg_price = service
            .create_product(
                CreateProductDto {
                    name: "Invalid Item".to_string(),
                    sku: "SKU-INVALID".to_string(),
                    barcode: None,
                    category_id: cat_id.clone(),
                    brand_id: None,
                    unit_id: Some(unit_id.clone()),
                    purchase_price: -100,
                    average_cost: None,
                    sale_price: 500,
                    low_stock_threshold: None,
                    description: None,
                    initial_quantity: None,
                    branch_id: None,
                },
                None,
            )
            .await;
        assert!(neg_price.is_err(), "Negative purchase price must be rejected");

        // 6. Deactivate product (soft deletion guardrail)
        service.deactivate_product(&prod1.id).await.unwrap();
        let deactivated = service.get_product(&prod1.id).await.unwrap();
        assert!(!deactivated.is_active);
    }
}
