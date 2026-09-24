/// Niazi Mobile Mart â€” Cloud Run HTTP Server binary
///
/// Architecture contract:
/// - Axum handlers are TRANSPORT ONLY â€” they call service methods, never raw SQL
/// - Business rules live in the service layer (services/*.rs)
/// - The repository layer owns persistence (SQLite or PostgreSQL)
/// - This binary shares all service + domain + repository code with the Tauri desktop binary
///
/// Phase 2: Infrastructure boundary
///   - Initializes PostgreSQL pool from DATABASE_URL when present
///   - Attaches pool to AppState; services remain on SQLite until Phase 3 PostgreSQL repos
///   - All business operations still route through service layer

use std::net::SocketAddr;
use std::sync::Arc;
use axum::{
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Json},
    routing::get,
    Router,
};
use serde_json::json;
use tower_http::cors::{Any, CorsLayer};
use tracing::{error, info, warn};

use niazi_mobile_mart_lib::db::PostgresAdapter;
use niazi_mobile_mart_lib::state::AppState;

/// Shared server state threaded through Axum via `.with_state()`
/// Handlers call service methods on `app_state` â€” never raw SQL.
#[derive(Clone)]
pub struct ServerState {
    pub app_state: Arc<AppState>,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // 1. Initialize structured logging
    let _ = tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| {
                    "niazi_mobile_mart_lib=info,niazi_server=info,tower_http=info".into()
                }),
        )
        .try_init();

    info!("Starting Niazi Mobile Mart Cloud Run HTTP Server binary...");

    // 1b. Controlled Migration CLI Command (Option A Production Architecture)
    // Invoked via `niazi-server migrate` or `niazi-server --migrate`
    let args: Vec<String> = std::env::args().collect();
    if args.len() > 1 && (args[1] == "migrate" || args[1] == "--migrate") {
        info!("Running in deliberate PostgreSQL migration mode (Option A)...");
        let database_url = match std::env::var("DATABASE_URL") {
            Ok(url) if !url.trim().is_empty() => url,
            _ => {
                error!("FATAL: DATABASE_URL environment variable is required to execute migrations.");
                return Err("DATABASE_URL environment variable is required for migration mode".into());
            }
        };

        info!("Connecting to PostgreSQL database for migration...");
        let pg_adapter = PostgresAdapter::from_url(&database_url).await?;
        pg_adapter.run_migrations().await?;
        info!("PostgreSQL database migration completed successfully. Exiting.");
        return Ok(());
    }

    // 2. Resolve port from $PORT env var (Cloud Run sets this automatically)
    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(8080);

    let bind_addr = SocketAddr::from(([0, 0, 0, 0], port));

    // 2b. Require JWT_PRIVATE_KEY and JWT_PUBLIC_KEY environment variables in server mode
    let jwt_private = std::env::var("JWT_PRIVATE_KEY").ok();
    let jwt_public = match std::env::var("JWT_PUBLIC_KEY") {
        Ok(key) if !key.trim().is_empty() => key,
        _ => {
            error!("FATAL: JWT_PUBLIC_KEY environment variable is missing or empty.");
            error!("Stateless JWT authentication requires RSA public key to be configured in server mode.");
            return Err("JWT_PUBLIC_KEY environment variable is required for server mode".into());
        }
    };

    // 3. Initialize AppState based on DATABASE_URL environment variable
    //    Cloud mode: DATABASE_URL is set -> PostgreSQL repositories (no SQLite initialization!)
    //    Local dev: DATABASE_URL unset -> SQLite repositories
    let app_state = if let Ok(database_url) = std::env::var("DATABASE_URL") {
        match PostgresAdapter::from_url(&database_url).await {
            Ok(pg_adapter) => {
                info!("PostgreSQL connection pool ready â€” pg_mode: active");
                let pool = pg_adapter.pool().clone();
                Arc::new(AppState::new_postgres(env!("CARGO_PKG_VERSION"), pool).with_jwt_keys(jwt_private, jwt_public))
            }
            Err(e) => {
                error!("PostgreSQL initialization failed: {e}");
                error!("DATABASE_URL is set but PostgreSQL is unreachable. Aborting.");
                return Err(e.into());
            }
        }
    } else {
        info!("DATABASE_URL not set â€” running in SQLite-only mode (local desktop / dev mode)");
        let db_path = niazi_mobile_mart_lib::db::connection::DatabaseConnection::default_db_path();
        let base_state = match niazi_mobile_mart_lib::db::connection::DatabaseConnection::open_file(db_path) {
            Ok(db) => AppState::new_sqlite(env!("CARGO_PKG_VERSION"), db).with_jwt_keys(jwt_private.clone(), jwt_public.clone()),
            Err(e) => {
                warn!("Persistent SQLite path unavailable ({e}) â€” using in-memory SQLite.");
                AppState::in_memory(env!("CARGO_PKG_VERSION")).with_jwt_keys(jwt_private, jwt_public)
            }
        };
        Arc::new(base_state)
    };

    let server_state = ServerState { app_state };

    // 5. Configure CORS for browser clients (refined in Phase 4 auth hardening)
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    // 6. Build the Axum router
    //    ARCHITECTURE RULE: every route handler must call a service method.
    //    Direct SQL in handlers is PROHIBITED.
    let app = Router::new()
        .route("/api/health", get(health_handler))
        .route("/api/v1/health", get(health_handler))
        .route("/api/auth/bootstrap-status", get(bootstrap_status_handler))
        .route("/api/v1/auth/bootstrap-status", get(bootstrap_status_handler))
        .route("/api/auth/bootstrap-first-admin", axum::routing::post(bootstrap_first_admin_handler))
        .route("/api/v1/auth/bootstrap-first-admin", axum::routing::post(bootstrap_first_admin_handler))
        .route("/api/auth/login", axum::routing::post(login_handler))
        .route("/api/v1/auth/login", axum::routing::post(login_handler))
        .route("/api/auth/logout", axum::routing::post(logout_handler))
        .route("/api/v1/auth/logout", axum::routing::post(logout_handler))
        .route("/api/auth/me", get(me_handler))
        .route("/api/v1/auth/me", get(me_handler))
        .route("/api/users", get(list_users_handler).post(create_user_handler))
        .route("/api/v1/users", get(list_users_handler).post(create_user_handler))
        .route("/api/v1/users/credential-snapshots", get(credential_snapshots_handler))
        .route("/api/products", get(list_products_handler).post(create_product_handler))
        .route("/api/products/:id", get(get_product_handler))
        .route("/api/inventory", get(list_inventory_handler))
        .route("/api/sales", axum::routing::post(complete_sale_handler))
        .route("/api/customers", get(list_customers_handler).post(create_customer_handler))
        .route("/api/suppliers", get(list_suppliers_handler).post(create_supplier_handler))
        .route("/api/purchases", axum::routing::post(complete_purchase_handler))
        .route("/api/expenses", get(list_expenses_handler).post(create_expense_handler))
        .route("/api/reports/profit", get(profit_report_handler))
        .route("/api/v1/sync/push", axum::routing::post(sync_push_handler))
        .route("/api/v1/sync/pull", get(sync_pull_handler))
        .fallback(spa_fallback_handler)
        .layer(cors)
        .with_state(server_state);

    // 7. Bind and start
    let listener = tokio::net::TcpListener::bind(bind_addr).await?;
    info!("Niazi Cloud Run HTTP Server listening on http://{bind_addr}");
    info!("  GET  /api/health â†’ {bind_addr}/api/health");
    info!("  GET  /api/v1/health â†’ {bind_addr}/api/v1/health");
    info!("  POST /api/auth/login â†’ {bind_addr}/api/auth/login");
    info!("  POST /api/auth/logout â†’ {bind_addr}/api/auth/logout");
    info!("  GET  /api/auth/me â†’ {bind_addr}/api/auth/me");
    info!("  GET  /api/products â†’ {bind_addr}/api/products");
    info!("  POST /api/products â†’ {bind_addr}/api/products");
    info!("  GET  /api/inventory â†’ {bind_addr}/api/inventory");
    info!("  POST /api/sales â†’ {bind_addr}/api/sales");
    info!("  GET  /api/customers â†’ {bind_addr}/api/customers");
    info!("  POST /api/customers â†’ {bind_addr}/api/customers");
    info!("  GET  /api/suppliers â†’ {bind_addr}/api/suppliers");
    info!("  POST /api/suppliers â†’ {bind_addr}/api/suppliers");
    info!("  POST /api/purchases â†’ {bind_addr}/api/purchases");
    info!("  GET  /api/expenses â†’ {bind_addr}/api/expenses");
    info!("  POST /api/expenses â†’ {bind_addr}/api/expenses");
    info!("  GET  /api/reports/profit â†’ {bind_addr}/api/reports/profit");
    info!("  FALLBACK SPA serving â†’ React dist directory (index.html)");

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    info!("Server shut down gracefully.");
    Ok(())
}

