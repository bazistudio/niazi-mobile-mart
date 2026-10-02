//! Party application service.
//!
//! Desktop (SQLite): create/update parties atomically together with their
//! customer/supplier roles.
//! Server (PostgreSQL): read-only; parties are managed directly in PostgreSQL.

use chrono::Utc;
use uuid::Uuid;

use crate::db::connection::DatabaseConnection;
use crate::db::errors::DbError;
use crate::db::transaction::with_transaction;
use crate::domain::customer::Customer;
use crate::domain::party::{
    apply_party_update, build_party, validate_create_party, validate_update_party, CreatePartyDto,
    Party, PartyFilter, PartyRoleKind, PartySummaryDto, UpdatePartyDto,
};
use crate::domain::supplier::Supplier;
use crate::errors::{AppError, AppResult};
use crate::repositories::{
    PostgresPartyRepository, SQLiteCustomerRepository, SQLitePartyRepository,
    SQLiteSupplierRepository,
};

#[derive(Clone)]
enum PartyBackend {
    SQLite { db: DatabaseConnection, repo: SQLitePartyRepository },
    Postgres(PostgresPartyRepository),
}

#[derive(Clone)]
pub struct PartyService {
    backend: PartyBackend,
}

impl PartyService {
    pub fn new_sqlite(db: DatabaseConnection) -> Self {
        Self {
            backend: PartyBackend::SQLite { repo: SQLitePartyRepository::new(db.clone()), db },
        }
    }

    pub fn new_postgres(pool: sqlx::PgPool) -> Self {
        Self { backend: PartyBackend::Postgres(PostgresPartyRepository::new(pool)) }
    }

    pub async fn list_parties(&self, filter: PartyFilter) -> AppResult<Vec<PartySummaryDto>> {
        match &self.backend {
            PartyBackend::SQLite { repo, .. } => repo.list_parties(&filter).await,
            PartyBackend::Postgres(repo) => repo.list_parties(&filter).await,
        }
    }

    pub async fn get_party(&self, id: &str) -> AppResult<PartySummaryDto> {
        let found = match &self.backend {
            PartyBackend::SQLite { repo, .. } => repo.get_party_summary(id).await?,
            PartyBackend::Postgres(repo) => repo.get_party_summary(id).await?,
        };
        found.ok_or_else(|| AppError::NotFound(format!("Party '{id}' not found")))
    }

    fn sqlite_db(&self) -> AppResult<&DatabaseConnection> {
        match &self.backend {
            PartyBackend::SQLite { db, .. } => Ok(db),
            PartyBackend::Postgres(_) => Err(AppError::Forbidden(
                "Parties are created and edited on shop terminals and reach the server through sync".to_string(),
            )),
        }
    }

