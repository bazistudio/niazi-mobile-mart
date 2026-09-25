use rusqlite::params;
use tracing::info;

use crate::db::connection::DatabaseConnection;
use crate::db::errors::DbError;
use crate::domain::change_log::ChangeLogEntry;
use crate::errors::AppResult;
use crate::repositories::{
    SQLiteExpenseRepository, SQLiteInventoryRepository, SQLiteProductRepository, SQLitePurchaseRepository,
    SQLiteSaleRepository, SQLiteSyncCursorRepository, SQLiteCatalogRepository,
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
            tx.execute("PRAGMA defer_foreign_keys = ON", [])
                .map_err(|e| crate::db::errors::DbError::QueryError(format!("Failed to defer foreign keys: {e}")))?;

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

                // Auto-heal missing references to prevent FK constraint failures
                if let Some(ref uid) = result_dto.sale.performed_by {
                    Self::auto_heal_user_in_tx(tx, uid)?;
                }
                if let Some(ref cid) = result_dto.sale.customer_id {
                    Self::auto_heal_customer_in_tx(tx, cid)?;
                }
                for line in &result_dto.lines {
                    Self::auto_heal_product_in_tx(tx, &line.product_id)?;
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

                // Auto-heal missing references
                if let Some(ref uid) = result_dto.purchase.performed_by {
                    Self::auto_heal_user_in_tx(tx, uid)?;
                }
                Self::auto_heal_supplier_in_tx(tx, &result_dto.purchase.supplier_id)?;
                for line in &result_dto.lines {
                    Self::auto_heal_product_in_tx(tx, &line.product_id)?;
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
            "CATEGORY_CREATED" => {
                let entity: crate::domain::catalog::Category = match serde_json::from_str(&change.payload) {
                    Ok(e) => e,
                    Err(e) => return Err(DbError::ValidationError(format!("Invalid CATEGORY_CREATED payload in change_log: {e}"))),
                };
                let exists: bool = tx.query_row("SELECT 1 FROM categories WHERE id = ?1", params![entity.id], |_| Ok(true)).unwrap_or(false);
                if exists { return Ok(()); }
                SQLiteCatalogRepository::insert_category_in_tx(tx, &entity)?;
            }
            "BRAND_CREATED" => {
                let entity: crate::domain::catalog::Brand = match serde_json::from_str(&change.payload) {
                    Ok(e) => e,
                    Err(e) => return Err(DbError::ValidationError(format!("Invalid BRAND_CREATED payload in change_log: {e}"))),
                };
                let exists: bool = tx.query_row("SELECT 1 FROM brands WHERE id = ?1", params![entity.id], |_| Ok(true)).unwrap_or(false);
                if exists { return Ok(()); }
                SQLiteCatalogRepository::insert_brand_in_tx(tx, &entity)?;
            }
            "UNIT_CREATED" => {
                let entity: crate::domain::catalog::Unit = match serde_json::from_str(&change.payload) {
                    Ok(e) => e,
                    Err(e) => return Err(DbError::ValidationError(format!("Invalid UNIT_CREATED payload in change_log: {e}"))),
                };
                let exists: bool = tx.query_row("SELECT 1 FROM units WHERE id = ?1", params![entity.id], |_| Ok(true)).unwrap_or(false);
                if exists { return Ok(()); }
                SQLiteCatalogRepository::insert_unit_in_tx(tx, &entity)?;
            }
            "COMPANY_CREATED" => {
                let entity: crate::domain::catalog::Company = match serde_json::from_str(&change.payload) {
                    Ok(e) => e,
                    Err(e) => return Err(DbError::ValidationError(format!("Invalid COMPANY_CREATED payload in change_log: {e}"))),
                };
                let exists: bool = tx.query_row("SELECT 1 FROM companies WHERE id = ?1", params![entity.id], |_| Ok(true)).unwrap_or(false);
                if exists { return Ok(()); }
                SQLiteCatalogRepository::insert_company_in_tx(tx, &entity)?;
            }
            "QUALITY_CREATED" => {
                let entity: crate::domain::catalog::Quality = match serde_json::from_str(&change.payload) {
                    Ok(e) => e,
                    Err(e) => return Err(DbError::ValidationError(format!("Invalid QUALITY_CREATED payload in change_log: {e}"))),
                };
                let exists: bool = tx.query_row("SELECT 1 FROM qualities WHERE id = ?1", params![entity.id], |_| Ok(true)).unwrap_or(false);
                if exists { return Ok(()); }
                SQLiteCatalogRepository::insert_quality_in_tx(tx, &entity)?;
            }
            "COLOR_CREATED" => {
                let entity: crate::domain::catalog::Color = match serde_json::from_str(&change.payload) {
                    Ok(e) => e,
                    Err(e) => return Err(DbError::ValidationError(format!("Invalid COLOR_CREATED payload in change_log: {e}"))),
                };
                let exists: bool = tx.query_row("SELECT 1 FROM colors WHERE id = ?1", params![entity.id], |_| Ok(true)).unwrap_or(false);
                if exists { return Ok(()); }
                SQLiteCatalogRepository::insert_color_in_tx(tx, &entity)?;
            }
            "CUSTOMER_CREATED" | "CUSTOMER_UPDATED" => {
                let customer: crate::domain::customer::Customer = match serde_json::from_str(&change.payload) {
                    Ok(c) => c,
                    Err(e) => return Err(DbError::ValidationError(format!("Invalid {} payload: {e}", change.event_type))),
                };
                let exists: bool = tx.query_row("SELECT 1 FROM customers WHERE id = ?1", params![customer.id], |_| Ok(true)).unwrap_or(false);
                if exists {
                    tx.execute(
                        "UPDATE customers SET name = ?1, phone = ?2, alternate_phone = ?3, email = ?4, address = ?5, notes = ?6, credit_limit = ?7, is_active = ?8, updated_at = ?9 WHERE id = ?10",
                        params![customer.name, customer.phone, customer.alternate_phone, customer.email, customer.address, customer.notes, customer.credit_limit, if customer.is_active { 1 } else { 0 }, customer.updated_at, customer.id],
                    ).map_err(|e| DbError::QueryError(format!("Failed to update customer: {e}")))?;
                } else {
                    tx.execute(
                        "INSERT INTO customers (id, customer_code, name, phone, alternate_phone, email, address, notes, credit_limit, is_active, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
                        params![customer.id, customer.customer_code, customer.name, customer.phone, customer.alternate_phone, customer.email, customer.address, customer.notes, customer.credit_limit, if customer.is_active { 1 } else { 0 }, customer.created_at, customer.updated_at],
                    ).map_err(|e| DbError::QueryError(format!("Failed to insert customer: {e}")))?;
                }
            }
            "SUPPLIER_CREATED" | "SUPPLIER_UPDATED" => {
                let supplier: crate::domain::supplier::Supplier = match serde_json::from_str(&change.payload) {
                    Ok(s) => s,
                    Err(e) => return Err(DbError::ValidationError(format!("Invalid {} payload: {e}", change.event_type))),
                };
                let exists: bool = tx.query_row("SELECT 1 FROM suppliers WHERE id = ?1", params![supplier.id], |_| Ok(true)).unwrap_or(false);
                if exists {
                    tx.execute(
                        "UPDATE suppliers SET name = ?1, phone = ?2, alternate_phone = ?3, email = ?4, address = ?5, notes = ?6, credit_limit = ?7, is_active = ?8, updated_at = ?9 WHERE id = ?10",
                        params![supplier.name, supplier.phone, supplier.alternate_phone, supplier.email, supplier.address, supplier.notes, supplier.credit_limit, if supplier.is_active { 1 } else { 0 }, supplier.updated_at, supplier.id],
                    ).map_err(|e| DbError::QueryError(format!("Failed to update supplier: {e}")))?;
                } else {
                    crate::repositories::SQLiteSupplierRepository::insert_supplier_in_tx(tx, &supplier)?;
                }
            }
            _ => {
                // Forward-compatible ignore for future business event types
            }
        }
        Ok(())
    }

    fn auto_heal_user_in_tx(tx: &rusqlite::Transaction, user_id: &str) -> crate::db::errors::DbResult<()> {
        let exists: bool = tx.query_row("SELECT 1 FROM users WHERE id = ?1", params![user_id], |_| Ok(true)).unwrap_or(false);
        if !exists {
            tx.execute(
                "INSERT INTO users (id, username, password_hash, role, first_name, last_name, is_active, created_at, updated_at, must_change_password) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                params![user_id, format!("auto_{}", &user_id[0..8]), "dummy", "STAFF", "Auto", "Healed", 1, chrono::Utc::now().to_rfc3339(), chrono::Utc::now().to_rfc3339(), 0],
            ).map_err(|e| DbError::QueryError(format!("Failed to auto-heal user: {e}")))?;
        }
        Ok(())
    }

    fn auto_heal_customer_in_tx(tx: &rusqlite::Transaction, customer_id: &str) -> crate::db::errors::DbResult<()> {
        let exists: bool = tx.query_row("SELECT 1 FROM customers WHERE id = ?1", params![customer_id], |_| Ok(true)).unwrap_or(false);
        if !exists {
            tx.execute(
                "INSERT INTO customers (id, customer_code, name, phone, credit_limit, is_active, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![customer_id, format!("CUS-AUTO-{}", &customer_id[0..8]), "Unknown Customer (Auto-Healed)", "00000000000", 0, 1, chrono::Utc::now().to_rfc3339(), chrono::Utc::now().to_rfc3339()],
            ).map_err(|e| DbError::QueryError(format!("Failed to auto-heal customer: {e}")))?;
        }
        Ok(())
    }

    fn auto_heal_supplier_in_tx(tx: &rusqlite::Transaction, supplier_id: &str) -> crate::db::errors::DbResult<()> {
        let exists: bool = tx.query_row("SELECT 1 FROM suppliers WHERE id = ?1", params![supplier_id], |_| Ok(true)).unwrap_or(false);
        if !exists {
            tx.execute(
                "INSERT INTO suppliers (id, supplier_code, name, phone, credit_limit, is_active, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![supplier_id, format!("SUP-AUTO-{}", &supplier_id[0..8]), "Unknown Supplier (Auto-Healed)", "00000000000", 0, 1, chrono::Utc::now().to_rfc3339(), chrono::Utc::now().to_rfc3339()],
            ).map_err(|e| DbError::QueryError(format!("Failed to auto-heal supplier: {e}")))?;
        }
        Ok(())
    }

    fn auto_heal_product_in_tx(tx: &rusqlite::Transaction, product_id: &str) -> crate::db::errors::DbResult<()> {
        let exists: bool = tx.query_row("SELECT 1 FROM products WHERE id = ?1", params![product_id], |_| Ok(true)).unwrap_or(false);
        if !exists {
            tx.execute(
                "INSERT INTO products (id, name, sku, purchase_price, sale_price, is_active, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![product_id, "Unknown Product (Auto-Healed)", format!("SKU-AUTO-{}", &product_id[0..8]), 0, 0, 1, chrono::Utc::now().to_rfc3339(), chrono::Utc::now().to_rfc3339()],
            ).map_err(|e| DbError::QueryError(format!("Failed to auto-heal product: {e}")))?;
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
    #[tokio::test]
    async fn test_downstream_category_auto_heal_creation() {
        let db = setup_test_db().await;
        let applier = ChangeApplier::new(db.clone());

        let cat_id = "00000000-0000-0000-0000-000000000999".to_string();
        let cat = crate::domain::catalog::Category {
            id: cat_id.clone(),
            name: "Auto Category".to_string(),
            code: "AUTO".to_string(),
            description: None,
            is_active: true,
            created_at: "2026-01-01T00:00:00Z".to_string(),
            updated_at: "2026-01-01T00:00:00Z".to_string(),
        };

        let change = ChangeLogEntry {
            sequence: 1,
            organization_id: "org1".to_string(),
            branch_id: "br1".to_string(),
            client_event_id: None,
            event_type: "CATEGORY_CREATED".to_string(),
            entity_type: "CATEGORY".to_string(),
            entity_id: cat_id.clone(),
            payload: serde_json::to_string(&cat).unwrap(),
            created_at: "2026-01-01T00:00:00Z".to_string(),
        };

        applier.apply_batch("org1", &[change], 1).await.unwrap();

        let repo = crate::repositories::SQLiteCatalogRepository::new(db.clone());
        let fetched = repo.get_category_by_id(&cat_id).await.unwrap();
        assert_eq!(fetched.name, "Auto Category");
        assert_eq!(fetched.code, "AUTO");
    }

    #[tokio::test]
    async fn test_downstream_brand_unit_company_quality_color_creation() {
        let db = setup_test_db().await;
        let applier = ChangeApplier::new(db.clone());

        let id = "00000000-0000-0000-0000-000000000999".to_string();
        let unit = crate::domain::catalog::Unit {
            id: id.clone(),
            name: "Auto Unit".to_string(),
            symbol: Some("AU".to_string()),
            conversion_factor: 1,
            is_active: true,
            created_at: "2026-01-01T00:00:00Z".to_string(),
            updated_at: "2026-01-01T00:00:00Z".to_string(),
        };

        let change = ChangeLogEntry {
            sequence: 1,
            organization_id: "org1".to_string(),
            branch_id: "br1".to_string(),
            client_event_id: None,
            event_type: "UNIT_CREATED".to_string(),
            entity_type: "UNIT".to_string(),
            entity_id: id.clone(),
            payload: serde_json::to_string(&unit).unwrap(),
            created_at: "2026-01-01T00:00:00Z".to_string(),
        };

        applier.apply_batch("org1", &[change], 1).await.unwrap();

        let repo = crate::repositories::SQLiteCatalogRepository::new(db.clone());
        let fetched = repo.get_unit_by_id(&id).await.unwrap();
        assert_eq!(fetched.name, "Auto Unit");
        assert_eq!(fetched.symbol.as_deref(), Some("AU"));
        assert_eq!(fetched.conversion_factor, 1);
    }

    #[tokio::test]
    async fn test_downstream_master_data_replay_idempotency() {
        let db = setup_test_db().await;
        let applier = ChangeApplier::new(db.clone());

        let cat_id = "00000000-0000-0000-0000-000000000999".to_string();
        let cat = crate::domain::catalog::Category {
            id: cat_id.clone(),
            name: "Auto Category".to_string(),
            code: "AUTO".to_string(),
            description: None,
            is_active: true,
            created_at: "2026-01-01T00:00:00Z".to_string(),
            updated_at: "2026-01-01T00:00:00Z".to_string(),
        };

        let change = ChangeLogEntry {
            sequence: 1,
            organization_id: "org1".to_string(),
            branch_id: "br1".to_string(),
            client_event_id: None,
            event_type: "CATEGORY_CREATED".to_string(),
            entity_type: "CATEGORY".to_string(),
            entity_id: cat_id.clone(),
            payload: serde_json::to_string(&cat).unwrap(),
            created_at: "2026-01-01T00:00:00Z".to_string(),
        };

        applier.apply_batch("org1", &[change.clone()], 1).await.unwrap();
        applier.apply_batch("org1", &[change.clone()], 1).await.unwrap(); // Should safely no-op
    }

    #[tokio::test]
    async fn test_downstream_complete_product_dependency_chain() {
        let db = setup_test_db().await;
        let applier = ChangeApplier::new(db.clone());

        let cat_id = "00000000-0000-0000-0000-000000000999".to_string();
        let cat = crate::domain::catalog::Category {
            id: cat_id.clone(),
            name: "Auto Category".to_string(),
            code: "AUTO".to_string(),
            description: None,
            is_active: true,
            created_at: "2026-01-01T00:00:00Z".to_string(),
            updated_at: "2026-01-01T00:00:00Z".to_string(),
        };

        let change1 = ChangeLogEntry {
            sequence: 1,
            organization_id: "org1".to_string(),
            branch_id: "br1".to_string(),
            client_event_id: None,
            event_type: "CATEGORY_CREATED".to_string(),
            entity_type: "CATEGORY".to_string(),
            entity_id: cat_id.clone(),
            payload: serde_json::to_string(&cat).unwrap(),
            created_at: "2026-01-01T00:00:00Z".to_string(),
        };

        let product_id = "00000000-0000-0000-0000-000000000888".to_string();
        let prod = Product {
            id: product_id.clone(),
            name: "Test Phone".to_string(),
            normalized_name: crate::domain::product::normalize_product_name("Test Phone"),
            sku: "SKU-TPHONE2".to_string(),
            barcode: Some("12345678910".to_string()),
            category_id: cat_id.clone(),
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

        let change2 = ChangeLogEntry {
            sequence: 2,
            organization_id: "org1".to_string(),
            branch_id: "br1".to_string(),
            client_event_id: None,
            event_type: "PRODUCT_CREATED".to_string(),
            entity_type: "PRODUCT".to_string(),
            entity_id: product_id.clone(),
            payload: serde_json::to_string(&prod).unwrap(),
            created_at: "2026-01-01T00:00:00Z".to_string(),
        };

        applier.apply_batch("org1", &[change1, change2], 2).await.unwrap();
    }

    #[tokio::test]
    async fn test_downstream_missing_optional_parents() {
        let db = setup_test_db().await;
        let applier = ChangeApplier::new(db.clone());
        let product_id = "00000000-0000-0000-0000-000000000888".to_string();
        let prod = Product {
            id: product_id.clone(),
            name: "Test Phone".to_string(),
            normalized_name: crate::domain::product::normalize_product_name("Test Phone"),
            sku: "SKU-TPHONE3".to_string(),
            barcode: Some("1234567891011".to_string()),
            category_id: "00000000-0000-0000-0000-000000000010".to_string(), // Exists from default data
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

        let change = ChangeLogEntry {
            sequence: 1,
            organization_id: "org1".to_string(),
            branch_id: "br1".to_string(),
            client_event_id: None,
            event_type: "PRODUCT_CREATED".to_string(),
            entity_type: "PRODUCT".to_string(),
            entity_id: product_id.clone(),
            payload: serde_json::to_string(&prod).unwrap(),
            created_at: "2026-01-01T00:00:00Z".to_string(),
        };
        applier.apply_batch("org1", &[change], 1).await.unwrap();
    }

    #[tokio::test]
    async fn test_downstream_replay_safety() {
        let db = setup_test_db().await;
        let applier = ChangeApplier::new(db.clone());

        let cat_id = "00000000-0000-0000-0000-000000000999".to_string();
        let cat = crate::domain::catalog::Category {
            id: cat_id.clone(),
            name: "Auto Category".to_string(),
            code: "AUTO".to_string(),
            description: None,
            is_active: true,
            created_at: "2026-01-01T00:00:00Z".to_string(),
            updated_at: "2026-01-01T00:00:00Z".to_string(),
        };

        let change1 = ChangeLogEntry {
            sequence: 1,
            organization_id: "org1".to_string(),
            branch_id: "br1".to_string(),
            client_event_id: None,
            event_type: "CATEGORY_CREATED".to_string(),
            entity_type: "CATEGORY".to_string(),
            entity_id: cat_id.clone(),
            payload: serde_json::to_string(&cat).unwrap(),
            created_at: "2026-01-01T00:00:00Z".to_string(),
        };

        let product_id = "00000000-0000-0000-0000-000000000888".to_string();
        let prod = Product {
            id: product_id.clone(),
            name: "Test Phone".to_string(),
            normalized_name: crate::domain::product::normalize_product_name("Test Phone"),
            sku: "SKU-TPHONE2".to_string(),
            barcode: Some("12345678910".to_string()),
            category_id: cat_id.clone(),
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

        let change2 = ChangeLogEntry {
            sequence: 2,
            organization_id: "org1".to_string(),
            branch_id: "br1".to_string(),
            client_event_id: None,
            event_type: "PRODUCT_CREATED".to_string(),
            entity_type: "PRODUCT".to_string(),
            entity_id: product_id.clone(),
            payload: serde_json::to_string(&prod).unwrap(),
            created_at: "2026-01-01T00:00:00Z".to_string(),
        };

        applier.apply_batch("org1", &[change1.clone(), change2.clone()], 2).await.unwrap();
        // apply again
        applier.apply_batch("org1", &[change1.clone(), change2.clone()], 2).await.unwrap();
    }

    #[tokio::test]
    async fn test_downstream_atomic_rollback() {
        let db = setup_test_db().await;
        let applier = ChangeApplier::new(db.clone());

        let cat_id = "00000000-0000-0000-0000-000000000999".to_string();
        let cat = crate::domain::catalog::Category {
            id: cat_id.clone(),
            name: "Auto Category".to_string(),
            code: "AUTO".to_string(),
            description: None,
            is_active: true,
            created_at: "2026-01-01T00:00:00Z".to_string(),
            updated_at: "2026-01-01T00:00:00Z".to_string(),
        };

        let change1 = ChangeLogEntry {
            sequence: 1,
            organization_id: "org1".to_string(),
            branch_id: "br1".to_string(),
            client_event_id: None,
            event_type: "CATEGORY_CREATED".to_string(),
            entity_type: "CATEGORY".to_string(),
            entity_id: cat_id.clone(),
            payload: serde_json::to_string(&cat).unwrap(),
            created_at: "2026-01-01T00:00:00Z".to_string(),
        };

        let change2 = ChangeLogEntry {
            sequence: 2,
            organization_id: "org1".to_string(),
            branch_id: "br1".to_string(),
            client_event_id: None,
            event_type: "PRODUCT_CREATED".to_string(),
            entity_type: "PRODUCT".to_string(),
            entity_id: "id2".to_string(),
            payload: "{ INVALID JSON }".to_string(), // This will cause a validation error and rollback the transaction
            created_at: "2026-01-01T00:00:00Z".to_string(),
        };

        let result = applier.apply_batch("org1", &[change1, change2], 2).await;
        assert!(result.is_err());

        // Category should be rolled back
        let repo = crate::repositories::SQLiteCatalogRepository::new(db.clone());
        let fetched = repo.get_category_by_id(&cat_id).await;
        assert!(fetched.is_err());
    }
}
