use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

use crate::domain::access_control::StaffAccessProfile;
use crate::domain::user::{User, UserRole};
use crate::errors::{AppError, AppResult};
use crate::services::hasher::hash_credential;

/// Thread-safe in-memory user repository implementing the data boundary for Phase 5
#[derive(Clone)]
pub struct InMemoryUserRepository {
    users: Arc<RwLock<HashMap<String, User>>>,
}

impl InMemoryUserRepository {
    /// Creates a repository initialized with default internal staff accounts
    pub fn new() -> Self {
        let mut map = HashMap::new();

        let admin_hash = hash_credential("Admin@Niazi2025!").expect("Admin hash failed");
        let admin_pin_hash = hash_credential("1234").expect("Admin PIN hash failed");

        let admin_user = User {
            id: "usr_admin_master".to_string(),
            name: "System Administrator".to_string(),
            username: "admin".to_string(),
            login_key_hash: admin_hash,
            pin_hash: Some(admin_pin_hash),
            role: UserRole::Admin,
            is_active: true,
            access_profile: StaffAccessProfile::admin_unlimited(),
            failed_pin_attempts: 0,
            pin_locked_until_ms: None,
            failed_login_attempts: 0,
            login_locked_until_ms: None,
            created_at: "2026-01-01T00:00:00Z".to_string(),
            updated_at: "2026-01-01T00:00:00Z".to_string(),
        };

        let cashier_hash = hash_credential("Cashier@123").expect("Cashier hash failed");
        let cashier_pin_hash = hash_credential("1234").expect("Cashier PIN hash failed");

        let cashier_user = User {
            id: "usr_cashier_01".to_string(),
            name: "Counter Cashier 1".to_string(),
            username: "cashier1".to_string(),
            login_key_hash: cashier_hash,
            pin_hash: Some(cashier_pin_hash),
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

        map.insert(admin_user.id.clone(), admin_user);
        map.insert(cashier_user.id.clone(), cashier_user);

        Self {
            users: Arc::new(RwLock::new(map)),
        }
    }

    pub async fn find_by_id(&self, id: &str) -> AppResult<Option<User>> {
        let map = self.users.read().await;
        Ok(map.get(id).cloned())
    }

    pub async fn find_by_username(&self, username: &str) -> AppResult<Option<User>> {
        let map = self.users.read().await;
        let lower = username.trim().to_lowercase();
        Ok(map
            .values()
            .find(|u| u.username.to_lowercase() == lower)
            .cloned())
    }

    pub async fn save(&self, user: User) -> AppResult<()> {
        let mut map = self.users.write().await;
        map.insert(user.id.clone(), user);
        Ok(())
    }

    pub async fn list_all(&self) -> AppResult<Vec<User>> {
        let map = self.users.read().await;
        Ok(map.values().cloned().collect())
    }

    pub async fn delete(&self, id: &str) -> AppResult<()> {
        let mut map = self.users.write().await;
        if map.remove(id).is_some() {
            Ok(())
        } else {
            Err(AppError::NotFound(format!("User with id '{id}' not found")))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_in_memory_user_crud() {
        let repo = InMemoryUserRepository::new();

        // Allow spawn task to settle
        tokio::time::sleep(tokio::time::Duration::from_millis(10)).await;

        let admin = repo.find_by_username("admin").await.unwrap();
        assert!(admin.is_some());
        assert_eq!(admin.unwrap().role, UserRole::Admin);

        let cashier = repo.find_by_username("cashier1").await.unwrap();
        assert!(cashier.is_some());
        assert_eq!(cashier.unwrap().role, UserRole::Cashier);
    }
}
