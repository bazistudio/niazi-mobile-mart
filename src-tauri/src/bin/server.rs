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
        .layer(cors)
        .with_state(server_state);

    // 7. Bind and start
    let listener = tokio::net::TcpListener::bind(bind_addr).await?;
    info!("Niazi Cloud Run HTTP Server listening on http://{bind_addr}");
    info!("  GET /api/health → {bind_addr}/api/health");

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    info!("Server shut down gracefully.");
    Ok(())
}

// ---------------------------------------------------------------------------
// Route Handlers — TRANSPORT LAYER ONLY
// Each handler must delegate business operations to a service method.
// Direct SQL queries are PROHIBITED in this module.
// ---------------------------------------------------------------------------

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
