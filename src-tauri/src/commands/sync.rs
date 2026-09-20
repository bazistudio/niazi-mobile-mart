use tauri::State;
use crate::errors::AppResult;
use crate::services::sync_worker::SyncEngineStatus;
use crate::state::AppState;

#[tauri::command]
pub async fn sync_get_status(state: State<'_, AppState>) -> AppResult<SyncEngineStatus> {
    let worker_guard = state.sync_worker.read().await;
    if let Some(worker) = worker_guard.as_ref() {
        Ok(worker.get_status().await)
    } else {
        let pending_count = match &state.sync_queue_repo {
            Some(r) => r.count_pending().await.unwrap_or(0),
            None => 0,
        };
        Ok(SyncEngineStatus {
            pending_count,
            is_online: true,
            is_syncing: false,
            last_synced_at: None,
            last_error: None,
        })
    }
}

#[tauri::command]
pub async fn sync_trigger_now(state: State<'_, AppState>) -> AppResult<SyncEngineStatus> {
    let worker_guard = state.sync_worker.read().await;
    if let Some(worker) = worker_guard.as_ref() {
        // Set is_syncing = true in status immediately
        {
            let status_lock = worker.get_status_lock();
            let mut st = status_lock.write().await;
            st.is_syncing = true;
        }

        // Spawn manual sync pipeline execution on Tokio runtime so Tauri IPC returns instantly
        let worker_clone = worker.clone();
        tauri::async_runtime::spawn(async move {
            worker_clone.run_manual_sync().await;
        });

        return Ok(worker.get_status().await);
    }

    Ok(SyncEngineStatus {
        pending_count: 0,
        is_online: true,
        is_syncing: false,
        last_synced_at: None,
        last_error: None,
    })
}
