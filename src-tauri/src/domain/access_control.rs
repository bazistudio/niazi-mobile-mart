use serde::{Deserialize, Serialize};

/// Operational thresholds and privilege limits for a staff member
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct StaffOperationalLimits {
    pub max_discount_percent: f64,
    pub can_price_override: bool,
    pub can_refund: bool,
    pub can_void_sale: bool,
    pub can_view_profit: bool,
}

impl Default for StaffOperationalLimits {
    fn default() -> Self {
        Self {
            max_discount_percent: 5.0,
            can_price_override: false,
            can_refund: false,
            can_void_sale: false,
            can_view_profit: false,
        }
    }
}

/// Comprehensive access profile controlling page navigation, action invocation, and operational limits
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct StaffAccessProfile {
    pub allowed_pages: Vec<String>,
    pub allowed_actions: Vec<String>,
    pub limits: StaffOperationalLimits,
}

impl StaffAccessProfile {
    /// Creates an unlimited administrative profile
    pub fn admin_unlimited() -> Self {
        Self {
            allowed_pages: vec!["*".to_string()],
            allowed_actions: vec!["*".to_string()],
            limits: StaffOperationalLimits {
                max_discount_percent: 100.0,
                can_price_override: true,
                can_refund: true,
                can_void_sale: true,
                can_view_profit: true,
            },
        }
    }

    /// Creates standard manager access profile
    pub fn manager_default() -> Self {
        Self {
            allowed_pages: vec![
                "dashboard".to_string(),
                "pos".to_string(),
                "products".to_string(),
                "inventory".to_string(),
                "orders".to_string(),
                "customers".to_string(),
                "suppliers".to_string(),
                "repairs".to_string(),
                "reports".to_string(),
            ],
            allowed_actions: vec![
                "pos:sale".to_string(),
                "pos:discount".to_string(),
                "pos:override".to_string(),
                "pos:refund".to_string(),
                "stock:adjust".to_string(),
                "stock:transfer".to_string(),
                "product:create".to_string(),
                "product:edit".to_string(),
                "reports:export".to_string(),
            ],
            limits: StaffOperationalLimits {
                max_discount_percent: 20.0,
                can_price_override: true,
                can_refund: true,
                can_void_sale: true,
                can_view_profit: true,
            },
        }
    }

    /// Creates cashier terminal access profile
    pub fn cashier_default() -> Self {
        Self {
            allowed_pages: vec![
                "pos".to_string(),
                "dashboard".to_string(),
                "repairs".to_string(),
                "customers".to_string(),
            ],
            allowed_actions: vec![
                "pos:sale".to_string(),
                "pos:hold".to_string(),
                "pos:discount".to_string(),
                "order:create".to_string(),
                "order:read".to_string(),
            ],
            limits: StaffOperationalLimits {
                max_discount_percent: 5.0,
                can_price_override: false,
                can_refund: false,
                can_void_sale: false,
                can_view_profit: false,
            },
        }
    }

    /// Creates base staff profile
    pub fn staff_default() -> Self {
        Self {
            allowed_pages: vec!["pos".to_string(), "dashboard".to_string()],
            allowed_actions: vec!["pos:sale".to_string()],
            limits: StaffOperationalLimits::default(),
        }
    }

    /// Creates completely restricted profile for external public Play Store rate app users.
    /// STRICT ISOLATION: Zero allowed pages, zero allowed internal ERP actions.
    pub fn public_user_restricted() -> Self {
        Self {
            allowed_pages: vec![],
            allowed_actions: vec![],
            limits: StaffOperationalLimits {
                max_discount_percent: 0.0,
                can_price_override: false,
                can_refund: false,
                can_void_sale: false,
                can_view_profit: false,
            },
        }
    }

    /// Validates if a page route is permitted
    pub fn has_page_access(&self, page: &str) -> bool {
        let clean = page.trim().trim_start_matches('/').to_lowercase();
        self.allowed_pages.iter().any(|p| {
            p == "*" || p.to_lowercase() == clean || clean.starts_with(&format!("{}/", p.to_lowercase()))
        })
    }

    /// Validates if a specific action permission is granted
    pub fn has_action_access(&self, action: &str) -> bool {
        let clean = action.trim().to_lowercase();
        self.allowed_actions.iter().any(|a| {
            a == "*" || a.to_lowercase() == clean
        })
    }

    /// Validates if discount percentage is within allowable limit
    pub fn check_discount_limit(&self, discount: f64) -> bool {
        discount >= 0.0 && discount <= self.limits.max_discount_percent
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_admin_access_unlimited() {
        let profile = StaffAccessProfile::admin_unlimited();
        assert!(profile.has_page_access("dashboard"));
        assert!(profile.has_page_access("settings/staff"));
        assert!(profile.has_action_access("finance:override"));
        assert!(profile.check_discount_limit(50.0));
    }

    #[test]
    fn test_cashier_access_restrictions() {
        let profile = StaffAccessProfile::cashier_default();
        assert!(profile.has_page_access("pos"));
        assert!(profile.has_page_access("/pos"));
        assert!(!profile.has_page_access("settings"));
        assert!(profile.has_action_access("pos:sale"));
        assert!(!profile.has_action_access("finance:override"));
        assert!(profile.check_discount_limit(5.0));
        assert!(!profile.check_discount_limit(5.1));
    }
}
