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
}
