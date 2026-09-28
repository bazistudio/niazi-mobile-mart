use std::time::{SystemTime, UNIX_EPOCH};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};

use crate::domain::access_control::StaffAccessProfile;
use crate::domain::identity::RequestIdentity;
use crate::domain::organization::NIAZI_ORGANIZATION_ID;
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

/// Production JWT **public** verification key, embedded at build time.
///
/// Only the public key is shipped with the desktop app. The private signing key lives
/// exclusively in Google Secret Manager (`JWT_PRIVATE_KEY`) and is read by the Cloud Run
/// server at startup. If this file does not contain a PEM public key, central tokens are
/// rejected (fail closed).
const EMBEDDED_JWT_PUBLIC_KEY: &str = include_str!("jwt_public_key.pem");

/// Returns the embedded public key if the file actually contains a PEM public key.
fn embedded_public_key() -> Option<String> {
    if EMBEDDED_JWT_PUBLIC_KEY.contains("-----BEGIN PUBLIC KEY-----") {
        Some(EMBEDDED_JWT_PUBLIC_KEY.trim().to_string())
    } else {
        None
    }
}

fn non_empty_env(name: &str) -> Option<String> {
    std::env::var(name).ok().filter(|v| !v.trim().is_empty())
}

/// Stateless JWT token manager resolving Bearer tokens to RequestIdentity.
/// Uses RS256 signature verification.
/// Does NOT rely on any in-memory token/session map.
#[derive(Clone, Debug)]
pub struct TokenManager {
    private_key: Option<String>,
    public_key: String,
}

impl Default for TokenManager {
    fn default() -> Self {
        Self::new()
    }
}

impl TokenManager {
    /// Creates a TokenManager from the environment.
    ///
    /// - Private key: only from `JWT_PRIVATE_KEY` (server). There is **no** embedded fallback,
    ///   so desktop builds cannot sign tokens.
    /// - Public key: `JWT_PUBLIC_KEY` if set, otherwise the embedded production public key.
    ///   If neither is available, verification fails closed.
    pub fn new() -> Self {
        let private_key = non_empty_env("JWT_PRIVATE_KEY");
        let public_key = non_empty_env("JWT_PUBLIC_KEY")
            .or_else(embedded_public_key)
            .unwrap_or_default();

        #[cfg(test)]
        {
            if private_key.is_none() && public_key.is_empty() {
                let (test_private, test_public) = test_keys::key_pair();
                return Self {
                    private_key: Some(test_private),
                    public_key: test_public,
                };
            }
        }

        Self { private_key, public_key }
    }

    /// True when this manager holds a private key and can sign tokens (server only).
    pub fn can_sign(&self) -> bool {
        self.private_key.is_some()
    }

    /// Creates a TokenManager with explicit RSA PEM string keys.
    pub fn with_keys(private_key: Option<String>, public_key: String) -> Self {
        Self {
            private_key,
            public_key,
        }
    }

    /// Generates a signed JWT Bearer token for an authenticated user.
    /// Default token expiration is set to 24 hours (86,400 seconds).
    pub async fn create_token(&self, user: SanitizedUser) -> String {
        self.create_token_with_branch(user, None).await
    }

    /// Generates a signed JWT Bearer token for an authenticated user with branch context.
    pub async fn create_token_with_branch(&self, user: SanitizedUser, branch_id: Option<String>) -> String {
        let now = current_time_secs();
        let exp = now + 86400; // 24 hours validity

        let claims = Claims {
            sub: user.id.clone(),
            username: user.username.clone(),
            role: user.role,
            access_profile: user.access_profile.clone(),
            branch_id,
            iat: now,
            exp,
        };

        encode(
            &Header::new(jsonwebtoken::Algorithm::RS256),
            &claims,
            &EncodingKey::from_rsa_pem(self.private_key.as_ref().expect("Private key missing").as_bytes()).unwrap(),
        )
        .expect("JWT encoding should not fail with valid secret and claims")
    }