// ---------------------------------------------------------------------------
// Extractor for Authenticated Request Identity
// Reads Bearer token from Authorization header and resolves trusted identity.
// Returns 401 Unauthorized if missing/invalid/expired.
// ---------------------------------------------------------------------------

pub struct AuthenticatedUser(pub niazi_mobile_mart_lib::domain::identity::RequestIdentity);

#[axum::async_trait]
impl axum::extract::FromRequestParts<ServerState> for AuthenticatedUser {
    type Rejection = (StatusCode, Json<serde_json::Value>);

    async fn from_request_parts(
        parts: &mut axum::http::request::Parts,
        state: &ServerState,
    ) -> Result<Self, Self::Rejection> {
        let auth_header = parts
            .headers
            .get(axum::http::header::AUTHORIZATION)
            .and_then(|h| h.to_str().ok());

        let token = match auth_header {
            Some(header) if header.starts_with("Bearer ") => &header[7..],
            _ => {
                return Err((
                    StatusCode::UNAUTHORIZED,
                    Json(json!({
                        "error": "UNAUTHORIZED",
                        "message": "Missing or invalid Authorization header"
                    })),
                ))
            }
        };

        match state.app_state.token_manager.resolve_identity(token).await {
            Ok(identity) => Ok(AuthenticatedUser(identity)),
            Err(e) => Err((
                StatusCode::UNAUTHORIZED,
                Json(json!({
                    "error": "UNAUTHORIZED",
                    "message": e.to_string()
                })),
            )),
        }
    }
}

// ---------------------------------------------------------------------------
// Route Handlers â€” TRANSPORT LAYER ONLY
// Each handler must delegate business operations to a service method.
// Direct SQL queries are PROHIBITED in this module.
// ---------------------------------------------------------------------------

#[derive(serde::Deserialize)]
struct LoginPayload {
    username: String,
    password: String,
}

/// POST /api/auth/login
async fn login_handler(
    State(state): State<ServerState>,
    Json(payload): Json<LoginPayload>,
) -> impl IntoResponse {
    use niazi_mobile_mart_lib::services::AuthService;

    match AuthService::login(
        &state.app_state.user_repo,
        &state.app_state,
        &payload.username,
        &payload.password,
    )
    .await
    {
        Ok(user) => {
            let token = state.app_state.token_manager.create_token(user.clone()).await;
            (
                StatusCode::OK,
                Json(json!({
                    "token": token,
                    "user": user,
                })),
            )
        }
        Err(e) => {
            let status = match e {
                niazi_mobile_mart_lib::errors::AppError::Unauthorized(_) => StatusCode::UNAUTHORIZED,
                niazi_mobile_mart_lib::errors::AppError::Forbidden(_) => StatusCode::FORBIDDEN,
                niazi_mobile_mart_lib::errors::AppError::Locked(_) => StatusCode::TOO_MANY_REQUESTS,
                _ => StatusCode::BAD_REQUEST,
            };
            (
                status,
                Json(json!({
                    "error": "LOGIN_FAILED",
                    "message": e.to_string(),
                })),
            )
        }
    }
}

/// POST /api/auth/logout
async fn logout_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
) -> impl IntoResponse {
    // Revoke token identity from token manager
    let _ = state.app_state.token_manager.revoke_token(&auth.0.user_id).await;
    (
        StatusCode::OK,
        Json(json!({
            "status": "ok",
            "message": format!("Logged out user {}", auth.0.username),
        })),
    )
}

/// GET /api/auth/me
async fn me_handler(
    auth: AuthenticatedUser,
) -> impl IntoResponse {
    (
        StatusCode::OK,
        Json(json!({
            "identity": auth.0,
        })),
    )
}

/// GET /api/v1/auth/bootstrap-status
async fn bootstrap_status_handler(State(state): State<ServerState>) -> impl IntoResponse {
    use niazi_mobile_mart_lib::services::AdminService;
    match AdminService::check_bootstrap_status(&state.app_state.user_repo).await {
        Ok(needs_bootstrap) => (
            StatusCode::OK,
            Json(json!({
                "initialized": !needs_bootstrap,
                "is_bootstrap_required": needs_bootstrap
            })),
        ),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "CHECK_FAILED", "message": e.to_string()})),
        ),
    }
}

