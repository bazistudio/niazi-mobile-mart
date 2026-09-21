use uuid::Uuid;

use crate::db::connection::DatabaseConnection;
use crate::domain::catalog::{
    Brand, Category, Color, Company, CreateBrandDto, CreateCategoryDto, CreateColorDto,
    CreateCompanyDto, CreateQualityDto, CreateUnitDto, Quality, Unit, UpdateBrandDto,
    UpdateCategoryDto, UpdateColorDto, UpdateCompanyDto, UpdateQualityDto, UpdateUnitDto,
};
use crate::errors::{AppError, AppResult};
use crate::repositories::{CatalogRepository, PostgresCatalogRepository, SQLiteCatalogRepository};

#[derive(Clone)]
pub struct CatalogService {
    repo: CatalogRepository,
}

impl CatalogService {
    pub fn new(db: DatabaseConnection) -> Self {
        Self::new_sqlite(db)
    }

    pub fn new_sqlite(db: DatabaseConnection) -> Self {
        Self {
            repo: CatalogRepository::SQLite(SQLiteCatalogRepository::new(db)),
        }
    }

    pub fn new_postgres(pool: sqlx::PgPool) -> Self {
        Self {
            repo: CatalogRepository::Postgres(PostgresCatalogRepository::new(pool)),
        }
    }

    // --- CATEGORIES ---

    pub async fn create_category(&self, dto: CreateCategoryDto) -> AppResult<Category> {
        if dto.name.trim().is_empty() {
            return Err(AppError::Validation("Category name is required".to_string()));
        }
        if dto.code.trim().is_empty() {
            return Err(AppError::Validation("Category code is required".to_string()));
        }

        let id = Uuid::new_v4().to_string();
        self.repo.create_category(&id, &dto).await
    }

    pub async fn get_category(&self, id: &str) -> AppResult<Category> {
        self.repo.get_category_by_id(id).await
    }

    pub async fn list_categories(&self) -> AppResult<Vec<Category>> {
        self.repo.list_categories().await
    }

    pub async fn update_category(&self, id: &str, dto: UpdateCategoryDto) -> AppResult<Category> {
        if let Some(name) = &dto.name {
            if name.trim().is_empty() {
                return Err(AppError::Validation("Category name cannot be empty".to_string()));
            }
        }
        self.repo.update_category(id, &dto).await
    }

    // --- BRANDS ---

    pub async fn create_brand(&self, dto: CreateBrandDto) -> AppResult<Brand> {
        if dto.name.trim().is_empty() {
            return Err(AppError::Validation("Brand name is required".to_string()));
        }
        if dto.code.trim().is_empty() {
            return Err(AppError::Validation("Brand code is required".to_string()));
        }

        let id = Uuid::new_v4().to_string();
        self.repo.create_brand(&id, &dto).await
    }

    pub async fn get_brand(&self, id: &str) -> AppResult<Brand> {
        self.repo.get_brand_by_id(id).await
    }

    pub async fn list_brands(&self) -> AppResult<Vec<Brand>> {
        self.repo.list_brands().await
    }

    pub async fn update_brand(&self, id: &str, dto: UpdateBrandDto) -> AppResult<Brand> {
        if let Some(name) = &dto.name {
            if name.trim().is_empty() {
                return Err(AppError::Validation("Brand name cannot be empty".to_string()));
            }
        }
        self.repo.update_brand(id, &dto).await
    }

    // --- UNITS ---

    pub async fn create_unit(&self, dto: CreateUnitDto) -> AppResult<Unit> {
        if dto.name.trim().is_empty() {
            return Err(AppError::Validation("Unit name is required".to_string()));
        }
        if let Some(factor) = dto.conversion_factor {
            if factor < 1 {
                return Err(AppError::Validation("Conversion factor must be >= 1".to_string()));
            }
        }

        let id = Uuid::new_v4().to_string();
        self.repo.create_unit(&id, &dto).await
    }

    pub async fn get_unit(&self, id: &str) -> AppResult<Unit> {
        self.repo.get_unit_by_id(id).await
    }

