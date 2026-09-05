pub mod commands;
pub mod domain;
pub mod errors;
pub mod events;
pub mod repositories;
pub mod services;
pub mod state;

use state::AppState;

pub fn run() {
    // Initialize tracing subscriber for structured native logging
    let _ = tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "niazi_mobile_mart=info,tauri=info".into()),
        )
        .try_init();

    let app_state = AppState::new("5.0.3");

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            commands::health_check::health_check,
            commands::health_check::ping,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Niazi Mobile Mart Tauri application");
}