/// POST /api/v1/auth/bootstrap-first-admin
async fn bootstrap_first_admin_handler(
    State(state): State<ServerState>,
    Json(payload): Json<niazi_mobile_mart_lib::services::admin_service::BootstrapAdminPayload>,
) -> impl IntoResponse {
    use niazi_mobile_mart_lib::services::AdminService;
    match AdminService::bootstrap_first_admin(&state.app_state.user_repo, payload).await {
        Ok(res) => (StatusCode::CREATED, Json(json!(res))),
        Err(e) => {
            let status = match e {
                niazi_mobile_mart_lib::errors::AppError::Forbidden(_) => StatusCode::FORBIDDEN,
                niazi_mobile_mart_lib::errors::AppError::Conflict(_) => StatusCode::CONFLICT,
                _ => StatusCode::BAD_REQUEST,
            };
            (
                status,
                Json(json!({"error": "BOOTSTRAP_FAILED", "message": e.to_string()})),
            )
        }
    }
}

/// POST /api/v1/users â€” Create staff user (Admin only)
async fn create_user_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    Json(payload): Json<niazi_mobile_mart_lib::services::admin_service::CreateUserPayload>,
) -> impl IntoResponse {
    use niazi_mobile_mart_lib::services::AdminService;
    if let Err(e) = auth.0.authorize_permission(Some("users"), Some("users:create")) {
        return (StatusCode::FORBIDDEN, Json(json!({"error": "FORBIDDEN", "message": e.to_string()})));
    }

    match AdminService::create_user_direct(&state.app_state.user_repo, payload).await {
        Ok(user) => (StatusCode::CREATED, Json(json!(user))),
        Err(e) => (StatusCode::BAD_REQUEST, Json(json!({"error": "CREATE_USER_FAILED", "message": e.to_string()}))),
    }
}

/// GET /api/v1/users â€” List all users (Admin/Manager)
async fn list_users_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("users"), None) {
        return (StatusCode::FORBIDDEN, Json(json!({"error": "FORBIDDEN", "message": e.to_string()})));
    }

    match state.app_state.user_repo.list_all().await {
        Ok(users) => {
            let sanitized: Vec<_> = users.into_iter().map(|u| u.sanitize()).collect();
            (StatusCode::OK, Json(json!(sanitized)))
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "SERVER_ERROR", "message": e.to_string()}))),
    }
}

/// GET /api/v1/users/credential-snapshots — Return user authentication snapshots (Admin only)
async fn credential_snapshots_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
) -> impl IntoResponse {
    use niazi_mobile_mart_lib::domain::user::UserRole;

    // Internal staff authority required
    if auth.0.role.is_public() {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({
                "error": "FORBIDDEN",
                "message": "Access denied: Internal staff authority required for credential snapshots"
            })),
        );
    }

    match state.app_state.user_repo.list_all().await {
        Ok(users) => {
            let now = chrono::Utc::now().to_rfc3339();
            let snapshots: Vec<niazi_mobile_mart_lib::domain::auth_snapshot::AuthSnapshot> = users
                .into_iter()
                .filter(|u| auth.0.role == UserRole::Admin || u.id == auth.0.user_id)
                .map(|u| {
                    let profile_json = serde_json::to_string(&u.access_profile)
                        .unwrap_or_else(|_| "{}".to_string());
                    niazi_mobile_mart_lib::domain::auth_snapshot::AuthSnapshot {
                        user_id: u.id,
                        username: u.username,
                        organization_id: auth.0.organization_id.clone(),
                        branch_id: None,
                        role: u.role,
                        credential_hash: format!("{}|{}", u.login_key_hash, u.pin_hash.unwrap_or_default()),
                        access_profile_json: profile_json,
                        credential_version: 1,
                        status: u.status,
                        synced_at: now.clone(),
                        created_at: u.created_at,
                        updated_at: u.updated_at,
                    }
                })
                .collect();

            (StatusCode::OK, Json(json!(snapshots)))
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({
                "error": "SERVER_ERROR",
                "message": e.to_string()
            })),
        ),
    }
}


/// GET /api/health
/// Infrastructure-level health check.
/// Reports server liveness and active database mode.
/// No service calls required â€” reads connection state only.
async fn health_handler(State(state): State<ServerState>) -> impl IntoResponse {
    let db_mode = if state.app_state.pg_pool().is_some() {
        "postgresql"
    } else {
        "sqlite"
    };

    (
        StatusCode::OK,
        Json(json!({
            "status": "ok",
            "db_mode": db_mode,
            "version": state.app_state.app_version,
        })),
    )
}

// ---------------------------------------------------------------------------
// Domain API Handlers â€” TRANSPORT ONLY WITH STRICT SERVER-SIDE RBAC
// ---------------------------------------------------------------------------

/// GET /api/products â€” List products with search filter
async fn list_products_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Query(filter): axum::extract::Query<niazi_mobile_mart_lib::domain::product::ProductFilter>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("products"), None) {
        return (StatusCode::FORBIDDEN, Json(json!({"error": "FORBIDDEN", "message": e.to_string()})));
    }

    match state.app_state.product_service.list_products(filter).await {
        Ok(products) => (StatusCode::OK, Json(json!(products))),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "SERVER_ERROR", "message": e.to_string()}))),
    }
}

/// GET /api/products/:id â€” Get product details
async fn get_product_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("products"), None) {
        return (StatusCode::FORBIDDEN, Json(json!({"error": "FORBIDDEN", "message": e.to_string()})));
    }

    match state.app_state.product_service.get_product(&id).await {
        Ok(product) => (StatusCode::OK, Json(json!(product))),
        Err(e) => (StatusCode::NOT_FOUND, Json(json!({"error": "NOT_FOUND", "message": e.to_string()}))),
    }
}

/// POST /api/products â€” Create new product
async fn create_product_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    Json(payload): Json<niazi_mobile_mart_lib::domain::product::CreateProductDto>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("products"), Some("product:create")) {
        return (StatusCode::FORBIDDEN, Json(json!({"error": "FORBIDDEN", "message": e.to_string()})));
    }

    match state.app_state.product_service.create_product(payload, Some(&auth.0.user_id)).await {
        Ok(product) => (StatusCode::CREATED, Json(json!(product))),
        Err(e) => (StatusCode::BAD_REQUEST, Json(json!({"error": "CREATE_FAILED", "message": e.to_string()}))),
    }
}