    /// Creates a party and its role(s) in ONE local transaction.
    /// Identity: party.id = first role id; a BOTH party's supplier gets its own UUID.
    pub async fn create_party(&self, dto: CreatePartyDto) -> AppResult<PartySummaryDto> {
        validate_create_party(&dto).map_err(AppError::Validation)?;
        let db = self.sqlite_db()?.clone();

        let party_id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        let party = build_party(&party_id, &dto, &now);
        let credit_limit = dto.credit_limit.unwrap_or(0);
        let party_type = dto.party_type;

        let summary = with_transaction(&db, move |tx| {
            SQLitePartyRepository::insert_party_in_tx(tx, &party)?;

            if party_type.includes_customer() {
                let customer = Customer {
                    id: party.id.clone(),
                    customer_code: SQLiteCustomerRepository::next_customer_code_in_tx(tx)?,
                    name: party.display_name.clone(),
                    phone: party.phone.clone(),
                    alternate_phone: party.alternate_phone.clone(),
                    email: party.email.clone(),
                    address: party.address.clone(),
                    notes: None,
                    credit_limit,
                    is_active: true,
                    created_at: party.created_at.clone(),
                    updated_at: party.updated_at.clone(),
                };
                SQLiteCustomerRepository::insert_customer_in_tx(tx, &customer)?;
                SQLitePartyRepository::link_role_in_tx(tx, PartyRoleKind::Customer, &customer.id, &party.id)?;
            }

            if party_type.includes_supplier() {
                let supplier_id = if party_type.includes_customer() {
                    Uuid::new_v4().to_string()
                } else {
                    party.id.clone()
                };
                let supplier = Supplier {
                    id: supplier_id,
                    supplier_code: SQLiteSupplierRepository::next_supplier_code_in_tx(tx)?,
                    name: party.display_name.clone(),
                    phone: party.phone.clone(),
                    alternate_phone: party.alternate_phone.clone(),
                    email: party.email.clone(),
                    address: party.address.clone(),
                    notes: None,
                    credit_limit: 0,
                    is_active: true,
                    created_at: party.created_at.clone(),
                    updated_at: party.updated_at.clone(),
                };
                SQLiteSupplierRepository::insert_supplier_in_tx(tx, &supplier)?;
                SQLitePartyRepository::link_role_in_tx(tx, PartyRoleKind::Supplier, &supplier.id, &party.id)?;
            }

            SQLitePartyRepository::get_party_summary_in_tx(tx, &party.id)?
                .ok_or_else(|| DbError::NotFound(format!("Party '{}' not found after create", party.id)))
        })
        .await?;
        Ok(summary)
    }

