//! Typed storage commands for the Party domain boundary (Phase 1.1).
//!
//! Follows the existing `storage_customer` / `storage_supplier` convention: the
//! TypeScript application layer owns the session and enforces `parties.view` /
//! `parties.manage` before calling these commands; the central server enforces
//! RBAC on its own `/api/v1/parties` routes.

use tauri::State;

use crate::domain::party::{CreatePartyDto, PartyFilter, PartySummaryDto, UpdatePartyDto};
use crate::errors::{AppError, AppResult};
use crate::state::AppState;

fn require_id(id: &str) -> AppResult<()> {
    if id.trim().is_empty() {
        return Err(AppError::Validation("Party ID cannot be empty".to_string()));
    }
    Ok(())
}

pub async fn storage_party_list_impl(state: &AppState, filter: Option<PartyFilter>) -> AppResult<Vec<PartySummaryDto>> {
    state.party_service.list_parties(filter.unwrap_or_default()).await
}

/// Lists parties with linked roles and read-only balances.
#[tauri::command]
pub async fn storage_party_list(state: State<'_, AppState>, filter: Option<PartyFilter>) -> AppResult<Vec<PartySummaryDto>> {
    storage_party_list_impl(&state, filter).await
}

pub async fn storage_party_get_impl(state: &AppState, id: String) -> AppResult<PartySummaryDto> {
    require_id(&id)?;
    state.party_service.get_party(id.trim()).await
}

/// Fetches one party summary by id.
#[tauri::command]
pub async fn storage_party_get(state: State<'_, AppState>, id: String) -> AppResult<PartySummaryDto> {
    storage_party_get_impl(&state, id).await
}

pub async fn storage_party_create_impl(state: &AppState, dto: CreatePartyDto) -> AppResult<PartySummaryDto> {
    state.party_service.create_party(dto).await
}

/// Creates a party with its customer and/or supplier role (one local transaction + outbox).
#[tauri::command]
pub async fn storage_party_create(state: State<'_, AppState>, dto: CreatePartyDto) -> AppResult<PartySummaryDto> {
    storage_party_create_impl(&state, dto).await
}

pub async fn storage_party_update_impl(state: &AppState, id: String, dto: UpdatePartyDto) -> AppResult<PartySummaryDto> {
    require_id(&id)?;
    state.party_service.update_party(id.trim(), dto).await
}

/// Updates party contact fields (copied to linked roles) and enqueues PARTY_UPSERTED.
#[tauri::command]
pub async fn storage_party_update(
    state: State<'_, AppState>,
    id: String,
    dto: UpdatePartyDto,
) -> AppResult<PartySummaryDto> {
    storage_party_update_impl(&state, id, dto).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::connection::DatabaseConnection;
    use crate::db::migrations::MigrationRunner;
    use crate::domain::party::PartyType;

    async fn state() -> AppState {
        let db = DatabaseConnection::open_in_memory().unwrap();
        {
            let conn_arc = db.inner();
            let mut guard = conn_arc.lock().await;
            MigrationRunner::run(&mut guard).unwrap();
        }
        AppState::new_sqlite("1.2.34", db)
    }

    #[tokio::test]
    async fn party_command_lifecycle() {
        let state = state().await;
        assert!(matches!(storage_party_get_impl(&state, "  ".into()).await, Err(AppError::Validation(_))));

        let created = storage_party_create_impl(
            &state,
            CreatePartyDto {
                party_type: PartyType::Customer,
                display_name: "Bilal Mobiles".into(),
                company_name: None,
                phone: "0321".into(),
                alternate_phone: None,
                email: None,
                address: None,
                notes: None,
                credit_limit: None,
            },
        )
        .await
        .unwrap();

        let listed = storage_party_list_impl(&state, None).await.unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].party.id, created.party.id);

        let fetched = storage_party_get_impl(&state, created.party.id.clone()).await.unwrap();
        assert_eq!(fetched.customer_id, created.customer_id);

        // Legacy customer lookup is unchanged and sees the same record.
        let cust = state.customer_service.get_customer_by_id(&created.party.id).await.unwrap();
        assert_eq!(cust.name, "Bilal Mobiles");

        let updated = storage_party_update_impl(
            &state,
            created.party.id.clone(),
            UpdatePartyDto { is_active: Some(false), ..Default::default() },
        )
        .await
        .unwrap();
        assert!(!updated.party.is_active);
        let cust = state.customer_service.get_customer_by_id(&created.party.id).await.unwrap();
        assert!(!cust.is_active);
    }
}