/// GET /api/inventory â€” List inventory stock map with strict branch isolation
async fn list_inventory_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Query(params): axum::extract::Query<std::collections::HashMap<String, String>>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("inventory"), None) {
        return (StatusCode::FORBIDDEN, Json(json!({"error": "FORBIDDEN", "message": e.to_string()})));
    }

    let req_branch = params.get("branch_id").map(|s| s.as_str());
    let effective_branch = match auth.0.resolve_branch(req_branch) {
        Ok(bid) => bid,
        Err(e) => return (StatusCode::FORBIDDEN, Json(json!({"error": "FORBIDDEN", "message": e.to_string()}))),
    };

    match state.app_state.inventory_service.get_stock_map(&effective_branch).await {
        Ok(stock) => (StatusCode::OK, Json(json!(stock))),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "SERVER_ERROR", "message": e.to_string()}))),
    }
}

/// POST /api/sales â€” Complete retail sale checkout with strict branch isolation
async fn complete_sale_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    Json(payload): Json<niazi_mobile_mart_lib::domain::sales::CompleteSaleDto>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("pos"), Some("pos:sale")) {
        return (StatusCode::FORBIDDEN, Json(json!({"error": "FORBIDDEN", "message": e.to_string()})));
    }

    let effective_branch = match auth.0.resolve_branch(payload.branch_id.as_deref()) {
        Ok(bid) => bid,
        Err(e) => return (StatusCode::FORBIDDEN, Json(json!({"error": "FORBIDDEN", "message": e.to_string()}))),
    };

    let mut payload = payload;
    payload.branch_id = Some(effective_branch);

    match state.app_state.sale_service.complete_sale(Some(&auth.0.user_id), payload).await {
        Ok(result) => (StatusCode::CREATED, Json(json!(result))),
        Err(e) => (StatusCode::BAD_REQUEST, Json(json!({"error": "SALE_FAILED", "message": e.to_string()}))),
    }
}

/// GET /api/customers â€” List customers
async fn list_customers_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Query(filter): axum::extract::Query<niazi_mobile_mart_lib::domain::customer::CustomerFilter>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("customers"), None) {
        return (StatusCode::FORBIDDEN, Json(json!({"error": "FORBIDDEN", "message": e.to_string()})));
    }

    match state.app_state.customer_service.list_customers(filter).await {
        Ok(customers) => (StatusCode::OK, Json(json!(customers))),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "SERVER_ERROR", "message": e.to_string()}))),
    }
}

/// POST /api/customers â€” Create customer
async fn create_customer_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    Json(payload): Json<niazi_mobile_mart_lib::domain::customer::CreateCustomerDto>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("customers"), None) {
        return (StatusCode::FORBIDDEN, Json(json!({"error": "FORBIDDEN", "message": e.to_string()})));
    }

    match state.app_state.customer_service.create_customer(payload).await {
        Ok(customer) => (StatusCode::CREATED, Json(json!(customer))),
        Err(e) => (StatusCode::BAD_REQUEST, Json(json!({"error": "CREATE_FAILED", "message": e.to_string()}))),
    }
}

/// GET /api/suppliers â€” List suppliers
async fn list_suppliers_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Query(filter): axum::extract::Query<niazi_mobile_mart_lib::domain::supplier::SupplierFilter>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("suppliers"), None) {
        return (StatusCode::FORBIDDEN, Json(json!({"error": "FORBIDDEN", "message": e.to_string()})));
    }

    match state.app_state.supplier_service.list_suppliers(Some(filter)).await {
        Ok(suppliers) => (StatusCode::OK, Json(json!(suppliers))),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "SERVER_ERROR", "message": e.to_string()}))),
    }
}

/// POST /api/suppliers â€” Create supplier
async fn create_supplier_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    Json(payload): Json<niazi_mobile_mart_lib::domain::supplier::CreateSupplierDto>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("suppliers"), None) {
        return (StatusCode::FORBIDDEN, Json(json!({"error": "FORBIDDEN", "message": e.to_string()})));
    }

    match state.app_state.supplier_service.create_supplier(payload).await {
        Ok(supplier) => (StatusCode::CREATED, Json(json!(supplier))),
        Err(e) => (StatusCode::BAD_REQUEST, Json(json!({"error": "CREATE_FAILED", "message": e.to_string()}))),
    }
}

/// POST /api/purchases â€” Complete purchase with strict branch isolation
async fn complete_purchase_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    Json(payload): Json<niazi_mobile_mart_lib::domain::purchases::CompletePurchaseDto>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("purchases"), None) {
        return (StatusCode::FORBIDDEN, Json(json!({"error": "FORBIDDEN", "message": e.to_string()})));
    }

    let effective_branch = match auth.0.resolve_branch(payload.branch_id.as_deref()) {
        Ok(bid) => bid,
        Err(e) => return (StatusCode::FORBIDDEN, Json(json!({"error": "FORBIDDEN", "message": e.to_string()}))),
    };

    let mut payload = payload;
    payload.branch_id = Some(effective_branch);

    match state.app_state.purchase_service.complete_purchase(Some(&auth.0.user_id), payload).await {
        Ok(result) => (StatusCode::CREATED, Json(json!(result))),
        Err(e) => (StatusCode::BAD_REQUEST, Json(json!({"error": "PURCHASE_FAILED", "message": e.to_string()}))),
    }
}

/// GET /api/expenses â€” List expenses with strict branch isolation
async fn list_expenses_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Query(filter): axum::extract::Query<niazi_mobile_mart_lib::domain::expense::ExpenseFilterDto>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("expenses"), None) {
        return (StatusCode::FORBIDDEN, Json(json!({"error": "FORBIDDEN", "message": e.to_string()})));
    }

    let effective_branch = match auth.0.resolve_branch(filter.branch_id.as_deref()) {
        Ok(bid) => bid,
        Err(e) => return (StatusCode::FORBIDDEN, Json(json!({"error": "FORBIDDEN", "message": e.to_string()}))),
    };

    let mut filter = filter;
    filter.branch_id = Some(effective_branch);

    match state.app_state.expense_service.list_expenses(filter).await {
        Ok(expenses) => (StatusCode::OK, Json(json!(expenses))),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "SERVER_ERROR", "message": e.to_string()}))),
    }
}

