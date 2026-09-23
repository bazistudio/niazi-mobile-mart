use tauri::State;

use crate::domain::customer::{
    CreateCustomerDto, Customer, CustomerDetailDto, CustomerFilter, CustomerLedgerEntry,
    CustomerPaymentResultDto, CustomerStatementDto, CustomerSummaryDto, RecordCustomerPaymentDto,
    UpdateCustomerDto,
};
use crate::errors::{AppError, AppResult};
use crate::state::AppState;

/// Validates structural invariants for CreateCustomerDto
fn validate_create_customer_dto(dto: &CreateCustomerDto) -> AppResult<()> {
    if dto.name.trim().is_empty() {
        return Err(AppError::Validation(
            "Customer name cannot be empty".to_string(),
        ));
    }
    if dto.phone.trim().is_empty() {
        return Err(AppError::Validation(
            "Customer phone number cannot be empty".to_string(),
        ));
    }
    if let Some(limit) = dto.credit_limit {
        if limit < 0 {
            return Err(AppError::Validation(
                "Credit limit cannot be negative".to_string(),
            ));
        }
    }
    Ok(())
}

/// Validates structural invariants for UpdateCustomerDto
fn validate_update_customer_dto(dto: &UpdateCustomerDto) -> AppResult<()> {
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
    Ok(())
}

/// Validates structural invariants for RecordCustomerPaymentDto
fn validate_record_payment_dto(dto: &RecordCustomerPaymentDto) -> AppResult<()> {
    if dto.customer_id.trim().is_empty() {
        return Err(AppError::Validation(
            "Customer ID cannot be empty".to_string(),
        ));
    }
    if dto.amount <= 0 {
        return Err(AppError::Validation(
            "Payment amount must be greater than 0".to_string(),
        ));
    }
    if dto.payment_method.trim().is_empty() {
        return Err(AppError::Validation(
            "Payment method cannot be empty".to_string(),
        ));
    }
    Ok(())
}

pub async fn storage_customer_create_impl(
    state: &AppState,
    dto: CreateCustomerDto,
) -> AppResult<Customer> {
    validate_create_customer_dto(&dto)?;
    state.customer_service.create_customer(dto).await
}

/// Typed storage command: Creates a new customer record directly in SQLite storage
#[tauri::command]
pub async fn storage_customer_create(
    state: State<'_, AppState>,
    dto: CreateCustomerDto,
) -> AppResult<Customer> {
    storage_customer_create_impl(&state, dto).await
}

pub async fn storage_customer_update_impl(
    state: &AppState,
    id: String,
    dto: UpdateCustomerDto,
) -> AppResult<Customer> {
    if id.trim().is_empty() {
        return Err(AppError::Validation(
            "Customer ID cannot be empty".to_string(),
        ));
    }
    validate_update_customer_dto(&dto)?;
    state.customer_service.update_customer(&id, dto).await
}

/// Typed storage command: Updates an existing customer record in SQLite storage
#[tauri::command]
pub async fn storage_customer_update(
    state: State<'_, AppState>,
    id: String,
    dto: UpdateCustomerDto,
) -> AppResult<Customer> {
    storage_customer_update_impl(&state, id, dto).await
}

pub async fn storage_customer_get_by_id_impl(
    state: &AppState,
    id: String,
) -> AppResult<Customer> {
    if id.trim().is_empty() {
        return Err(AppError::Validation(
            "Customer ID cannot be empty".to_string(),
        ));
    }
    state.customer_service.get_customer_by_id(&id).await
}

/// Typed storage command: Retrieves a single customer by ID from SQLite storage
#[tauri::command]
pub async fn storage_customer_get_by_id(
    state: State<'_, AppState>,
    id: String,
) -> AppResult<Customer> {
    storage_customer_get_by_id_impl(&state, id).await
}

pub async fn storage_customer_get_detail_impl(
    state: &AppState,
    id: String,
) -> AppResult<CustomerDetailDto> {
    if id.trim().is_empty() {
        return Err(AppError::Validation(
            "Customer ID cannot be empty".to_string(),
        ));
    }
    state.customer_service.get_customer_detail(&id).await
}

