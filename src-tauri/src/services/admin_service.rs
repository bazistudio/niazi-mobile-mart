use chrono::Utc;
use serde::Deserialize;
use uuid::Uuid;

use crate::domain::access_control::StaffAccessProfile;
use crate::domain::user::{SanitizedUser, User, UserRole};
use crate::errors::{AppError, AppResult};
use crate::repositories::InMemoryUserRepository;
use crate::services::hasher::hash_credential;
use crate::state::AppState;

#[derive(Debug, Deserialize)]
pub struct CreateUserPayload {
    pub name: String,
    pub username: String,
    pub login_key: String,
    pub pin: Option<String>,
    pub role: UserRole,
    pub access_profile: Option<StaffAccessProfile>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateUserPayload {
    pub user_id: String,
    pub name: Option<String>,
    pub role: Option<UserRole>,
    pub is_active: Option<bool>,
    pub access_profile: Option<StaffAccessProfile>,
}

#[derive(Debug, Deserialize)]
pub struct ResetCredentialsPayload {
    pub user_id: String,
    pub new_login_key: Option<String>,
    pub new_pin: Option<String>,
}

pub struct AdminService;

impl AdminService {
    /// Verifies that the active caller has the Admin role
    pub async fn ensure_admin(app_state: &AppState) -> AppResult<()> {
        let session = app_state.get_session().await;
        if !session.is_authenticated {
            return Err(AppError::Unauthorized(
                "Authentication required for administrative actions".to_string(),
            ));
        }

        if session.role != Some(UserRole::Admin) {
            return Err(AppError::Forbidden(
                "Access denied: Administrative privileges required".to_string(),
            ));
        }

        Ok(())
    }

    /// Lists all staff accounts (sanitized view)
    pub async fn list_users(
        repo: &InMemoryUserRepository,
        app_state: &AppState,
    ) -> AppResult<Vec<SanitizedUser>> {
        Self::ensure_admin(app_state).await?;
        let users = repo.list_all().await?;
        Ok(users.into_iter().map(|u| u.sanitize()).collect())
    }

    /// Creates a new staff member account with Argon2id hashed credentials
    pub async fn create_user(
        repo: &InMemoryUserRepository,
        app_state: &AppState,
        payload: CreateUserPayload,
    ) -> AppResult<SanitizedUser> {
        Self::ensure_admin(app_state).await?;

        let clean_username = payload.username.trim().to_lowercase();
        if clean_username.is_empty() {
            return Err(AppError::Validation("Username is required".to_string()));
        }

        if payload.login_key.trim().len() < 6 {
            return Err(AppError::Validation(
                "Login key must be at least 6 characters long".to_string(),
            ));
        }

        if repo.find_by_username(&clean_username).await?.is_some() {
            return Err(AppError::Conflict(format!(
                "Staff account with username '{clean_username}' already exists"
            )));
        }

        let login_key_hash = hash_credential(&payload.login_key)?;
        let pin_hash = if let Some(pin) = payload.pin.filter(|p| !p.trim().is_empty()) {
            if pin.trim().len() != 4 || !pin.chars().all(|c| c.is_ascii_digit()) {
                return Err(AppError::Validation(
                    "Staff PIN must be exactly 4 digits".to_string(),
                ));
            }
            Some(hash_credential(pin.trim())?)
        } else {
            None
        };

        let profile = payload.access_profile.unwrap_or_else(|| match payload.role {
            UserRole::Admin => StaffAccessProfile::admin_unlimited(),
            UserRole::Manager => StaffAccessProfile::manager_default(),
            UserRole::Cashier => StaffAccessProfile::cashier_default(),
            UserRole::Staff => StaffAccessProfile::staff_default(),
        });

        let now = Utc::now().to_rfc3339();
        let new_user = User {
            id: format!("usr_{}", Uuid::new_v4().simple()),
            name: payload.name.trim().to_string(),
            username: clean_username,
            login_key_hash,
            pin_hash,
            role: payload.role,
            is_active: true,
            access_profile: profile,
            failed_pin_attempts: 0,
            pin_locked_until_ms: None,
            failed_login_attempts: 0,
            login_locked_until_ms: None,
            created_at: now.clone(),
            updated_at: now,
        };

        let sanitized = new_user.sanitize();
        repo.save(new_user).await?;
        Ok(sanitized)
    }