/// POST /api/expenses â€” Create expense with strict branch isolation
async fn create_expense_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    Json(payload): Json<niazi_mobile_mart_lib::domain::expense::CreateExpenseDto>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("expenses"), Some("expense:create")) {
        return (StatusCode::FORBIDDEN, Json(json!({"error": "FORBIDDEN", "message": e.to_string()})));
    }

    let effective_branch = match auth.0.resolve_branch(payload.branch_id.as_deref()) {
        Ok(bid) => bid,
        Err(e) => return (StatusCode::FORBIDDEN, Json(json!({"error": "FORBIDDEN", "message": e.to_string()}))),
    };

    let mut payload = payload;
    payload.branch_id = Some(effective_branch);

    match state.app_state.expense_service.create_expense(Some(&auth.0.user_id), payload).await {
        Ok(expense) => (StatusCode::CREATED, Json(json!(expense))),
        Err(e) => (StatusCode::BAD_REQUEST, Json(json!({"error": "CREATE_FAILED", "message": e.to_string()}))),
    }
}

/// GET /api/reports/profit â€” Get profit summary report with strict branch isolation
async fn profit_report_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Query(params): axum::extract::Query<std::collections::HashMap<String, String>>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("reports"), None) {
        return (StatusCode::FORBIDDEN, Json(json!({"error": "FORBIDDEN", "message": e.to_string()})));
    }

    let req_branch = params.get("branch_id").map(|s| s.as_str());
    let effective_branch = match auth.0.resolve_branch(req_branch) {
        Ok(bid) => bid,
        Err(e) => return (StatusCode::FORBIDDEN, Json(json!({"error": "FORBIDDEN", "message": e.to_string()}))),
    };

    let start_date = params.get("start_date").cloned();
    let end_date = params.get("end_date").cloned();

    match state.app_state.profit_service.get_period_profitability(start_date, end_date, Some(effective_branch)).await {
        Ok(summary) => (StatusCode::OK, Json(json!(summary))),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "SERVER_ERROR", "message": e.to_string()}))),
    }
}

#[derive(serde::Deserialize)]
struct SyncPushPayload {
    events: Vec<niazi_mobile_mart_lib::domain::sync_queue::SyncQueueItem>,
}

