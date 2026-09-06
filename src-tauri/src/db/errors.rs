use thiserror::Error;
use crate::errors::AppError;

#[derive(Debug, Error)]
pub enum DbError {
    #[error("Database connection error: {0}")]
    ConnectionError(String),

    #[error("Migration error: {0}")]
    MigrationError(String),

    #[error("Query execution error: {0}")]
    QueryError(String),

    #[error("Database constraint violation: {0}")]
    ConstraintViolation(String),

    #[error("Entity not found: {0}")]
    NotFound(String),

    #[error("Transaction error: {0}")]
    TransactionError(String),

    #[error("Database is busy or locked: {0}")]
    DatabaseLocked(String),

    #[error("Validation error: {0}")]
    ValidationError(String),
}

impl From<rusqlite::Error> for DbError {
    fn from(err: rusqlite::Error) -> Self {
        match &err {
            rusqlite::Error::SqliteFailure(ffi_err, msg) => {
                let code = ffi_err.code;
                let extended = ffi_err.extended_code;
                let details = msg.as_deref().unwrap_or("no details");

                // SQLITE_BUSY = 5, SQLITE_LOCKED = 6
                if code == rusqlite::ErrorCode::DatabaseBusy || code == rusqlite::ErrorCode::DatabaseLocked {
                    DbError::DatabaseLocked(format!("Database busy ({extended}): {details}"))
                } else if code == rusqlite::ErrorCode::ConstraintViolation {
                    DbError::ConstraintViolation(format!("Constraint violation ({extended}): {details}"))
                } else {
                    DbError::QueryError(format!("SQLite error ({code:?}/{extended}): {details}"))
                }
            }
            rusqlite::Error::QueryReturnedNoRows => DbError::NotFound("No rows returned".to_string()),
            _ => DbError::QueryError(err.to_string()),
        }
    }
}

impl From<DbError> for AppError {
    fn from(err: DbError) -> Self {
        match err {
            DbError::NotFound(msg) => AppError::NotFound(msg),
            DbError::ConstraintViolation(msg) => AppError::Conflict(msg),
            DbError::DatabaseLocked(msg) => AppError::Locked(msg),
            DbError::ValidationError(msg) => AppError::Validation(msg),
            DbError::ConnectionError(msg)
            | DbError::MigrationError(msg)
            | DbError::QueryError(msg)
            | DbError::TransactionError(msg) => AppError::Database(msg),
        }
    }
}

pub type DbResult<T> = Result<T, DbError>;
