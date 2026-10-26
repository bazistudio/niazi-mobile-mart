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

    let app_state = if let Ok(database_url) = std::env::var("DATABASE_URL") {
        tracing::info!("[run] DATABASE_URL detected. Initializing purely online PostgreSQL mode.");
        let pool = sqlx::PgPool::connect_lazy(&database_url).expect("Failed to create PostgreSQL connection pool");
        AppState::new_postgres(env!("CARGO_PKG_VERSION"), pool)
    } else {
        match AppState::try_open_default(env!("CARGO_PKG_VERSION")) {
            Ok(state) => state,
            Err(err) => {
                tracing::error!("[run] Critical database initialization failure: {err}");
                use tauri_plugin_dialog::{DialogExt, MessageDialogKind};
                let err_msg = err.clone();
                let _ = tauri::Builder::default()
                    .plugin(tauri_plugin_dialog::init())
                    .setup(move |app| {
                        let handle = app.handle().clone();
                        tauri::async_runtime::spawn(async move {
                            handle
                                .dialog()
                                .message(format!(
                                    "Niazi Mobile Mart failed to initialize the local database:\n\n{}\n\nPlease check file permissions or close other running instances.",
                                    err_msg
                                ))
                                .title("Database Initialization Failure")
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
        }
    };
    let app_state_for_setup = app_state.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(move |app| {
            use tauri::Manager;
            let handle = app.handle();
            // ─────────────────────────────────────────────────────────────
            // 1. FILE MENU
            // ─────────────────────────────────────────────────────────────
            let file_new_sale = MenuItem::with_id(handle, "nav_pos", "New Sale\tCtrl+P", true, Some("Ctrl+P"))?;
            let file_add_product = MenuItem::with_id(handle, "action_add_product", "Add Product...", true, None::<&str>)?;
            let file_add_mobile = MenuItem::with_id(handle, "nav_mobiles_add", "Add Mobile Intake...", true, None::<&str>)?;
            let file_record_expense = MenuItem::with_id(handle, "action_record_expense", "Record Expense...\tCtrl+O", true, Some("Ctrl+O"))?;
            let file_lock_terminal = MenuItem::with_id(handle, "action_lock_terminal", "Lock Terminal\tCtrl+L", true, Some("Ctrl+L"))?;
            let file_sign_out = MenuItem::with_id(handle, "nav_profile", "Your Profile / Sign Out...", true, None::<&str>)?;

            let file_menu = SubmenuBuilder::new(handle, "File")
                .id("file_menu")
                .item(&file_new_sale)
                .item(&file_add_product)
                .item(&file_add_mobile)
                .item(&file_record_expense)
                .separator()
                .item(&file_lock_terminal)
                .item(&file_sign_out)
                .separator()
                .item(&PredefinedMenuItem::quit(handle, Some("Exit"))?)
                .build()?;

            // ─────────────────────────────────────────────────────────────
            // 2. EDIT MENU (Standard native editing accelerators)
            // ─────────────────────────────────────────────────────────────
            let edit_menu = SubmenuBuilder::new(handle, "Edit")
                .id("edit_menu")
                .item(&PredefinedMenuItem::undo(handle, Some("Undo\tCtrl+Z"))?)
                .item(&PredefinedMenuItem::redo(handle, Some("Redo\tCtrl+Y"))?)
                .separator()
                .item(&PredefinedMenuItem::cut(handle, Some("Cut\tCtrl+X"))?)
                .item(&PredefinedMenuItem::copy(handle, Some("Copy\tCtrl+C"))?)
                .item(&PredefinedMenuItem::paste(handle, Some("Paste\tCtrl+V"))?)
                .item(&PredefinedMenuItem::select_all(handle, Some("Select All\tCtrl+A"))?)
                .build()?;

            // ─────────────────────────────────────────────────────────────
            // 3. VIEW MENU
            // ─────────────────────────────────────────────────────────────
            let view_dashboard = MenuItem::with_id(handle, "nav_dashboard", "Branch Dashboard\tCtrl+D", true, Some("Ctrl+D"))?;
            let view_org_dashboard = MenuItem::with_id(handle, "nav_org_dashboard", "Organization Dashboard", true, None::<&str>)?;
            let view_fullscreen = MenuItem::with_id(handle, "action_toggle_fullscreen", "Toggle Fullscreen\tF11", true, Some("F11"))?;

            let view_menu = SubmenuBuilder::new(handle, "View")
                .id("view_menu")
                .item(&view_dashboard)
                .item(&view_org_dashboard)
                .separator()
                .item(&view_fullscreen)
                .build()?;

            // ─────────────────────────────────────────────────────────────
            // 4. SALES & POS MENU
            // ─────────────────────────────────────────────────────────────
            let sales_pos = MenuItem::with_id(handle, "nav_pos", "Open POS Terminal\tCtrl+P", true, None::<&str>)?;
            let sales_analytics = MenuItem::with_id(handle, "nav_sales_analytics", "Sales Analytics", true, None::<&str>)?;
            let sales_history = MenuItem::with_id(handle, "nav_history", "Transaction History", true, None::<&str>)?;

            let sales_menu = SubmenuBuilder::new(handle, "Sales & POS")
                .id("sales_menu")
                .item(&sales_pos)
                .item(&sales_analytics)
                .item(&sales_history)
                .build()?;

            // ─────────────────────────────────────────────────────────────
            // 5. INVENTORY MENU
            // ─────────────────────────────────────────────────────────────
            let inv_products = MenuItem::with_id(handle, "nav_inventory", "Products & Stock Catalog\tCtrl+I", true, Some("Ctrl+I"))?;
            let inv_mobiles = MenuItem::with_id(handle, "nav_mobiles", "Mobile Inventory (IMEI)", true, None::<&str>)?;
            let inv_add_mobile = MenuItem::with_id(handle, "nav_mobiles_add", "Add Mobile Intake", true, None::<&str>)?;
            let inv_stock = MenuItem::with_id(handle, "nav_inventory_stock", "Stock Levels & Adjustments", true, None::<&str>)?;
            let inv_import = MenuItem::with_id(handle, "nav_inventory_import", "Bulk Product Import", true, None::<&str>)?;

            let inventory_menu = SubmenuBuilder::new(handle, "Inventory")
                .id("inventory_menu")
                .item(&inv_products)
                .item(&inv_mobiles)
                .item(&inv_add_mobile)
                .separator()
                .item(&inv_stock)
                .item(&inv_import)
                .build()?;

            // ─────────────────────────────────────────────────────────────
            // 6. FINANCIALS MENU
            // ─────────────────────────────────────────────────────────────
            let fin_cash = MenuItem::with_id(handle, "nav_cash", "Cash Management & Till Register", true, None::<&str>)?;
            let fin_org_cash = MenuItem::with_id(handle, "nav_org_cash", "All-Branches Cash Overview", true, None::<&str>)?;
            let fin_customers = MenuItem::with_id(handle, "nav_customers", "Customer Accounts & Receivables", true, None::<&str>)?;
            let fin_suppliers = MenuItem::with_id(handle, "nav_suppliers", "Supplier Accounts & Payables", true, None::<&str>)?;
            let fin_ledger = MenuItem::with_id(handle, "nav_ledger", "Business Ledger Book", true, None::<&str>)?;
            let fin_expenses = MenuItem::with_id(handle, "nav_expenses", "Operational Expenses Ledger", true, None::<&str>)?;

            let financials_menu = SubmenuBuilder::new(handle, "Financials")
                .id("financials_menu")
                .item(&fin_cash)
                .item(&fin_org_cash)
                .separator()
                .item(&fin_customers)
                .item(&fin_suppliers)
                .separator()
                .item(&fin_ledger)
                .item(&fin_expenses)
                .build()?;

            // ─────────────────────────────────────────────────────────────
            // 7. ADMINISTRATION MENU
            // ─────────────────────────────────────────────────────────────
            let admin_org_dash = MenuItem::with_id(handle, "nav_org_dashboard", "Organization Overview", true, None::<&str>)?;
            let admin_branches = MenuItem::with_id(handle, "nav_admin_branches", "Branch Management & Outlets", true, None::<&str>)?;
            let admin_workforce = MenuItem::with_id(handle, "nav_admin_workforce", "Users & Staff Administration", true, None::<&str>)?;
            let admin_roles = MenuItem::with_id(handle, "nav_admin_roles", "Roles & Access Permissions", true, None::<&str>)?;
            let admin_audit = MenuItem::with_id(handle, "nav_admin_audit", "Audit Log Records", true, None::<&str>)?;
            let admin_backup = MenuItem::with_id(handle, "nav_admin_backup", "Database Backup & Restore Settings", true, None::<&str>)?;

            let admin_menu = SubmenuBuilder::new(handle, "Administration")
                .id("admin_menu")
                .item(&admin_org_dash)
                .separator()
                .item(&admin_branches)
                .item(&admin_workforce)
                .item(&admin_roles)
                .separator()
                .item(&admin_audit)
                .item(&admin_backup)
                .build()?;

            // ─────────────────────────────────────────────────────────────
            // 8. HELP MENU
            // ─────────────────────────────────────────────────────────────
            let help_user_guide = MenuItem::with_id(handle, "help_user_guide", "User Guide & Documentation", true, None::<&str>)?;
            let help_workforce_guide = MenuItem::with_id(handle, "help_guide_workforce", "Users & Staff Administration Guide", true, None::<&str>)?;
            let help_roles_guide = MenuItem::with_id(handle, "help_guide_roles", "Roles & Permissions Guide", true, None::<&str>)?;
            let help_branches_guide = MenuItem::with_id(handle, "help_guide_branches", "Branch Management Guide", true, None::<&str>)?;
            let help_backup_guide = MenuItem::with_id(handle, "help_guide_backup", "Database Backup & Safety Guide", true, None::<&str>)?;
            let help_printer_setup = MenuItem::with_id(handle, "nav_printer_settings", "Printer & Hardware Setup...", true, None::<&str>)?;
            let check_updates_item = MenuItem::with_id(handle, "help_check_updates", "Check for Updates...", true, None::<&str>)?;
            let devtools_item = MenuItem::with_id(handle, "help_toggle_devtools", "Toggle Developer Tools (F12)", true, Some("F12"))?;
            let about_item = MenuItem::with_id(handle, "help_about", "About Niazi Mobile Mart", true, None::<&str>)?;

            let help_menu = SubmenuBuilder::new(handle, "Help")
                .id("help_menu")
                .item(&help_user_guide)
                .separator()
                .item(&help_workforce_guide)
                .item(&help_roles_guide)
                .item(&help_branches_guide)
                .item(&help_backup_guide)
                .separator()
                .item(&help_printer_setup)
                .item(&check_updates_item)
                .item(&devtools_item)
                .separator()
                .item(&about_item)
                .build()?;

            let menu = Menu::with_items(
                handle,
                &[
                    &file_menu,
                    &edit_menu,
                    &view_menu,
                    &sales_menu,
                    &inventory_menu,
                    &financials_menu,
                    &admin_menu,
                    &help_menu,
                ],
            )?;
            app.set_menu(menu)?;

            // Start Rust background SyncWorkerDaemon for offline outbox processing if running in SQLite mode
            if app_state_for_setup.pg_pool.is_none() {
                let sync_worker = std::sync::Arc::new(services::SyncWorkerDaemon::new(
                    std::sync::Arc::new(app_state_for_setup.clone())
                ));
                {
                    let sync_worker_ref = sync_worker.clone();
                    let app_state_ref = app_state_for_setup.clone();
                    let handle_for_sync = app.handle().clone();
                    tauri::async_runtime::spawn(async move {
                        sync_worker_ref.set_app_handle(handle_for_sync).await;
                        *app_state_ref.sync_worker.write().await = Some(sync_worker_ref.clone());
                        sync_worker_ref.start();
                    });
                }
            } else {
                tracing::info!("[run] Online Postgres mode active. Skipping SyncWorkerDaemon startup.");
            }

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.maximize();
                #[cfg(debug_assertions)]
                window.open_devtools();
            }

            Ok(())
        })
        .on_menu_event(|app_handle, event| {
            use tauri::Emitter;
            match event.id().as_ref() {
                // ── Help: Developer Tools ──
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
                // ── Help: About Dialog ──
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
                // ── Help: Check for Updates ──
                "help_check_updates" => {
                    let _ = app_handle.emit("trigger-update-check", ());
                }
                // ── View: Fullscreen ──
                "action_toggle_fullscreen" => {
                    use tauri::Manager;
                    if let Some(window) = app_handle.get_webview_window("main") {
                        if let Ok(is_full) = window.is_fullscreen() {
                            let _ = window.set_fullscreen(!is_full);
                        }
                    }
                }
                // ── Actions ──
                "action_add_product" => {
                    let _ = app_handle.emit("menu-action", "add_product");
                }
                "action_record_expense" => {
                    let _ = app_handle.emit("menu-action", "record_expense");
                }
                "action_lock_terminal" => {
                    let _ = app_handle.emit("menu-action", "lock_terminal");
                }
                // ── User Guide Sections ──
                "help_user_guide" => {
                    let _ = app_handle.emit("menu-action", "open_user_guide");
                }
                "help_guide_workforce" => {
                    let _ = app_handle.emit("menu-action", "open_user_guide_workforce");
                }
                "help_guide_roles" => {
                    let _ = app_handle.emit("menu-action", "open_user_guide_roles");
                }
                "help_guide_branches" => {
                    let _ = app_handle.emit("menu-action", "open_user_guide_branches");
                }
                "help_guide_backup" => {
                    let _ = app_handle.emit("menu-action", "open_user_guide_backup");
                }
                // ── Navigation Routes ──
                "nav_pos" => {
                    let _ = app_handle.emit("menu-navigate", "/dashboard/shop-admin/pos");
                }
                "nav_dashboard" => {
                    let _ = app_handle.emit("menu-navigate", "/dashboard/shop-admin");
                }
                "nav_org_dashboard" => {
                    let _ = app_handle.emit("menu-navigate", "/dashboard/organization");
                }
                "nav_sales_analytics" => {
                    let _ = app_handle.emit("menu-navigate", "/dashboard/shop-admin/sales");
                }
                "nav_history" => {
                    let _ = app_handle.emit("menu-navigate", "/dashboard/shop-admin/history");
                }
                "nav_inventory" => {
                    let _ = app_handle.emit("menu-navigate", "/dashboard/shop-admin/inventory");
                }
                "nav_mobiles" => {
                    let _ = app_handle.emit("menu-navigate", "/dashboard/shop-admin/mobiles");
                }
                "nav_mobiles_add" => {
                    let _ = app_handle.emit("menu-navigate", "/dashboard/shop-admin/mobiles/add");
                }
                "nav_inventory_stock" => {
                    let _ = app_handle.emit("menu-navigate", "/dashboard/shop-admin/inventory/stock");
                }
                "nav_inventory_import" => {
                    let _ = app_handle.emit("menu-navigate", "/dashboard/shop-admin/inventory/import");
                }
                "nav_cash" => {
                    let _ = app_handle.emit("menu-navigate", "/dashboard/shop-admin/cash");
                }
                "nav_org_cash" => {
                    let _ = app_handle.emit("menu-navigate", "/dashboard/organization/cash");
                }
                "nav_customers" => {
                    let _ = app_handle.emit("menu-navigate", "/dashboard/shop-admin/customers");
                }
                "nav_suppliers" => {
                    let _ = app_handle.emit("menu-navigate", "/dashboard/shop-admin/suppliers");
                }
                "nav_ledger" => {
                    let _ = app_handle.emit("menu-navigate", "/dashboard/shop-admin/ledger");
                }
                "nav_expenses" => {
                    let _ = app_handle.emit("menu-navigate", "/dashboard/shop-admin/expenses");
                }
                "nav_admin_branches" => {
                    let _ = app_handle.emit("menu-navigate", "/dashboard/organization/settings?tab=branches");
                }
                "nav_admin_workforce" => {
                    let _ = app_handle.emit("menu-navigate", "/dashboard/shop-admin/settings/workforce");
                }
                "nav_admin_roles" => {
                    let _ = app_handle.emit("menu-navigate", "/dashboard/organization/settings?tab=roles");
                }
                "nav_admin_audit" => {
                    let _ = app_handle.emit("menu-navigate", "/dashboard/shop-admin/audit-logs");
                }
                "nav_admin_backup" => {
                    let _ = app_handle.emit("menu-navigate", "/dashboard/organization/settings?tab=backup");
                }
                "nav_printer_settings" => {
                    let _ = app_handle.emit("menu-navigate", "/dashboard/shop-admin/settings/printer");
                }
                "nav_profile" => {
                    let _ = app_handle.emit("menu-navigate", "/dashboard/shop-admin/profile");
                }
                _ => {}
            }
        })
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            commands::health_check::health_check,
            commands::health_check::ping,
            commands::auth::auth_check_bootstrap_status,
            commands::auth::auth_bootstrap_first_admin,
            commands::auth::auth_login,
            commands::auth::auth_login_snapshot,
            commands::auth::auth_bootstrap_central_snapshots,
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
            commands::auth::admin_verify_password,
            commands::auth::admin_delete_user,
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
            // Product Domain Fully Transferred to TypeScript Backend (v1.3.7)
            // Typed Storage Commands (Inventory Domain Boundary)
            commands::storage_inventory::storage_inventory_increase,
            commands::storage_inventory::storage_inventory_decrease,
            commands::storage_inventory::storage_inventory_adjust,
            commands::storage_inventory::storage_inventory_transfer,
            commands::storage_inventory::storage_inventory_get_stock,
            commands::storage_inventory::storage_inventory_get_stock_map,
            commands::storage_inventory::storage_inventory_get_movements,
            commands::storage_inventory::storage_inventory_get_low_stock,
            // Typed Storage Commands (Sales / POS Domain Boundary)
            commands::storage_sale::storage_sale_complete,
            commands::storage_sale::storage_sale_get_by_id,
            commands::storage_sale::storage_sale_get_by_invoice,
            commands::storage_sale::storage_sale_list,
            commands::storage_sale::storage_sale_get_lines,
            commands::storage_sale::storage_sale_get_payments,
            // Typed Storage Commands (Customer / Customer Ledger Domain Boundary)
            commands::storage_customer::storage_customer_create,
            commands::storage_customer::storage_customer_update,
            commands::storage_customer::storage_customer_get_by_id,
            commands::storage_customer::storage_customer_get_detail,
            commands::storage_customer::storage_customer_list,
            commands::storage_customer::storage_customer_search,
            commands::storage_customer::storage_customer_get_ledger,
            commands::storage_customer::storage_customer_get_statement,
            commands::storage_customer::storage_customer_get_balance,
            commands::storage_customer::storage_customer_record_payment,
            commands::storage_customer::storage_customer_deactivate,
            // Typed Storage Commands (Supplier / Supplier Ledger Domain Boundary)
            commands::storage_supplier::storage_supplier_create,
            commands::storage_supplier::storage_supplier_update,
            commands::storage_supplier::storage_supplier_get_by_id,
            commands::storage_supplier::storage_supplier_get_detail,
            commands::storage_supplier::storage_supplier_list,
            commands::storage_supplier::storage_supplier_search,
            commands::storage_supplier::storage_supplier_get_ledger,
            commands::storage_supplier::storage_supplier_get_statement,
            commands::storage_supplier::storage_supplier_get_balance,
            commands::storage_supplier::storage_supplier_record_payment,
            commands::storage_supplier::storage_supplier_deactivate,
            // Typed Storage Commands (Purchasing / Procurement Domain Boundary)
            commands::storage_purchase::storage_purchase_complete,
            commands::storage_purchase::storage_purchase_get_by_id,
            commands::storage_purchase::storage_purchase_get_by_number,
            commands::storage_purchase::storage_purchase_list,
            commands::storage_purchase::storage_purchase_get_lines,
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
            commands::organization::organization_get_dashboard_balances,
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
            commands::sync::sync_list_conflicts,
            commands::sync::sync_list_failed,
            commands::sync::sync_retry_failed_item,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Niazi Mobile Mart Tauri application");
}