    /// Updates staff member properties and access profile
    pub async fn update_user(
        repo: &InMemoryUserRepository,
        app_state: &AppState,
        payload: UpdateUserPayload,
    ) -> AppResult<SanitizedUser> {
        Self::ensure_admin(app_state).await?;

        let mut user = match repo.find_by_id(&payload.user_id).await? {
            Some(u) => u,
            None => {
                return Err(AppError::NotFound(format!(
                    "Staff member with ID '{}' not found",
                    payload.user_id
                )))
            }
        };

        if let Some(name) = payload.name {
            user.name = name.trim().to_string();
        }

        if let Some(role) = payload.role {
            user.role = role;
        }

        if let Some(is_active) = payload.is_active {
            user.is_active = is_active;
        }

        if let Some(profile) = payload.access_profile {
            user.access_profile = profile;
        }

        user.updated_at = Utc::now().to_rfc3339();
        let sanitized = user.sanitize();
        repo.save(user).await?;
        Ok(sanitized)
    }

    /// Resets staff login key or PIN
    pub async fn reset_credentials(
        repo: &InMemoryUserRepository,
        app_state: &AppState,
        payload: ResetCredentialsPayload,
    ) -> AppResult<()> {
        Self::ensure_admin(app_state).await?;

        let mut user = match repo.find_by_id(&payload.user_id).await? {
            Some(u) => u,
            None => {
                return Err(AppError::NotFound(format!(
                    "Staff member with ID '{}' not found",
                    payload.user_id
                )))
            }
        };

        if let Some(new_key) = payload.new_login_key {
            if new_key.trim().len() < 6 {
                return Err(AppError::Validation(
                    "New login key must be at least 6 characters long".to_string(),
                ));
            }
            user.login_key_hash = hash_credential(&new_key)?;
            user.failed_login_attempts = 0;
            user.login_locked_until_ms = None;
        }

        if let Some(new_pin) = payload.new_pin {
            let clean = new_pin.trim();
            if clean.len() != 4 || !clean.chars().all(|c| c.is_ascii_digit()) {
                return Err(AppError::Validation(
                    "New PIN must be exactly 4 digits".to_string(),
                ));
            }
            user.pin_hash = Some(hash_credential(clean)?);
            user.failed_pin_attempts = 0;
            user.pin_locked_until_ms = None;
        }

        user.updated_at = Utc::now().to_rfc3339();
        repo.save(user).await?;
        Ok(())
    }

    /// Emergency Administrator credential recovery mechanism
    pub async fn recover_admin_access(
        repo: &InMemoryUserRepository,
        recovery_token: &str,
        new_login_key: &str,
    ) -> AppResult<()> {
        let expected_token = std::env::var("NIAZI_ADMIN_RECOVERY_KEY")
            .unwrap_or_else(|_| "NiaziMart_Secure_Recovery_Token_2026!".to_string());

        if recovery_token != expected_token {
            return Err(AppError::Forbidden(
                "Invalid recovery token. Emergency recovery rejected.".to_string(),
            ));
        }

        if new_login_key.trim().len() < 6 {
            return Err(AppError::Validation(
                "New administrator login key must be at least 6 characters".to_string(),
            ));
        }

        let admin_user = repo.find_by_username("admin").await?;
        let mut admin = match admin_user {
            Some(u) => u,
            None => {
                return Err(AppError::NotFound(
                    "Default administrator account not found in repository".to_string(),
                ))
            }
        };

        admin.login_key_hash = hash_credential(new_login_key)?;
        admin.failed_login_attempts = 0;
        admin.login_locked_until_ms = None;
        admin.is_active = true;
        admin.updated_at = Utc::now().to_rfc3339();

        repo.save(admin).await?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_admin_user_management_lifecycle() {
        let state = AppState::new("5.0.3");
        let repo = &state.user_repo;

        // Login as admin first
        crate::services::auth_service::AuthService::login(
            repo,
            &state,
            "admin",
            "Admin@Niazi2025!",
        )
        .await
        .unwrap();

        // 1. Create a new user
        let new_user = AdminService::create_user(
            repo,
            &state,
            CreateUserPayload {
                name: "New Cashier".to_string(),
                username: "cashier_test".to_string(),
                login_key: "CashierSecret123".to_string(),
                pin: Some("5678".to_string()),
                role: UserRole::Cashier,
                access_profile: None,
            },
        )
        .await
        .expect("Creation should succeed");

        assert_eq!(new_user.username, "cashier_test");
        assert!(new_user.has_pin);

        // 2. List users
        let list = AdminService::list_users(repo, &state).await.unwrap();
        assert!(list.iter().any(|u| u.username == "cashier_test"));

        // 3. Reset credentials
        AdminService::reset_credentials(
            repo,
            &state,
            ResetCredentialsPayload {
                user_id: new_user.id.clone(),
                new_login_key: Some("NewSecret456".to_string()),
                new_pin: Some("9999".to_string()),
            },
        )
        .await
        .unwrap();

        // 4. Verify login with new credentials
        let logout_state = AppState::new("5.0.3");
        let login_res = crate::services::auth_service::AuthService::login(
            repo,
            &logout_state,
            "cashier_test",
            "NewSecret456",
        )
        .await;
        assert!(login_res.is_ok());
    }
}
