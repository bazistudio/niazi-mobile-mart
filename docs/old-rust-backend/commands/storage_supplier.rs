use tauri::State;

use crate::domain::supplier::{
    CreateSupplierDto, RecordSupplierPaymentDto, Supplier, SupplierDetailDto, SupplierFilter,
    SupplierLedgerEntry, SupplierPaymentResultDto, SupplierStatementDto, SupplierSummaryDto,
    UpdateSupplierDto,
};
use crate::errors::{AppError, AppResult};
use crate::state::AppState;

/// Validates structural invariants for CreateSupplierDto
fn validate_create_supplier_dto(dto: &CreateSupplierDto) -> AppResult<()> {
    if dto.name.trim().is_empty() {
        return Err(AppError::Validation(
            "Supplier name cannot be empty".to_string(),
        ));
    }
    if dto.phone.trim().is_empty() {
        return Err(AppError::Validation(
            "Supplier phone number cannot be empty".to_string(),
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

/// Validates structural invariants for UpdateSupplierDto
fn validate_update_supplier_dto(dto: &UpdateSupplierDto) -> AppResult<()> {
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
                "Supplier phone number cannot be empty".to_string(),
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

/// Validates structural invariants for RecordSupplierPaymentDto
fn validate_record_payment_dto(dto: &RecordSupplierPaymentDto) -> AppResult<()> {
    if dto.supplier_id.trim().is_empty() {
        return Err(AppError::Validation(
            "Supplier ID cannot be empty".to_string(),
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

pub async fn storage_supplier_create_impl(
    state: &AppState,
    dto: CreateSupplierDto,
) -> AppResult<Supplier> {
    validate_create_supplier_dto(&dto)?;
    state.supplier_service.create_supplier(dto).await
}

/// Typed storage command: Creates a new supplier record directly in SQLite storage
#[tauri::command]
pub async fn storage_supplier_create(
    state: State<'_, AppState>,
    dto: CreateSupplierDto,
) -> AppResult<Supplier> {
    storage_supplier_create_impl(&state, dto).await
}

pub async fn storage_supplier_update_impl(
    state: &AppState,
    id: String,
    dto: UpdateSupplierDto,
) -> AppResult<Supplier> {
    if id.trim().is_empty() {
        return Err(AppError::Validation(
            "Supplier ID cannot be empty".to_string(),
        ));
    }
    validate_update_supplier_dto(&dto)?;
    state.supplier_service.update_supplier(&id, dto).await
}

/// Typed storage command: Updates an existing supplier record in SQLite storage
#[tauri::command]
pub async fn storage_supplier_update(
    state: State<'_, AppState>,
    id: String,
    dto: UpdateSupplierDto,
) -> AppResult<Supplier> {
    storage_supplier_update_impl(&state, id, dto).await
}

pub async fn storage_supplier_get_by_id_impl(
    state: &AppState,
    id: String,
) -> AppResult<Option<Supplier>> {
    if id.trim().is_empty() {
        return Err(AppError::Validation(
            "Supplier ID cannot be empty".to_string(),
        ));
    }
    state.supplier_service.get_supplier_by_id(&id).await
}

/// Typed storage command: Retrieves a single supplier by ID from SQLite storage
#[tauri::command]
pub async fn storage_supplier_get_by_id(
    state: State<'_, AppState>,
    id: String,
) -> AppResult<Option<Supplier>> {
    storage_supplier_get_by_id_impl(&state, id).await
}

pub async fn storage_supplier_get_detail_impl(
    state: &AppState,
    id: String,
) -> AppResult<SupplierDetailDto> {
    if id.trim().is_empty() {
        return Err(AppError::Validation(
            "Supplier ID cannot be empty".to_string(),
        ));
    }
    state.supplier_service.get_detail(&id).await
}

/// Typed storage command: Retrieves rich supplier profile with procurement stats from SQLite storage
#[tauri::command]
pub async fn storage_supplier_get_detail(
    state: State<'_, AppState>,
    id: String,
) -> AppResult<SupplierDetailDto> {
    storage_supplier_get_detail_impl(&state, id).await
}

pub async fn storage_supplier_list_impl(
    state: &AppState,
    filter: Option<SupplierFilter>,
) -> AppResult<Vec<SupplierSummaryDto>> {
    state.supplier_service.list_suppliers(filter).await
}

/// Typed storage command: Queries supplier summaries from SQLite storage using filter criteria
#[tauri::command]
pub async fn storage_supplier_list(
    state: State<'_, AppState>,
    filter: Option<SupplierFilter>,
) -> AppResult<Vec<SupplierSummaryDto>> {
    storage_supplier_list_impl(&state, filter).await
}

pub async fn storage_supplier_search_impl(
    state: &AppState,
    query: String,
) -> AppResult<Vec<SupplierSummaryDto>> {
    state.supplier_service.search_suppliers(&query).await
}

/// Typed storage command: Searches active suppliers by name, phone, or code in SQLite storage
#[tauri::command]
pub async fn storage_supplier_search(
    state: State<'_, AppState>,
    query: String,
) -> AppResult<Vec<SupplierSummaryDto>> {
    storage_supplier_search_impl(&state, query).await
}

pub async fn storage_supplier_get_ledger_impl(
    state: &AppState,
    supplier_id: String,
    limit: Option<i64>,
    offset: Option<i64>,
) -> AppResult<Vec<SupplierLedgerEntry>> {
    if supplier_id.trim().is_empty() {
        return Err(AppError::Validation(
            "Supplier ID cannot be empty".to_string(),
        ));
    }
    state
        .supplier_service
        .get_ledger(&supplier_id, limit, offset)
        .await
}

/// Typed storage command: Retrieves supplier ledger journal entries from SQLite storage
#[tauri::command]
pub async fn storage_supplier_get_ledger(
    state: State<'_, AppState>,
    supplier_id: String,
    limit: Option<i64>,
    offset: Option<i64>,
) -> AppResult<Vec<SupplierLedgerEntry>> {
    storage_supplier_get_ledger_impl(&state, supplier_id, limit, offset).await
}

pub async fn storage_supplier_get_statement_impl(
    state: &AppState,
    supplier_id: String,
) -> AppResult<SupplierStatementDto> {
    if supplier_id.trim().is_empty() {
        return Err(AppError::Validation(
            "Supplier ID cannot be empty".to_string(),
        ));
    }
    state.supplier_service.get_statement(&supplier_id).await
}

/// Typed storage command: Retrieves printable supplier statement from SQLite storage
#[tauri::command]
pub async fn storage_supplier_get_statement(
    state: State<'_, AppState>,
    supplier_id: String,
) -> AppResult<SupplierStatementDto> {
    storage_supplier_get_statement_impl(&state, supplier_id).await
}

pub async fn storage_supplier_get_balance_impl(
    state: &AppState,
    supplier_id: String,
) -> AppResult<i64> {
    if supplier_id.trim().is_empty() {
        return Err(AppError::Validation(
            "Supplier ID cannot be empty".to_string(),
        ));
    }
    state
        .supplier_service
        .get_outstanding_balance(&supplier_id)
        .await
}

/// Typed storage command: Retrieves authoritative outstanding balance for supplier from SQLite storage
#[tauri::command]
pub async fn storage_supplier_get_balance(
    state: State<'_, AppState>,
    supplier_id: String,
) -> AppResult<i64> {
    storage_supplier_get_balance_impl(&state, supplier_id).await
}

pub async fn storage_supplier_record_payment_impl(
    state: &AppState,
    dto: RecordSupplierPaymentDto,
) -> AppResult<SupplierPaymentResultDto> {
    validate_record_payment_dto(&dto)?;
    let session = state.get_session().await;
    state
        .purchase_service
        .record_supplier_payment(session.user_id.as_deref(), dto)
        .await
}

/// Typed storage command: Atomically records a supplier payment against payables in SQLite storage
#[tauri::command]
pub async fn storage_supplier_record_payment(
    state: State<'_, AppState>,
    dto: RecordSupplierPaymentDto,
) -> AppResult<SupplierPaymentResultDto> {
    storage_supplier_record_payment_impl(&state, dto).await
}

pub async fn storage_supplier_deactivate_impl(
    state: &AppState,
    id: String,
) -> AppResult<()> {
    if id.trim().is_empty() {
        return Err(AppError::Validation(
            "Supplier ID cannot be empty".to_string(),
        ));
    }
    state.supplier_service.deactivate_supplier(&id).await
}

/// Typed storage command: Deactivates supplier safely (never deletes physically) in SQLite storage
#[tauri::command]
pub async fn storage_supplier_deactivate(
    state: State<'_, AppState>,
    id: String,
) -> AppResult<()> {
    storage_supplier_deactivate_impl(&state, id).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::connection::DatabaseConnection;
    use crate::db::migrations::MigrationRunner;
    use crate::domain::supplier::SupplierLedgerEntryType;
    use crate::repositories::SQLiteSupplierRepository;
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
    async fn test_storage_supplier_complete_lifecycle() {
        let state = setup_test_context().await;

        // 1. Validation Rejections
        let invalid_name = CreateSupplierDto {
            name: "   ".to_string(),
            phone: "03001234567".to_string(),
            alternate_phone: None,
            email: None,
            address: None,
            notes: None,
            credit_limit: Some(100000),
        };
        assert!(
            storage_supplier_create_impl(&state, invalid_name).await.is_err(),
            "Empty name must be rejected"
        );

        let invalid_phone = CreateSupplierDto {
            name: "Valid Supplier".to_string(),
            phone: "   ".to_string(),
            alternate_phone: None,
            email: None,
            address: None,
            notes: None,
            credit_limit: None,
        };
        assert!(
            storage_supplier_create_impl(&state, invalid_phone).await.is_err(),
            "Empty phone must be rejected"
        );

        let invalid_limit = CreateSupplierDto {
            name: "Valid Supplier".to_string(),
            phone: "03001234567".to_string(),
            alternate_phone: None,
            email: None,
            address: None,
            notes: None,
            credit_limit: Some(-500),
        };
        assert!(
            storage_supplier_create_impl(&state, invalid_limit).await.is_err(),
            "Negative credit limit must be rejected"
        );

        // 2. Create supplier via typed capability
        let create_dto = CreateSupplierDto {
            name: "Tauri Supplier".to_string(),
            phone: "03009998877".to_string(),
            alternate_phone: Some("03211112222".to_string()),
            email: Some("supplier@example.com".to_string()),
            address: Some("Shop 10, Hall Road".to_string()),
            notes: Some("Test supplier note".to_string()),
            credit_limit: Some(500000),
        };

        let created = storage_supplier_create_impl(&state, create_dto)
            .await
            .expect("create supplier must succeed");

        assert_eq!(created.name, "Tauri Supplier");
        assert_eq!(created.phone, "03009998877");
        assert_eq!(created.supplier_code, "SUP-000001");
        assert_eq!(created.credit_limit, 500000);
        assert!(created.is_active);

        // 3. Get by ID
        let fetched = storage_supplier_get_by_id_impl(&state, created.id.clone())
            .await
            .expect("get by id must succeed")
            .expect("supplier must be found");
        assert_eq!(fetched.id, created.id);

        // 4. Update supplier
        let update_dto = UpdateSupplierDto {
            name: Some("Tauri Supplier Updated".to_string()),
            phone: None,
            alternate_phone: None,
            email: None,
            address: Some("Shop 12, Hall Road".to_string()),
            notes: None,
            credit_limit: Some(750000),
            is_active: None,
        };
        let updated = storage_supplier_update_impl(&state, created.id.clone(), update_dto)
            .await
            .expect("update supplier must succeed");
        assert_eq!(updated.name, "Tauri Supplier Updated");
        assert_eq!(updated.credit_limit, 750000);

        // 5. Search supplier
        let search_res = storage_supplier_search_impl(&state, "Tauri".to_string())
            .await
            .expect("search must succeed");
        assert_eq!(search_res.len(), 1);
        assert_eq!(search_res[0].id, created.id);

        // 6. List suppliers
        let list_res = storage_supplier_list_impl(&state, None)
            .await
            .expect("list must succeed");
        assert_eq!(list_res.len(), 1);

        // 7. Simulate initial purchase credit ledger entry of Rs 100,000
        {
            let db = state.db.as_ref().unwrap();
            let conn_arc = db.inner();
            let guard = conn_arc.lock().await;
            SQLiteSupplierRepository::insert_ledger_entry_in_tx(
                &guard,
                &SupplierLedgerEntry {
                    id: Uuid::new_v4().to_string(),
                    supplier_id: created.id.clone(),
                    reference_id: Some("pur-uuid-1".to_string()),
                    reference_number: Some("PUR-000001".to_string()),
                    entry_type: SupplierLedgerEntryType::Purchase,
                    debit: 100000,
                    credit: 0,
                    balance_after: 100000,
                    description: "Initial credit purchase".to_string(),
                    performed_by: None,
                    created_at: Utc::now().to_rfc3339(),
                },
            )
            .unwrap();
        }

        // Verify balance
        let balance = storage_supplier_get_balance_impl(&state, created.id.clone())
            .await
            .expect("get balance must succeed");
        assert_eq!(balance, 100000);

        // 8. Overpayment Rejection
        let overpay_dto = RecordSupplierPaymentDto {
            supplier_id: created.id.clone(),
            amount: 150000, // Balance is 100,000
            payment_method: "CASH".to_string(),
            reference_number: None,
            notes: None,
        };
        assert!(
            storage_supplier_record_payment_impl(&state, overpay_dto).await.is_err(),
            "Overpayment > balance must be rejected"
        );

        // Balance must remain 100,000
        let bal_after_overpay = storage_supplier_get_balance_impl(&state, created.id.clone())
            .await
            .unwrap();
        assert_eq!(bal_after_overpay, 100000);

        // 9. Valid Payment: Rs 40,000
        let pay_dto = RecordSupplierPaymentDto {
            supplier_id: created.id.clone(),
            amount: 40000,
            payment_method: "CASH".to_string(),
            reference_number: None,
            notes: Some("Partial payment via cash".to_string()),
        };
        let pay_res = storage_supplier_record_payment_impl(&state, pay_dto)
            .await
            .expect("valid payment must succeed");
        assert_eq!(pay_res.amount_paid, 40000);
        assert_eq!(pay_res.previous_balance, 100000);
        assert_eq!(pay_res.new_balance, 60000);

        // 10. Ledger & Statement check
        let ledger = storage_supplier_get_ledger_impl(&state, created.id.clone(), None, None)
            .await
            .expect("get ledger must succeed");
        assert_eq!(ledger.len(), 2); // 1 purchase, 1 payment

        let stmt = storage_supplier_get_statement_impl(&state, created.id.clone())
            .await
            .expect("get statement must succeed");
        assert_eq!(stmt.entries.len(), 2);
        assert_eq!(stmt.current_balance, 60000);

        // 11. Deactivation & Inactive Supplier Payment Rejection
        storage_supplier_deactivate_impl(&state, created.id.clone())
            .await
            .expect("deactivation must succeed");

        let deactivated = storage_supplier_get_by_id_impl(&state, created.id.clone())
            .await
            .unwrap()
            .unwrap();
        assert!(!deactivated.is_active);

        let inactive_pay = RecordSupplierPaymentDto {
            supplier_id: created.id.clone(),
            amount: 60000,
            payment_method: "CASH".to_string(),
            reference_number: None,
            notes: None,
        };
        assert!(
            storage_supplier_record_payment_impl(&state, inactive_pay).await.is_err(),
            "Payment for inactive supplier must be rejected"
        );
    }
}
