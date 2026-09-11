/// Niazi Mobile Mart — Cloud Run HTTP Server binary
///
/// Architecture contract:
/// - Axum handlers are TRANSPORT ONLY — they call service methods, never raw SQL
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
/// Handlers call service methods on `app_state` — never raw SQL.
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

    info!("Starting Niazi Mobile Mart Cloud Run HTTP Server (Phase 2)...");

    // 2. Resolve port from $PORT env var (Cloud Run sets this automatically)
    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(8080);

    let bind_addr = SocketAddr::from(([0, 0, 0, 0], port));

    // 2b. Require JWT_SECRET environment variable in server mode
    let jwt_secret = match std::env::var("JWT_SECRET") {
        Ok(secret) if !secret.trim().is_empty() => secret,
        _ => {
            error!("FATAL: JWT_SECRET environment variable is missing or empty.");
            error!("Stateless JWT authentication requires JWT_SECRET to be configured in server mode.");
            return Err("JWT_SECRET environment variable is required for server mode".into());
        }
    };

    // 3. Initialize AppState based on DATABASE_URL environment variable
    //    Cloud mode: DATABASE_URL is set -> PostgreSQL repositories (no SQLite initialization!)
    //    Local dev: DATABASE_URL unset -> SQLite repositories
    let app_state = if let Ok(database_url) = std::env::var("DATABASE_URL") {
        match PostgresAdapter::from_url(&database_url).await {
            Ok(pg_adapter) => {
                info!("PostgreSQL connection pool ready — pg_mode: active");
                let pool = pg_adapter.pool().clone();
                Arc::new(AppState::new_postgres("1.0.1", pool).with_jwt_secret(&jwt_secret))
            }
            Err(e) => {
                error!("PostgreSQL initialization failed: {e}");
                error!("DATABASE_URL is set but PostgreSQL is unreachable. Aborting.");
                return Err(e.into());
            }
        }
    } else {
        info!("DATABASE_URL not set — running in SQLite-only mode (local desktop / dev mode)");
        let db_path = niazi_mobile_mart_lib::db::connection::DatabaseConnection::default_db_path();
        let base_state = match niazi_mobile_mart_lib::db::connection::DatabaseConnection::open_file(db_path) {
            Ok(db) => AppState::new_sqlite("1.0.1", db).with_jwt_secret(&jwt_secret),
            Err(e) => {
                warn!("Persistent SQLite path unavailable ({e}) — using in-memory SQLite.");
                AppState::in_memory("1.0.1").with_jwt_secret(&jwt_secret)
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
        .route("/api/auth/login", axum::routing::post(login_handler))
        .route("/api/auth/logout", axum::routing::post(logout_handler))
        .route("/api/auth/me", get(me_handler))
        .route("/api/products", get(list_products_handler).post(create_product_handler))
        .route("/api/products/:id", get(get_product_handler))
        .route("/api/inventory", get(list_inventory_handler))
        .route("/api/sales", axum::routing::post(complete_sale_handler))
        .route("/api/customers", get(list_customers_handler).post(create_customer_handler))
        .route("/api/suppliers", get(list_suppliers_handler).post(create_supplier_handler))
        .route("/api/purchases", axum::routing::post(complete_purchase_handler))
        .route("/api/expenses", get(list_expenses_handler).post(create_expense_handler))
        .route("/api/reports/profit", get(profit_report_handler))
        .fallback(spa_fallback_handler)
        .layer(cors)
        .with_state(server_state);

    // 7. Bind and start
    let listener = tokio::net::TcpListener::bind(bind_addr).await?;
    info!("Niazi Cloud Run HTTP Server listening on http://{bind_addr}");
    info!("  GET  /api/health → {bind_addr}/api/health");
    info!("  GET  /api/v1/health → {bind_addr}/api/v1/health");
    info!("  POST /api/auth/login → {bind_addr}/api/auth/login");
    info!("  POST /api/auth/logout → {bind_addr}/api/auth/logout");
    info!("  GET  /api/auth/me → {bind_addr}/api/auth/me");
    info!("  GET  /api/products → {bind_addr}/api/products");
    info!("  POST /api/products → {bind_addr}/api/products");
    info!("  GET  /api/inventory → {bind_addr}/api/inventory");
    info!("  POST /api/sales → {bind_addr}/api/sales");
    info!("  GET  /api/customers → {bind_addr}/api/customers");
    info!("  POST /api/customers → {bind_addr}/api/customers");
    info!("  GET  /api/suppliers → {bind_addr}/api/suppliers");
    info!("  POST /api/suppliers → {bind_addr}/api/suppliers");
    info!("  POST /api/purchases → {bind_addr}/api/purchases");
    info!("  GET  /api/expenses → {bind_addr}/api/expenses");
    info!("  POST /api/expenses → {bind_addr}/api/expenses");
    info!("  GET  /api/reports/profit → {bind_addr}/api/reports/profit");
    info!("  FALLBACK SPA serving → React dist directory (index.html)");

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
// Route Handlers — TRANSPORT LAYER ONLY
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

/// GET /api/health
/// Infrastructure-level health check.
/// Reports server liveness and active database mode.
/// No service calls required — reads connection state only.
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
// Domain API Handlers — TRANSPORT ONLY WITH STRICT SERVER-SIDE RBAC
// ---------------------------------------------------------------------------

/// GET /api/products — List products with search filter
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

/// GET /api/products/:id — Get product details
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

/// POST /api/products — Create new product
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

/// GET /api/inventory — List inventory stock map with strict branch isolation
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

/// POST /api/sales — Complete retail sale checkout with strict branch isolation
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

/// GET /api/customers — List customers
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

/// POST /api/customers — Create customer
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

/// GET /api/suppliers — List suppliers
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

/// POST /api/suppliers — Create supplier
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

/// POST /api/purchases — Complete purchase with strict branch isolation
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

/// GET /api/expenses — List expenses with strict branch isolation
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

/// POST /api/expenses — Create expense with strict branch isolation
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

/// GET /api/reports/profit — Get profit summary report with strict branch isolation
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

// ---------------------------------------------------------------------------
// Graceful Shutdown — handles Ctrl+C (dev) and SIGTERM (Cloud Run)
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
        _ = ctrl_c => { info!("Ctrl+C received — shutting down."); },
        _ = terminate => { info!("SIGTERM received — shutting down."); },
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

