use serde::{Deserialize, Serialize};

use crate::domain::access_control::StaffAccessProfile;
use crate::domain::user::{SanitizedUser, UserRole};

/// Authoritative canonical server-side request identity.
///
/// Established by authentication middleware for every incoming HTTP or IPC request.
/// Contains complete context: WHO is calling, WHICH role, WHICH tenant/branch, and PERMISSIONS.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RequestIdentity {
    pub user_id: String,
    pub username: String,
    pub role: UserRole,
    pub organization_id: String,
    pub branch_id: Option<String>,
    pub access_profile: StaffAccessProfile,
    pub authenticated_at_ms: u128,
}

impl RequestIdentity {
    /// Constructs identity from a verified SanitizedUser
    pub fn from_user(user: &SanitizedUser, authenticated_at_ms: u128) -> Self {
        Self {
            user_id: user.id.clone(),
            username: user.username.clone(),
            role: user.role,
            // Canonical organization ID for Niazi Mobile Mart
            organization_id: "00000000-0000-0000-0000-000000000001".to_string(),
            branch_id: None,
            access_profile: user.access_profile.clone(),
            authenticated_at_ms,
        }
    }

    /// Checks if the authenticated user possesses an administrative role
    pub fn is_admin(&self) -> bool {
        matches!(self.role, UserRole::Admin | UserRole::ShopAdmin)
    }

    /// Checks if user has permission to access a page
    pub fn can_access_page(&self, page: &str) -> bool {
        if self.access_profile.allowed_pages.contains(&"*".to_string()) {
            return true;
        }
        self.access_profile.allowed_pages.iter().any(|p| p == page)
    }

    /// Checks if user has permission to perform a specific action
    pub fn can_perform_action(&self, action: &str) -> bool {
        if self.access_profile.allowed_actions.contains(&"*".to_string()) {
            return true;
        }
        self.access_profile.allowed_actions.iter().any(|a| a == action)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::user::UserStatus;

    #[test]
    fn test_request_identity_permissions_and_role() {
        let user = SanitizedUser {
            id: "usr_123".to_string(),
            name: "Test Admin".to_string(),
            username: "admin".to_string(),
            role: UserRole::Admin,
            status: UserStatus::Active,
            is_active: true,
            must_change_password: false,
            has_pin: false,
            access_profile: StaffAccessProfile::admin_unlimited(),
            created_at: "2026-01-01T00:00:00Z".to_string(),
        };

        let identity = RequestIdentity::from_user(&user, 1000);
        assert_eq!(identity.user_id, "usr_123");
        assert_eq!(identity.organization_id, "00000000-0000-0000-0000-000000000001");
        assert!(identity.is_admin());
        assert!(identity.can_access_page("dashboard"));
        assert!(identity.can_perform_action("sale:create"));
    }
}
