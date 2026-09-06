pub mod commands;
pub mod db;
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

    let app_state = AppState::open_default("5.0.3");

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            commands::health_check::health_check,
            commands::health_check::ping,
            commands::auth::auth_check_bootstrap_status,
            commands::auth::auth_bootstrap_first_admin,
            commands::auth::auth_login,
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running Niazi Mobile Mart Tauri application");
}
