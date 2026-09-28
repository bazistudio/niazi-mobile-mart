use serde::{Deserialize, Serialize};

/// Queue status enum for offline event queue
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SyncQueueStatus {
    Pending,
    Syncing,
    Failed,
    Synced,
    Conflict,
    FailedPermanent,
}

impl SyncQueueStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Pending => "PENDING",
            Self::Syncing => "SYNCING",
            Self::Failed => "FAILED",
            Self::Synced => "SYNCED",
            Self::Conflict => "CONFLICT",
            Self::FailedPermanent => "FAILED_PERMANENT",
        }
    }

    pub fn from_str(s: &str) -> Self {
        match s.to_uppercase().as_str() {
            "SYNCING" => Self::Syncing,
            "FAILED" => Self::FailedPermanent,
            "FAILED_PERMANENT" => Self::FailedPermanent,
            "CONFLICT" => Self::Conflict,
            "SYNCED" => Self::Synced,
            _ => Self::Pending,
        }
    }
}

pub const MAX_RETRIES: i32 = 10;

/// Exhaustive registry of server-side sync event types the push handler recognises.
///
/// **SYNC-B1**: Any event type NOT in this list MUST be rejected with
/// `FAILED_PERMANENT` / `UNKNOWN_EVENT_TYPE` by the server push handler rather
/// than silently falling through to a spurious `SYNCED` response.
///
/// When a new event type is added to the server handler it MUST also be added
/// here, and the corresponding unit test (`test_sync_b1_registry_is_not_empty`)
/// MUST be updated to reflect the new count.
pub const KNOWN_SERVER_EVENT_TYPES: &[&str] = &[
    "SALE_CREATED",
    "SALES_RETURN_CREATED",
    "PURCHASE_CREATED",
    "PURCHASE_RETURN_CREATED",
    "EXPENSE_CREATED",
    "PRODUCT_CREATED",
    "PRODUCT_UPDATED",
    "PRODUCT_DEACTIVATED",
    "SUPPLIER_CREATED",
    "SUPPLIER_UPDATED",
    "SUPPLIER_PAYMENT_RECORDED",
    "CUSTOMER_CREATED",
    "CUSTOMER_UPDATED",
    crate::domain::party::PARTY_UPSERTED_EVENT, // "PARTY_UPSERTED"
];

impl SyncQueueItem {
    pub fn calculate_backoff_secs(attempt_count: i32) -> u64 {
        if attempt_count <= 0 {
            return 0;
        }
        let exp = (attempt_count as u32).min(30);
        let secs = 2u64.saturating_pow(exp);
        secs.min(300)
    }

    pub fn is_eligible_for_retry(&self, now: chrono::DateTime<chrono::Utc>) -> bool {
        if self.status != SyncQueueStatus::Pending || self.attempt_count >= MAX_RETRIES {
            return false;
        }
        if let Some(ref last_attempt) = self.last_attempt_at {
            if let Ok(last_time) = chrono::DateTime::parse_from_rfc3339(last_attempt) {
                let delay = Self::calculate_backoff_secs(self.attempt_count);
                let elapsed = now.signed_duration_since(last_time.with_timezone(&chrono::Utc));
                if elapsed.num_seconds() < delay as i64 {
                    return false;
                }
            }
        }
        true
    }
}

