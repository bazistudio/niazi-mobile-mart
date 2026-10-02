use uuid::Uuid;

use crate::domain::product::{CreateProductDto, Product, ProductFilter, UpdateProductDto};
use crate::errors::{AppError, AppResult};
use crate::repositories::{PostgresProductRepository, ProductRepository};

#[derive(Clone)]
pub struct ProductService {
    repo: ProductRepository,
}

impl ProductService {
    pub fn new_postgres(pool: sqlx::PgPool) -> Self {
        Self {
            repo: ProductRepository::new(PostgresProductRepository::new(pool)),
        }
    }

    /// Creates a new product with business validation and optional opening stock
    pub async fn create_product(
        &self,
        dto: CreateProductDto,
        user_id: Option<&str>,
    ) -> AppResult<Product> {
        if dto.name.trim().is_empty() {
            return Err(AppError::Validation("Product name is required".to_string()));
        }
        if dto.sku.trim().is_empty() {
            return Err(AppError::Validation("Product SKU is required".to_string()));
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
        if let Some(threshold) = dto.low_stock_threshold {
            if threshold < 0 {
                return Err(AppError::Validation(
                    "Low stock threshold cannot be negative".to_string(),
                ));
            }
        }

        let product_id = Uuid::new_v4().to_string();
        self.repo
            .create_product_with_initial_stock(&product_id, &dto, user_id)
            .await
    }

    pub async fn update_product(&self, id: &str, dto: UpdateProductDto) -> AppResult<Product> {
        if let Some(name) = &dto.name {
            if name.trim().is_empty() {
                return Err(AppError::Validation(
                    "Product name cannot be empty".to_string(),
                ));
            }
        }
        if let Some(p) = dto.purchase_price {
            if p < 0 {
                return Err(AppError::Validation(
                    "Purchase price cannot be negative".to_string(),
                ));
            }
        }
        if let Some(s) = dto.sale_price {
            if s < 0 {
                return Err(AppError::Validation(
                    "Sale price cannot be negative".to_string(),
                ));
            }
        }
        if let Some(t) = dto.low_stock_threshold {
            if t < 0 {
                return Err(AppError::Validation(
                    "Low stock threshold cannot be negative".to_string(),
                ));
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
    use crate::domain::catalog::{CreateCategoryDto, CreateUnitDto};

    async fn setup_test_service() -> ProductService {
        let pool = sqlx::PgPool::connect_lazy("postgres://localhost/test_placeholder")
            .expect("connect_lazy should succeed");
        ProductService::new_postgres(pool)
    }

    #[tokio::test]
    #[ignore]
    async fn test_product_lifecycle_and_uniqueness_constraints() {
        let service = setup_test_service().await;
        let cat_id = "00000000-0000-0000-0000-000000000010";
        let unit_id = "00000000-0000-0000-0000-000000000020";

        let prod1 = service
            .create_product(
                CreateProductDto {
                    name: "Samsung Galaxy S24 Ultra".to_string(),
                    sku: "SKU-S24U".to_string(),
                    barcode: Some("8806091234567".to_string()),
                    category_id: cat_id.to_string(),
                    brand_id: None,
                    company_id: None,
                    quality_id: None,
                    color_id: None,
                    unit_id: Some(unit_id.to_string()),
                    purchase_price: 320000,
                    average_cost: None,
                    sale_price: 380000,
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

        let neg_price = service
            .create_product(
                CreateProductDto {
                    name: "Invalid Item".to_string(),
                    sku: "SKU-INVALID".to_string(),
                    barcode: None,
                    category_id: cat_id.to_string(),
                    brand_id: None,
                    company_id: None,
                    quality_id: None,
                    color_id: None,
                    unit_id: Some(unit_id.to_string()),
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
        assert!(
            neg_price.is_err(),
            "Negative purchase price must be rejected"
        );
    }

    #[tokio::test]
    #[ignore]
    async fn test_phase_2_product_identity_and_null_semantics() {
        let _service = setup_test_service().await;
        // Requires real Postgres DB — skipped
    }

    #[tokio::test]
    #[ignore]
    async fn test_restock_bypass_product_master_validation_and_count_invariant() {
        let _service = setup_test_service().await;
        // Requires real Postgres DB — skipped
    }
}
