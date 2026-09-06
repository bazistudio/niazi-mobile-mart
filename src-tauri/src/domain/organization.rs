use serde::{Deserialize, Serialize};

/// Canonical permanent organization identifier for Niazi Mobile Mart.
/// Single real retail organization - no arbitrary customer tenants or organization signups.
pub const NIAZI_ORGANIZATION_ID: &str = "00000000-0000-0000-0000-000000000001";
pub const NIAZI_ORGANIZATION_NAME: &str = "Niazi Mobile Mart";

/// Permanent single-currency lock: Pakistani Rupee (PKR).
/// 1 stored integer = 1 PKR rupee. No paisa, no minor units, no float conversions.
pub const PKR_CURRENCY_CODE: &str = "PKR";
pub const PKR_CURRENCY_SYMBOL: &str = "Rs";

/// Default root branch identifier for Main Branch
pub const DEFAULT_MAIN_BRANCH_ID: &str = "00000000-0000-0000-0000-000000000002";
pub const DEFAULT_MAIN_BRANCH_CODE: &str = "MAIN";
pub const DEFAULT_MAIN_BRANCH_NAME: &str = "Main Branch";

/// Controlled physical retail branch belonging exclusively to Niazi Mobile Mart.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Branch {
    pub id: String,
    pub organization_id: String,
    pub name: String,
    pub code: String,
    pub is_active: bool,
    pub created_at: String,
    pub updated_at: String,
}

/// Internal product rate entity stored in the database.
/// All monetary values are integer whole Pakistani Rupees (PKR).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct InternalProductRate {
    pub product_id: String,
    pub product_name: String,
    pub category: String,
    pub purchase_cost: i64,            // Whole PKR (STRICT INTERNAL SECRET)
    pub supplier_id: String,           // STRICT INTERNAL SECRET
    pub current_stock_count: i64,      // STRICT INTERNAL SECRET
    pub profit_margin_percent: i64,    // STRICT INTERNAL SECRET
    pub selling_rate: i64,             // Whole PKR
    pub currency: String,              // Always "PKR"
    pub is_public: bool,               // Admin explicit publication flag
    pub updated_at: String,
}

/// Publicly exposed product rate DTO for the external Play Store mobile application.
/// STRICT DATA ISOLATION:
/// - NEVER includes purchase price, cost, or supplier information.
/// - NEVER includes internal stock levels, quantities, or warehouse locations.
/// - NEVER includes profit margins, ledger balances, or customer accounts.
/// - Exposes ONLY intentionally published selling rates in whole PKR rupees.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PublicRateDto {
    pub product_id: String,
    pub product_name: String,
    pub category: String,
    pub selling_rate: i64, // Whole PKR (e.g. 380000 = Rs 380,000)
    pub currency: String,  // Always "PKR"
    pub updated_at: String,
}

