use axum::{
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Json},
    routing::get,
    Router,
};
use serde_json::json;
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
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| {
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
                error!(
                    "FATAL: DATABASE_URL environment variable is required to execute migrations."
                );
                return Err(
                    "DATABASE_URL environment variable is required for migration mode".into(),
                );
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
    let jwt_private = match std::env::var("JWT_PRIVATE_KEY") {
        Ok(key) if !key.trim().is_empty() => Some(key),
        _ => {
            error!("FATAL: JWT_PRIVATE_KEY environment variable is missing or empty.");
            error!("The server must sign login tokens with the Secret Manager private key; there is no built-in fallback.");
            return Err("JWT_PRIVATE_KEY environment variable is required for server mode".into());
        }
    };
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
                Arc::new(
                    AppState::new_postgres(env!("CARGO_PKG_VERSION"), pool)
                        .with_jwt_keys(jwt_private, jwt_public),
                )
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
        let base_state =
            match niazi_mobile_mart_lib::db::connection::DatabaseConnection::open_file(db_path) {
                Ok(db) => AppState::new_sqlite(env!("CARGO_PKG_VERSION"), db)
                    .with_jwt_keys(jwt_private.clone(), jwt_public.clone()),
                Err(e) => {
                    warn!("Persistent SQLite path unavailable ({e}) â€” using in-memory SQLite.");
                    AppState::in_memory(env!("CARGO_PKG_VERSION"))
                        .with_jwt_keys(jwt_private, jwt_public)
                }
            };
        Arc::new(base_state)
    };

    let server_state = ServerState { app_state };

    // 5. Configure CORS for browser clients — environment-based allowed origins.
    // ALLOWED_ORIGINS env var: comma-separated list of exact origins.
    // Falls back to the canonical Cloud Run service URL.
    // Never allows arbitrary origins in production.
    let cors = {
        use tower_http::cors::AllowOrigin;
        let allowed_origins: Vec<axum::http::HeaderValue> = std::env::var("ALLOWED_ORIGINS")
            .unwrap_or_else(|_| "https://niazi-server-860232188829.asia-south1.run.app".to_string())
            .split(',')
            .filter_map(|s| {
                let trimmed = s.trim();
                if trimmed.is_empty() {
                    None
                } else {
                    trimmed.parse::<axum::http::HeaderValue>().ok()
                }
            })
            .collect();

        CorsLayer::new()
            .allow_origin(AllowOrigin::list(allowed_origins))
            .allow_methods(Any)
            .allow_headers(Any)
    };

    // 6. Build the Axum router
    //    ARCHITECTURE RULE: every route handler must call a service method.
    //    Direct SQL in handlers is PROHIBITED.
    let app = Router::new()
        // ── Health ────────────────────────────────────────────────────────────
        .route("/api/health", get(health_handler))
        .route("/api/v1/health", get(health_handler))
        // ── Auth ──────────────────────────────────────────────────────────────
        .route("/api/auth/bootstrap-status", get(bootstrap_status_handler))
        .route(
            "/api/v1/auth/bootstrap-status",
            get(bootstrap_status_handler),
        )
        .route(
            "/api/auth/bootstrap-first-admin",
            axum::routing::post(bootstrap_first_admin_handler),
        )
        .route(
            "/api/v1/auth/bootstrap-first-admin",
            axum::routing::post(bootstrap_first_admin_handler),
        )
        .route("/api/auth/login", axum::routing::post(login_handler))
        .route("/api/v1/auth/login", axum::routing::post(login_handler))
        .route("/api/auth/logout", axum::routing::post(logout_handler))
        .route("/api/v1/auth/logout", axum::routing::post(logout_handler))
        .route("/api/auth/me", get(me_handler))
        .route("/api/v1/auth/me", get(me_handler))
        .route(
            "/api/v1/auth/change-password",
            axum::routing::post(change_password_handler),
        )
        .route(
            "/api/v1/auth/verify-password",
            axum::routing::post(verify_password_handler),
        )
        // ── Admin Users ───────────────────────────────────────────────────────
        .route(
            "/api/users",
            get(list_users_handler).post(create_user_handler),
        )
        .route(
            "/api/v1/users",
            get(list_users_handler).post(create_user_handler),
        )
        .route(
            "/api/v1/users/credential-snapshots",
            get(credential_snapshots_handler),
        )
        .route(
            "/api/v1/users/:id",
            get(get_user_handler)
                .put(update_user_handler)
                .delete(delete_user_handler),
        )
        .route(
            "/api/v1/users/:id/approve",
            axum::routing::post(approve_staff_handler),
        )
        .route(
            "/api/v1/users/:id/reject",
            axum::routing::post(reject_staff_handler),
        )
        .route(
            "/api/v1/users/:id/reset-password",
            axum::routing::post(reset_staff_password_handler),
        )
        .route(
            "/api/v1/users/:id/reset-credentials",
            axum::routing::post(reset_credentials_handler),
        )
        // ── Catalog ───────────────────────────────────────────────────────────
        .route(
            "/api/v1/catalog/categories",
            get(list_categories_handler).post(create_category_handler),
        )
        .route(
            "/api/v1/catalog/categories/:id",
            get(get_category_handler).put(update_category_handler),
        )
        .route(
            "/api/v1/catalog/brands",
            get(list_brands_handler).post(create_brand_handler),
        )
        .route(
            "/api/v1/catalog/brands/:id",
            get(get_brand_handler).put(update_brand_handler),
        )
        .route(
            "/api/v1/catalog/units",
            get(list_units_handler).post(create_unit_handler),
        )
        .route(
            "/api/v1/catalog/units/:id",
            get(get_unit_handler).put(update_unit_handler),
        )
        .route(
            "/api/v1/catalog/companies",
            get(list_companies_handler).post(create_company_handler),
        )
        .route(
            "/api/v1/catalog/companies/:id",
            get(get_company_handler).put(update_company_handler),
        )
        .route(
            "/api/v1/catalog/qualities",
            get(list_qualities_handler).post(create_quality_handler),
        )
        .route(
            "/api/v1/catalog/qualities/:id",
            get(get_quality_handler).put(update_quality_handler),
        )
        .route(
            "/api/v1/catalog/colors",
            get(list_colors_handler).post(create_color_handler),
        )
        .route(
            "/api/v1/catalog/colors/:id",
            get(get_color_handler).put(update_color_handler),
        )
        // ── Products ──────────────────────────────────────────────────────────
        .route(
            "/api/products",
            get(list_products_handler).post(create_product_handler),
        )
        .route("/api/products/:id", get(get_product_handler))
        .route(
            "/api/v1/products",
            get(list_products_handler).post(create_product_handler),
        )
        .route("/api/v1/products/sku/:sku", get(get_product_by_sku_handler))
        .route(
            "/api/v1/products/barcode/:barcode",
            get(get_product_by_barcode_handler),
        )
        .route(
            "/api/v1/products/:id",
            get(get_product_handler).put(update_product_handler),
        )
        .route(
            "/api/v1/products/:id/deactivate",
            axum::routing::post(deactivate_product_handler),
        )
        // ── Inventory ─────────────────────────────────────────────────────────
        .route("/api/inventory", get(list_inventory_handler))
        .route(
            "/api/v1/inventory/increase",
            axum::routing::post(inventory_increase_handler),
        )
        .route(
            "/api/v1/inventory/decrease",
            axum::routing::post(inventory_decrease_handler),
        )
        .route(
            "/api/v1/inventory/adjust",
            axum::routing::post(inventory_adjust_handler),
        )
        .route(
            "/api/v1/inventory/transfer",
            axum::routing::post(inventory_transfer_handler),
        )
        .route("/api/v1/inventory/stock", get(inventory_get_stock_handler))
        .route(
            "/api/v1/inventory/stock-map",
            get(inventory_get_stock_map_handler),
        )
        .route(
            "/api/v1/inventory/movements",
            get(inventory_get_movements_handler),
        )
        .route(
            "/api/v1/inventory/low-stock",
            get(inventory_get_low_stock_handler),
        )
        // ── Organization / Branches ───────────────────────────────────────────
        .route("/api/v1/organization/branches", get(list_branches_handler))
        .route(
            "/api/v1/organization/branches/main",
            get(get_main_branch_handler),
        )
        .route(
            "/api/v1/organization/dashboard/stats",
            get(dashboard_stats_handler),
        )
        .route(
            "/api/v1/organization/dashboard/balances",
            get(dashboard_balances_handler),
        )
        // ── Customers ─────────────────────────────────────────────────────────
        .route(
            "/api/customers",
            get(list_customers_handler).post(create_customer_handler),
        )
        .route(
            "/api/v1/customers",
            get(list_customers_handler).post(create_customer_handler),
        )
        .route("/api/v1/customers/search", get(search_customers_handler))
        .route(
            "/api/v1/customers/payments",
            axum::routing::post(customer_record_payment_handler),
        )
        .route(
            "/api/v1/customers/:id",
            get(get_customer_detail_handler).put(update_customer_handler),
        )
        .route(
            "/api/v1/customers/:id/balance",
            get(get_customer_balance_handler),
        )
        .route(
            "/api/v1/customers/:id/ledger",
            get(get_customer_ledger_handler),
        )
        .route(
            "/api/v1/customers/:id/statement",
            get(get_customer_statement_handler),
        )
        .route(
            "/api/v1/customers/:id/deactivate",
            axum::routing::post(deactivate_customer_handler),
        )
        // ── Suppliers ─────────────────────────────────────────────────────────
        .route(
            "/api/suppliers",
            get(list_suppliers_handler).post(create_supplier_handler),
        )
        .route(
            "/api/v1/suppliers",
            get(list_suppliers_handler).post(create_supplier_handler),
        )
        .route("/api/v1/suppliers/search", get(search_suppliers_handler))
        .route(
            "/api/v1/suppliers/payments",
            axum::routing::post(supplier_record_payment_handler),
        )
        .route(
            "/api/v1/suppliers/:id",
            get(get_supplier_detail_handler).put(update_supplier_handler),
        )
        .route(
            "/api/v1/suppliers/:id/balance",
            get(get_supplier_balance_handler),
        )
        .route(
            "/api/v1/suppliers/:id/ledger",
            get(get_supplier_ledger_handler),
        )
        .route(
            "/api/v1/suppliers/:id/statement",
            get(get_supplier_statement_handler),
        )
        .route(
            "/api/v1/suppliers/:id/deactivate",
            axum::routing::post(deactivate_supplier_handler),
        )
        // ── Parties (canonical read-only view) ────────────────────────────────
        .route("/api/v1/parties", get(list_parties_handler))
        .route("/api/v1/parties/:id", get(get_party_handler))
        // ── Sales ─────────────────────────────────────────────────────────────
        .route("/api/sales", axum::routing::post(complete_sale_handler))
        .route("/api/v1/sales", axum::routing::post(complete_sale_handler))
        .route("/api/v1/sales/list", get(list_sales_handler))
        .route(
            "/api/v1/sales/invoice/:number",
            get(get_sale_by_invoice_handler),
        )
        .route("/api/v1/sales/:id", get(get_sale_by_id_handler))
        .route("/api/v1/sales/:id/lines", get(get_sale_lines_handler))
        .route("/api/v1/sales/:id/payments", get(get_sale_payments_handler))
        // ── Purchases ─────────────────────────────────────────────────────────
        .route(
            "/api/purchases",
            axum::routing::post(complete_purchase_handler),
        )
        .route(
            "/api/v1/purchases",
            axum::routing::post(complete_purchase_handler),
        )
        .route("/api/v1/purchases/list", get(list_purchases_handler))
        .route(
            "/api/v1/purchases/number/:number",
            get(get_purchase_by_number_handler),
        )
        .route("/api/v1/purchases/:id", get(get_purchase_by_id_handler))
        .route(
            "/api/v1/purchases/:id/lines",
            get(get_purchase_lines_handler),
        )
        // ── Expenses ──────────────────────────────────────────────────────────
        .route(
            "/api/expenses",
            get(list_expenses_handler).post(create_expense_handler),
        )
        .route(
            "/api/v1/expenses",
            get(list_expenses_handler).post(create_expense_handler),
        )
        .route(
            "/api/v1/expenses/categories",
            get(list_expense_categories_handler).post(create_expense_category_handler),
        )
        .route(
            "/api/v1/expenses/categories/:id",
            get(get_expense_category_handler).put(update_expense_category_handler),
        )
        .route("/api/v1/expenses/:id", get(get_expense_by_id_handler))
        .route(
            "/api/v1/expenses/:id/cancel",
            axum::routing::post(cancel_expense_handler),
        )
        // ── Cash Sessions ─────────────────────────────────────────────────────
        .route(
            "/api/v1/cash/sessions/open",
            axum::routing::post(cash_session_open_handler),
        )
        .route(
            "/api/v1/cash/sessions/current",
            get(cash_session_get_current_handler),
        )
        .route("/api/v1/cash/sessions", get(cash_session_list_handler))
        .route(
            "/api/v1/cash/sessions/:id",
            get(cash_session_get_by_id_handler),
        )
        .route(
            "/api/v1/cash/sessions/:id/close",
            axum::routing::post(cash_session_close_handler),
        )
        .route(
            "/api/v1/cash/adjustments",
            axum::routing::post(cash_adjustment_create_handler),
        )
        .route("/api/v1/cash/movements", get(cash_movement_list_handler))
        .route(
            "/api/v1/cash/daily-summary",
            get(cash_daily_summary_handler),
        )
        // ── Sales Returns ─────────────────────────────────────────────────────
        .route(
            "/api/v1/sales-returns/returnable/:sale_id",
            get(sales_return_get_returnable_handler),
        )
        .route(
            "/api/v1/sales-returns",
            get(sales_return_list_handler).post(sales_return_create_handler),
        )
        .route("/api/v1/sales-returns/:id", get(sales_return_get_handler))
        .route(
            "/api/v1/sales-returns/by-sale/:sale_id",
            get(sales_return_get_by_sale_handler),
        )
        // ── Purchase Returns ──────────────────────────────────────────────────
        .route(
            "/api/v1/purchase-returns/returnable/:purchase_id",
            get(purchase_return_get_returnable_handler),
        )
        .route(
            "/api/v1/purchase-returns",
            get(purchase_return_list_handler).post(purchase_return_create_handler),
        )
        .route(
            "/api/v1/purchase-returns/:id",
            get(purchase_return_get_handler),
        )
        .route(
            "/api/v1/purchase-returns/by-purchase/:purchase_id",
            get(purchase_return_get_by_purchase_handler),
        )
        // ── Profitability ─────────────────────────────────────────────────────
        .route("/api/reports/profit", get(profit_report_handler))
        .route("/api/v1/profit/period", get(profit_period_handler))
        .route("/api/v1/profit/daily", get(profit_daily_handler))
        .route("/api/v1/profit/product", get(profit_product_handler))
        .route(
            "/api/v1/profit/dashboard-summary",
            get(profit_dashboard_summary_handler),
        )
        .route("/api/v1/profit/sale/:id", get(profit_sale_handler))
        // ── SPA Fallback ──────────────────────────────────────────────────────
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
    info!("  GET  /api/v1/parties â†’ {bind_addr}/api/v1/parties");
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
            let token = state
                .app_state
                .token_manager
                .create_token(user.clone())
                .await;
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
                niazi_mobile_mart_lib::errors::AppError::Unauthorized(_) => {
                    StatusCode::UNAUTHORIZED
                }
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
    let _ = state
        .app_state
        .token_manager
        .revoke_token(&auth.0.user_id)
        .await;
    (
        StatusCode::OK,
        Json(json!({
            "status": "ok",
            "message": format!("Logged out user {}", auth.0.username),
        })),
    )
}

/// GET /api/auth/me
async fn me_handler(auth: AuthenticatedUser) -> impl IntoResponse {
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
    if let Err(e) = auth
        .0
        .authorize_permission(Some("users"), Some("users:create"))
    {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }

    match AdminService::create_user_direct(&state.app_state.user_repo, payload).await {
        Ok(user) => (StatusCode::CREATED, Json(json!(user))),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "CREATE_USER_FAILED", "message": e.to_string()})),
        ),
    }
}

/// GET /api/v1/users â€” List all users (Admin/Manager)
async fn list_users_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("users"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }

    match state.app_state.user_repo.list_all().await {
        Ok(users) => {
            let sanitized: Vec<_> = users.into_iter().map(|u| u.sanitize()).collect();
            (StatusCode::OK, Json(json!(sanitized)))
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "SERVER_ERROR", "message": e.to_string()})),
        ),
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
                        credential_hash: format!(
                            "{}|{}",
                            u.login_key_hash,
                            u.pin_hash.unwrap_or_default()
                        ),
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
    axum::extract::Query(filter): axum::extract::Query<
        niazi_mobile_mart_lib::domain::product::ProductFilter,
    >,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("products"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }

    match state.app_state.product_service.list_products(filter).await {
        Ok(products) => (StatusCode::OK, Json(json!(products))),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "SERVER_ERROR", "message": e.to_string()})),
        ),
    }
}

