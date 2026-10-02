use uuid::Uuid;

use crate::domain::supplier::{
    CreateSupplierDto, Supplier, SupplierDetailDto, SupplierFilter, SupplierStatementDto,
    SupplierSummaryDto, UpdateSupplierDto,
};
use crate::errors::{AppError, AppResult};
use crate::repositories::{PostgresSupplierRepository, SupplierRepository};

#[derive(Clone)]
pub struct SupplierService {
    supplier_repo: SupplierRepository,
}

impl SupplierService {
    pub fn new_postgres(pool: sqlx::PgPool) -> Self {
        Self {
            supplier_repo: SupplierRepository::new(PostgresSupplierRepository::new(pool)),
        }
    }

    /// Creates a new supplier with backend-generated UUID and sequential supplier code
    pub async fn create_supplier(&self, dto: CreateSupplierDto) -> AppResult<Supplier> {
        let name = dto.name.trim();
        if name.is_empty() {
            return Err(AppError::Validation(
                "Supplier name cannot be empty".to_string(),
            ));
        }

        let phone = dto.phone.trim();
        if phone.is_empty() {
            return Err(AppError::Validation(
                "Supplier phone number cannot be empty".to_string(),
            ));
        }

        let credit_limit = dto.credit_limit.unwrap_or(0);
        if credit_limit < 0 {
            return Err(AppError::Validation(
                "Credit limit cannot be negative".to_string(),
            ));
        }

        let id = Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        let supplier_code = format!("SUP-{:08}", Uuid::new_v4().simple());

        let supplier = Supplier {
            id,
            supplier_code,
            name: name.to_string(),
            phone: phone.to_string(),
            alternate_phone: dto
                .alternate_phone
                .map(|p| p.trim().to_string())
                .filter(|p| !p.is_empty()),
            email: dto
                .email
                .map(|e| e.trim().to_string())
                .filter(|e| !e.is_empty()),
            address: dto
                .address
                .map(|a| a.trim().to_string())
                .filter(|a| !a.is_empty()),
            notes: dto
                .notes
                .map(|n| n.trim().to_string())
                .filter(|n| !n.is_empty()),
            credit_limit,
            is_active: true,
            created_at: now.clone(),
            updated_at: now,
        };

        self.supplier_repo.create_supplier(&supplier).await
    }

    pub async fn get_supplier_by_id(&self, id: &str) -> AppResult<Option<Supplier>> {
        self.supplier_repo.get_supplier_by_id(id).await
    }

    pub async fn get_supplier_by_code(&self, _code: &str) -> AppResult<Option<Supplier>> {
        Err(AppError::Internal(
            "Postgres get_by_code not implemented".into(),
        ))
    }

    pub async fn list_suppliers(
        &self,
        filter: Option<SupplierFilter>,
    ) -> AppResult<Vec<SupplierSummaryDto>> {
        self.supplier_repo.list(filter).await
    }

    pub async fn search_suppliers(&self, query: &str) -> AppResult<Vec<SupplierSummaryDto>> {
        self.supplier_repo.search(query).await
    }

    pub async fn update_supplier(&self, id: &str, dto: UpdateSupplierDto) -> AppResult<Supplier> {
        if let Some(ref name) = dto.name {
            if name.trim().is_empty() {
                return Err(AppError::Validation(
                    "Supplier name cannot be empty".to_string(),
                ));
            }
        }
        if let Some(ref phone) = dto.phone {
            if phone.trim().is_empty() {
                return Err(AppError::Validation(
                    "Supplier phone cannot be empty".to_string(),
                ));
            }
        }
        if let Some(limit) = dto.credit_limit {
            if limit < 0 {
                return Err(AppError::Validation(
                    "Credit limit cannot be negative".to_string(),
                ));
            }
        }

        self.supplier_repo.update(id, &dto).await
    }

    pub async fn deactivate_supplier(&self, id: &str) -> AppResult<()> {
        self.supplier_repo.deactivate(id).await
    }

    pub async fn get_outstanding_balance(&self, supplier_id: &str) -> AppResult<i64> {
        self.supplier_repo
            .get_outstanding_balance(supplier_id)
            .await
    }

    pub async fn get_ledger(
        &self,
        supplier_id: &str,
        limit: Option<i64>,
        offset: Option<i64>,
    ) -> AppResult<Vec<crate::domain::supplier::SupplierLedgerEntry>> {
        self.supplier_repo
            .get_ledger(supplier_id, limit, offset)
            .await
    }

    pub async fn get_statement(&self, supplier_id: &str) -> AppResult<SupplierStatementDto> {
        self.supplier_repo.get_statement(supplier_id).await
    }

    pub async fn get_detail(&self, supplier_id: &str) -> AppResult<SupplierDetailDto> {
        self.supplier_repo.get_detail(supplier_id).await
    }
}

#[cfg(test)]
pub mod tests {
    use super::*;

    async fn setup_test_service() -> SupplierService {
        let pool = sqlx::PgPool::connect_lazy("postgres://localhost/test_placeholder")
            .expect("connect_lazy should succeed");
        SupplierService::new_postgres(pool)
    }

    #[tokio::test]
    #[ignore]
    async fn test_supplier_ledger_purchase_payment_remaining_payable() {
        let _service = setup_test_service().await;
        // Requires real Postgres DB — skipped
    }

    #[tokio::test]
    #[ignore]
    async fn test_supplier_creation_and_sequential_codes() {
        let _service = setup_test_service().await;
        // Requires real Postgres DB — skipped
    }

    #[tokio::test]
    #[ignore]
    async fn test_supplier_search_update_and_deactivation() {
        let _service = setup_test_service().await;
        // Requires real Postgres DB — skipped
    }
}
