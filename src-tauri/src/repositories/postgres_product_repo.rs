use chrono::Utc;
use sqlx::{PgPool, Row};
use uuid::Uuid;

use crate::domain::inventory::{StockMovement, StockMovementType};
use crate::domain::product::{CreateProductDto, Product, ProductFilter, UpdateProductDto};
use crate::errors::{AppError, AppResult};

#[derive(Clone)]
pub struct PostgresProductRepository {
    pool: PgPool,
}

impl PostgresProductRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn create_product(&self, id: &str, dto: &CreateProductDto) -> AppResult<Product> {
        let now = Utc::now().to_rfc3339();
        let threshold = dto.low_stock_threshold.unwrap_or(5);
        let barcode_opt = dto.barcode.as_deref().map(str::trim).filter(|s| !s.is_empty());
        let initial_avg_cost = dto.average_cost.unwrap_or(dto.purchase_price);
        let sku = dto.sku.trim().to_uppercase();
        let name = dto.name.trim();

        sqlx::query(
            "INSERT INTO products (id, name, sku, barcode, category_id, brand_id, unit_id, purchase_price, average_cost, sale_price, low_stock_threshold, is_active, description, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 1, $12, $13, $14)"
        )
        .bind(id)
        .bind(name)
        .bind(&sku)
        .bind(barcode_opt)
        .bind(&dto.category_id)
        .bind(dto.brand_id.as_deref())
        .bind(dto.unit_id.as_deref())
        .bind(dto.purchase_price)
        .bind(initial_avg_cost)
        .bind(dto.sale_price)
        .bind(threshold)
        .bind(dto.description.as_deref())
        .bind(&now)
        .bind(&now)
        .execute(&self.pool)
        .await
        .map_err(|e| {
            let msg = e.to_string();
            if msg.contains("products_sku_key") || msg.contains("products.sku") || (msg.contains("unique") && msg.contains("sku")) {
                AppError::Conflict(format!("Product with SKU '{sku}' already exists"))
            } else if msg.contains("products_barcode_key") || msg.contains("products.barcode") || (msg.contains("unique") && msg.contains("barcode")) {
                AppError::Conflict(format!("Product with barcode '{}' already exists", dto.barcode.as_deref().unwrap_or("")))
            } else if msg.contains("foreign key") || msg.contains("FOREIGN KEY") {
                AppError::Validation(format!("Invalid category, brand, or unit reference in product: {e}"))
            } else {
                AppError::Database(format!("Failed to create product: {e}"))
            }
        })?;

