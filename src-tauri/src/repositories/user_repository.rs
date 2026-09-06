use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

use crate::domain::user::User;
use crate::errors::{AppError, AppResult};

/// Thread-safe in-memory user repository implementing the data boundary for Phase 5
#[derive(Clone)]
pub struct InMemoryUserRepository {
    users: Arc<RwLock<HashMap<String, User>>>,
}

impl InMemoryUserRepository {
    /// Creates an empty in-memory repository with zero default accounts
    pub fn new() -> Self {
        Self {
            users: Arc::new(RwLock::new(HashMap::new())),
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
    use crate::domain::access_control::StaffAccessProfile;
    use crate::domain::user::{UserRole, UserStatus};

    #[tokio::test]
    async fn test_in_memory_user_crud() {
        let repo = InMemoryUserRepository::new();
        assert!(repo.find_by_username("admin").await.unwrap().is_none());

        let user = User {
            id: "usr_test_1".to_string(),
            name: "Test Admin".to_string(),
            username: "admin".to_string(),
            login_key_hash: "hash".to_string(),
            pin_hash: None,
            role: UserRole::Admin,
            status: UserStatus::Active,
            is_active: true,
            recovery_key_hash: None,
            must_change_password: false,
            access_profile: StaffAccessProfile::admin_unlimited(),
            failed_pin_attempts: 0,
            pin_locked_until_ms: None,
            failed_login_attempts: 0,
            login_locked_until_ms: None,
            created_at: "2026-01-01T00:00:00Z".to_string(),
            updated_at: "2026-01-01T00:00:00Z".to_string(),
        };
        repo.save(user).await.unwrap();

        let found = repo.find_by_username("admin").await.unwrap();
        assert!(found.is_some());
        assert_eq!(found.unwrap().role, UserRole::Admin);
    }
}
