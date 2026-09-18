use rusqlite::params;
use tracing::info;

use crate::db::connection::DatabaseConnection;
use crate::db::errors::DbError;
use crate::domain::change_log::ChangeLogEntry;
use crate::errors::AppResult;
use crate::repositories::{
    SQLiteExpenseRepository, SQLiteInventoryRepository, SQLitePurchaseRepository,
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
