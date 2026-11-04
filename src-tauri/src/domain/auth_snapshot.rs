use serde::{Deserialize, Serialize};

use super::user::{UserRole, UserStatus};

/// Represents a synchronized local authentication credential snapshot
/// stored in the local SQLite database (`local_auth_snapshot` table).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AuthSnapshot {
    pub user_id: String,
    pub username: String,
    pub organization_id: String,
    pub branch_id: Option<String>,
    pub role: UserRole,
    /// Raw role string as stored in SQLite before enum parsing.
    /// Populated by the repository; not present in serialized JSON (serde skip).
    /// Used to detect legacy blocked roles (SUPER_ADMIN, OWNER, MULTI_ADMIN, SHOPADMIN)
    /// that are silently mapped to UserRole::Staff by parse_role() and cannot be
    /// distinguished at the enum level.
    #[serde(skip)]
    pub role_raw: String,
    pub credential_hash: String,
    pub access_profile_json: String,
    pub credential_version: i32,
    pub status: UserStatus,
    pub synced_at: String,
    pub created_at: String,
    pub updated_at: String,
}