    pub async fn list_units(&self) -> AppResult<Vec<Unit>> {
        self.repo.list_units().await
    }

    pub async fn update_unit(&self, id: &str, dto: UpdateUnitDto) -> AppResult<Unit> {
        if let Some(name) = &dto.name {
            if name.trim().is_empty() {
                return Err(AppError::Validation("Unit name cannot be empty".to_string()));
            }
        }
        if let Some(factor) = dto.conversion_factor {
            if factor < 1 {
                return Err(AppError::Validation("Conversion factor must be >= 1".to_string()));
            }
        }
        self.repo.update_unit(id, &dto).await
    }

    // --- COMPANIES ---

    pub async fn create_company(&self, dto: CreateCompanyDto) -> AppResult<Company> {
        if dto.name.trim().is_empty() {
            return Err(AppError::Validation("Company name is required".to_string()));
        }

        let id = Uuid::new_v4().to_string();
        self.repo.create_company(&id, &dto).await
    }

    pub async fn get_company(&self, id: &str) -> AppResult<Company> {
        self.repo.get_company_by_id(id).await
    }

    pub async fn list_companies(&self) -> AppResult<Vec<Company>> {
        self.repo.list_companies().await
    }

    pub async fn update_company(&self, id: &str, dto: UpdateCompanyDto) -> AppResult<Company> {
        if let Some(name) = &dto.name {
            if name.trim().is_empty() {
                return Err(AppError::Validation("Company name cannot be empty".to_string()));
            }
        }
        self.repo.update_company(id, &dto).await
    }

    // --- QUALITIES ---

    pub async fn create_quality(&self, dto: CreateQualityDto) -> AppResult<Quality> {
        if dto.name.trim().is_empty() {
            return Err(AppError::Validation("Quality name is required".to_string()));
        }

        let id = Uuid::new_v4().to_string();
        self.repo.create_quality(&id, &dto).await
    }

    pub async fn get_quality(&self, id: &str) -> AppResult<Quality> {
        self.repo.get_quality_by_id(id).await
    }

    pub async fn list_qualities(&self) -> AppResult<Vec<Quality>> {
        self.repo.list_qualities().await
    }

    pub async fn update_quality(&self, id: &str, dto: UpdateQualityDto) -> AppResult<Quality> {
        if let Some(name) = &dto.name {
            if name.trim().is_empty() {
                return Err(AppError::Validation("Quality name cannot be empty".to_string()));
            }
        }
        self.repo.update_quality(id, &dto).await
    }

    // --- COLORS ---

    pub async fn create_color(&self, dto: CreateColorDto) -> AppResult<Color> {
        if dto.name.trim().is_empty() {
            return Err(AppError::Validation("Color name is required".to_string()));
        }

        let id = Uuid::new_v4().to_string();
        self.repo.create_color(&id, &dto).await
    }

    pub async fn get_color(&self, id: &str) -> AppResult<Color> {
        self.repo.get_color_by_id(id).await
    }

    pub async fn list_colors(&self) -> AppResult<Vec<Color>> {
        self.repo.list_colors().await
    }

