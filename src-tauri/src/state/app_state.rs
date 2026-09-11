use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;

use crate::db::connection::DatabaseConnection;
use crate::domain::access_control::StaffAccessProfile;
use crate::domain::user::{User, UserRole};
use crate::repositories::{BranchRepository, SQLiteUserRepository};
use crate::services::{
    CashService, CatalogService, CustomerService, ExpenseService, InventoryService, ProductService,
    ProfitService, PurchaseReturnService, PurchaseService, SaleService, SalesReturnService, SupplierService,
};


/// Native application session context owned and strictly enforced by Rust
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SessionContext {
    pub is_authenticated: bool,
    pub is_locked: bool,
    pub user_id: Option<String>,
    pub username: Option<String>,
    pub role: Option<UserRole>,
    pub login_time_ms: Option<u128>,
    pub access_profile: Option<StaffAccessProfile>,
}

impl Default for SessionContext {
    fn default() -> Self {
        Self {
            is_authenticated: false,
            is_locked: false,
            user_id: None,
            username: None,
            role: None,
            login_time_ms: None,
            access_profile: None,
        }
    }
}

/// Global thread-safe application state managed by Tauri runtime
#[derive(Clone)]
pub struct AppState {
    pub app_version: String,
    pub session: Arc<RwLock<SessionContext>>,
    pub db: Option<DatabaseConnection>,
    /// PostgreSQL connection pool for Cloud Run / HTTP server mode.
    /// Set to `Some(pool)` by `server.rs` when `DATABASE_URL` is present.
    /// Always `None` in desktop Tauri mode.
    pub pg_pool: Option<sqlx::PgPool>,
    pub user_repo: UserRepository,
    pub branch_repo: BranchRepository,
    pub catalog_service: CatalogService,
    pub product_service: ProductService,
    pub inventory_service: InventoryService,
    pub customer_service: CustomerService,
    pub sale_service: SaleService,
    pub supplier_service: SupplierService,
    pub purchase_service: PurchaseService,
    pub expense_service: ExpenseService,
    pub cash_service: CashService,
    pub sales_return_service: SalesReturnService,
    pub purchase_return_service: PurchaseReturnService,
    pub profit_service: ProfitService,
    pub token_manager: crate::services::TokenManager,
    pub is_initialized: Arc<RwLock<bool>>,
}

impl AppState {
    /// Creates AppState with SQLite persistence backend (Desktop / Local mode)
    pub fn new_sqlite(app_version: impl Into<String>, db: DatabaseConnection) -> Self {
        let user_repo = UserRepository::SQLite(SQLiteUserRepository::new(db.clone()));
        let branch_repo = BranchRepository::SQLite(crate::repositories::SQLiteBranchRepository::new(db.clone()));
        let catalog_service = CatalogService::new_sqlite(db.clone());
        let product_service = ProductService::new_sqlite(db.clone());
        let inventory_service = InventoryService::new_sqlite(db.clone());
        let customer_service = CustomerService::new_sqlite(db.clone());
        let sale_service = SaleService::new_sqlite(db.clone());
        let supplier_service = SupplierService::new_sqlite(db.clone());
        let purchase_service = PurchaseService::new_sqlite(db.clone());
        let expense_service = ExpenseService::new_sqlite(db.clone());
        let cash_service = CashService::new_sqlite(db.clone());
        let sales_return_service = SalesReturnService::new_sqlite(db.clone());
        let purchase_return_service = PurchaseReturnService::new_sqlite(db.clone());
        let profit_service = ProfitService::new_sqlite(db.clone());

        Self {
            app_version: app_version.into(),
            session: Arc::new(RwLock::new(SessionContext::default())),
            db: Some(db),
            pg_pool: None,
            user_repo,
            branch_repo,
            catalog_service,
            product_service,
            inventory_service,
            customer_service,
            sale_service,
            supplier_service,
            purchase_service,
            expense_service,
            cash_service,
            sales_return_service,
            purchase_return_service,
            profit_service,
            token_manager: crate::services::TokenManager::new(),
            is_initialized: Arc::new(RwLock::new(false)),
        }
    }

    /// Creates AppState with PostgreSQL persistence backend (Cloud Run / HTTP server mode).
    /// CRITICAL ISOLATION: No SQLite database connection is opened or created in this mode.
    pub fn new_postgres(app_version: impl Into<String>, pool: sqlx::PgPool) -> Self {
        let user_repo = UserRepository::Postgres(crate::repositories::PostgresUserRepository::new(pool.clone()));
        let branch_repo = BranchRepository::Postgres(crate::repositories::PostgresBranchRepository::new(pool.clone()));
        let catalog_service = CatalogService::new_postgres(pool.clone());
        let product_service = ProductService::new_postgres(pool.clone());
        let inventory_service = InventoryService::new_postgres(pool.clone());
        let customer_service = CustomerService::new_postgres(pool.clone());
        let sale_service = SaleService::new_postgres(pool.clone());
        let supplier_service = SupplierService::new_postgres(pool.clone());
        let purchase_service = PurchaseService::new_postgres(pool.clone());
        let expense_service = ExpenseService::new_postgres(pool.clone());
        let cash_service = CashService::new_postgres(pool.clone());
        let sales_return_service = SalesReturnService::new_postgres(pool.clone());
        let purchase_return_service = PurchaseReturnService::new_postgres(pool.clone());
        let profit_service = ProfitService::new_postgres(pool.clone());

        Self {
            app_version: app_version.into(),
            session: Arc::new(RwLock::new(SessionContext::default())),
            db: None,
            pg_pool: Some(pool),
            user_repo,
            branch_repo,
            catalog_service,
            product_service,
            inventory_service,
            customer_service,
            sale_service,
            supplier_service,
            purchase_service,
            expense_service,
            cash_service,
            sales_return_service,
            purchase_return_service,
            profit_service,
            token_manager: crate::services::TokenManager::new(),
            is_initialized: Arc::new(RwLock::new(false)),
        }
    }

