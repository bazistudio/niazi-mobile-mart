use chrono::Utc;
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use crate::db::errors::{DbError, DbResult};

/// Canonical UUID v4 generator for all domain entities across local and online databases
pub fn generate_uuid_v4() -> String {
    Uuid::new_v4().to_string()
}

/// Validates that an entity identifier strictly conforms to standard UUID v4 format
pub fn validate_uuid(id: &str) -> DbResult<String> {
    Uuid::parse_str(id)
        .map(|u| u.to_string())
        .map_err(|e| DbError::ConstraintViolation(format!("Invalid UUID identifier '{id}': {e}")))
}

/// Current timestamp formatted in ISO 8601 UTC
pub fn utc_now() -> String {
    Utc::now().to_rfc3339()
}

/// Authoritative financial value stored as whole Pakistani Rupees (PKR).
/// PERMANENT RULE: 1 stored integer = 1 PKR rupee (e.g. 2000 = Rs 2,000, 380000 = Rs 380,000).
/// STRICT INVARIANTS:
/// - ZERO floating-point numbers (no f32, f64, REAL, FLOAT)
/// - ZERO minor-unit scaling (no paisa, no x100, no /100)
/// - ZERO decimal formatting (no .00)
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, Default)]
pub struct Money {
    /// Exact monetary value in whole Pakistani Rupees (PKR)
    pub rupees: i64,
}

impl Money {
    /// Permanent single-currency constants
    pub const CURRENCY_CODE: &'static str = "PKR";
    pub const CURRENCY_SYMBOL: &'static str = "Rs";

    /// Zero money constant
    pub const ZERO: Self = Self { rupees: 0 };

    /// Creates money from whole Pakistani Rupees
    pub const fn from_rupees(rupees: i64) -> Self {
        Self { rupees }
    }

    /// Returns exact amount in whole Pakistani Rupees
    pub const fn to_rupees(&self) -> i64 {
        self.rupees
    }

    pub fn is_positive(&self) -> bool {
        self.rupees > 0
    }

    pub fn is_negative(&self) -> bool {
        self.rupees < 0
    }

    pub fn is_zero(&self) -> bool {
        self.rupees == 0
    }

    pub fn add(&self, other: Self) -> Self {
        Self {
            rupees: self.rupees.saturating_add(other.rupees),
        }
    }

    pub fn sub(&self, other: Self) -> Self {
        Self {
            rupees: self.rupees.saturating_sub(other.rupees),
        }
    }

    pub fn mul_scalar(&self, multiplier: i64) -> Self {
        Self {
            rupees: self.rupees.saturating_mul(multiplier),
        }
    }

    /// Formats as standard PKR display string with thousand separators (e.g. "Rs 2,000", "Rs 380,000")
    /// STRICT RULE: NEVER appends decimal paisa formatting like .00
    pub fn format_pkr(&self) -> String {
        format!("Rs {}", format_integer_thousands(self.rupees))
    }
}

/// Helper function to format whole integer amounts with standard comma thousand separators
fn format_integer_thousands(val: i64) -> String {
    let s = val.abs().to_string();
    let mut result = String::new();
    let chars: Vec<char> = s.chars().collect();
    let len = chars.len();
    for (i, &ch) in chars.iter().enumerate() {
        if i > 0 && (len - i) % 3 == 0 {
            result.push(',');
        }
        result.push(ch);
    }
    if val < 0 {
        format!("-{result}")
    } else {
        result
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_uuid_generation_and_validation() {
        let id = generate_uuid_v4();
        assert_eq!(id.len(), 36);
        assert!(validate_uuid(&id).is_ok());
        assert!(validate_uuid("invalid-uuid-string").is_err());
    }

    #[test]
    fn test_money_whole_pkr_rupees_no_scaling_and_no_float() {
        // 1 stored integer = 1 PKR
        let m1 = Money::from_rupees(2000);
        assert_eq!(m1.to_rupees(), 2000);
        assert_eq!(m1.rupees, 2000);
        assert_eq!(m1.format_pkr(), "Rs 2,000");

        let m2 = Money::from_rupees(380000);
        assert_eq!(m2.to_rupees(), 380000);
        assert_eq!(m2.format_pkr(), "Rs 380,000");

        let sum = m1.add(m2);
        assert_eq!(sum.to_rupees(), 382000);
        assert_eq!(sum.format_pkr(), "Rs 382,000");

        let zero = Money::ZERO;
        assert_eq!(zero.format_pkr(), "Rs 0");
        assert!(zero.is_zero());

        let multiplied = m1.mul_scalar(3);
        assert_eq!(multiplied.to_rupees(), 6000);
        assert_eq!(multiplied.format_pkr(), "Rs 6,000");
    }
}
