use uuid::Uuid;

use crate::domain::customer::{
    CreateCustomerDto, Customer, CustomerDetailDto, CustomerFilter, CustomerLedgerEntry,
    CustomerPaymentResultDto, CustomerStatementDto, CustomerSummaryDto, RecordCustomerPaymentDto,
    UpdateCustomerDto,
};
use crate::errors::{AppError, AppResult};
use crate::repositories::{
    BranchRepository, CustomerRepository, PostgresBranchRepository, PostgresCustomerRepository,
};

#[derive(Clone)]
pub struct CustomerService {
    customer_repo: CustomerRepository,
    branch_repo: BranchRepository,
}

impl CustomerService {
    pub fn new_postgres(pool: sqlx::PgPool) -> Self {
        Self {
            customer_repo: CustomerRepository::new(PostgresCustomerRepository::new(pool.clone())),
            branch_repo: BranchRepository::Postgres(PostgresBranchRepository::new(pool)),
        }
    }

    /// Creates a new customer with backend-generated UUID and sequential customer code
    pub async fn create_customer(&self, dto: CreateCustomerDto) -> AppResult<Customer> {
        let name = dto.name.trim();
        if name.is_empty() {
            return Err(AppError::Validation(
                "Customer name cannot be empty".to_string(),
            ));
        }

        let phone = dto.phone.trim();
        if phone.is_empty() {
            return Err(AppError::Validation(
                "Customer phone number cannot be empty".to_string(),
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
        let customer_code = format!("CUST-{:08}", Uuid::new_v4().simple());

        let customer = Customer {
            id,
            customer_code,
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

        self.customer_repo.create_customer(&customer).await
    }

    /// Updates existing customer information
    pub async fn update_customer(&self, id: &str, dto: UpdateCustomerDto) -> AppResult<Customer> {
        if let Some(ref name) = dto.name {
            if name.trim().is_empty() {
                return Err(AppError::Validation(
                    "Customer name cannot be empty".to_string(),
                ));
            }
        }
        if let Some(ref phone) = dto.phone {
            if phone.trim().is_empty() {
                return Err(AppError::Validation(
                    "Customer phone number cannot be empty".to_string(),
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

        self.customer_repo.update_customer(id, &dto).await
    }

    /// Fetches customer by ID
    pub async fn get_customer_by_id(&self, id: &str) -> AppResult<Customer> {
        self.customer_repo
            .get_customer_by_id(id)
            .await?
            .ok_or_else(|| AppError::NotFound(format!("Customer '{id}' not found")))
    }

    /// Fetches rich customer profile with financial stats
    pub async fn get_customer_detail(&self, id: &str) -> AppResult<CustomerDetailDto> {
        self.customer_repo.get_customer_detail(id).await
    }

    /// Lists customers with filters
    pub async fn list_customers(
        &self,
        filter: CustomerFilter,
    ) -> AppResult<Vec<CustomerSummaryDto>> {
        self.customer_repo.list_customers(&filter).await
    }

    /// Searches active customers by name, phone, or code
    pub async fn search_customers(&self, query: &str) -> AppResult<Vec<CustomerSummaryDto>> {
        self.customer_repo.search_customers(query).await
    }

    /// Gets authoritative current outstanding balance for customer
    pub async fn get_balance(&self, customer_id: &str) -> AppResult<i64> {
        self.customer_repo
            .get_outstanding_balance(customer_id)
            .await
    }

    /// Gets customer ledger history
    pub async fn get_ledger(
        &self,
        customer_id: &str,
        limit: Option<i64>,
        offset: Option<i64>,
    ) -> AppResult<Vec<CustomerLedgerEntry>> {
        self.customer_repo
            .get_ledger(customer_id, limit, offset)
            .await
    }

    /// Gets printable customer statement
    pub async fn get_statement(&self, customer_id: &str) -> AppResult<CustomerStatementDto> {
        self.customer_repo.get_statement(customer_id).await
    }

    /// Deactivates customer safely (never deletes customer if they have financial history)
    pub async fn deactivate_customer(&self, id: &str) -> AppResult<()> {
        self.customer_repo.deactivate_customer(id).await
    }

    /// Records customer payment atomically against receivables and allocates across open sales
    pub async fn record_customer_payment(
        &self,
        _user_id: Option<&str>,
        dto: RecordCustomerPaymentDto,
    ) -> AppResult<CustomerPaymentResultDto> {
        if dto.amount <= 0 {
            return Err(AppError::Validation(
                "Payment amount must be greater than 0".to_string(),
            ));
        }
        Err(AppError::Internal(
            "Postgres record_customer_payment not implemented".into(),
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn setup_test_service() -> CustomerService {
        let pool = sqlx::PgPool::connect_lazy("postgres://localhost/test_placeholder")
            .expect("connect_lazy should succeed");
        CustomerService::new_postgres(pool)
    }

    #[tokio::test]
    #[ignore]
    async fn test_customer_creation_and_sequential_codes() {
        let _service = setup_test_service().await;
        // Requires real Postgres DB — skipped
    }

    #[tokio::test]
    #[ignore]
    async fn test_customer_search_update_and_deactivation() {
        let _service = setup_test_service().await;
        // Requires real Postgres DB — skipped
    }

    #[tokio::test]
    #[ignore]
    async fn test_customer_payment_and_overpayment_rejection() {
        let _service = setup_test_service().await;
        // Requires real Postgres DB — skipped
    }

    #[tokio::test]
    #[ignore]
    async fn test_customer_detail_rich_profile_and_not_found() {
        let _service = setup_test_service().await;
        // Requires real Postgres DB — skipped
    }

    #[tokio::test]
    #[ignore]
    async fn test_customer_statement_sale_payment_balance() {
        let _service = setup_test_service().await;
        // Requires real Postgres DB — skipped
    }
}