/// GET /api/products/:id â€” Get product details
async fn get_product_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("products"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }

    match state.app_state.product_service.get_product(&id).await {
        Ok(product) => (StatusCode::OK, Json(json!(product))),
        Err(e) => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "NOT_FOUND", "message": e.to_string()})),
        ),
    }
}

/// POST /api/products â€” Create new product
async fn create_product_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    Json(payload): Json<niazi_mobile_mart_lib::domain::product::CreateProductDto>,
) -> impl IntoResponse {
    if let Err(e) = auth
        .0
        .authorize_permission(Some("products"), Some("product:create"))
    {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }

    match state
        .app_state
        .product_service
        .create_product(payload, Some(&auth.0.user_id))
        .await
    {
        Ok(product) => (StatusCode::CREATED, Json(json!(product))),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "CREATE_FAILED", "message": e.to_string()})),
        ),
    }
}

/// GET /api/inventory â€” List inventory stock map with strict branch isolation
async fn list_inventory_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Query(params): axum::extract::Query<std::collections::HashMap<String, String>>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("inventory"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }

    let req_branch = params.get("branch_id").map(|s| s.as_str());
    let effective_branch = match auth.0.resolve_branch(req_branch) {
        Ok(bid) => bid,
        Err(e) => {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
            )
        }
    };

    match state
        .app_state
        .inventory_service
        .get_stock_map(&effective_branch)
        .await
    {
        Ok(stock) => (StatusCode::OK, Json(json!(stock))),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "SERVER_ERROR", "message": e.to_string()})),
        ),
    }
}

/// POST /api/sales â€” Complete retail sale checkout with strict branch isolation
async fn complete_sale_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    Json(payload): Json<niazi_mobile_mart_lib::domain::sales::CompleteSaleDto>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("pos"), Some("pos:sale")) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }

    let effective_branch = match auth.0.resolve_branch(payload.branch_id.as_deref()) {
        Ok(bid) => bid,
        Err(e) => {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
            )
        }
    };

    let mut payload = payload;
    payload.branch_id = Some(effective_branch);

    match state
        .app_state
        .sale_service
        .complete_sale(Some(&auth.0.user_id), payload)
        .await
    {
        Ok(result) => (StatusCode::CREATED, Json(json!(result))),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "SALE_FAILED", "message": e.to_string()})),
        ),
    }
}

/// GET /api/customers â€” List customers
async fn list_customers_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Query(filter): axum::extract::Query<
        niazi_mobile_mart_lib::domain::customer::CustomerFilter,
    >,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("customers"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }

    match state
        .app_state
        .customer_service
        .list_customers(filter)
        .await
    {
        Ok(customers) => (StatusCode::OK, Json(json!(customers))),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "SERVER_ERROR", "message": e.to_string()})),
        ),
    }
}

/// POST /api/customers â€” Create customer
async fn create_customer_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    Json(payload): Json<niazi_mobile_mart_lib::domain::customer::CreateCustomerDto>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("customers"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }

    match state
        .app_state
        .customer_service
        .create_customer(payload)
        .await
    {
        Ok(customer) => (StatusCode::CREATED, Json(json!(customer))),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "CREATE_FAILED", "message": e.to_string()})),
        ),
    }
}

/// GET /api/v1/parties — List canonical parties (Phase 1.1, read-only).
/// RBAC: page "parties" (aliases "customers"/"suppliers" in access_control), enforced server-side.
async fn list_parties_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Query(filter): axum::extract::Query<
        niazi_mobile_mart_lib::domain::party::PartyFilter,
    >,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("parties"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }

    match state.app_state.party_service.list_parties(filter).await {
        Ok(parties) => (StatusCode::OK, Json(json!(parties))),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "SERVER_ERROR", "message": e.to_string()})),
        ),
    }
}

/// GET /api/v1/parties/:id — One canonical party with linked roles and balances (read-only).
async fn get_party_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("parties"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }

    match state.app_state.party_service.get_party(&id).await {
        Ok(party) => (StatusCode::OK, Json(json!(party))),
        Err(niazi_mobile_mart_lib::errors::AppError::NotFound(msg)) => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "NOT_FOUND", "message": msg})),
        ),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "SERVER_ERROR", "message": e.to_string()})),
        ),
    }
}

/// GET /api/suppliers â€” List suppliers
async fn list_suppliers_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Query(filter): axum::extract::Query<
        niazi_mobile_mart_lib::domain::supplier::SupplierFilter,
    >,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("suppliers"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }

    match state
        .app_state
        .supplier_service
        .list_suppliers(Some(filter))
        .await
    {
        Ok(suppliers) => (StatusCode::OK, Json(json!(suppliers))),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "SERVER_ERROR", "message": e.to_string()})),
        ),
    }
}

/// POST /api/suppliers â€” Create supplier
async fn create_supplier_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    Json(payload): Json<niazi_mobile_mart_lib::domain::supplier::CreateSupplierDto>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("suppliers"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }

    match state
        .app_state
        .supplier_service
        .create_supplier(payload)
        .await
    {
        Ok(supplier) => (StatusCode::CREATED, Json(json!(supplier))),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "CREATE_FAILED", "message": e.to_string()})),
        ),
    }
}

/// GET /api/v1/customers/:id -- Single customer with financial detail
async fn get_customer_detail_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("customers"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    match state
        .app_state
        .customer_service
        .get_customer_detail(&id)
        .await
    {
        Ok(detail) => (StatusCode::OK, Json(json!(detail))),
        Err(niazi_mobile_mart_lib::errors::AppError::NotFound(msg)) => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "NOT_FOUND", "message": msg})),
        ),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "SERVER_ERROR", "message": e.to_string()})),
        ),
    }
}

/// GET /api/v1/customers/:id/ledger -- Customer ledger statement
async fn get_customer_ledger_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("customers"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    match state.app_state.customer_service.get_statement(&id).await {
        Ok(statement) => (StatusCode::OK, Json(json!(statement))),
        Err(niazi_mobile_mart_lib::errors::AppError::NotFound(msg)) => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "NOT_FOUND", "message": msg})),
        ),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "SERVER_ERROR", "message": e.to_string()})),
        ),
    }
}

/// GET /api/v1/suppliers/:id -- Single supplier with financial detail
async fn get_supplier_detail_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("suppliers"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    match state.app_state.supplier_service.get_detail(&id).await {
        Ok(detail) => (StatusCode::OK, Json(json!(detail))),
        Err(niazi_mobile_mart_lib::errors::AppError::NotFound(msg)) => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "NOT_FOUND", "message": msg})),
        ),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "SERVER_ERROR", "message": e.to_string()})),
        ),
    }
}

/// GET /api/v1/suppliers/:id/ledger -- Supplier ledger statement
async fn get_supplier_ledger_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("suppliers"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    match state.app_state.supplier_service.get_statement(&id).await {
        Ok(statement) => (StatusCode::OK, Json(json!(statement))),
        Err(niazi_mobile_mart_lib::errors::AppError::NotFound(msg)) => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "NOT_FOUND", "message": msg})),
        ),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "SERVER_ERROR", "message": e.to_string()})),
        ),
    }
}
/// POST /api/purchases â€” Complete purchase with strict branch isolation
async fn complete_purchase_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    Json(payload): Json<niazi_mobile_mart_lib::domain::purchases::CompletePurchaseDto>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("purchases"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }

    let effective_branch = match auth.0.resolve_branch(payload.branch_id.as_deref()) {
        Ok(bid) => bid,
        Err(e) => {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
            )
        }
    };

    let mut payload = payload;
    payload.branch_id = Some(effective_branch);

    match state
        .app_state
        .purchase_service
        .complete_purchase(Some(&auth.0.user_id), payload)
        .await
    {
        Ok(result) => (StatusCode::CREATED, Json(json!(result))),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "PURCHASE_FAILED", "message": e.to_string()})),
        ),
    }
}

/// GET /api/expenses â€” List expenses with strict branch isolation
async fn list_expenses_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Query(filter): axum::extract::Query<
        niazi_mobile_mart_lib::domain::expense::ExpenseFilterDto,
    >,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("expenses"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }

    let effective_branch = match auth.0.resolve_branch(filter.branch_id.as_deref()) {
        Ok(bid) => bid,
        Err(e) => {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
            )
        }
    };

    let mut filter = filter;
    filter.branch_id = Some(effective_branch);

    match state.app_state.expense_service.list_expenses(filter).await {
        Ok(expenses) => (StatusCode::OK, Json(json!(expenses))),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "SERVER_ERROR", "message": e.to_string()})),
        ),
    }
}

/// POST /api/expenses â€” Create expense with strict branch isolation
async fn create_expense_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    Json(payload): Json<niazi_mobile_mart_lib::domain::expense::CreateExpenseDto>,
) -> impl IntoResponse {
    if let Err(e) = auth
        .0
        .authorize_permission(Some("expenses"), Some("expense:create"))
    {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }

    let effective_branch = match auth.0.resolve_branch(payload.branch_id.as_deref()) {
        Ok(bid) => bid,
        Err(e) => {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
            )
        }
    };

    let mut payload = payload;
    payload.branch_id = Some(effective_branch);

    match state
        .app_state
        .expense_service
        .create_expense(Some(&auth.0.user_id), payload)
        .await
    {
        Ok(expense) => (StatusCode::CREATED, Json(json!(expense))),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "CREATE_FAILED", "message": e.to_string()})),
        ),
    }
}

/// GET /api/reports/profit â€” Get profit summary report with strict branch isolation
async fn profit_report_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Query(params): axum::extract::Query<std::collections::HashMap<String, String>>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("reports"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }

    let req_branch = params.get("branch_id").map(|s| s.as_str());
    let effective_branch = match auth.0.resolve_branch(req_branch) {
        Ok(bid) => bid,
        Err(e) => {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
            )
        }
    };

    let start_date = params.get("start_date").cloned();
    let end_date = params.get("end_date").cloned();

    match state
        .app_state
        .profit_service
        .get_period_profitability(start_date, end_date, Some(effective_branch))
        .await
    {
        Ok(summary) => (StatusCode::OK, Json(json!(summary))),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "SERVER_ERROR", "message": e.to_string()})),
        ),
    }
}

// ---------------------------------------------------------------------------
// Auth — change password & verify password
// ---------------------------------------------------------------------------

/// POST /api/v1/auth/change-password — Change authenticated user's own password
async fn change_password_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    Json(payload): Json<serde_json::Value>,
) -> impl IntoResponse {
    let old_password = match payload.get("old_password").and_then(|v| v.as_str()) {
        Some(p) => p.to_string(),
        None => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "VALIDATION", "message": "old_password is required"})),
            )
        }
    };
    let new_password = match payload.get("new_password").and_then(|v| v.as_str()) {
        Some(p) => p.to_string(),
        None => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "VALIDATION", "message": "new_password is required"})),
            )
        }
    };

    // Verify old password first
    use niazi_mobile_mart_lib::services::AdminService;
    match AdminService::verify_admin_password(
        &state.app_state.user_repo,
        &state.app_state,
        &old_password,
    )
    .await
    {
        Ok(true) => {}
        Ok(false) => {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({"error": "FORBIDDEN", "message": "Current password is incorrect"})),
            )
        }
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": "SERVER_ERROR", "message": e.to_string()})),
            )
        }
    }

    // Reset password for this user
    let reset_payload = niazi_mobile_mart_lib::services::admin_service::ResetCredentialsPayload {
        user_id: auth.0.user_id.clone(),
        new_login_key: None,
        new_pin: None,
        new_password: Some(new_password),
    };
    match AdminService::reset_credentials(
        &state.app_state.user_repo,
        &state.app_state,
        reset_payload,
    )
    .await
    {
        Ok(_) => (
            StatusCode::OK,
            Json(json!({"message": "Password changed successfully"})),
        ),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "CHANGE_FAILED", "message": e.to_string()})),
        ),
    }
}

/// POST /api/v1/auth/verify-password — Verify admin password for protected operations
async fn verify_password_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    Json(payload): Json<serde_json::Value>,
) -> impl IntoResponse {
    let password = match payload.get("password").and_then(|v| v.as_str()) {
        Some(p) => p.to_string(),
        None => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "VALIDATION", "message": "password is required"})),
            )
        }
    };

    if let Err(e) = auth.0.authorize_permission(Some("admin"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }

    use niazi_mobile_mart_lib::services::AdminService;
    match AdminService::verify_admin_password(
        &state.app_state.user_repo,
        &state.app_state,
        &password,
    )
    .await
    {
        Ok(valid) => (StatusCode::OK, Json(json!({"valid": valid}))),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "SERVER_ERROR", "message": e.to_string()})),
        ),
    }
}

// ---------------------------------------------------------------------------
// Admin User CRUD
// ---------------------------------------------------------------------------

/// GET /api/v1/users/:id — Get single user by id (Admin only)
async fn get_user_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("users"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    match state.app_state.user_repo.find_by_id(&id).await {
        Ok(Some(user)) => (StatusCode::OK, Json(json!(user.sanitize()))),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "NOT_FOUND", "message": "User not found"})),
        ),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "SERVER_ERROR", "message": e.to_string()})),
        ),
    }
}

/// PUT /api/v1/users/:id — Update user (Admin only)
async fn update_user_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Path(id): axum::extract::Path<String>,
    Json(mut payload): Json<niazi_mobile_mart_lib::services::admin_service::UpdateUserPayload>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("admin"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    payload.user_id = id;
    use niazi_mobile_mart_lib::services::AdminService;
    match AdminService::update_user(&state.app_state.user_repo, &state.app_state, payload).await {
        Ok(user) => (StatusCode::OK, Json(json!(user.sanitize()))),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "UPDATE_FAILED", "message": e.to_string()})),
        ),
    }
}

/// DELETE /api/v1/users/:id — Delete user (Admin only)
async fn delete_user_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("admin"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    use niazi_mobile_mart_lib::services::AdminService;
    match AdminService::delete_user(&state.app_state.user_repo, &state.app_state, &id).await {
        Ok(_) => (StatusCode::OK, Json(json!({"message": "User deleted"}))),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "DELETE_FAILED", "message": e.to_string()})),
        ),
    }
}

/// POST /api/v1/users/:id/approve — Approve staff user (Admin only)
async fn approve_staff_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("admin"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    use niazi_mobile_mart_lib::services::AdminService;
    match AdminService::approve_staff(&state.app_state.user_repo, &state.app_state, &id).await {
        Ok(user) => (StatusCode::OK, Json(json!(user.sanitize()))),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "APPROVE_FAILED", "message": e.to_string()})),
        ),
    }
}

/// POST /api/v1/users/:id/reject — Reject staff user (Admin only)
async fn reject_staff_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("admin"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    use niazi_mobile_mart_lib::services::AdminService;
    match AdminService::reject_staff(&state.app_state.user_repo, &state.app_state, &id).await {
        Ok(user) => (StatusCode::OK, Json(json!(user.sanitize()))),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "REJECT_FAILED", "message": e.to_string()})),
        ),
    }
}

/// POST /api/v1/users/:id/reset-password — Reset staff password (Admin only)
async fn reset_staff_password_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Path(id): axum::extract::Path<String>,
    Json(payload): Json<serde_json::Value>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("admin"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    let temp_password = match payload.get("temp_password").and_then(|v| v.as_str()) {
        Some(p) => p.to_string(),
        None => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "VALIDATION", "message": "temp_password is required"})),
            )
        }
    };
    use niazi_mobile_mart_lib::services::AdminService;
    match AdminService::reset_staff_password(
        &state.app_state.user_repo,
        &state.app_state,
        &id,
        &temp_password,
    )
    .await
    {
        Ok(user) => (StatusCode::OK, Json(json!(user.sanitize()))),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "RESET_FAILED", "message": e.to_string()})),
        ),
    }
}

/// POST /api/v1/users/:id/reset-credentials — Reset credentials (Admin only)
async fn reset_credentials_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Path(id): axum::extract::Path<String>,
    Json(mut payload): Json<
        niazi_mobile_mart_lib::services::admin_service::ResetCredentialsPayload,
    >,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("admin"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    payload.user_id = id;
    use niazi_mobile_mart_lib::services::AdminService;
    match AdminService::reset_credentials(&state.app_state.user_repo, &state.app_state, payload)
        .await
    {
        Ok(user) => (StatusCode::OK, Json(json!(user.sanitize()))),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "RESET_FAILED", "message": e.to_string()})),
        ),
    }
}

// ---------------------------------------------------------------------------
// Catalog — categories, brands, units, companies, qualities, colors
// ---------------------------------------------------------------------------

async fn list_categories_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("catalog"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    match state.app_state.catalog_service.list_categories().await {
        Ok(items) => (StatusCode::OK, Json(json!(items))),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "SERVER_ERROR", "message": e.to_string()})),
        ),
    }
}