impl InternalProductRate {
    /// Safely projects an internal product rate to a public rate DTO IF published.
    /// Returns None if the rate is not publicly published.
    pub fn to_public_dto(&self) -> Option<PublicRateDto> {
        if !self.is_public {
            return None;
        }

        Some(PublicRateDto {
            product_id: self.product_id.clone(),
            product_name: self.product_name.clone(),
            category: self.category.clone(),
            selling_rate: self.selling_rate,
            currency: self.currency.clone(),
            updated_at: self.updated_at.clone(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::access_control::StaffAccessProfile;
    use crate::domain::user::UserRole;

    #[test]
    fn test_whole_pkr_rupee_representation() {
        let rate = InternalProductRate {
            product_id: "550e8400-e29b-41d4-a716-446655440000".to_string(),
            product_name: "Charger 25W".to_string(),
            category: "Accessories".to_string(),
            purchase_cost: 1500, // Rs 1,500
            supplier_id: "sup_01".to_string(),
            current_stock_count: 50,
            profit_margin_percent: 33,
            selling_rate: 2000,  // Rs 2,000
            currency: "PKR".to_string(),
            is_public: true,
            updated_at: "2026-01-01T00:00:00Z".to_string(),
        };

        // 1 stored integer = 1 PKR
        assert_eq!(rate.purchase_cost, 1500);
        assert_eq!(rate.selling_rate, 2000);

        let dto = rate.to_public_dto().unwrap();
        assert_eq!(dto.selling_rate, 2000);
        assert_eq!(dto.currency, "PKR");
    }

    #[test]
    fn test_security_public_user_internal_erp_api_denied() {
        let profile = StaffAccessProfile::public_user_restricted();
        assert!(!profile.has_page_access("dashboard"));
        assert!(!profile.has_page_access("pos"));
        assert!(!profile.has_page_access("settings"));
        assert!(!profile.has_action_access("admin:users"));
    }

    #[test]
    fn test_security_public_user_internal_inventory_denied() {
        let profile = StaffAccessProfile::public_user_restricted();
        assert!(!profile.has_page_access("inventory"));
        assert!(!profile.has_action_access("stock:adjust"));
        assert!(!profile.has_action_access("stock:transfer"));
    }

    #[test]
    fn test_security_public_user_supplier_data_denied() {
        let profile = StaffAccessProfile::public_user_restricted();
        assert!(!profile.has_page_access("suppliers"));
        assert!(!profile.has_action_access("supplier:read"));
        assert!(!profile.has_action_access("supplier:ledger"));
    }

    #[test]
    fn test_security_public_user_customer_ledger_denied() {
        let profile = StaffAccessProfile::public_user_restricted();
        assert!(!profile.has_page_access("customers/ledger"));
        assert!(!profile.has_action_access("ledger:read"));
        assert!(!profile.has_action_access("ledger:post"));
    }

    #[test]
    fn test_security_public_user_unpublished_rate_denied() {
        let internal_rate = InternalProductRate {
            product_id: "11111111-2222-3333-4444-555555555555".to_string(),
            product_name: "Samsung Galaxy S24 Ultra".to_string(),
            category: "Smartphones".to_string(),
            purchase_cost: 320000, // Rs 320,000
            supplier_id: "sup_secret_01".to_string(),
            current_stock_count: 15,
            profit_margin_percent: 18,
            selling_rate: 380000,  // Rs 380,000
            currency: "PKR".to_string(),
            is_public: false, // Unpublished
            updated_at: "2026-01-01T00:00:00Z".to_string(),
        };

        assert!(internal_rate.to_public_dto().is_none());
    }

    #[test]
    fn test_security_public_user_published_rate_allowed() {
        let internal_rate = InternalProductRate {
            product_id: "11111111-2222-3333-4444-555555555555".to_string(),
            product_name: "Samsung Galaxy S24 Ultra".to_string(),
            category: "Smartphones".to_string(),
            purchase_cost: 320000, // Rs 320,000 (Private)
            supplier_id: "sup_secret_01".to_string(), // Private
            current_stock_count: 15,       // Private
            profit_margin_percent: 18,     // Private
            selling_rate: 380000,  // Rs 380,000 (Public)
            currency: "PKR".to_string(),
            is_public: true, // Explicitly published
            updated_at: "2026-01-01T00:00:00Z".to_string(),
        };

        let public_dto = internal_rate.to_public_dto().expect("Published rate must be visible");
        assert_eq!(public_dto.product_name, "Samsung Galaxy S24 Ultra");
        assert_eq!(public_dto.selling_rate, 380000);
        assert_eq!(public_dto.currency, "PKR");

        // Verify that JSON serialization contains ZERO internal secrets
        let json = serde_json::to_string(&public_dto).unwrap();
        assert!(!json.contains("purchase_cost"));
        assert!(!json.contains("supplier"));
        assert!(!json.contains("stock"));
        assert!(!json.contains("profit_margin"));
    }

    #[test]
    fn test_security_internal_authorized_admin_publish_rate_allowed() {
        let admin_role = UserRole::Admin;
        assert!(admin_role.is_internal());
        let admin_profile = StaffAccessProfile::admin_unlimited();
        assert!(admin_profile.has_action_access("rates:publish"));
        assert!(admin_profile.has_action_access("*"));
    }

    #[test]
    fn test_security_unauthorized_internal_user_admin_operation_denied() {
        let cashier_profile = StaffAccessProfile::cashier_default();
        assert!(!cashier_profile.has_action_access("admin:users"));
        assert!(!cashier_profile.has_action_access("rates:publish"));
        assert!(!cashier_profile.has_page_access("settings/users"));

        let staff_profile = StaffAccessProfile::staff_default();
        assert!(!staff_profile.has_action_access("admin:users"));
    }
}
