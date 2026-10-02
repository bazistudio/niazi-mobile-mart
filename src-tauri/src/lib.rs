pub mod commands;
pub mod db;
pub mod domain;
pub mod errors;
pub mod events;
pub mod repositories;
pub mod services;
pub mod state;
pub mod utils;

use state::AppState;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, SubmenuBuilder};

fn get_log_dir() -> std::path::PathBuf {
    if let Ok(custom_dir) = std::env::var("NIAZI_LOG_DIR") {
        return std::path::PathBuf::from(custom_dir);
    }
    #[cfg(target_os = "windows")]
    {
        if let Ok(appdata) = std::env::var("APPDATA") {
            return std::path::PathBuf::from(appdata)
                .join("com.bazi.niazimobilemart")
                .join("logs");
        }
    }
    #[cfg(target_os = "macos")]
    {
        if let Ok(home) = std::env::var("HOME") {
            return std::path::PathBuf::from(home)
                .join("Library")
                .join("Application Support")
                .join("com.bazi.niazimobilemart")
                .join("logs");
        }
    }
    #[cfg(target_os = "linux")]
    {
        if let Ok(home) = std::env::var("HOME") {
            return std::path::PathBuf::from(home)
                .join(".config")
                .join("com.bazi.niazimobilemart")
                .join("logs");
        }
    }
    std::path::PathBuf::from("logs")
}

pub fn run() {
    // Initialize persistent dual logging (stdout + file appender in AppData)
    let log_dir = get_log_dir();
    let _ = std::fs::create_dir_all(&log_dir);
    let file_appender = tracing_appender::rolling::never(&log_dir, "app.log");
    let (non_blocking, guard) = tracing_appender::non_blocking(file_appender);

    use tracing_subscriber::layer::SubscriberExt;
    use tracing_subscriber::util::SubscriberInitExt;

    let env_filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| "niazi_mobile_mart=debug,tauri=info".into());

    let _ = tracing_subscriber::registry()
        .with(env_filter)
        .with(tracing_subscriber::fmt::layer().with_writer(std::io::stdout))
        .with(
            tracing_subscriber::fmt::layer()
                .with_writer(non_blocking)
                .with_ansi(false),
        )
        .try_init();

    Box::leak(Box::new(guard));

    tracing::info!(
        "[run] Persistent logging initialized at path: {:?}",
        log_dir.join("app.log")
    );

    // Online-only PostgreSQL startup — no SQLite initialization.
    // The desktop application communicates exclusively with the central Axum server over HTTPS.
    // All business operations go through the HTTP API; Tauri is infrastructure-only (printing, updater, OS).
    // AppState is built with a lazy PgPool that is never actually exercised by the desktop process —
    // it exists only so that Tauri commands that delegate to the HTTP layer have a typed state to bind against.
    let pg_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://localhost/niazi_placeholder".to_string());

    let pool = match sqlx::PgPool::connect_lazy(&pg_url) {
        Ok(p) => p,
        Err(err) => {
            tracing::error!("[run] Failed to construct PostgreSQL pool: {err}");
            use tauri_plugin_dialog::{DialogExt, MessageDialogKind};
            let err_msg = err.to_string();
            let _ = tauri::Builder::default()
                .plugin(tauri_plugin_dialog::init())
                .setup(move |app| {
                    let handle = app.handle().clone();
                    tauri::async_runtime::spawn(async move {
                        handle
                            .dialog()
                            .message(format!(
                                "Niazi Mobile Mart failed to initialize:\n\n{}\n\nPlease verify your network connection and try again.",
                                err_msg
                            ))
                            .title("Initialization Failure")
                            .kind(MessageDialogKind::Error)
                            .show(|_| {
                                std::process::exit(1);
                            });
                    });
                    Ok(())
                })
                .run(tauri::generate_context!());
            return;
        }
    };

    let app_state = AppState::new_postgres(env!("CARGO_PKG_VERSION"), pool);

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(move |app| {
            use tauri::Manager;
            let handle = app.handle();
            let file_menu = SubmenuBuilder::new(handle, "File")
                .id("file_menu")
                .item(&PredefinedMenuItem::quit(handle, Some("Exit"))?)
                .build()?;

            let check_updates_item = MenuItem::with_id(
                handle,
                "help_check_updates",
                "Check for Updates...",
                true,
                None::<&str>,
            )?;

            let devtools_item = MenuItem::with_id(
                handle,
                "help_toggle_devtools",
                "Toggle Developer Tools (F12)",
                true,
                Some("F12"),
            )?;

            let about_item = MenuItem::with_id(
                handle,
                "help_about",
                "About Niazi Mobile Mart",
                true,
                None::<&str>,
            )?;

            let help_menu = SubmenuBuilder::new(handle, "Help")
                .id("help_menu")
                .item(&check_updates_item)
                .item(&devtools_item)
                .separator()
                .item(&about_item)
                .build()?;

            let menu = Menu::with_items(handle, &[&file_menu, &help_menu])?;
            app.set_menu(menu)?;

            if let Some(window) = app.get_webview_window("main") {
                #[cfg(debug_assertions)]
                window.open_devtools();
            }

            Ok(())
        })
        .on_menu_event(|app_handle, event| match event.id().as_ref() {
            "help_toggle_devtools" => {
                use tauri::Manager;
                if let Some(window) = app_handle.get_webview_window("main") {
                    if window.is_devtools_open() {
                        window.close_devtools();
                    } else {
                        window.open_devtools();
                    }
                }
            }
            "help_about" => {
                let version = app_handle.package_info().version.to_string();
                let app_name = app_handle.package_info().name.clone();
                let message = format!(
                    "{}\nVersion: {}\n\n© 2026 Niazi Mobile Mart\nDesktop ERP & POS System",
                    app_name, version
                );
                let handle = app_handle.clone();
                tauri::async_runtime::spawn(async move {
                    use tauri_plugin_dialog::{DialogExt, MessageDialogKind};
                    handle
                        .dialog()
                        .message(message)
                        .title("About Niazi Mobile Mart")
                        .kind(MessageDialogKind::Info)
                        .show(|_| {});
                });
            }
            "help_check_updates" => {
                use tauri::Emitter;
                let _ = app_handle.emit("trigger-update-check", ());
            }
            _ => {}
        })
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            // Diagnostics
            commands::health_check::health_check,
            commands::health_check::ping,

            // Terminal Commands
            commands::terminal::terminal_get_current,
            commands::terminal::terminal_register,
            // Updater Commands
            commands::updater::check_app_update,
            commands::updater::download_and_install_update,
            commands::updater::relaunch_app,
            commands::updater::open_external_url,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Niazi Mobile Mart Tauri application");
}
