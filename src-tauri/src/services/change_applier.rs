use rusqlite::params;
use tracing::info;

use crate::db::connection::DatabaseConnection;
use crate::db::errors::DbError;
use crate::domain::change_log::ChangeLogEntry;
use crate::errors::AppResult;
use crate::repositories::{
    SQLiteExpenseRepository, SQLiteInventoryRepository, SQLiteProductRepository, SQLitePurchaseRepository,
    SQLiteSaleRepository, SQLiteSyncCursorRepository,
};

/// Service responsible for applying downstream central change log deltas into local SQLite
#[derive(Clone)]
pub struct ChangeApplier {
    db: DatabaseConnection,
}

impl ChangeApplier {
    pub fn new(db: DatabaseConnection) -> Self {
        Self { db }
    }

    /// Atomically applies a batch of downstream central changes and advances the SQLite cursor
    pub async fn apply_batch(
        &self,
        organization_id: &str,
        changes: &[ChangeLogEntry],
        next_sequence: i64,
    ) -> AppResult<()> {
        if changes.is_empty() {
            return Ok(());
        }

        let db = self.db.clone();
        let org_id_owned = organization_id.to_string();
        let changes_owned = changes.to_vec();

        crate::db::transaction::with_transaction(&db, move |tx| {
            for change in &changes_owned {
                Self::apply_single_change_in_tx(tx, change)?;
            }

            SQLiteSyncCursorRepository::set_last_applied_sequence_in_tx(
                tx,
                "downstream_delta",
                &org_id_owned,
                next_sequence,
            )?;

            Ok(())
        })
        .await?;

        info!("Successfully applied {} downstream changes up to sequence {}", changes.len(), next_sequence);
        Ok(())
    }

