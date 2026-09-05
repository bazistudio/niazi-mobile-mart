use serde::Serialize;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::State;

use crate::errors::AppResult;
use crate::state::AppState;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct HealthResponse {
    pub status: String,
    pub app_name: String,
    pub version: String,
    pub engine: String,
    pub timestamp_ms: u128,
}

/// Baseline IPC health check verifying React -> Tauri IPC -> Rust
#[tauri::command]
pub async fn health_check(state: State<'_, AppState>) -> AppResult<HealthResponse> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();

    Ok(HealthResponse {
        status: "ok".to_string(),
        app_name: "Niazi Mobile Mart".to_string(),
        version: state.app_version.clone(),
        engine: "Tauri 2 + Rust Native".to_string(),
        timestamp_ms: now,
    })
}

/// Simple ping command for round-trip latency validation
#[tauri::command]
pub async fn ping(message: Option<String>) -> Result<String, String> {
    let msg = message.unwrap_or_else(|| "hello from tauri".to_string());
    Ok(format!("pong: {msg}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_ping_command() {
        let res = ping(Some("test_ipc".to_string())).await.unwrap();
        assert_eq!(res, "pong: test_ipc");

        let default_res = ping(None).await.unwrap();
        assert_eq!(default_res, "pong: hello from tauri");
    }

    #[test]
    fn test_health_response_structure() {
        let hr = HealthResponse {
            status: "ok".to_string(),
            app_name: "Niazi Mobile Mart".to_string(),
            version: "5.0.3".to_string(),
            engine: "Tauri 2 + Rust Native".to_string(),
            timestamp_ms: 1700000000,
        };
        let json = serde_json::to_string(&hr).unwrap();
        assert!(json.contains("Niazi Mobile Mart"));
        assert!(json.contains("Tauri 2 + Rust Native"));
    }
}