    pub async fn update_color(&self, id: &str, dto: UpdateColorDto) -> AppResult<Color> {
        if let Some(name) = &dto.name {
            if name.trim().is_empty() {
                return Err(AppError::Validation("Color name cannot be empty".to_string()));
            }
        }
        self.repo.update_color(id, &dto).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations::MigrationRunner;

    async fn setup_test_service() -> CatalogService {
        let db = DatabaseConnection::open_in_memory().unwrap();
        {
            let conn_arc = db.inner();
            let mut guard = conn_arc.lock().await;
            MigrationRunner::run(&mut guard).unwrap();
        }
        CatalogService::new(db)
    }

    #[tokio::test]
    async fn test_category_lifecycle_and_duplicate_code_rejection() {
        let service = setup_test_service().await;

        let cat = service
            .create_category(CreateCategoryDto {
                name: "Smartphones".to_string(),
                code: "CAT-PHONE".to_string(),
                description: Some("Mobile phones".to_string()),
            })
            .await
            .expect("Category creation should succeed");

        assert_eq!(cat.name, "Smartphones");
        assert_eq!(cat.code, "CAT-PHONE");
        assert!(cat.is_active);

        // Duplicate code rejection
        let dup = service
            .create_category(CreateCategoryDto {
                name: "Phones 2".to_string(),
                code: "cat-phone".to_string(), // case-insensitive check via uppercase normalization
                description: None,
            })
            .await;
        assert!(dup.is_err(), "Duplicate category code must be rejected");

        // Update category
        let updated = service
            .update_category(
                &cat.id,
                UpdateCategoryDto {
                    name: Some("Smartphones & Tablets".to_string()),
                    description: None,
                    is_active: Some(false),
                },
            )
            .await
            .expect("Category update should succeed");

        assert_eq!(updated.name, "Smartphones & Tablets");
        assert!(!updated.is_active);
    }

    #[tokio::test]
    async fn test_brand_lifecycle_and_duplicate_code_rejection() {
        let service = setup_test_service().await;

        let brand = service
            .create_brand(CreateBrandDto {
                name: "Apple".to_string(),
                code: "BRD-APPLE".to_string(),
                description: Some("Apple Inc".to_string()),
            })
            .await
            .expect("Brand creation should succeed");

        assert_eq!(brand.name, "Apple");
        assert_eq!(brand.code, "BRD-APPLE");

        // Duplicate brand code rejection
        let dup = service
            .create_brand(CreateBrandDto {
                name: "Apple 2".to_string(),
                code: "BRD-APPLE".to_string(),
                description: None,
            })
            .await;
        assert!(dup.is_err(), "Duplicate brand code must be rejected");
    }

    #[tokio::test]
    async fn test_unit_validation_and_lifecycle() {
        let service = setup_test_service().await;

        // Invalid conversion factor (< 1) rejected
        let invalid = service
            .create_unit(CreateUnitDto {
                name: "Invalid Box".to_string(),
                symbol: Some("box".to_string()),
                conversion_factor: Some(0),
            })
            .await;
        assert!(invalid.is_err(), "Conversion factor < 1 must be rejected");

        let unit = service
            .create_unit(CreateUnitDto {
                name: "Box (10 pcs)".to_string(),
                symbol: Some("box".to_string()),
                conversion_factor: Some(10),
            })
            .await
            .expect("Unit creation should succeed");

        assert_eq!(unit.conversion_factor, 10);
        assert_eq!(unit.name, "Box (10 pcs)");
    }

    #[tokio::test]
    async fn test_company_quality_color_foundation() {
        let service = setup_test_service().await;

        // 1. Initial seeded master entries
        let companies = service.list_companies().await.expect("List companies should succeed");
        assert!(companies.len() >= 4, "Seeded companies should be present");

        let qualities = service.list_qualities().await.expect("List qualities should succeed");
        assert!(qualities.len() >= 5, "Seeded qualities should be present");

        let colors = service.list_colors().await.expect("List colors should succeed");
        assert!(colors.len() >= 8, "Seeded colors should be present");

        // 2. Create custom Company
        let new_comp = service
            .create_company(CreateCompanyDto {
                name: "Custom Importer".to_string(),
                code: Some("CMP-CUSTOM".to_string()),
                description: Some("Custom Sourcing".to_string()),
            })
            .await
            .expect("Custom company creation should succeed");
        assert_eq!(new_comp.name, "Custom Importer");
        assert_eq!(new_comp.code, "CMP_CUSTOM");

        // 3. Create custom Quality
        let new_qlt = service
            .create_quality(CreateQualityDto {
                name: "Super Grade".to_string(),
                code: Some("QLT-SUPER".to_string()),
                description: None,
            })
            .await
            .expect("Custom quality creation should succeed");
        assert_eq!(new_qlt.name, "Super Grade");

        // 4. Create custom Color
        let new_clr = service
            .create_color(CreateColorDto {
                name: "Titanium Gray".to_string(),
                code: Some("CLR-TITANIUM-GRAY".to_string()),
                description: None,
            })
            .await
            .expect("Custom color creation should succeed");
        assert_eq!(new_clr.name, "Titanium Gray");
    }
}