    /// Updates party contact fields and copies them to the linked roles.
    /// `updated_at` never moves backwards (clock-skew safe for the >= guard on other terminals).
    pub async fn update_party(&self, id: &str, dto: UpdatePartyDto) -> AppResult<PartySummaryDto> {
        validate_update_party(&dto).map_err(AppError::Validation)?;
        let db = self.sqlite_db()?.clone();
        let id = id.to_string();
        let now = Utc::now().to_rfc3339();

        let summary = with_transaction(&db, move |tx| {
            let existing: Party = SQLitePartyRepository::get_party_in_tx(tx, &id)?
                .ok_or_else(|| DbError::NotFound(format!("Party '{id}' not found")))?;
            let stamp = if now.as_str() > existing.updated_at.as_str() {
                now.clone()
            } else {
                existing.updated_at.clone()
            };
            let updated = apply_party_update(&existing, &dto, &stamp);
            SQLitePartyRepository::upsert_party_guarded_in_tx(tx, &updated)?;
            SQLitePartyRepository::copy_party_to_roles_in_tx(tx, &updated)?;
            SQLitePartyRepository::get_party_summary_in_tx(tx, &id)?
                .ok_or_else(|| DbError::NotFound(format!("Party '{id}' not found")))
        })
        .await?;
        Ok(summary)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations::MigrationRunner;
    use crate::domain::party::PartyType;

    async fn service() -> (PartyService, DatabaseConnection) {
        let db = DatabaseConnection::open_in_memory().unwrap();
        {
            let conn_arc = db.inner();
            let mut guard = conn_arc.lock().await;
            MigrationRunner::run(&mut guard).unwrap();
        }
        (PartyService::new_sqlite(db.clone()), db)
    }

    fn dto(t: PartyType) -> CreatePartyDto {
        CreatePartyDto {
            party_type: t,
            display_name: "Ali Traders".into(),
            company_name: Some("Ali & Sons".into()),
            phone: "0300111222".into(),
            alternate_phone: None,
            email: Some("ali@x.pk".into()),
            address: Some("Hall Road".into()),
            notes: Some("wholesale".into()),
            credit_limit: Some(50_000),
        }
    }

    #[tokio::test]
    async fn create_supplier_only_uses_party_id_as_supplier_id() {
        let (svc, _db) = service().await;
        let s = svc.create_party(dto(PartyType::Supplier)).await.unwrap();
        assert_eq!(s.party_type, Some(PartyType::Supplier));
        assert_eq!(s.supplier_id.as_deref(), Some(s.party.id.as_str()));
        assert!(s.customer_id.is_none());
    }

    #[tokio::test]
    async fn create_rejects_invalid_input() {
        let (svc, _db) = service().await;
        let mut bad = dto(PartyType::Customer);
        bad.phone = " ".into();
        assert!(matches!(svc.create_party(bad).await, Err(AppError::Validation(_))));
    }

    #[tokio::test]
    async fn update_copies_contact_to_roles() {
        let (svc, db) = service().await;
        let s = svc.create_party(dto(PartyType::Both)).await.unwrap();
        let updated = svc
            .update_party(
                &s.party.id,
                UpdatePartyDto { display_name: Some("Ali Traders Hall Road".into()), ..Default::default() },
            )
            .await
            .unwrap();
        assert_eq!(updated.party.display_name, "Ali Traders Hall Road");
        {
            let conn_arc = db.inner();
            let guard = conn_arc.lock().await;
            let c: String = guard.query_row("SELECT name FROM customers WHERE party_id = ?1", [&s.party.id], |r| r.get(0)).unwrap();
            let sp: String = guard.query_row("SELECT name FROM suppliers WHERE party_id = ?1", [&s.party.id], |r| r.get(0)).unwrap();
            assert_eq!(c, "Ali Traders Hall Road");
            assert_eq!(sp, "Ali Traders Hall Road");
        }
        assert!(matches!(svc.update_party("00000000-0000-4000-8000-000000000000", UpdatePartyDto::default()).await, Err(AppError::NotFound(_))));
    }

    #[tokio::test]
    async fn legacy_customer_create_is_linked_to_party() {
        let db = DatabaseConnection::open_in_memory().unwrap();
        {
            let conn_arc = db.inner();
            let mut guard = conn_arc.lock().await;
            MigrationRunner::run(&mut guard).unwrap();
        }
        let customers = crate::services::CustomerService::new_sqlite(db.clone());
        let c = customers
            .create_customer(crate::domain::customer::CreateCustomerDto {
                name: "Walk-in Ahmed".into(),
                phone: "0311".into(),
                alternate_phone: None,
                email: None,
                address: None,
                notes: None,
                credit_limit: None,
            })
            .await
            .unwrap();
        let parties = PartyService::new_sqlite(db.clone());
        let p = parties.get_party(&c.id).await.unwrap();
        assert_eq!(p.customer_id.as_deref(), Some(c.id.as_str()));
        assert_eq!(p.party.display_name, "Walk-in Ahmed");

        // Legacy contact edit of a single-role party mirrors to the party.
        customers
            .update_customer(&c.id, crate::domain::customer::UpdateCustomerDto {
                name: Some("Ahmed Mobile".into()),
                phone: None,
                alternate_phone: None,
                email: None,
                address: None,
                notes: None,
                credit_limit: None,
                is_active: None,
            })
            .await
            .unwrap();
        let p = parties.get_party(&c.id).await.unwrap();
        assert_eq!(p.party.display_name, "Ahmed Mobile");
    }

    /// Verifies that PartySummaryDto.customer_receivable and supplier_payable
    /// both use debit - credit convention and reflect actual ledger entries.
    /// CUSTOMER: debit=sale, credit=payment → receivable = sale - payment.
    /// SUPPLIER: debit=purchase, credit=payment → payable = purchase - payment.
    #[tokio::test]
    async fn test_party_financial_summary_reflects_ledger_balances() {
        use crate::domain::customer::{CustomerLedgerEntry, CustomerLedgerEntryType};
        use crate::domain::party::PartyType;
        use crate::domain::supplier::{SupplierLedgerEntry, SupplierLedgerEntryType};
        use crate::repositories::{SQLiteCustomerRepository, SQLiteSupplierRepository};
        use uuid::Uuid;

        let (svc, db) = service().await;

        // Create a BOTH party (customer + supplier roles)
        let s = svc.create_party(dto(PartyType::Both)).await.unwrap();
        assert_eq!(s.customer_receivable, 0);
        assert_eq!(s.supplier_payable, 0);
        let cust_id = s.customer_id.unwrap();
        let sup_id = s.supplier_id.unwrap();

        // Customer: credit sale Rs 15,000 (debit) then payment Rs 5,000 (credit)
        {
            let conn_arc = db.inner();
            let guard = conn_arc.lock().await;
            SQLiteCustomerRepository::insert_ledger_entry_in_tx(
                &guard,
                &CustomerLedgerEntry {
                    id: Uuid::new_v4().to_string(),
                    customer_id: cust_id.clone(),
                    reference_id: None,
                    reference_number: Some("INV-001".to_string()),
                    entry_type: CustomerLedgerEntryType::Sale,
                    debit: 15000,
                    credit: 0,
                    balance_after: 15000,
                    description: "Credit sale".to_string(),
                    performed_by: None,
                    created_at: "2026-01-01T00:00:00+00:00".to_string(),
                },
            )
            .unwrap();
            SQLiteCustomerRepository::insert_ledger_entry_in_tx(
                &guard,
                &CustomerLedgerEntry {
                    id: Uuid::new_v4().to_string(),
                    customer_id: cust_id.clone(),
                    reference_id: None,
                    reference_number: Some("REC-001".to_string()),
                    entry_type: CustomerLedgerEntryType::Payment,
                    debit: 0,
                    credit: 5000,
                    balance_after: 10000,
                    description: "Customer payment".to_string(),
                    performed_by: None,
                    created_at: "2026-01-02T00:00:00+00:00".to_string(),
                },
            )
            .unwrap();
        }

        // Supplier: credit purchase Rs 8,000 (debit) then payment Rs 3,000 (credit)
        {
            let conn_arc = db.inner();
            let guard = conn_arc.lock().await;
            SQLiteSupplierRepository::insert_ledger_entry_in_tx(
                &guard,
                &SupplierLedgerEntry {
                    id: Uuid::new_v4().to_string(),
                    supplier_id: sup_id.clone(),
                    reference_id: None,
                    reference_number: Some("PUR-001".to_string()),
                    entry_type: SupplierLedgerEntryType::Purchase,
                    debit: 8000,
                    credit: 0,
                    balance_after: 8000,
                    description: "Credit purchase".to_string(),
                    performed_by: None,
                    created_at: "2026-01-01T00:00:00+00:00".to_string(),
                },
            )
            .unwrap();
            SQLiteSupplierRepository::insert_ledger_entry_in_tx(
                &guard,
                &SupplierLedgerEntry {
                    id: Uuid::new_v4().to_string(),
                    supplier_id: sup_id.clone(),
                    reference_id: None,
                    reference_number: Some("PAY-001".to_string()),
                    entry_type: SupplierLedgerEntryType::Payment,
                    debit: 0,
                    credit: 3000,
                    balance_after: 5000,
                    description: "Supplier payment".to_string(),
                    performed_by: None,
                    created_at: "2026-01-02T00:00:00+00:00".to_string(),
                },
            )
            .unwrap();
        }

        let updated = svc.get_party(&s.party.id).await.unwrap();
        // Customer: 15,000 sale - 5,000 payment = 10,000 receivable
        assert_eq!(updated.customer_receivable, 10000, "customer_receivable = sale - payment");
        // Supplier: 8,000 purchase - 3,000 payment = 5,000 payable
        assert_eq!(updated.supplier_payable, 5000, "supplier_payable = purchase - payment");
    }

    /// Verifies PartySummaryDto for a CUSTOMER-only party (no supplier payable).
    #[tokio::test]
    async fn test_party_customer_only_has_receivable_no_payable() {
        use crate::domain::customer::{CustomerLedgerEntry, CustomerLedgerEntryType};
        use crate::repositories::SQLiteCustomerRepository;
        use uuid::Uuid;

        let (svc, db) = service().await;
        let s = svc.create_party(dto(PartyType::Customer)).await.unwrap();
        assert!(s.supplier_id.is_none());
        assert_eq!(s.supplier_payable, 0);

        let cust_id = s.customer_id.unwrap();
        {
            let conn_arc = db.inner();
            let guard = conn_arc.lock().await;
            SQLiteCustomerRepository::insert_ledger_entry_in_tx(
                &guard,
                &CustomerLedgerEntry {
                    id: Uuid::new_v4().to_string(),
                    customer_id: cust_id.clone(),
                    reference_id: None,
                    reference_number: None,
                    entry_type: CustomerLedgerEntryType::Sale,
                    debit: 7000,
                    credit: 0,
                    balance_after: 7000,
                    description: "Credit sale".to_string(),
                    performed_by: None,
                    created_at: "2026-01-01T00:00:00+00:00".to_string(),
                },
            )
            .unwrap();
        }
        let p = svc.get_party(&s.party.id).await.unwrap();
        assert_eq!(p.customer_receivable, 7000);
        assert_eq!(p.supplier_payable, 0);
    }

    /// Verifies PartySummaryDto for a SUPPLIER-only party (no customer receivable).
    #[tokio::test]
    async fn test_party_supplier_only_has_payable_no_receivable() {
        use crate::domain::supplier::{SupplierLedgerEntry, SupplierLedgerEntryType};
        use crate::repositories::SQLiteSupplierRepository;
        use uuid::Uuid;

        let (svc, db) = service().await;
        let s = svc.create_party(dto(PartyType::Supplier)).await.unwrap();
        assert!(s.customer_id.is_none());
        assert_eq!(s.customer_receivable, 0);

        let sup_id = s.supplier_id.unwrap();
        {
            let conn_arc = db.inner();
            let guard = conn_arc.lock().await;
            SQLiteSupplierRepository::insert_ledger_entry_in_tx(
                &guard,
                &SupplierLedgerEntry {
                    id: Uuid::new_v4().to_string(),
                    supplier_id: sup_id.clone(),
                    reference_id: None,
                    reference_number: None,
                    entry_type: SupplierLedgerEntryType::Purchase,
                    debit: 12000,
                    credit: 0,
                    balance_after: 12000,
                    description: "Credit purchase".to_string(),
                    performed_by: None,
                    created_at: "2026-01-01T00:00:00+00:00".to_string(),
                },
            )
            .unwrap();
        }
        let p = svc.get_party(&s.party.id).await.unwrap();
        assert_eq!(p.supplier_payable, 12000);
        assert_eq!(p.customer_receivable, 0);
    }

    #[tokio::test]
    async fn legacy_customer_deactivate_mirrors_party() {
        let db = DatabaseConnection::open_in_memory().unwrap();
        {
            let conn_arc = db.inner();
            let mut guard = conn_arc.lock().await;
            MigrationRunner::run(&mut guard).unwrap();
        }
        let customers = crate::services::CustomerService::new_sqlite(db.clone());
        let c = customers
            .create_customer(crate::domain::customer::CreateCustomerDto {
                name: "Deactivate Me".into(),
                phone: "0312".into(),
                alternate_phone: None,
                email: None,
                address: None,
                notes: None,
                credit_limit: None,
            })
            .await
            .unwrap();

        customers.deactivate_customer(&c.id).await.unwrap();

        // Customer role and its single-role party are both inactive.
        assert!(!customers.get_customer_by_id(&c.id).await.unwrap().is_active);
        let parties = PartyService::new_sqlite(db.clone());
        assert!(!parties.get_party(&c.id).await.unwrap().party.is_active);

        // NotFound contract is preserved.
        assert!(matches!(
            customers.deactivate_customer("00000000-0000-4000-8000-000000000000").await,
            Err(AppError::NotFound(_))
        ));
    }

    #[tokio::test]
    async fn postgres_backend_refuses_writes() {
        // Construct without a live pool: only the backend guard is exercised.
        let pool = sqlx::postgres::PgPoolOptions::new()
            .connect_lazy("postgres://localhost/unused")
            .unwrap();
        let svc = PartyService::new_postgres(pool);
        assert!(matches!(svc.create_party(dto(PartyType::Customer)).await, Err(AppError::Forbidden(_))));
    }
}