    fn apply_single_change_in_tx(tx: &rusqlite::Transaction, change: &ChangeLogEntry) -> crate::db::errors::DbResult<()> {
        match change.event_type.as_str() {
            "PRODUCT_CREATED" => {
                let product: crate::domain::product::Product = match serde_json::from_str(&change.payload) {
                    Ok(p) => p,
                    Err(e) => return Err(DbError::ValidationError(format!("Invalid PRODUCT_CREATED payload in change_log: {e}"))),
                };

                let exists: bool = tx.query_row(
                    "SELECT 1 FROM products WHERE id = ?1",
                    params![product.id],
                    |_| Ok(true),
                ).unwrap_or(false);

                if exists {
                    return Ok(());
                }

                SQLiteProductRepository::insert_product_in_tx(tx, &product)?;
            }
            "PRODUCT_UPDATED" => {
                let product: crate::domain::product::Product = match serde_json::from_str(&change.payload) {
                    Ok(p) => p,
                    Err(e) => return Err(DbError::ValidationError(format!("Invalid PRODUCT_UPDATED payload in change_log: {e}"))),
                };

                SQLiteProductRepository::insert_product_in_tx(tx, &product)?;
            }
            "PRODUCT_DEACTIVATED" => {
                #[derive(serde::Deserialize)]
                struct DeactivatePayload {
                    id: String,
                }

                let payload: DeactivatePayload = match serde_json::from_str(&change.payload) {
                    Ok(p) => p,
                    Err(e) => return Err(DbError::ValidationError(format!("Invalid PRODUCT_DEACTIVATED payload in change_log: {e}"))),
                };

                SQLiteProductRepository::deactivate_product_in_tx(tx, &payload.id)?;
            }
            "SALE_CREATED" => {
                let result_dto: crate::domain::sales::SaleResultDto = match serde_json::from_str(&change.payload) {
                    Ok(d) => d,
                    Err(e) => return Err(DbError::ValidationError(format!("Invalid SALE_CREATED payload in change_log: {e}"))),
                };

                let exists: bool = tx.query_row(
                    "SELECT 1 FROM sales WHERE id = ?1",
                    params![result_dto.sale.id],
                    |_| Ok(true),
                ).unwrap_or(false);

                if exists {
                    return Ok(());
                }

                SQLiteSaleRepository::insert_sale_in_tx(tx, &result_dto.sale)?;

                for line in &result_dto.lines {
                    SQLiteSaleRepository::insert_sale_line_in_tx(tx, line)?;
                }

                for payment in &result_dto.payments {
                    SQLiteSaleRepository::insert_sale_payment_in_tx(tx, payment)?;
                }

                for line in &result_dto.lines {
                    let current_stock: i64 = tx.query_row(
                        "SELECT quantity FROM stock WHERE product_id = ?1 AND branch_id = ?2",
                        params![line.product_id, result_dto.sale.branch_id],
                        |r| r.get(0),
                    ).unwrap_or(0);

                    let resulting_stock = current_stock - line.quantity;
                    SQLiteInventoryRepository::set_stock_in_tx(
                        tx,
                        &line.product_id,
                        &result_dto.sale.branch_id,
                        resulting_stock,
                        &result_dto.sale.created_at,
                    )?;
                }
            }
            "PURCHASE_CREATED" => {
                let result_dto: crate::domain::purchases::PurchaseResultDto = match serde_json::from_str(&change.payload) {
                    Ok(d) => d,
                    Err(e) => return Err(DbError::ValidationError(format!("Invalid PURCHASE_CREATED payload in change_log: {e}"))),
                };

                let exists: bool = tx.query_row(
                    "SELECT 1 FROM purchases WHERE id = ?1",
                    params![result_dto.purchase.id],
                    |_| Ok(true),
                ).unwrap_or(false);

                if exists {
                    return Ok(());
                }

                SQLitePurchaseRepository::insert_purchase_in_tx(tx, &result_dto.purchase)?;
                SQLitePurchaseRepository::insert_purchase_lines_in_tx(tx, &result_dto.lines)?;

                for line in &result_dto.lines {
                    let current_stock: i64 = tx.query_row(
                        "SELECT quantity FROM stock WHERE product_id = ?1 AND branch_id = ?2",
                        params![line.product_id, result_dto.purchase.branch_id],
                        |r| r.get(0),
                    ).unwrap_or(0);

                    let resulting_stock = current_stock + line.quantity;
                    SQLiteInventoryRepository::set_stock_in_tx(
                        tx,
                        &line.product_id,
                        &result_dto.purchase.branch_id,
                        resulting_stock,
                        &result_dto.purchase.created_at,
                    )?;
                }
            }
            "EXPENSE_CREATED" => {
                let expense: crate::domain::expense::Expense = match serde_json::from_str(&change.payload) {
                    Ok(e) => e,
                    Err(e) => return Err(DbError::ValidationError(format!("Invalid EXPENSE_CREATED payload in change_log: {e}"))),
                };

                let exists: bool = tx.query_row(
                    "SELECT 1 FROM expenses WHERE id = ?1",
                    params![expense.id],
                    |_| Ok(true),
                ).unwrap_or(false);

                if exists {
                    return Ok(());
                }

                SQLiteExpenseRepository::insert_expense_in_tx(tx, &expense)?;
            }
            _ => {
                // Forward-compatible ignore for future business event types
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations::MigrationRunner;
    use crate::domain::product::Product;

    async fn setup_test_db() -> DatabaseConnection {
        let db = DatabaseConnection::open_in_memory().unwrap();
        {
            let conn_arc = db.inner();
            let mut guard = conn_arc.lock().await;
            MigrationRunner::run(&mut guard).unwrap();
        }
        db
    }

    #[tokio::test]
    async fn test_downstream_product_apply_and_replay_safety() {
        let db = setup_test_db().await;
        let applier = ChangeApplier::new(db.clone());

        let product_id = "550e8400-e29b-41d4-a716-446655440099".to_string();
        let prod = Product {
            id: product_id.clone(),
            name: "Test Phone".to_string(),
            normalized_name: crate::domain::product::normalize_product_name("Test Phone"),
            sku: "SKU-TPHONE".to_string(),
            barcode: Some("123456789".to_string()),
            category_id: "00000000-0000-0000-0000-000000000010".to_string(),
            brand_id: None,
            unit_id: None,
            company_id: None,
            quality_id: None,
            color_id: None,
            purchase_price: 15000,
            average_cost: 15000,
            sale_price: 18000,
            low_stock_threshold: 5,
            is_active: true,
            description: None,
            created_at: "2026-01-01T00:00:00Z".to_string(),
            updated_at: "2026-01-01T00:00:00Z".to_string(),
        };

        // 1. PRODUCT_CREATED apply
        let change_created = ChangeLogEntry {
            sequence: 1,
            organization_id: "00000000-0000-0000-0000-000000000001".to_string(),
            branch_id: "00000000-0000-0000-0000-000000000002".to_string(),
            client_event_id: Some("evt_create_1".to_string()),
            event_type: "PRODUCT_CREATED".to_string(),
            entity_type: "PRODUCT".to_string(),
            entity_id: product_id.clone(),
            payload: serde_json::to_string(&prod).unwrap(),
            created_at: "2026-01-01T00:00:00Z".to_string(),
        };

        applier
            .apply_batch("00000000-0000-0000-0000-000000000001", &[change_created.clone()], 1)
            .await
            .unwrap();

        // Verify product exists locally
        let prod_repo = crate::repositories::SQLiteProductRepository::new(db.clone());
        let fetched = prod_repo.get_product_by_id(&product_id).await.unwrap();
        assert_eq!(fetched.name, "Test Phone");
        assert_eq!(fetched.sale_price, 18000);

        // 2. Replay PRODUCT_CREATED -> Must be no-op safely
        applier
            .apply_batch("00000000-0000-0000-0000-000000000001", &[change_created], 1)
            .await
            .unwrap();

        // 3. PRODUCT_UPDATED apply
        let mut updated_prod = prod.clone();
        updated_prod.name = "Test Phone Pro".to_string();
        updated_prod.sale_price = 22000;

        let change_updated = ChangeLogEntry {
            sequence: 2,
            organization_id: "00000000-0000-0000-0000-000000000001".to_string(),
            branch_id: "00000000-0000-0000-0000-000000000002".to_string(),
            client_event_id: Some("evt_update_1".to_string()),
            event_type: "PRODUCT_UPDATED".to_string(),
            entity_type: "PRODUCT".to_string(),
            entity_id: product_id.clone(),
            payload: serde_json::to_string(&updated_prod).unwrap(),
            created_at: "2026-01-01T00:01:00Z".to_string(),
        };

        applier
            .apply_batch("00000000-0000-0000-0000-000000000001", &[change_updated], 2)
            .await
            .unwrap();

        let fetched_updated = prod_repo.get_product_by_id(&product_id).await.unwrap();
        assert_eq!(fetched_updated.name, "Test Phone Pro");
        assert_eq!(fetched_updated.sale_price, 22000);

        // 4. PRODUCT_DEACTIVATED apply
        let change_deactivated = ChangeLogEntry {
            sequence: 3,
            organization_id: "00000000-0000-0000-0000-000000000001".to_string(),
            branch_id: "00000000-0000-0000-0000-000000000002".to_string(),
            client_event_id: Some("evt_deactivate_1".to_string()),
            event_type: "PRODUCT_DEACTIVATED".to_string(),
            entity_type: "PRODUCT".to_string(),
            entity_id: product_id.clone(),
            payload: serde_json::json!({ "id": product_id }).to_string(),
            created_at: "2026-01-01T00:02:00Z".to_string(),
        };

        applier
            .apply_batch("00000000-0000-0000-0000-000000000001", &[change_deactivated], 3)
            .await
            .unwrap();

        let fetched_deactivated = prod_repo.get_product_by_id(&product_id).await.unwrap();
        assert!(!fetched_deactivated.is_active);
    }
}
