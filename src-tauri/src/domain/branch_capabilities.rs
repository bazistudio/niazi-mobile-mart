use serde::{Deserialize, Serialize};
use std::fmt;

/// Represents the logical invoice or transaction type used in the system.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum InvoiceType {
    NormalSale,     // Type 1
    RepairFinished, // Type 2
    RepairBooking,  // Type 3
    UsedMobile,     // Type 4
}

impl fmt::Display for InvoiceType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            InvoiceType::NormalSale => write!(f, "Normal Sale (Type 1)"),
            InvoiceType::RepairFinished => write!(f, "Repair Finished (Type 2)"),
            InvoiceType::RepairBooking => write!(f, "Repair Booking (Type 3)"),
            InvoiceType::UsedMobile => write!(f, "Used Mobile (Type 4)"),
        }
    }
}

/// Evaluates if a given branch **code** is authorized to access the specified invoice type.
///
/// # Branch Matrix
///
/// | Branch              | Type 1 | Type 2 | Type 3 | Type 4 |
/// |---------------------|--------|--------|--------|--------|
/// | MAIN / BRANCH1      |  YES   |  YES   |  YES   |   NO   |
/// | REPAIR / BRANCH2    |   NO   |  YES   |  YES   |   NO   |
/// | BRANCH3             |  YES   |   NO   |   NO   |  YES   |
/// | BRANCH4             |  YES   |   NO   |   NO   |  YES   |
///
/// **Unknown, missing or malformed branch codes always DENY access.**
pub fn can_access_invoice_type(branch_code: &str, invoice_type: InvoiceType) -> bool {
    let normalized = branch_code.trim().to_uppercase();

    match normalized.as_str() {
        // Main branch / Branch 1
        "MAIN" | "BRANCH1" | "BRANCH_1" | "BRANCH 1" => match invoice_type {
            InvoiceType::NormalSale => true,
            InvoiceType::RepairFinished => true,
            InvoiceType::RepairBooking => true,
            InvoiceType::UsedMobile => false,
        },
        // Repair branch / Branch 2
        "REPAIR" | "BRANCH2" | "BRANCH_2" | "BRANCH 2" => match invoice_type {
            InvoiceType::NormalSale => false,
            InvoiceType::RepairFinished => true,
            InvoiceType::RepairBooking => true,
            InvoiceType::UsedMobile => false,
        },
        // Branch 3
        "BRANCH3" | "BRANCH_3" | "BRANCH 3" => match invoice_type {
            InvoiceType::NormalSale => true,
            InvoiceType::RepairFinished => false,
            InvoiceType::RepairBooking => false,
            InvoiceType::UsedMobile => true,
        },
        // Branch 4
        "BRANCH4" | "BRANCH_4" | "BRANCH 4" => match invoice_type {
            InvoiceType::NormalSale => true,
            InvoiceType::RepairFinished => false,
            InvoiceType::RepairBooking => false,
            InvoiceType::UsedMobile => true,
        },
        // Safety: Unknown, missing, or malformed branch code → DENY everything
        _ => false,
    }
}

