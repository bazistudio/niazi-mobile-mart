use std::net::SocketAddr;
use std::env;
use axum::{
    routing::get,
    Json, Router,
};
use serde_json::{json, Value};
use tokio::signal;
use tower_http::cors::CorsLayer;
use tracing::{error, info};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // 1. Initialize structured tracing subscriber
    let _ = tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "server=info,axum=info,tower_http=info".into()),
        )
        .try_init();

    info!("Initializing Niazi Mobile Mart Axum Server Foundation (Phase 1)...");

    // 2. Resolve PORT from environment variable (default: 8080)
    let port_str = env::var("PORT").unwrap_or_else(|_| "8080".to_string());
    let port: u16 = match port_str.parse() {
        Ok(p) => p,
        Err(e) => {
            error!("Invalid PORT environment variable value '{port_str}': {e}");
            std::process::exit(1);
        }
    };

    let addr = SocketAddr::from(([0, 0, 0, 0], port));

    // 3. Configure CORS middleware
    let cors = CorsLayer::permissive();

    // 4. Build Axum Router with Phase 1 minimal infrastructure routes
    let app = Router::new()
        .route("/api/v1/health", get(health_handler))
        .layer(cors);

    // 5. Bind TCP listener
    let listener = match tokio::net::TcpListener::bind(addr).await {
        Ok(l) => l,
        Err(e) => {
            error!("Failed to bind TCP listener on {addr}: {e}");
            std::process::exit(1);
        }
    };

    info!("Axum server running and listening on http://{addr}");
    info!("Health check available at http://{addr}/api/v1/health");

    // 6. Serve requests with graceful shutdown
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .map_err(|e| {
            error!("Server execution error: {e}");
            e
        })?;

    info!("Axum server shut down cleanly.");
    Ok(())
}

/// Infrastructure health check handler (no database or business logic calls)
async fn health_handler() -> Json<Value> {
    Json(json!({
        "status": "ok",
        "app": "Niazi Mobile Mart Cloud Server",
        "version": "1.0.1",
        "timestamp_ms": std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis()
    }))
}

/// Listens for Ctrl+C and SIGTERM signals for clean shutdown
async fn shutdown_signal() {
    let ctrl_c = async {
        signal::ctrl_c()
            .await
            .expect("Failed to install Ctrl+C signal handler");
    };

    #[cfg(unix)]
    let terminate = async {
        signal::unix::signal(signal::unix::SignalKind::terminate())
            .expect("Failed to install SIGTERM signal handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {
            info!("Received Ctrl+C signal, initiating graceful shutdown...");
        },
        _ = terminate => {
            info!("Received SIGTERM signal, initiating graceful shutdown...");
        },
    }
}
