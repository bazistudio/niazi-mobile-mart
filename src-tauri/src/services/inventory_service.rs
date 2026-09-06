use chrono::Utc;
use uuid::Uuid;

use crate::db::connection::DatabaseConnection;
use crate::db::errors::DbError;
use crate::db::transaction::with_transaction;
use crate::domain::inventory::{
    AdjustStockDto, DecreaseStockDto, IncreaseStockDto, LowStockItemDto, StockMovement,
    StockMovementType, TransferStockDto,
};
use crate::errors::{AppError, AppResult};
use crate::repositories::{SQLiteInventoryRepository, SQLiteProductRepository};

#[derive(Clone)]
pub struct InventoryService {
    db: DatabaseConnection,
    repo: SQLiteInventoryRepository,
    product_repo: SQLiteProductRepository,
}

impl InventoryService {
    pub fn new(db: DatabaseConnection) -> Self {
        Self {
            repo: SQLiteInventoryRepository::new(db.clone()),
            product_repo: SQLiteProductRepository::new(db.clone()),
            db,
        }
    }

    /// Atomically increases stock and records an IN movement ledger entry
    pub async fn increase_stock(&self, dto: IncreaseStockDto, user_id: Option<&str>) -> AppResult<i64> {
        if dto.quantity <= 0 {
            return Err(AppError::Validation("Quantity must be greater than 0".to_string()));
        }

        // Verify product exists
        let product = self.product_repo.get_product_by_id(&dto.product_id).await?;
        if !product.is_active {
            return Err(AppError::Validation(format!("Product '{}' is inactive", product.name)));
        }

        let now = Utc::now().to_rfc3339();
        let pid = dto.product_id.clone();
        let bid = dto.branch_id.clone();
        let uid = user_id.map(|s| s.to_string());

        let resulting = with_transaction(&self.db, move |tx| {
            let prev = SQLiteInventoryRepository::get_stock_in_tx(tx, &pid, &bid)?;
            let new_qty = prev.saturating_add(dto.quantity);

            SQLiteInventoryRepository::set_stock_in_tx(tx, &pid, &bid, new_qty, &now)?;

            let movement = StockMovement {
                id: Uuid::new_v4().to_string(),
                product_id: pid,
                branch_id: bid,
                movement_type: StockMovementType::In,
                quantity: dto.quantity,
                previous_stock: prev,
                resulting_stock: new_qty,
                reason: dto.reason,
                performed_by: uid,
                reference_id: dto.reference_id,
                created_at: now,
            };
            SQLiteInventoryRepository::insert_movement_in_tx(tx, &movement)?;

            Ok(new_qty)
        })
        .await?;

        Ok(resulting)
    }

    /// Atomically decreases stock and records an OUT movement ledger entry.
    /// Strictly rejects negative stock and rolls back without state changes.
    pub async fn decrease_stock(&self, dto: DecreaseStockDto, user_id: Option<&str>) -> AppResult<i64> {
        if dto.quantity <= 0 {
            return Err(AppError::Validation("Quantity must be greater than 0".to_string()));
        }

        // Verify product exists
        let product = self.product_repo.get_product_by_id(&dto.product_id).await?;

        let now = Utc::now().to_rfc3339();
        let pid = dto.product_id.clone();
        let bid = dto.branch_id.clone();
        let uid = user_id.map(|s| s.to_string());

        let resulting = with_transaction(&self.db, move |tx| {
            let prev = SQLiteInventoryRepository::get_stock_in_tx(tx, &pid, &bid)?;
            if prev < dto.quantity {
                return Err(DbError::ValidationError(format!(
                    "Insufficient stock for product '{}' (SKU: {}). Current stock is {}, requested decrease is {}",
                    product.name, product.sku, prev, dto.quantity
                )));
            }

            let new_qty = prev - dto.quantity;
            SQLiteInventoryRepository::set_stock_in_tx(tx, &pid, &bid, new_qty, &now)?;

            let movement = StockMovement {
                id: Uuid::new_v4().to_string(),
                product_id: pid,
                branch_id: bid,
                movement_type: StockMovementType::Out,
                quantity: dto.quantity,
                previous_stock: prev,
                resulting_stock: new_qty,
                reason: dto.reason,
                performed_by: uid,
                reference_id: dto.reference_id,
                created_at: now,
            };
            SQLiteInventoryRepository::insert_movement_in_tx(tx, &movement)?;

            Ok(new_qty)
        })
        .await?;

        Ok(resulting)
    }

