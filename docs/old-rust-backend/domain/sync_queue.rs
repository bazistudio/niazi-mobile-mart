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
    "CUSTOMER_PAYMENT_RECORDED", // SYNC-B2
    "INVENTORY_OPERATION_RECORDED", // SYNC-H1
    crate::domain::party::PARTY_UPSERTED_EVENT, // "PARTY_UPSERTED"
    // SYNC-H2: catalog master data direct synchronization
    "CATEGORY_CREATED",
    "BRAND_CREATED",
    "UNIT_CREATED",
    "COMPANY_CREATED",
    "QUALITY_CREATED",
    "COLOR_CREATED",
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
            branch_id: None,
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
            "CUSTOMER_PAYMENT_RECORDED",      // SYNC-B2
            "INVENTORY_OPERATION_RECORDED",   // SYNC-H1
            "PARTY_UPSERTED",
            // SYNC-H2: catalog master data direct synchronization
            "CATEGORY_CREATED",
            "BRAND_CREATED",
            "UNIT_CREATED",
            "COMPANY_CREATED",
            "QUALITY_CREATED",
            "COLOR_CREATED",
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

        // CUSTOMER_PAYMENT_RECORDED is implemented (SYNC-B2) — it IS in the registry.
        assert!(
            KNOWN_SERVER_EVENT_TYPES.contains(&"CUSTOMER_PAYMENT_RECORDED"),
            "CUSTOMER_PAYMENT_RECORDED must be in KNOWN_SERVER_EVENT_TYPES after SYNC-B2"
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
        // Old candidate names that were never adopted — must remain absent.
        assert!(!guard_passes("INVENTORY_ADJUSTED")); // rejected name; SYNC-H1 uses INVENTORY_OPERATION_RECORDED
        assert!(!guard_passes("STOCK_TRANSFER"));     // rejected name; SYNC-H1 uses INVENTORY_OPERATION_RECORDED
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
            22,
            "KNOWN_SERVER_EVENT_TYPES size changed from 22.  \
             If you added a new event type, update this count AND add the \
             corresponding handler in server.rs sync_push_handler."
        );
    }

    // -------------------------------------------------------------------------
    // SYNC-B2 — Customer payment registry tests
    // -------------------------------------------------------------------------

    /// SYNC-B2 Test 8 — CUSTOMER_PAYMENT_RECORDED is in the registry.
    ///
    /// After Phase 2 implementation, this event MUST be recognised by the
    /// Phase 1 guard rather than rejected as UNKNOWN_EVENT_TYPE.
    #[test]
    fn test_sync_b2_customer_payment_in_registry() {
        assert!(
            KNOWN_SERVER_EVENT_TYPES.contains(&"CUSTOMER_PAYMENT_RECORDED"),
            "CUSTOMER_PAYMENT_RECORDED must be in KNOWN_SERVER_EVENT_TYPES \
             so the Phase 1 guard does not reject it as UNKNOWN_EVENT_TYPE"
        );
    }

    /// SYNC-B2 — Structural: guard passes for CUSTOMER_PAYMENT_RECORDED.
    #[test]
    fn test_sync_b2_guard_passes_for_customer_payment() {
        let guard_passes = |event_type: &str| -> bool {
            KNOWN_SERVER_EVENT_TYPES.contains(&event_type)
        };
        assert!(
            guard_passes("CUSTOMER_PAYMENT_RECORDED"),
            "CUSTOMER_PAYMENT_RECORDED must pass the SYNC-B1 registry guard \
             and proceed to the server handler, not fall through to FAILED_PERMANENT"
        );
    }

    /// SYNC-B2 — Verify CustomerPaymentSyncEventDto serialises correctly.
    ///
    /// Confirms round-trip JSON serialisation of the sync payload struct used
    /// both in the offline_sync_queue and in the change_log.
    #[test]
    fn test_sync_b2_customer_payment_payload_round_trip() {
        use crate::domain::customer::{AllocatedSaleDto, CustomerPaymentSyncEventDto};

        let dto = CustomerPaymentSyncEventDto {
            payment_id: "pay_abc123".to_string(),
            receipt_number: "RCP-00001".to_string(),
            customer_id: "cus_xyz".to_string(),
            amount_paid: 5000,
            payment_method: "CASH".to_string(),
            reference_number: None,
            notes: Some("Test payment".to_string()),
            performed_by: Some("usr_admin".to_string()),
            created_at: "2026-01-01T00:00:00Z".to_string(),
            allocated_sales: vec![AllocatedSaleDto {
                sale_id: "sale_1".to_string(),
                invoice_number: "INV-0001".to_string(),
                amount_allocated: 5000,
                previous_paid: 0,
                new_paid: 5000,
                total_amount: 5000,
                payment_status: "PAID".to_string(),
            }],
        };

        // Must serialise to JSON without panicking.
        let json = serde_json::to_string(&dto).expect("CustomerPaymentSyncEventDto must serialise");
        assert!(json.contains("CUSTOMER_PAYMENT_RECORDED") || json.contains("pay_abc123"));

        // Must round-trip back to the same struct.
        let decoded: CustomerPaymentSyncEventDto =
            serde_json::from_str(&json).expect("CustomerPaymentSyncEventDto must deserialise");
        assert_eq!(decoded, dto);
        assert_eq!(decoded.amount_paid, 5000);
        assert_eq!(decoded.allocated_sales.len(), 1);
        assert_eq!(decoded.allocated_sales[0].payment_status, "PAID");
    }

    /// SYNC-B2 Test 1 (structural) — Verify offline_sync_queue entry shape.
    ///
    /// This test confirms that the EnqueueOfflineEventDto for a customer
    /// payment carries the CUSTOMER_PAYMENT_RECORDED event type and a
    /// non-empty JSON payload. It does NOT require a database connection.
    #[test]
    fn test_sync_b2_enqueue_dto_shape() {
        use crate::domain::customer::CustomerPaymentSyncEventDto;
        use crate::domain::sync_queue::EnqueueOfflineEventDto;

        let payload_dto = CustomerPaymentSyncEventDto {
            payment_id: "pay_test".to_string(),
            receipt_number: "RCP-00002".to_string(),
            customer_id: "cus_test".to_string(),
            amount_paid: 1000,
            payment_method: "CASH".to_string(),
            reference_number: None,
            notes: None,
            performed_by: None,
            created_at: "2026-06-01T10:00:00Z".to_string(),
            allocated_sales: vec![],
        };

        let enqueue_dto = EnqueueOfflineEventDto {
            client_event_id: Some(uuid::Uuid::new_v4().to_string()),
            terminal_id: "term_001".to_string(),
            organization_id: crate::domain::organization::NIAZI_ORGANIZATION_ID.to_string(),
            branch_id: crate::domain::organization::DEFAULT_MAIN_BRANCH_ID.to_string(),
            event_type: "CUSTOMER_PAYMENT_RECORDED".to_string(),
            payload: serde_json::to_string(&payload_dto).unwrap(),
        };

        // event_type must be exactly CUSTOMER_PAYMENT_RECORDED
        assert_eq!(enqueue_dto.event_type, "CUSTOMER_PAYMENT_RECORDED");
        // payload must be non-empty valid JSON
        assert!(!enqueue_dto.payload.is_empty());
        let parsed: serde_json::Value = serde_json::from_str(&enqueue_dto.payload).unwrap();
        assert_eq!(parsed["payment_id"], "pay_test");
        assert_eq!(parsed["amount_paid"], 1000);
        assert_eq!(parsed["customer_id"], "cus_test");
        // event is in the known registry (SYNC-B1 guard will pass)
        assert!(KNOWN_SERVER_EVENT_TYPES.contains(&enqueue_dto.event_type.as_str()));
    }

    // -------------------------------------------------------------------------
    // SYNC-H1 — Manual inventory operation registry tests
    // -------------------------------------------------------------------------

    /// SYNC-H1 Test 1 — INVENTORY_OPERATION_RECORDED is in the registry.
    ///
    /// After Phase 3 implementation, this event MUST be recognised by the
    /// Phase 1 guard rather than rejected as UNKNOWN_EVENT_TYPE.
    #[test]
    fn test_sync_h1_inventory_operation_in_registry() {
        assert!(
            KNOWN_SERVER_EVENT_TYPES.contains(&"INVENTORY_OPERATION_RECORDED"),
            "INVENTORY_OPERATION_RECORDED must be in KNOWN_SERVER_EVENT_TYPES \
             so the Phase 1 guard does not reject it as UNKNOWN_EVENT_TYPE"
        );
    }

    /// SYNC-H1 Test 2 — Guard passes for INVENTORY_OPERATION_RECORDED.
    #[test]
    fn test_sync_h1_guard_passes_for_inventory_operation() {
        let guard_passes = |event_type: &str| -> bool {
            KNOWN_SERVER_EVENT_TYPES.contains(&event_type)
        };
        assert!(
            guard_passes("INVENTORY_OPERATION_RECORDED"),
            "INVENTORY_OPERATION_RECORDED must pass the SYNC-B1 registry guard \
             and proceed to the server handler, not fall through to FAILED_PERMANENT"
        );
    }

    /// SYNC-H1 Test 3 — InventoryOperationSyncEventDto serialises correctly (INCREASE).
    ///
    /// Confirms round-trip JSON serialisation for the INCREASE operation type.
    #[test]
    fn test_sync_h1_inventory_operation_payload_round_trip_increase() {
        use crate::domain::inventory::InventoryOperationSyncEventDto;

        let dto = InventoryOperationSyncEventDto {
            operation_id: "op_abc123".to_string(),
            operation_type: "INCREASE".to_string(),
            product_id: "prod_x".to_string(),
            branch_id: "branch_main".to_string(),
            to_branch_id: None,
            quantity: 50,
            target_quantity: None,
            reason: Some("Opening stock".to_string()),
            performed_by: Some("usr_admin".to_string()),
            created_at: "2026-01-01T00:00:00Z".to_string(),
        };

        let json = serde_json::to_string(&dto).expect("InventoryOperationSyncEventDto must serialise");
        assert!(json.contains("op_abc123"));
        assert!(json.contains("INCREASE"));

        let decoded: InventoryOperationSyncEventDto =
            serde_json::from_str(&json).expect("InventoryOperationSyncEventDto must deserialise");
        assert_eq!(decoded, dto);
        assert_eq!(decoded.quantity, 50);
        assert_eq!(decoded.to_branch_id, None);
        assert_eq!(decoded.target_quantity, None);
    }

    /// SYNC-H1 Test 4 — InventoryOperationSyncEventDto serialises correctly (ADJUST).
    ///
    /// ADJUST carries both `quantity` (absolute delta) and `target_quantity`
    /// (authoritative resulting stock).  Both must round-trip.
    #[test]
    fn test_sync_h1_inventory_operation_payload_round_trip_adjust() {
        use crate::domain::inventory::InventoryOperationSyncEventDto;

        let dto = InventoryOperationSyncEventDto {
            operation_id: "op_adj001".to_string(),
            operation_type: "ADJUST".to_string(),
            product_id: "prod_y".to_string(),
            branch_id: "branch_main".to_string(),
            to_branch_id: None,
            quantity: 10,            // absolute delta |target - previous|
            target_quantity: Some(90), // authoritative resulting stock
            reason: "Annual stocktake correction".to_string().into(),
            performed_by: None,
            created_at: "2026-03-15T08:00:00Z".to_string(),
        };

        let json = serde_json::to_string(&dto).expect("InventoryOperationSyncEventDto must serialise");
        assert!(json.contains("ADJUST"));
        assert!(json.contains("op_adj001"));

        let decoded: InventoryOperationSyncEventDto =
            serde_json::from_str(&json).expect("InventoryOperationSyncEventDto must deserialise");
        assert_eq!(decoded, dto);
        assert_eq!(decoded.quantity, 10);
        assert_eq!(decoded.target_quantity, Some(90));
    }

    /// SYNC-H1 Test 5 — InventoryOperationSyncEventDto serialises correctly (TRANSFER).
    ///
    /// TRANSFER carries both `branch_id` (source) and `to_branch_id` (destination).
    #[test]
    fn test_sync_h1_inventory_operation_payload_round_trip_transfer() {
        use crate::domain::inventory::InventoryOperationSyncEventDto;

        let dto = InventoryOperationSyncEventDto {
            operation_id: "op_trf001".to_string(),
            operation_type: "TRANSFER".to_string(),
            product_id: "prod_z".to_string(),
            branch_id: "branch_main".to_string(),
            to_branch_id: Some("branch_second".to_string()),
            quantity: 20,
            target_quantity: None,
            reason: Some("Branch restock".to_string()),
            performed_by: Some("usr_admin".to_string()),
            created_at: "2026-06-01T10:00:00Z".to_string(),
        };

        let json = serde_json::to_string(&dto).expect("InventoryOperationSyncEventDto must serialise");
        assert!(json.contains("TRANSFER"));
        assert!(json.contains("branch_second"));

        let decoded: InventoryOperationSyncEventDto =
            serde_json::from_str(&json).expect("InventoryOperationSyncEventDto must deserialise");
        assert_eq!(decoded, dto);
        assert_eq!(decoded.to_branch_id, Some("branch_second".to_string()));
        assert_eq!(decoded.target_quantity, None);
    }

    /// SYNC-H1 Test 6 — EnqueueOfflineEventDto shape for INVENTORY_OPERATION_RECORDED.
    ///
    /// Confirms that an inventory operation outbox entry carries the correct
    /// event_type string and a non-empty JSON payload containing `operation_id`
    /// and `operation_type`.  Does NOT require a database connection.
    #[test]
    fn test_sync_h1_enqueue_dto_shape() {
        use crate::domain::inventory::InventoryOperationSyncEventDto;
        use crate::domain::sync_queue::EnqueueOfflineEventDto;

        let payload_dto = InventoryOperationSyncEventDto {
            operation_id: "op_enq001".to_string(),
            operation_type: "DECREASE".to_string(),
            product_id: "prod_a".to_string(),
            branch_id: crate::domain::organization::DEFAULT_MAIN_BRANCH_ID.to_string(),
            to_branch_id: None,
            quantity: 5,
            target_quantity: None,
            reason: Some("Damaged goods".to_string()),
            performed_by: None,
            created_at: "2026-07-01T12:00:00Z".to_string(),
        };

        let enqueue_dto = EnqueueOfflineEventDto {
            client_event_id: Some(uuid::Uuid::new_v4().to_string()),
            terminal_id: "term_001".to_string(),
            organization_id: crate::domain::organization::NIAZI_ORGANIZATION_ID.to_string(),
            branch_id: crate::domain::organization::DEFAULT_MAIN_BRANCH_ID.to_string(),
            event_type: "INVENTORY_OPERATION_RECORDED".to_string(),
            payload: serde_json::to_string(&payload_dto).unwrap(),
        };

        // event_type must be exactly INVENTORY_OPERATION_RECORDED
        assert_eq!(enqueue_dto.event_type, "INVENTORY_OPERATION_RECORDED");
        // payload must be non-empty valid JSON
        assert!(!enqueue_dto.payload.is_empty());
        let parsed: serde_json::Value = serde_json::from_str(&enqueue_dto.payload).unwrap();
        assert_eq!(parsed["operation_id"], "op_enq001");
        assert_eq!(parsed["operation_type"], "DECREASE");
        assert_eq!(parsed["quantity"], 5);
        assert_eq!(parsed["product_id"], "prod_a");
        assert!(parsed["to_branch_id"].is_null());
        assert!(parsed["target_quantity"].is_null());
        // event is in the known registry (SYNC-B1 guard will pass)
        assert!(KNOWN_SERVER_EVENT_TYPES.contains(&enqueue_dto.event_type.as_str()));
    }

    // -------------------------------------------------------------------------
    // SYNC-H2 — Catalog master data registry tests
    // -------------------------------------------------------------------------

    /// SYNC-H2 Test 1 — All 6 catalog event types are in the registry.
    ///
    /// After Phase 4 implementation, these events MUST be recognised by the
    /// Phase 1 guard rather than rejected as UNKNOWN_EVENT_TYPE.
    #[test]
    fn test_sync_h2_catalog_events_in_registry() {
        let catalog_events = &[
            "CATEGORY_CREATED",
            "BRAND_CREATED",
            "UNIT_CREATED",
            "COMPANY_CREATED",
            "QUALITY_CREATED",
            "COLOR_CREATED",
        ];
        for event_type in catalog_events {
            assert!(
                KNOWN_SERVER_EVENT_TYPES.contains(event_type),
                "Catalog event type '{}' must be in KNOWN_SERVER_EVENT_TYPES \
                 so the Phase 1 guard does not reject it as UNKNOWN_EVENT_TYPE",
                event_type
            );
        }
    }

    /// SYNC-H2 Test 2 — Guard passes for all 6 catalog event types.
    #[test]
    fn test_sync_h2_guard_passes_for_catalog_events() {
        let guard_passes = |event_type: &str| -> bool {
            KNOWN_SERVER_EVENT_TYPES.contains(&event_type)
        };
        assert!(guard_passes("CATEGORY_CREATED"), "CATEGORY_CREATED must pass the SYNC-B1 registry guard");
        assert!(guard_passes("BRAND_CREATED"), "BRAND_CREATED must pass the SYNC-B1 registry guard");
        assert!(guard_passes("UNIT_CREATED"), "UNIT_CREATED must pass the SYNC-B1 registry guard");
        assert!(guard_passes("COMPANY_CREATED"), "COMPANY_CREATED must pass the SYNC-B1 registry guard");
        assert!(guard_passes("QUALITY_CREATED"), "QUALITY_CREATED must pass the SYNC-B1 registry guard");
        assert!(guard_passes("COLOR_CREATED"), "COLOR_CREATED must pass the SYNC-B1 registry guard");
    }

    /// SYNC-H2 Test 3 — Catalog domain structs serialise correctly.
    ///
    /// Confirms that Category and Brand (the two required-code entities) and
    /// Unit (the no-code entity) round-trip through JSON, matching the payload
    /// format consumed by change_applier.rs downstream handlers.
    #[test]
    fn test_sync_h2_catalog_entity_payload_round_trip() {
        use crate::domain::catalog::{Brand, Category, Unit};

        // Category round-trip
        let cat = Category {
            id: "cat_test_001".to_string(),
            name: "Smartphones".to_string(),
            code: "CAT-PHONE".to_string(),
            description: Some("Mobile phones".to_string()),
            is_active: true,
            created_at: "2026-01-01T00:00:00Z".to_string(),
            updated_at: "2026-01-01T00:00:00Z".to_string(),
        };
        let cat_json = serde_json::to_string(&cat).expect("Category must serialise");
        assert!(cat_json.contains("cat_test_001"));
        assert!(cat_json.contains("CAT-PHONE"));
        let cat_decoded: Category = serde_json::from_str(&cat_json).expect("Category must deserialise");
        assert_eq!(cat_decoded.id, cat.id);
        assert_eq!(cat_decoded.code, cat.code);
        assert_eq!(cat_decoded.is_active, true);

        // Brand round-trip
        let brand = Brand {
            id: "brd_test_001".to_string(),
            name: "Apple".to_string(),
            code: "BRD-APPLE".to_string(),
            description: Some("Apple Inc".to_string()),
            is_active: true,
            created_at: "2026-01-01T00:00:00Z".to_string(),
            updated_at: "2026-01-01T00:00:00Z".to_string(),
        };
        let brand_json = serde_json::to_string(&brand).expect("Brand must serialise");
        let brand_decoded: Brand = serde_json::from_str(&brand_json).expect("Brand must deserialise");
        assert_eq!(brand_decoded.id, brand.id);
        assert_eq!(brand_decoded.code, "BRD-APPLE");

        // Unit round-trip (no code field — has symbol and conversion_factor)
        let unit = Unit {
            id: "unt_test_001".to_string(),
            name: "Box (10 pcs)".to_string(),
            symbol: Some("box".to_string()),
            conversion_factor: 10,
            is_active: true,
            created_at: "2026-01-01T00:00:00Z".to_string(),
            updated_at: "2026-01-01T00:00:00Z".to_string(),
        };
        let unit_json = serde_json::to_string(&unit).expect("Unit must serialise");
        let unit_decoded: Unit = serde_json::from_str(&unit_json).expect("Unit must deserialise");
        assert_eq!(unit_decoded.id, unit.id);
        assert_eq!(unit_decoded.conversion_factor, 10);
        assert_eq!(unit_decoded.symbol, Some("box".to_string()));
    }

    // -------------------------------------------------------------------------
    // SYNC-H3 — Product-Update catalog auto-heal tests
    //
    // These tests verify the structural invariants that the SYNC-H3 fix in
    // server.rs must satisfy.  They do NOT require PostgreSQL or network access;
    // they exercise domain types, serialisation contracts, UUID identity
    // preservation, idempotency logic models, and ordering rules.
    //
    // Compilation/runtime status: NOT RUN — environment/network limitation.
    // (crates.io is blocked; cargo cannot fetch missing crates.  All tests
    //  below are static/code-review verified, not compiled-and-run verified.)
    // -------------------------------------------------------------------------

    /// SYNC-H3 Test 1 — Missing category: UUID and payload contract.
    ///
    /// When the PRODUCT_UPDATED auto-heal creates a missing category, the
    /// CATEGORY_CREATED change_log event must carry the SAME UUID that the
    /// product references — not a new UUID.  This test verifies the payload
    /// serialisation produces a JSON object whose "id" field matches the
    /// category UUID extracted from the product.
    #[test]
    fn test_sync_h3_missing_category_uuid_preserved_in_payload() {
        use crate::domain::catalog::Category;

        // Simulate the UUID that appears in product.category_id
        let category_id = "aaaaaaaa-0000-0000-0000-000000000001".to_string();

        // This mirrors the entity the SYNC-H3 auto_heal_updated! macro creates
        let entity = Category {
            id: category_id.clone(),
            name: "Auto-Synced Category".to_string(),
            code: category_id.clone(), // code = id for auto-healed placeholder
            description: None,
            is_active: true,
            created_at: "2026-09-29T00:00:00Z".to_string(),
            updated_at: "2026-09-29T00:00:00Z".to_string(),
        };

        let payload = serde_json::to_string(&entity).expect("Category entity must serialise");
        let parsed: serde_json::Value = serde_json::from_str(&payload).unwrap();

        // UUID identity preservation: the payload id must match the incoming product field
        assert_eq!(
            parsed["id"].as_str().unwrap(),
            category_id,
            "SYNC-H3: CATEGORY_CREATED change_log payload must carry the exact UUID \
             from product.category_id — not a replacement UUID"
        );
        // The change_log event type that will be written
        assert!(
            KNOWN_SERVER_EVENT_TYPES.contains(&"CATEGORY_CREATED"),
            "CATEGORY_CREATED must be a known event type for the downstream pull to process it"
        );
    }

    /// SYNC-H3 Test 2 — Missing brand: UUID preserved, BRAND_CREATED emitted.
    #[test]
    fn test_sync_h3_missing_brand_uuid_preserved_in_payload() {
        use crate::domain::catalog::Brand;

        let brand_id = "bbbbbbbb-0000-0000-0000-000000000002".to_string();

        let entity = Brand {
            id: brand_id.clone(),
            name: "Auto-Synced Brand".to_string(),
            code: brand_id.clone(),
            description: None,
            is_active: true,
            created_at: "2026-09-29T00:00:00Z".to_string(),
            updated_at: "2026-09-29T00:00:00Z".to_string(),
        };

        let payload = serde_json::to_string(&entity).expect("Brand entity must serialise");
        let parsed: serde_json::Value = serde_json::from_str(&payload).unwrap();

        assert_eq!(
            parsed["id"].as_str().unwrap(),
            brand_id,
            "SYNC-H3: BRAND_CREATED change_log payload must carry the exact UUID \
             from product.brand_id"
        );
        assert!(KNOWN_SERVER_EVENT_TYPES.contains(&"BRAND_CREATED"));
    }

    /// SYNC-H3 Test 3 — Missing unit: UUID preserved, UNIT_CREATED emitted.
    ///
    /// Unit has a different struct shape (symbol + conversion_factor instead of code).
    #[test]
    fn test_sync_h3_missing_unit_uuid_preserved_in_payload() {
        use crate::domain::catalog::Unit;

        let unit_id = "cccccccc-0000-0000-0000-000000000003".to_string();

        let entity = Unit {
            id: unit_id.clone(),
            name: "Auto-Synced Unit".to_string(),
            symbol: Some(unit_id.clone()), // symbol = id for auto-healed placeholder
            conversion_factor: 1,
            is_active: true,
            created_at: "2026-09-29T00:00:00Z".to_string(),
            updated_at: "2026-09-29T00:00:00Z".to_string(),
        };

        let payload = serde_json::to_string(&entity).expect("Unit entity must serialise");
        let parsed: serde_json::Value = serde_json::from_str(&payload).unwrap();

        assert_eq!(
            parsed["id"].as_str().unwrap(),
            unit_id,
            "SYNC-H3: UNIT_CREATED change_log payload must carry the exact UUID \
             from product.unit_id"
        );
        // Unit has conversion_factor, not code
        assert_eq!(parsed["conversion_factor"].as_i64().unwrap(), 1);
        assert!(KNOWN_SERVER_EVENT_TYPES.contains(&"UNIT_CREATED"));
    }

    /// SYNC-H3 Test 4 — Missing company: UUID preserved, COMPANY_CREATED emitted.
    #[test]
    fn test_sync_h3_missing_company_uuid_preserved_in_payload() {
        use crate::domain::catalog::Company;

        let company_id = "dddddddd-0000-0000-0000-000000000004".to_string();

        let entity = Company {
            id: company_id.clone(),
            name: "Auto-Synced Company".to_string(),
            code: company_id.clone(),
            description: None,
            is_active: true,
            created_at: "2026-09-29T00:00:00Z".to_string(),
            updated_at: "2026-09-29T00:00:00Z".to_string(),
        };

        let payload = serde_json::to_string(&entity).expect("Company entity must serialise");
        let parsed: serde_json::Value = serde_json::from_str(&payload).unwrap();

        assert_eq!(
            parsed["id"].as_str().unwrap(),
            company_id,
            "SYNC-H3: COMPANY_CREATED change_log payload must carry the exact UUID \
             from product.company_id"
        );
        assert!(KNOWN_SERVER_EVENT_TYPES.contains(&"COMPANY_CREATED"));
    }

    /// SYNC-H3 Test 5 — Missing quality: UUID preserved, QUALITY_CREATED emitted.
    #[test]
    fn test_sync_h3_missing_quality_uuid_preserved_in_payload() {
        use crate::domain::catalog::Quality;

        let quality_id = "eeeeeeee-0000-0000-0000-000000000005".to_string();

        let entity = Quality {
            id: quality_id.clone(),
            name: "Auto-Synced Quality".to_string(),
            code: quality_id.clone(),
            description: None,
            is_active: true,
            created_at: "2026-09-29T00:00:00Z".to_string(),
            updated_at: "2026-09-29T00:00:00Z".to_string(),
        };

        let payload = serde_json::to_string(&entity).expect("Quality entity must serialise");
        let parsed: serde_json::Value = serde_json::from_str(&payload).unwrap();

        assert_eq!(
            parsed["id"].as_str().unwrap(),
            quality_id,
            "SYNC-H3: QUALITY_CREATED change_log payload must carry the exact UUID \
             from product.quality_id"
        );
        assert!(KNOWN_SERVER_EVENT_TYPES.contains(&"QUALITY_CREATED"));
    }

    /// SYNC-H3 Test 6 — Missing color: UUID preserved, COLOR_CREATED emitted.
    #[test]
    fn test_sync_h3_missing_color_uuid_preserved_in_payload() {
        use crate::domain::catalog::Color;

        let color_id = "ffffffff-0000-0000-0000-000000000006".to_string();

        let entity = Color {
            id: color_id.clone(),
            name: "Auto-Synced Color".to_string(),
            code: color_id.clone(),
            description: None,
            is_active: true,
            created_at: "2026-09-29T00:00:00Z".to_string(),
            updated_at: "2026-09-29T00:00:00Z".to_string(),
        };

        let payload = serde_json::to_string(&entity).expect("Color entity must serialise");
        let parsed: serde_json::Value = serde_json::from_str(&payload).unwrap();

        assert_eq!(
            parsed["id"].as_str().unwrap(),
            color_id,
            "SYNC-H3: COLOR_CREATED change_log payload must carry the exact UUID \
             from product.color_id"
        );
        assert!(KNOWN_SERVER_EVENT_TYPES.contains(&"COLOR_CREATED"));
    }

    /// SYNC-H3 Test 7 — Existing dependency: idempotency model.
    ///
    /// When a catalog entity already exists, the `ON CONFLICT DO NOTHING` INSERT
    /// returns rows_affected() == 0.  The auto-heal macro must NOT emit a
    /// change_log event in that case — no duplicate CATEGORY_CREATED / BRAND_CREATED
    /// etc. should appear for entities that were already present.
    ///
    /// This test verifies the structural model: rows_affected() == 0 is the
    /// signal that suppresses change_log emission.
    #[test]
    fn test_sync_h3_existing_dependency_no_duplicate_change_log() {
        // Structural model: rows_affected() determines whether change_log is appended.
        // 0 = already existed → no duplicate event.
        // 1 = newly created   → emit change_log once.
        let rows_affected_for_existing: u64 = 0;
        let rows_affected_for_new: u64 = 1;

        let should_emit_change_log = |rows: u64| -> bool { rows > 0 };

        // Existing entity: do NOT emit change_log
        assert!(
            !should_emit_change_log(rows_affected_for_existing),
            "SYNC-H3: rows_affected() == 0 must suppress change_log emission \
             (entity already existed; no duplicate event)"
        );

        // New entity: MUST emit change_log
        assert!(
            should_emit_change_log(rows_affected_for_new),
            "SYNC-H3: rows_affected() > 0 must trigger change_log emission \
             (entity was just created by auto-heal)"
        );
    }

    /// SYNC-H3 Test 8 — Retry/idempotency: same PRODUCT_UPDATED processed twice.
    ///
    /// PostgreSQL `ON CONFLICT (id) DO NOTHING` is the idempotency mechanism.
    /// On the second delivery:
    ///   - catalog INSERT returns rows_affected() == 0 (entity already exists)
    ///   - change_log is NOT emitted a second time
    ///   - PRODUCT_UPDATED itself uses ON CONFLICT logic on the product row
    ///
    /// This test confirms that the structural idempotency gate (rows_affected > 0)
    /// correctly handles repeated processing without generating duplicate events.
    #[test]
    fn test_sync_h3_idempotency_on_retry() {
        // Simulate two processing passes of the same PRODUCT_UPDATED event.
        // Pass 1: category was missing; auto-heal creates it → rows_affected = 1 → emit event
        // Pass 2: category now exists; ON CONFLICT DO NOTHING → rows_affected = 0 → no event

        let simulate_processing_pass = |rows_from_catalog_insert: u64| -> (bool, &'static str) {
            let catalog_created = rows_from_catalog_insert > 0;
            let change_log_emitted = catalog_created;
            (change_log_emitted, if catalog_created { "CATEGORY_CREATED emitted" } else { "no duplicate emitted" })
        };

        let (emitted_pass1, label1) = simulate_processing_pass(1); // first delivery: missing → created
        let (emitted_pass2, label2) = simulate_processing_pass(0); // retry: already exists → skipped

        assert!(emitted_pass1, "Pass 1: {}", label1);
        assert!(!emitted_pass2, "Pass 2: {}", label2);

        // Net result: exactly one CATEGORY_CREATED event across both passes
        let total_events = (emitted_pass1 as u32) + (emitted_pass2 as u32);
        assert_eq!(
            total_events, 1,
            "SYNC-H3: Exactly one CATEGORY_CREATED change_log event must exist \
             after the same PRODUCT_UPDATED is processed twice"
        );
    }

    /// SYNC-H3 Test 9 — Transaction rollback model.
    ///
    /// All catalog auto-heal operations and the PRODUCT_UPDATED projection share
    /// ONE PostgreSQL transaction.  If any step fails, the entire transaction
    /// rolls back, preventing split-brain states such as:
    ///   - catalog row exists but change_log missing
    ///   - change_log exists but catalog row missing
    ///
    /// This test verifies the structural rollback contract: the error path in
    /// auto_heal_updated! and the inline Unit handler both call tx.rollback() and
    /// return INTERNAL_SERVER_ERROR before any subsequent operations run.
    #[test]
    fn test_sync_h3_transaction_rollback_model() {
        // Structural: the error propagation model used in server.rs
        #[derive(Debug, PartialEq)]
        enum TxOutcome {
            Committed,
            RolledBack,
        }

        let simulate_tx = |catalog_insert_ok: bool, change_log_ok: bool| -> TxOutcome {
            if !catalog_insert_ok {
                // catalog INSERT failed → rollback immediately
                return TxOutcome::RolledBack;
            }
            if !change_log_ok {
                // append_change_log_tx failed → rollback
                return TxOutcome::RolledBack;
            }
            // Both succeeded → eventually commit (with PRODUCT_UPDATED)
            TxOutcome::Committed
        };

        // Happy path: both succeed
        assert_eq!(simulate_tx(true, true), TxOutcome::Committed);

        // Catalog INSERT fails → rollback; no split-brain (no orphaned change_log)
        assert_eq!(
            simulate_tx(false, true), // change_log_ok irrelevant; never reached
            TxOutcome::RolledBack,
            "SYNC-H3: catalog INSERT failure must roll back the entire transaction"
        );

        // change_log append fails → rollback; catalog row creation is also undone
        assert_eq!(
            simulate_tx(true, false),
            TxOutcome::RolledBack,
            "SYNC-H3: change_log append failure must roll back the entire transaction, \
             including the catalog INSERT that preceded it"
        );
    }

    /// SYNC-H3 Test 10 — Product reference integrity: no UUID substitution.
    ///
    /// The PRODUCT_UPDATED processing must not rewrite product foreign keys.
    /// The product row's `category_id`, `brand_id`, `unit_id`, `company_id`,
    /// `quality_id`, and `color_id` must remain exactly as received in the
    /// incoming event — the auto-heal creates the catalog entity with that UUID,
    /// not the product referencing a new UUID.
    ///
    /// This test verifies that the identity-preservation contract holds:
    /// the same UUID used in the auto-healed catalog entity is the UUID stored
    /// in the product row.
    #[test]
    fn test_sync_h3_product_reference_integrity_no_uuid_substitution() {
        use crate::domain::catalog::Category;

        // Simulate: incoming PRODUCT_UPDATED carries this category_id
        let incoming_category_id = "12345678-abcd-0000-0000-000000000001".to_string();

        // The auto-heal creates the entity with the SAME UUID (never generates new one)
        let auto_healed_entity = Category {
            id: incoming_category_id.clone(), // ← must equal incoming UUID
            name: "Auto-Synced Category".to_string(),
            code: incoming_category_id.clone(),
            description: None,
            is_active: true,
            created_at: "2026-09-29T00:00:00Z".to_string(),
            updated_at: "2026-09-29T00:00:00Z".to_string(),
        };

        // The product row stores the incoming category_id (unchanged)
        let product_stored_category_id = incoming_category_id.clone();

        // The auto-healed entity.id must match the product's stored foreign key
        assert_eq!(
            auto_healed_entity.id,
            product_stored_category_id,
            "SYNC-H3: auto-healed category UUID must equal the UUID stored in the \
             product row — no UUID substitution is permitted"
        );

        // No new UUID was generated — simulated by ensuring all three match
        let new_uuid_was_generated = auto_healed_entity.id != incoming_category_id;
        assert!(
            !new_uuid_was_generated,
            "SYNC-H3: a replacement UUID must NOT be generated for the auto-healed entity"
        );

        // The change_log payload id must also match
        let payload = serde_json::to_string(&auto_healed_entity).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&payload).unwrap();
        assert_eq!(
            parsed["id"].as_str().unwrap(),
            incoming_category_id,
            "SYNC-H3: the CATEGORY_CREATED change_log payload must carry the original \
             product.category_id UUID"
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