/// Typed storage command: Retrieves rich customer profile with financial stats from SQLite storage
#[tauri::command]
pub async fn storage_customer_get_detail(
    state: State<'_, AppState>,
    id: String,
) -> AppResult<CustomerDetailDto> {
    storage_customer_get_detail_impl(&state, id).await
}

pub async fn storage_customer_list_impl(
    state: &AppState,
    filter: Option<CustomerFilter>,
) -> AppResult<Vec<CustomerSummaryDto>> {
    state
        .customer_service
        .list_customers(filter.unwrap_or_default())
        .await
}

/// Typed storage command: Queries customer summaries from SQLite storage using filter criteria
#[tauri::command]
pub async fn storage_customer_list(
    state: State<'_, AppState>,
    filter: Option<CustomerFilter>,
) -> AppResult<Vec<CustomerSummaryDto>> {
    storage_customer_list_impl(&state, filter).await
}

pub async fn storage_customer_search_impl(
    state: &AppState,
    query: String,
) -> AppResult<Vec<CustomerSummaryDto>> {
    state.customer_service.search_customers(&query).await
}

/// Typed storage command: Searches active customers by name, phone, or code in SQLite storage
#[tauri::command]
pub async fn storage_customer_search(
    state: State<'_, AppState>,
    query: String,
) -> AppResult<Vec<CustomerSummaryDto>> {
    storage_customer_search_impl(&state, query).await
}

pub async fn storage_customer_get_ledger_impl(
    state: &AppState,
    customer_id: String,
    limit: Option<i64>,
    offset: Option<i64>,
) -> AppResult<Vec<CustomerLedgerEntry>> {
    if customer_id.trim().is_empty() {
        return Err(AppError::Validation(
            "Customer ID cannot be empty".to_string(),
        ));
    }
    state
        .customer_service
        .get_ledger(&customer_id, limit, offset)
        .await
}

/// Typed storage command: Retrieves customer ledger journal entries from SQLite storage
#[tauri::command]
pub async fn storage_customer_get_ledger(
    state: State<'_, AppState>,
    customer_id: String,
    limit: Option<i64>,
    offset: Option<i64>,
) -> AppResult<Vec<CustomerLedgerEntry>> {
    storage_customer_get_ledger_impl(&state, customer_id, limit, offset).await
}

pub async fn storage_customer_get_statement_impl(
    state: &AppState,
    customer_id: String,
) -> AppResult<CustomerStatementDto> {
    if customer_id.trim().is_empty() {
        return Err(AppError::Validation(
            "Customer ID cannot be empty".to_string(),
        ));
    }
    state.customer_service.get_statement(&customer_id).await
}

/// Typed storage command: Retrieves printable customer statement from SQLite storage
#[tauri::command]
pub async fn storage_customer_get_statement(
    state: State<'_, AppState>,
    customer_id: String,
) -> AppResult<CustomerStatementDto> {
    storage_customer_get_statement_impl(&state, customer_id).await
}

pub async fn storage_customer_get_balance_impl(
    state: &AppState,
    customer_id: String,
) -> AppResult<i64> {
    if customer_id.trim().is_empty() {
        return Err(AppError::Validation(
            "Customer ID cannot be empty".to_string(),
        ));
    }
    state.customer_service.get_balance(&customer_id).await
}

/// Typed storage command: Retrieves authoritative outstanding balance for customer from SQLite storage
#[tauri::command]
pub async fn storage_customer_get_balance(
    state: State<'_, AppState>,
    customer_id: String,
) -> AppResult<i64> {
    storage_customer_get_balance_impl(&state, customer_id).await
}

pub async fn storage_customer_record_payment_impl(
    state: &AppState,
    dto: RecordCustomerPaymentDto,
) -> AppResult<CustomerPaymentResultDto> {
    validate_record_payment_dto(&dto)?;
    let session = state.get_session().await;
    state
        .customer_service
        .record_customer_payment(session.user_id.as_deref(), dto)
        .await
}

/// Typed storage command: Atomically records a customer payment against receivables in SQLite storage
#[tauri::command]
pub async fn storage_customer_record_payment(
    state: State<'_, AppState>,
    dto: RecordCustomerPaymentDto,
) -> AppResult<CustomerPaymentResultDto> {
    storage_customer_record_payment_impl(&state, dto).await
}

