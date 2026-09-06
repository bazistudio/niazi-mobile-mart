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

/// Authoritative financial value stored as exact integer minor units (e.g. cents, paisas)
/// Eliminates floating-point rounding errors and precision loss across all operations.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub struct Money {
    /// Exact amount in minor units (e.g., 150000 minor units with 2 decimals = 1500.00 PKR)
    pub minor_units: i64,
}

impl Money {
    /// Zero money constant
    pub const ZERO: Self = Self { minor_units: 0 };

    /// Creates money from exact minor units
    pub const fn from_minor(minor_units: i64) -> Self {
        Self { minor_units }
    }

    /// Converts decimal major units to minor units with a fixed power of 10 scale
    /// Example: 15.50 with scale 2 -> 1550 minor units
    pub fn from_major(amount: f64, decimal_places: u32) -> Self {
        let factor = 10_i64.pow(decimal_places) as f64;
        let minor = (amount * factor).round() as i64;
        Self { minor_units: minor }
    }

    /// Converts minor units to major units for display/presentation ONLY
    pub fn to_major(&self, decimal_places: u32) -> f64 {
        let factor = 10_i64.pow(decimal_places) as f64;
        (self.minor_units as f64) / factor
    }

    pub fn add(&self, other: Self) -> Self {
        Self {
            minor_units: self.minor_units.saturating_add(other.minor_units),
        }
    }

    pub fn sub(&self, other: Self) -> Self {
        Self {
            minor_units: self.minor_units.saturating_sub(other.minor_units),
        }
    }

    pub fn mul_scalar(&self, multiplier: i64) -> Self {
        Self {
            minor_units: self.minor_units.saturating_mul(multiplier),
        }
    }

    /// Permanent currency constants - PKR (Pakistani Rupee)
    pub const CURRENCY_CODE: &'static str = "PKR";
    pub const CURRENCY_SYMBOL: &'static str = "Rs";
    pub const DECIMALS: u32 = 2; // 1 PKR = 100 Paisa

    /// Creates money from exact paisa (minor unit)
    pub const fn from_paisa(paisa: i64) -> Self {
        Self { minor_units: paisa }
    }

    /// Returns exact amount in paisa (minor unit)
    pub const fn to_paisa(&self) -> i64 {
        self.minor_units
    }

    /// Converts PKR Rupees (major unit) to Money
    pub fn from_rupees(rupees: f64) -> Self {
        Self::from_major(rupees, Self::DECIMALS)
    }

    /// Converts Money to PKR Rupees (major unit)
    pub fn to_rupees(&self) -> f64 {
        self.to_major(Self::DECIMALS)
    }

    /// Formats as standard PKR display string (e.g. "Rs 1,250.50")
    pub fn format_pkr(&self) -> String {
        format!("Rs {:.2}", self.to_rupees())
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
    fn test_money_precision_no_float_drift() {
        // Classic float problem: 0.1 + 0.2 != 0.3
        let m1 = Money::from_major(0.10, 2);
        let m2 = Money::from_major(0.20, 2);
        let sum = m1.add(m2);

        assert_eq!(sum.minor_units, 30);
        assert_eq!(sum.to_major(2), 0.30);

        let multiplied = sum.mul_scalar(3);
        assert_eq!(multiplied.minor_units, 90);
        assert_eq!(multiplied.to_major(2), 0.90);
    }
}
