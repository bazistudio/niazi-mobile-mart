use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use std::collections::HashMap;
use tokio::sync::RwLock;

use crate::domain::identity::RequestIdentity;
use crate::domain::user::SanitizedUser;
use crate::errors::{AppError, AppResult};

fn current_time_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}

/// Token payload storing identity string and creation timestamp
#[derive(Debug, Clone)]
pub struct AuthToken {
    pub token: String,
    pub user_id: String,
    pub created_at_ms: u128,
}

/// In-memory token manager resolving Bearer tokens to RequestIdentity
#[derive(Clone, Debug)]
pub struct TokenManager {
    tokens: Arc<RwLock<HashMap<String, (SanitizedUser, u128)>>>,
}

impl Default for TokenManager {
    fn default() -> Self {
        Self::new()
    }
}

impl TokenManager {
    pub fn new() -> Self {
        Self {
            tokens: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Generates a secure Bearer token for an authenticated user
    pub async fn create_token(&self, user: SanitizedUser) -> String {
        let token = format!("nzm_{}_{}", user.id, uuid::Uuid::new_v4());
        let now = current_time_ms();
        let mut map = self.tokens.write().await;
        map.insert(token.clone(), (user, now));
        token
    }

    /// Resolves a Bearer token to a canonical RequestIdentity.
    /// Returns AppError::Unauthorized if token is invalid or expired.
    pub async fn resolve_identity(&self, token: &str) -> AppResult<RequestIdentity> {
        let clean_token = token.trim().strip_prefix("Bearer ").unwrap_or(token).trim();

        if clean_token.is_empty() {
            return Err(AppError::Unauthorized(
                "Missing or empty authorization token".to_string(),
            ));
        }

        let map = self.tokens.read().await;
        let (user, created_at) = map.get(clean_token).ok_or_else(|| {
            AppError::Unauthorized("Invalid or expired authentication token".to_string())
        })?;

        // 24-hour token expiration safety check
        let now = current_time_ms();
        if now.saturating_sub(*created_at) > (24 * 60 * 60 * 1000) {
            return Err(AppError::Unauthorized(
                "Authentication token expired. Please log in again.".to_string(),
            ));
        }

        Ok(RequestIdentity::from_user(user, now))
    }

    /// Revokes a Bearer token on logout
    pub async fn revoke_token(&self, token: &str) -> AppResult<()> {
        let clean_token = token.trim().strip_prefix("Bearer ").unwrap_or(token).trim();
        let mut map = self.tokens.write().await;
        map.remove(clean_token);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::access_control::StaffAccessProfile;
    use crate::domain::user::{UserRole, UserStatus};

    #[tokio::test]
    async fn test_token_creation_resolution_and_revocation() {
        let tm = TokenManager::new();
        let user = SanitizedUser {
            id: "usr_token_test".to_string(),
            name: "Token User".to_string(),
            username: "tokenuser".to_string(),
            role: UserRole::Cashier,
            status: UserStatus::Active,
            is_active: true,
            must_change_password: false,
            has_pin: false,
            access_profile: StaffAccessProfile::cashier_default(),
            created_at: "2026-01-01T00:00:00Z".to_string(),
        };

        // 1. Create token
        let token = tm.create_token(user).await;
        assert!(!token.is_empty());

        // 2. Resolve identity with Bearer prefix
        let bearer_header = format!("Bearer {token}");
        let identity = tm.resolve_identity(&bearer_header).await.unwrap();
        assert_eq!(identity.user_id, "usr_token_test");
        assert_eq!(identity.role, UserRole::Cashier);

        // 3. Unauthenticated / Bad Token → 401 Unauthorized equivalent error
        let bad_res = tm.resolve_identity("Bearer invalid_token").await;
        assert!(bad_res.is_err());

        // 4. Revoke token on logout
        tm.revoke_token(&token).await.unwrap();
        let revoked_res = tm.resolve_identity(&token).await;
        assert!(revoked_res.is_err());
    }
}
