use serde::Serialize;
use tauri::{AppHandle, Emitter};

pub mod event_names {
    pub const HEALTH_PING: &str = "domain:health_ping";
    pub const STOCK_UPDATED: &str = "domain:stock_updated";
    pub const ORDER_CREATED: &str = "domain:order_created";
    pub const REPAIR_STATUS_CHANGED: &str = "domain:repair_status_changed";
}

/// Dispatches a structured domain event across the Tauri WebView event bus
pub fn emit_domain_event<T>(app: &AppHandle, event_name: &str, payload: &T) -> Result<(), tauri::Error>
where
    T: Serialize + Clone,
{
    app.emit(event_name, payload)
}
