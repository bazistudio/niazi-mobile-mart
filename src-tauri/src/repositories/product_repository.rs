use chrono::Utc;
use rusqlite::params;

use crate::db::connection::DatabaseConnection;
use crate::domain::product::{CreateProductDto, Product, ProductFilter, UpdateProductDto};
use crate::errors::{AppError, AppResult};

#[derive(Clone)]
pub struct SQLiteProductRepository {
    db: DatabaseConnection,
}

impl SQLiteProductRepository {
    pub fn new(db: DatabaseConnection) -> Self {
        Self { db }
    }

    fn ensure_default_master_data(guard: &rusqlite::Connection) {
        let now = Utc::now().to_rfc3339();
        let _ = guard.execute(
            "INSERT OR IGNORE INTO categories (id, name, code, description, is_active, created_at, updated_at)
             VALUES ('00000000-0000-0000-0000-000000000010', 'General', 'GEN', 'Default Category', 1, ?1, ?1)",
            params![now],
        );
        let _ = guard.execute(
            "INSERT OR IGNORE INTO units (id, name, symbol, conversion_factor, is_active, created_at, updated_at)
             VALUES ('00000000-0000-0000-0000-000000000012', 'Piece', 'PCS', 1, 1, ?1, ?1)",
            params![now],
        );
    }