async fn create_category_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    Json(payload): Json<niazi_mobile_mart_lib::domain::catalog::CreateCategoryDto>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("catalog"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    match state
        .app_state
        .catalog_service
        .create_category(payload)
        .await
    {
        Ok(item) => (StatusCode::CREATED, Json(json!(item))),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "CREATE_FAILED", "message": e.to_string()})),
        ),
    }
}

async fn get_category_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("catalog"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    match state.app_state.catalog_service.get_category(&id).await {
        Ok(item) => (StatusCode::OK, Json(json!(item))),
        Err(niazi_mobile_mart_lib::errors::AppError::NotFound(msg)) => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "NOT_FOUND", "message": msg})),
        ),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "SERVER_ERROR", "message": e.to_string()})),
        ),
    }
}

async fn update_category_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Path(id): axum::extract::Path<String>,
    Json(payload): Json<niazi_mobile_mart_lib::domain::catalog::UpdateCategoryDto>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("catalog"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    match state
        .app_state
        .catalog_service
        .update_category(&id, payload)
        .await
    {
        Ok(item) => (StatusCode::OK, Json(json!(item))),
        Err(niazi_mobile_mart_lib::errors::AppError::NotFound(msg)) => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "NOT_FOUND", "message": msg})),
        ),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "UPDATE_FAILED", "message": e.to_string()})),
        ),
    }
}

async fn list_brands_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("catalog"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    match state.app_state.catalog_service.list_brands().await {
        Ok(items) => (StatusCode::OK, Json(json!(items))),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "SERVER_ERROR", "message": e.to_string()})),
        ),
    }
}

async fn create_brand_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    Json(payload): Json<niazi_mobile_mart_lib::domain::catalog::CreateBrandDto>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("catalog"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    match state.app_state.catalog_service.create_brand(payload).await {
        Ok(item) => (StatusCode::CREATED, Json(json!(item))),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "CREATE_FAILED", "message": e.to_string()})),
        ),
    }
}

async fn get_brand_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("catalog"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    match state.app_state.catalog_service.get_brand(&id).await {
        Ok(item) => (StatusCode::OK, Json(json!(item))),
        Err(niazi_mobile_mart_lib::errors::AppError::NotFound(msg)) => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "NOT_FOUND", "message": msg})),
        ),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "SERVER_ERROR", "message": e.to_string()})),
        ),
    }
}

async fn update_brand_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Path(id): axum::extract::Path<String>,
    Json(payload): Json<niazi_mobile_mart_lib::domain::catalog::UpdateBrandDto>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("catalog"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    match state
        .app_state
        .catalog_service
        .update_brand(&id, payload)
        .await
    {
        Ok(item) => (StatusCode::OK, Json(json!(item))),
        Err(niazi_mobile_mart_lib::errors::AppError::NotFound(msg)) => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "NOT_FOUND", "message": msg})),
        ),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "UPDATE_FAILED", "message": e.to_string()})),
        ),
    }
}

async fn list_units_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("catalog"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    match state.app_state.catalog_service.list_units().await {
        Ok(items) => (StatusCode::OK, Json(json!(items))),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "SERVER_ERROR", "message": e.to_string()})),
        ),
    }
}

async fn create_unit_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    Json(payload): Json<niazi_mobile_mart_lib::domain::catalog::CreateUnitDto>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("catalog"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    match state.app_state.catalog_service.create_unit(payload).await {
        Ok(item) => (StatusCode::CREATED, Json(json!(item))),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "CREATE_FAILED", "message": e.to_string()})),
        ),
    }
}

async fn get_unit_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("catalog"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    match state.app_state.catalog_service.get_unit(&id).await {
        Ok(item) => (StatusCode::OK, Json(json!(item))),
        Err(niazi_mobile_mart_lib::errors::AppError::NotFound(msg)) => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "NOT_FOUND", "message": msg})),
        ),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "SERVER_ERROR", "message": e.to_string()})),
        ),
    }
}

async fn update_unit_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Path(id): axum::extract::Path<String>,
    Json(payload): Json<niazi_mobile_mart_lib::domain::catalog::UpdateUnitDto>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("catalog"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    match state
        .app_state
        .catalog_service
        .update_unit(&id, payload)
        .await
    {
        Ok(item) => (StatusCode::OK, Json(json!(item))),
        Err(niazi_mobile_mart_lib::errors::AppError::NotFound(msg)) => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "NOT_FOUND", "message": msg})),
        ),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "UPDATE_FAILED", "message": e.to_string()})),
        ),
    }
}

async fn list_companies_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("catalog"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    match state.app_state.catalog_service.list_companies().await {
        Ok(items) => (StatusCode::OK, Json(json!(items))),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "SERVER_ERROR", "message": e.to_string()})),
        ),
    }
}

async fn create_company_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    Json(payload): Json<niazi_mobile_mart_lib::domain::catalog::CreateCompanyDto>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("catalog"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    match state
        .app_state
        .catalog_service
        .create_company(payload)
        .await
    {
        Ok(item) => (StatusCode::CREATED, Json(json!(item))),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "CREATE_FAILED", "message": e.to_string()})),
        ),
    }
}

async fn get_company_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("catalog"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    match state.app_state.catalog_service.get_company(&id).await {
        Ok(item) => (StatusCode::OK, Json(json!(item))),
        Err(niazi_mobile_mart_lib::errors::AppError::NotFound(msg)) => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "NOT_FOUND", "message": msg})),
        ),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "SERVER_ERROR", "message": e.to_string()})),
        ),
    }
}

async fn update_company_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Path(id): axum::extract::Path<String>,
    Json(payload): Json<niazi_mobile_mart_lib::domain::catalog::UpdateCompanyDto>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("catalog"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    match state
        .app_state
        .catalog_service
        .update_company(&id, payload)
        .await
    {
        Ok(item) => (StatusCode::OK, Json(json!(item))),
        Err(niazi_mobile_mart_lib::errors::AppError::NotFound(msg)) => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "NOT_FOUND", "message": msg})),
        ),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "UPDATE_FAILED", "message": e.to_string()})),
        ),
    }
}

async fn list_qualities_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("catalog"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    match state.app_state.catalog_service.list_qualities().await {
        Ok(items) => (StatusCode::OK, Json(json!(items))),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "SERVER_ERROR", "message": e.to_string()})),
        ),
    }
}

async fn create_quality_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    Json(payload): Json<niazi_mobile_mart_lib::domain::catalog::CreateQualityDto>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("catalog"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    match state
        .app_state
        .catalog_service
        .create_quality(payload)
        .await
    {
        Ok(item) => (StatusCode::CREATED, Json(json!(item))),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "CREATE_FAILED", "message": e.to_string()})),
        ),
    }
}

async fn get_quality_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("catalog"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    match state.app_state.catalog_service.get_quality(&id).await {
        Ok(item) => (StatusCode::OK, Json(json!(item))),
        Err(niazi_mobile_mart_lib::errors::AppError::NotFound(msg)) => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "NOT_FOUND", "message": msg})),
        ),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "SERVER_ERROR", "message": e.to_string()})),
        ),
    }
}

async fn update_quality_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Path(id): axum::extract::Path<String>,
    Json(payload): Json<niazi_mobile_mart_lib::domain::catalog::UpdateQualityDto>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("catalog"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    match state
        .app_state
        .catalog_service
        .update_quality(&id, payload)
        .await
    {
        Ok(item) => (StatusCode::OK, Json(json!(item))),
        Err(niazi_mobile_mart_lib::errors::AppError::NotFound(msg)) => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "NOT_FOUND", "message": msg})),
        ),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "UPDATE_FAILED", "message": e.to_string()})),
        ),
    }
}

async fn list_colors_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("catalog"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    match state.app_state.catalog_service.list_colors().await {
        Ok(items) => (StatusCode::OK, Json(json!(items))),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "SERVER_ERROR", "message": e.to_string()})),
        ),
    }
}

async fn create_color_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    Json(payload): Json<niazi_mobile_mart_lib::domain::catalog::CreateColorDto>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("catalog"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    match state.app_state.catalog_service.create_color(payload).await {
        Ok(item) => (StatusCode::CREATED, Json(json!(item))),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "CREATE_FAILED", "message": e.to_string()})),
        ),
    }
}

async fn get_color_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("catalog"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    match state.app_state.catalog_service.get_color(&id).await {
        Ok(item) => (StatusCode::OK, Json(json!(item))),
        Err(niazi_mobile_mart_lib::errors::AppError::NotFound(msg)) => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "NOT_FOUND", "message": msg})),
        ),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "SERVER_ERROR", "message": e.to_string()})),
        ),
    }
}

async fn update_color_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Path(id): axum::extract::Path<String>,
    Json(payload): Json<niazi_mobile_mart_lib::domain::catalog::UpdateColorDto>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("catalog"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    match state
        .app_state
        .catalog_service
        .update_color(&id, payload)
        .await
    {
        Ok(item) => (StatusCode::OK, Json(json!(item))),
        Err(niazi_mobile_mart_lib::errors::AppError::NotFound(msg)) => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "NOT_FOUND", "message": msg})),
        ),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "UPDATE_FAILED", "message": e.to_string()})),
        ),
    }
}

// ---------------------------------------------------------------------------
// Products — extended routes
// ---------------------------------------------------------------------------

/// PUT /api/v1/products/:id — Update product
async fn update_product_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Path(id): axum::extract::Path<String>,
    Json(payload): Json<niazi_mobile_mart_lib::domain::product::UpdateProductDto>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("products"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    match state
        .app_state
        .product_service
        .update_product(&id, payload)
        .await
    {
        Ok(product) => (StatusCode::OK, Json(json!(product))),
        Err(niazi_mobile_mart_lib::errors::AppError::NotFound(msg)) => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "NOT_FOUND", "message": msg})),
        ),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "UPDATE_FAILED", "message": e.to_string()})),
        ),
    }
}

/// GET /api/v1/products/sku/:sku — Get product by SKU
async fn get_product_by_sku_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Path(sku): axum::extract::Path<String>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("products"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    match state
        .app_state
        .product_service
        .get_product_by_sku(&sku)
        .await
    {
        Ok(product) => (StatusCode::OK, Json(json!(product))),
        Err(niazi_mobile_mart_lib::errors::AppError::NotFound(msg)) => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "NOT_FOUND", "message": msg})),
        ),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "SERVER_ERROR", "message": e.to_string()})),
        ),
    }
}

/// GET /api/v1/products/barcode/:barcode — Get product by barcode
async fn get_product_by_barcode_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Path(barcode): axum::extract::Path<String>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("products"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    match state
        .app_state
        .product_service
        .get_product_by_barcode(&barcode)
        .await
    {
        Ok(product) => (StatusCode::OK, Json(json!(product))),
        Err(niazi_mobile_mart_lib::errors::AppError::NotFound(msg)) => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "NOT_FOUND", "message": msg})),
        ),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "SERVER_ERROR", "message": e.to_string()})),
        ),
    }
}

/// POST /api/v1/products/:id/deactivate — Deactivate product
async fn deactivate_product_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> impl IntoResponse {
    if let Err(e) = auth
        .0
        .authorize_permission(Some("products"), Some("product:admin"))
    {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    match state
        .app_state
        .product_service
        .deactivate_product(&id)
        .await
    {
        Ok(_) => (
            StatusCode::OK,
            Json(json!({"message": "Product deactivated"})),
        ),
        Err(niazi_mobile_mart_lib::errors::AppError::NotFound(msg)) => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "NOT_FOUND", "message": msg})),
        ),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "DEACTIVATE_FAILED", "message": e.to_string()})),
        ),
    }
}

// ---------------------------------------------------------------------------
// Inventory — full CRUD
// ---------------------------------------------------------------------------

/// POST /api/v1/inventory/increase — Increase stock
async fn inventory_increase_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    Json(payload): Json<niazi_mobile_mart_lib::domain::inventory::IncreaseStockDto>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("inventory"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    match state
        .app_state
        .inventory_service
        .increase_stock(payload, Some(&auth.0.user_id))
        .await
    {
        Ok(new_qty) => (StatusCode::OK, Json(json!({"new_quantity": new_qty}))),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "INCREASE_FAILED", "message": e.to_string()})),
        ),
    }
}

/// POST /api/v1/inventory/decrease — Decrease stock
async fn inventory_decrease_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    Json(payload): Json<niazi_mobile_mart_lib::domain::inventory::DecreaseStockDto>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("inventory"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    match state
        .app_state
        .inventory_service
        .decrease_stock(payload, Some(&auth.0.user_id))
        .await
    {
        Ok(new_qty) => (StatusCode::OK, Json(json!({"new_quantity": new_qty}))),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "DECREASE_FAILED", "message": e.to_string()})),
        ),
    }
}

/// POST /api/v1/inventory/adjust — Adjust stock
async fn inventory_adjust_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    Json(payload): Json<niazi_mobile_mart_lib::domain::inventory::AdjustStockDto>,
) -> impl IntoResponse {
    if let Err(e) = auth
        .0
        .authorize_permission(Some("inventory"), Some("inventory:adjust"))
    {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    match state
        .app_state
        .inventory_service
        .adjust_stock(payload, Some(&auth.0.user_id))
        .await
    {
        Ok(new_qty) => (StatusCode::OK, Json(json!({"new_quantity": new_qty}))),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "ADJUST_FAILED", "message": e.to_string()})),
        ),
    }
}

/// POST /api/v1/inventory/transfer — Transfer stock between branches
async fn inventory_transfer_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    Json(payload): Json<niazi_mobile_mart_lib::domain::inventory::TransferStockDto>,
) -> impl IntoResponse {
    if let Err(e) = auth
        .0
        .authorize_permission(Some("inventory"), Some("inventory:transfer"))
    {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    match state
        .app_state
        .inventory_service
        .transfer_stock(payload, Some(&auth.0.user_id))
        .await
    {
        Ok(_) => (
            StatusCode::OK,
            Json(json!({"message": "Stock transferred successfully"})),
        ),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "TRANSFER_FAILED", "message": e.to_string()})),
        ),
    }
}

/// GET /api/v1/inventory/stock — Get stock for product+branch
async fn inventory_get_stock_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Query(params): axum::extract::Query<std::collections::HashMap<String, String>>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("inventory"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    let product_id = match params.get("product_id") {
        Some(id) => id.clone(),
        None => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "VALIDATION", "message": "product_id is required"})),
            )
        }
    };
    let req_branch = params.get("branch_id").map(|s| s.as_str());
    let effective_branch = match auth.0.resolve_branch(req_branch) {
        Ok(b) => b,
        Err(e) => {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
            )
        }
    };
    match state
        .app_state
        .inventory_service
        .get_stock(&product_id, &effective_branch)
        .await
    {
        Ok(qty) => (StatusCode::OK, Json(json!({"quantity": qty}))),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "SERVER_ERROR", "message": e.to_string()})),
        ),
    }
}

/// GET /api/v1/inventory/movements — List inventory movements
async fn inventory_get_movements_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Query(params): axum::extract::Query<std::collections::HashMap<String, String>>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("inventory"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    let product_id = params.get("product_id").cloned();
    let req_branch = params.get("branch_id").map(|s| s.as_str());
    let effective_branch = match auth.0.resolve_branch(req_branch) {
        Ok(b) => b,
        Err(e) => {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
            )
        }
    };
    let limit: u32 = params
        .get("limit")
        .and_then(|l| l.parse().ok())
        .unwrap_or(50);
    match state
        .app_state
        .inventory_service
        .list_movements(product_id.as_deref(), &effective_branch, limit)
        .await
    {
        Ok(movements) => (StatusCode::OK, Json(json!(movements))),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "SERVER_ERROR", "message": e.to_string()})),
        ),
    }
}

/// GET /api/v1/inventory/low-stock — Get low stock items
async fn inventory_get_low_stock_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Query(params): axum::extract::Query<std::collections::HashMap<String, String>>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("inventory"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    let req_branch = params.get("branch_id").map(|s| s.as_str());
    let effective_branch = match auth.0.resolve_branch(req_branch) {
        Ok(b) => b,
        Err(e) => {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
            )
        }
    };
    match state
        .app_state
        .inventory_service
        .get_low_stock(&effective_branch)
        .await
    {
        Ok(items) => (StatusCode::OK, Json(json!(items))),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "SERVER_ERROR", "message": e.to_string()})),
        ),
    }
}

// ---------------------------------------------------------------------------
// Organization & Branches
// ---------------------------------------------------------------------------

async fn list_branches_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(None, None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    match state.app_state.branch_repo.list_branches().await {
        Ok(branches) => (StatusCode::OK, Json(json!(branches))),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "SERVER_ERROR", "message": e.to_string()})),
        ),
    }
}

async fn get_main_branch_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(None, None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    match state.app_state.branch_repo.get_main_branch().await {
        Ok(Some(branch)) => (StatusCode::OK, Json(json!(branch))),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "NOT_FOUND", "message": "Main branch not found"})),
        ),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "SERVER_ERROR", "message": e.to_string()})),
        ),
    }
}