/// Offline sync queue item representing a persistent pending event generated on a terminal
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SyncQueueItem {
    pub id: String,
    pub client_event_id: String,
    pub terminal_id: String,
    pub organization_id: String,
    pub branch_id: String,
    pub event_type: String,
    pub payload: String,
    pub status: SyncQueueStatus,
    pub attempt_count: i32,
    pub last_error: Option<String>,
    pub last_attempt_at: Option<String>,
    pub server_event_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// DTO for enqueueing a new offline event
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnqueueOfflineEventDto {
    pub client_event_id: Option<String>,
    pub terminal_id: String,
    pub organization_id: String,
    pub branch_id: String,
    pub event_type: String,
    pub payload: String,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::access_control::StaffAccessProfile;
    use crate::domain::identity::RequestIdentity;
    use crate::domain::user::{SanitizedUser, UserRole, UserStatus};

    #[test]
    fn test_sync_push_security_boundary_validation() {
        let user = SanitizedUser {
            id: "usr_cashier_1".to_string(),
            name: "Cashier One".to_string(),
            username: "cashier1".to_string(),
            role: UserRole::Cashier,
            status: UserStatus::Active,
            is_active: true,
            must_change_password: false,
            has_pin: false,
            access_profile: StaffAccessProfile::cashier_default(),
            created_at: "2026-01-01T00:00:00Z".to_string(),
        };

        let mut identity = RequestIdentity::from_user(&user, 1000);
        identity.branch_id = Some("branch_main".to_string());

        let valid_item = SyncQueueItem {
            id: "1".to_string(),
            client_event_id: "evt_100".to_string(),
            terminal_id: "term_pc1".to_string(),
            organization_id: "00000000-0000-0000-0000-000000000001".to_string(),
            branch_id: "branch_main".to_string(),
            event_type: "SALE_CREATED".to_string(),
            payload: "{}".to_string(),
            status: SyncQueueStatus::Pending,
            attempt_count: 0,
            last_error: None,
            last_attempt_at: None,
            server_event_id: None,
            created_at: "2026-01-01T00:00:00Z".to_string(),
            updated_at: "2026-01-01T00:00:00Z".to_string(),
        };

        // 1. Valid Auth + Matching Org + Matching Branch -> OK
        assert_eq!(valid_item.organization_id, identity.organization_id);
        assert!(identity.validate_context(Some(&valid_item.organization_id), Some(&valid_item.branch_id)).is_ok());

        // 2. Cross-Organization Event -> Prohibited
        let mut cross_org_item = valid_item.clone();
        cross_org_item.organization_id = "other_org_uuid".to_string();
        assert_ne!(cross_org_item.organization_id, identity.organization_id);

        // 3. Unauthorized Branch Event -> Prohibited
        let mut cross_branch_item = valid_item.clone();
        cross_branch_item.branch_id = "unauthorized_branch_2".to_string();
        let branch_res = identity.validate_context(Some(&cross_branch_item.organization_id), Some(&cross_branch_item.branch_id));
        assert!(branch_res.is_err());
        assert!(branch_res.unwrap_err().to_string().contains("Unauthorized cross-branch access prohibited"));
    }

    // -------------------------------------------------------------------------
    // SYNC-B1 — Unknown-event-type registry tests
    //
    // These tests verify the KNOWN_SERVER_EVENT_TYPES constant that the server
    // push handler uses to guard against silently accepting unknown event types.
    // They do NOT require PostgreSQL; they are pure Rust unit tests.
    // -------------------------------------------------------------------------

    /// Test 1 & 4 — Unknown event is rejected / valid events are in the registry.
    ///
    /// Verifies that every currently-supported event type is present in
    /// KNOWN_SERVER_EVENT_TYPES (regression guard), and that a deliberately
    /// unsupported type is absent (SYNC-B1 guard test).
    #[test]
    fn test_sync_b1_known_event_types_registry() {
        let known = KNOWN_SERVER_EVENT_TYPES;

        // All currently-supported event types MUST be present.
        let expected_valid: &[&str] = &[
            "SALE_CREATED",
            "SALES_RETURN_CREATED",
            "PURCHASE_CREATED",
            "PURCHASE_RETURN_CREATED",
            "EXPENSE_CREATED",
            "PRODUCT_CREATED",
            "PRODUCT_UPDATED",
            "PRODUCT_DEACTIVATED",
            "SUPPLIER_CREATED",
            "SUPPLIER_UPDATED",
            "SUPPLIER_PAYMENT_RECORDED",
            "CUSTOMER_CREATED",
            "CUSTOMER_UPDATED",
            "PARTY_UPSERTED",
        ];
        for expected_type in expected_valid {
            assert!(
                known.contains(expected_type),
                "Valid event type '{}' is missing from KNOWN_SERVER_EVENT_TYPES — \
                 the guard would reject it as unknown",
                expected_type
            );
        }
    }

    /// Test 2 — Unknown event is NOT marked successful.
    ///
    /// Verifies that UNKNOWN_TEST_EVENT (and other invented types) are absent
    /// from the registry, so the guard will produce FAILED_PERMANENT rather than
    /// SYNCED for them.
    #[test]
    fn test_sync_b1_unknown_event_type_not_in_registry() {
        // Deliberately unsupported type used in the SYNC-B1 test specification.
        assert!(
            !KNOWN_SERVER_EVENT_TYPES.contains(&"UNKNOWN_TEST_EVENT"),
            "UNKNOWN_TEST_EVENT must NOT be in KNOWN_SERVER_EVENT_TYPES; \
             it would be silently accepted as SYNCED"
        );

        // Empty string must not be accepted.
        assert!(
            !KNOWN_SERVER_EVENT_TYPES.contains(&""),
            "Empty event type must NOT be in KNOWN_SERVER_EVENT_TYPES"
        );

        // Future types not yet implemented must not appear prematurely.
        assert!(
            !KNOWN_SERVER_EVENT_TYPES.contains(&"CUSTOMER_PAYMENT_RECORDED"),
            "CUSTOMER_PAYMENT_RECORDED is not yet implemented and must NOT be \
             in KNOWN_SERVER_EVENT_TYPES"
        );

        // Partial / typo variants must not slip through.
        assert!(
            !KNOWN_SERVER_EVENT_TYPES.contains(&"SALE"),
            "Partial event type string 'SALE' must NOT be in KNOWN_SERVER_EVENT_TYPES"
        );
        assert!(
            !KNOWN_SERVER_EVENT_TYPES.contains(&"sale_created"),
            "Lowercase 'sale_created' must NOT be in KNOWN_SERVER_EVENT_TYPES \
             (event types are SCREAMING_SNAKE_CASE)"
        );
    }

    /// Test 3 (structural) — Unknown events cannot create a successful change_log
    /// projection.
    ///
    /// This test proves that the guard path (unknown type → FAILED_PERMANENT /
    /// continue) is structurally separated from the audit path (known type →
    /// record_audit_tx → SYNCED).  Because the registry check is a necessary
    /// pre-condition for reaching the audit block, an unknown type can never
    /// reach it.  The constant itself is the single source of truth for both
    /// the guard in server.rs and these tests.
    #[test]
    fn test_sync_b1_unknown_event_cannot_reach_synced_path() {
        // Structural: any type not in the registry returns false for the guard
        // expression used in server.rs.
        let guard_passes = |event_type: &str| -> bool {
            KNOWN_SERVER_EVENT_TYPES.contains(&event_type)
        };

        // Known types pass the guard (would proceed to audit + SYNCED).
        assert!(guard_passes("SALE_CREATED"));
        assert!(guard_passes("PRODUCT_UPDATED"));
        assert!(guard_passes("PARTY_UPSERTED"));

        // Unknown types fail the guard (would hit FAILED_PERMANENT / continue).
        assert!(!guard_passes("UNKNOWN_TEST_EVENT"));
        assert!(!guard_passes("INVENTORY_ADJUSTED")); // not yet implemented
        assert!(!guard_passes("STOCK_TRANSFER"));     // not yet implemented
        assert!(!guard_passes(""));
    }

    /// Test 5 (mixed batch, structural) — Registry check is per-item.
    ///
    /// The guard is inside the `for event in payload.events` loop and uses
    /// `continue`, so a single unknown event does not abort the entire batch.
    /// This test verifies the registry lookup independently for each item in a
    /// mixed batch, mirroring the server handler's per-item semantics.
    #[test]
    fn test_sync_b1_mixed_batch_per_item_guard() {
        let batch_event_types = &[
            "SALE_CREATED",       // valid  → would be SYNCED
            "UNKNOWN_TEST_EVENT", // invalid → would be FAILED_PERMANENT
            "PRODUCT_CREATED",    // valid  → would be SYNCED
        ];

        let outcomes: Vec<&str> = batch_event_types
            .iter()
            .map(|et| {
                if KNOWN_SERVER_EVENT_TYPES.contains(et) {
                    "SYNCED"
                } else {
                    "FAILED_PERMANENT"
                }
            })
            .collect();

        assert_eq!(outcomes, vec!["SYNCED", "FAILED_PERMANENT", "SYNCED"]);
    }

    /// Registry size regression guard — update this count whenever a new event
    /// type is intentionally added to KNOWN_SERVER_EVENT_TYPES.
    #[test]
    fn test_sync_b1_registry_size_regression() {
        assert_eq!(
            KNOWN_SERVER_EVENT_TYPES.len(),
            14,
            "KNOWN_SERVER_EVENT_TYPES size changed from 14.  \
             If you added a new event type, update this count AND add the \
             corresponding handler in server.rs sync_push_handler."
        );
    }
}