    /// Resolves a Bearer token to a canonical RequestIdentity via stateless JWT verification.
    /// Verifies RS256 signature and expiration claims.
    /// Returns AppError::Unauthorized if token signature is invalid, token is expired, or token is malformed.
    pub async fn resolve_identity(&self, token: &str) -> AppResult<RequestIdentity> {
        let clean_token = token.trim().strip_prefix("Bearer ").unwrap_or(token).trim();

        if clean_token.is_empty() {
            return Err(AppError::Unauthorized(
                "Missing or empty authorization token".to_string(),
            ));
        }

        if self.public_key.trim().is_empty() {
            return Err(AppError::Unauthorized(
                "JWT verification key is not configured in this build".to_string(),
            ));
        }

        let decoding_key = DecodingKey::from_rsa_pem(self.public_key.as_bytes()).map_err(|_| AppError::Unauthorized("Invalid public key configuration".to_string()))?;
        let validation = Validation::new(jsonwebtoken::Algorithm::RS256);

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
            organization_id: NIAZI_ORGANIZATION_ID.to_string(),
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

/// Test-only RSA key pair, generated fresh per test run. Never compiled into release builds.
#[cfg(test)]
pub(crate) mod test_keys {
    use rsa::pkcs8::{EncodePrivateKey, EncodePublicKey, LineEnding};
    use std::sync::OnceLock;

    static KEYS: OnceLock<(String, String)> = OnceLock::new();

    pub fn key_pair() -> (String, String) {
        KEYS.get_or_init(|| {
            let mut rng = argon2::password_hash::rand_core::OsRng;
            let private = rsa::RsaPrivateKey::new(&mut rng, 2048).expect("test RSA key generation");
            let public = rsa::RsaPublicKey::from(&private);
            let private_pem = private
                .to_pkcs8_pem(LineEnding::LF)
                .expect("test private key PEM")
                .to_string();
            let public_pem = public
                .to_public_key_pem(LineEnding::LF)
                .expect("test public key PEM");
            (private_pem, public_pem)
        })
        .clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_no_private_key_material_embedded() {
        let source = include_str!("token_service.rs");
        let marker = ["BEGIN", "PRIVATE", "KEY"].join(" ");
        assert!(!source.contains(&marker), "token_service.rs must not embed a private key");
        let embedded = include_str!("jwt_public_key.pem");
        assert!(!embedded.contains("PRIVATE"), "embedded key file must hold a public key only");
    }

    #[test]
    fn test_manager_without_private_key_cannot_sign() {
        let (_, public) = test_keys::key_pair();
        let manager = TokenManager::with_keys(None, public);
        assert!(!manager.can_sign());
    }

    #[tokio::test]
    async fn test_empty_public_key_fails_closed() {
        let manager = TokenManager::with_keys(None, String::new());
        let result = manager.resolve_identity("abc.def.ghi").await;
        assert!(matches!(result, Err(AppError::Unauthorized(_))));
    }

    #[tokio::test]
    async fn test_token_signed_by_other_key_is_rejected() {
        let (private_a, public_a) = test_keys::key_pair();
        let signer = TokenManager::with_keys(Some(private_a), public_a);
        let user = crate::domain::user::SanitizedUser {
            id: "u-1".to_string(),
            name: "Tester".to_string(),
            username: "tester".to_string(),
            role: UserRole::Cashier,
            status: crate::domain::user::UserStatus::Active,
            is_active: true,
            must_change_password: false,
            has_pin: false,
            access_profile: StaffAccessProfile::public_user_restricted(),
            created_at: "2026-01-01T00:00:00Z".to_string(),
        };
        let token = signer.create_token(user).await;
        assert!(signer.resolve_identity(&token).await.is_ok());

        // A verifier holding a different public key must reject the token.
        let mut rng = argon2::password_hash::rand_core::OsRng;
        let other = rsa::RsaPrivateKey::new(&mut rng, 2048).unwrap();
        let other_public = {
            use rsa::pkcs8::{EncodePublicKey, LineEnding};
            rsa::RsaPublicKey::from(&other).to_public_key_pem(LineEnding::LF).unwrap()
        };
        let verifier = TokenManager::with_keys(None, other_public);
        assert!(matches!(verifier.resolve_identity(&token).await, Err(AppError::Unauthorized(_))));
    }
}