pub async fn storage_customer_deactivate_impl(
    state: &AppState,
    id: String,
) -> AppResult<()> {
    if id.trim().is_empty() {
        return Err(AppError::Validation(
            "Customer ID cannot be empty".to_string(),
        ));
    }
    state.customer_service.deactivate_customer(&id).await
}

/// Typed storage command: Deactivates customer safely (never deletes physically) in SQLite storage
#[tauri::command]
pub async fn storage_customer_deactivate(
    state: State<'_, AppState>,
    id: String,
) -> AppResult<()> {
    storage_customer_deactivate_impl(&state, id).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::connection::DatabaseConnection;
    use crate::db::migrations::MigrationRunner;
    use crate::domain::customer::CustomerLedgerEntryType;
    use crate::repositories::SQLiteCustomerRepository;
    use chrono::Utc;
    use uuid::Uuid;

    async fn setup_test_context() -> AppState {
        let db = DatabaseConnection::open_in_memory().unwrap();
        {
            let conn_arc = db.inner();
            let mut guard = conn_arc.lock().await;
            MigrationRunner::run(&mut guard).unwrap();
            guard
                .execute(
                    "INSERT INTO users (id, name, username, login_key_hash, role, is_active, created_at, updated_at)
                     VALUES ('99999999-9999-9999-9999-999999999999', 'Admin User', 'admin', 'hash', 'ADMIN', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
                    [],
                )
                .unwrap();
        }
        AppState::new_sqlite("1.2.15", db)
    }

    #[tokio::test]
    async fn test_storage_customer_complete_lifecycle() {
        let state = setup_test_context().await;

        // 1. Validation Rejections
        let invalid_name = CreateCustomerDto {
            name: "   ".to_string(),
            phone: "03001234567".to_string(),
            alternate_phone: None,
            email: None,
            address: None,
            notes: None,
            credit_limit: Some(10000),
        };
        assert!(
            storage_customer_create_impl(&state, invalid_name).await.is_err(),
            "Empty name must be rejected"
        );

        let invalid_phone = CreateCustomerDto {
            name: "Valid Name".to_string(),
            phone: "   ".to_string(),
            alternate_phone: None,
            email: None,
            address: None,
            notes: None,
            credit_limit: None,
        };
        assert!(
            storage_customer_create_impl(&state, invalid_phone).await.is_err(),
            "Empty phone must be rejected"
        );

        let invalid_limit = CreateCustomerDto {
            name: "Valid Name".to_string(),
            phone: "03001234567".to_string(),
            alternate_phone: None,
            email: None,
            address: None,
            notes: None,
            credit_limit: Some(-500),
        };
        assert!(
            storage_customer_create_impl(&state, invalid_limit).await.is_err(),
            "Negative credit limit must be rejected"
        );

        // 2. Create customer via typed capability
        let create_dto = CreateCustomerDto {
            name: "Tauri Customer".to_string(),
            phone: "03009998877".to_string(),
            alternate_phone: Some("03211112222".to_string()),
            email: Some("tauri@example.com".to_string()),
            address: Some("Shop 4, Saddar".to_string()),
            notes: Some("Test note".to_string()),
            credit_limit: Some(50000),
        };

        let created = storage_customer_create_impl(&state, create_dto)
            .await
            .expect("create customer must succeed");

        assert_eq!(created.name, "Tauri Customer");
        assert_eq!(created.phone, "03009998877");
        assert_eq!(created.customer_code, "CUS-000001");
        assert_eq!(created.credit_limit, 50000);
        assert!(created.is_active);

        // 3. Get by ID
        let fetched = storage_customer_get_by_id_impl(&state, created.id.clone())
            .await
            .expect("get by id must succeed");
        assert_eq!(fetched.id, created.id);

        // 4. Update customer
        let update_dto = UpdateCustomerDto {
            name: Some("Tauri Customer Updated".to_string()),
            phone: None,
            alternate_phone: None,
            email: None,
            address: Some("Shop 5, Saddar".to_string()),
            notes: None,
            credit_limit: Some(75000),
            is_active: None,
        };
        let updated = storage_customer_update_impl(&state, created.id.clone(), update_dto)
            .await
            .expect("update customer must succeed");
        assert_eq!(updated.name, "Tauri Customer Updated");
        assert_eq!(updated.credit_limit, 75000);

        // 5. Search customer
        let search_res = storage_customer_search_impl(&state, "Tauri".to_string())
            .await
            .expect("search must succeed");
        assert_eq!(search_res.len(), 1);
        assert_eq!(search_res[0].id, created.id);

        // 6. List customers
        let list_res = storage_customer_list_impl(&state, None)
            .await
            .expect("list must succeed");
        assert_eq!(list_res.len(), 1);

        // 7. Simulate initial credit sale ledger entry of Rs 20,000
        {
            let db = state.db.as_ref().unwrap();
            let conn_arc = db.inner();
            let guard = conn_arc.lock().await;
            SQLiteCustomerRepository::insert_ledger_entry_in_tx(
                &guard,
                &CustomerLedgerEntry {
                    id: Uuid::new_v4().to_string(),
                    customer_id: created.id.clone(),
                    reference_id: Some("sale-uuid-1".to_string()),
                    reference_number: Some("INV-000001".to_string()),
                    entry_type: CustomerLedgerEntryType::Sale,
                    debit: 20000,
                    credit: 0,
                    balance_after: 20000,
                    description: "Initial credit sale".to_string(),
                    performed_by: None,
                    created_at: Utc::now().to_rfc3339(),
                },
            )
            .unwrap();
        }

        // Verify balance
        let balance = storage_customer_get_balance_impl(&state, created.id.clone())
            .await
            .expect("get balance must succeed");
        assert_eq!(balance, 20000);

        // 8. Overpayment Rejection
        let overpay_dto = RecordCustomerPaymentDto {
            customer_id: created.id.clone(),
            amount: 25000, // Balance is 20,000
            payment_method: "CASH".to_string(),
            reference_number: None,
            notes: None,
        };
        assert!(
            storage_customer_record_payment_impl(&state, overpay_dto).await.is_err(),
            "Overpayment > balance must be rejected"
        );

        // Balance must remain 20000
        let bal_after_overpay = storage_customer_get_balance_impl(&state, created.id.clone())
            .await
            .unwrap();
        assert_eq!(bal_after_overpay, 20000);

        // 9. Valid Payment: Rs 15,000
        let pay_dto = RecordCustomerPaymentDto {
            customer_id: created.id.clone(),
            amount: 15000,
            payment_method: "CASH".to_string(),
            reference_number: None,
            notes: Some("Partial payment via cash".to_string()),
        };
        let pay_res = storage_customer_record_payment_impl(&state, pay_dto)
            .await
            .expect("valid payment must succeed");
        assert_eq!(pay_res.amount_paid, 15000);
        assert_eq!(pay_res.previous_balance, 20000);
        assert_eq!(pay_res.new_balance, 5000);

        // 10. Ledger & Statement check
        let ledger = storage_customer_get_ledger_impl(&state, created.id.clone(), None, None)
            .await
            .expect("get ledger must succeed");
        assert_eq!(ledger.len(), 2); // 1 sale, 1 payment

        let stmt = storage_customer_get_statement_impl(&state, created.id.clone())
            .await
            .expect("get statement must succeed");
        assert_eq!(stmt.entries.len(), 2);
        assert_eq!(stmt.current_balance, 5000);

        // 11. Deactivation & Inactive Customer Payment Rejection
        storage_customer_deactivate_impl(&state, created.id.clone())
            .await
            .expect("deactivation must succeed");

        let deactivated = storage_customer_get_by_id_impl(&state, created.id.clone())
            .await
            .unwrap();
        assert!(!deactivated.is_active);

        let inactive_pay = RecordCustomerPaymentDto {
            customer_id: created.id.clone(),
            amount: 5000,
            payment_method: "CASH".to_string(),
            reference_number: None,
            notes: None,
        };
        assert!(
            storage_customer_record_payment_impl(&state, inactive_pay).await.is_err(),
            "Payment for inactive customer must be rejected"
        );
    }
}