/// POST /api/v1/sync/push â€” Central Outbox Event Ingestion & Deduplication Handler
async fn sync_push_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    Json(payload): Json<SyncPushPayload>,
) -> impl IntoResponse {
    let mut results = Vec::new();

    for event in payload.events {
        let client_event_id = event.client_event_id.clone();
        let server_event_id = uuid::Uuid::new_v4().to_string();

        // 1. Organization Authorization: Must match authenticated user's organization
        if event.organization_id != auth.0.organization_id {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({
                    "error": "FORBIDDEN",
                    "message": "Access denied: Cross-organization sync event prohibited"
                })),
            );
        }

        // 2. Branch Authorization: Must be authorized for authenticated user
        if let Err(e) = auth.0.validate_context(Some(&event.organization_id), Some(&event.branch_id)) {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({
                    "error": "FORBIDDEN",
                    "message": format!("Access denied: Unauthorized branch event: {}", e)
                })),
            );
        }

        if let Some(pg_pool) = state.app_state.pg_pool() {
            let mut tx = match pg_pool.begin().await {
                Ok(t) => t,
                Err(e) => {
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(json!({
                            "error": "SERVER_ERROR",
                            "message": format!("Failed to initialize database transaction: {e}")
                        })),
                    );
                }
            };

            let existing = match niazi_mobile_mart_lib::repositories::PostgresSyncAuditRepository::find_existing_event_id_tx(&mut tx, &client_event_id).await {
                Ok(res) => res,
                Err(e) => {
                    let _ = tx.rollback().await;
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(json!({
                            "error": "SERVER_ERROR",
                            "message": format!("Idempotency check failed: {e}")
                        })),
                    );
                }
            };

            if let Some(existing_id) = existing {
                let _ = tx.rollback().await;
                results.push(json!({
                    "client_event_id": client_event_id,
                    "server_event_id": existing_id,
                    "status": "SYNCED"
                }));
                continue;
            }

            if event.event_type == "SALE_CREATED" {
                let dto: niazi_mobile_mart_lib::domain::sales::CompleteSaleDto = match serde_json::from_str(&event.payload) {
                    Ok(d) => d,
                    Err(e) => {
                        let _ = tx.rollback().await;
                        return (
                            StatusCode::BAD_REQUEST,
                            Json(json!({
                                "error": "BAD_REQUEST",
                                "message": format!("Invalid SALE_CREATED payload: {e}")
                            })),
                        );
                    }
                };

                let sale_result = match niazi_mobile_mart_lib::repositories::PostgresSaleRepository::complete_sale_tx(
                    &mut tx,
                    &dto,
                    Some(&auth.0.user_id),
                    Some(&client_event_id),
                ).await {
                    Ok(res) => res,
                    Err(e) => {
                        let _ = tx.rollback().await;
                        return (
                            StatusCode::INTERNAL_SERVER_ERROR,
                            Json(json!({
                                "error": "SERVER_ERROR",
                                "message": format!("Failed to project SALE_CREATED event centrally: {e}")
                            })),
                        );
                    }
                };

                let change_payload = match serde_json::to_string(&sale_result) {
                    Ok(p) => p,
                    Err(e) => {
                        let _ = tx.rollback().await;
                        return (
                            StatusCode::INTERNAL_SERVER_ERROR,
                            Json(json!({
                                "error": "SERVER_ERROR",
                                "message": format!("Failed to serialize SALE_CREATED change_log payload: {e}")
                            })),
                        );
                    }
                };

                if let Err(e) = niazi_mobile_mart_lib::repositories::PostgresChangeLogRepository::append_change_log_tx(
                    &mut tx,
                    &event.organization_id,
                    &event.branch_id,
                    Some(&client_event_id),
                    "SALE_CREATED",
                    "SALE",
                    &sale_result.sale.id,
                    &change_payload,
                ).await {
                    let _ = tx.rollback().await;
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(json!({
                            "error": "SERVER_ERROR",
                            "message": format!("Failed to append SALE_CREATED to change_log: {e}")
                        })),
                    );
                }
            }

            if event.event_type == "PURCHASE_CREATED" {
                let dto: niazi_mobile_mart_lib::domain::purchases::CompletePurchaseDto = match serde_json::from_str(&event.payload) {
                    Ok(d) => d,
                    Err(e) => {
                        let _ = tx.rollback().await;
                        return (
                            StatusCode::BAD_REQUEST,
                            Json(json!({
                                "error": "BAD_REQUEST",
                                "message": format!("Invalid PURCHASE_CREATED payload: {e}")
                            })),
                        );
                    }
                };

                let purchase_result = match niazi_mobile_mart_lib::repositories::PostgresPurchaseRepository::complete_purchase_tx(
                    &mut tx,
                    &dto,
                    Some(&auth.0.user_id),
                    None,
                ).await {
                    Ok(res) => res,
                    Err(e) => {
                        let _ = tx.rollback().await;
                        return (
                            StatusCode::INTERNAL_SERVER_ERROR,
                            Json(json!({
                                "error": "SERVER_ERROR",
                                "message": format!("Failed to project PURCHASE_CREATED event centrally: {e}")
                            })),
                        );
                    }
                };

                let change_payload = match serde_json::to_string(&purchase_result) {
                    Ok(p) => p,
                    Err(e) => {
                        let _ = tx.rollback().await;
                        return (
                            StatusCode::INTERNAL_SERVER_ERROR,
                            Json(json!({
                                "error": "SERVER_ERROR",
                                "message": format!("Failed to serialize PURCHASE_CREATED change_log payload: {e}")
                            })),
                        );
                    }
                };

                if let Err(e) = niazi_mobile_mart_lib::repositories::PostgresChangeLogRepository::append_change_log_tx(
                    &mut tx,
                    &event.organization_id,
                    &event.branch_id,
                    Some(&client_event_id),
                    "PURCHASE_CREATED",
                    "PURCHASE",
                    &purchase_result.purchase.id,
                    &change_payload,
                ).await {
                    let _ = tx.rollback().await;
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(json!({
                            "error": "SERVER_ERROR",
                            "message": format!("Failed to append PURCHASE_CREATED to change_log: {e}")
                        })),
                    );
                }
            }

            if event.event_type == "EXPENSE_CREATED" {
                let dto: niazi_mobile_mart_lib::domain::expense::CreateExpenseDto = match serde_json::from_str(&event.payload) {
                    Ok(d) => d,
                    Err(e) => {
                        let _ = tx.rollback().await;
                        return (
                            StatusCode::BAD_REQUEST,
                            Json(json!({
                                "error": "BAD_REQUEST",
                                "message": format!("Invalid EXPENSE_CREATED payload: {e}")
                            })),
                        );
                    }
                };

                let expense = match niazi_mobile_mart_lib::repositories::PostgresExpenseRepository::create_expense_tx(
                    &mut tx,
                    &dto,
                    Some(&auth.0.user_id),
                    None,
                ).await {
                    Ok(exp) => exp,
                    Err(e) => {
                        let _ = tx.rollback().await;
                        return (
                            StatusCode::INTERNAL_SERVER_ERROR,
                            Json(json!({
                                "error": "SERVER_ERROR",
                                "message": format!("Failed to project EXPENSE_CREATED event centrally: {e}")
                            })),
                        );
                    }
                };

                let change_payload = match serde_json::to_string(&expense) {
                    Ok(p) => p,
                    Err(e) => {
                        let _ = tx.rollback().await;
                        return (
                            StatusCode::INTERNAL_SERVER_ERROR,
                            Json(json!({
                                "error": "SERVER_ERROR",
                                "message": format!("Failed to serialize EXPENSE_CREATED change_log payload: {e}")
                            })),
                        );
                    }
                };

                if let Err(e) = niazi_mobile_mart_lib::repositories::PostgresChangeLogRepository::append_change_log_tx(
                    &mut tx,
                    &event.organization_id,
                    &event.branch_id,
                    Some(&client_event_id),
                    "EXPENSE_CREATED",
                    "EXPENSE",
                    &expense.id,
                    &change_payload,
                ).await {
                    let _ = tx.rollback().await;
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(json!({
                            "error": "SERVER_ERROR",
                            "message": format!("Failed to append EXPENSE_CREATED to change_log: {e}")
                        })),
                    );
                }
            }

            if event.event_type == "PRODUCT_CREATED" {
                let product: niazi_mobile_mart_lib::domain::product::Product = match serde_json::from_str(&event.payload) {
                    Ok(p) => p,
                    Err(e) => {
                        let _ = tx.rollback().await;
                        return (
                            StatusCode::BAD_REQUEST,
                            Json(json!({
                                "error": "BAD_REQUEST",
                                "message": format!("Invalid PRODUCT_CREATED payload: {e}")
                            })),
                        );
                    }
                };

                // Auto-heal missing master data for the central database
                let now = chrono::Utc::now().to_rfc3339();
                sqlx::query("INSERT INTO categories (id, name, code, is_active, created_at, updated_at) VALUES ($1, 'Auto-Synced Category', $1, 1, $2, $2) ON CONFLICT DO NOTHING")
                    .bind(&product.category_id).bind(&now).execute(&mut *tx).await.ok();
                if let Some(brand_id) = &product.brand_id {
                    sqlx::query("INSERT INTO brands (id, name, code, is_active, created_at, updated_at) VALUES ($1, 'Auto-Synced Brand', $1, 1, $2, $2) ON CONFLICT DO NOTHING")
                        .bind(brand_id).bind(&now).execute(&mut *tx).await.ok();
                }
                if let Some(unit_id) = &product.unit_id {
                    sqlx::query("INSERT INTO units (id, name, symbol, conversion_factor, is_active, created_at, updated_at) VALUES ($1, 'Auto-Synced Unit', $1, 1, 1, $2, $2) ON CONFLICT DO NOTHING")
                        .bind(unit_id).bind(&now).execute(&mut *tx).await.ok();
                }
                if let Some(company_id) = &product.company_id {
                    sqlx::query("INSERT INTO companies (id, name, code, is_active, created_at, updated_at) VALUES ($1, 'Auto-Synced Company', $1, 1, $2, $2) ON CONFLICT DO NOTHING")
                        .bind(company_id).bind(&now).execute(&mut *tx).await.ok();
                }
                if let Some(quality_id) = &product.quality_id {
                    sqlx::query("INSERT INTO qualities (id, name, code, is_active, created_at, updated_at) VALUES ($1, 'Auto-Synced Quality', $1, 1, $2, $2) ON CONFLICT DO NOTHING")
                        .bind(quality_id).bind(&now).execute(&mut *tx).await.ok();
                }
                if let Some(color_id) = &product.color_id {
                    sqlx::query("INSERT INTO colors (id, name, code, is_active, created_at, updated_at) VALUES ($1, 'Auto-Synced Color', $1, 1, $2, $2) ON CONFLICT DO NOTHING")
                        .bind(color_id).bind(&now).execute(&mut *tx).await.ok();
                }

                let projected_product = match niazi_mobile_mart_lib::repositories::PostgresProductRepository::create_product_tx(
                    &mut tx,
                    &product,
                ).await {
                    Ok(p) => p,
                    Err(e) => {
                        let _ = tx.rollback().await;
                        return (
                            StatusCode::INTERNAL_SERVER_ERROR,
                            Json(json!({
                                "error": "SERVER_ERROR",
                                "message": format!("Failed to project PRODUCT_CREATED event centrally: {e}")
                            })),
                        );
                    }
                };

                let change_payload = match serde_json::to_string(&projected_product) {
                    Ok(p) => p,
                    Err(e) => {
                        let _ = tx.rollback().await;
                        return (
                            StatusCode::INTERNAL_SERVER_ERROR,
                            Json(json!({
                                "error": "SERVER_ERROR",
                                "message": format!("Failed to serialize PRODUCT_CREATED change_log payload: {e}")
                            })),
                        );
                    }
                };

                if let Err(e) = niazi_mobile_mart_lib::repositories::PostgresChangeLogRepository::append_change_log_tx(
                    &mut tx,
                    &event.organization_id,
                    &event.branch_id,
                    Some(&client_event_id),
                    "PRODUCT_CREATED",
                    "PRODUCT",
                    &projected_product.id,
                    &change_payload,
                ).await {
                    let _ = tx.rollback().await;
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(json!({
                            "error": "SERVER_ERROR",
                            "message": format!("Failed to append PRODUCT_CREATED to change_log: {e}")
                        })),
                    );
                }
            }

            if event.event_type == "PRODUCT_UPDATED" {
                let product: niazi_mobile_mart_lib::domain::product::Product = match serde_json::from_str(&event.payload) {
                    Ok(p) => p,
                    Err(e) => {
                        let _ = tx.rollback().await;
                        return (
                            StatusCode::BAD_REQUEST,
                            Json(json!({
                                "error": "BAD_REQUEST",
                                "message": format!("Invalid PRODUCT_UPDATED payload: {e}")
                            })),
                        );
                    }
                };

                // Auto-heal missing master data for the central database
                let now = chrono::Utc::now().to_rfc3339();
                sqlx::query("INSERT INTO categories (id, name, code, is_active, created_at, updated_at) VALUES ($1, 'Auto-Synced Category', $1, 1, $2, $2) ON CONFLICT DO NOTHING")
                    .bind(&product.category_id).bind(&now).execute(&mut *tx).await.ok();
                if let Some(brand_id) = &product.brand_id {
                    sqlx::query("INSERT INTO brands (id, name, code, is_active, created_at, updated_at) VALUES ($1, 'Auto-Synced Brand', $1, 1, $2, $2) ON CONFLICT DO NOTHING")
                        .bind(brand_id).bind(&now).execute(&mut *tx).await.ok();
                }
                if let Some(unit_id) = &product.unit_id {
                    sqlx::query("INSERT INTO units (id, name, symbol, conversion_factor, is_active, created_at, updated_at) VALUES ($1, 'Auto-Synced Unit', $1, 1, 1, $2, $2) ON CONFLICT DO NOTHING")
                        .bind(unit_id).bind(&now).execute(&mut *tx).await.ok();
                }
                if let Some(company_id) = &product.company_id {
                    sqlx::query("INSERT INTO companies (id, name, code, is_active, created_at, updated_at) VALUES ($1, 'Auto-Synced Company', $1, 1, $2, $2) ON CONFLICT DO NOTHING")
                        .bind(company_id).bind(&now).execute(&mut *tx).await.ok();
                }
                if let Some(quality_id) = &product.quality_id {
                    sqlx::query("INSERT INTO qualities (id, name, code, is_active, created_at, updated_at) VALUES ($1, 'Auto-Synced Quality', $1, 1, $2, $2) ON CONFLICT DO NOTHING")
                        .bind(quality_id).bind(&now).execute(&mut *tx).await.ok();
                }
                if let Some(color_id) = &product.color_id {
                    sqlx::query("INSERT INTO colors (id, name, code, is_active, created_at, updated_at) VALUES ($1, 'Auto-Synced Color', $1, 1, $2, $2) ON CONFLICT DO NOTHING")
                        .bind(color_id).bind(&now).execute(&mut *tx).await.ok();
                }

                let projected_product = match niazi_mobile_mart_lib::repositories::PostgresProductRepository::update_product_tx(
                    &mut tx,
                    &product,
                ).await {
                    Ok(p) => p,
                    Err(e) => {
                        let _ = tx.rollback().await;
                        return (
                            StatusCode::INTERNAL_SERVER_ERROR,
                            Json(json!({
                                "error": "SERVER_ERROR",
                                "message": format!("Failed to project PRODUCT_UPDATED event centrally: {e}")
                            })),
                        );
                    }
                };

                let change_payload = match serde_json::to_string(&projected_product) {
                    Ok(p) => p,
                    Err(e) => {
                        let _ = tx.rollback().await;
                        return (
                            StatusCode::INTERNAL_SERVER_ERROR,
                            Json(json!({
                                "error": "SERVER_ERROR",
                                "message": format!("Failed to serialize PRODUCT_UPDATED change_log payload: {e}")
                            })),
                        );
                    }
                };

                if let Err(e) = niazi_mobile_mart_lib::repositories::PostgresChangeLogRepository::append_change_log_tx(
                    &mut tx,
                    &event.organization_id,
                    &event.branch_id,
                    Some(&client_event_id),
                    "PRODUCT_UPDATED",
                    "PRODUCT",
                    &projected_product.id,
                    &change_payload,
                ).await {
                    let _ = tx.rollback().await;
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(json!({
                            "error": "SERVER_ERROR",
                            "message": format!("Failed to append PRODUCT_UPDATED to change_log: {e}")
                        })),
                    );
                }
            }

            if event.event_type == "PRODUCT_DEACTIVATED" {
                #[derive(serde::Deserialize, serde::Serialize)]
                struct DeactivatePayload {
                    id: String,
                }

                let deactivate_dto: DeactivatePayload = match serde_json::from_str(&event.payload) {
                    Ok(p) => p,
                    Err(e) => {
                        let _ = tx.rollback().await;
                        return (
                            StatusCode::BAD_REQUEST,
                            Json(json!({
                                "error": "BAD_REQUEST",
                                "message": format!("Invalid PRODUCT_DEACTIVATED payload: {e}")
                            })),
                        );
                    }
                };

                if let Err(e) = niazi_mobile_mart_lib::repositories::PostgresProductRepository::deactivate_product_tx(
                    &mut tx,
                    &deactivate_dto.id,
                ).await {
                    let _ = tx.rollback().await;
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(json!({
                            "error": "SERVER_ERROR",
                            "message": format!("Failed to project PRODUCT_DEACTIVATED event centrally: {e}")
                        })),
                    );
                }

                let change_payload = match serde_json::to_string(&deactivate_dto) {
                    Ok(p) => p,
                    Err(e) => {
                        let _ = tx.rollback().await;
                        return (
                            StatusCode::INTERNAL_SERVER_ERROR,
                            Json(json!({
                                "error": "SERVER_ERROR",
                                "message": format!("Failed to serialize PRODUCT_DEACTIVATED change_log payload: {e}")
                            })),
                        );
                    }
                };

                if let Err(e) = niazi_mobile_mart_lib::repositories::PostgresChangeLogRepository::append_change_log_tx(
                    &mut tx,
                    &event.organization_id,
                    &event.branch_id,
                    Some(&client_event_id),
                    "PRODUCT_DEACTIVATED",
                    "PRODUCT",
                    &deactivate_dto.id,
                    &change_payload,
                ).await {
                    let _ = tx.rollback().await;
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(json!({
                            "error": "SERVER_ERROR",
                            "message": format!("Failed to append PRODUCT_DEACTIVATED to change_log: {e}")
                        })),
                    );
                }
            }

            if let Err(e) = niazi_mobile_mart_lib::repositories::PostgresSyncAuditRepository::record_audit_tx(
                &mut tx,
                &server_event_id,
                &client_event_id,
                &event.terminal_id,
                &event.organization_id,
                &event.branch_id,
                &event.event_type,
                &event.payload,
                "SYNCED",
            ).await {
                let _ = tx.rollback().await;
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({
                        "error": "SERVER_ERROR",
                        "message": format!("Failed to record sync audit in transaction: {e}")
                    })),
                );
            }

            if let Err(e) = tx.commit().await {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({
                        "error": "SERVER_ERROR",
                        "message": format!("Failed to commit sync transaction: {e}")
                    })),
                );
            }
        }
        results.push(json!({
            "client_event_id": client_event_id,
            "server_event_id": server_event_id,
            "status": "SYNCED"
        }));
    }

    (
        StatusCode::OK,
        Json(json!({ "results": results })),
    )
}