    /// Atomically adjusts stock to a target quantity and records an ADJUSTMENT movement ledger entry.
    /// Strictly rejects zero-effect (no-op) adjustments.
    pub async fn adjust_stock(&self, dto: AdjustStockDto, user_id: Option<&str>) -> AppResult<i64> {
        if dto.target_quantity < 0 {
            return Err(AppError::Validation("Target stock quantity cannot be negative".to_string()));
        }
        if dto.reason.trim().is_empty() {
            return Err(AppError::Validation("Reason is required for stock adjustment".to_string()));
        }

        let _product = self.product_repo.get_product_by_id(&dto.product_id).await?;

        let now = Utc::now().to_rfc3339();
        let pid = dto.product_id.clone();
        let bid = dto.branch_id.clone();
        let uid = user_id.map(|s| s.to_string());

        let resulting = with_transaction(&self.db, move |tx| {
            let prev = SQLiteInventoryRepository::get_stock_in_tx(tx, &pid, &bid)?;

            // Rejection rule for no-op adjustments
            if prev == dto.target_quantity {
                return Err(DbError::ValidationError(format!(
                    "Stock target quantity ({}) is identical to current stock; zero-effect adjustment rejected",
                    dto.target_quantity
                )));
            }

            let delta = (dto.target_quantity - prev).abs();
            SQLiteInventoryRepository::set_stock_in_tx(tx, &pid, &bid, dto.target_quantity, &now)?;

            let movement = StockMovement {
                id: Uuid::new_v4().to_string(),
                product_id: pid,
                branch_id: bid,
                movement_type: StockMovementType::Adjustment,
                quantity: delta,
                previous_stock: prev,
                resulting_stock: dto.target_quantity,
                reason: Some(dto.reason),
                performed_by: uid,
                reference_id: Some("MANUAL_ADJUSTMENT".to_string()),
                created_at: now,
            };
            SQLiteInventoryRepository::insert_movement_in_tx(tx, &movement)?;

            Ok(dto.target_quantity)
        })
        .await?;

        Ok(resulting)
    }

