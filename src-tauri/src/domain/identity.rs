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

    /// Evaluates effective permissions and returns Ok(()) or AppError::Forbidden (403).
    /// Enforces: Role Permissions + Individual Overrides = Effective Permissions.
    pub fn authorize_permission(&self, page: Option<&str>, action: Option<&str>) -> Result<(), crate::errors::AppError> {
        if self.is_admin() {
            return Ok(());
        }

        if let Some(p) = page {
            if !self.access_profile.has_page_access(p) {
                return Err(crate::errors::AppError::Forbidden(format!(
                    "Access denied: You do not have permission to access page '{p}'"
                )));
            }
        }

        if let Some(a) = action {
            if !self.access_profile.has_action_access(a) {
                return Err(crate::errors::AppError::Forbidden(format!(
                    "Access denied: You do not have permission to execute action '{a}'"
                )));
            }
        }

        Ok(())
    }

    /// Validates organization and branch context integrity against trusted request identity.
    /// Rejects client attempt to access another organization or unauthorized branch.
    pub fn validate_context(&self, req_org_id: Option<&str>, req_branch_id: Option<&str>) -> Result<(), crate::errors::AppError> {
        // Validate Organization Context
        if let Some(org_id) = req_org_id {
            if org_id != self.organization_id {
                return Err(crate::errors::AppError::Forbidden(
                    "Access denied: Cross-organization data access prohibited".to_string(),
                ));
            }
        }

        // Validate Branch Context if user is assigned to a specific branch
        if let (Some(assigned_branch), Some(target_branch)) = (&self.branch_id, req_branch_id) {
            if !self.is_admin() && assigned_branch != target_branch {
                return Err(crate::errors::AppError::Forbidden(
                    "Access denied: Unauthorized cross-branch access prohibited".to_string(),
                ));
            }
        }

        Ok(())
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

    #[test]
    fn test_phase4_authorization_and_individual_override_precedence() {
        // Cashier role default profile: allowed_pages = ["dashboard", "pos", ...]
        // Add individual override: grant "reports" page, deny "pos" page
        let mut profile = StaffAccessProfile::cashier_default();
        profile.allowed_pages.push("reports".to_string());
        profile.allowed_pages.retain(|p| p != "pos");

        let user = SanitizedUser {
            id: "usr_cashier_override".to_string(),
            name: "Cashier Override".to_string(),
            username: "cashier_ovr".to_string(),
            role: UserRole::Cashier,
            status: UserStatus::Active,
            is_active: true,
            must_change_password: false,
            has_pin: false,
            access_profile: profile,
            created_at: "2026-01-01T00:00:00Z".to_string(),
        };

        let identity = RequestIdentity::from_user(&user, 1000);

        // Individual override grant: "reports" -> Ok(())
        assert!(identity.authorize_permission(Some("reports"), None).is_ok());

        // Individual override deny: "pos" -> Err(AppError::Forbidden)
        let pos_err = identity.authorize_permission(Some("pos"), None);
        assert!(pos_err.is_err());
        assert!(pos_err.unwrap_err().to_string().contains("Access denied"));
    }

    #[test]
    fn test_phase4_organization_and_branch_isolation() {
        let user = SanitizedUser {
            id: "usr_branch_user".to_string(),
            name: "Branch Cashier".to_string(),
            username: "branch_cashier".to_string(),
            role: UserRole::Cashier,
            status: UserStatus::Active,
            is_active: true,
            must_change_password: false,
            has_pin: false,
            access_profile: StaffAccessProfile::cashier_default(),
            created_at: "2026-01-01T00:00:00Z".to_string(),
        };

        let mut identity = RequestIdentity::from_user(&user, 1000);
        identity.branch_id = Some("branch_branch1".to_string());

        // Matching org and matching branch -> OK
        assert!(identity.validate_context(Some("00000000-0000-0000-0000-000000000001"), Some("branch_branch1")).is_ok());

        // Cross-organization tampering -> Err(Forbidden)
        let org_err = identity.validate_context(Some("other_org_id"), None);
        assert!(org_err.is_err());
        assert!(org_err.unwrap_err().to_string().contains("Cross-organization data access prohibited"));

        // Cross-branch tampering -> Err(Forbidden)
        let branch_err = identity.validate_context(None, Some("unauthorized_branch_2"));
        assert!(branch_err.is_err());
        assert!(branch_err.unwrap_err().to_string().contains("Unauthorized cross-branch access prohibited"));
    }
}
