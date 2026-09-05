use serde::{Deserialize, Serialize};
use super::access_control::StaffAccessProfile;

/// System staff roles
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum UserRole {
    Admin,
    Manager,
    Cashier,
    Staff,
}

impl std::fmt::Display for UserRole {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            UserRole::Admin => write!(f, "ADMIN"),
            UserRole::Manager => write!(f, "MANAGER"),
            UserRole::Cashier => write!(f, "CASHIER"),
            UserRole::Staff => write!(f, "STAFF"),
        }
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
    pub is_active: bool,
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
            is_active: self.is_active,
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
    pub is_active: bool,
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
            is_active: true,
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
        assert!(sanitized.has_pin);

        let json = serde_json::to_string(&sanitized).unwrap();
        assert!(!json.contains("login_key_hash"));
        assert!(!json.contains("pin_hash"));
        assert!(!json.contains("secret"));
    }
}
