use tauri::State;
use crate::domain::sync_queue::SyncQueueItem;
use crate::errors::{AppError, AppResult};
use crate::services::auth_service::AuthService;
use crate::services::sync_worker::SyncEngineStatus;
use crate::state::AppState;

#[tauri::command]
pub async fn sync_get_status(state: State<'_, AppState>) -> AppResult<SyncEngineStatus> {
    let worker_guard = state.sync_worker.read().await;
    if let Some(worker) = worker_guard.as_ref() {
        Ok(worker.get_status().await)
    } else {
        let (pending_count, conflict_count, failed_count) = match &state.sync_queue_repo {
            Some(r) => (
                r.count_pending().await.unwrap_or(0),
                r.count_conflict().await.unwrap_or(0),
                r.count_failed_permanent().await.unwrap_or(0),
            ),
            None => (0, 0, 0),
        };
        Ok(SyncEngineStatus {
            pending_count,
            is_online: true,
            is_syncing: false,
            is_auth_paused: false,
            conflict_count,
            failed_count,
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
        is_auth_paused: false,
        conflict_count: 0,
        failed_count: 0,
        last_synced_at: None,
        last_error: None,
    })
}

#[tauri::command]
pub async fn sync_list_conflicts(
    state: State<'_, AppState>,
    limit: Option<usize>,
) -> AppResult<Vec<SyncQueueItem>> {
    AuthService::require_org_admin(&state).await?;
    let repo = state
        .sync_queue_repo
        .as_ref()
        .ok_or_else(|| AppError::Database("Sync queue repository is not available".to_string()))?;
    repo.list_conflicts(limit.unwrap_or(50)).await
}

#[tauri::command]
pub async fn sync_list_failed(
    state: State<'_, AppState>,
    limit: Option<usize>,
) -> AppResult<Vec<SyncQueueItem>> {
    AuthService::require_org_admin(&state).await?;
    let repo = state
        .sync_queue_repo
        .as_ref()
        .ok_or_else(|| AppError::Database("Sync queue repository is not available".to_string()))?;
    repo.list_failed_permanent(limit.unwrap_or(50)).await
}

#[tauri::command]
pub async fn sync_retry_failed_item(
    state: State<'_, AppState>,
    client_event_id: String,
) -> AppResult<SyncQueueItem> {
    AuthService::require_org_admin(&state).await?;
    let org_id = crate::domain::organization::NIAZI_ORGANIZATION_ID;

    let repo = state
        .sync_queue_repo
        .as_ref()
        .ok_or_else(|| AppError::Database("Sync queue repository is not available".to_string()))?;

    let res = repo
        .reset_failed_permanent_for_retry(&client_event_id, org_id)
        .await?;

    let worker_guard = state.sync_worker.read().await;
    if let Some(worker) = worker_guard.as_ref() {
        let worker_clone = worker.clone();
        tauri::async_runtime::spawn(async move {
            worker_clone.run_background_tick().await;
        });
    }

    Ok(res)
}