/// GET /api/v1/sync/pull — Downstream Delta Reconciliation Pull Handler
async fn sync_pull_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Query(query): axum::extract::Query<niazi_mobile_mart_lib::domain::change_log::DeltaPullQuery>,
) -> impl IntoResponse {
    let pg_pool = match &state.app_state.pg_pool {
        Some(pool) => pool.clone(),
        None => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({
                    "error": "SERVER_ERROR",
                    "message": "Central server running without PostgreSQL pool"
                })),
            );
        }
    };

    let after_seq = query.after_sequence.unwrap_or(0).max(0);
    let limit = query.limit.unwrap_or(100).clamp(1, 500);

    let repo = niazi_mobile_mart_lib::repositories::PostgresChangeLogRepository::new(pg_pool);
    match repo.get_changes(&auth.0.organization_id, after_seq, limit).await {
        Ok(changes) => {
            let next_seq = changes.last().map(|c| c.sequence).unwrap_or(after_seq);
            let has_more = changes.len() as i64 == limit;
            (
                StatusCode::OK,
                Json(json!({
                    "changes": changes,
                    "next_sequence": next_seq,
                    "has_more": has_more
                })),
            )
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({
                "error": "SERVER_ERROR",
                "message": format!("Failed to pull delta changes: {e}")
            })),
        ),
    }
}

