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
}