async fn dashboard_stats_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(None, None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    match state.app_state.branch_repo.get_dashboard_stats().await {
        Ok(stats) => (StatusCode::OK, Json(json!(stats))),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "SERVER_ERROR", "message": e.to_string()})),
        ),
    }
}

async fn dashboard_balances_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(None, None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    match state.app_state.branch_repo.get_dashboard_balances().await {
        Ok(balances) => (StatusCode::OK, Json(json!(balances))),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "SERVER_ERROR", "message": e.to_string()})),
        ),
    }
}

// ---------------------------------------------------------------------------
// Customers — extended routes
// ---------------------------------------------------------------------------

async fn update_customer_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Path(id): axum::extract::Path<String>,
    Json(payload): Json<niazi_mobile_mart_lib::domain::customer::UpdateCustomerDto>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("customers"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    match state
        .app_state
        .customer_service
        .update_customer(&id, payload)
        .await
    {
        Ok(customer) => (StatusCode::OK, Json(json!(customer))),
        Err(niazi_mobile_mart_lib::errors::AppError::NotFound(msg)) => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "NOT_FOUND", "message": msg})),
        ),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "UPDATE_FAILED", "message": e.to_string()})),
        ),
    }
}

async fn search_customers_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Query(params): axum::extract::Query<std::collections::HashMap<String, String>>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("customers"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    let query = params.get("q").map(|s| s.as_str()).unwrap_or("");
    match state
        .app_state
        .customer_service
        .search_customers(query)
        .await
    {
        Ok(results) => (StatusCode::OK, Json(json!(results))),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "SERVER_ERROR", "message": e.to_string()})),
        ),
    }
}

async fn get_customer_balance_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("customers"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    match state.app_state.customer_service.get_balance(&id).await {
        Ok(balance) => (StatusCode::OK, Json(json!({"balance": balance}))),
        Err(niazi_mobile_mart_lib::errors::AppError::NotFound(msg)) => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "NOT_FOUND", "message": msg})),
        ),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "SERVER_ERROR", "message": e.to_string()})),
        ),
    }
}

async fn get_customer_statement_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("customers"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    match state.app_state.customer_service.get_statement(&id).await {
        Ok(stmt) => (StatusCode::OK, Json(json!(stmt))),
        Err(niazi_mobile_mart_lib::errors::AppError::NotFound(msg)) => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "NOT_FOUND", "message": msg})),
        ),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "SERVER_ERROR", "message": e.to_string()})),
        ),
    }
}

async fn customer_record_payment_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    Json(payload): Json<niazi_mobile_mart_lib::domain::customer::RecordCustomerPaymentDto>,
) -> impl IntoResponse {
    if let Err(e) = auth
        .0
        .authorize_permission(Some("customers"), Some("customer:payment"))
    {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    match state
        .app_state
        .customer_service
        .record_customer_payment(Some(&auth.0.user_id), payload)
        .await
    {
        Ok(result) => (StatusCode::CREATED, Json(json!(result))),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "PAYMENT_FAILED", "message": e.to_string()})),
        ),
    }
}

async fn deactivate_customer_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> impl IntoResponse {
    if let Err(e) = auth
        .0
        .authorize_permission(Some("customers"), Some("customer:admin"))
    {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    match state
        .app_state
        .customer_service
        .deactivate_customer(&id)
        .await
    {
        Ok(_) => (
            StatusCode::OK,
            Json(json!({"message": "Customer deactivated"})),
        ),
        Err(niazi_mobile_mart_lib::errors::AppError::NotFound(msg)) => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "NOT_FOUND", "message": msg})),
        ),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "DEACTIVATE_FAILED", "message": e.to_string()})),
        ),
    }
}

// ---------------------------------------------------------------------------
// Suppliers — extended routes
// ---------------------------------------------------------------------------

async fn update_supplier_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Path(id): axum::extract::Path<String>,
    Json(payload): Json<niazi_mobile_mart_lib::domain::supplier::UpdateSupplierDto>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("suppliers"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    match state
        .app_state
        .supplier_service
        .update_supplier(&id, payload)
        .await
    {
        Ok(supplier) => (StatusCode::OK, Json(json!(supplier))),
        Err(niazi_mobile_mart_lib::errors::AppError::NotFound(msg)) => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "NOT_FOUND", "message": msg})),
        ),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "UPDATE_FAILED", "message": e.to_string()})),
        ),
    }
}

async fn search_suppliers_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Query(params): axum::extract::Query<std::collections::HashMap<String, String>>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("suppliers"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    let query = params.get("q").map(|s| s.as_str()).unwrap_or("");
    match state
        .app_state
        .supplier_service
        .search_suppliers(query)
        .await
    {
        Ok(results) => (StatusCode::OK, Json(json!(results))),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "SERVER_ERROR", "message": e.to_string()})),
        ),
    }
}

async fn get_supplier_balance_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("suppliers"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    match state
        .app_state
        .supplier_service
        .get_outstanding_balance(&id)
        .await
    {
        Ok(balance) => (StatusCode::OK, Json(json!({"balance": balance}))),
        Err(niazi_mobile_mart_lib::errors::AppError::NotFound(msg)) => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "NOT_FOUND", "message": msg})),
        ),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "SERVER_ERROR", "message": e.to_string()})),
        ),
    }
}

async fn get_supplier_statement_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("suppliers"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    match state.app_state.supplier_service.get_statement(&id).await {
        Ok(stmt) => (StatusCode::OK, Json(json!(stmt))),
        Err(niazi_mobile_mart_lib::errors::AppError::NotFound(msg)) => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "NOT_FOUND", "message": msg})),
        ),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "SERVER_ERROR", "message": e.to_string()})),
        ),
    }
}

async fn supplier_record_payment_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    Json(payload): Json<niazi_mobile_mart_lib::domain::supplier::RecordSupplierPaymentDto>,
) -> impl IntoResponse {
    if let Err(e) = auth
        .0
        .authorize_permission(Some("suppliers"), Some("supplier:payment"))
    {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    match state
        .app_state
        .purchase_service
        .record_supplier_payment(Some(&auth.0.user_id), payload)
        .await
    {
        Ok(result) => (StatusCode::CREATED, Json(json!(result))),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "PAYMENT_FAILED", "message": e.to_string()})),
        ),
    }
}

async fn deactivate_supplier_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> impl IntoResponse {
    if let Err(e) = auth
        .0
        .authorize_permission(Some("suppliers"), Some("supplier:admin"))
    {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    match state
        .app_state
        .supplier_service
        .deactivate_supplier(&id)
        .await
    {
        Ok(_) => (
            StatusCode::OK,
            Json(json!({"message": "Supplier deactivated"})),
        ),
        Err(niazi_mobile_mart_lib::errors::AppError::NotFound(msg)) => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "NOT_FOUND", "message": msg})),
        ),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "DEACTIVATE_FAILED", "message": e.to_string()})),
        ),
    }
}

// ---------------------------------------------------------------------------
// Sales — list and get routes
// ---------------------------------------------------------------------------

async fn list_sales_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Query(filter): axum::extract::Query<
        niazi_mobile_mart_lib::domain::sales::SaleFilterDto,
    >,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("sales"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    let effective_branch = match auth.0.resolve_branch(filter.branch_id.as_deref()) {
        Ok(b) => b,
        Err(e) => {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
            )
        }
    };
    let mut filter = filter;
    filter.branch_id = Some(effective_branch);
    match state.app_state.sale_service.list_sales(filter).await {
        Ok(sales) => (StatusCode::OK, Json(json!(sales))),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "SERVER_ERROR", "message": e.to_string()})),
        ),
    }
}

async fn get_sale_by_id_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("sales"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    match state.app_state.sale_service.get_sale_by_id(&id).await {
        Ok(Some(sale)) => (StatusCode::OK, Json(json!(sale))),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "NOT_FOUND", "message": "Sale not found"})),
        ),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "SERVER_ERROR", "message": e.to_string()})),
        ),
    }
}

async fn get_sale_by_invoice_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Path(number): axum::extract::Path<String>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("sales"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    match state
        .app_state
        .sale_service
        .get_sale_by_invoice(&number)
        .await
    {
        Ok(Some(sale)) => (StatusCode::OK, Json(json!(sale))),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "NOT_FOUND", "message": "Sale not found"})),
        ),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "SERVER_ERROR", "message": e.to_string()})),
        ),
    }
}

async fn get_sale_lines_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("sales"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    match state.app_state.sale_service.get_sale_lines(&id).await {
        Ok(lines) => (StatusCode::OK, Json(json!(lines))),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "SERVER_ERROR", "message": e.to_string()})),
        ),
    }
}

async fn get_sale_payments_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("sales"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    match state.app_state.sale_service.get_sale_payments(&id).await {
        Ok(payments) => (StatusCode::OK, Json(json!(payments))),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "SERVER_ERROR", "message": e.to_string()})),
        ),
    }
}

// ---------------------------------------------------------------------------
// Purchases — list and get routes
// ---------------------------------------------------------------------------

async fn list_purchases_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Query(filter): axum::extract::Query<
        niazi_mobile_mart_lib::domain::purchases::PurchaseFilterDto,
    >,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("purchases"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    let effective_branch = match auth.0.resolve_branch(filter.branch_id.as_deref()) {
        Ok(b) => b,
        Err(e) => {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
            )
        }
    };
    let mut filter = filter;
    filter.branch_id = Some(effective_branch);
    match state
        .app_state
        .purchase_service
        .list_purchases(Some(filter))
        .await
    {
        Ok(purchases) => (StatusCode::OK, Json(json!(purchases))),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "SERVER_ERROR", "message": e.to_string()})),
        ),
    }
}

async fn get_purchase_by_id_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("purchases"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    match state
        .app_state
        .purchase_service
        .get_purchase_by_id(&id)
        .await
    {
        Ok(Some(purchase)) => (StatusCode::OK, Json(json!(purchase))),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "NOT_FOUND", "message": "Purchase not found"})),
        ),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "SERVER_ERROR", "message": e.to_string()})),
        ),
    }
}

async fn get_purchase_by_number_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Path(number): axum::extract::Path<String>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("purchases"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    match state
        .app_state
        .purchase_service
        .get_purchase_by_number(&number)
        .await
    {
        Ok(Some(purchase)) => (StatusCode::OK, Json(json!(purchase))),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "NOT_FOUND", "message": "Purchase not found"})),
        ),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "SERVER_ERROR", "message": e.to_string()})),
        ),
    }
}

async fn get_purchase_lines_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("purchases"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    match state
        .app_state
        .purchase_service
        .get_purchase_lines(&id)
        .await
    {
        Ok(lines) => (StatusCode::OK, Json(json!(lines))),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "SERVER_ERROR", "message": e.to_string()})),
        ),
    }
}

// ---------------------------------------------------------------------------
// Expenses — categories and items
// ---------------------------------------------------------------------------

async fn list_expense_categories_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Query(params): axum::extract::Query<std::collections::HashMap<String, String>>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("expenses"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    let active_only = params
        .get("active_only")
        .map(|v| v == "true")
        .unwrap_or(false);
    match state
        .app_state
        .expense_service
        .list_categories(active_only)
        .await
    {
        Ok(cats) => (StatusCode::OK, Json(json!(cats))),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "SERVER_ERROR", "message": e.to_string()})),
        ),
    }
}

async fn create_expense_category_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    Json(payload): Json<niazi_mobile_mart_lib::domain::expense::CreateExpenseCategoryDto>,
) -> impl IntoResponse {
    if let Err(e) = auth
        .0
        .authorize_permission(Some("expenses"), Some("expense:admin"))
    {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    match state
        .app_state
        .expense_service
        .create_category(payload)
        .await
    {
        Ok(cat) => (StatusCode::CREATED, Json(json!(cat))),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "CREATE_FAILED", "message": e.to_string()})),
        ),
    }
}

async fn get_expense_category_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("expenses"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    match state
        .app_state
        .expense_service
        .get_category_by_id(&id)
        .await
    {
        Ok(cat) => (StatusCode::OK, Json(json!(cat))),
        Err(niazi_mobile_mart_lib::errors::AppError::NotFound(msg)) => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "NOT_FOUND", "message": msg})),
        ),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "SERVER_ERROR", "message": e.to_string()})),
        ),
    }
}

async fn update_expense_category_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Path(id): axum::extract::Path<String>,
    Json(payload): Json<niazi_mobile_mart_lib::domain::expense::UpdateExpenseCategoryDto>,
) -> impl IntoResponse {
    if let Err(e) = auth
        .0
        .authorize_permission(Some("expenses"), Some("expense:admin"))
    {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    match state
        .app_state
        .expense_service
        .update_category(&id, payload)
        .await
    {
        Ok(cat) => (StatusCode::OK, Json(json!(cat))),
        Err(niazi_mobile_mart_lib::errors::AppError::NotFound(msg)) => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "NOT_FOUND", "message": msg})),
        ),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "UPDATE_FAILED", "message": e.to_string()})),
        ),
    }
}

async fn get_expense_by_id_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("expenses"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    match state.app_state.expense_service.get_expense_by_id(&id).await {
        Ok(expense) => (StatusCode::OK, Json(json!(expense))),
        Err(niazi_mobile_mart_lib::errors::AppError::NotFound(msg)) => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "NOT_FOUND", "message": msg})),
        ),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "SERVER_ERROR", "message": e.to_string()})),
        ),
    }
}

async fn cancel_expense_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> impl IntoResponse {
    if let Err(e) = auth
        .0
        .authorize_permission(Some("expenses"), Some("expense:cancel"))
    {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    match state
        .app_state
        .expense_service
        .cancel_expense(Some(&auth.0.user_id), &id)
        .await
    {
        Ok(_) => (
            StatusCode::OK,
            Json(json!({"message": "Expense cancelled"})),
        ),
        Err(niazi_mobile_mart_lib::errors::AppError::NotFound(msg)) => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "NOT_FOUND", "message": msg})),
        ),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "CANCEL_FAILED", "message": e.to_string()})),
        ),
    }
}

// ---------------------------------------------------------------------------
// Cash Sessions
// ---------------------------------------------------------------------------

async fn cash_session_open_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    Json(payload): Json<niazi_mobile_mart_lib::domain::cash::OpenCashSessionDto>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("cash"), Some("cash:open")) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    match state
        .app_state
        .cash_service
        .open_session(Some(&auth.0.user_id), payload)
        .await
    {
        Ok(session) => (StatusCode::CREATED, Json(json!(session))),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "OPEN_FAILED", "message": e.to_string()})),
        ),
    }
}

async fn cash_session_get_current_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Query(params): axum::extract::Query<std::collections::HashMap<String, String>>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("cash"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    let req_branch = params.get("branch_id").map(|s| s.as_str());
    let effective_branch = match auth.0.resolve_branch(req_branch) {
        Ok(b) => b,
        Err(e) => {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
            )
        }
    };
    match state
        .app_state
        .cash_service
        .get_current_session(Some(&effective_branch))
        .await
    {
        Ok(Some(session)) => (StatusCode::OK, Json(json!(session))),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "NOT_FOUND", "message": "No open cash session"})),
        ),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "SERVER_ERROR", "message": e.to_string()})),
        ),
    }
}

async fn cash_session_list_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Query(params): axum::extract::Query<std::collections::HashMap<String, String>>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("cash"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    let req_branch = params.get("branch_id").map(|s| s.as_str());
    let effective_branch = match auth.0.resolve_branch(req_branch) {
        Ok(b) => b,
        Err(e) => {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
            )
        }
    };
    let limit: Option<i64> = params.get("limit").and_then(|l| l.parse().ok());
    let offset: Option<i64> = params.get("offset").and_then(|o| o.parse().ok());
    match state
        .app_state
        .cash_service
        .list_sessions(Some(&effective_branch), limit, offset)
        .await
    {
        Ok(sessions) => (StatusCode::OK, Json(json!(sessions))),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "SERVER_ERROR", "message": e.to_string()})),
        ),
    }
}

async fn cash_session_get_by_id_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("cash"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    match state.app_state.cash_service.get_session_by_id(&id).await {
        Ok(session) => (StatusCode::OK, Json(json!(session))),
        Err(niazi_mobile_mart_lib::errors::AppError::NotFound(msg)) => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "NOT_FOUND", "message": msg})),
        ),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "SERVER_ERROR", "message": e.to_string()})),
        ),
    }
}

async fn cash_session_close_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Path(_id): axum::extract::Path<String>,
    Json(payload): Json<niazi_mobile_mart_lib::domain::cash::CloseCashSessionDto>,
) -> impl IntoResponse {
    if let Err(e) = auth
        .0
        .authorize_permission(Some("cash"), Some("cash:close"))
    {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    match state
        .app_state
        .cash_service
        .close_session(Some(&auth.0.user_id), payload)
        .await
    {
        Ok(session) => (StatusCode::OK, Json(json!(session))),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "CLOSE_FAILED", "message": e.to_string()})),
        ),
    }
}

