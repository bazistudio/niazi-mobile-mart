use chrono::Utc;
use rusqlite::params;

use crate::db::connection::DatabaseConnection;
use crate::domain::catalog::{Brand, Category, CreateBrandDto, CreateCategoryDto, CreateUnitDto, Unit, UpdateBrandDto, UpdateCategoryDto, UpdateUnitDto};
use crate::errors::{AppError, AppResult};

#[derive(Clone)]
pub struct SQLiteCatalogRepository {
    db: DatabaseConnection,
}

impl SQLiteCatalogRepository {
    pub fn new(db: DatabaseConnection) -> Self {
        Self { db }
    }

    // --- CATEGORIES ---

    pub async fn create_category(&self, id: &str, dto: &CreateCategoryDto) -> AppResult<Category> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        let now = Utc::now().to_rfc3339();

        guard
            .execute(
                "INSERT INTO categories (id, name, code, description, is_active, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, 1, ?5, ?6)",
                params![id, dto.name.trim(), dto.code.trim().to_uppercase(), dto.description.as_deref(), now, now],
            )
            .map_err(|e| {
                if e.to_string().contains("UNIQUE constraint failed") {
                    AppError::Conflict(format!("Category code '{}' already exists", dto.code))
                } else {
                    AppError::Database(format!("Failed to create category: {e}"))
                }
            })?;

