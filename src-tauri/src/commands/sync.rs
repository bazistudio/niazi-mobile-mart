use tauri::State;
use crate::errors::AppResult;
use crate::services::sync_worker::SyncEngineStatus;
use crate::state::AppState;

#[tauri::command]
pub async fn sync_get_status(state: State<'_, AppState>) -> AppResult<SyncEngineStatus> {
    let pending_count = match &state.sync_queue_repo {
        Some(r) => r.count_pending().await.unwrap_or(0),
        None => 0,
    };

    Ok(SyncEngineStatus {
        pending_count,
        is_online: true,
        last_synced_at: None,
        last_error: None,
    })
}

#[tauri::command]
pub async fn sync_trigger_now(state: State<'_, AppState>) -> AppResult<SyncEngineStatus> {
    let pending_count = match &state.sync_queue_repo {
        Some(r) => r.count_pending().await.unwrap_or(0),
        None => 0,
    };

    let now = chrono::Utc::now().to_rfc3339();

    Ok(SyncEngineStatus {
        pending_count,
        is_online: true,
        last_synced_at: Some(now),
        last_error: None,
    })
}
