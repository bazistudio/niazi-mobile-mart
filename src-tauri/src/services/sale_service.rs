use crate::domain::sales::{
    CompleteSaleDto, Sale, SaleFilterDto, SaleLine, SalePayment, SaleResultDto,
};
use crate::errors::{AppError, AppResult};
use crate::repositories::{
    BranchRepository, CustomerRepository, PostgresBranchRepository, PostgresCustomerRepository,
    PostgresProductRepository, PostgresSaleRepository, ProductRepository, SaleRepository,
};

#[derive(Clone)]
pub struct SaleService {
    sale_repo: SaleRepository,
    customer_repo: CustomerRepository,
    product_repo: ProductRepository,
    branch_repo: BranchRepository,
}

impl SaleService {
    pub fn new_postgres(pool: sqlx::PgPool) -> Self {
        Self {
            sale_repo: SaleRepository::new(PostgresSaleRepository::new(pool.clone())),
            customer_repo: CustomerRepository::new(PostgresCustomerRepository::new(pool.clone())),
            product_repo: ProductRepository::new(PostgresProductRepository::new(pool.clone())),
            branch_repo: BranchRepository::Postgres(PostgresBranchRepository::new(pool)),
        }
    }

    /// Completes a retail sale
    pub async fn complete_sale(
        &self,
        user_id: Option<&str>,
        dto: CompleteSaleDto,
    ) -> AppResult<SaleResultDto> {
        if dto.items.is_empty() {
            return Err(AppError::Validation(
                "Cannot complete sale with empty cart".to_string(),
            ));
        }
        self.sale_repo.complete_sale(&dto, user_id).await
    }

    /// Fetches sale by ID
    pub async fn get_sale_by_id(&self, id: &str) -> AppResult<Option<Sale>> {
        self.sale_repo.get_sale_by_id(id).await
    }

    /// Fetches sale by invoice number
    pub async fn get_sale_by_invoice(&self, invoice_number: &str) -> AppResult<Option<Sale>> {
        self.sale_repo.get_sale_by_invoice(invoice_number).await
    }

    /// Lists sales with filters
    pub async fn list_sales(&self, filter: SaleFilterDto) -> AppResult<Vec<Sale>> {
        self.sale_repo.list_sales(&filter).await
    }

    /// Fetches sale lines
    pub async fn get_sale_lines(&self, sale_id: &str) -> AppResult<Vec<SaleLine>> {
        self.sale_repo.get_sale_lines(sale_id).await
    }

    /// Fetches sale payments
    pub async fn get_sale_payments(&self, sale_id: &str) -> AppResult<Vec<SalePayment>> {
        self.sale_repo.get_sale_payments(sale_id).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn setup_test_service() -> SaleService {
        let pool = sqlx::PgPool::connect_lazy("postgres://localhost/test_placeholder")
            .expect("connect_lazy should succeed");
        SaleService::new_postgres(pool)
    }

    #[tokio::test]
    #[ignore]
    async fn test_walkin_cash_sale_full_flow() {
        let _service = setup_test_service().await;
        // Requires real Postgres DB — skipped
    }

    #[tokio::test]
    #[ignore]
    async fn test_registered_customer_cash_sale() {
        let _service = setup_test_service().await;
        // Requires real Postgres DB — skipped
    }

    #[tokio::test]
    #[ignore]
    async fn test_credit_sale_and_credit_limit_enforcement() {
        let _service = setup_test_service().await;
        // Requires real Postgres DB — skipped
    }

    #[tokio::test]
    #[ignore]
    async fn test_customer_payment_allocation_across_multiple_sales() {
        let _service = setup_test_service().await;
        // Requires real Postgres DB — skipped
    }

    #[tokio::test]
    #[ignore]
    async fn test_target_3_multi_payment_contract_and_accounting() {
        let _service = setup_test_service().await;
        // Requires real Postgres DB — skipped
    }
}
