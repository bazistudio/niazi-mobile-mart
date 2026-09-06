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

    /// Creates a new product. Enforces unique SKU and unique non-null Barcode.
    pub async fn create_product(&self, id: &str, dto: &CreateProductDto) -> AppResult<Product> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        let now = Utc::now().to_rfc3339();
        let threshold = dto.low_stock_threshold.unwrap_or(5);
        let barcode_opt = dto.barcode.as_deref().map(str::trim).filter(|s| !s.is_empty());

        guard
            .execute(
                "INSERT INTO products (id, name, sku, barcode, category_id, brand_id, unit_id, purchase_price, sale_price, low_stock_threshold, is_active, description, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 1, ?11, ?12, ?13)",
                params![
                    id,
                    dto.name.trim(),
                    dto.sku.trim().to_uppercase(),
                    barcode_opt,
                    dto.category_id,
                    dto.brand_id.as_deref(),
                    dto.unit_id.as_deref(),
                    dto.purchase_price,
                    dto.sale_price,
                    threshold,
                    dto.description.as_deref(),
                    now,
                    now,
                ],
            )
            .map_err(|e| {
                let err_str = e.to_string();
                if err_str.contains("UNIQUE constraint failed: products.sku") {
                    AppError::Conflict(format!("Product with SKU '{}' already exists", dto.sku))
                } else if err_str.contains("UNIQUE constraint failed: products.barcode") {
                    AppError::Conflict(format!("Product with barcode '{}' already exists", dto.barcode.as_deref().unwrap_or("")))
                } else if err_str.contains("FOREIGN KEY constraint failed") {
                    AppError::Validation(format!("Invalid category, brand, or unit reference in product: {e}"))
                } else {
                    AppError::Database(format!("Failed to create product: {e}"))
                }
            })?;

        Ok(Product {
            id: id.to_string(),
            name: dto.name.trim().to_string(),
            sku: dto.sku.trim().to_uppercase(),
            barcode: barcode_opt.map(|s| s.to_string()),
            category_id: dto.category_id.clone(),
            brand_id: dto.brand_id.clone(),
            unit_id: dto.unit_id.clone(),
            purchase_price: dto.purchase_price,
            sale_price: dto.sale_price,
            low_stock_threshold: threshold,
            is_active: true,
            description: dto.description.clone(),
            created_at: now.clone(),
            updated_at: now,
        })
    }

    pub async fn get_product_by_id(&self, id: &str) -> AppResult<Product> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        guard
            .query_row(
                "SELECT id, name, sku, barcode, category_id, brand_id, unit_id, purchase_price, sale_price, low_stock_threshold, is_active, description, created_at, updated_at
                 FROM products WHERE id = ?1",
                params![id],
                |row| {
                    Ok(Product {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        sku: row.get(2)?,
                        barcode: row.get(3)?,
                        category_id: row.get(4)?,
                        brand_id: row.get(5)?,
                        unit_id: row.get(6)?,
                        purchase_price: row.get(7)?,
                        sale_price: row.get(8)?,
                        low_stock_threshold: row.get(9)?,
                        is_active: row.get::<_, i64>(10)? == 1,
                        description: row.get(11)?,
                        created_at: row.get(12)?,
                        updated_at: row.get(13)?,
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
                "SELECT id, name, sku, barcode, category_id, brand_id, unit_id, purchase_price, sale_price, low_stock_threshold, is_active, description, created_at, updated_at
                 FROM products WHERE sku = ?1",
                params![sku.trim().to_uppercase()],
                |row| {
                    Ok(Product {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        sku: row.get(2)?,
                        barcode: row.get(3)?,
                        category_id: row.get(4)?,
                        brand_id: row.get(5)?,
                        unit_id: row.get(6)?,
                        purchase_price: row.get(7)?,
                        sale_price: row.get(8)?,
                        low_stock_threshold: row.get(9)?,
                        is_active: row.get::<_, i64>(10)? == 1,
                        description: row.get(11)?,
                        created_at: row.get(12)?,
                        updated_at: row.get(13)?,
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
                "SELECT id, name, sku, barcode, category_id, brand_id, unit_id, purchase_price, sale_price, low_stock_threshold, is_active, description, created_at, updated_at
                 FROM products WHERE barcode = ?1",
                params![barcode.trim()],
                |row| {
                    Ok(Product {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        sku: row.get(2)?,
                        barcode: row.get(3)?,
                        category_id: row.get(4)?,
                        brand_id: row.get(5)?,
                        unit_id: row.get(6)?,
                        purchase_price: row.get(7)?,
                        sale_price: row.get(8)?,
                        low_stock_threshold: row.get(9)?,
                        is_active: row.get::<_, i64>(10)? == 1,
                        description: row.get(11)?,
                        created_at: row.get(12)?,
                        updated_at: row.get(13)?,
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

        let mut query = "SELECT id, name, sku, barcode, category_id, brand_id, unit_id, purchase_price, sale_price, low_stock_threshold, is_active, description, created_at, updated_at FROM products WHERE 1=1".to_string();
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
                    sku: row.get(2)?,
                    barcode: row.get(3)?,
                    category_id: row.get(4)?,
                    brand_id: row.get(5)?,
                    unit_id: row.get(6)?,
                    purchase_price: row.get(7)?,
                    sale_price: row.get(8)?,
                    low_stock_threshold: row.get(9)?,
                    is_active: row.get::<_, i64>(10)? == 1,
                    description: row.get(11)?,
                    created_at: row.get(12)?,
                    updated_at: row.get(13)?,
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
        let current = self.get_product_by_id(id).await?;
        let now = Utc::now().to_rfc3339();

        let new_name = dto.name.as_deref().unwrap_or(&current.name).trim();
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
        let new_category = dto.category_id.as_deref().unwrap_or(&current.category_id);
        let new_brand = dto.brand_id.as_deref().or(current.brand_id.as_deref());
        let new_unit = dto.unit_id.as_deref().or(current.unit_id.as_deref());
        let new_purchase = dto.purchase_price.unwrap_or(current.purchase_price);
        let new_sale = dto.sale_price.unwrap_or(current.sale_price);
        let new_threshold = dto.low_stock_threshold.unwrap_or(current.low_stock_threshold);
        let new_desc = dto.description.as_deref().or(current.description.as_deref());
        let new_active = dto.is_active.unwrap_or(current.is_active);

        if new_purchase < 0 || new_sale < 0 || new_threshold < 0 {
            return Err(AppError::Validation("Prices and threshold cannot be negative".to_string()));
        }

        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        guard
            .execute(
                "UPDATE products
                 SET name = ?1, barcode = ?2, category_id = ?3, brand_id = ?4, unit_id = ?5,
                     purchase_price = ?6, sale_price = ?7, low_stock_threshold = ?8,
                     is_active = ?9, description = ?10, updated_at = ?11
                 WHERE id = ?12",
                params![
                    new_name,
                    new_barcode,
                    new_category,
                    new_brand,
                    new_unit,
                    new_purchase,
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
                if err_str.contains("UNIQUE constraint failed: products.barcode") {
                    AppError::Conflict("Barcode is already used by another product".to_string())
                } else if err_str.contains("FOREIGN KEY constraint failed") {
                    AppError::Validation(format!("Invalid category, brand, or unit: {e}"))
                } else {
                    AppError::Database(format!("Failed to update product: {e}"))
                }
            })?;

        Ok(Product {
            id: id.to_string(),
            name: new_name.to_string(),
            sku: current.sku,
            barcode: new_barcode,
            category_id: new_category.to_string(),
            brand_id: new_brand.map(|s| s.to_string()),
            unit_id: new_unit.map(|s| s.to_string()),
            purchase_price: new_purchase,
            sale_price: new_sale,
            low_stock_threshold: new_threshold,
            is_active: new_active,
            description: new_desc.map(|s| s.to_string()),
            created_at: current.created_at,
            updated_at: now,
        })
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
}