        Ok(Product {
            id: id.to_string(),
            name: name.to_string(),
            sku,
            barcode: barcode_opt.map(|s| s.to_string()),
            category_id: dto.category_id.clone(),
            brand_id: dto.brand_id.clone(),
            unit_id: dto.unit_id.clone(),
            purchase_price: dto.purchase_price,
            average_cost: initial_avg_cost,
            sale_price: dto.sale_price,
            low_stock_threshold: threshold,
            is_active: true,
            description: dto.description.clone(),
            created_at: now.clone(),
            updated_at: now,
        })
    }

    pub async fn create_product_with_initial_stock(
        &self,
        id: &str,
        dto: &CreateProductDto,
        user_id: Option<&str>,
    ) -> AppResult<Product> {
        let mut tx = self.pool.begin().await.map_err(|e| AppError::Database(e.to_string()))?;
        let now = Utc::now().to_rfc3339();
        let threshold = dto.low_stock_threshold.unwrap_or(5);
        let barcode_opt = dto.barcode.as_deref().map(str::trim).filter(|s| !s.is_empty());
        let initial_avg_cost = dto.average_cost.unwrap_or(dto.purchase_price);
        let sku = dto.sku.trim().to_uppercase();
        let name = dto.name.trim();

        sqlx::query(
            "INSERT INTO products (id, name, sku, barcode, category_id, brand_id, unit_id, purchase_price, average_cost, sale_price, low_stock_threshold, is_active, description, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 1, $12, $13, $14)"
        )
        .bind(id)
        .bind(name)
        .bind(&sku)
        .bind(barcode_opt)
        .bind(&dto.category_id)
        .bind(dto.brand_id.as_deref())
        .bind(dto.unit_id.as_deref())
        .bind(dto.purchase_price)
        .bind(initial_avg_cost)
        .bind(dto.sale_price)
        .bind(threshold)
        .bind(dto.description.as_deref())
        .bind(&now)
        .bind(&now)
        .execute(&mut *tx)
        .await
        .map_err(|e| {
            let msg = e.to_string();
            if msg.contains("products_sku_key") || msg.contains("products.sku") || (msg.contains("unique") && msg.contains("sku")) {
                AppError::Conflict(format!("Product with SKU '{sku}' already exists"))
            } else if msg.contains("products_barcode_key") || msg.contains("products.barcode") || (msg.contains("unique") && msg.contains("barcode")) {
                AppError::Conflict(format!("Product with barcode '{}' already exists", dto.barcode.as_deref().unwrap_or("")))
            } else {
                AppError::Database(format!("Failed to create product: {e}"))
            }
        })?;

        if let (Some(qty), Some(branch_id)) = (dto.initial_quantity, &dto.branch_id) {
            if qty > 0 {
                sqlx::query(
                    "INSERT INTO stock (product_id, branch_id, quantity, updated_at)
                     VALUES ($1, $2, $3, $4)
                     ON CONFLICT (product_id, branch_id) DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = EXCLUDED.updated_at"
                )
                .bind(id)
                .bind(branch_id)
                .bind(qty)
                .bind(&now)
                .execute(&mut *tx)
                .await
                .map_err(|e| AppError::Database(format!("Failed to set stock: {e}")))?;

                let movement_id = Uuid::new_v4().to_string();
                sqlx::query(
                    "INSERT INTO stock_movements (id, product_id, branch_id, movement_type, quantity, previous_stock, resulting_stock, reason, performed_by, reference_id, created_at)
                     VALUES ($1, $2, $3, 'IN', $4, 0, $5, 'Opening Stock', $6, 'OPENING_BALANCE', $7)"
                )
                .bind(movement_id)
                .bind(id)
                .bind(branch_id)
                .bind(qty)
                .bind(qty)
                .bind(user_id)
                .bind(&now)
                .execute(&mut *tx)
                .await
                .map_err(|e| AppError::Database(format!("Failed to insert movement: {e}")))?;
            }
        }

        tx.commit().await.map_err(|e| AppError::Database(e.to_string()))?;

        Ok(Product {
            id: id.to_string(),
            name: name.to_string(),
            sku,
            barcode: barcode_opt.map(|s| s.to_string()),
            category_id: dto.category_id.clone(),
            brand_id: dto.brand_id.clone(),
            unit_id: dto.unit_id.clone(),
            purchase_price: dto.purchase_price,
            average_cost: initial_avg_cost,
            sale_price: dto.sale_price,
            low_stock_threshold: threshold,
            is_active: true,
            description: dto.description.clone(),
            created_at: now.clone(),
            updated_at: now,
        })
    }

    pub async fn get_product_by_id(&self, id: &str) -> AppResult<Product> {
        let sql = "SELECT id, name, sku, barcode, category_id, brand_id, unit_id, purchase_price, average_cost, sale_price, low_stock_threshold, is_active, description, created_at, updated_at FROM products WHERE id = $1";
        let row_opt = sqlx::query(sql)
            .bind(id)
            .fetch_optional(&self.pool)
            .await
            .map_err(|e| AppError::Database(format!("Failed to get product: {e}")))?;

        match row_opt {
            Some(row) => Ok(Self::map_product_row(&row)?),
            None => Err(AppError::NotFound(format!("Product '{id}' not found"))),
        }
    }

    pub async fn get_product_by_sku(&self, sku: &str) -> AppResult<Product> {
        let clean = sku.trim().to_uppercase();
        let sql = "SELECT id, name, sku, barcode, category_id, brand_id, unit_id, purchase_price, average_cost, sale_price, low_stock_threshold, is_active, description, created_at, updated_at FROM products WHERE sku = $1";
        let row_opt = sqlx::query(sql)
            .bind(&clean)
            .fetch_optional(&self.pool)
            .await
            .map_err(|e| AppError::Database(format!("Failed to get product by SKU: {e}")))?;

        match row_opt {
            Some(row) => Ok(Self::map_product_row(&row)?),
            None => Err(AppError::NotFound(format!("Product with SKU '{clean}' not found"))),
        }
    }

    pub async fn get_product_by_barcode(&self, barcode: &str) -> AppResult<Product> {
        let clean = barcode.trim();
        let sql = "SELECT id, name, sku, barcode, category_id, brand_id, unit_id, purchase_price, average_cost, sale_price, low_stock_threshold, is_active, description, created_at, updated_at FROM products WHERE barcode = $1";
        let row_opt = sqlx::query(sql)
            .bind(clean)
            .fetch_optional(&self.pool)
            .await
            .map_err(|e| AppError::Database(format!("Failed to get product by barcode: {e}")))?;

        match row_opt {
            Some(row) => Ok(Self::map_product_row(&row)?),
            None => Err(AppError::NotFound(format!("Product with barcode '{clean}' not found"))),
        }
    }

    pub async fn list_products(&self, filter: &ProductFilter) -> AppResult<Vec<Product>> {
        let mut query = "SELECT id, name, sku, barcode, category_id, brand_id, unit_id, purchase_price, average_cost, sale_price, low_stock_threshold, is_active, description, created_at, updated_at FROM products WHERE 1=1".to_string();
        let mut param_index = 1;

        if filter.search.is_some() {
            query.push_str(&format!(" AND (name ILIKE ${param_index} OR sku ILIKE ${param_index} OR barcode ILIKE ${param_index})"));
            param_index += 1;
        }

        if filter.category_id.is_some() {
            query.push_str(&format!(" AND category_id = ${param_index}"));
            param_index += 1;
        }

        if filter.brand_id.is_some() {
            query.push_str(&format!(" AND brand_id = ${param_index}"));
            param_index += 1;
        }

        if filter.is_active.is_some() {
            query.push_str(&format!(" AND is_active = ${param_index}"));
            let _ = param_index;
        }

        query.push_str(" ORDER BY name ASC");

        let mut q = sqlx::query(&query);

        if let Some(search) = &filter.search {
            let term = format!("%{}%", search.trim());
            q = q.bind(term);
        }

        if let Some(cat_id) = &filter.category_id {
            q = q.bind(cat_id);
        }

        if let Some(brand_id) = &filter.brand_id {
            q = q.bind(brand_id);
        }

        if let Some(active) = filter.is_active {
            q = q.bind(if active { 1 } else { 0 });
        }

        let rows = q
            .fetch_all(&self.pool)
            .await
            .map_err(|e| AppError::Database(format!("Failed to query products: {e}")))?;

        let mut products = Vec::with_capacity(rows.len());
        for row in rows {
            products.push(Self::map_product_row(&row)?);
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
        let new_avg_cost = dto.average_cost.unwrap_or(current.average_cost);
        let new_sale = dto.sale_price.unwrap_or(current.sale_price);
        let new_threshold = dto.low_stock_threshold.unwrap_or(current.low_stock_threshold);
        let new_desc = dto.description.as_deref().or(current.description.as_deref());
        let new_active = dto.is_active.unwrap_or(current.is_active);

        if new_purchase < 0 || new_avg_cost < 0 || new_sale < 0 || new_threshold < 0 {
            return Err(AppError::Validation("Prices and threshold cannot be negative".to_string()));
        }

        sqlx::query(
            "UPDATE products
             SET name = $1, barcode = $2, category_id = $3, brand_id = $4, unit_id = $5,
                 purchase_price = $6, average_cost = $7, sale_price = $8, low_stock_threshold = $9,
                 is_active = $10, description = $11, updated_at = $12
             WHERE id = $13"
        )
        .bind(new_name)
        .bind(new_barcode.as_deref())
        .bind(new_category)
        .bind(new_brand)
        .bind(new_unit)
        .bind(new_purchase)
        .bind(new_avg_cost)
        .bind(new_sale)
        .bind(new_threshold)
        .bind(if new_active { 1 } else { 0 })
        .bind(new_desc)
        .bind(&now)
        .bind(id)
        .execute(&self.pool)
        .await
        .map_err(|e| {
            let msg = e.to_string();
            if msg.contains("products_barcode_key") || msg.contains("products.barcode") || (msg.contains("unique") && msg.contains("barcode")) {
                AppError::Conflict("Barcode is already used by another product".to_string())
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
            average_cost: new_avg_cost,
            sale_price: new_sale,
            low_stock_threshold: new_threshold,
            is_active: new_active,
            description: new_desc.map(|s| s.to_string()),
            created_at: current.created_at,
            updated_at: now,
        })
    }

    pub async fn deactivate_product(&self, id: &str) -> AppResult<()> {
        let now = Utc::now().to_rfc3339();
        let res = sqlx::query("UPDATE products SET is_active = 0, updated_at = $1 WHERE id = $2")
            .bind(&now)
            .bind(id)
            .execute(&self.pool)
            .await
            .map_err(|e| AppError::Database(format!("Failed to deactivate product: {e}")))?;

        if res.rows_affected() == 0 {
            Err(AppError::NotFound(format!("Product '{id}' not found")))
        } else {
            Ok(())
        }
    }

    fn map_product_row(row: &sqlx::postgres::PgRow) -> AppResult<Product> {
        let is_active_int: i32 = row.try_get(11).unwrap_or(1);
        Ok(Product {
            id: row.try_get(0).map_err(|e| AppError::Database(e.to_string()))?,
            name: row.try_get(1).map_err(|e| AppError::Database(e.to_string()))?,
            sku: row.try_get(2).map_err(|e| AppError::Database(e.to_string()))?,
            barcode: row.try_get(3).unwrap_or(None),
            category_id: row.try_get(4).map_err(|e| AppError::Database(e.to_string()))?,
            brand_id: row.try_get(5).unwrap_or(None),
            unit_id: row.try_get(6).unwrap_or(None),
            purchase_price: row.try_get(7).map_err(|e| AppError::Database(e.to_string()))?,
            average_cost: row.try_get(8).map_err(|e| AppError::Database(e.to_string()))?,
            sale_price: row.try_get(9).map_err(|e| AppError::Database(e.to_string()))?,
            low_stock_threshold: row.try_get(10).map_err(|e| AppError::Database(e.to_string()))?,
            is_active: is_active_int == 1,
            description: row.try_get(12).unwrap_or(None),
            created_at: row.try_get(13).map_err(|e| AppError::Database(e.to_string()))?,
            updated_at: row.try_get(14).map_err(|e| AppError::Database(e.to_string()))?,
        })
    }
}