async fn cash_adjustment_create_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    Json(payload): Json<niazi_mobile_mart_lib::domain::cash::CreateCashAdjustmentDto>,
) -> impl IntoResponse {
    if let Err(e) = auth
        .0
        .authorize_permission(Some("cash"), Some("cash:adjust"))
    {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    match state
        .app_state
        .cash_service
        .create_adjustment(Some(&auth.0.user_id), payload)
        .await
    {
        Ok(movement) => (StatusCode::CREATED, Json(json!(movement))),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "ADJUSTMENT_FAILED", "message": e.to_string()})),
        ),
    }
}

async fn cash_movement_list_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Query(filter): axum::extract::Query<
        niazi_mobile_mart_lib::domain::cash::CashMovementFilterDto,
    >,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("cash"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    match state
        .app_state
        .cash_service
        .list_movements(Some(filter))
        .await
    {
        Ok(movements) => (StatusCode::OK, Json(json!(movements))),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "SERVER_ERROR", "message": e.to_string()})),
        ),
    }
}

async fn cash_daily_summary_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Query(params): axum::extract::Query<std::collections::HashMap<String, String>>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("cash"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    let req_branch = params.get("branch_id").map(|s| s.as_str());
    let effective_branch = match auth.0.resolve_branch(req_branch) {
        Ok(b) => b,
        Err(e) => {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
            )
        }
    };
    let date = params.get("date").cloned();
    match state
        .app_state
        .cash_service
        .get_daily_summary(&effective_branch, date.as_deref())
        .await
    {
        Ok(summary) => (StatusCode::OK, Json(json!(summary))),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "SERVER_ERROR", "message": e.to_string()})),
        ),
    }
}

// ---------------------------------------------------------------------------
// Sales Returns
// ---------------------------------------------------------------------------

async fn sales_return_get_returnable_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Path(sale_id): axum::extract::Path<String>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("sales"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    match state
        .app_state
        .sales_return_service
        .get_sale_returnable_info(&sale_id)
        .await
    {
        Ok(info) => (StatusCode::OK, Json(json!(info))),
        Err(niazi_mobile_mart_lib::errors::AppError::NotFound(msg)) => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "NOT_FOUND", "message": msg})),
        ),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "SERVER_ERROR", "message": e.to_string()})),
        ),
    }
}

async fn sales_return_create_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    Json(payload): Json<niazi_mobile_mart_lib::domain::sales_return::CreateSalesReturnDto>,
) -> impl IntoResponse {
    if let Err(e) = auth
        .0
        .authorize_permission(Some("sales"), Some("sales:return"))
    {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    match state
        .app_state
        .sales_return_service
        .create_sales_return(payload, Some(&auth.0.user_id))
        .await
    {
        Ok(ret) => (StatusCode::CREATED, Json(json!(ret))),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "RETURN_FAILED", "message": e.to_string()})),
        ),
    }
}

async fn sales_return_get_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("sales"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    match state
        .app_state
        .sales_return_service
        .get_sales_return(&id)
        .await
    {
        Ok(Some(ret)) => (StatusCode::OK, Json(json!(ret))),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "NOT_FOUND", "message": "Sales return not found"})),
        ),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "SERVER_ERROR", "message": e.to_string()})),
        ),
    }
}

async fn sales_return_list_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Query(params): axum::extract::Query<std::collections::HashMap<String, String>>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("sales"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    let req_branch = params.get("branch_id").map(|s| s.as_str());
    let effective_branch = match auth.0.resolve_branch(req_branch) {
        Ok(b) => b,
        Err(e) => {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
            )
        }
    };
    let limit: Option<i64> = params.get("limit").and_then(|l| l.parse().ok());
    match state
        .app_state
        .sales_return_service
        .list_sales_returns(Some(&effective_branch), limit)
        .await
    {
        Ok(returns) => (StatusCode::OK, Json(json!(returns))),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "SERVER_ERROR", "message": e.to_string()})),
        ),
    }
}

async fn sales_return_get_by_sale_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Path(sale_id): axum::extract::Path<String>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("sales"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    match state
        .app_state
        .sales_return_service
        .get_sales_returns_by_sale(&sale_id)
        .await
    {
        Ok(returns) => (StatusCode::OK, Json(json!(returns))),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "SERVER_ERROR", "message": e.to_string()})),
        ),
    }
}

// ---------------------------------------------------------------------------
// Purchase Returns
// ---------------------------------------------------------------------------

async fn purchase_return_get_returnable_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Path(purchase_id): axum::extract::Path<String>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("purchases"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    match state
        .app_state
        .purchase_return_service
        .get_purchase_returnable_info(&purchase_id)
        .await
    {
        Ok(info) => (StatusCode::OK, Json(json!(info))),
        Err(niazi_mobile_mart_lib::errors::AppError::NotFound(msg)) => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "NOT_FOUND", "message": msg})),
        ),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "SERVER_ERROR", "message": e.to_string()})),
        ),
    }
}

async fn purchase_return_create_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    Json(payload): Json<niazi_mobile_mart_lib::domain::purchase_return::CreatePurchaseReturnDto>,
) -> impl IntoResponse {
    if let Err(e) = auth
        .0
        .authorize_permission(Some("purchases"), Some("purchases:return"))
    {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    match state
        .app_state
        .purchase_return_service
        .create_purchase_return(payload, Some(&auth.0.user_id))
        .await
    {
        Ok(ret) => (StatusCode::CREATED, Json(json!(ret))),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "RETURN_FAILED", "message": e.to_string()})),
        ),
    }
}

async fn purchase_return_get_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("purchases"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    match state
        .app_state
        .purchase_return_service
        .get_purchase_return(&id)
        .await
    {
        Ok(Some(ret)) => (StatusCode::OK, Json(json!(ret))),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "NOT_FOUND", "message": "Purchase return not found"})),
        ),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "SERVER_ERROR", "message": e.to_string()})),
        ),
    }
}

async fn purchase_return_list_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Query(params): axum::extract::Query<std::collections::HashMap<String, String>>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("purchases"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    let req_branch = params.get("branch_id").map(|s| s.as_str());
    let effective_branch = match auth.0.resolve_branch(req_branch) {
        Ok(b) => b,
        Err(e) => {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
            )
        }
    };
    let limit: Option<i64> = params.get("limit").and_then(|l| l.parse().ok());
    match state
        .app_state
        .purchase_return_service
        .list_purchase_returns(Some(&effective_branch), limit)
        .await
    {
        Ok(returns) => (StatusCode::OK, Json(json!(returns))),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "SERVER_ERROR", "message": e.to_string()})),
        ),
    }
}

async fn purchase_return_get_by_purchase_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Path(purchase_id): axum::extract::Path<String>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("purchases"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    match state
        .app_state
        .purchase_return_service
        .get_purchase_returns_by_purchase(&purchase_id)
        .await
    {
        Ok(returns) => (StatusCode::OK, Json(json!(returns))),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "SERVER_ERROR", "message": e.to_string()})),
        ),
    }
}

// ---------------------------------------------------------------------------
// Profitability — full suite
// ---------------------------------------------------------------------------

async fn profit_period_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Query(params): axum::extract::Query<std::collections::HashMap<String, String>>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("reports"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    let req_branch = params.get("branch_id").map(|s| s.as_str());
    let effective_branch = match auth.0.resolve_branch(req_branch) {
        Ok(b) => b,
        Err(e) => {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
            )
        }
    };
    let start_date = params.get("start_date").cloned();
    let end_date = params.get("end_date").cloned();
    match state
        .app_state
        .profit_service
        .get_period_profitability(start_date, end_date, Some(effective_branch))
        .await
    {
        Ok(result) => (StatusCode::OK, Json(json!(result))),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "SERVER_ERROR", "message": e.to_string()})),
        ),
    }
}

async fn profit_daily_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Query(params): axum::extract::Query<std::collections::HashMap<String, String>>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("reports"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    let req_branch = params.get("branch_id").map(|s| s.as_str());
    let effective_branch = match auth.0.resolve_branch(req_branch) {
        Ok(b) => b,
        Err(e) => {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
            )
        }
    };
    let start_date = params.get("start_date").cloned();
    let end_date = params.get("end_date").cloned();
    match state
        .app_state
        .profit_service
        .get_daily_profitability(start_date, end_date, Some(effective_branch))
        .await
    {
        Ok(result) => (StatusCode::OK, Json(json!(result))),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "SERVER_ERROR", "message": e.to_string()})),
        ),
    }
}

async fn profit_product_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Query(params): axum::extract::Query<std::collections::HashMap<String, String>>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("reports"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    let product_id = match params.get("product_id") {
        Some(id) => id.clone(),
        None => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "VALIDATION", "message": "product_id is required"})),
            )
        }
    };
    let req_branch = params.get("branch_id").map(|s| s.as_str());
    let effective_branch = match auth.0.resolve_branch(req_branch) {
        Ok(b) => b,
        Err(e) => {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
            )
        }
    };
    let start_date = params.get("start_date").cloned();
    let end_date = params.get("end_date").cloned();
    match state
        .app_state
        .profit_service
        .get_product_profitability(&product_id, start_date, end_date, Some(effective_branch))
        .await
    {
        Ok(result) => (StatusCode::OK, Json(json!(result))),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "SERVER_ERROR", "message": e.to_string()})),
        ),
    }
}

async fn profit_dashboard_summary_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Query(params): axum::extract::Query<std::collections::HashMap<String, String>>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("reports"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    let req_branch = params.get("branch_id").map(|s| s.as_str());
    let effective_branch = match auth.0.resolve_branch(req_branch) {
        Ok(b) => b,
        Err(e) => {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
            )
        }
    };
    match state
        .app_state
        .profit_service
        .get_dashboard_profit_summary(Some(effective_branch))
        .await
    {
        Ok(summary) => (StatusCode::OK, Json(json!(summary))),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "SERVER_ERROR", "message": e.to_string()})),
        ),
    }
}

