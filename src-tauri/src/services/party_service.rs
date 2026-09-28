//! Party application service (Phase 1.1).
//!
//! Desktop (SQLite): create/update parties atomically together with their
//! customer/supplier roles and the outbox events.
//! Server (PostgreSQL): read-only; parties reach the central database through
//! the sync pipeline (`PARTY_UPSERTED`, `CUSTOMER_CREATED`, `SUPPLIER_*`).

use chrono::Utc;
use uuid::Uuid;

use crate::db::connection::DatabaseConnection;
use crate::db::errors::DbError;
use crate::db::transaction::with_transaction;
use crate::domain::customer::Customer;
use crate::domain::organization::{DEFAULT_MAIN_BRANCH_ID, NIAZI_ORGANIZATION_ID};
use crate::domain::party::{
    apply_party_update, build_party, role_payload_with_party_id, validate_create_party,
    validate_update_party, CreatePartyDto, Party, PartyFilter, PartyRoleKind, PartySummaryDto,
    UpdatePartyDto, PARTY_UPSERTED_EVENT,
};
use crate::domain::supplier::Supplier;
use crate::domain::sync_queue::EnqueueOfflineEventDto;
use crate::errors::{AppError, AppResult};
use crate::repositories::{
    PostgresPartyRepository, SQLiteCustomerRepository, SQLitePartyRepository,
    SQLiteSupplierRepository, SQLiteSyncQueueRepository,
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

fn to_json<T: serde::Serialize>(value: &T, what: &str) -> Result<String, DbError> {
    serde_json::to_string(value).map_err(|e| DbError::ValidationError(format!("Failed to serialize {what}: {e}")))
}

fn event(terminal_id: &str, client_event_id: String, event_type: &str, payload: String) -> EnqueueOfflineEventDto {
    EnqueueOfflineEventDto {
        client_event_id: Some(client_event_id),
        terminal_id: terminal_id.to_string(),
        organization_id: NIAZI_ORGANIZATION_ID.to_string(),
        branch_id: DEFAULT_MAIN_BRANCH_ID.to_string(),
        event_type: event_type.to_string(),
        payload,
    }
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

    /// Creates a party and its role(s) in ONE local transaction with the outbox events:
    /// PARTY_UPSERTED, then CUSTOMER_CREATED and/or SUPPLIER_CREATED (payloads carry `party_id`).
    /// Identity: party.id = first role id; a BOTH party's supplier gets its own UUID.
    pub async fn create_party(&self, dto: CreatePartyDto) -> AppResult<PartySummaryDto> {
        validate_create_party(&dto).map_err(AppError::Validation)?;
        let db = self.sqlite_db()?.clone();
        let terminal_id = crate::repositories::SQLiteTerminalRepository::new(db.clone())
            .get_or_create_current_terminal()
            .await?
            .id;

        let party_id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        let party = build_party(&party_id, &dto, &now);
        let credit_limit = dto.credit_limit.unwrap_or(0);
        let party_type = dto.party_type;

        let summary = with_transaction(&db, move |tx| {
            SQLitePartyRepository::insert_party_in_tx(tx, &party)?;
            let mut role_events: Vec<(String, &'static str, String)> = Vec::new();

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
                let payload = role_payload_with_party_id(&customer, &party.id)
                    .map_err(|e| DbError::ValidationError(format!("Failed to serialize customer payload: {e}")))?;
                role_events.push((customer.id.clone(), "CUSTOMER_CREATED", payload));
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
                let payload = role_payload_with_party_id(&supplier, &party.id)
                    .map_err(|e| DbError::ValidationError(format!("Failed to serialize supplier payload: {e}")))?;
                role_events.push((Uuid::new_v4().to_string(), "SUPPLIER_CREATED", payload));
            }

            SQLiteSyncQueueRepository::enqueue_in_tx(
                tx,
                event(&terminal_id, Uuid::new_v4().to_string(), PARTY_UPSERTED_EVENT, to_json(&party, "party")?),
            )?;
            for (client_event_id, event_type, payload) in role_events {
                SQLiteSyncQueueRepository::enqueue_in_tx(tx, event(&terminal_id, client_event_id, event_type, payload))?;
            }

            SQLitePartyRepository::get_party_summary_in_tx(tx, &party.id)?
                .ok_or_else(|| DbError::NotFound(format!("Party '{}' not found after create", party.id)))
        })
        .await?;
        Ok(summary)
    }

    /// Updates party contact fields, copies them to the linked roles, and enqueues PARTY_UPSERTED.
    /// `updated_at` never moves backwards (clock-skew safe for the >= guard on other terminals).
    pub async fn update_party(&self, id: &str, dto: UpdatePartyDto) -> AppResult<PartySummaryDto> {
        validate_update_party(&dto).map_err(AppError::Validation)?;
        let db = self.sqlite_db()?.clone();
        let terminal_id = crate::repositories::SQLiteTerminalRepository::new(db.clone())
            .get_or_create_current_terminal()
            .await?
            .id;
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
            SQLiteSyncQueueRepository::enqueue_in_tx(
                tx,
                event(&terminal_id, Uuid::new_v4().to_string(), PARTY_UPSERTED_EVENT, to_json(&updated, "party")?),
            )?;
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

    async fn queue(db: &DatabaseConnection) -> Vec<(String, String)> {
        let conn_arc = db.inner();
        let guard = conn_arc.lock().await;
        let mut stmt = guard
            .prepare("SELECT event_type, payload FROM offline_sync_queue ORDER BY created_at ASC")
            .unwrap();
        let rows = stmt
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
            .unwrap()
            .map(|r| r.unwrap())
            .collect();
        rows
    }

    #[tokio::test]
    async fn create_both_creates_one_party_two_roles_and_three_events() {
        let (svc, db) = service().await;
        let s = svc.create_party(dto(PartyType::Both)).await.unwrap();
        assert_eq!(s.party_type, Some(PartyType::Both));
        assert_eq!(s.customer_id.as_deref(), Some(s.party.id.as_str()));
        assert!(s.supplier_id.is_some() && s.supplier_id.as_deref() != Some(s.party.id.as_str()));
        assert_eq!(s.customer_credit_limit, Some(50_000));
        assert_eq!(s.party.company_name.as_deref(), Some("Ali & Sons"));
        assert_eq!(s.customer_receivable, 0);
        assert_eq!(s.supplier_payable, 0);

        let events = queue(&db).await;
        let types: Vec<&str> = events.iter().map(|(t, _)| t.as_str()).collect();
        assert_eq!(types, vec!["PARTY_UPSERTED", "CUSTOMER_CREATED", "SUPPLIER_CREATED"]);
        for (_, payload) in &events[1..] {
            assert_eq!(crate::domain::party::party_id_from_payload(payload, "x"), s.party.id);
        }
        // Existing readers still accept the role payloads.
        let _: Customer = serde_json::from_str(&events[1].1).unwrap();
        let _: Supplier = serde_json::from_str(&events[2].1).unwrap();
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
    async fn update_copies_contact_to_roles_and_enqueues_party_event() {
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
        let events = queue(&db).await;
        assert_eq!(events.last().unwrap().0, "PARTY_UPSERTED");
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
        let events = queue(&db).await;
        assert_eq!(events[0].0, "CUSTOMER_CREATED");
        assert_eq!(crate::domain::party::party_id_from_payload(&events[0].1, "x"), c.id);

        // Legacy contact edit of a single-role party mirrors to the party and emits PARTY_UPSERTED.
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
        let types: Vec<String> = queue(&db).await.into_iter().map(|(t, _)| t).collect();
        assert_eq!(types, vec!["CUSTOMER_CREATED", "CUSTOMER_UPDATED", "PARTY_UPSERTED"]);
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
