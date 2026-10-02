use crate::domain::inventory::{
    AdjustStockDto, DecreaseStockDto, IncreaseStockDto, LowStockItemDto, StockMovement,
    TransferStockDto,
};
use crate::errors::{AppError, AppResult};
use crate::repositories::{InventoryRepository, PostgresInventoryRepository};

#[derive(Clone)]
pub struct InventoryService {
    repo: InventoryRepository,
}

impl InventoryService {
    pub fn new_postgres(pool: sqlx::PgPool) -> Self {
        Self {
            repo: InventoryRepository::new(PostgresInventoryRepository::new(pool)),
        }
    }

    /// Atomically increases stock and records an IN movement ledger entry
    pub async fn increase_stock(
        &self,
        dto: IncreaseStockDto,
        user_id: Option<&str>,
    ) -> AppResult<i64> {
        if dto.quantity <= 0 {
            return Err(AppError::Validation(
                "Quantity must be greater than 0".to_string(),
            ));
        }
        self.repo.increase_stock(&dto, user_id).await
    }

    /// Atomically decreases stock and records an OUT movement ledger entry.
    /// Strictly rejects negative stock and rolls back without state changes.
    pub async fn decrease_stock(
        &self,
        dto: DecreaseStockDto,
        user_id: Option<&str>,
    ) -> AppResult<i64> {
        if dto.quantity <= 0 {
            return Err(AppError::Validation(
                "Quantity must be greater than 0".to_string(),
            ));
        }
        self.repo.decrease_stock(&dto, user_id).await
    }

    /// Atomically adjusts stock to a target quantity and records an ADJUSTMENT movement ledger entry.
    /// Strictly rejects zero-effect (no-op) adjustments.
    pub async fn adjust_stock(&self, dto: AdjustStockDto, user_id: Option<&str>) -> AppResult<i64> {
        if dto.target_quantity < 0 {
            return Err(AppError::Validation(
                "Target stock quantity cannot be negative".to_string(),
            ));
        }
        if dto.reason.trim().is_empty() {
            return Err(AppError::Validation(
                "Reason is required for stock adjustment".to_string(),
            ));
        }
        self.repo.adjust_stock(&dto, user_id).await
    }

    /// Atomically transfers stock from one controlled branch to another.
    pub async fn transfer_stock(
        &self,
        dto: TransferStockDto,
        user_id: Option<&str>,
    ) -> AppResult<()> {
        if dto.from_branch_id == dto.to_branch_id {
            return Err(AppError::Validation(
                "Source and destination branch cannot be the same".to_string(),
            ));
        }
        if dto.quantity <= 0 {
            return Err(AppError::Validation(
                "Transfer quantity must be greater than 0".to_string(),
            ));
        }
        self.repo.transfer_stock(&dto, user_id).await
    }

    pub async fn get_stock(&self, product_id: &str, branch_id: &str) -> AppResult<i64> {
        self.repo.get_stock(product_id, branch_id).await
    }

    pub async fn get_stock_map(
        &self,
        branch_id: &str,
    ) -> AppResult<std::collections::HashMap<String, i64>> {
        self.repo.get_stock_map(branch_id).await
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
    use crate::domain::inventory::{
        AdjustStockDto, DecreaseStockDto, IncreaseStockDto, TransferStockDto,
    };

    async fn setup_test_service() -> InventoryService {
        let pool = sqlx::PgPool::connect_lazy("postgres://localhost/test_placeholder")
            .expect("connect_lazy should succeed");
        InventoryService::new_postgres(pool)
    }

    #[tokio::test]
    #[ignore]
    async fn test_inventory_increase_decrease_and_negative_stock_rejection() {
        let _service = setup_test_service().await;
        // Requires real Postgres DB — skipped
    }

    #[tokio::test]
    #[ignore]
    async fn test_inventory_adjustment_semantics() {
        let _service = setup_test_service().await;
        // Requires real Postgres DB — skipped
    }

    #[tokio::test]
    #[ignore]
    async fn test_inventory_atomic_branch_transfer() {
        let _service = setup_test_service().await;
        // Requires real Postgres DB — skipped
    }
}
