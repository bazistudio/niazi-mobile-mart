use serde::{Serialize, Serializer};
use thiserror::Error;

/// Centralized application error model for Niazi Mobile Mart
#[derive(Debug, Error)]
pub enum AppError {
    #[error("Validation error: {0}")]
    Validation(String),

    #[error("Resource not found: {0}")]
    NotFound(String),

    #[error("Unauthorized: {0}")]
    Unauthorized(String),

    #[error("Forbidden: {0}")]
    Forbidden(String),

    #[error("Conflict: {0}")]
    Conflict(String),

    #[error("Database error: {0}")]
    Database(String),

    #[error("Internal application error: {0}")]
    Internal(String),
}

#[derive(Serialize)]
struct ErrorPayload<'a> {
    error_type: &'a str,
    message: &'a str,
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let (error_type, message) = match self {
            AppError::Validation(msg) => ("VALIDATION_ERROR", msg.as_str()),
            AppError::NotFound(msg) => ("NOT_FOUND", msg.as_str()),
            AppError::Unauthorized(msg) => ("UNAUTHORIZED", msg.as_str()),
            AppError::Forbidden(msg) => ("FORBIDDEN", msg.as_str()),
            AppError::Conflict(msg) => ("CONFLICT", msg.as_str()),
            AppError::Database(msg) => ("DATABASE_ERROR", msg.as_str()),
            AppError::Internal(msg) => ("INTERNAL_ERROR", msg.as_str()),
        };

        ErrorPayload {
            error_type,
            message,
        }
        .serialize(serializer)
    }
}

pub type AppResult<T> = Result<T, AppError>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_serialization() {
        let err = AppError::NotFound("Product not found with ID 100".to_string());
        let json = serde_json::to_string(&err).unwrap();
        assert!(json.contains("NOT_FOUND"));
        assert!(json.contains("Product not found with ID 100"));

        let val_err = AppError::Validation("Invalid price".to_string());
        let val_json = serde_json::to_string(&val_err).unwrap();
        assert!(val_json.contains("VALIDATION_ERROR"));
    }
}
