use serde::{Deserialize, Serialize};
use super::access_control::StaffAccessProfile;

/// System roles (internal staff roles vs external public rate app users)
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum UserRole {
    Admin,
    Manager,
    Cashier,
    Staff,
    PublicUser,
}

impl UserRole {
    pub fn is_internal(&self) -> bool {
        matches!(self, Self::Admin | Self::Manager | Self::Cashier | Self::Staff)
    }

    pub fn is_public(&self) -> bool {
        matches!(self, Self::PublicUser)
    }
}

impl std::fmt::Display for UserRole {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            UserRole::Admin => write!(f, "ADMIN"),
            UserRole::Manager => write!(f, "MANAGER"),
            UserRole::Cashier => write!(f, "CASHIER"),
            UserRole::Staff => write!(f, "STAFF"),
            UserRole::PublicUser => write!(f, "PUBLIC_USER"),
        }
    }
}

/// Account approval and operational status
/// 0 = DISABLED/SUSPENDED, 1 = ACTIVE, 2 = PENDING, 3 = REJECTED
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum UserStatus {
    Disabled = 0,
    Active = 1,
    Pending = 2,
    Rejected = 3,
}

impl UserStatus {
    pub fn from_i32(val: i32) -> Self {
        match val {
            1 => Self::Active,
            2 => Self::Pending,
            3 => Self::Rejected,
            _ => Self::Disabled,
        }
    }

    pub fn to_i32(&self) -> i32 {
        *self as i32
    }
}

/// Internal native user entity
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    pub id: String,
    pub name: String,
    pub username: String,
    #[serde(skip_serializing)]
    pub login_key_hash: String,
    #[serde(skip_serializing)]
    pub pin_hash: Option<String>,
    pub role: UserRole,
    pub status: UserStatus,
    pub is_active: bool,
    #[serde(skip_serializing)]
    pub recovery_key_hash: Option<String>,
    pub must_change_password: bool,
    pub access_profile: StaffAccessProfile,
    pub failed_pin_attempts: u32,
    pub pin_locked_until_ms: Option<u128>,
    pub failed_login_attempts: u32,
    pub login_locked_until_ms: Option<u128>,
    pub created_at: String,
    pub updated_at: String,
}

impl User {
    /// Convert to sanitized view safe for IPC transmission (no hashes, no secrets)
    pub fn sanitize(&self) -> SanitizedUser {
        SanitizedUser {
            id: self.id.clone(),
            name: self.name.clone(),
            username: self.username.clone(),
            role: self.role,
            status: self.status,
            is_active: self.status == UserStatus::Active,
            must_change_password: self.must_change_password,
            has_pin: self.pin_hash.is_some(),
            access_profile: self.access_profile.clone(),
            created_at: self.created_at.clone(),
        }
    }
}

/// Sanitized user profile returned safely across the Tauri IPC boundary
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SanitizedUser {
    pub id: String,
    pub name: String,
    pub username: String,
    pub role: UserRole,
    pub status: UserStatus,
    pub is_active: bool,
    pub must_change_password: bool,
    pub has_pin: bool,
    pub access_profile: StaffAccessProfile,
    pub created_at: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sanitization_excludes_hashes() {
        let user = User {
            id: "u_1".to_string(),
            name: "Test Cashier".to_string(),
            username: "cashier1".to_string(),
            login_key_hash: "$argon2id$v=19$m=19456,t=2,p=1$secret".to_string(),
            pin_hash: Some("$argon2id$v=19$pinsecret".to_string()),
            role: UserRole::Cashier,
            status: UserStatus::Active,
            is_active: true,
            recovery_key_hash: Some("$argon2id$v=19$recoverysecret".to_string()),
            must_change_password: false,
            access_profile: StaffAccessProfile::cashier_default(),
            failed_pin_attempts: 0,
            pin_locked_until_ms: None,
            failed_login_attempts: 0,
            login_locked_until_ms: None,
            created_at: "2026-01-01T00:00:00Z".to_string(),
            updated_at: "2026-01-01T00:00:00Z".to_string(),
        };

        let sanitized = user.sanitize();
        assert_eq!(sanitized.id, "u_1");
        assert_eq!(sanitized.role, UserRole::Cashier);
        assert_eq!(sanitized.status, UserStatus::Active);
        assert!(sanitized.has_pin);

        let json = serde_json::to_string(&sanitized).unwrap();
        assert!(!json.contains("login_key_hash"));
        assert!(!json.contains("pin_hash"));
        assert!(!json.contains("recovery_key_hash"));
        assert!(!json.contains("secret"));
    }
}