    /// Backwards-compatible constructor for SQLite AppState
    pub fn new(app_version: impl Into<String>, db: DatabaseConnection) -> Self {
        Self::new_sqlite(app_version, db)
    }

    /// Opens the persistent default local application database
    pub fn open_default(app_version: impl Into<String>) -> Self {
        let path = DatabaseConnection::default_db_path();
        let db = DatabaseConnection::open_file(path).expect("Failed to open persistent SQLite database");
        Self::new_sqlite(app_version, db)
    }
    }

    /// Opens an isolated in-memory database for testing and diagnostics
    pub fn in_memory(app_version: impl Into<String>) -> Self {
        let db = DatabaseConnection::open_in_memory().expect("Failed to open in-memory SQLite database");
        Self::new(app_version, db)
    }

    pub async fn get_session(&self) -> SessionContext {
        self.session.read().await.clone()
    }

    pub async fn set_authenticated(&self, user: &User) {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis();

        let mut session = self.session.write().await;
        *session = SessionContext {
            is_authenticated: true,
            is_locked: false,
            user_id: Some(user.id.clone()),
            username: Some(user.username.clone()),
            role: Some(user.role),
            login_time_ms: Some(now),
            access_profile: Some(user.access_profile.clone()),
        };
    }

    pub async fn lock_session(&self) -> bool {
        let mut session = self.session.write().await;
        if session.is_authenticated {
            session.is_locked = true;
            true
        } else {
            false
        }
    }

    pub async fn unlock_session(&self) -> bool {
        let mut session = self.session.write().await;
        if session.is_authenticated && session.is_locked {
            session.is_locked = false;
            true
        } else {
            false
        }
    }

    pub async fn clear_session(&self) {
        let mut session = self.session.write().await;
        *session = SessionContext::default();
    }

    /// Returns a reference to the PostgreSQL pool, if available (Cloud Run / HTTP server mode).
    /// Returns None in desktop Tauri / SQLite mode.
    pub fn pg_pool(&self) -> Option<&sqlx::PgPool> {
        self.pg_pool.as_ref()
    }

    /// Creates a new AppState with the PostgreSQL pool attached (used by server.rs).
    pub fn with_pg_pool(mut self, pool: sqlx::PgPool) -> Self {
        self.pg_pool = Some(pool);
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_app_state_session_lifecycle() {
        let state = AppState::in_memory("5.0.3");
        let initial = state.get_session().await;
        assert!(!initial.is_authenticated);
        assert!(!initial.is_locked);

        let user = User {
            id: "550e8400-e29b-41d4-a716-446655440099".to_string(),
            name: "Test Staff".to_string(),
            username: "teststaff".to_string(),
            login_key_hash: "dummy".to_string(),
            pin_hash: Some("dummy".to_string()),
            role: UserRole::Cashier,
            status: crate::domain::user::UserStatus::Active,
            is_active: true,
            recovery_key_hash: None,
            must_change_password: false,
            access_profile: StaffAccessProfile::cashier_default(),
            failed_pin_attempts: 0,
            pin_locked_until_ms: None,
            failed_login_attempts: 0,
            login_locked_until_ms: None,
            created_at: "2026-01-01T00:00:00Z".to_string(),
            updated_at: "2026-01-01T00:00:00Z".to_string(),
        };

        state.set_authenticated(&user).await;
        let auth_session = state.get_session().await;
        assert!(auth_session.is_authenticated);
        assert!(!auth_session.is_locked);
        assert_eq!(auth_session.username, Some("teststaff".to_string()));

        // Test lock
        assert!(state.lock_session().await);
        let locked_session = state.get_session().await;
        assert!(locked_session.is_locked);

        // Test unlock
        assert!(state.unlock_session().await);
        let unlocked_session = state.get_session().await;
        assert!(!unlocked_session.is_locked);

        // Test logout
        state.clear_session().await;
        let logged_out = state.get_session().await;
        assert!(!logged_out.is_authenticated);
        assert!(!logged_out.is_locked);
    }

    #[test]
    fn test_cloud_composition_isolation_and_postgres_selection() {
        let pool = sqlx::PgPool::connect_lazy("postgres://localhost/dummy_db").expect("connect_lazy should succeed");
        let state = AppState::new_postgres("1.0.1", pool);

        // 1. Verify SQLite database connection is NOT opened or created (db is None)
        assert!(state.db.is_none(), "Cloud Run AppState must NOT initialize a SQLite connection");

        // 2. Verify PostgreSQL pool is attached
        assert!(state.pg_pool().is_some(), "PostgreSQL connection pool must be present in Cloud Run mode");

        // 3. Verify repository enums are wired to Postgres variant
        assert!(matches!(state.user_repo, crate::repositories::UserRepository::Postgres(_)));
        assert!(matches!(state.branch_repo, crate::repositories::BranchRepository::Postgres(_)));
    }
}
