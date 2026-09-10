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

    // 3. Initialize AppState with SQLite (shared services — all business logic lives here)
    //    NOTE: In server mode we still initialize SQLite AppState to hold the shared service
    //    layer. In Phase 3, the services will be wired to PostgreSQL-backed repositories.
    //    In Phase 2, the pg_pool field is attached for infrastructure validation only.
    let base_app_state = {
        // Try persistent path first; fall back to in-memory for diagnostic mode
        let db_path = niazi_mobile_mart_lib::db::connection::DatabaseConnection::default_db_path();
        match niazi_mobile_mart_lib::db::connection::DatabaseConnection::open_file(db_path) {
            Ok(db) => AppState::new("1.0.1", db),
            Err(e) => {
                warn!(
                    "Persistent SQLite path unavailable ({e}) — using in-memory SQLite. \
                     PostgreSQL will be the primary data store in Cloud Run mode."
                );
                AppState::in_memory("1.0.1")
            }
        }
    };

    // 4. Attempt PostgreSQL pool initialization from DATABASE_URL
    //    In Cloud Run mode: DATABASE_URL must be set to enable PostgreSQL mode.
    //    In local dev / Phase 2 validation: DATABASE_URL is optional; server starts in SQLite mode.
    let app_state = if let Ok(database_url) = std::env::var("DATABASE_URL") {
        match PostgresAdapter::from_url(&database_url).await {
            Ok(pg_adapter) => {
                info!("PostgreSQL connection pool ready — pg_mode: active");
                let pool = pg_adapter.pool().clone();
                Arc::new(base_app_state.with_pg_pool(pool))
            }
            Err(e) => {
                error!("PostgreSQL initialization failed: {e}");
                error!("DATABASE_URL is set but PostgreSQL is unreachable. Aborting.");
                return Err(e.into());
            }
        }
    } else {
        info!("DATABASE_URL not set — running in SQLite-only mode (local / Phase 2 validation)");
        Arc::new(base_app_state)
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
        .route("/api/auth/login", axum::routing::post(login_handler))
        .route("/api/auth/logout", axum::routing::post(logout_handler))
        .route("/api/auth/me", get(me_handler))
        .layer(cors)
        .with_state(server_state);

    // 7. Bind and start
    let listener = tokio::net::TcpListener::bind(bind_addr).await?;
    info!("Niazi Cloud Run HTTP Server listening on http://{bind_addr}");
    info!("  GET  /api/health → {bind_addr}/api/health");
    info!("  POST /api/auth/login → {bind_addr}/api/auth/login");
    info!("  POST /api/auth/logout → {bind_addr}/api/auth/logout");
    info!("  GET  /api/auth/me → {bind_addr}/api/auth/me");

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