async fn profit_sale_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> impl IntoResponse {
    if let Err(e) = auth.0.authorize_permission(Some("reports"), None) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "FORBIDDEN", "message": e.to_string()})),
        );
    }
    match state
        .app_state
        .profit_service
        .get_sale_profitability(&id)
        .await
    {
        Ok(Some(result)) => (StatusCode::OK, Json(json!(result))),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "NOT_FOUND", "message": "Sale profitability not found"})),
        ),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "SERVER_ERROR", "message": e.to_string()})),
        ),
    }
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
        if let Err(e) = auth
            .0
            .validate_context(Some(&event.organization_id), Some(&event.branch_id))
        {
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

            // --- JIT TERMINAL AUTO-REGISTRATION ---
            // Ensure terminal exists using authoritative server-side identity context.
            // DO NOT use ON CONFLICT DO UPDATE to prevent unauthorized reassignment.
            let now = chrono::Utc::now().to_rfc3339();
            if let Err(e) = sqlx::query(
                "INSERT INTO terminals (id, organization_id, branch_id, device_name, is_active, is_offline_terminal, registered_centrally, created_at, updated_at, last_seen_at) 
                 VALUES ($1, $2, $3, 'Auto-Registered Terminal', 1, 0, 1, $4, $4, $4) 
                 ON CONFLICT (id) DO NOTHING"
            )
            .bind(&event.terminal_id)
            .bind(&auth.0.organization_id)
            .bind(&event.branch_id)
            .bind(&now)
            .execute(&mut *tx)
            .await {
                let _ = tx.rollback().await;
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({
                        "error": "SERVER_ERROR",
                        "message": format!("Failed to auto-register terminal: {e}")
                    })),
                );
            }

            // Verify terminal ownership (protects against malicious reassignment if terminal already existed)
            let terminal_org_res: Result<String, sqlx::Error> =
                sqlx::query_scalar("SELECT organization_id FROM terminals WHERE id = $1")
                    .bind(&event.terminal_id)
                    .fetch_one(&mut *tx)
                    .await;

            match terminal_org_res {
                Ok(org_id) => {
                    if org_id != auth.0.organization_id {
                        let _ = tx.rollback().await;
                        return (
                            StatusCode::FORBIDDEN,
                            Json(json!({
                                "error": "FORBIDDEN",
                                "message": "Access denied: Terminal is registered to a different organization"
                            })),
                        );
                    }
                }
                Err(e) => {
                    let _ = tx.rollback().await;
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(json!({
                            "error": "SERVER_ERROR",
                            "message": format!("Failed to verify terminal ownership: {e}")
                        })),
                    );
                }
            }
            // --- END JIT TERMINAL AUTO-REGISTRATION ---

            if event.event_type == "SALE_CREATED" {
                let (sale_id, change_payload) = match serde_json::from_str::<niazi_mobile_mart_lib::domain::sales::SaleSyncEventDto>(&event.payload) {
                    Ok(sync_dto) => {
                        match niazi_mobile_mart_lib::repositories::PostgresSaleRepository::insert_canonical_sale_tx(
                            &mut tx,
                            &sync_dto,
                        ).await {
                            Ok(_) => {
                                let payload_str = serde_json::to_string(&sync_dto).unwrap_or_default();
                                (sync_dto.sale.id.clone(), payload_str)
                            }
                            Err(niazi_mobile_mart_lib::errors::AppError::NotFound(msg)) => {
                                let _ = tx.rollback().await;
                                results.push(json!({
                                    "client_event_id": client_event_id,
                                    "status": "DEPENDENCY_NOT_FOUND",
                                    "error": format!("Missing prerequisite entity for SALE_CREATED: {msg}")
                                }));
                                continue;
                            }
                            Err(e) => {
                                let _ = tx.rollback().await;
                                return (
                                    StatusCode::INTERNAL_SERVER_ERROR,
                                    Json(json!({
                                        "error": "SERVER_ERROR",
                                        "message": format!("Failed to project canonical SALE_CREATED event centrally: {e}")
                                    })),
                                );
                            }
                        }
                    }
                    Err(_) => {
                        let dto: niazi_mobile_mart_lib::domain::sales::CompleteSaleDto = match serde_json::from_str(&event.payload) {
                            Ok(d) => d,
                            Err(e) => {
                                let _ = tx.rollback().await;
                                return (
                                    StatusCode::BAD_REQUEST,
                                    Json(json!({
                                        "error": "BAD_REQUEST",
                                        "message": format!("Invalid SALE_CREATED payload (neither canonical nor legacy): {e}")
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
                            Err(niazi_mobile_mart_lib::errors::AppError::NotFound(msg)) => {
                                let _ = tx.rollback().await;
                                results.push(json!({
                                    "client_event_id": client_event_id,
                                    "status": "DEPENDENCY_NOT_FOUND",
                                    "error": format!("Missing prerequisite entity for SALE_CREATED: {msg}")
                                }));
                                continue;
                            }
                            Err(e) => {
                                let _ = tx.rollback().await;
                                return (
                                    StatusCode::INTERNAL_SERVER_ERROR,
                                    Json(json!({
                                        "error": "SERVER_ERROR",
                                        "message": format!("Failed to project legacy SALE_CREATED event centrally: {e}")
                                    })),
                                );
                            }
                        };
                        let payload_str = serde_json::to_string(&sale_result).unwrap_or_default();
                        (sale_result.sale.id.clone(), payload_str)
                    }
                };

                if let Err(e) = niazi_mobile_mart_lib::repositories::PostgresChangeLogRepository::append_change_log_tx(
                    &mut tx,
                    &event.organization_id,
                    &event.branch_id,
                    Some(&client_event_id),
                    "SALE_CREATED",
                    "SALE",
                    &sale_id,
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

            if event.event_type == "SALES_RETURN_CREATED" {
                let sync_dto: niazi_mobile_mart_lib::domain::sales_return::SalesReturnSyncEventDto =
                    match serde_json::from_str(&event.payload) {
                        Ok(d) => d,
                        Err(e) => {
                            let _ = tx.rollback().await;
                            return (
                                StatusCode::BAD_REQUEST,
                                Json(json!({
                                    "error": "BAD_REQUEST",
                                    "message": format!("Invalid SALES_RETURN_CREATED payload: {e}")
                                })),
                            );
                        }
                    };

                match niazi_mobile_mart_lib::repositories::PostgresSalesReturnRepository::insert_canonical_sales_return_tx(
                    &mut tx,
                    &sync_dto,
                ).await {
                    Ok(_) => {}
                    Err(niazi_mobile_mart_lib::errors::AppError::NotFound(msg)) => {
                        let _ = tx.rollback().await;
                        results.push(json!({
                            "client_event_id": client_event_id,
                            "status": "DEPENDENCY_NOT_FOUND",
                            "error": format!("Missing prerequisite entity for SALES_RETURN_CREATED: {msg}")
                        }));
                        continue;
                    }
                    Err(e) => {
                        let _ = tx.rollback().await;
                        return (
                            StatusCode::INTERNAL_SERVER_ERROR,
                            Json(json!({
                                "error": "SERVER_ERROR",
                                "message": format!("Failed to project canonical SALES_RETURN_CREATED event centrally: {e}")
                            })),
                        );
                    }
                }

                let change_payload = match serde_json::to_string(&sync_dto) {
                    Ok(p) => p,
                    Err(e) => {
                        let _ = tx.rollback().await;
                        return (
                            StatusCode::INTERNAL_SERVER_ERROR,
                            Json(json!({
                                "error": "SERVER_ERROR",
                                "message": format!("Failed to serialize SALES_RETURN_CREATED change_log payload: {e}")
                            })),
                        );
                    }
                };

                if let Err(e) = niazi_mobile_mart_lib::repositories::PostgresChangeLogRepository::append_change_log_tx(
                    &mut tx,
                    &event.organization_id,
                    &event.branch_id,
                    Some(&client_event_id),
                    "SALES_RETURN_CREATED",
                    "SALES_RETURN",
                    &sync_dto.sales_return.id,
                    &change_payload,
                ).await {
                    let _ = tx.rollback().await;
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(json!({
                            "error": "SERVER_ERROR",
                            "message": format!("Failed to append SALES_RETURN_CREATED to change_log: {e}")
                        })),
                    );
                }
            }

            if event.event_type == "PURCHASE_CREATED" {
                let sync_event: niazi_mobile_mart_lib::domain::purchases::PurchaseSyncEventDto =
                    match serde_json::from_str(&event.payload) {
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

                let purchase_result = match niazi_mobile_mart_lib::repositories::PostgresPurchaseRepository::sync_purchase_tx(
                    &mut tx,
                    &sync_event,
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

            if event.event_type == "PURCHASE_RETURN_CREATED" {
                let sync_event: niazi_mobile_mart_lib::domain::purchase_return::PurchaseReturnSyncEventDto = match serde_json::from_str(&event.payload) {
                    Ok(d) => d,
                    Err(e) => {
                        let _ = tx.rollback().await;
                        return (
                            StatusCode::BAD_REQUEST,
                            Json(json!({
                                "error": "BAD_REQUEST",
                                "message": format!("Invalid PURCHASE_RETURN_CREATED payload: {e}")
                            })),
                        );
                    }
                };

                let return_result = match niazi_mobile_mart_lib::repositories::PostgresPurchaseReturnRepository::sync_purchase_return_tx(
                    &mut tx,
                    &sync_event,
                ).await {
                    Ok(res) => res,
                    Err(e) => {
                        let _ = tx.rollback().await;
                        return (
                            StatusCode::INTERNAL_SERVER_ERROR,
                            Json(json!({
                                "error": "SERVER_ERROR",
                                "message": format!("Failed to project PURCHASE_RETURN_CREATED event centrally: {e}")
                            })),
                        );
                    }
                };

                let change_payload = match serde_json::to_string(&return_result) {
                    Ok(p) => p,
                    Err(e) => {
                        let _ = tx.rollback().await;
                        return (
                            StatusCode::INTERNAL_SERVER_ERROR,
                            Json(json!({
                                "error": "SERVER_ERROR",
                                "message": format!("Failed to serialize PURCHASE_RETURN_CREATED change_log payload: {e}")
                            })),
                        );
                    }
                };

                if let Err(e) = niazi_mobile_mart_lib::repositories::PostgresChangeLogRepository::append_change_log_tx(
                    &mut tx,
                    &event.organization_id,
                    &event.branch_id,
                    Some(&client_event_id),
                    "PURCHASE_RETURN_CREATED",
                    "PURCHASE_RETURN",
                    &return_result.purchase_return.id,
                    &change_payload,
                ).await {
                    let _ = tx.rollback().await;
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(json!({
                            "error": "SERVER_ERROR",
                            "message": format!("Failed to append PURCHASE_RETURN_CREATED to change_log: {e}")
                        })),
                    );
                }
            }

            if event.event_type == "EXPENSE_CREATED" {
                let dto: niazi_mobile_mart_lib::domain::expense::CreateExpenseDto =
                    match serde_json::from_str(&event.payload) {
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
                let product: niazi_mobile_mart_lib::domain::product::Product =
                    match serde_json::from_str(&event.payload) {
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

                // Auto-heal missing master data for the central database and append corresponding change_log events
                let now = chrono::Utc::now().to_rfc3339();

                macro_rules! auto_heal {
                    ($sql:expr, $id:expr, $name_val:expr, $domain_type:ident, $event_type:expr, $entity_type:expr) => {
                        match sqlx::query($sql).bind($id).bind(&now).execute(&mut *tx).await {
                            Ok(result) => {
                                if result.rows_affected() > 0 {
                                    let entity = niazi_mobile_mart_lib::domain::catalog::$domain_type {
                                        id: $id.clone(),
                                        name: $name_val.to_string(),
                                        code: $id.clone(),
                                        description: None,
                                        is_active: true,
                                        created_at: now.clone(),
                                        updated_at: now.clone(),
                                    };
                                    let payload = serde_json::to_string(&entity).unwrap();
                                    if let Err(e) = niazi_mobile_mart_lib::repositories::PostgresChangeLogRepository::append_change_log_tx(
                                        &mut tx,
                                        &event.organization_id,
                                        &event.branch_id,
                                        None,
                                        $event_type,
                                        $entity_type,
                                        $id,
                                        &payload,
                                    ).await {
                                        let _ = tx.rollback().await;
                                        return (
                                            StatusCode::INTERNAL_SERVER_ERROR,
                                            Json(json!({
                                                "error": "SERVER_ERROR",
                                                "message": format!("Failed to append {} to change_log: {}", $event_type, e)
                                            })),
                                        );
                                    }
                                }
                            }
                            Err(e) => {
                                let _ = tx.rollback().await;
                                return (
                                    StatusCode::INTERNAL_SERVER_ERROR,
                                    Json(json!({
                                        "error": "SERVER_ERROR",
                                        "message": format!("Failed to auto-heal master data {}: {}", $entity_type, e)
                                    })),
                                );
                            }
                        }
                    };
                }

                auto_heal!(
                    "INSERT INTO categories (id, name, code, is_active, created_at, updated_at) VALUES ($1, 'Auto-Synced Category', $1, 1, $2, $2) ON CONFLICT DO NOTHING",
                    &product.category_id, "Auto-Synced Category", Category, "CATEGORY_CREATED", "CATEGORY"
                );

                if let Some(brand_id) = &product.brand_id {
                    auto_heal!(
                        "INSERT INTO brands (id, name, code, is_active, created_at, updated_at) VALUES ($1, 'Auto-Synced Brand', $1, 1, $2, $2) ON CONFLICT DO NOTHING",
                        brand_id, "Auto-Synced Brand", Brand, "BRAND_CREATED", "BRAND"
                    );
                }
                if let Some(company_id) = &product.company_id {
                    auto_heal!(
                        "INSERT INTO companies (id, name, code, is_active, created_at, updated_at) VALUES ($1, 'Auto-Synced Company', $1, 1, $2, $2) ON CONFLICT DO NOTHING",
                        company_id, "Auto-Synced Company", Company, "COMPANY_CREATED", "COMPANY"
                    );
                }
                if let Some(quality_id) = &product.quality_id {
                    auto_heal!(
                        "INSERT INTO qualities (id, name, code, is_active, created_at, updated_at) VALUES ($1, 'Auto-Synced Quality', $1, 1, $2, $2) ON CONFLICT DO NOTHING",
                        quality_id, "Auto-Synced Quality", Quality, "QUALITY_CREATED", "QUALITY"
                    );
                }
                if let Some(color_id) = &product.color_id {
                    auto_heal!(
                        "INSERT INTO colors (id, name, code, is_active, created_at, updated_at) VALUES ($1, 'Auto-Synced Color', $1, 1, $2, $2) ON CONFLICT DO NOTHING",
                        color_id, "Auto-Synced Color", Color, "COLOR_CREATED", "COLOR"
                    );
                }

                if let Some(unit_id) = &product.unit_id {
                    match sqlx::query("INSERT INTO units (id, name, symbol, conversion_factor, is_active, created_at, updated_at) VALUES ($1, 'Auto-Synced Unit', $1, 1, 1, $2, $2) ON CONFLICT DO NOTHING")
                        .bind(unit_id).bind(&now).execute(&mut *tx).await {
                        Ok(result) => {
                            if result.rows_affected() > 0 {
                                let unit = niazi_mobile_mart_lib::domain::catalog::Unit {
                                    id: unit_id.clone(),
                                    name: "Auto-Synced Unit".to_string(),
                                    symbol: Some(unit_id.clone()),
                                    conversion_factor: 1,
                                    is_active: true,
                                    created_at: now.clone(),
                                    updated_at: now.clone(),
                                };
                                let payload = serde_json::to_string(&unit).unwrap();
                                if let Err(e) = niazi_mobile_mart_lib::repositories::PostgresChangeLogRepository::append_change_log_tx(
                                    &mut tx,
                                    &event.organization_id,
                                    &event.branch_id,
                                    None,
                                    "UNIT_CREATED",
                                    "UNIT",
                                    unit_id,
                                    &payload,
                                ).await {
                                    let _ = tx.rollback().await;
                                    return (
                                        StatusCode::INTERNAL_SERVER_ERROR,
                                        Json(json!({
                                            "error": "SERVER_ERROR",
                                            "message": format!("Failed to append UNIT_CREATED to change_log: {}", e)
                                        })),
                                    );
                                }
                            }
                        }
                        Err(e) => {
                            let _ = tx.rollback().await;
                            return (
                                StatusCode::INTERNAL_SERVER_ERROR,
                                Json(json!({
                                    "error": "SERVER_ERROR",
                                    "message": format!("Failed to auto-heal master data UNIT: {}", e)
                                })),
                            );
                        }
                    }
                }

                let projected_product = match niazi_mobile_mart_lib::repositories::PostgresProductRepository::create_product_tx(
                    &mut tx,
                    &product,
                    Some(&event.branch_id),
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
                let product: niazi_mobile_mart_lib::domain::product::Product =
                    match serde_json::from_str(&event.payload) {
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

                // SYNC-H3: Auto-heal missing master data for the central database and emit
                // corresponding change_log events so downstream PCs can receive the catalog entity.
                // Each INSERT uses ON CONFLICT DO NOTHING for idempotency; rows_affected() > 0
                // distinguishes a new insertion from a no-op, so we only emit change_log when the
                // entity was actually created.  All operations share the outer transaction — if any
                // step fails the entire PRODUCT_UPDATED transaction is rolled back, preventing the
                // split-brain state (catalog row exists, change_log missing).
                let now = chrono::Utc::now().to_rfc3339();

                // Macro mirrors the PRODUCT_CREATED auto_heal! macro: structured identically so
                // future readers can cross-reference the two handlers.
                macro_rules! auto_heal_updated {
                    ($sql:expr, $id:expr, $name_val:expr, $domain_type:ident, $event_type:expr, $entity_type:expr) => {
                        match sqlx::query($sql).bind($id).bind(&now).execute(&mut *tx).await {
                            Ok(result) => {
                                if result.rows_affected() > 0 {
                                    // Catalog entity did not exist — build the canonical payload and
                                    // append a change_log event so other PCs can pull it.
                                    let entity = niazi_mobile_mart_lib::domain::catalog::$domain_type {
                                        id: $id.clone(),
                                        name: $name_val.to_string(),
                                        code: $id.clone(),
                                        description: None,
                                        is_active: true,
                                        created_at: now.clone(),
                                        updated_at: now.clone(),
                                    };
                                    let payload = serde_json::to_string(&entity).unwrap();
                                    if let Err(e) = niazi_mobile_mart_lib::repositories::PostgresChangeLogRepository::append_change_log_tx(
                                        &mut tx,
                                        &event.organization_id,
                                        &event.branch_id,
                                        None,
                                        $event_type,
                                        $entity_type,
                                        $id,
                                        &payload,
                                    ).await {
                                        let _ = tx.rollback().await;
                                        return (
                                            StatusCode::INTERNAL_SERVER_ERROR,
                                            Json(json!({
                                                "error": "SERVER_ERROR",
                                                "message": format!("Failed to append {} to change_log during PRODUCT_UPDATED auto-heal: {}", $event_type, e)
                                            })),
                                        );
                                    }
                                }
                                // rows_affected() == 0 → entity already exists; no duplicate change_log emitted.
                            }
                            Err(e) => {
                                let _ = tx.rollback().await;
                                return (
                                    StatusCode::INTERNAL_SERVER_ERROR,
                                    Json(json!({
                                        "error": "SERVER_ERROR",
                                        "message": format!("Failed to auto-heal master data {} during PRODUCT_UPDATED: {}", $entity_type, e)
                                    })),
                                );
                            }
                        }
                    };
                }

                auto_heal_updated!(
                    "INSERT INTO categories (id, name, code, is_active, created_at, updated_at) VALUES ($1, 'Auto-Synced Category', $1, 1, $2, $2) ON CONFLICT DO NOTHING",
                    &product.category_id, "Auto-Synced Category", Category, "CATEGORY_CREATED", "CATEGORY"
                );

                if let Some(brand_id) = &product.brand_id {
                    auto_heal_updated!(
                        "INSERT INTO brands (id, name, code, is_active, created_at, updated_at) VALUES ($1, 'Auto-Synced Brand', $1, 1, $2, $2) ON CONFLICT DO NOTHING",
                        brand_id, "Auto-Synced Brand", Brand, "BRAND_CREATED", "BRAND"
                    );
                }

                if let Some(company_id) = &product.company_id {
                    auto_heal_updated!(
                        "INSERT INTO companies (id, name, code, is_active, created_at, updated_at) VALUES ($1, 'Auto-Synced Company', $1, 1, $2, $2) ON CONFLICT DO NOTHING",
                        company_id, "Auto-Synced Company", Company, "COMPANY_CREATED", "COMPANY"
                    );
                }

                if let Some(quality_id) = &product.quality_id {
                    auto_heal_updated!(
                        "INSERT INTO qualities (id, name, code, is_active, created_at, updated_at) VALUES ($1, 'Auto-Synced Quality', $1, 1, $2, $2) ON CONFLICT DO NOTHING",
                        quality_id, "Auto-Synced Quality", Quality, "QUALITY_CREATED", "QUALITY"
                    );
                }

                if let Some(color_id) = &product.color_id {
                    auto_heal_updated!(
                        "INSERT INTO colors (id, name, code, is_active, created_at, updated_at) VALUES ($1, 'Auto-Synced Color', $1, 1, $2, $2) ON CONFLICT DO NOTHING",
                        color_id, "Auto-Synced Color", Color, "COLOR_CREATED", "COLOR"
                    );
                }

                // Unit uses a separate inline handler because its struct layout differs from
                // the other catalog entities (no `code` field; has `symbol` + `conversion_factor`).
                if let Some(unit_id) = &product.unit_id {
                    match sqlx::query("INSERT INTO units (id, name, symbol, conversion_factor, is_active, created_at, updated_at) VALUES ($1, 'Auto-Synced Unit', $1, 1, 1, $2, $2) ON CONFLICT DO NOTHING")
                        .bind(unit_id).bind(&now).execute(&mut *tx).await
                    {
                        Ok(result) => {
                            if result.rows_affected() > 0 {
                                let unit = niazi_mobile_mart_lib::domain::catalog::Unit {
                                    id: unit_id.clone(),
                                    name: "Auto-Synced Unit".to_string(),
                                    symbol: Some(unit_id.clone()),
                                    conversion_factor: 1,
                                    is_active: true,
                                    created_at: now.clone(),
                                    updated_at: now.clone(),
                                };
                                let payload = serde_json::to_string(&unit).unwrap();
                                if let Err(e) = niazi_mobile_mart_lib::repositories::PostgresChangeLogRepository::append_change_log_tx(
                                    &mut tx,
                                    &event.organization_id,
                                    &event.branch_id,
                                    None,
                                    "UNIT_CREATED",
                                    "UNIT",
                                    unit_id,
                                    &payload,
                                ).await {
                                    let _ = tx.rollback().await;
                                    return (
                                        StatusCode::INTERNAL_SERVER_ERROR,
                                        Json(json!({
                                            "error": "SERVER_ERROR",
                                            "message": format!("Failed to append UNIT_CREATED to change_log during PRODUCT_UPDATED auto-heal: {e}")
                                        })),
                                    );
                                }
                            }
                        }
                        Err(e) => {
                            let _ = tx.rollback().await;
                            return (
                                StatusCode::INTERNAL_SERVER_ERROR,
                                Json(json!({
                                    "error": "SERVER_ERROR",
                                    "message": format!("Failed to auto-heal master data UNIT during PRODUCT_UPDATED: {e}")
                                })),
                            );
                        }
                    }
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

            if event.event_type == "SUPPLIER_CREATED" || event.event_type == "SUPPLIER_UPDATED" {
                let supplier: niazi_mobile_mart_lib::domain::supplier::Supplier =
                    match serde_json::from_str(&event.payload) {
                        Ok(s) => s,
                        Err(e) => {
                            let _ = tx.rollback().await;
                            return (
                                StatusCode::BAD_REQUEST,
                                Json(json!({
                                    "error": "BAD_REQUEST",
                                    "message": format!("Invalid {} payload: {e}", event.event_type)
                                })),
                            );
                        }
                    };

                let projected_supplier = if event.event_type == "SUPPLIER_CREATED" {
                    match niazi_mobile_mart_lib::repositories::PostgresSupplierRepository::create_supplier_tx(&mut tx, &supplier).await {
                        Ok(s) => s,
                        Err(e) => {
                            let _ = tx.rollback().await;
                            return (
                                StatusCode::INTERNAL_SERVER_ERROR,
                                Json(json!({
                                    "error": "SERVER_ERROR",
                                    "message": format!("Failed to project SUPPLIER_CREATED event centrally: {e}")
                                })),
                            );
                        }
                    }
                } else {
                    match niazi_mobile_mart_lib::repositories::PostgresSupplierRepository::update_supplier_tx(&mut tx, &supplier).await {
                        Ok(s) => s,
                        Err(e) => {
                            let _ = tx.rollback().await;
                            return (
                                StatusCode::INTERNAL_SERVER_ERROR,
                                Json(json!({
                                    "error": "SERVER_ERROR",
                                    "message": format!("Failed to project SUPPLIER_UPDATED event centrally: {e}")
                                })),
                            );
                        }
                    }
                };

                // Phase 1.1: link the supplier role to its canonical party (payload party_id,
                // else party.id = supplier.id) and forward party_id downstream.
                let requested_party_id =
                    niazi_mobile_mart_lib::domain::party::party_id_from_payload(
                        &event.payload,
                        &projected_supplier.id,
                    );
                let party_id = match niazi_mobile_mart_lib::repositories::PostgresPartyRepository::ensure_party_for_role_tx(
                    &mut tx,
                    &niazi_mobile_mart_lib::domain::party::PartyRoleContact::from(&projected_supplier),
                    &requested_party_id,
                ).await {
                    Ok(p) => p.unwrap_or(requested_party_id),
                    Err(e) => {
                        let _ = tx.rollback().await;
                        return (
                            StatusCode::INTERNAL_SERVER_ERROR,
                            Json(json!({
                                "error": "SERVER_ERROR",
                                "message": format!("Failed to link {} to party centrally: {e}", event.event_type)
                            })),
                        );
                    }
                };

                let change_payload =
                    match niazi_mobile_mart_lib::domain::party::role_payload_with_party_id(
                        &projected_supplier,
                        &party_id,
                    ) {
                        Ok(p) => p,
                        Err(e) => {
                            let _ = tx.rollback().await;
                            return (
                                StatusCode::INTERNAL_SERVER_ERROR,
                                Json(json!({
                                    "error": "SERVER_ERROR",
                                    "message": format!("Failed to serialize {} change_log payload: {e}", event.event_type)
                                })),
                            );
                        }
                    };

                if let Err(e) = niazi_mobile_mart_lib::repositories::PostgresChangeLogRepository::append_change_log_tx(
                    &mut tx,
                    &event.organization_id,
                    &event.branch_id,
                    Some(&client_event_id),
                    &event.event_type,
                    "SUPPLIER",
                    &projected_supplier.id,
                    &change_payload,
                ).await {
                    let _ = tx.rollback().await;
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(json!({
                            "error": "SERVER_ERROR",
                            "message": format!("Failed to append {} to change_log: {e}", event.event_type)
                        })),
                    );
                }
            }
            if event.event_type == "SUPPLIER_PAYMENT_RECORDED" {
                let payment_event: niazi_mobile_mart_lib::domain::supplier::SupplierPaymentSyncEventDto = match serde_json::from_str(&event.payload) {
                    Ok(p) => p,
                    Err(e) => {
                        let _ = tx.rollback().await;
                        return (
                            StatusCode::BAD_REQUEST,
                            Json(json!({
                                "error": "BAD_REQUEST",
                                "message": format!("Invalid SUPPLIER_PAYMENT_RECORDED payload: {e}")
                            })),
                        );
                    }
                };

                if let Err(e) = niazi_mobile_mart_lib::repositories::PostgresPurchaseRepository::record_supplier_payment_tx(
                    &mut tx,
                    &payment_event,
                ).await {
                    let _ = tx.rollback().await;
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(json!({
                            "error": "SERVER_ERROR",
                            "message": format!("Failed to project SUPPLIER_PAYMENT_RECORDED centrally: {e}")
                        })),
                    );
                }

                if let Err(e) = niazi_mobile_mart_lib::repositories::PostgresChangeLogRepository::append_change_log_tx(
                    &mut tx,
                    &event.organization_id,
                    &event.branch_id,
                    Some(&client_event_id),
                    "SUPPLIER_PAYMENT_RECORDED",
                    "SUPPLIER_PAYMENT",
                    &payment_event.payment_id,
                    &event.payload,
                ).await {
                    let _ = tx.rollback().await;
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(json!({
                            "error": "SERVER_ERROR",
                            "message": format!("Failed to append SUPPLIER_PAYMENT_RECORDED to change_log: {e}")
                        })),
                    );
                }
            }

            // SYNC-B2 — Customer payment projection
            if event.event_type == "CUSTOMER_PAYMENT_RECORDED" {
                let payment_event: niazi_mobile_mart_lib::domain::customer::CustomerPaymentSyncEventDto =
                    match serde_json::from_str(&event.payload) {
                        Ok(p) => p,
                        Err(e) => {
                            let _ = tx.rollback().await;
                            return (
                                StatusCode::BAD_REQUEST,
                                Json(json!({
                                    "error": "INVALID_PAYLOAD",
                                    "message": format!("Invalid CUSTOMER_PAYMENT_RECORDED payload: {e}")
                                })),
                            );
                        }
                    };

                if let Err(e) = niazi_mobile_mart_lib::repositories::PostgresCustomerRepository::record_customer_payment_tx(
                    &mut tx,
                    &payment_event,
                )
                .await
                {
                    let _ = tx.rollback().await;
                    let (status, code) = if e.to_string().contains("not found") {
                        (StatusCode::BAD_REQUEST, "DEPENDENCY_NOT_MET")
                    } else {
                        (StatusCode::INTERNAL_SERVER_ERROR, "SERVER_ERROR")
                    };
                    return (
                        status,
                        Json(json!({
                            "error": code,
                            "message": format!("Failed to project CUSTOMER_PAYMENT_RECORDED centrally: {e}")
                        })),
                    );
                }

                if let Err(e) = niazi_mobile_mart_lib::repositories::PostgresChangeLogRepository::append_change_log_tx(
                    &mut tx,
                    &event.organization_id,
                    &event.branch_id,
                    Some(&client_event_id),
                    "CUSTOMER_PAYMENT_RECORDED",
                    "CUSTOMER_PAYMENT",
                    &payment_event.payment_id,
                    &event.payload,
                )
                .await
                {
                    let _ = tx.rollback().await;
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(json!({
                            "error": "SERVER_ERROR",
                            "message": format!("Failed to append CUSTOMER_PAYMENT_RECORDED to change_log: {e}")
                        })),
                    );
                }
            }

            // ── SYNC-H1: Manual inventory operation ──────────────────────────────
            if event.event_type == "INVENTORY_OPERATION_RECORDED" {
                let inv_event: niazi_mobile_mart_lib::domain::inventory::InventoryOperationSyncEventDto =
                    match serde_json::from_str(&event.payload) {
                        Ok(p) => p,
                        Err(e) => {
                            let _ = tx.rollback().await;
                            return (
                                StatusCode::BAD_REQUEST,
                                Json(json!({
                                    "error": "INVALID_PAYLOAD",
                                    "message": format!("Invalid INVENTORY_OPERATION_RECORDED payload: {e}")
                                })),
                            );
                        }
                    };

                if let Err(e) = niazi_mobile_mart_lib::repositories::PostgresInventoryRepository::record_inventory_operation_tx(
                    &mut tx,
                    &inv_event,
                )
                .await
                {
                    let _ = tx.rollback().await;
                    let (status, code) = if e.to_string().contains("not found") || e.to_string().contains("Insufficient") {
                        (StatusCode::BAD_REQUEST, "DEPENDENCY_NOT_MET")
                    } else {
                        (StatusCode::INTERNAL_SERVER_ERROR, "SERVER_ERROR")
                    };
                    return (
                        status,
                        Json(json!({
                            "error": code,
                            "message": format!("Failed to project INVENTORY_OPERATION_RECORDED centrally: {e}")
                        })),
                    );
                }

                if let Err(e) = niazi_mobile_mart_lib::repositories::PostgresChangeLogRepository::append_change_log_tx(
                    &mut tx,
                    &event.organization_id,
                    &event.branch_id,
                    Some(&client_event_id),
                    "INVENTORY_OPERATION_RECORDED",
                    "INVENTORY_OPERATION",
                    &inv_event.operation_id,
                    &event.payload,
                )
                .await
                {
                    let _ = tx.rollback().await;
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(json!({
                            "error": "SERVER_ERROR",
                            "message": format!("Failed to append INVENTORY_OPERATION_RECORDED to change_log: {e}")
                        })),
                    );
                }
            }

            if event.event_type == "CUSTOMER_CREATED" {
                let customer: niazi_mobile_mart_lib::domain::customer::Customer =
                    match serde_json::from_str(&event.payload) {
                        Ok(c) => c,
                        Err(e) => {
                            let _ = tx.rollback().await;
                            return (
                                StatusCode::BAD_REQUEST,
                                Json(json!({
                                    "error": "BAD_REQUEST",
                                    "message": format!("Invalid CUSTOMER_CREATED payload: {e}")
                                })),
                            );
                        }
                    };

                let projected_customer = match niazi_mobile_mart_lib::repositories::PostgresCustomerRepository::create_customer_tx(
                    &mut tx,
                    &customer,
                ).await {
                    Ok(c) => c,
                    Err(e) => {
                        let _ = tx.rollback().await;
                        return (
                            StatusCode::INTERNAL_SERVER_ERROR,
                            Json(json!({
                                "error": "SERVER_ERROR",
                                "message": format!("Failed to project CUSTOMER_CREATED event centrally: {e}")
                            })),
                        );
                    }
                };

                // Phase 1.1: link the customer role to its canonical party (payload party_id,
                // else party.id = customer.id) and forward party_id downstream.
                let requested_party_id =
                    niazi_mobile_mart_lib::domain::party::party_id_from_payload(
                        &event.payload,
                        &projected_customer.id,
                    );
                let party_id = match niazi_mobile_mart_lib::repositories::PostgresPartyRepository::ensure_party_for_role_tx(
                    &mut tx,
                    &niazi_mobile_mart_lib::domain::party::PartyRoleContact::from(&projected_customer),
                    &requested_party_id,
                ).await {
                    Ok(p) => p.unwrap_or(requested_party_id),
                    Err(e) => {
                        let _ = tx.rollback().await;
                        return (
                            StatusCode::INTERNAL_SERVER_ERROR,
                            Json(json!({
                                "error": "SERVER_ERROR",
                                "message": format!("Failed to link CUSTOMER_CREATED to party centrally: {e}")
                            })),
                        );
                    }
                };

                let change_payload =
                    match niazi_mobile_mart_lib::domain::party::role_payload_with_party_id(
                        &projected_customer,
                        &party_id,
                    ) {
                        Ok(p) => p,
                        Err(e) => {
                            let _ = tx.rollback().await;
                            return (
                                StatusCode::INTERNAL_SERVER_ERROR,
                                Json(json!({
                                    "error": "SERVER_ERROR",
                                    "message": format!("Failed to serialize CUSTOMER_CREATED change_log payload: {e}")
                                })),
                            );
                        }
                    };

                if let Err(e) = niazi_mobile_mart_lib::repositories::PostgresChangeLogRepository::append_change_log_tx(
                    &mut tx,
                    &event.organization_id,
                    &event.branch_id,
                    Some(&client_event_id),
                    "CUSTOMER_CREATED",
                    "CUSTOMER",
                    &projected_customer.id,
                    &change_payload,
                ).await {
                    let _ = tx.rollback().await;
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(json!({
                            "error": "SERVER_ERROR",
                            "message": format!("Failed to append CUSTOMER_CREATED to change_log: {e}")
                        })),
                    );
                }
            }

            if event.event_type == "CUSTOMER_UPDATED" {
                let customer: niazi_mobile_mart_lib::domain::customer::Customer =
                    match serde_json::from_str(&event.payload) {
                        Ok(c) => c,
                        Err(e) => {
                            let _ = tx.rollback().await;
                            return (
                                StatusCode::BAD_REQUEST,
                                Json(json!({
                                    "error": "BAD_REQUEST",
                                    "message": format!("Invalid CUSTOMER_UPDATED payload: {e}")
                                })),
                            );
                        }
                    };

                let projected_customer = match niazi_mobile_mart_lib::repositories::PostgresCustomerRepository::update_customer_tx(&mut tx, &customer).await {
                    Ok(c) => c,
                    Err(e) => {
                        let _ = tx.rollback().await;
                        return (
                            StatusCode::INTERNAL_SERVER_ERROR,
                            Json(json!({
                                "error": "SERVER_ERROR",
                                "message": format!("Failed to project CUSTOMER_UPDATED event centrally: {e}")
                            })),
                        );
                    }
                };

                // Phase 1.1: link the customer role to its canonical party (payload party_id,
                // else party.id = customer.id) and forward party_id downstream.
                // For BOTH parties: ensure_party_for_role_tx only mirrors contact when the
                // party has exactly one role, so the supplier role keeps the party active.
                let requested_party_id =
                    niazi_mobile_mart_lib::domain::party::party_id_from_payload(
                        &event.payload,
                        &projected_customer.id,
                    );
                let party_id = match niazi_mobile_mart_lib::repositories::PostgresPartyRepository::ensure_party_for_role_tx(
                    &mut tx,
                    &niazi_mobile_mart_lib::domain::party::PartyRoleContact::from(&projected_customer),
                    &requested_party_id,
                ).await {
                    Ok(p) => p.unwrap_or(requested_party_id),
                    Err(e) => {
                        let _ = tx.rollback().await;
                        return (
                            StatusCode::INTERNAL_SERVER_ERROR,
                            Json(json!({
                                "error": "SERVER_ERROR",
                                "message": format!("Failed to link CUSTOMER_UPDATED to party centrally: {e}")
                            })),
                        );
                    }
                };

                let change_payload =
                    match niazi_mobile_mart_lib::domain::party::role_payload_with_party_id(
                        &projected_customer,
                        &party_id,
                    ) {
                        Ok(p) => p,
                        Err(e) => {
                            let _ = tx.rollback().await;
                            return (
                                StatusCode::INTERNAL_SERVER_ERROR,
                                Json(json!({
                                    "error": "SERVER_ERROR",
                                    "message": format!("Failed to serialize CUSTOMER_UPDATED change_log payload: {e}")
                                })),
                            );
                        }
                    };

                if let Err(e) = niazi_mobile_mart_lib::repositories::PostgresChangeLogRepository::append_change_log_tx(
                    &mut tx,
                    &event.organization_id,
                    &event.branch_id,
                    Some(&client_event_id),
                    "CUSTOMER_UPDATED",
                    "CUSTOMER",
                    &projected_customer.id,
                    &change_payload,
                ).await {
                    let _ = tx.rollback().await;
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(json!({
                            "error": "SERVER_ERROR",
                            "message": format!("Failed to append CUSTOMER_UPDATED to change_log: {e}")
                        })),
                    );
                }
            }

            if event.event_type == niazi_mobile_mart_lib::domain::party::PARTY_UPSERTED_EVENT {
                let party: niazi_mobile_mart_lib::domain::party::Party =
                    match serde_json::from_str(&event.payload) {
                        Ok(p) => p,
                        Err(e) => {
                            let _ = tx.rollback().await;
                            return (
                                StatusCode::BAD_REQUEST,
                                Json(json!({
                                    "error": "BAD_REQUEST",
                                    "message": format!("Invalid PARTY_UPSERTED payload: {e}")
                                })),
                            );
                        }
                    };
                if party.id.len() != 36 || party.display_name.trim().is_empty() {
                    let _ = tx.rollback().await;
                    return (
                        StatusCode::BAD_REQUEST,
                        Json(json!({
                            "error": "BAD_REQUEST",
                            "message": "Invalid PARTY_UPSERTED payload: id must be a UUID and display_name non-empty"
                        })),
                    );
                }

                // Same rule as the desktop change applier: guarded upsert; roles receive the
                // contact fields only when the party is new or strictly newer.
                //
                // M3 (server-side): Use is_strictly_newer() for instant-based comparison instead
                // of raw string comparison.  The raw string guard was broken: a +05:00 event
                // string sorts after a Z string lexicographically even when they represent the
                // same UTC instant, causing a same-instant re-delivery to overwrite good data.
                // This mirrors the identical fix already applied in change_applier.rs.
                let stored = match niazi_mobile_mart_lib::repositories::PostgresPartyRepository::get_party_tx(&mut tx, &party.id).await {
                    Ok(p) => p,
                    Err(e) => {
                        let _ = tx.rollback().await;
                        return (
                            StatusCode::INTERNAL_SERVER_ERROR,
                            Json(json!({"error": "SERVER_ERROR", "message": format!("Failed to read party centrally: {e}")})),
                        );
                    }
                };
                let strictly_newer = stored
                    .as_ref()
                    .map(|p| {
                        niazi_mobile_mart_lib::utils::timestamp::is_strictly_newer(
                            &party.updated_at,
                            &p.updated_at,
                        )
                    })
                    .unwrap_or(true);
                let written = match niazi_mobile_mart_lib::repositories::PostgresPartyRepository::upsert_party_guarded_tx(&mut tx, &party).await {
                    Ok(w) => w,
                    Err(e) => {
                        let _ = tx.rollback().await;
                        return (
                            StatusCode::INTERNAL_SERVER_ERROR,
                            Json(json!({"error": "SERVER_ERROR", "message": format!("Failed to project PARTY_UPSERTED centrally: {e}")})),
                        );
                    }
                };
                if written && strictly_newer {
                    if let Err(e) = niazi_mobile_mart_lib::repositories::PostgresPartyRepository::copy_party_to_roles_tx(&mut tx, &party).await {
                        let _ = tx.rollback().await;
                        return (
                            StatusCode::INTERNAL_SERVER_ERROR,
                            Json(json!({"error": "SERVER_ERROR", "message": format!("Failed to copy party contact to roles centrally: {e}")})),
                        );
                    }
                }

                // Forward the event as received: downstream terminals apply the same guard,
                // so a stale event is a no-op everywhere.
                if let Err(e) = niazi_mobile_mart_lib::repositories::PostgresChangeLogRepository::append_change_log_tx(
                    &mut tx,
                    &event.organization_id,
                    &event.branch_id,
                    Some(&client_event_id),
                    niazi_mobile_mart_lib::domain::party::PARTY_UPSERTED_EVENT,
                    niazi_mobile_mart_lib::domain::party::PARTY_ENTITY_TYPE,
                    &party.id,
                    &event.payload,
                ).await {
                    let _ = tx.rollback().await;
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(json!({
                            "error": "SERVER_ERROR",
                            "message": format!("Failed to append PARTY_UPSERTED to change_log: {e}")
                        })),
                    );
                }
            }

            // SYNC-H2: CATEGORY_CREATED
            if event.event_type == "CATEGORY_CREATED" {
                let entity: niazi_mobile_mart_lib::domain::catalog::Category =
                    match serde_json::from_str(&event.payload) {
                        Ok(e) => e,
                        Err(e) => {
                            let _ = tx.rollback().await;
                            results.push(json!({
                                "client_event_id": client_event_id,
                                "status": "FAILED_PERMANENT",
                                "error": "INVALID_PAYLOAD",
                                "message": format!("Invalid CATEGORY_CREATED payload: {e}")
                            }));
                            continue;
                        }
                    };
                let now = chrono::Utc::now().to_rfc3339();
                let is_active_int: i64 = if entity.is_active { 1 } else { 0 };
                if let Err(e) = sqlx::query(
                    "INSERT INTO categories (id, name, code, description, is_active, created_at, updated_at)
                     VALUES ($1, $2, $3, $4, $5, $6, $7)
                     ON CONFLICT (id) DO NOTHING",
                )
                .bind(&entity.id)
                .bind(&entity.name)
                .bind(&entity.code)
                .bind(&entity.description)
                .bind(is_active_int)
                .bind(&now)
                .bind(&now)
                .execute(&mut *tx)
                .await
                {
                    let _ = tx.rollback().await;
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(json!({
                            "error": "SERVER_ERROR",
                            "message": format!("Failed to project CATEGORY_CREATED centrally: {e}")
                        })),
                    );
                }
                if let Err(e) = niazi_mobile_mart_lib::repositories::PostgresChangeLogRepository::append_change_log_tx(
                    &mut tx,
                    &event.organization_id,
                    &event.branch_id,
                    Some(&client_event_id),
                    "CATEGORY_CREATED",
                    "CATEGORY",
                    &entity.id,
                    &event.payload,
                )
                .await
                {
                    let _ = tx.rollback().await;
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(json!({
                            "error": "SERVER_ERROR",
                            "message": format!("Failed to append CATEGORY_CREATED to change_log: {e}")
                        })),
                    );
                }
            }

            // SYNC-H2: BRAND_CREATED
            if event.event_type == "BRAND_CREATED" {
                let entity: niazi_mobile_mart_lib::domain::catalog::Brand =
                    match serde_json::from_str(&event.payload) {
                        Ok(e) => e,
                        Err(e) => {
                            let _ = tx.rollback().await;
                            results.push(json!({
                                "client_event_id": client_event_id,
                                "status": "FAILED_PERMANENT",
                                "error": "INVALID_PAYLOAD",
                                "message": format!("Invalid BRAND_CREATED payload: {e}")
                            }));
                            continue;
                        }
                    };
                let now = chrono::Utc::now().to_rfc3339();
                let is_active_int: i64 = if entity.is_active { 1 } else { 0 };
                if let Err(e) = sqlx::query(
                    "INSERT INTO brands (id, name, code, description, is_active, created_at, updated_at)
                     VALUES ($1, $2, $3, $4, $5, $6, $7)
                     ON CONFLICT (id) DO NOTHING",
                )
                .bind(&entity.id)
                .bind(&entity.name)
                .bind(&entity.code)
                .bind(&entity.description)
                .bind(is_active_int)
                .bind(&now)
                .bind(&now)
                .execute(&mut *tx)
                .await
                {
                    let _ = tx.rollback().await;
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(json!({
                            "error": "SERVER_ERROR",
                            "message": format!("Failed to project BRAND_CREATED centrally: {e}")
                        })),
                    );
                }
                if let Err(e) = niazi_mobile_mart_lib::repositories::PostgresChangeLogRepository::append_change_log_tx(
                    &mut tx,
                    &event.organization_id,
                    &event.branch_id,
                    Some(&client_event_id),
                    "BRAND_CREATED",
                    "BRAND",
                    &entity.id,
                    &event.payload,
                )
                .await
                {
                    let _ = tx.rollback().await;
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(json!({
                            "error": "SERVER_ERROR",
                            "message": format!("Failed to append BRAND_CREATED to change_log: {e}")
                        })),
                    );
                }
            }

            // SYNC-H2: UNIT_CREATED
            if event.event_type == "UNIT_CREATED" {
                let entity: niazi_mobile_mart_lib::domain::catalog::Unit =
                    match serde_json::from_str(&event.payload) {
                        Ok(e) => e,
                        Err(e) => {
                            let _ = tx.rollback().await;
                            results.push(json!({
                                "client_event_id": client_event_id,
                                "status": "FAILED_PERMANENT",
                                "error": "INVALID_PAYLOAD",
                                "message": format!("Invalid UNIT_CREATED payload: {e}")
                            }));
                            continue;
                        }
                    };
                let now = chrono::Utc::now().to_rfc3339();
                let is_active_int: i64 = if entity.is_active { 1 } else { 0 };
                if let Err(e) = sqlx::query(
                    "INSERT INTO units (id, name, symbol, conversion_factor, is_active, created_at, updated_at)
                     VALUES ($1, $2, $3, $4, $5, $6, $7)
                     ON CONFLICT (id) DO NOTHING",
                )
                .bind(&entity.id)
                .bind(&entity.name)
                .bind(&entity.symbol)
                .bind(entity.conversion_factor)
                .bind(is_active_int)
                .bind(&now)
                .bind(&now)
                .execute(&mut *tx)
                .await
                {
                    let _ = tx.rollback().await;
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(json!({
                            "error": "SERVER_ERROR",
                            "message": format!("Failed to project UNIT_CREATED centrally: {e}")
                        })),
                    );
                }
                if let Err(e) = niazi_mobile_mart_lib::repositories::PostgresChangeLogRepository::append_change_log_tx(
                    &mut tx,
                    &event.organization_id,
                    &event.branch_id,
                    Some(&client_event_id),
                    "UNIT_CREATED",
                    "UNIT",
                    &entity.id,
                    &event.payload,
                )
                .await
                {
                    let _ = tx.rollback().await;
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(json!({
                            "error": "SERVER_ERROR",
                            "message": format!("Failed to append UNIT_CREATED to change_log: {e}")
                        })),
                    );
                }
            }

            // SYNC-H2: COMPANY_CREATED
            if event.event_type == "COMPANY_CREATED" {
                let entity: niazi_mobile_mart_lib::domain::catalog::Company =
                    match serde_json::from_str(&event.payload) {
                        Ok(e) => e,
                        Err(e) => {
                            let _ = tx.rollback().await;
                            results.push(json!({
                                "client_event_id": client_event_id,
                                "status": "FAILED_PERMANENT",
                                "error": "INVALID_PAYLOAD",
                                "message": format!("Invalid COMPANY_CREATED payload: {e}")
                            }));
                            continue;
                        }
                    };
                let now = chrono::Utc::now().to_rfc3339();
                let is_active_int: i64 = if entity.is_active { 1 } else { 0 };
                if let Err(e) = sqlx::query(
                    "INSERT INTO companies (id, name, code, description, is_active, created_at, updated_at)
                     VALUES ($1, $2, $3, $4, $5, $6, $7)
                     ON CONFLICT (id) DO NOTHING",
                )
                .bind(&entity.id)
                .bind(&entity.name)
                .bind(&entity.code)
                .bind(&entity.description)
                .bind(is_active_int)
                .bind(&now)
                .bind(&now)
                .execute(&mut *tx)
                .await
                {
                    let _ = tx.rollback().await;
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(json!({
                            "error": "SERVER_ERROR",
                            "message": format!("Failed to project COMPANY_CREATED centrally: {e}")
                        })),
                    );
                }
                if let Err(e) = niazi_mobile_mart_lib::repositories::PostgresChangeLogRepository::append_change_log_tx(
                    &mut tx,
                    &event.organization_id,
                    &event.branch_id,
                    Some(&client_event_id),
                    "COMPANY_CREATED",
                    "COMPANY",
                    &entity.id,
                    &event.payload,
                )
                .await
                {
                    let _ = tx.rollback().await;
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(json!({
                            "error": "SERVER_ERROR",
                            "message": format!("Failed to append COMPANY_CREATED to change_log: {e}")
                        })),
                    );
                }
            }

            // SYNC-H2: QUALITY_CREATED
            if event.event_type == "QUALITY_CREATED" {
                let entity: niazi_mobile_mart_lib::domain::catalog::Quality =
                    match serde_json::from_str(&event.payload) {
                        Ok(e) => e,
                        Err(e) => {
                            let _ = tx.rollback().await;
                            results.push(json!({
                                "client_event_id": client_event_id,
                                "status": "FAILED_PERMANENT",
                                "error": "INVALID_PAYLOAD",
                                "message": format!("Invalid QUALITY_CREATED payload: {e}")
                            }));
                            continue;
                        }
                    };
                let now = chrono::Utc::now().to_rfc3339();
                let is_active_int: i64 = if entity.is_active { 1 } else { 0 };
                if let Err(e) = sqlx::query(
                    "INSERT INTO qualities (id, name, code, description, is_active, created_at, updated_at)
                     VALUES ($1, $2, $3, $4, $5, $6, $7)
                     ON CONFLICT (id) DO NOTHING",
                )
                .bind(&entity.id)
                .bind(&entity.name)
                .bind(&entity.code)
                .bind(&entity.description)
                .bind(is_active_int)
                .bind(&now)
                .bind(&now)
                .execute(&mut *tx)
                .await
                {
                    let _ = tx.rollback().await;
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(json!({
                            "error": "SERVER_ERROR",
                            "message": format!("Failed to project QUALITY_CREATED centrally: {e}")
                        })),
                    );
                }
                if let Err(e) = niazi_mobile_mart_lib::repositories::PostgresChangeLogRepository::append_change_log_tx(
                    &mut tx,
                    &event.organization_id,
                    &event.branch_id,
                    Some(&client_event_id),
                    "QUALITY_CREATED",
                    "QUALITY",
                    &entity.id,
                    &event.payload,
                )
                .await
                {
                    let _ = tx.rollback().await;
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(json!({
                            "error": "SERVER_ERROR",
                            "message": format!("Failed to append QUALITY_CREATED to change_log: {e}")
                        })),
                    );
                }
            }

            // SYNC-H2: COLOR_CREATED
            if event.event_type == "COLOR_CREATED" {
                let entity: niazi_mobile_mart_lib::domain::catalog::Color =
                    match serde_json::from_str(&event.payload) {
                        Ok(e) => e,
                        Err(e) => {
                            let _ = tx.rollback().await;
                            results.push(json!({
                                "client_event_id": client_event_id,
                                "status": "FAILED_PERMANENT",
                                "error": "INVALID_PAYLOAD",
                                "message": format!("Invalid COLOR_CREATED payload: {e}")
                            }));
                            continue;
                        }
                    };
                let now = chrono::Utc::now().to_rfc3339();
                let is_active_int: i64 = if entity.is_active { 1 } else { 0 };
                if let Err(e) = sqlx::query(
                    "INSERT INTO colors (id, name, code, description, is_active, created_at, updated_at)
                     VALUES ($1, $2, $3, $4, $5, $6, $7)
                     ON CONFLICT (id) DO NOTHING",
                )
                .bind(&entity.id)
                .bind(&entity.name)
                .bind(&entity.code)
                .bind(&entity.description)
                .bind(is_active_int)
                .bind(&now)
                .bind(&now)
                .execute(&mut *tx)
                .await
                {
                    let _ = tx.rollback().await;
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(json!({
                            "error": "SERVER_ERROR",
                            "message": format!("Failed to project COLOR_CREATED centrally: {e}")
                        })),
                    );
                }
                if let Err(e) = niazi_mobile_mart_lib::repositories::PostgresChangeLogRepository::append_change_log_tx(
                    &mut tx,
                    &event.organization_id,
                    &event.branch_id,
                    Some(&client_event_id),
                    "COLOR_CREATED",
                    "COLOR",
                    &entity.id,
                    &event.payload,
                )
                .await
                {
                    let _ = tx.rollback().await;
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(json!({
                            "error": "SERVER_ERROR",
                            "message": format!("Failed to append COLOR_CREATED to change_log: {e}")
                        })),
                    );
                }
            }

            // SYNC-B1: Unknown event type guard.
            //
            // Every recognised event type is handled by one of the independent `if`
            // blocks above.  An event type that is not in the registry falls through
            // ALL of them, which would previously cause the empty transaction to be
            // committed and a spurious `SYNCED` response to be returned — resulting
            // in silent permanent data loss on the originating terminal.
            //
            // This guard MUST remain immediately before the audit record and commit
            // so that it catches every event type not handled above.
            if !niazi_mobile_mart_lib::domain::sync_queue::KNOWN_SERVER_EVENT_TYPES
                .contains(&event.event_type.as_str())
            {
                let _ = tx.rollback().await;
                results.push(json!({
                    "client_event_id": client_event_id,
                    "status": "FAILED_PERMANENT",
                    "error": "UNKNOWN_EVENT_TYPE",
                    "message": format!(
                        "Unrecognised sync event type '{}': the server has no handler \
                         for this event and cannot project or audit it.",
                        event.event_type
                    )
                }));
                continue;
            }

            if let Err(e) =
                niazi_mobile_mart_lib::repositories::PostgresSyncAuditRepository::record_audit_tx(
                    &mut tx,
                    &server_event_id,
                    &client_event_id,
                    &event.terminal_id,
                    &event.organization_id,
                    &event.branch_id,
                    &event.event_type,
                    &event.payload,
                    "SYNCED",
                )
                .await
            {
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

    (StatusCode::OK, Json(json!({ "results": results })))
}

/// GET /api/v1/sync/pull — Downstream Delta Reconciliation Pull Handler
async fn sync_pull_handler(
    State(state): State<ServerState>,
    auth: AuthenticatedUser,
    axum::extract::Query(query): axum::extract::Query<
        niazi_mobile_mart_lib::domain::change_log::DeltaPullQuery,
    >,
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
    // M1: query limit+1 rows so we can distinguish "exactly limit rows exist" from "more rows follow".
    match repo
        .get_changes(&auth.0.organization_id, after_seq, limit + 1)
        .await
    {
        Ok(mut changes) => {
            // has_more is true only when a (limit+1)-th row was actually returned.
            let has_more = changes.len() as i64 > limit;
            if has_more {
                changes.truncate(limit as usize);
            }
            let next_seq = changes.last().map(|c| c.sequence).unwrap_or(after_seq);
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
            return (StatusCode::OK, [("content-type", mime)], contents).into_response();
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
        "Static files not built. Please build frontend."
            .as_bytes()
            .to_vec(),
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
