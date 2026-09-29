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

                Self::auto_heal_category_in_tx(tx, &product.category_id)?;
                if let Some(ref bid) = product.brand_id { Self::auto_heal_brand_in_tx(tx, bid)?; }
                if let Some(ref uid) = product.unit_id { Self::auto_heal_unit_in_tx(tx, uid)?; }
                if let Some(ref cid) = product.company_id { Self::auto_heal_company_in_tx(tx, cid)?; }
                if let Some(ref qid) = product.quality_id { Self::auto_heal_quality_in_tx(tx, qid)?; }
                if let Some(ref cid) = product.color_id { Self::auto_heal_color_in_tx(tx, cid)?; }

                SQLiteProductRepository::insert_product_in_tx(tx, &product)?;

                if let Some(qty) = product.initial_quantity {
                    if qty > 0 {
                        let target_branch = if change.branch_id.trim().is_empty() {
                            crate::domain::organization::DEFAULT_MAIN_BRANCH_ID.to_string()
                        } else {
                            change.branch_id.clone()
                        };
                        Self::auto_heal_branch_in_tx(tx, &target_branch)?;

                        let movement_exists: bool = tx.query_row(
                            "SELECT 1 FROM stock_movements WHERE product_id = ?1 AND branch_id = ?2 AND reference_id = 'OPENING_BALANCE'",
                            params![product.id, target_branch],
                            |_| Ok(true),
                        ).unwrap_or(false);

                        if !movement_exists {
                            let now = chrono::Utc::now().to_rfc3339();
                            SQLiteInventoryRepository::set_stock_in_tx(tx, &product.id, &target_branch, qty, &now)?;

                            let movement = crate::domain::inventory::StockMovement {
                                id: uuid::Uuid::new_v4().to_string(),
                                product_id: product.id.clone(),
                                branch_id: target_branch,
                                movement_type: crate::domain::inventory::StockMovementType::In,
                                quantity: qty,
                                previous_stock: 0,
                                resulting_stock: qty,
                                reason: Some("Opening Stock".to_string()),
                                performed_by: None,
                                reference_id: Some("OPENING_BALANCE".to_string()),
                                created_at: now,
                            };
                            SQLiteInventoryRepository::insert_movement_in_tx(tx, &movement)?;
                        }
                    }
                }
            }
            "PRODUCT_UPDATED" => {
                let product: crate::domain::product::Product = match serde_json::from_str(&change.payload) {
                    Ok(p) => p,
                    Err(e) => return Err(DbError::ValidationError(format!("Invalid PRODUCT_UPDATED payload in change_log: {e}"))),
                };

                Self::auto_heal_category_in_tx(tx, &product.category_id)?;
                if let Some(ref bid) = product.brand_id { Self::auto_heal_brand_in_tx(tx, bid)?; }
                if let Some(ref uid) = product.unit_id { Self::auto_heal_unit_in_tx(tx, uid)?; }
                if let Some(ref cid) = product.company_id { Self::auto_heal_company_in_tx(tx, cid)?; }
                if let Some(ref qid) = product.quality_id { Self::auto_heal_quality_in_tx(tx, qid)?; }
                if let Some(ref cid) = product.color_id { Self::auto_heal_color_in_tx(tx, cid)?; }

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
                let mut is_legacy = false;
                let (sale, lines, payments, stock_movements, cash_movement, ledger_entry) = match serde_json::from_str::<crate::domain::sales::SaleSyncEventDto>(&change.payload) {
                    Ok(sync_dto) => (
                        sync_dto.sale,
                        sync_dto.lines,
                        sync_dto.payments,
                        sync_dto.stock_movements,
                        sync_dto.cash_movement,
                        sync_dto.customer_ledger_entry,
                    ),
                    Err(_) => {
                        let result_dto: crate::domain::sales::SaleResultDto = match serde_json::from_str(&change.payload) {
                            Ok(d) => d,
                            Err(e) => return Err(DbError::ValidationError(format!("Invalid SALE_CREATED payload in change_log: {e}"))),
                        };
                        is_legacy = true;
                        (
                            result_dto.sale,
                            result_dto.lines,
                            result_dto.payments,
                            vec![],
                            None,
                            None,
                        )
                    }
                };

                let exists: bool = tx.query_row(
                    "SELECT 1 FROM sales WHERE id = ?1",
                    params![sale.id],
                    |_| Ok(true),
                ).unwrap_or(false);

                if exists {
                    return Ok(());
                }

                // Auto-heal missing references to prevent FK constraint failures
                if let Some(ref uid) = sale.performed_by {
                    Self::auto_heal_user_in_tx(tx, uid)?;
                }
                if let Some(ref cid) = sale.customer_id {
                    Self::auto_heal_customer_in_tx(tx, cid)?;
                }
                Self::auto_heal_branch_in_tx(tx, &sale.branch_id)?;
                for line in &lines {
                    Self::auto_heal_product_in_tx(tx, &line.product_id)?;
                }

                SQLiteSaleRepository::insert_sale_in_tx(tx, &sale)?;

                for line in &lines {
                    SQLiteSaleRepository::insert_sale_line_in_tx(tx, line)?;
                }

                for payment in &payments {
                    SQLiteSaleRepository::insert_sale_payment_in_tx(tx, payment)?;
                }

                if is_legacy {
                    for line in &lines {
                        let current_stock: i64 = tx.query_row(
                            "SELECT quantity FROM stock WHERE product_id = ?1 AND branch_id = ?2",
                            params![line.product_id, sale.branch_id],
                            |r| r.get(0),
                        ).unwrap_or(0);

                        let resulting_stock = current_stock - line.quantity;
                        SQLiteInventoryRepository::set_stock_in_tx(
                            tx,
                            &line.product_id,
                            &sale.branch_id,
                            resulting_stock,
                            &sale.created_at,
                        )?;
                    }
                } else {
                    for m in &stock_movements {
                        SQLiteInventoryRepository::set_stock_in_tx(
                            tx,
                            &m.product_id,
                            &m.branch_id,
                            m.resulting_stock,
                            &m.created_at,
                        )?;
                        SQLiteInventoryRepository::insert_movement_in_tx(tx, m)?;
                    }

                    if let Some(m) = &cash_movement {
                        crate::repositories::SQLiteCashRepository::insert_movement_in_tx(tx, m)?;
                    }

                    if let Some(m) = &ledger_entry {
                        crate::repositories::SQLiteCustomerRepository::insert_ledger_entry_in_tx(tx, m)?;
                    }
                }
            }
            "SALES_RETURN_CREATED" => {
                let event_dto: crate::domain::sales_return::SalesReturnSyncEventDto = match serde_json::from_str(&change.payload) {
                    Ok(d) => d,
                    Err(e) => return Err(DbError::ValidationError(format!("Invalid SALES_RETURN_CREATED payload in change_log: {e}"))),
                };

                let exists: bool = tx.query_row(
                    "SELECT 1 FROM sales_returns WHERE id = ?1",
                    params![event_dto.sales_return.id],
                    |_| Ok(true),
                ).unwrap_or(false);

                if exists {
                    return Ok(());
                }

                if let Some(ref uid) = event_dto.sales_return.performed_by {
                    Self::auto_heal_user_in_tx(tx, uid)?;
                }
                if let Some(ref cid) = event_dto.sales_return.customer_id {
                    Self::auto_heal_customer_in_tx(tx, cid)?;
                }
                Self::auto_heal_branch_in_tx(tx, &event_dto.sales_return.branch_id)?;
                for line in &event_dto.lines {
                    Self::auto_heal_product_in_tx(tx, &line.product_id)?;
                }

                crate::repositories::SQLiteSalesReturnRepository::insert_sales_return_in_tx(tx, &event_dto.sales_return)?;
                crate::repositories::SQLiteSalesReturnRepository::insert_sales_return_lines_in_tx(tx, &event_dto.lines)?;

                for m in &event_dto.stock_movements {
                    SQLiteInventoryRepository::set_stock_in_tx(
                        tx,
                        &m.product_id,
                        &m.branch_id,
                        m.resulting_stock,
                        &m.created_at,
                    )?;
                    SQLiteInventoryRepository::insert_movement_in_tx(tx, m)?;
                }

                if let Some(mut m) = event_dto.cash_movement {
                    if let Some(ref sid) = m.session_id {
                        let sess_exists: bool = tx.query_row(
                            "SELECT 1 FROM cash_sessions WHERE id = ?1",
                            params![sid],
                            |_| Ok(true),
                        ).unwrap_or(false);
                        if !sess_exists {
                            m.session_id = None;
                        }
                    }
                    crate::repositories::SQLiteCashRepository::insert_movement_in_tx(tx, &m)?;
                }

                if let Some(l) = &event_dto.customer_ledger_entry {
                    crate::repositories::SQLiteCustomerRepository::insert_ledger_entry_in_tx(tx, l)?;
                }

                if event_dto.is_fully_refunded {
                    tx.execute(
                        "UPDATE sales SET sale_status = 'REFUNDED', updated_at = ?1 WHERE id = ?2",
                        params![event_dto.sales_return.created_at, event_dto.sales_return.sale_id],
                    ).map_err(|e| DbError::QueryError(format!("Failed to update sale status to REFUNDED downstream: {e}")))?;
                }
            }
            "PURCHASE_CREATED" => {
                let event_dto: crate::domain::purchases::PurchaseSyncEventDto = match serde_json::from_str(&change.payload) {
                    Ok(d) => d,
                    Err(e) => return Err(DbError::ValidationError(format!("Invalid PURCHASE_CREATED payload in change_log: {e}"))),
                };

                let exists: bool = tx.query_row(
                    "SELECT 1 FROM purchases WHERE id = ?1",
                    params![event_dto.purchase.id],
                    |_| Ok(true),
                ).unwrap_or(false);

                if exists {
                    return Ok(());
                }

                // Auto-heal missing references
                if let Some(ref uid) = event_dto.purchase.performed_by {
                    Self::auto_heal_user_in_tx(tx, uid)?;
                }
                Self::auto_heal_supplier_in_tx(tx, &event_dto.purchase.supplier_id)?;
                Self::auto_heal_branch_in_tx(tx, &event_dto.purchase.branch_id)?;
                for line in &event_dto.lines {
                    Self::auto_heal_product_in_tx(tx, &line.product_id)?;
                }

                SQLitePurchaseRepository::insert_purchase_in_tx(tx, &event_dto.purchase)?;
                SQLitePurchaseRepository::insert_purchase_lines_in_tx(tx, &event_dto.lines)?;

                for m in &event_dto.stock_movements {
                    SQLiteInventoryRepository::set_stock_in_tx(
                        tx,
                        &m.product_id,
                        &m.branch_id,
                        m.resulting_stock,
                        &m.created_at,
                    )?;
                    SQLiteInventoryRepository::insert_movement_in_tx(tx, m)?;
                }

                for p_cost in &event_dto.product_cost_updates {
                    SQLiteProductRepository::update_cost_in_tx(
                        tx,
                        &p_cost.product_id,
                        p_cost.new_average_cost,
                        p_cost.last_purchase_price,
                        &event_dto.purchase.created_at,
                    )?;
                }

                if let Some(c) = &event_dto.cash_movement {
                    crate::repositories::SQLiteCashRepository::insert_movement_in_tx(tx, c)?;
                }

                if let Some(l) = &event_dto.supplier_ledger_entry {
                    crate::repositories::SQLiteSupplierRepository::insert_ledger_entry_in_tx(tx, l)?;
                }
            }
            "PURCHASE_RETURN_CREATED" => {
                let event_dto: crate::domain::purchase_return::PurchaseReturnSyncEventDto = match serde_json::from_str(&change.payload) {
                    Ok(d) => d,
                    Err(e) => return Err(DbError::ValidationError(format!("Invalid PURCHASE_RETURN_CREATED payload in change_log: {e}"))),
                };

                let exists: bool = tx.query_row(
                    "SELECT 1 FROM purchase_returns WHERE id = ?1",
                    params![event_dto.purchase_return.id],
                    |_| Ok(true),
                ).unwrap_or(false);

                if exists {
                    return Ok(());
                }

                if let Some(ref uid) = event_dto.purchase_return.performed_by {
                    Self::auto_heal_user_in_tx(tx, uid)?;
                }
                Self::auto_heal_supplier_in_tx(tx, &event_dto.purchase_return.supplier_id)?;
                Self::auto_heal_branch_in_tx(tx, &event_dto.purchase_return.branch_id)?;

                crate::repositories::SQLitePurchaseReturnRepository::insert_purchase_return_in_tx(tx, &event_dto.purchase_return)?;
                crate::repositories::SQLitePurchaseReturnRepository::insert_purchase_return_lines_in_tx(tx, &event_dto.lines)?;

                for m in &event_dto.stock_movements {
                    crate::repositories::SQLiteInventoryRepository::set_stock_in_tx(
                        tx,
                        &m.product_id,
                        &m.branch_id,
                        m.resulting_stock,
                        &m.created_at,
                    )?;
                    crate::repositories::SQLiteInventoryRepository::insert_movement_in_tx(tx, m)?;
                }

                if let Some(c) = &event_dto.cash_movement {
                    crate::repositories::SQLiteCashRepository::insert_movement_in_tx(tx, c)?;
                }

                if let Some(l) = &event_dto.supplier_ledger_entry {
                    crate::repositories::SQLiteSupplierRepository::insert_ledger_entry_in_tx(tx, l)?;
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

                if let Some(ref uid) = expense.performed_by {
                    Self::auto_heal_user_in_tx(tx, uid)?;
                }
                Self::auto_heal_branch_in_tx(tx, &expense.branch_id)?;
                Self::auto_heal_expense_category_in_tx(tx, &expense.category_id)?;

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
                // Phase 1.1: link to the canonical party (payload party_id, else party.id = customer.id).
                let party_id = crate::domain::party::party_id_from_payload(&change.payload, &customer.id);
                crate::repositories::SQLitePartyRepository::ensure_party_for_role_in_tx(
                    tx,
                    &crate::domain::party::PartyRoleContact::from(&customer),
                    &party_id,
                )?;
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
                // Phase 1.1: link to the canonical party (payload party_id, else party.id = supplier.id).
                let party_id = crate::domain::party::party_id_from_payload(&change.payload, &supplier.id);
                crate::repositories::SQLitePartyRepository::ensure_party_for_role_in_tx(
                    tx,
                    &crate::domain::party::PartyRoleContact::from(&supplier),
                    &party_id,
                )?;
            }
            "PARTY_UPSERTED" => {
                let party: crate::domain::party::Party = match serde_json::from_str(&change.payload) {
                    Ok(p) => p,
                    Err(e) => return Err(DbError::ValidationError(format!("Invalid PARTY_UPSERTED payload: {e}"))),
                };
                // Last-writer guard on updated_at (stale events are a no-op). Contact fields are
                // copied down to the roles only when the party is new or strictly newer, so an
                // echoed/duplicate event never overwrites a later role edit.
                let stored = crate::repositories::SQLitePartyRepository::get_party_in_tx(tx, &party.id)?;
                let strictly_newer = stored
                    .as_ref()
                    .map(|p| party.updated_at.as_str() > p.updated_at.as_str())
                    .unwrap_or(true);
                if crate::repositories::SQLitePartyRepository::upsert_party_guarded_in_tx(tx, &party)? && strictly_newer {
                    crate::repositories::SQLitePartyRepository::copy_party_to_roles_in_tx(tx, &party)?;
                }
            }
            "SUPPLIER_PAYMENT_RECORDED" => {
                let payment_event: crate::domain::supplier::SupplierPaymentSyncEventDto = match serde_json::from_str(&change.payload) {
                    Ok(p) => p,
                    Err(e) => return Err(DbError::ValidationError(format!("Invalid SUPPLIER_PAYMENT_RECORDED payload: {e}"))),
                };

                let exists: bool = tx.query_row(
                    "SELECT 1 FROM supplier_ledger_entries WHERE id = ?1 AND entry_type = 'PAYMENT'",
                    params![payment_event.payment_id],
                    |_| Ok(true),
                ).unwrap_or(false);

                if !exists {
                    Self::auto_heal_supplier_in_tx(tx, &payment_event.supplier_id)?;

                    // Apply allocations
                    for alloc in &payment_event.allocated_purchases {
                        tx.execute(
                            "UPDATE purchases SET paid_amount = ?1, credit_amount = total_amount - ?1, payment_status = ?2, updated_at = ?3 WHERE id = ?4",
                            params![alloc.new_paid, alloc.payment_status, payment_event.created_at, alloc.purchase_id],
                        ).map_err(|e| DbError::QueryError(format!("Failed to update purchase allocation: {e}")))?;
                    }

                    // Insert ledger entry
                    let current_outstanding: i64 = tx.query_row(
                        "SELECT COALESCE(SUM(debit) - SUM(credit), 0) FROM supplier_ledger_entries WHERE supplier_id = ?1",
                        params![payment_event.supplier_id],
                        |row| row.get(0),
                    ).unwrap_or(0);

                    // Note: In SQLite schema, debit increases balance, credit decreases balance for suppliers.
                    let new_bal = current_outstanding - payment_event.amount_paid;

                    let desc = format!(
                        "Payment to supplier ({}) Ref: {}",
                        payment_event.payment_method,
                        payment_event.reference_number.as_deref().unwrap_or(&payment_event.receipt_number)
                    );

                    tx.execute(
                        "INSERT INTO supplier_ledger_entries (id, supplier_id, reference_id, reference_number, entry_type, debit, credit, balance_after, description, performed_by, created_at)
                         VALUES (?1, ?2, ?3, ?4, 'PAYMENT', 0, ?5, ?6, ?7, ?8, ?9)",
                        params![
                            payment_event.payment_id,
                            payment_event.supplier_id,
                            payment_event.payment_id,
                            payment_event.receipt_number,
                            payment_event.amount_paid,
                            new_bal,
                            desc,
                            payment_event.performed_by,
                            payment_event.created_at
                        ],
                    ).map_err(|e| DbError::QueryError(format!("Failed to insert supplier payment ledger entry: {e}")))?;
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
            let now = chrono::Utc::now().to_rfc3339();
            let code = format!("CUS-AUTO-{}", &customer_id[0..8]);
            tx.execute(
                "INSERT INTO customers (id, customer_code, name, phone, credit_limit, is_active, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![customer_id, &code, "Unknown Customer (Auto-Healed)", "00000000000", 0, 1, &now, &now],
            ).map_err(|e| DbError::QueryError(format!("Failed to auto-heal customer: {e}")))?;
            // Phase 7: ensure the party/customer relationship is preserved even for placeholder rows.
            // party_id = customer_id (convention: role id as party id when no canonical party exists yet).
            let contact = crate::domain::party::PartyRoleContact {
                kind: crate::domain::party::PartyRoleKind::Customer,
                role_id: customer_id.to_string(),
                role_code: code,
                name: "Unknown Customer (Auto-Healed)".to_string(),
                phone: "00000000000".to_string(),
                alternate_phone: None,
                email: None,
                address: None,
                notes: None,
                is_active: true,
                created_at: now.clone(),
                updated_at: now,
            };
            crate::repositories::SQLitePartyRepository::ensure_party_for_role_in_tx(tx, &contact, customer_id)?;
        }
        Ok(())
    }

    fn auto_heal_supplier_in_tx(tx: &rusqlite::Transaction, supplier_id: &str) -> crate::db::errors::DbResult<()> {
        let exists: bool = tx.query_row("SELECT 1 FROM suppliers WHERE id = ?1", params![supplier_id], |_| Ok(true)).unwrap_or(false);
        if !exists {
            let now = chrono::Utc::now().to_rfc3339();
            let code = format!("SUP-AUTO-{}", &supplier_id[0..8]);
            tx.execute(
                "INSERT INTO suppliers (id, supplier_code, name, phone, credit_limit, is_active, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![supplier_id, &code, "Unknown Supplier (Auto-Healed)", "00000000000", 0, 1, &now, &now],
            ).map_err(|e| DbError::QueryError(format!("Failed to auto-heal supplier: {e}")))?;
            // Phase 7: ensure the party/supplier relationship is preserved even for placeholder rows.
            // party_id = supplier_id (convention: role id as party id when no canonical party exists yet).
            let contact = crate::domain::party::PartyRoleContact {
                kind: crate::domain::party::PartyRoleKind::Supplier,
                role_id: supplier_id.to_string(),
                role_code: code,
                name: "Unknown Supplier (Auto-Healed)".to_string(),
                phone: "00000000000".to_string(),
                alternate_phone: None,
                email: None,
                address: None,
                notes: None,
                is_active: true,
                created_at: now.clone(),
                updated_at: now,
            };
            crate::repositories::SQLitePartyRepository::ensure_party_for_role_in_tx(tx, &contact, supplier_id)?;
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

    fn auto_heal_branch_in_tx(tx: &rusqlite::Transaction, branch_id: &str) -> crate::db::errors::DbResult<()> {
        let exists: bool = tx.query_row("SELECT 1 FROM branches WHERE id = ?1", params![branch_id], |_| Ok(true)).unwrap_or(false);
        if !exists {
            tx.execute(
                "INSERT INTO branches (id, name, location, is_main, is_active, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![branch_id, "Unknown Branch (Auto-Healed)", "Unknown", 0, 1, chrono::Utc::now().to_rfc3339(), chrono::Utc::now().to_rfc3339()],
            ).map_err(|e| DbError::QueryError(format!("Failed to auto-heal branch: {e}")))?;
        }
        Ok(())
    }

    fn auto_heal_expense_category_in_tx(tx: &rusqlite::Transaction, category_id: &str) -> crate::db::errors::DbResult<()> {
        let exists: bool = tx.query_row("SELECT 1 FROM expense_categories WHERE id = ?1", params![category_id], |_| Ok(true)).unwrap_or(false);
        if !exists {
            tx.execute(
                "INSERT INTO expense_categories (id, name, is_active, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![category_id, format!("EXP-AUTO-{}", &category_id[0..8]), 1, chrono::Utc::now().to_rfc3339(), chrono::Utc::now().to_rfc3339()],
            ).map_err(|e| DbError::QueryError(format!("Failed to auto-heal expense category: {e}")))?;
        }
        Ok(())
    }

    fn auto_heal_category_in_tx(tx: &rusqlite::Transaction, category_id: &str) -> crate::db::errors::DbResult<()> {
        let exists: bool = tx.query_row("SELECT 1 FROM categories WHERE id = ?1", params![category_id], |_| Ok(true)).unwrap_or(false);
        if !exists {
            tx.execute(
                "INSERT INTO categories (id, name, code, is_active, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![category_id, "Unknown Category (Auto-Healed)", format!("CAT-{}", &category_id[0..4]), 1, chrono::Utc::now().to_rfc3339(), chrono::Utc::now().to_rfc3339()],
            ).map_err(|e| DbError::QueryError(format!("Failed to auto-heal category: {e}")))?;
        }
        Ok(())
    }

    fn auto_heal_brand_in_tx(tx: &rusqlite::Transaction, brand_id: &str) -> crate::db::errors::DbResult<()> {
        let exists: bool = tx.query_row("SELECT 1 FROM brands WHERE id = ?1", params![brand_id], |_| Ok(true)).unwrap_or(false);
        if !exists {
            tx.execute(
                "INSERT INTO brands (id, name, is_active, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![brand_id, "Unknown Brand (Auto-Healed)", 1, chrono::Utc::now().to_rfc3339(), chrono::Utc::now().to_rfc3339()],
            ).map_err(|e| DbError::QueryError(format!("Failed to auto-heal brand: {e}")))?;
        }
        Ok(())
    }

    fn auto_heal_unit_in_tx(tx: &rusqlite::Transaction, unit_id: &str) -> crate::db::errors::DbResult<()> {
        let exists: bool = tx.query_row("SELECT 1 FROM units WHERE id = ?1", params![unit_id], |_| Ok(true)).unwrap_or(false);
        if !exists {
            tx.execute(
                "INSERT INTO units (id, name, abbreviation, is_active, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![unit_id, "Unknown Unit (Auto-Healed)", "UNK", 1, chrono::Utc::now().to_rfc3339(), chrono::Utc::now().to_rfc3339()],
            ).map_err(|e| DbError::QueryError(format!("Failed to auto-heal unit: {e}")))?;
        }
        Ok(())
    }

    fn auto_heal_company_in_tx(tx: &rusqlite::Transaction, company_id: &str) -> crate::db::errors::DbResult<()> {
        let exists: bool = tx.query_row("SELECT 1 FROM companies WHERE id = ?1", params![company_id], |_| Ok(true)).unwrap_or(false);
        if !exists {
            tx.execute(
                "INSERT INTO companies (id, name, is_active, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![company_id, "Unknown Company (Auto-Healed)", 1, chrono::Utc::now().to_rfc3339(), chrono::Utc::now().to_rfc3339()],
            ).map_err(|e| DbError::QueryError(format!("Failed to auto-heal company: {e}")))?;
        }
        Ok(())
    }

    fn auto_heal_quality_in_tx(tx: &rusqlite::Transaction, quality_id: &str) -> crate::db::errors::DbResult<()> {
        let exists: bool = tx.query_row("SELECT 1 FROM qualities WHERE id = ?1", params![quality_id], |_| Ok(true)).unwrap_or(false);
        if !exists {
            tx.execute(
                "INSERT INTO qualities (id, name, is_active, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![quality_id, "Unknown Quality (Auto-Healed)", 1, chrono::Utc::now().to_rfc3339(), chrono::Utc::now().to_rfc3339()],
            ).map_err(|e| DbError::QueryError(format!("Failed to auto-heal quality: {e}")))?;
        }
        Ok(())
    }

    fn auto_heal_color_in_tx(tx: &rusqlite::Transaction, color_id: &str) -> crate::db::errors::DbResult<()> {
        let exists: bool = tx.query_row("SELECT 1 FROM colors WHERE id = ?1", params![color_id], |_| Ok(true)).unwrap_or(false);
        if !exists {
            tx.execute(
                "INSERT INTO colors (id, name, hex_code, is_active, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![color_id, "Unknown Color (Auto-Healed)", "#000000", 1, chrono::Utc::now().to_rfc3339(), chrono::Utc::now().to_rfc3339()],
            ).map_err(|e| DbError::QueryError(format!("Failed to auto-heal color: {e}")))?;
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
            initial_quantity: None,
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
            initial_quantity: None,
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
            initial_quantity: None,
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
            initial_quantity: None,
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

    #[tokio::test]
    async fn test_downstream_product_opening_stock_projection() {
        let db = setup_test_db().await;
        let applier = ChangeApplier::new(db.clone());

        let product_id = "00000000-0000-0000-0000-000000000777".to_string();
        let prod = Product {
            id: product_id.clone(),
            name: "Stock Phone".to_string(),
            normalized_name: crate::domain::product::normalize_product_name("Stock Phone"),
            sku: "SKU-STOCK1".to_string(),
            barcode: Some("999999999".to_string()),
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
            initial_quantity: Some(10),
            created_at: "2026-01-01T00:00:00Z".to_string(),
            updated_at: "2026-01-01T00:00:00Z".to_string(),
        };

        let change = ChangeLogEntry {
            sequence: 1,
            organization_id: "org1".to_string(),
            branch_id: "00000000-0000-0000-0000-000000000002".to_string(),
            client_event_id: None,
            event_type: "PRODUCT_CREATED".to_string(),
            entity_type: "PRODUCT".to_string(),
            entity_id: product_id.clone(),
            payload: serde_json::to_string(&prod).unwrap(),
            created_at: "2026-01-01T00:00:00Z".to_string(),
        };

        applier.apply_batch("org1", &[change.clone()], 1).await.unwrap();

        // Verify stock is 10 on target branch
        let inv_repo = crate::repositories::SQLiteInventoryRepository::new(db.clone());
        let stock = inv_repo.get_stock(&product_id, "00000000-0000-0000-0000-000000000002").await.unwrap();
        assert_eq!(stock, 10);

        // Replay same batch and verify stock is still 10 (not doubled)
        applier.apply_batch("org1", &[change], 1).await.unwrap();
        let stock_replay = inv_repo.get_stock(&product_id, "00000000-0000-0000-0000-000000000002").await.unwrap();
        assert_eq!(stock_replay, 10);
    }

    #[tokio::test]
    async fn test_downstream_parties_both_roles_and_guarded_party_upsert() {
        let db = setup_test_db().await;
        let applier = ChangeApplier::new(db.clone());
        let org = "00000000-0000-0000-0000-000000000001";
        let party_id = "11111111-1111-4111-8111-111111111111";
        let supplier_id = "33333333-3333-4333-8333-333333333333";
        let t0 = "2026-09-28T10:00:00+00:00";
        let entry = |seq: i64, event_type: &str, entity: &str, id: &str, payload: String| ChangeLogEntry {
            sequence: seq,
            organization_id: org.to_string(),
            branch_id: "00000000-0000-0000-0000-000000000002".to_string(),
            client_event_id: Some(format!("evt_{seq}")),
            event_type: event_type.to_string(),
            entity_type: entity.to_string(),
            entity_id: id.to_string(),
            payload,
            created_at: t0.to_string(),
        };
        let party = crate::domain::party::Party {
            id: party_id.into(),
            display_name: "Ali Traders".into(),
            company_name: Some("Ali & Sons".into()),
            phone: "0300111222".into(),
            alternate_phone: None,
            email: None,
            address: None,
            notes: None,
            is_active: true,
            created_at: t0.into(),
            updated_at: t0.into(),
        };
        let customer = crate::domain::customer::Customer {
            id: party_id.into(),
            customer_code: "CUS-000009".into(),
            name: "Ali Traders".into(),
            phone: "0300111222".into(),
            alternate_phone: None,
            email: None,
            address: None,
            notes: None,
            credit_limit: 0,
            is_active: true,
            created_at: t0.into(),
            updated_at: t0.into(),
        };
        let supplier = crate::domain::supplier::Supplier {
            id: supplier_id.into(),
            supplier_code: "SUP-000009".into(),
            name: "Ali Traders".into(),
            phone: "0300111222".into(),
            alternate_phone: None,
            email: None,
            address: None,
            notes: None,
            credit_limit: 0,
            is_active: true,
            created_at: t0.into(),
            updated_at: t0.into(),
        };
        // Roles arrive BEFORE the party event (order independence).
        let c_payload = crate::domain::party::role_payload_with_party_id(&customer, party_id).unwrap();
        let s_payload = crate::domain::party::role_payload_with_party_id(&supplier, party_id).unwrap();
        let batch = vec![
            entry(1, "CUSTOMER_CREATED", "CUSTOMER", party_id, c_payload),
            entry(2, "SUPPLIER_CREATED", "SUPPLIER", supplier_id, s_payload),
            entry(3, "PARTY_UPSERTED", "PARTY", party_id, serde_json::to_string(&party).unwrap()),
        ];
        applier.apply_batch(org, &batch, 3).await.unwrap();
        applier.apply_batch(org, &batch, 3).await.unwrap(); // replay is safe

        let repo = crate::repositories::SQLitePartyRepository::new(db.clone());
        let s = repo.get_party_summary(party_id).await.unwrap().unwrap();
        assert_eq!(s.party_type, Some(crate::domain::party::PartyType::Both));
        assert_eq!(s.supplier_id.as_deref(), Some(supplier_id));
        assert_eq!(s.party.company_name.as_deref(), Some("Ali & Sons"));

        // Newer party edit is applied and copied to both roles.
        let mut newer = party.clone();
        newer.display_name = "Ali Traders Hall Road".into();
        newer.updated_at = "2026-09-28T11:00:00+00:00".into();
        applier
            .apply_batch(org, &[entry(4, "PARTY_UPSERTED", "PARTY", party_id, serde_json::to_string(&newer).unwrap())], 4)
            .await
            .unwrap();
        // A stale party edit is ignored.
        let mut stale = party.clone();
        stale.display_name = "Stale".into();
        stale.updated_at = "2026-09-28T10:30:00+00:00".into();
        applier
            .apply_batch(org, &[entry(5, "PARTY_UPSERTED", "PARTY", party_id, serde_json::to_string(&stale).unwrap())], 5)
            .await
            .unwrap();
        let s = repo.get_party_summary(party_id).await.unwrap().unwrap();
        assert_eq!(s.party.display_name, "Ali Traders Hall Road");
        let cust = crate::repositories::SQLiteCustomerRepository::new(db.clone())
            .get_customer_by_id(party_id)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(cust.name, "Ali Traders Hall Road");

        // Legacy change_log entry without party_id follows party.id = role.id.
        let legacy_id = "44444444-4444-4444-8444-444444444444";
        let mut legacy = customer.clone();
        legacy.id = legacy_id.into();
        legacy.customer_code = "CUS-000010".into();
        applier
            .apply_batch(org, &[entry(6, "CUSTOMER_CREATED", "CUSTOMER", legacy_id, serde_json::to_string(&legacy).unwrap())], 6)
            .await
            .unwrap();
        let s = repo.get_party_summary(legacy_id).await.unwrap().unwrap();
        assert_eq!(s.customer_id.as_deref(), Some(legacy_id));
    }
}