// ---------------------------------------------------------------------------
// Graceful Shutdown â€” handles Ctrl+C (dev) and SIGTERM (Cloud Run)
// ---------------------------------------------------------------------------

async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("Failed to install Ctrl+C signal handler");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("Failed to install SIGTERM signal handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => { info!("Ctrl+C received â€” shutting down."); },
        _ = terminate => { info!("SIGTERM received â€” shutting down."); },
    }
}

// ---------------------------------------------------------------------------
// SPA Static Asset Serving & Fallback Handler
// Serves built React SPA assets from STATIC_DIR ("frontend/dist" by default).
// SPA fallback returns index.html for client-side React Router routes.
// Explicitly rejects unknown /api/* requests with JSON 404.
// ---------------------------------------------------------------------------

async fn spa_fallback_handler(req: axum::extract::Request) -> impl IntoResponse {
    let path = req.uri().path().trim_start_matches('/');

    // Safety check: Never let SPA fallback swallow API routes (return 404 JSON for /api/*)
    if path.starts_with("api/") || path == "api" {
        return (
            StatusCode::NOT_FOUND,
            [("content-type", "application/json")],
            json!({"error": "NOT_FOUND", "message": "API endpoint not found"}).to_string(),
        )
            .into_response();
    }

    // Resolve file path in frontend/dist
    let dist_dir = std::env::var("STATIC_DIR").unwrap_or_else(|_| "frontend/dist".to_string());
    let requested_file = std::path::Path::new(&dist_dir).join(path);

    if requested_file.is_file() {
        if let Ok(contents) = std::fs::read(&requested_file) {
            let mime = get_mime_type(&requested_file);
            return (
                StatusCode::OK,
                [("content-type", mime)],
                contents,
            )
                .into_response();
        }
    }

    // SPA fallback: Return index.html for frontend client-side routes
    let index_file = std::path::Path::new(&dist_dir).join("index.html");
    if let Ok(contents) = std::fs::read(&index_file) {
        return (
            StatusCode::OK,
            [("content-type", "text/html; charset=utf-8")],
            contents,
        )
            .into_response();
    }

    (
        StatusCode::NOT_FOUND,
        [("content-type", "text/plain")],
        "Static files not built. Please build frontend.".as_bytes().to_vec(),
    )
        .into_response()
}

fn get_mime_type(path: &std::path::Path) -> &'static str {
    match path.extension().and_then(|ext| ext.to_str()) {
        Some("html") | Some("htm") => "text/html; charset=utf-8",
        Some("js") | Some("mjs") => "application/javascript; charset=utf-8",
        Some("css") => "text/css; charset=utf-8",
        Some("json") => "application/json",
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("svg") => "image/svg+xml",
        Some("ico") => "image/x-icon",
        Some("woff") => "font/woff",
        Some("woff2") => "font/woff2",
        Some("ttf") => "font/ttf",
        _ => "application/octet-stream",
    }
}

