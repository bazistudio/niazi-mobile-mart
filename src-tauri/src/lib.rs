pub mod commands;
pub mod db;
pub mod domain;
pub mod errors;
pub mod events;
pub mod repositories;
pub mod services;
pub mod state;

use state::AppState;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, SubmenuBuilder};

fn get_log_dir() -> std::path::PathBuf {
    #[cfg(target_os = "windows")]
    {
        if let Ok(appdata) = std::env::var("APPDATA") {
            return std::path::PathBuf::from(appdata)
                .join("bazistudio.niazimobilemart")
                .join("logs");
        }
    }
    #[cfg(target_os = "macos")]
    {
        if let Ok(home) = std::env::var("HOME") {
            return std::path::PathBuf::from(home)
                .join("Library")
                .join("Application Support")
                .join("bazistudio.niazimobilemart")
                .join("logs");
        }
    }
    #[cfg(target_os = "linux")]
    {
        if let Ok(home) = std::env::var("HOME") {
            return std::path::PathBuf::from(home)
                .join(".config")
                .join("bazistudio.niazimobilemart")
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
        .with(tracing_subscriber::fmt::layer().with_writer(non_blocking).with_ansi(false))
        .try_init();

    Box::leak(Box::new(guard));

    tracing::info!("[run] Persistent logging initialized at path: {:?}", log_dir.join("app.log"));

    let app_state = AppState::open_default(env!("CARGO_PKG_VERSION"));
    let app_state_for_setup = app_state.clone();

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

            // Start Rust background SyncWorkerDaemon for offline outbox processing (single shared instance)
            let sync_worker = std::sync::Arc::new(services::SyncWorkerDaemon::new(std::sync::Arc::new(app_state_for_setup.clone())));
            {
                let sync_worker_ref = sync_worker.clone();
                let app_state_ref = app_state_for_setup.clone();
                tauri::async_runtime::block_on(async move {
                    *app_state_ref.sync_worker.write().await = Some(sync_worker_ref);
                });
            }
            sync_worker.start();

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
            commands::health_check::health_check,
            commands::health_check::ping,
            commands::auth::auth_check_bootstrap_status,
            commands::auth::auth_bootstrap_first_admin,
            commands::auth::auth_login,
            commands::auth::auth_sync_session,
            commands::auth::auth_logout,

            commands::auth::auth_change_password,
            commands::auth::auth_forced_change_password,
            commands::auth::auth_register_staff,
            commands::auth::auth_lock,
            commands::auth::auth_unlock,
            commands::auth::auth_get_current_session,
            commands::auth::auth_get_current_user,
            commands::auth::auth_check_permission,
            commands::auth::auth_check_discount_limit,
            commands::auth::admin_list_users,
            commands::auth::admin_create_user,
            commands::auth::admin_update_user,
            commands::auth::admin_reset_credentials,
            commands::auth::admin_approve_staff,
            commands::auth::admin_reject_staff,
            commands::auth::admin_reset_staff_password,
            commands::auth::admin_recover_access,
            // Terminal Commands
            commands::terminal::terminal_get_current,
            commands::terminal::terminal_register,
            // Updater Commands
            commands::updater::check_app_update,
            commands::updater::download_and_install_update,
            commands::updater::relaunch_app,
            commands::updater::open_external_url,
            // Catalog Commands
            commands::catalog::category_create,
            commands::catalog::category_get,
            commands::catalog::category_list,
            commands::catalog::category_update,
            commands::catalog::brand_create,
            commands::catalog::brand_get,
            commands::catalog::brand_list,
            commands::catalog::brand_update,
            commands::catalog::unit_create,
            commands::catalog::unit_get,
            commands::catalog::unit_list,
            commands::catalog::unit_update,
            commands::catalog::company_create,
            commands::catalog::company_get,
            commands::catalog::company_list,
            commands::catalog::company_update,
            commands::catalog::quality_create,
            commands::catalog::quality_get,
            commands::catalog::quality_list,
            commands::catalog::quality_update,
            commands::catalog::color_create,
            commands::catalog::color_get,
            commands::catalog::color_list,
            commands::catalog::color_update,
            // Product Commands
            commands::product::product_create,
            commands::product::product_update,
            commands::product::product_get,
            commands::product::product_get_by_sku,
            commands::product::product_get_by_barcode,
            commands::product::product_list,
            commands::product::product_deactivate,
            // Inventory Commands
            commands::inventory::inventory_increase,
            commands::inventory::inventory_decrease,
            commands::inventory::inventory_adjust,
            commands::inventory::inventory_transfer,
            commands::inventory::inventory_get_stock,
            commands::inventory::inventory_get_stock_map,
            commands::inventory::inventory_get_movements,
            commands::inventory::inventory_get_low_stock,
            // Organization & Branch Commands
            commands::organization::branch_list,
            commands::organization::branch_get_main,
            commands::organization::organization_get_dashboard_stats,
            // Customer & Ledger Commands
            commands::customer::customer_create,
            commands::customer::customer_update,
            commands::customer::customer_get_by_id,
            commands::customer::customer_get_detail,
            commands::customer::customer_list,
            commands::customer::customer_search,
            commands::customer::customer_get_ledger,
            commands::customer::customer_get_statement,
            commands::customer::customer_get_balance,
            commands::customer::customer_record_payment,
            commands::customer::customer_deactivate,
            // Sales & Checkout Commands
            commands::sales::sale_complete,
            commands::sales::sale_get_by_id,
            commands::sales::sale_get_by_invoice,
            commands::sales::sale_list,
            commands::sales::sale_get_lines,
            commands::sales::sale_get_payments,
            // Supplier Domain Commands (Phase 16)
            commands::supplier::supplier_create,
            commands::supplier::supplier_update,
            commands::supplier::supplier_get_by_id,
            commands::supplier::supplier_get_detail,
            commands::supplier::supplier_list,
            commands::supplier::supplier_search,
            commands::supplier::supplier_get_ledger,
            commands::supplier::supplier_get_statement,
            commands::supplier::supplier_get_balance,
            commands::supplier::supplier_record_payment,
            commands::supplier::supplier_deactivate,
            // Purchases Domain Commands (Phase 16)
            commands::purchases::purchase_complete,
            commands::purchases::purchase_get_by_id,
            commands::purchases::purchase_get_by_number,
            commands::purchases::purchase_list,
            commands::purchases::purchase_get_lines,
            // Expense Commands (Phase 17)
            commands::expense::expense_category_create,
            commands::expense::expense_category_update,
            commands::expense::expense_category_list,
            commands::expense::expense_create,
            commands::expense::expense_get_by_id,
            commands::expense::expense_list,
            commands::expense::expense_cancel,
            // Cash Management & Closing Commands (Phase 17)
            commands::cash::cash_session_open,
            commands::cash::cash_session_get_current,
            commands::cash::cash_session_get_by_id,
            commands::cash::cash_session_list,
            commands::cash::cash_session_close,
            commands::cash::cash_adjustment_create,
            commands::cash::cash_movement_list,
            commands::cash::cash_get_daily_summary,
            // Sales & Purchase Return Commands (Phase 18)
            commands::sales_return::sales_return_get_returnable,
            commands::sales_return::sales_return_create,
            commands::sales_return::sales_return_get,
            commands::sales_return::sales_return_list,
            commands::sales_return::sales_return_get_by_sale,
            commands::purchase_return::purchase_return_get_returnable,
            commands::purchase_return::purchase_return_create,
            commands::purchase_return::purchase_return_get,
            commands::purchase_return::purchase_return_list,
            commands::purchase_return::purchase_return_get_by_purchase,
            // Profitability & COGS Commands (Phase 20)
            commands::profit::profit_get_period,
            commands::profit::profit_get_daily,
            commands::profit::profit_get_product,
            commands::profit::profit_get_sale,
            commands::profit::profit_get_dashboard_summary,
            // Offline Sync Engine Commands (Plan A)
            commands::sync::sync_get_status,
            commands::sync::sync_trigger_now,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Niazi Mobile Mart Tauri application");
}