    /// Atomically transfers stock from one controlled branch to another.
    /// Enforces:
    /// - from_branch != to_branch
    /// - quantity > 0
    /// - source has sufficient stock
    /// - both branches updated atomically
    /// - TRANSFER_OUT and TRANSFER_IN movements created inside the single transaction
    pub async fn transfer_stock(&self, dto: TransferStockDto, user_id: Option<&str>) -> AppResult<()> {
        if dto.from_branch_id == dto.to_branch_id {
            return Err(AppError::Validation("Source and destination branch cannot be the same".to_string()));
        }
        if dto.quantity <= 0 {
            return Err(AppError::Validation("Transfer quantity must be greater than 0".to_string()));
        }

        let product = self.product_repo.get_product_by_id(&dto.product_id).await?;

        let now = Utc::now().to_rfc3339();
        let pid = dto.product_id.clone();
        let from_bid = dto.from_branch_id.clone();
        let to_bid = dto.to_branch_id.clone();
        let uid = user_id.map(|s| s.to_string());
        let transfer_ref = dto.reference_id.unwrap_or_else(|| format!("TRF-{}", Uuid::new_v4()));

        with_transaction(&self.db, move |tx| {
            // 1. Check source stock
            let source_prev = SQLiteInventoryRepository::get_stock_in_tx(tx, &pid, &from_bid)?;
            if source_prev < dto.quantity {
                return Err(DbError::ValidationError(format!(
                    "Insufficient stock at source branch for product '{}'. Available: {}, Requested transfer: {}",
                    product.name, source_prev, dto.quantity
                )));
            }

            // 2. Decrement source stock
            let source_new = source_prev - dto.quantity;
            SQLiteInventoryRepository::set_stock_in_tx(tx, &pid, &from_bid, source_new, &now)?;

            // 3. Record TRANSFER_OUT
            let out_movement = StockMovement {
                id: Uuid::new_v4().to_string(),
                product_id: pid.clone(),
                branch_id: from_bid,
                movement_type: StockMovementType::TransferOut,
                quantity: dto.quantity,
                previous_stock: source_prev,
                resulting_stock: source_new,
                reason: dto.reason.clone(),
                performed_by: uid.clone(),
                reference_id: Some(transfer_ref.clone()),
                created_at: now.clone(),
            };
            SQLiteInventoryRepository::insert_movement_in_tx(tx, &out_movement)?;

            // 4. Increment destination stock
            let dest_prev = SQLiteInventoryRepository::get_stock_in_tx(tx, &pid, &to_bid)?;
            let dest_new = dest_prev.saturating_add(dto.quantity);
            SQLiteInventoryRepository::set_stock_in_tx(tx, &pid, &to_bid, dest_new, &now)?;

            // 5. Record TRANSFER_IN
            let in_movement = StockMovement {
                id: Uuid::new_v4().to_string(),
                product_id: pid,
                branch_id: to_bid,
                movement_type: StockMovementType::TransferIn,
                quantity: dto.quantity,
                previous_stock: dest_prev,
                resulting_stock: dest_new,
                reason: dto.reason,
                performed_by: uid,
                reference_id: Some(transfer_ref),
                created_at: now,
            };
            SQLiteInventoryRepository::insert_movement_in_tx(tx, &in_movement)?;

            Ok(())
        })
        .await?;

        Ok(())
    }

    pub async fn get_stock(&self, product_id: &str, branch_id: &str) -> AppResult<i64> {
        self.repo.get_stock(product_id, branch_id).await
    }

    pub async fn list_movements(
        &self,
        product_id: Option<&str>,
        branch_id: Option<&str>,
        limit: u32,
    ) -> AppResult<Vec<StockMovement>> {
        self.repo.list_movements(product_id, branch_id, limit).await
    }

