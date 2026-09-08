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
                "products".to_string(),
                "inventory".to_string(),
                "sales".to_string(),
                "purchases".to_string(),
                "customers".to_string(),
                "suppliers".to_string(),
                "parties".to_string(),
                "repairs".to_string(),
                "reports".to_string(),
            ],
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

    /// Creates cashier terminal access profile
    pub fn cashier_default() -> Self {
        Self {
            allowed_pages: vec![
                "dashboard".to_string(),
                "pos".to_string(),
                "products".to_string(),
                "sales".to_string(),
                "customers".to_string(),
                "parties".to_string(),
            ],
            allowed_actions: vec![
                "pos:sale".to_string(),
                "pos:hold".to_string(),
                "order:create".to_string(),
                "order:read".to_string(),
            ],
            limits: StaffOperationalLimits {
                max_discount_percent: 0.0,
                can_price_override: false,
                can_refund: false,
                can_void_sale: false,
                can_view_profit: false,
            },
        }
    }

    /// Creates branch/shop admin access profile with full branch operational authority
    pub fn shop_admin_default() -> Self {
        Self {
            allowed_pages: vec![
                "dashboard".to_string(),
                "pos".to_string(),
                "products".to_string(),
                "inventory".to_string(),
                "sales".to_string(),
                "purchases".to_string(),
                "customers".to_string(),
                "suppliers".to_string(),
                "parties".to_string(),
                "repairs".to_string(),
                "expenses".to_string(),
                "cash".to_string(),
                "reports".to_string(),
                "settings".to_string(),
            ],
            allowed_actions: vec![
                "pos:sale".to_string(),
                "pos:hold".to_string(),
                "pos:discount".to_string(),
                "pos:override".to_string(),
                "pos:refund".to_string(),
                "pos:void".to_string(),
                "stock:adjust".to_string(),
                "stock:transfer".to_string(),
                "product:create".to_string(),
                "product:edit".to_string(),
                "reports:export".to_string(),
                "expense:create".to_string(),
                "cash:manage".to_string(),
            ],
            limits: StaffOperationalLimits {
                max_discount_percent: 25.0,
                can_price_override: true,
                can_refund: true,
                can_void_sale: true,
                can_view_profit: true,
            },
        }
    }

    /// Creates accountant access profile focused on financial & ledger management
    pub fn accountant_default() -> Self {
        Self {
            allowed_pages: vec![
                "dashboard".to_string(),
                "products".to_string(),
                "inventory".to_string(),
                "sales".to_string(),
                "purchases".to_string(),
                "customers".to_string(),
                "suppliers".to_string(),
                "parties".to_string(),
                "expenses".to_string(),
            ],
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

    /// Creates salesman access profile for POS and sales intake
    pub fn salesman_default() -> Self {
        Self {
            allowed_pages: vec![
                "dashboard".to_string(),
                "pos".to_string(),
                "products".to_string(),
                "sales".to_string(),
                "customers".to_string(),
                "parties".to_string(),
            ],
            allowed_actions: vec![
                "pos:sale".to_string(),
                "pos:hold".to_string(),
                "order:create".to_string(),
                "order:read".to_string(),
            ],
            limits: StaffOperationalLimits {
                max_discount_percent: 0.0,
                can_price_override: false,
                can_refund: false,
                can_void_sale: false,
                can_view_profit: false,
            },
        }
    }


    /// Creates repair mechanic access profile focused on device service jobs
    pub fn repair_mechanic_default() -> Self {
        Self {
            allowed_pages: vec![
                "dashboard".to_string(),
                "repairs".to_string(),
                "customers".to_string(),
                "products".to_string(),
            ],
            allowed_actions: vec![
                "repair:create".to_string(),
                "repair:update".to_string(),
                "repair:diagnose".to_string(),
                "repair:parts".to_string(),
            ],
            limits: StaffOperationalLimits {
                max_discount_percent: 0.0,
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

    /// Validates if a page route or canonical permission is permitted
    pub fn has_page_access(&self, page: &str) -> bool {
        let clean = page.trim().trim_start_matches('/').to_lowercase();
        self.allowed_pages.iter().any(|p| {
            let p_lower = p.to_lowercase();
            if p_lower == "*" || p_lower == clean || clean.starts_with(&format!("{p_lower}/")) {
                return true;
            }
            // Canonical mapping: "pos.use" matches "pos", "inventory.view" matches "inventory"
            if clean.starts_with(&format!("{p_lower}.")) || p_lower.starts_with(&format!("{clean}.")) {
                return true;
            }
            // Canonical domain aliases for parties
            if (p_lower == "customers" || p_lower == "suppliers" || p_lower == "parties")
                && (clean == "parties" || clean == "customers" || clean == "suppliers" || clean.starts_with("parties."))
            {
                return true;
            }
            if (clean == "customers" || clean == "suppliers" || clean == "parties")
                && (p_lower == "parties" || p_lower == "customers" || p_lower == "suppliers" || p_lower.starts_with("parties."))
            {
                return true;
            }
            // Canonical aliases for finance / cash management
            if (p_lower == "cash" || p_lower == "cash_management" || p_lower == "business-ledger" || p_lower == "finance")
                && (clean == "finance" || clean == "cash" || clean == "cash_management" || clean == "business-ledger" || clean.starts_with("finance."))
            {
                return true;
            }
            if (clean == "cash" || clean == "cash_management" || clean == "business-ledger" || clean == "finance")
                && (p_lower == "finance" || p_lower == "cash" || p_lower == "cash_management" || p_lower == "business-ledger" || p_lower.starts_with("finance."))
            {
                return true;
            }
            false
        })
    }

    /// Validates if a specific action permission or canonical permission is granted
    pub fn has_action_access(&self, action: &str) -> bool {
        let clean = action.trim().to_lowercase();
        self.allowed_actions.iter().any(|a| {
            let a_lower = a.to_lowercase();
            if a_lower == "*" || a_lower == clean {
                return true;
            }
            // Canonical action aliases
            if a_lower == "pos:sale" && (clean == "pos.use" || clean == "pos:sale") {
                return true;
            }
            if a_lower == "pos:refund" && (clean == "pos.void_sale" || clean == "sales.manage" || clean == "pos:refund") {
                return true;
            }
            if a_lower == "stock:adjust" && (clean == "inventory.edit" || clean == "inventory:adjust" || clean == "stock:adjust") {
                return true;
            }
            if a_lower == "stock:transfer" && (clean == "inventory.edit" || clean == "inventory:transfer" || clean == "stock:transfer") {
                return true;
            }
            if (a_lower == "product:create" || a_lower == "product:edit") && (clean == "products.manage" || clean == "inventory.edit" || clean == "inventory:write") {
                return true;
            }
            if a_lower == "inventory:read" && (clean == "inventory.view" || clean == "products.view" || clean == "inventory:read") {
                return true;
            }
            if a_lower == "inventory:write" && (clean == "inventory.edit" || clean == "products.manage" || clean == "inventory:write") {
                return true;
            }
            if a_lower == "inventory:adjust" && (clean == "inventory.edit" || clean == "inventory:adjust") {
                return true;
            }
            if a_lower == "inventory:transfer" && (clean == "inventory.edit" || clean == "inventory:transfer") {
                return true;
            }
            false
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
        assert!(!profile.has_page_access("inventory"));
        assert!(profile.has_action_access("pos:sale"));
        assert!(!profile.has_action_access("finance:override"));
        assert!(!profile.has_action_access("pos:refund"));
        // Default max discount is 0.0 (INDIVIDUAL permission required)
        assert!(profile.check_discount_limit(0.0));
        assert!(!profile.check_discount_limit(0.1));
    }

    #[test]
    fn test_accountant_access_restrictions() {
        let profile = StaffAccessProfile::accountant_default();
        // SELECT default pages:
        assert!(profile.has_page_access("products"));
        assert!(profile.has_page_access("inventory"));
        assert!(profile.has_page_access("sales"));
        assert!(profile.has_page_access("purchases"));
        assert!(profile.has_page_access("expenses"));
        assert!(profile.has_page_access("customers"));
        // INDIVIDUAL/REJECT pages - NOT default:
        assert!(!profile.has_page_access("pos"));
        assert!(!profile.has_page_access("cash"));
        assert!(!profile.has_page_access("business-ledger"));
        assert!(!profile.has_page_access("reports"));
        assert!(!profile.has_page_access("settings"));
        // Actions:
        assert!(!profile.has_action_access("expense:create"));
        assert!(!profile.has_action_access("cash:manage"));
        assert!(!profile.has_action_access("pos:sale"));
        assert!(profile.check_discount_limit(0.0));
        assert!(!profile.check_discount_limit(0.1));
    }

    #[test]
    fn test_manager_access_restrictions() {
        let profile = StaffAccessProfile::manager_default();
        // SELECT default pages:
        assert!(profile.has_page_access("products"));
        assert!(profile.has_page_access("inventory"));
        assert!(profile.has_page_access("sales"));
        assert!(profile.has_page_access("purchases"));
        assert!(profile.has_page_access("reports"));
        assert!(profile.has_page_access("repairs"));
        // INDIVIDUAL pages - NOT default:
        assert!(!profile.has_page_access("pos"));
        assert!(!profile.has_page_access("settings"));
        assert!(!profile.has_page_access("users"));
        // Actions - INDIVIDUAL:
        assert!(!profile.has_action_access("pos:sale"));
        assert!(!profile.has_action_access("pos:refund"));
        assert!(!profile.has_action_access("stock:adjust"));
        assert!(!profile.has_action_access("product:create"));
        assert!(profile.check_discount_limit(0.0));
        assert!(!profile.check_discount_limit(0.1));
    }

    #[test]
    fn test_page_alias_security() {
        let accountant = StaffAccessProfile::accountant_default();
        // Expenses must NOT grant finance or cash
        assert!(accountant.has_page_access("expenses"));
        assert!(!accountant.has_page_access("finance"));
        assert!(!accountant.has_page_access("cash"));
        assert!(!accountant.has_page_access("business-ledger"));

        let cashier = StaffAccessProfile::cashier_default();
        // Products must NOT grant inventory
        assert!(cashier.has_page_access("products"));
        assert!(!cashier.has_page_access("inventory"));
    }
}

