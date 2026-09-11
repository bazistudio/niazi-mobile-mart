use std::time::{SystemTime, UNIX_EPOCH};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};

use crate::domain::access_control::StaffAccessProfile;
use crate::domain::identity::RequestIdentity;
use crate::domain::user::{SanitizedUser, UserRole};
use crate::errors::{AppError, AppResult};

fn current_time_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

/// JWT Claims payload encoded into signed Bearer tokens.
/// Stateless design: contains full user identity and access profile required to construct RequestIdentity.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,                        // User ID
    pub username: String,                   // Username
    pub role: UserRole,                     // User Role
    pub access_profile: StaffAccessProfile, // Staff Access Profile
    pub branch_id: Option<String>,          // Assigned Branch ID
    pub iat: u64,                           // Issued at (seconds since epoch)
    pub exp: u64,                           // Expiration time (seconds since epoch)
}

/// Stateless JWT token manager resolving Bearer tokens to RequestIdentity.
/// Uses HMAC-SHA256 (HS256) signature verification with JWT_SECRET.
/// Does NOT rely on any in-memory token/session map.
#[derive(Clone, Debug)]
pub struct TokenManager {
    jwt_secret: String,
}

impl Default for TokenManager {
    fn default() -> Self {
        Self::new()
    }
}

impl TokenManager {
    /// Creates a TokenManager resolving JWT_SECRET from environment or falling back to a dev secret.
    pub fn new() -> Self {
        let secret = std::env::var("JWT_SECRET")
            .unwrap_or_else(|_| "niazi_dev_jwt_secret_change_in_production_2026".to_string());
        Self::with_secret(secret)
    }

    /// Creates a TokenManager with an explicit JWT secret string.
    pub fn with_secret(secret: impl Into<String>) -> Self {
        Self {
            jwt_secret: secret.into(),
        }
    }

    /// Generates a signed JWT Bearer token for an authenticated user.
    /// Default token expiration is set to 24 hours (86,400 seconds).
    pub async fn create_token(&self, user: SanitizedUser) -> String {
        let now = current_time_secs();
        let exp = now + 86400; // 24 hours validity

        let claims = Claims {
            sub: user.id.clone(),
            username: user.username.clone(),
            role: user.role,
            access_profile: user.access_profile.clone(),
            branch_id: None,
            iat: now,
            exp,
        };

        encode(
            &Header::default(),
            &claims,
            &EncodingKey::from_secret(self.jwt_secret.as_bytes()),
        )
        .expect("JWT encoding should not fail with valid secret and claims")
    }

    /// Resolves a Bearer token to a canonical RequestIdentity via stateless JWT verification.
    /// Verifies HMAC-SHA256 signature and expiration claims.
    /// Returns AppError::Unauthorized if token signature is invalid, token is expired, or token is malformed.
    pub async fn resolve_identity(&self, token: &str) -> AppResult<RequestIdentity> {
        let clean_token = token.trim().strip_prefix("Bearer ").unwrap_or(token).trim();

        if clean_token.is_empty() {
            return Err(AppError::Unauthorized(
                "Missing or empty authorization token".to_string(),
            ));
        }

        let decoding_key = DecodingKey::from_secret(self.jwt_secret.as_bytes());
        let validation = Validation::default();

        let token_data = decode::<Claims>(clean_token, &decoding_key, &validation).map_err(|e| {
            use jsonwebtoken::errors::ErrorKind;
            match e.kind() {
                ErrorKind::ExpiredSignature => {
                    AppError::Unauthorized("Authentication token expired. Please log in again.".to_string())
                }
                _ => AppError::Unauthorized("Invalid or corrupted authentication token".to_string()),
            }
        })?;

        let claims = token_data.claims;

        Ok(RequestIdentity {
            user_id: claims.sub,
            username: claims.username,
            role: claims.role,
            organization_id: "00000000-0000-0000-0000-000000000001".to_string(),
            branch_id: claims.branch_id,
            access_profile: claims.access_profile,
            authenticated_at_ms: (claims.iat as u128) * 1000,
        })
    }

