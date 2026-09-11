use chrono::Utc;
use sqlx::{PgPool, Row};

use crate::domain::catalog::{
    Brand, Category, CreateBrandDto, CreateCategoryDto, CreateUnitDto, Unit, UpdateBrandDto,
    UpdateCategoryDto, UpdateUnitDto,
};
use crate::errors::{AppError, AppResult};

#[derive(Clone)]
pub struct PostgresCatalogRepository {
    pool: PgPool,
}

impl PostgresCatalogRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    // --- CATEGORIES ---

    pub async fn create_category(&self, id: &str, dto: &CreateCategoryDto) -> AppResult<Category> {
        let now = Utc::now().to_rfc3339();
        let code = dto.code.trim().to_uppercase();
        let name = dto.name.trim();

        sqlx::query(
            "INSERT INTO categories (id, name, code, description, is_active, created_at, updated_at)
             VALUES ($1, $2, $3, $4, 1, $5, $6)",
        )
        .bind(id)
        .bind(name)
        .bind(&code)
        .bind(dto.description.as_deref())
        .bind(&now)
        .bind(&now)
        .execute(&self.pool)
        .await
        .map_err(|e| {
            let msg = e.to_string();
            if msg.contains("unique") || msg.contains("UNIQUE") {
                AppError::Conflict(format!("Category code '{code}' already exists"))
            } else {
                AppError::Database(format!("Failed to create category: {e}"))
            }
        })?;

        Ok(Category {
            id: id.to_string(),
            name: name.to_string(),
            code,
            description: dto.description.clone(),
            is_active: true,
            created_at: now.clone(),
            updated_at: now,
        })
    }

    pub async fn get_category_by_id(&self, id: &str) -> AppResult<Category> {
        let row_opt = sqlx::query("SELECT id, name, code, description, is_active, created_at, updated_at FROM categories WHERE id = $1")
            .bind(id)
            .fetch_optional(&self.pool)
            .await
            .map_err(|e| AppError::Database(format!("Failed to get category: {e}")))?;

        match row_opt {
            Some(row) => {
                let is_active_int: i32 = row.try_get(4).unwrap_or(1);
                Ok(Category {
                    id: row.try_get(0).map_err(|e| AppError::Database(e.to_string()))?,
                    name: row.try_get(1).map_err(|e| AppError::Database(e.to_string()))?,
                    code: row.try_get(2).map_err(|e| AppError::Database(e.to_string()))?,
                    description: row.try_get(3).unwrap_or(None),
                    is_active: is_active_int == 1,
                    created_at: row.try_get(5).map_err(|e| AppError::Database(e.to_string()))?,
                    updated_at: row.try_get(6).map_err(|e| AppError::Database(e.to_string()))?,
                })
            }
            None => Err(AppError::NotFound(format!("Category '{id}' not found"))),
        }
    }

    pub async fn list_categories(&self) -> AppResult<Vec<Category>> {
        let rows = sqlx::query("SELECT id, name, code, description, is_active, created_at, updated_at FROM categories ORDER BY name ASC")
            .fetch_all(&self.pool)
            .await
            .map_err(|e| AppError::Database(format!("Failed to query categories: {e}")))?;

        let mut categories = Vec::with_capacity(rows.len());
        for row in rows {
            let is_active_int: i32 = row.try_get(4).unwrap_or(1);
            categories.push(Category {
                id: row.try_get(0).map_err(|e| AppError::Database(e.to_string()))?,
                name: row.try_get(1).map_err(|e| AppError::Database(e.to_string()))?,
                code: row.try_get(2).map_err(|e| AppError::Database(e.to_string()))?,
                description: row.try_get(3).unwrap_or(None),
                is_active: is_active_int == 1,
                created_at: row.try_get(5).map_err(|e| AppError::Database(e.to_string()))?,
                updated_at: row.try_get(6).map_err(|e| AppError::Database(e.to_string()))?,
            });
        }
        Ok(categories)
    }

    pub async fn update_category(&self, id: &str, dto: &UpdateCategoryDto) -> AppResult<Category> {
        let current = self.get_category_by_id(id).await?;
        let now = Utc::now().to_rfc3339();

        let new_name = dto.name.as_deref().unwrap_or(&current.name).trim();
        let new_desc = dto.description.as_deref().or(current.description.as_deref());
        let new_active = dto.is_active.unwrap_or(current.is_active);

        sqlx::query("UPDATE categories SET name = $1, description = $2, is_active = $3, updated_at = $4 WHERE id = $5")
            .bind(new_name)
            .bind(new_desc)
            .bind(if new_active { 1 } else { 0 })
            .bind(&now)
            .bind(id)
            .execute(&self.pool)
            .await
            .map_err(|e| AppError::Database(format!("Failed to update category: {e}")))?;

        Ok(Category {
            id: id.to_string(),
            name: new_name.to_string(),
            code: current.code,
            description: new_desc.map(|s| s.to_string()),
            is_active: new_active,
            created_at: current.created_at,
            updated_at: now,
        })
    }

    // --- BRANDS ---

    pub async fn create_brand(&self, id: &str, dto: &CreateBrandDto) -> AppResult<Brand> {
        let now = Utc::now().to_rfc3339();
        let code = dto.code.trim().to_uppercase();
        let name = dto.name.trim();

        sqlx::query(
            "INSERT INTO brands (id, name, code, description, is_active, created_at, updated_at)
             VALUES ($1, $2, $3, $4, 1, $5, $6)",
        )
        .bind(id)
        .bind(name)
        .bind(&code)
        .bind(dto.description.as_deref())
        .bind(&now)
        .bind(&now)
        .execute(&self.pool)
        .await
        .map_err(|e| {
            let msg = e.to_string();
            if msg.contains("unique") || msg.contains("UNIQUE") {
                AppError::Conflict(format!("Brand code '{code}' already exists"))
            } else {
                AppError::Database(format!("Failed to create brand: {e}"))
            }
        })?;

        Ok(Brand {
            id: id.to_string(),
            name: name.to_string(),
            code,
            description: dto.description.clone(),
            is_active: true,
            created_at: now.clone(),
            updated_at: now,
        })
    }

    pub async fn get_brand_by_id(&self, id: &str) -> AppResult<Brand> {
        let row_opt = sqlx::query("SELECT id, name, code, description, is_active, created_at, updated_at FROM brands WHERE id = $1")
            .bind(id)
            .fetch_optional(&self.pool)
            .await
            .map_err(|e| AppError::Database(format!("Failed to get brand: {e}")))?;

        match row_opt {
            Some(row) => {
                let is_active_int: i32 = row.try_get(4).unwrap_or(1);
                Ok(Brand {
                    id: row.try_get(0).map_err(|e| AppError::Database(e.to_string()))?,
                    name: row.try_get(1).map_err(|e| AppError::Database(e.to_string()))?,
                    code: row.try_get(2).map_err(|e| AppError::Database(e.to_string()))?,
                    description: row.try_get(3).unwrap_or(None),
                    is_active: is_active_int == 1,
                    created_at: row.try_get(5).map_err(|e| AppError::Database(e.to_string()))?,
                    updated_at: row.try_get(6).map_err(|e| AppError::Database(e.to_string()))?,
                })
            }
            None => Err(AppError::NotFound(format!("Brand '{id}' not found"))),
        }
    }

    pub async fn list_brands(&self) -> AppResult<Vec<Brand>> {
        let rows = sqlx::query("SELECT id, name, code, description, is_active, created_at, updated_at FROM brands ORDER BY name ASC")
            .fetch_all(&self.pool)
            .await
            .map_err(|e| AppError::Database(format!("Failed to query brands: {e}")))?;

        let mut brands = Vec::with_capacity(rows.len());
        for row in rows {
            let is_active_int: i32 = row.try_get(4).unwrap_or(1);
            brands.push(Brand {
                id: row.try_get(0).map_err(|e| AppError::Database(e.to_string()))?,
                name: row.try_get(1).map_err(|e| AppError::Database(e.to_string()))?,
                code: row.try_get(2).map_err(|e| AppError::Database(e.to_string()))?,
                description: row.try_get(3).unwrap_or(None),
                is_active: is_active_int == 1,
                created_at: row.try_get(5).map_err(|e| AppError::Database(e.to_string()))?,
                updated_at: row.try_get(6).map_err(|e| AppError::Database(e.to_string()))?,
            });
        }
        Ok(brands)
    }

    pub async fn update_brand(&self, id: &str, dto: &UpdateBrandDto) -> AppResult<Brand> {
        let current = self.get_brand_by_id(id).await?;
        let now = Utc::now().to_rfc3339();

        let new_name = dto.name.as_deref().unwrap_or(&current.name).trim();
        let new_desc = dto.description.as_deref().or(current.description.as_deref());
        let new_active = dto.is_active.unwrap_or(current.is_active);

        sqlx::query("UPDATE brands SET name = $1, description = $2, is_active = $3, updated_at = $4 WHERE id = $5")
            .bind(new_name)
            .bind(new_desc)
            .bind(if new_active { 1 } else { 0 })
            .bind(&now)
            .bind(id)
            .execute(&self.pool)
            .await
            .map_err(|e| AppError::Database(format!("Failed to update brand: {e}")))?;

        Ok(Brand {
            id: id.to_string(),
            name: new_name.to_string(),
            code: current.code,
            description: new_desc.map(|s| s.to_string()),
            is_active: new_active,
            created_at: current.created_at,
            updated_at: now,
        })
    }

    // --- UNITS ---

    pub async fn create_unit(&self, id: &str, dto: &CreateUnitDto) -> AppResult<Unit> {
        let factor = dto.conversion_factor.unwrap_or(1);
        if factor < 1 {
            return Err(AppError::Validation("Unit conversion factor must be at least 1".to_string()));
        }

        let now = Utc::now().to_rfc3339();
        let name = dto.name.trim();

        sqlx::query(
            "INSERT INTO units (id, name, symbol, conversion_factor, is_active, created_at, updated_at)
             VALUES ($1, $2, $3, $4, 1, $5, $6)",
        )
        .bind(id)
        .bind(name)
        .bind(dto.symbol.as_deref())
        .bind(factor)
        .bind(&now)
        .bind(&now)
        .execute(&self.pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to create unit: {e}")))?;

        Ok(Unit {
            id: id.to_string(),
            name: name.to_string(),
            symbol: dto.symbol.clone(),
            conversion_factor: factor,
            is_active: true,
            created_at: now.clone(),
            updated_at: now,
        })
    }

    pub async fn get_unit_by_id(&self, id: &str) -> AppResult<Unit> {
        let row_opt = sqlx::query("SELECT id, name, symbol, conversion_factor, is_active, created_at, updated_at FROM units WHERE id = $1")
            .bind(id)
            .fetch_optional(&self.pool)
            .await
            .map_err(|e| AppError::Database(format!("Failed to get unit: {e}")))?;

        match row_opt {
            Some(row) => {
                let is_active_int: i32 = row.try_get(4).unwrap_or(1);
                Ok(Unit {
                    id: row.try_get(0).map_err(|e| AppError::Database(e.to_string()))?,
                    name: row.try_get(1).map_err(|e| AppError::Database(e.to_string()))?,
                    symbol: row.try_get(2).unwrap_or(None),
                    conversion_factor: row.try_get(3).unwrap_or(1),
                    is_active: is_active_int == 1,
                    created_at: row.try_get(5).map_err(|e| AppError::Database(e.to_string()))?,
                    updated_at: row.try_get(6).map_err(|e| AppError::Database(e.to_string()))?,
                })
            }
            None => Err(AppError::NotFound(format!("Unit '{id}' not found"))),
        }
    }

    pub async fn list_units(&self) -> AppResult<Vec<Unit>> {
        let rows = sqlx::query("SELECT id, name, symbol, conversion_factor, is_active, created_at, updated_at FROM units ORDER BY name ASC")
            .fetch_all(&self.pool)
            .await
            .map_err(|e| AppError::Database(format!("Failed to query units: {e}")))?;

        let mut units = Vec::with_capacity(rows.len());
        for row in rows {
            let is_active_int: i32 = row.try_get(4).unwrap_or(1);
            units.push(Unit {
                id: row.try_get(0).map_err(|e| AppError::Database(e.to_string()))?,
                name: row.try_get(1).map_err(|e| AppError::Database(e.to_string()))?,
                symbol: row.try_get(2).unwrap_or(None),
                conversion_factor: row.try_get(3).unwrap_or(1),
                is_active: is_active_int == 1,
                created_at: row.try_get(5).map_err(|e| AppError::Database(e.to_string()))?,
                updated_at: row.try_get(6).map_err(|e| AppError::Database(e.to_string()))?,
            });
        }
        Ok(units)
    }

    pub async fn update_unit(&self, id: &str, dto: &UpdateUnitDto) -> AppResult<Unit> {
        let current = self.get_unit_by_id(id).await?;
        let now = Utc::now().to_rfc3339();

        let new_name = dto.name.as_deref().unwrap_or(&current.name).trim();
        let new_sym = dto.symbol.as_deref().or(current.symbol.as_deref());
        let new_factor = dto.conversion_factor.unwrap_or(current.conversion_factor);
        if new_factor < 1 {
            return Err(AppError::Validation("Unit conversion factor must be >= 1".to_string()));
        }
        let new_active = dto.is_active.unwrap_or(current.is_active);

        sqlx::query("UPDATE units SET name = $1, symbol = $2, conversion_factor = $3, is_active = $4, updated_at = $5 WHERE id = $6")
            .bind(new_name)
            .bind(new_sym)
            .bind(new_factor)
            .bind(if new_active { 1 } else { 0 })
            .bind(&now)
            .bind(id)
            .execute(&self.pool)
            .await
            .map_err(|e| AppError::Database(format!("Failed to update unit: {e}")))?;

        Ok(Unit {
            id: id.to_string(),
            name: new_name.to_string(),
            symbol: new_sym.map(|s| s.to_string()),
            conversion_factor: new_factor,
            is_active: new_active,
            created_at: current.created_at,
            updated_at: now,
        })
    }
}