/// Authorizes an invoice type operation against the authenticated user's branch.
///
/// Resolves the branch code from the `RequestIdentity` by looking up the branch record,
/// then delegates to `can_access_invoice_type`.
///
/// Returns `Ok(())` on success or `AppError::Forbidden` if the branch is not authorized
/// for the given invoice type.
pub fn authorize_invoice_type_by_code(
    branch_code: &str,
    invoice_type: InvoiceType,
) -> Result<(), crate::errors::AppError> {
    if can_access_invoice_type(branch_code, invoice_type) {
        Ok(())
    } else {
        Err(crate::errors::AppError::Forbidden(format!(
            "Access denied: Branch '{}' is not authorized to perform {} operations",
            branch_code, invoice_type
        )))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── MAIN branch ──────────────────────────────────────────────────────────

    #[test]
    fn test_main_allows_type1_normal_sale() {
        assert!(can_access_invoice_type("MAIN", InvoiceType::NormalSale));
    }

    #[test]
    fn test_main_allows_type2_repair_finished() {
        assert!(can_access_invoice_type("MAIN", InvoiceType::RepairFinished));
    }

    #[test]
    fn test_main_allows_type3_repair_booking() {
        assert!(can_access_invoice_type("MAIN", InvoiceType::RepairBooking));
    }

    #[test]
    fn test_main_denies_type4_used_mobile() {
        assert!(!can_access_invoice_type("MAIN", InvoiceType::UsedMobile));
    }

    // ── REPAIR branch ────────────────────────────────────────────────────────

    #[test]
    fn test_repair_denies_type1_normal_sale() {
        assert!(!can_access_invoice_type("REPAIR", InvoiceType::NormalSale));
    }

    #[test]
    fn test_repair_allows_type2_repair_finished() {
        assert!(can_access_invoice_type("REPAIR", InvoiceType::RepairFinished));
    }

    #[test]
    fn test_repair_allows_type3_repair_booking() {
        assert!(can_access_invoice_type("REPAIR", InvoiceType::RepairBooking));
    }

    #[test]
    fn test_repair_denies_type4_used_mobile() {
        assert!(!can_access_invoice_type("REPAIR", InvoiceType::UsedMobile));
    }

    // ── BRANCH3 ──────────────────────────────────────────────────────────────

    #[test]
    fn test_branch3_allows_type1_normal_sale() {
        assert!(can_access_invoice_type("BRANCH3", InvoiceType::NormalSale));
    }

    #[test]
    fn test_branch3_denies_type2_repair_finished() {
        assert!(!can_access_invoice_type("BRANCH3", InvoiceType::RepairFinished));
    }

    #[test]
    fn test_branch3_denies_type3_repair_booking() {
        assert!(!can_access_invoice_type("BRANCH3", InvoiceType::RepairBooking));
    }

    #[test]
    fn test_branch3_allows_type4_used_mobile() {
        assert!(can_access_invoice_type("BRANCH3", InvoiceType::UsedMobile));
    }

    // ── BRANCH4 ──────────────────────────────────────────────────────────────

    #[test]
    fn test_branch4_allows_type1_normal_sale() {
        assert!(can_access_invoice_type("BRANCH4", InvoiceType::NormalSale));
    }

    #[test]
    fn test_branch4_denies_type2_repair_finished() {
        assert!(!can_access_invoice_type("BRANCH4", InvoiceType::RepairFinished));
    }

    #[test]
    fn test_branch4_denies_type3_repair_booking() {
        assert!(!can_access_invoice_type("BRANCH4", InvoiceType::RepairBooking));
    }

    #[test]
    fn test_branch4_allows_type4_used_mobile() {
        assert!(can_access_invoice_type("BRANCH4", InvoiceType::UsedMobile));
    }

    // ── Safety: unknown, empty, malformed ────────────────────────────────────

    #[test]
    fn test_unknown_branch_denies_all() {
        for t in [
            InvoiceType::NormalSale,
            InvoiceType::RepairFinished,
            InvoiceType::RepairBooking,
            InvoiceType::UsedMobile,
        ] {
            assert!(!can_access_invoice_type("UNKNOWN_BRANCH", t), "Unknown branch must DENY {t}");
        }
    }

    #[test]
    fn test_empty_branch_denies_all() {
        for t in [
            InvoiceType::NormalSale,
            InvoiceType::RepairFinished,
            InvoiceType::RepairBooking,
            InvoiceType::UsedMobile,
        ] {
            assert!(!can_access_invoice_type("", t), "Empty branch must DENY {t}");
        }
    }

    #[test]
    fn test_whitespace_only_branch_denies_all() {
        for t in [
            InvoiceType::NormalSale,
            InvoiceType::RepairFinished,
            InvoiceType::RepairBooking,
            InvoiceType::UsedMobile,
        ] {
            assert!(!can_access_invoice_type("   ", t), "Whitespace branch must DENY {t}");
        }
    }

    #[test]
    fn test_case_insensitive_main() {
        assert!(can_access_invoice_type("main", InvoiceType::NormalSale));
        assert!(can_access_invoice_type("Main", InvoiceType::NormalSale));
    }

    #[test]
    fn test_case_insensitive_repair() {
        assert!(can_access_invoice_type("repair", InvoiceType::RepairBooking));
        assert!(can_access_invoice_type("Repair", InvoiceType::RepairFinished));
    }

    // ── authorize_invoice_type_by_code ────────────────────────────────────────

    #[test]
    fn test_authorize_allowed_returns_ok() {
        assert!(authorize_invoice_type_by_code("MAIN", InvoiceType::NormalSale).is_ok());
        assert!(authorize_invoice_type_by_code("REPAIR", InvoiceType::RepairBooking).is_ok());
        assert!(authorize_invoice_type_by_code("BRANCH3", InvoiceType::UsedMobile).is_ok());
    }

    #[test]
    fn test_authorize_denied_returns_forbidden() {
        let err = authorize_invoice_type_by_code("MAIN", InvoiceType::UsedMobile);
        assert!(err.is_err());
        let msg = err.unwrap_err().to_string();
        assert!(msg.contains("not authorized"));

        let err2 = authorize_invoice_type_by_code("REPAIR", InvoiceType::NormalSale);
        assert!(err2.is_err());

        let err3 = authorize_invoice_type_by_code("", InvoiceType::NormalSale);
        assert!(err3.is_err());
    }
}