    /// Revokes a Bearer token on logout.
    /// Stateless JWT authentication does not maintain server-side token state;
    /// client discards the token upon logout.
    pub async fn revoke_token(&self, token: &str) -> AppResult<()> {
        let _clean_token = token.trim().strip_prefix("Bearer ").unwrap_or(token).trim();
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::access_control::StaffAccessProfile;
    use crate::domain::user::{UserRole, UserStatus};

    fn make_test_user() -> SanitizedUser {
        SanitizedUser {
            id: "usr_jwt_test_01".to_string(),
            name: "JWT Staff".to_string(),
            username: "jwtstaff".to_string(),
            role: UserRole::Cashier,
            status: UserStatus::Active,
            is_active: true,
            must_change_password: false,
            has_pin: false,
            access_profile: StaffAccessProfile::cashier_default(),
            created_at: "2026-01-01T00:00:00Z".to_string(),
        }
    }

    #[tokio::test]
    async fn test_stateless_jwt_creation_and_resolution() {
        let tm = TokenManager::with_secret("test_jwt_secret_key_12345");
        let user = make_test_user();

        // 1. Create JWT token
        let token = tm.create_token(user).await;
        assert!(!token.is_empty());

        // 2. Resolve identity with Bearer header format
        let bearer_header = format!("Bearer {token}");
        let identity = tm.resolve_identity(&bearer_header).await.unwrap();
        assert_eq!(identity.user_id, "usr_jwt_test_01");
        assert_eq!(identity.username, "jwtstaff");
        assert_eq!(identity.role, UserRole::Cashier);
        assert_eq!(identity.organization_id, "00000000-0000-0000-0000-000000000001");
    }

    #[tokio::test]
    async fn test_invalid_signature_rejection() {
        let tm_signer = TokenManager::with_secret("secret_alpha_123");
        let tm_verifier = TokenManager::with_secret("secret_beta_999"); // Wrong secret

        let user = make_test_user();
        let token = tm_signer.create_token(user).await;

        // Verification with wrong secret must fail with 401 Unauthorized
        let res = tm_verifier.resolve_identity(&token).await;
        assert!(res.is_err());
        assert!(res.unwrap_err().to_string().contains("Invalid or corrupted authentication token"));
    }

    #[tokio::test]
    async fn test_expired_token_rejection() {
        let secret = "test_expired_secret_key";
        let tm = TokenManager::with_secret(secret);

        // Manually construct an expired JWT claims payload (exp in the past)
        let past_time = current_time_secs() - 1000;
        let claims = Claims {
            sub: "usr_expired".to_string(),
            username: "expireduser".to_string(),
            role: UserRole::Cashier,
            access_profile: StaffAccessProfile::cashier_default(),
            branch_id: None,
            iat: past_time - 3600,
            exp: past_time, // expired!
        };

        let expired_token = encode(
            &Header::default(),
            &claims,
            &EncodingKey::from_secret(secret.as_bytes()),
        )
        .unwrap();

        let res = tm.resolve_identity(&expired_token).await;
        assert!(res.is_err());
        assert!(res.unwrap_err().to_string().contains("Authentication token expired"));
    }

    #[tokio::test]
    async fn test_malformed_and_empty_token_rejection() {
        let tm = TokenManager::with_secret("test_secret");

        let empty_res = tm.resolve_identity("").await;
        assert!(empty_res.is_err());

        let malformed_res = tm.resolve_identity("Bearer not_a_real_jwt_token_string").await;
        assert!(malformed_res.is_err());
    }

    #[tokio::test]
    async fn test_cross_instance_stateless_verification() {
        let secret = "shared_cluster_jwt_secret_key_888";

        // Instance 1 issues JWT token
        let instance_1 = TokenManager::with_secret(secret);
        let user = make_test_user();
        let jwt_token = instance_1.create_token(user).await;

        // Instance 2 (completely separate struct instance, simulating another Cloud Run instance)
        let instance_2 = TokenManager::with_secret(secret);
        let identity = instance_2.resolve_identity(&jwt_token).await.expect("Instance 2 must verify stateless JWT");

        assert_eq!(identity.user_id, "usr_jwt_test_01");
        assert_eq!(identity.username, "jwtstaff");
    }
}
