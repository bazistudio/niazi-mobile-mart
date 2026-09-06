use chrono::Utc;
use uuid::Uuid;

use crate::db::connection::DatabaseConnection;
use crate::db::errors::DbError;
use crate::db::transaction::with_transaction;
use crate::domain::customer::{
    AllocatedSaleDto, CreateCustomerDto, Customer, CustomerDetailDto, CustomerFilter,
    CustomerLedgerEntry, CustomerLedgerEntryType, CustomerPaymentResultDto, CustomerStatementDto,
    CustomerSummaryDto, RecordCustomerPaymentDto, UpdateCustomerDto,
};
use crate::domain::sales::PaymentStatus;
use crate::errors::{AppError, AppResult};
use crate::repositories::{SQLiteCustomerRepository, SQLiteSaleRepository};

#[derive(Clone)]
pub struct CustomerService {
    db: DatabaseConnection,
    customer_repo: SQLiteCustomerRepository,
}

impl CustomerService {
    pub fn new(db: DatabaseConnection) -> Self {
        Self {
            customer_repo: SQLiteCustomerRepository::new(db.clone()),
            db,
        }
    }

    /// Creates a new customer with backend-generated UUID and sequential customer code (CUS-000001)
    pub async fn create_customer(&self, dto: CreateCustomerDto) -> AppResult<Customer> {
        let name = dto.name.trim();
        if name.is_empty() {
            return Err(AppError::Validation("Customer name cannot be empty".to_string()));
        }

        let phone = dto.phone.trim();
        if phone.is_empty() {
            return Err(AppError::Validation("Customer phone number cannot be empty".to_string()));
        }

        let credit_limit = dto.credit_limit.unwrap_or(0);
        if credit_limit < 0 {
            return Err(AppError::Validation("Credit limit cannot be negative".to_string()));
        }

        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();

        // Atomically generate customer_code inside a transaction
        let customer_code = with_transaction(&self.db, |tx| {
            SQLiteCustomerRepository::next_customer_code_in_tx(tx)
        })
        .await?;

        let customer = Customer {
            id,
            customer_code,
            name: name.to_string(),
            phone: phone.to_string(),
            alternate_phone: dto.alternate_phone.map(|p| p.trim().to_string()).filter(|p| !p.is_empty()),
            email: dto.email.map(|e| e.trim().to_string()).filter(|e| !e.is_empty()),
            address: dto.address.map(|a| a.trim().to_string()).filter(|a| !a.is_empty()),
            notes: dto.notes.map(|n| n.trim().to_string()).filter(|n| !n.is_empty()),
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
                return Err(AppError::Validation("Customer name cannot be empty".to_string()));
            }
        }
        if let Some(ref phone) = dto.phone {
            if phone.trim().is_empty() {
                return Err(AppError::Validation("Customer phone number cannot be empty".to_string()));
            }
        }
        if let Some(limit) = dto.credit_limit {
            if limit < 0 {
                return Err(AppError::Validation("Credit limit cannot be negative".to_string()));
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
    pub async fn list_customers(&self, filter: CustomerFilter) -> AppResult<Vec<CustomerSummaryDto>> {
        self.customer_repo.list_customers(&filter).await
    }

    /// Searches active customers by name, phone, or code
    pub async fn search_customers(&self, query: &str) -> AppResult<Vec<CustomerSummaryDto>> {
        self.customer_repo.search_customers(query).await
    }

    /// Gets authoritative current outstanding balance for customer
    pub async fn get_balance(&self, customer_id: &str) -> AppResult<i64> {
        self.customer_repo.get_outstanding_balance(customer_id).await
    }

    /// Gets customer ledger history
    pub async fn get_ledger(
        &self,
        customer_id: &str,
        limit: Option<i64>,
        offset: Option<i64>,
    ) -> AppResult<Vec<CustomerLedgerEntry>> {
        self.customer_repo.get_ledger(customer_id, limit, offset).await
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
    pub async fn record_payment(
        &self,
        user_id: Option<&str>,
        dto: RecordCustomerPaymentDto,
    ) -> AppResult<CustomerPaymentResultDto> {
        if dto.amount <= 0 {
            return Err(AppError::Validation("Payment amount must be greater than 0".to_string()));
        }

        let customer = self.get_customer_by_id(&dto.customer_id).await?;
        if !customer.is_active {
            return Err(AppError::Validation(format!(
                "Customer '{}' is inactive and cannot make payments",
                customer.name
            )));
        }

        let cid = dto.customer_id.clone();
        let amount = dto.amount;
        let p_method = dto.payment_method.trim().to_uppercase();
        let ref_num_input = dto.reference_number.clone();
        let notes = dto.notes.clone();
        let uid = user_id.map(|s| s.to_string());
        let now = Utc::now().to_rfc3339();

        let result = with_transaction(&self.db, move |tx| {
            // 1. Authoritative current outstanding balance
            let current_balance = SQLiteCustomerRepository::calculate_outstanding_balance_in_tx(tx, &cid)?;

            // 2. Reject overpayment
            if amount > current_balance {
                return Err(DbError::ConstraintViolation(format!(
                    "Payment amount (Rs {}) exceeds current outstanding balance (Rs {})",
                    amount, current_balance
                )));
            }

            // 3. Generate sequential payment receipt number
            let receipt_number = SQLiteCustomerRepository::next_receipt_number_in_tx(tx)?;
            let payment_id = Uuid::new_v4().to_string();
            let new_balance = current_balance - amount;

            // 4. Insert customer ledger credit entry
            let ledger_desc = match &notes {
                Some(n) if !n.trim().is_empty() => format!("Payment Receipt {}: {}", receipt_number, n.trim()),
                _ => format!("Payment Receipt {} via {}", receipt_number, p_method),
            };

            let entry = CustomerLedgerEntry {
                id: Uuid::new_v4().to_string(),
                customer_id: cid.clone(),
                reference_id: Some(payment_id.clone()),
                reference_number: ref_num_input.or_else(|| Some(receipt_number.clone())),
                entry_type: CustomerLedgerEntryType::Payment,
                debit: 0,
                credit: amount,
                balance_after: new_balance,
                description: ledger_desc,
                performed_by: uid,
                created_at: now.clone(),
            };

            SQLiteCustomerRepository::insert_ledger_entry_in_tx(tx, &entry)?;

            // 5. Payment allocation across open sales (FIFO: oldest outstanding sales first)
            let open_sales = SQLiteSaleRepository::get_open_sales_by_customer_in_tx(tx, &cid)?;
            let mut remaining_to_allocate = amount;
            let mut allocated_sales = Vec::new();

            for sale in open_sales {
                if remaining_to_allocate <= 0 {
                    break;
                }

                let remaining_due_on_sale = sale.total_amount.saturating_sub(sale.paid_amount);
                if remaining_due_on_sale <= 0 {
                    continue;
                }

                let alloc = remaining_to_allocate.min(remaining_due_on_sale);
                let new_paid = sale.paid_amount + alloc;
                let new_status = if new_paid >= sale.total_amount {
                    PaymentStatus::Paid
                } else {
                    PaymentStatus::PartiallyPaid
                };

                SQLiteSaleRepository::update_sale_payment_status_in_tx(
                    tx,
                    &sale.id,
                    new_paid,
                    new_status,
                    &now,
                )?;

                allocated_sales.push(AllocatedSaleDto {
                    sale_id: sale.id,
                    invoice_number: sale.invoice_number,
                    amount_allocated: alloc,
                    previous_paid: sale.paid_amount,
                    new_paid,
                    total_amount: sale.total_amount,
                    payment_status: new_status.as_str().to_string(),
                });

                remaining_to_allocate -= alloc;
            }

            Ok(CustomerPaymentResultDto {
                payment_id,
                receipt_number,
                customer_id: cid,
                amount_paid: amount,
                previous_balance: current_balance,
                new_balance,
                allocated_sales,
            })
        })
        .await?;

        Ok(result)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations::MigrationRunner;

    async fn setup_test_db() -> (DatabaseConnection, String) {
        let db = DatabaseConnection::open_in_memory().expect("in-memory db");
        let user_id = "99999999-9999-9999-9999-999999999999".to_string();
        {
            let conn_arc = db.inner();
            let mut guard = conn_arc.lock().await;
            guard.pragma_update(None, "foreign_keys", "ON").unwrap();
            MigrationRunner::run(&mut guard).expect("migrations");
            guard.execute(
                "INSERT INTO users (id, name, username, login_key_hash, role, is_active, created_at, updated_at)
                 VALUES (?1, 'Admin User', 'admin_user', 'hash', 'ADMIN', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
                rusqlite::params![user_id],
            ).unwrap();
        }
        (db, user_id)
    }

    #[tokio::test]
    async fn test_customer_creation_and_sequential_codes() {
        let (db, _) = setup_test_db().await;
        let service = CustomerService::new(db);

        // 1. Create first customer
        let c1 = service
            .create_customer(CreateCustomerDto {
                name: "Ahmed Raza".to_string(),
                phone: "03001234567".to_string(),
                alternate_phone: None,
                email: Some("ahmed@example.com".to_string()),
                address: Some("Shop 12, Saddar".to_string()),
                notes: None,
                credit_limit: Some(25000),
            })
            .await
            .expect("create customer 1");

        assert_eq!(c1.customer_code, "CUS-000001");
        assert_eq!(c1.name, "Ahmed Raza");
        assert_eq!(c1.credit_limit, 25000);
        assert_eq!(c1.id.len(), 36); // UUID v4 length
        assert!(c1.is_active);

        // 2. Create second customer
        let c2 = service
            .create_customer(CreateCustomerDto {
                name: "Bilal Tariq".to_string(),
                phone: "03217654321".to_string(),
                alternate_phone: None,
                email: None,
                address: None,
                notes: None,
                credit_limit: None, // Defaults to 0
            })
            .await
            .expect("create customer 2");

        assert_eq!(c2.customer_code, "CUS-000002");
        assert_eq!(c2.credit_limit, 0);

        // 3. Validation: empty name rejected
        let err_name = service
            .create_customer(CreateCustomerDto {
                name: "   ".to_string(),
                phone: "03000000000".to_string(),
                alternate_phone: None,
                email: None,
                address: None,
                notes: None,
                credit_limit: None,
            })
            .await;
        assert!(err_name.is_err(), "Empty name must be rejected");

        // 4. Validation: empty phone rejected
        let err_phone = service
            .create_customer(CreateCustomerDto {
                name: "Valid Name".to_string(),
                phone: "   ".to_string(),
                alternate_phone: None,
                email: None,
                address: None,
                notes: None,
                credit_limit: None,
            })
            .await;
        assert!(err_phone.is_err(), "Empty phone must be rejected");
    }

    #[tokio::test]
    async fn test_customer_search_update_and_deactivation() {
        let (db, _) = setup_test_db().await;
        let service = CustomerService::new(db);

        let c = service
            .create_customer(CreateCustomerDto {
                name: "Kamran Khan".to_string(),
                phone: "03335554433".to_string(),
                alternate_phone: None,
                email: None,
                address: None,
                notes: None,
                credit_limit: Some(10000),
            })
            .await
            .unwrap();

        // Search by name
        let by_name = service.search_customers("kamran").await.unwrap();
        assert_eq!(by_name.len(), 1);
        assert_eq!(by_name[0].name, "Kamran Khan");

        // Search by phone
        let by_phone = service.search_customers("5554433").await.unwrap();
        assert_eq!(by_phone.len(), 1);

        // Search by code
        let by_code = service.search_customers("CUS-000001").await.unwrap();
        assert_eq!(by_code.len(), 1);

        // Update customer
        let updated = service
            .update_customer(
                &c.id,
                UpdateCustomerDto {
                    name: Some("Kamran Khattak".to_string()),
                    phone: None,
                    alternate_phone: None,
                    email: None,
                    address: Some("Hayatabad, Peshawar".to_string()),
                    notes: None,
                    credit_limit: Some(15000),
                    is_active: None,
                },
            )
            .await
            .unwrap();
        assert_eq!(updated.name, "Kamran Khattak");
        assert_eq!(updated.credit_limit, 15000);
        assert_eq!(updated.address, Some("Hayatabad, Peshawar".to_string()));

        // Deactivate customer
        service.deactivate_customer(&c.id).await.unwrap();
        let fetched = service.get_customer_by_id(&c.id).await.unwrap();
        assert!(!fetched.is_active, "Customer must be inactive after deactivation");
    }

    #[tokio::test]
    async fn test_customer_payment_and_overpayment_rejection() {
        let (db, user_id) = setup_test_db().await;
        let service = CustomerService::new(db.clone());

        let customer = service
            .create_customer(CreateCustomerDto {
                name: "Zubair Shah".to_string(),
                phone: "03451122334".to_string(),
                alternate_phone: None,
                email: None,
                address: None,
                notes: None,
                credit_limit: Some(50000),
            })
            .await
            .unwrap();

        // Manually simulate a credit sale ledger entry of Rs 10,000
        {
            let conn_arc = db.inner();
            let guard = conn_arc.lock().await;
            SQLiteCustomerRepository::insert_ledger_entry_in_tx(
                &guard,
                &CustomerLedgerEntry {
                    id: Uuid::new_v4().to_string(),
                    customer_id: customer.id.clone(),
                    reference_id: Some("11111111-1111-1111-1111-111111111111".to_string()),
                    reference_number: Some("INV-000001".to_string()),
                    entry_type: CustomerLedgerEntryType::Sale,
                    debit: 10000,
                    credit: 0,
                    balance_after: 10000,
                    description: "Initial credit sale".to_string(),
                    performed_by: None,
                    created_at: Utc::now().to_rfc3339(),
                },
            )
            .unwrap();
        }

        // Verify balance is 10,000
        let bal1 = service.get_balance(&customer.id).await.unwrap();
        assert_eq!(bal1, 10000);

        // 1. Partial payment: Rs 4,000
        let pay_res = service
            .record_payment(
                Some(&user_id),
                RecordCustomerPaymentDto {
                    customer_id: customer.id.clone(),
                    amount: 4000,
                    payment_method: "CASH".to_string(),
                    reference_number: None,
                    notes: Some("Partial cash settlement".to_string()),
                },
            )
            .await
            .expect("payment of 4000 must succeed");

        assert_eq!(pay_res.amount_paid, 4000);
        assert_eq!(pay_res.previous_balance, 10000);
        assert_eq!(pay_res.new_balance, 6000);
        assert!(pay_res.receipt_number.starts_with("REC-"));

        let bal2 = service.get_balance(&customer.id).await.unwrap();
        assert_eq!(bal2, 6000);

        // 2. Overpayment rejection: trying to pay 7,000 when balance is 6,000
        let overpay_err = service
            .record_payment(
                None,
                RecordCustomerPaymentDto {
                    customer_id: customer.id.clone(),
                    amount: 7000,
                    payment_method: "CASH".to_string(),
                    reference_number: None,
                    notes: None,
                },
            )
            .await;
        assert!(overpay_err.is_err(), "Overpayment > balance must be rejected");

        // Verify balance remained 6,000
        let bal_after_rejected = service.get_balance(&customer.id).await.unwrap();
        assert_eq!(bal_after_rejected, 6000);

        // 3. Full payment of remaining 6,000
        let full_pay_res = service
            .record_payment(
                None,
                RecordCustomerPaymentDto {
                    customer_id: customer.id.clone(),
                    amount: 6000,
                    payment_method: "BANK_TRANSFER".to_string(),
                    reference_number: Some("BANK-TXN-999".to_string()),
                    notes: None,
                },
            )
            .await
            .unwrap();

        assert_eq!(full_pay_res.new_balance, 0);

        // Authoritative ledger financial integrity: SUM(debit) - SUM(credit) == 0
        let bal3 = service.get_balance(&customer.id).await.unwrap();
        assert_eq!(bal3, 0);

        // Verify statement has 3 entries: 1 sale, 2 payments
        let stmt = service.get_statement(&customer.id).await.unwrap();
        assert_eq!(stmt.entries.len(), 3);
        assert_eq!(stmt.current_balance, 0);
    }
}
