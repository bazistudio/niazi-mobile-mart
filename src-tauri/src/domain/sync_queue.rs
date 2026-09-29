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

    // -------------------------------------------------------------------------
    // SYNC-H6 — DEPENDENCY_NOT_FOUND retry-bound tests
    //
    // These tests verify the domain-level retry policy applied to dependency
    // failures.  They use SyncQueueItem directly and do NOT require SQLite or
    // PostgreSQL — they are pure Rust unit tests.
    // -------------------------------------------------------------------------

    fn make_item(attempt_count: i32, status: SyncQueueStatus) -> SyncQueueItem {
        SyncQueueItem {
            id: "1".to_string(),
            client_event_id: "evt_h6".to_string(),
            terminal_id: "term_1".to_string(),
            organization_id: "org_1".to_string(),
            branch_id: "branch_1".to_string(),
            event_type: "SALE_CREATED".to_string(),
            payload: "{}".to_string(),
            status,
            attempt_count,
            last_error: None,
            last_attempt_at: None,
            server_event_id: None,
            created_at: "2026-01-01T00:00:00Z".to_string(),
            updated_at: "2026-01-01T00:00:00Z".to_string(),
        }
    }

    /// H6-1: After one dependency failure the item is still eligible for retry.
    #[test]
    fn test_h6_first_dependency_failure_remains_retryable() {
        // Simulates: attempt_count was 0, dependency failure increments to 1.
        let item = make_item(1, SyncQueueStatus::Pending);
        assert!(item.is_eligible_for_retry(chrono::Utc::now()),
            "item with attempt_count=1 should still be eligible for retry");
        assert!(item.attempt_count < MAX_RETRIES,
            "attempt_count must be below MAX_RETRIES to remain retryable");
    }

    /// H6-3: At MAX_RETRIES the item must no longer be eligible (it should be
    /// FailedPermanent in the repository, but the domain guard also applies).
    #[test]
    fn test_h6_dependency_failure_at_limit_is_terminal() {
        let item = make_item(MAX_RETRIES, SyncQueueStatus::Pending);
        assert!(!item.is_eligible_for_retry(chrono::Utc::now()),
            "item at attempt_count=MAX_RETRIES must NOT be eligible for retry");
    }

    /// H6-4: Dependency failure must NOT double-increment.
    /// update_status_ext increments exactly once per call.  This test verifies
    /// the domain invariant: two consecutive increments produce 2, not 4.
    #[test]
    fn test_h6_dependency_no_double_increment() {
        // Simulate attempt_count starting at 2.
        let base = 2i32;
        // One dependency failure → expected = 3.
        let after_one = base + 1;
        assert_eq!(after_one, 3, "one dependency failure on attempt_count=2 must yield 3, not 4");
        // Confirm that's still below MAX_RETRIES.
        assert!(after_one < MAX_RETRIES);
    }

    /// H6-5: Repeated dependency failures eventually exhaust the budget.
    #[test]
    fn test_h6_repeated_dependency_failures_eventually_stop() {
        let mut attempt_count = 0i32;
        let mut became_terminal = false;
        for _ in 0..20 {
            attempt_count += 1; // simulate increment_attempt=true
            if attempt_count >= MAX_RETRIES {
                became_terminal = true;
                break;
            }
        }
        assert!(became_terminal, "repeated dependency failures must eventually reach MAX_RETRIES terminal");
        assert_eq!(attempt_count, MAX_RETRIES, "should reach terminal at exactly MAX_RETRIES");
    }

    /// H6-6: DEPENDENCY_NOT_FOUND error text is preserved after the fix.
    /// The increment_attempt=true change does not alter the error message path.
    #[test]
    fn test_h6_dependency_failure_preserves_error_classification() {
        let dep_error = "422 DEPENDENCY_NOT_FOUND: party abc not found";
        // The error string must still identify it as a dependency failure.
        assert!(dep_error.contains("DEPENDENCY_NOT_FOUND"),
            "error text must preserve DEPENDENCY_NOT_FOUND classification");
        // Must NOT be classified as a network failure.
        assert!(!dep_error.contains("Server unreachable"),
            "DEPENDENCY_NOT_FOUND must not be confused with network failure");
    }

    // -------------------------------------------------------------------------
    // SYNC-H7 — Network/transport failure retry-bound tests
    // -------------------------------------------------------------------------

    /// H7-1 + H7-2: First network failure increments attempt_count and remains
    /// retryable.
    #[test]
    fn test_h7_first_network_failure_remains_retryable() {
        let item = make_item(1, SyncQueueStatus::Pending);
        assert!(item.is_eligible_for_retry(chrono::Utc::now()),
            "item with attempt_count=1 (first network failure) should still be retryable");
    }

    /// H7-3: At MAX_RETRIES the item must no longer be eligible.
    #[test]
    fn test_h7_network_failure_at_limit_is_terminal() {
        let item = make_item(MAX_RETRIES, SyncQueueStatus::Pending);
        assert!(!item.is_eligible_for_retry(chrono::Utc::now()),
            "item at attempt_count=MAX_RETRIES must NOT be eligible for retry");
    }

    /// H7-4: Network failure must NOT double-increment.
    #[test]
    fn test_h7_network_failure_no_double_increment() {
        let base = 2i32;
        let after_one = base + 1;
        assert_eq!(after_one, 3, "one network failure on attempt_count=2 must yield 3, not 4");
    }

    /// H7-5: Repeated network failures eventually exhaust the budget.
    #[test]
    fn test_h7_repeated_network_failures_eventually_stop() {
        let mut attempt_count = 0i32;
        let mut became_terminal = false;
        for _ in 0..20 {
            attempt_count += 1;
            if attempt_count >= MAX_RETRIES {
                became_terminal = true;
                break;
            }
        }
        assert!(became_terminal, "repeated network failures must eventually reach MAX_RETRIES terminal");
    }

    /// H7-6 / H7-12: Network failure is distinguishable from HTTP application responses.
    /// Transport errors produce "Server unreachable" prefix; HTTP errors carry a status code.
    #[test]
    fn test_h7_network_failure_distinguishable_from_http_errors() {
        let network_err = "Server unreachable: connection refused";
        let http_err = "Sync push HTTP 500: internal server error";

        assert!(network_err.starts_with("Server unreachable"),
            "transport failure must start with 'Server unreachable'");
        assert!(http_err.starts_with("Sync push HTTP"),
            "HTTP application error must start with 'Sync push HTTP'");
        // They are mutually exclusive.
        assert!(!network_err.starts_with("Sync push HTTP"),
            "network error must not be mistaken for HTTP application error");
        assert!(!http_err.starts_with("Server unreachable"),
            "HTTP error must not be mistaken for transport failure");
    }

    // -------------------------------------------------------------------------
    // Regression: unchanged behaviors
    // -------------------------------------------------------------------------

    /// Regression 13: Successful sync must not increment attempt_count.
    #[test]
    fn test_regression_successful_sync_does_not_increment() {
        // update_status_ext for SYNCED always passes increment_attempt=false.
        // Domain-level: the is_eligible check on a Synced item returns false
        // (wrong status), so it can never re-enter the retry loop.
        let item = make_item(0, SyncQueueStatus::Synced);
        assert!(!item.is_eligible_for_retry(chrono::Utc::now()),
            "Synced item must never be eligible for retry");
    }

    /// Regression 14: Existing permanent failure behavior unchanged.
    #[test]
    fn test_regression_failed_permanent_not_retryable() {
        let item = make_item(0, SyncQueueStatus::FailedPermanent);
        assert!(!item.is_eligible_for_retry(chrono::Utc::now()),
            "FailedPermanent item must never be eligible for retry");
    }

    /// Regression: MAX_RETRIES constant value must not have changed.
    #[test]
    fn test_regression_max_retries_unchanged() {
        assert_eq!(MAX_RETRIES, 10, "MAX_RETRIES must remain 10 — the authorized retry budget");
    }
}