    /// Creates a new product. Enforces unique SKU and unique non-null Barcode.
    pub async fn create_product(&self, id: &str, dto: &CreateProductDto) -> AppResult<Product> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;
        Self::create_product_in_tx(&guard, id, dto).map_err(AppError::from)
    }

    pub async fn get_product_by_id(&self, id: &str) -> AppResult<Product> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        guard
            .query_row(
                "SELECT id, name, normalized_name, sku, barcode, category_id, brand_id, company_id, quality_id, color_id, unit_id, purchase_price, average_cost, sale_price, low_stock_threshold, is_active, description, created_at, updated_at
                 FROM products WHERE id = ?1",
                params![id],
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
                rusqlite::Error::QueryReturnedNoRows => AppError::NotFound(format!("Product '{id}' not found")),
                err => AppError::Database(format!("Failed to get product: {err}")),
            })
    }

    pub async fn get_product_by_sku(&self, sku: &str) -> AppResult<Product> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        guard
            .query_row(
                "SELECT id, name, normalized_name, sku, barcode, category_id, brand_id, company_id, quality_id, color_id, unit_id, purchase_price, average_cost, sale_price, low_stock_threshold, is_active, description, created_at, updated_at
                 FROM products WHERE sku = ?1",
                params![sku.trim().to_uppercase()],
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
                rusqlite::Error::QueryReturnedNoRows => AppError::NotFound(format!("Product with SKU '{sku}' not found")),
                err => AppError::Database(format!("Failed to get product by SKU: {err}")),
            })
    }

    pub async fn get_product_by_barcode(&self, barcode: &str) -> AppResult<Product> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        guard
            .query_row(
                "SELECT id, name, normalized_name, sku, barcode, category_id, brand_id, company_id, quality_id, color_id, unit_id, purchase_price, average_cost, sale_price, low_stock_threshold, is_active, description, created_at, updated_at
                 FROM products WHERE barcode = ?1",
                params![barcode.trim()],
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
                rusqlite::Error::QueryReturnedNoRows => AppError::NotFound(format!("Product with barcode '{barcode}' not found")),
                err => AppError::Database(format!("Failed to get product by barcode: {err}")),
            })
    }

    pub async fn list_products(&self, filter: &ProductFilter) -> AppResult<Vec<Product>> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        let mut query = "SELECT id, name, normalized_name, sku, barcode, category_id, brand_id, company_id, quality_id, color_id, unit_id, purchase_price, average_cost, sale_price, low_stock_threshold, is_active, description, created_at, updated_at FROM products WHERE 1=1".to_string();
        let mut param_values: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

        if let Some(search) = &filter.search {
            let term = format!("%{}%", search.trim());
            query.push_str(" AND (name LIKE ? OR sku LIKE ? OR barcode LIKE ?)");
            param_values.push(Box::new(term.clone()));
            param_values.push(Box::new(term.clone()));
            param_values.push(Box::new(term));
        }

        if let Some(cat_id) = &filter.category_id {
            query.push_str(" AND category_id = ?");
            param_values.push(Box::new(cat_id.clone()));
        }

        if let Some(brand_id) = &filter.brand_id {
            query.push_str(" AND brand_id = ?");
            param_values.push(Box::new(brand_id.clone()));
        }

        if let Some(company_id) = &filter.company_id {
            query.push_str(" AND company_id = ?");
            param_values.push(Box::new(company_id.clone()));
        }

        if let Some(quality_id) = &filter.quality_id {
            query.push_str(" AND quality_id = ?");
            param_values.push(Box::new(quality_id.clone()));
        }

        if let Some(color_id) = &filter.color_id {
            query.push_str(" AND color_id = ?");
            param_values.push(Box::new(color_id.clone()));
        }

        if let Some(active) = filter.is_active {
            query.push_str(" AND is_active = ?");
            param_values.push(Box::new(if active { 1 } else { 0 }));
        }

        query.push_str(" ORDER BY name ASC");

        let mut stmt = guard
            .prepare(&query)
            .map_err(|e| AppError::Database(format!("Failed to prepare product query: {e}")))?;

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
            .map_err(|e| AppError::Database(format!("Failed to query products: {e}")))?;

        let mut products = Vec::new();
        for p in iter {
            products.push(p.map_err(|e| AppError::Database(format!("Product row error: {e}")))?);
        }
        Ok(products)
    }

    pub async fn update_product(&self, id: &str, dto: &UpdateProductDto) -> AppResult<Product> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;
        Self::update_product_in_tx(&guard, id, dto).map_err(AppError::from)
    }

    /// Update product average_cost and last purchase_price atomically in an existing SQLite transaction
    pub fn update_cost_in_tx(
        conn: &rusqlite::Connection,
        product_id: &str,
        average_cost: i64,
        last_purchase_cost: i64,
        updated_at: &str,
    ) -> Result<(), rusqlite::Error> {
        conn.execute(
            "UPDATE products SET average_cost = ?1, purchase_price = ?2, updated_at = ?3 WHERE id = ?4",
            params![average_cost, last_purchase_cost, updated_at, product_id],
        )?;
        Ok(())
    }

    /// Deactivates a product. In accordance with Section 13, physical deletion is prohibited.
    pub async fn deactivate_product(&self, id: &str) -> AppResult<()> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        let now = Utc::now().to_rfc3339();
        let affected = guard
            .execute("UPDATE products SET is_active = 0, updated_at = ?1 WHERE id = ?2", params![now, id])
            .map_err(|e| AppError::Database(format!("Failed to deactivate product: {e}")))?;

        if affected == 0 {
            return Err(AppError::NotFound(format!("Product '{id}' not found")));
        }

        Ok(())
    }

    /// Transaction-aware helper to get a product by ID inside a SQLite transaction
    pub fn get_product_by_id_in_tx(
        conn: &rusqlite::Connection,
        id: &str,
    ) -> Result<Product, crate::db::errors::DbError> {
        conn.query_row(
            "SELECT id, name, normalized_name, sku, barcode, category_id, brand_id, company_id, quality_id, color_id, unit_id, purchase_price, average_cost, sale_price, low_stock_threshold, is_active, description, created_at, updated_at
             FROM products WHERE id = ?1",
            params![id],
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
            rusqlite::Error::QueryReturnedNoRows => crate::db::errors::DbError::NotFound(format!("Product '{id}' not found")),
            err => crate::db::errors::DbError::from(err),
        })
    }

    /// Checks for composite Product Master duplicate within an existing SQLite transaction.
    /// Composite identity = (normalized name, category_id, brand_id, unit_id, quality_id, color_id).
    /// Company (company_id) is EXCLUDED from Product identity.
    /// If exclude_id is provided (e.g. during update), that product ID is ignored.
    pub fn check_composite_duplicate_in_tx(
        conn: &rusqlite::Connection,
        name: &str,
        category_id: &str,
        unit_id: Option<&str>,
        brand_id: Option<&str>,
        quality_id: Option<&str>,
        color_id: Option<&str>,
        exclude_id: Option<&str>,
    ) -> Result<(), crate::db::errors::DbError> {
        let norm_name = crate::domain::product::normalize_product_name(name);
        if norm_name.is_empty() {
            return Ok(());
        }

        let safe_category_id = if category_id.trim().len() == 36 {
            category_id.trim().to_string()
        } else {
            "00000000-0000-0000-0000-000000000010".to_string()
        };

        let norm_unit = unit_id.map(str::trim).filter(|s| s.len() == 36).map(String::from);
        let norm_brand = brand_id.map(str::trim).filter(|s| s.len() == 36).map(String::from);
        let norm_quality = quality_id.map(str::trim).filter(|s| s.len() == 36).map(String::from);
        let norm_color = color_id.map(str::trim).filter(|s| s.len() == 36).map(String::from);

        let mut stmt = conn.prepare(
            "SELECT id, name, normalized_name, category_id, unit_id, brand_id, quality_id, color_id FROM products WHERE is_active = 1"
        )?;

        let iter = stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, Option<String>>(4)?,
                row.get::<_, Option<String>>(5)?,
                row.get::<_, Option<String>>(6)?,
                row.get::<_, Option<String>>(7)?,
            ))
        })?;

        for item in iter {
            let (id, _existing_name, existing_norm_name, existing_cat, existing_unit, existing_brand, existing_quality, existing_color) = item?;

            if let Some(ex_id) = exclude_id {
                if id == ex_id {
                    continue;
                }
            }

            let existing_safe_cat = if existing_cat.trim().len() == 36 {
                existing_cat.trim().to_string()
            } else {
                "00000000-0000-0000-0000-000000000010".to_string()
            };
            let existing_norm_unit = existing_unit.as_deref().map(str::trim).filter(|s| s.len() == 36).map(String::from);
            let existing_norm_brand = existing_brand.as_deref().map(str::trim).filter(|s| s.len() == 36).map(String::from);
            let existing_norm_quality = existing_quality.as_deref().map(str::trim).filter(|s| s.len() == 36).map(String::from);
            let existing_norm_color = existing_color.as_deref().map(str::trim).filter(|s| s.len() == 36).map(String::from);

            if existing_norm_name == norm_name
                && existing_safe_cat == safe_category_id
                && existing_norm_unit == norm_unit
                && existing_norm_brand == norm_brand
                && existing_norm_quality == norm_quality
                && existing_norm_color == norm_color
            {
                return Err(crate::db::errors::DbError::ValidationError(
                    "An equivalent product already exists.".to_string()
                ));
            }
        }

        Ok(())
    }

    /// Transaction-aware helper to create a product inside a SQLite transaction
    pub fn create_product_in_tx(
        conn: &rusqlite::Connection,
        id: &str,
        dto: &CreateProductDto,
    ) -> Result<Product, crate::db::errors::DbError> {
        Self::ensure_default_master_data(conn);

        let now = Utc::now().to_rfc3339();
        let threshold = dto.low_stock_threshold.unwrap_or(5);
        let barcode_opt = dto.barcode.as_deref().map(str::trim).filter(|s| !s.is_empty());
        let initial_avg_cost = dto.average_cost.unwrap_or(dto.purchase_price);

        let norm_name = crate::domain::product::normalize_product_name(&dto.name);

        let safe_category_id = if dto.category_id.trim().len() == 36 {
            dto.category_id.trim().to_string()
        } else {
            "00000000-0000-0000-0000-000000000010".to_string()
        };

        let safe_brand_id = dto
            .brand_id
            .as_deref()
            .map(str::trim)
            .filter(|s| s.len() == 36)
            .map(String::from);

        let safe_company_id = dto
            .company_id
            .as_deref()
            .map(str::trim)
            .filter(|s| s.len() == 36)
            .map(String::from);

        let safe_quality_id = dto
            .quality_id
            .as_deref()
            .map(str::trim)
            .filter(|s| s.len() == 36)
            .map(String::from);

        let safe_color_id = dto
            .color_id
            .as_deref()
            .map(str::trim)
            .filter(|s| s.len() == 36)
            .map(String::from);

        let safe_unit_id = dto
            .unit_id
            .as_deref()
            .map(str::trim)
            .filter(|s| s.len() == 36)
            .map(String::from);

        Self::check_composite_duplicate_in_tx(
            conn,
            &dto.name,
            &safe_category_id,
            safe_unit_id.as_deref(),
            safe_brand_id.as_deref(),
            safe_quality_id.as_deref(),
            safe_color_id.as_deref(),
            None,
        )?;

        conn.execute(
            "INSERT INTO products (id, name, normalized_name, sku, barcode, category_id, brand_id, company_id, quality_id, color_id, unit_id, purchase_price, average_cost, sale_price, low_stock_threshold, is_active, description, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, 1, ?16, ?17, ?18)",
            params![
                id,
                dto.name.trim(),
                norm_name,
                dto.sku.trim().to_uppercase(),
                barcode_opt,
                safe_category_id,
                safe_brand_id,
                safe_company_id,
                safe_quality_id,
                safe_color_id,
                safe_unit_id,
                dto.purchase_price,
                initial_avg_cost,
                dto.sale_price,
                threshold,
                dto.description.as_deref(),
                now,
                now,
            ],
        )
        .map_err(|e| {
            let err_str = e.to_string();
            if err_str.contains("idx_products_composite_identity") || err_str.contains("products_composite_identity_key") {
                crate::db::errors::DbError::ValidationError("An equivalent product already exists.".to_string())
            } else if err_str.contains("UNIQUE constraint failed: products.sku") {
                crate::db::errors::DbError::ValidationError(format!("Product with SKU '{}' already exists", dto.sku))
            } else if err_str.contains("UNIQUE constraint failed: products.barcode") {
                crate::db::errors::DbError::ValidationError(format!("Product with barcode '{}' already exists", dto.barcode.as_deref().unwrap_or("")))
            } else {
                crate::db::errors::DbError::from(e)
            }
        })?;

        Ok(Product {
            id: id.to_string(),
            name: dto.name.trim().to_string(),
            normalized_name: norm_name,
            sku: dto.sku.trim().to_uppercase(),
            barcode: barcode_opt.map(|s| s.to_string()),
            category_id: safe_category_id,
            brand_id: safe_brand_id,
            company_id: safe_company_id,
            quality_id: safe_quality_id,
            color_id: safe_color_id,
            unit_id: safe_unit_id,
            purchase_price: dto.purchase_price,
            average_cost: initial_avg_cost,
            sale_price: dto.sale_price,
            low_stock_threshold: threshold,
            is_active: true,
            description: dto.description.clone(),
            initial_quantity: dto.initial_quantity,
            created_at: now.clone(),
            updated_at: now,
        })
    }

    /// Transaction-aware helper to insert/upsert a complete Product entity inside a SQLite transaction (downstream apply)
    pub fn insert_product_in_tx(
        conn: &rusqlite::Connection,
        product: &Product,
    ) -> Result<(), crate::db::errors::DbError> {
        Self::ensure_default_master_data(conn);

        let barcode_opt = product.barcode.as_deref().map(str::trim).filter(|s| !s.is_empty());
        let norm_name = if product.normalized_name.is_empty() {
            crate::domain::product::normalize_product_name(&product.name)
        } else {
            product.normalized_name.clone()
        };

        let safe_category_id = if product.category_id.trim().len() == 36 {
            product.category_id.trim().to_string()
        } else {
            "00000000-0000-0000-0000-000000000010".to_string()
        };

        let safe_brand_id = product
            .brand_id
            .as_deref()
            .map(str::trim)
            .filter(|s| s.len() == 36)
            .map(String::from);

        let safe_company_id = product
            .company_id
            .as_deref()
            .map(str::trim)
            .filter(|s| s.len() == 36)
            .map(String::from);

        let safe_quality_id = product
            .quality_id
            .as_deref()
            .map(str::trim)
            .filter(|s| s.len() == 36)
            .map(String::from);

        let safe_color_id = product
            .color_id
            .as_deref()
            .map(str::trim)
            .filter(|s| s.len() == 36)
            .map(String::from);

        let safe_unit_id = product
            .unit_id
            .as_deref()
            .map(str::trim)
            .filter(|s| s.len() == 36)
            .map(String::from);

        conn.execute(
            "INSERT INTO products (id, name, normalized_name, sku, barcode, category_id, brand_id, company_id, quality_id, color_id, unit_id, purchase_price, average_cost, sale_price, low_stock_threshold, is_active, description, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19)
             ON CONFLICT (id) DO UPDATE SET
                name = EXCLUDED.name,
                normalized_name = EXCLUDED.normalized_name,
                sku = EXCLUDED.sku,
                barcode = EXCLUDED.barcode,
                category_id = EXCLUDED.category_id,
                brand_id = EXCLUDED.brand_id,
                company_id = EXCLUDED.company_id,
                quality_id = EXCLUDED.quality_id,
                color_id = EXCLUDED.color_id,
                unit_id = EXCLUDED.unit_id,
                purchase_price = EXCLUDED.purchase_price,
                average_cost = EXCLUDED.average_cost,
                sale_price = EXCLUDED.sale_price,
                low_stock_threshold = EXCLUDED.low_stock_threshold,
                is_active = EXCLUDED.is_active,
                description = EXCLUDED.description,
                updated_at = EXCLUDED.updated_at",
            params![
                product.id,
                product.name.trim(),
                norm_name,
                product.sku.trim().to_uppercase(),
                barcode_opt,
                safe_category_id,
                safe_brand_id,
                safe_company_id,
                safe_quality_id,
                safe_color_id,
                safe_unit_id,
                product.purchase_price,
                product.average_cost,
                product.sale_price,
                product.low_stock_threshold,
                if product.is_active { 1 } else { 0 },
                product.description.as_deref(),
                product.created_at,
                product.updated_at,
            ],
        )
        .map_err(crate::db::errors::DbError::from)?;

        Ok(())
    }

    /// Transaction-aware helper to update a product inside a SQLite transaction
    pub fn update_product_in_tx(
        conn: &rusqlite::Connection,
        id: &str,
        dto: &UpdateProductDto,
    ) -> Result<Product, crate::db::errors::DbError> {
        Self::ensure_default_master_data(conn);

        let current: Product = Self::get_product_by_id_in_tx(conn, id)?;

        let now = Utc::now().to_rfc3339();

        let new_name = dto.name.as_deref().unwrap_or(&current.name).trim();
        let new_norm_name = crate::domain::product::normalize_product_name(new_name);

        let new_barcode = if let Some(bc) = &dto.barcode {
            let trimmed = bc.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        } else {
            current.barcode
        };

        let raw_category = dto.category_id.as_deref().unwrap_or(&current.category_id).trim();
        let safe_category = if raw_category.len() == 36 {
            raw_category
        } else if current.category_id.len() == 36 {
            &current.category_id
        } else {
            "00000000-0000-0000-0000-000000000010"
        };

        let raw_brand = dto.brand_id.as_deref().or(current.brand_id.as_deref());
        let safe_brand = raw_brand.filter(|b| b.trim().len() == 36);

        let raw_company = dto.company_id.as_deref().or(current.company_id.as_deref());
        let safe_company = raw_company.filter(|c| c.trim().len() == 36);

        let raw_quality = dto.quality_id.as_deref().or(current.quality_id.as_deref());
        let safe_quality = raw_quality.filter(|q| q.trim().len() == 36);

        let raw_color = dto.color_id.as_deref().or(current.color_id.as_deref());
        let safe_color = raw_color.filter(|c| c.trim().len() == 36);

        let raw_unit = dto.unit_id.as_deref().or(current.unit_id.as_deref());
        let safe_unit = raw_unit.filter(|u| u.trim().len() == 36);

        let new_purchase = dto.purchase_price.unwrap_or(current.purchase_price);
        let new_avg_cost = dto.average_cost.unwrap_or(current.average_cost);
        let new_sale = dto.sale_price.unwrap_or(current.sale_price);
        let new_threshold = dto.low_stock_threshold.unwrap_or(current.low_stock_threshold);
        let new_desc = dto.description.as_deref().or(current.description.as_deref());
        let new_active = dto.is_active.unwrap_or(current.is_active);

        if new_purchase < 0 || new_avg_cost < 0 || new_sale < 0 || new_threshold < 0 {
            return Err(crate::db::errors::DbError::ValidationError("Prices and threshold cannot be negative".to_string()));
        }

        Self::check_composite_duplicate_in_tx(
            conn,
            new_name,
            safe_category,
            safe_unit,
            safe_brand,
            safe_quality,
            safe_color,
            Some(id),
        )?;

        conn.execute(
            "UPDATE products
             SET name = ?1, normalized_name = ?2, barcode = ?3, category_id = ?4, brand_id = ?5,
                 company_id = ?6, quality_id = ?7, color_id = ?8, unit_id = ?9,
                 purchase_price = ?10, average_cost = ?11, sale_price = ?12, low_stock_threshold = ?13,
                 is_active = ?14, description = ?15, updated_at = ?16
             WHERE id = ?17",
            params![
                new_name,
                new_norm_name,
                new_barcode,
                safe_category,
                safe_brand,
                safe_company,
                safe_quality,
                safe_color,
                safe_unit,
                new_purchase,
                new_avg_cost,
                new_sale,
                new_threshold,
                if new_active { 1 } else { 0 },
                new_desc,
                now,
                id,
            ],
        )
        .map_err(|e| {
            let err_str = e.to_string();
            if err_str.contains("idx_products_composite_identity") || err_str.contains("products_composite_identity_key") {
                crate::db::errors::DbError::ValidationError("An equivalent product already exists.".to_string())
            } else if err_str.contains("UNIQUE constraint failed: products.barcode") {
                crate::db::errors::DbError::ValidationError("Barcode is already used by another product".to_string())
            } else {
                crate::db::errors::DbError::from(e)
            }
        })?;

        Ok(Product {
            id: id.to_string(),
            name: new_name.to_string(),
            normalized_name: new_norm_name,
            sku: current.sku,
            barcode: new_barcode,
            category_id: safe_category.to_string(),
            brand_id: safe_brand.map(|s| s.to_string()),
            company_id: safe_company.map(|s| s.to_string()),
            quality_id: safe_quality.map(|s| s.to_string()),
            color_id: safe_color.map(|s| s.to_string()),
            unit_id: safe_unit.map(|s| s.to_string()),
            purchase_price: new_purchase,
            average_cost: new_avg_cost,
            sale_price: new_sale,
            low_stock_threshold: new_threshold,
            is_active: new_active,
            description: new_desc.map(|s| s.to_string()),
            initial_quantity: None,
            created_at: current.created_at,
            updated_at: now,
        })
    }

    /// Transaction-aware helper to deactivate a product inside a SQLite transaction
    pub fn deactivate_product_in_tx(
        conn: &rusqlite::Connection,
        id: &str,
    ) -> Result<(), crate::db::errors::DbError> {
        let now = Utc::now().to_rfc3339();
        let affected = conn
            .execute("UPDATE products SET is_active = 0, updated_at = ?1 WHERE id = ?2", params![now, id])
            .map_err(crate::db::errors::DbError::from)?;

        if affected == 0 {
            return Err(crate::db::errors::DbError::NotFound(format!("Product '{id}' not found")));
        }

        Ok(())
    }
}