        Ok(Category {
            id: id.to_string(),
            name: dto.name.trim().to_string(),
            code: dto.code.trim().to_uppercase(),
            description: dto.description.clone(),
            is_active: true,
            created_at: now.clone(),
            updated_at: now,
        })
    }

    pub async fn get_category_by_id(&self, id: &str) -> AppResult<Category> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        guard
            .query_row(
                "SELECT id, name, code, description, is_active, created_at, updated_at FROM categories WHERE id = ?1",
                params![id],
                |row| {
                    Ok(Category {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        code: row.get(2)?,
                        description: row.get(3)?,
                        is_active: row.get::<_, i64>(4)? == 1,
                        created_at: row.get(5)?,
                        updated_at: row.get(6)?,
                    })
                },
            )
            .map_err(|e| match e {
                rusqlite::Error::QueryReturnedNoRows => AppError::NotFound(format!("Category '{id}' not found")),
                err => AppError::Database(format!("Failed to get category: {err}")),
            })
    }

    pub async fn list_categories(&self) -> AppResult<Vec<Category>> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        let mut stmt = guard
            .prepare("SELECT id, name, code, description, is_active, created_at, updated_at FROM categories ORDER BY name ASC")
            .map_err(|e| AppError::Database(format!("Failed to prepare category statement: {e}")))?;

        let iter = stmt
            .query_map([], |row| {
                Ok(Category {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    code: row.get(2)?,
                    description: row.get(3)?,
                    is_active: row.get::<_, i64>(4)? == 1,
                    created_at: row.get(5)?,
                    updated_at: row.get(6)?,
                })
            })
            .map_err(|e| AppError::Database(format!("Failed to query categories: {e}")))?;

        let mut categories = Vec::new();
        for cat in iter {
            categories.push(cat.map_err(|e| AppError::Database(format!("Category row error: {e}")))?);
        }
        Ok(categories)
    }

    pub async fn update_category(&self, id: &str, dto: &UpdateCategoryDto) -> AppResult<Category> {
        let current = self.get_category_by_id(id).await?;
        let now = Utc::now().to_rfc3339();

        let new_name = dto.name.as_deref().unwrap_or(&current.name).trim();
        let new_desc = dto.description.as_deref().or(current.description.as_deref());
        let new_active = dto.is_active.unwrap_or(current.is_active);

        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        guard
            .execute(
                "UPDATE categories SET name = ?1, description = ?2, is_active = ?3, updated_at = ?4 WHERE id = ?5",
                params![new_name, new_desc, if new_active { 1 } else { 0 }, now, id],
            )
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
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        let now = Utc::now().to_rfc3339();

        guard
            .execute(
                "INSERT INTO brands (id, name, code, description, is_active, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, 1, ?5, ?6)",
                params![id, dto.name.trim(), dto.code.trim().to_uppercase(), dto.description.as_deref(), now, now],
            )
            .map_err(|e| {
                if e.to_string().contains("UNIQUE constraint failed") {
                    AppError::Conflict(format!("Brand code '{}' already exists", dto.code))
                } else {
                    AppError::Database(format!("Failed to create brand: {e}"))
                }
            })?;

        Ok(Brand {
            id: id.to_string(),
            name: dto.name.trim().to_string(),
            code: dto.code.trim().to_uppercase(),
            description: dto.description.clone(),
            is_active: true,
            created_at: now.clone(),
            updated_at: now,
        })
    }

    pub async fn get_brand_by_id(&self, id: &str) -> AppResult<Brand> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        guard
            .query_row(
                "SELECT id, name, code, description, is_active, created_at, updated_at FROM brands WHERE id = ?1",
                params![id],
                |row| {
                    Ok(Brand {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        code: row.get(2)?,
                        description: row.get(3)?,
                        is_active: row.get::<_, i64>(4)? == 1,
                        created_at: row.get(5)?,
                        updated_at: row.get(6)?,
                    })
                },
            )
            .map_err(|e| match e {
                rusqlite::Error::QueryReturnedNoRows => AppError::NotFound(format!("Brand '{id}' not found")),
                err => AppError::Database(format!("Failed to get brand: {err}")),
            })
    }

    pub async fn list_brands(&self) -> AppResult<Vec<Brand>> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        let mut stmt = guard
            .prepare("SELECT id, name, code, description, is_active, created_at, updated_at FROM brands ORDER BY name ASC")
            .map_err(|e| AppError::Database(format!("Failed to prepare brand statement: {e}")))?;

        let iter = stmt
            .query_map([], |row| {
                Ok(Brand {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    code: row.get(2)?,
                    description: row.get(3)?,
                    is_active: row.get::<_, i64>(4)? == 1,
                    created_at: row.get(5)?,
                    updated_at: row.get(6)?,
                })
            })
            .map_err(|e| AppError::Database(format!("Failed to query brands: {e}")))?;

        let mut brands = Vec::new();
        for b in iter {
            brands.push(b.map_err(|e| AppError::Database(format!("Brand row error: {e}")))?);
        }
        Ok(brands)
    }

    pub async fn update_brand(&self, id: &str, dto: &UpdateBrandDto) -> AppResult<Brand> {
        let current = self.get_brand_by_id(id).await?;
        let now = Utc::now().to_rfc3339();

        let new_name = dto.name.as_deref().unwrap_or(&current.name).trim();
        let new_desc = dto.description.as_deref().or(current.description.as_deref());
        let new_active = dto.is_active.unwrap_or(current.is_active);

        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        guard
            .execute(
                "UPDATE brands SET name = ?1, description = ?2, is_active = ?3, updated_at = ?4 WHERE id = ?5",
                params![new_name, new_desc, if new_active { 1 } else { 0 }, now, id],
            )
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

        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        let now = Utc::now().to_rfc3339();

        guard
            .execute(
                "INSERT INTO units (id, name, symbol, conversion_factor, is_active, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, 1, ?5, ?6)",
                params![id, dto.name.trim(), dto.symbol.as_deref(), factor, now, now],
            )
            .map_err(|e| AppError::Database(format!("Failed to create unit: {e}")))?;

        Ok(Unit {
            id: id.to_string(),
            name: dto.name.trim().to_string(),
            symbol: dto.symbol.clone(),
            conversion_factor: factor,
            is_active: true,
            created_at: now.clone(),
            updated_at: now,
        })
    }

    pub async fn get_unit_by_id(&self, id: &str) -> AppResult<Unit> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        guard
            .query_row(
                "SELECT id, name, symbol, conversion_factor, is_active, created_at, updated_at FROM units WHERE id = ?1",
                params![id],
                |row| {
                    Ok(Unit {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        symbol: row.get(2)?,
                        conversion_factor: row.get(3)?,
                        is_active: row.get::<_, i64>(4)? == 1,
                        created_at: row.get(5)?,
                        updated_at: row.get(6)?,
                    })
                },
            )
            .map_err(|e| match e {
                rusqlite::Error::QueryReturnedNoRows => AppError::NotFound(format!("Unit '{id}' not found")),
                err => AppError::Database(format!("Failed to get unit: {err}")),
            })
    }

    pub async fn list_units(&self) -> AppResult<Vec<Unit>> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        let mut stmt = guard
            .prepare("SELECT id, name, symbol, conversion_factor, is_active, created_at, updated_at FROM units ORDER BY name ASC")
            .map_err(|e| AppError::Database(format!("Failed to prepare unit statement: {e}")))?;

        let iter = stmt
            .query_map([], |row| {
                Ok(Unit {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    symbol: row.get(2)?,
                    conversion_factor: row.get(3)?,
                    is_active: row.get::<_, i64>(4)? == 1,
                    created_at: row.get(5)?,
                    updated_at: row.get(6)?,
                })
            })
            .map_err(|e| AppError::Database(format!("Failed to query units: {e}")))?;

        let mut units = Vec::new();
        for u in iter {
            units.push(u.map_err(|e| AppError::Database(format!("Unit row error: {e}")))?);
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

        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        guard
            .execute(
                "UPDATE units SET name = ?1, symbol = ?2, conversion_factor = ?3, is_active = ?4, updated_at = ?5 WHERE id = ?6",
                params![new_name, new_sym, new_factor, if new_active { 1 } else { 0 }, now, id],
            )
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
