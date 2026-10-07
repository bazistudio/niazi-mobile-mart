use argon2::{
    password_hash::{
        rand_core::OsRng,
        PasswordHash, PasswordHasher, PasswordVerifier, SaltString,
    },
    Argon2,
};
use crate::errors::{AppError, AppResult};

/// Hashes a credential (login key or PIN) using Argon2id with random OS salt
pub fn hash_credential(secret: &str) -> AppResult<String> {
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();

    argon2
        .hash_password(secret.as_bytes(), &salt)
        .map(|hash| hash.to_string())
        .map_err(|e| AppError::Internal(format!("Failed to hash credential: {e}")))
}

/// Verifies a plaintext credential against an Argon2id hash string
pub fn verify_credential(secret: &str, hash_str: &str) -> bool {
    let parsed_hash = match PasswordHash::new(hash_str) {
        Ok(h) => h,
        Err(_) => return false,
    };

    Argon2::default()
        .verify_password(secret.as_bytes(), &parsed_hash)
        .is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hash_and_verify_success() {
        let password = "SecretPassword123!";
        let hash = hash_credential(password).expect("Hashing should succeed");
        assert!(hash.starts_with("$argon2id$"));
        assert!(verify_credential(password, &hash));
        assert!(!verify_credential("WrongPassword", &hash));
    }

    #[test]
    fn test_pin_hash_and_verify() {
        let pin = "1234";
        let hash = hash_credential(pin).expect("PIN hashing should succeed");
        assert!(verify_credential("1234", &hash));
        assert!(!verify_credential("9999", &hash));
    }
}