    pub async fn get_low_stock(&self, branch_id: &str) -> AppResult<Vec<LowStockItemDto>> {
        self.repo.list_low_stock(branch_id).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations::MigrationRunner;
    use crate::domain::catalog::{CreateCategoryDto, CreateUnitDto};
    use crate::domain::inventory::{AdjustStockDto, DecreaseStockDto, IncreaseStockDto, TransferStockDto};
    use crate::domain::product::CreateProductDto;
    use crate::services::{CatalogService, ProductService};

    async fn setup_inventory_test() -> (DatabaseConnection, InventoryService, String, String, String) {
        let db = DatabaseConnection::open_in_memory().unwrap();
        {
            let conn_arc = db.inner();
            let mut guard = conn_arc.lock().await;
            MigrationRunner::run(&mut guard).unwrap();

            // Seed a second controlled branch for transfer testing
            guard
                .execute(
                    "INSERT INTO branches (id, organization_id, name, code, is_active, created_at, updated_at)
                     VALUES ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Branch B', 'BRANCH-B', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
                    [],
                )
                .unwrap();
        }

        let main_branch_id = "00000000-0000-0000-0000-000000000002".to_string();
        let branch_b_id = "00000000-0000-0000-0000-000000000003".to_string();

        let cat_service = CatalogService::new(db.clone());
        let cat = cat_service
            .create_category(CreateCategoryDto {
                name: "Accessories".to_string(),
                code: "CAT-ACC".to_string(),
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
                    name: "25W Type-C Charger".to_string(),
                    sku: "SKU-CHG-25W".to_string(),
                    barcode: Some("1234567890123".to_string()),
                    category_id: cat.id,
                    brand_id: None,
                    unit_id: Some(unit.id),
                    purchase_price: 1500, // Rs 1,500
                    average_cost: None,
                    sale_price: 2000,     // Rs 2,000
                    low_stock_threshold: Some(5),
                    description: None,
                    initial_quantity: None,
                    branch_id: None,
                },
                None,
            )
            .await
            .unwrap();

        let inv_service = InventoryService::new(db.clone());
        (db, inv_service, prod.id, main_branch_id, branch_b_id)
    }

    #[tokio::test]
    async fn test_inventory_increase_decrease_and_negative_stock_rejection() {
        let (_db, inv_service, prod_id, main_branch_id, _branch_b_id) = setup_inventory_test().await;

        // 1. Initial stock is 0
        let initial_stock = inv_service.get_stock(&prod_id, &main_branch_id).await.unwrap();
        assert_eq!(initial_stock, 0);

        // 2. Increase stock: +10
        let after_in = inv_service
            .increase_stock(
                IncreaseStockDto {
                    product_id: prod_id.clone(),
                    branch_id: main_branch_id.clone(),
                    quantity: 10,
                    reason: Some("Purchase Received".to_string()),
                    reference_id: Some("PO-1001".to_string()),
                },
                None,
            )
            .await
            .expect("Increase stock should succeed");
        assert_eq!(after_in, 10);

        // 3. Decrease stock: -3 -> 7
        let after_out = inv_service
            .decrease_stock(
                DecreaseStockDto {
                    product_id: prod_id.clone(),
                    branch_id: main_branch_id.clone(),
                    quantity: 3,
                    reason: Some("Customer Sale".to_string()),
                    reference_id: Some("INV-2001".to_string()),
                },
                None,
            )
            .await
            .expect("Decrease stock should succeed");
        assert_eq!(after_out, 7);

        // 4. Negative stock rejection: attempting to decrease 10 when stock is 7 must fail
        let neg_attempt = inv_service
            .decrease_stock(
                DecreaseStockDto {
                    product_id: prod_id.clone(),
                    branch_id: main_branch_id.clone(),
                    quantity: 10,
                    reason: Some("Over-sale attempt".to_string()),
                    reference_id: None,
                },
                None,
            )
            .await;
        assert!(neg_attempt.is_err(), "Decrease beyond available stock must be rejected");

        // Verify stock remains exactly 7
        let current_stock = inv_service.get_stock(&prod_id, &main_branch_id).await.unwrap();
        assert_eq!(current_stock, 7, "Stock must not change upon failed decrease");

        // Verify movement ledger contains 2 records (IN 10, OUT 3)
        let movements = inv_service
            .list_movements(Some(&prod_id), Some(&main_branch_id), 10)
            .await
            .unwrap();
        assert_eq!(movements.len(), 2);
        assert_eq!(movements[0].movement_type, StockMovementType::Out);
        assert_eq!(movements[0].quantity, 3);
        assert_eq!(movements[1].movement_type, StockMovementType::In);
        assert_eq!(movements[1].quantity, 10);
    }

    #[tokio::test]
    async fn test_inventory_adjustment_semantics() {
        let (_db, inv_service, prod_id, main_branch_id, _branch_b_id) = setup_inventory_test().await;

        // Increase initial to 20
        inv_service
            .increase_stock(
                IncreaseStockDto {
                    product_id: prod_id.clone(),
                    branch_id: main_branch_id.clone(),
                    quantity: 20,
                    reason: None,
                    reference_id: None,
                },
                None,
            )
            .await
            .unwrap();

        // Adjust to target 18 (delta = 2)
        let adjusted = inv_service
            .adjust_stock(
                AdjustStockDto {
                    product_id: prod_id.clone(),
                    branch_id: main_branch_id.clone(),
                    target_quantity: 18,
                    reason: "Physical audit count discrepancy".to_string(),
                },
                None,
            )
            .await
            .expect("Valid adjustment should succeed");
        assert_eq!(adjusted, 18);

        // Verify movement ledger entry for adjustment
        let movements = inv_service
            .list_movements(Some(&prod_id), Some(&main_branch_id), 1)
            .await
            .unwrap();
        assert_eq!(movements[0].movement_type, StockMovementType::Adjustment);
        assert_eq!(movements[0].previous_stock, 20);
        assert_eq!(movements[0].resulting_stock, 18);
        assert_eq!(movements[0].quantity, 2);

        // Zero-effect (no-op) adjustment rejection: target 18 when current is 18
        let no_op = inv_service
            .adjust_stock(
                AdjustStockDto {
                    product_id: prod_id.clone(),
                    branch_id: main_branch_id.clone(),
                    target_quantity: 18,
                    reason: "Redundant adjustment".to_string(),
                },
                None,
            )
            .await;
        assert!(no_op.is_err(), "Zero-effect adjustment must be rejected");
    }

    #[tokio::test]
    async fn test_inventory_atomic_branch_transfer() {
        let (_db, inv_service, prod_id, main_branch_id, branch_b_id) = setup_inventory_test().await;

        // Seed 20 at Main Branch
        inv_service
            .increase_stock(
                IncreaseStockDto {
                    product_id: prod_id.clone(),
                    branch_id: main_branch_id.clone(),
                    quantity: 20,
                    reason: None,
                    reference_id: None,
                },
                None,
            )
            .await
            .unwrap();

        // 1. Same branch transfer rejection
        let same_branch = inv_service
            .transfer_stock(
                TransferStockDto {
                    product_id: prod_id.clone(),
                    from_branch_id: main_branch_id.clone(),
                    to_branch_id: main_branch_id.clone(),
                    quantity: 4,
                    reason: None,
                    reference_id: None,
                },
                None,
            )
            .await;
        assert!(same_branch.is_err(), "Same-branch transfer must be rejected");

        // 2. Insufficient source stock transfer rejection
        let over_transfer = inv_service
            .transfer_stock(
                TransferStockDto {
                    product_id: prod_id.clone(),
                    from_branch_id: main_branch_id.clone(),
                    to_branch_id: branch_b_id.clone(),
                    quantity: 25, // Available is only 20
                    reason: None,
                    reference_id: None,
                },
                None,
            )
            .await;
        assert!(over_transfer.is_err(), "Transfer exceeding available stock must be rejected");

        // 3. Valid atomic transfer: 4 from Main to Branch B
        inv_service
            .transfer_stock(
                TransferStockDto {
                    product_id: prod_id.clone(),
                    from_branch_id: main_branch_id.clone(),
                    to_branch_id: branch_b_id.clone(),
                    quantity: 4,
                    reason: Some("Stock rebalancing".to_string()),
                    reference_id: Some("TRF-001".to_string()),
                },
                None,
            )
            .await
            .expect("Transfer should succeed");

        let main_stock = inv_service.get_stock(&prod_id, &main_branch_id).await.unwrap();
        let branch_b_stock = inv_service.get_stock(&prod_id, &branch_b_id).await.unwrap();

        assert_eq!(main_stock, 16, "Main branch must decrease from 20 to 16");
        assert_eq!(branch_b_stock, 4, "Branch B must increase from 0 to 4");

        // 4. Low stock query: threshold is 5, Branch B has 4 -> should be flagged as low stock
        let low_stock_b = inv_service.get_low_stock(&branch_b_id).await.unwrap();
        assert_eq!(low_stock_b.len(), 1);
        assert_eq!(low_stock_b[0].current_quantity, 4);
        assert_eq!(low_stock_b[0].threshold, 5);

        // Main has 16 (> 5), so it should not appear in Main branch low stock report
        let low_stock_main = inv_service.get_low_stock(&main_branch_id).await.unwrap();
        assert_eq!(low_stock_main.len(), 0);
    }
}
