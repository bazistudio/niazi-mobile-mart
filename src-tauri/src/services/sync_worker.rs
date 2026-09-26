use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;
use tracing::info;

use crate::domain::sync_queue::SyncQueueStatus;
use crate::state::AppState;

pub const DEFAULT_CENTRAL_SERVER_URL: &str = "https://niazi-server-860232188829.asia-south1.run.app";

/// Status DTO representing live sync engine state for UI and monitoring
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SyncEngineStatus {
    pub pending_count: i64,
    pub is_online: bool,
    pub is_syncing: bool,
    pub is_auth_paused: bool,
    pub conflict_count: i64,
    pub failed_count: i64,
    pub last_synced_at: Option<String>,
    pub last_error: Option<String>,
}

/// Background synchronization daemon responsible for outbox pushes and 15-minute reconciliation pulls
#[derive(Clone)]
pub struct SyncWorkerDaemon {
    app_state: Arc<AppState>,
    status: Arc<RwLock<SyncEngineStatus>>,
    execution_lock: Arc<tokio::sync::Mutex<()>>,
}

impl SyncWorkerDaemon {
    pub fn new(app_state: Arc<AppState>) -> Self {
        Self {
            app_state,
            status: Arc::new(RwLock::new(SyncEngineStatus {
                pending_count: 0,
                is_online: true,
                is_syncing: false,
                is_auth_paused: false,
                conflict_count: 0,
                failed_count: 0,
                last_synced_at: None,
                last_error: None,
            })),
            execution_lock: Arc::new(tokio::sync::Mutex::new(())),
        }
    }

    pub fn get_status_lock(&self) -> Arc<RwLock<SyncEngineStatus>> {
        self.status.clone()
    }

    pub async fn get_status(&self) -> SyncEngineStatus {
        let guard = self.status.read().await;
        guard.clone()
    }

    /// Asynchronous coordinator for manual sync execution (guaranteed execution, no try_lock preemption failure)
    pub async fn run_manual_sync(&self) {
        let _guard = self.execution_lock.lock().await;

        {
            let mut st = self.status.write().await;
            st.is_syncing = true;
        }

        info!("[SyncWorkerDaemon] Starting manual sync pipeline (push outbox + pull downstream)...");
        self.sync_outbox_push().await;
        self.sync_downstream_pull().await;
        self.sync_auth_snapshots().await;

        let (pending_count, conflict_count, failed_count) = match &self.app_state.sync_queue_repo {
            Some(r) => (
                r.count_pending().await.unwrap_or(0),
                r.count_conflict().await.unwrap_or(0),
                r.count_failed_permanent().await.unwrap_or(0),
            ),
            None => (0, 0, 0),
        };
        let now = chrono::Utc::now().to_rfc3339();

        let mut st = self.status.write().await;
        st.is_syncing = false;
        st.pending_count = pending_count;
        st.conflict_count = conflict_count;
        st.failed_count = failed_count;
        if st.last_error.is_none() {
            st.last_synced_at = Some(now);
        }
        info!("[SyncWorkerDaemon] Manual sync pipeline completed (pending={}, conflicts={}, failed={})", pending_count, conflict_count, failed_count);
    }

    /// Background outbox tick (defers gracefully if manual sync holds execution lock)
    pub async fn run_background_tick(&self) {
        let _guard = match self.execution_lock.try_lock() {
            Ok(g) => g,
            Err(_) => return,
        };

        self.sync_outbox_push().await;
    }

    /// Spawns the background daemon Tokio loop
    pub fn start(&self) {
        let daemon = self.clone();
        tauri::async_runtime::spawn(async move {
            info!("Starting background SyncWorkerDaemon loop...");
            let mut pull_timer = tokio::time::interval(Duration::from_secs(900)); // 15-minute reconciliation pull interval

            loop {
                tokio::select! {
                    _ = tokio::time::sleep(Duration::from_secs(15)) => {
                        daemon.run_background_tick().await;
                    }
                    _ = pull_timer.tick() => {
                        let _guard = daemon.execution_lock.try_lock();
                        if _guard.is_ok() {
                            daemon.sync_downstream_pull().await;
                        }
                    }
                }
            }
        });
    }

    /// Pushes pending outbox items to central Cloud Run API endpoint
    pub async fn sync_outbox_push(&self) {
        let session = self.app_state.get_session().await;
        let token = match &session.active_token {
            Some(t) if session.is_authenticated => {
                let mut st = self.status.write().await;
                st.is_auth_paused = false;
                t.clone()
            }
            _ => {
                let mut st = self.status.write().await;
                st.is_auth_paused = true;
                return; // Wait for user authentication: do not attempt HTTP push without JWT
            }
        };

        let sync_queue_repo = match &self.app_state.sync_queue_repo {
            Some(r) => r,
            None => return,
        };

        let pending_count = sync_queue_repo.count_pending().await.unwrap_or(0);
        let conflict_count = sync_queue_repo.count_conflict().await.unwrap_or(0);
        let failed_count = sync_queue_repo.count_failed_permanent().await.unwrap_or(0);

        {
            let mut st = self.status.write().await;
            st.pending_count = pending_count;
            st.conflict_count = conflict_count;
            st.failed_count = failed_count;
        }

        if pending_count == 0 {
            let mut st = self.status.write().await;
            st.is_online = true;
            return;
        }

        let pending_items = match sync_queue_repo.get_pending(50).await {
            Ok(items) => items,
            Err(e) => {
                let mut st = self.status.write().await;
                st.last_error = Some(e.to_string());
                return;
            }
        };

        if pending_items.is_empty() {
            return;
        }

        let server_url = std::env::var("CENTRAL_SERVER_URL")
            .unwrap_or_else(|_| DEFAULT_CENTRAL_SERVER_URL.to_string());

        let client = match reqwest::Client::builder().timeout(Duration::from_secs(10)).build() {
            Ok(c) => c,
            Err(_) => return,
        };

        let push_url = format!("{}/api/v1/sync/push", server_url.trim_end_matches('/'));
        let payload = serde_json::json!({
            "events": pending_items
        });

        match client
            .post(&push_url)
            .header("Authorization", format!("Bearer {token}"))
            .json(&payload)
            .send()
            .await
        {
            Ok(resp) if resp.status().is_success() => {
                if let Ok(ack_json) = resp.json::<serde_json::Value>().await {
                    if let Some(results) = ack_json.get("results").and_then(|r| r.as_array()) {
                        for res in results {
                            let client_evt = match res.get("client_event_id").and_then(|s| s.as_str()) {
                                Some(id) => id,
                                None => continue,
                            };
                            let server_evt = res.get("server_event_id").and_then(|s| s.as_str());
                            let status_str = res.get("status").and_then(|s| s.as_str()).unwrap_or("SYNCED");
                            let err_msg = res.get("error").and_then(|s| s.as_str());

                            match status_str {
                                "SYNCED" => {
                                    let _ = sync_queue_repo
                                        .update_status_ext(client_evt, SyncQueueStatus::Synced, None, server_evt, false)
                                        .await;
                                }
                                "DEPENDENCY_NOT_FOUND" => {
                                    let _ = sync_queue_repo
                                        .update_status_ext(client_evt, SyncQueueStatus::Pending, err_msg, None, false)
                                        .await;
                                }
                                "FAILED_PERMANENT" => {
                                    let _ = sync_queue_repo
                                        .update_status_ext(client_evt, SyncQueueStatus::FailedPermanent, err_msg, None, true)
                                        .await;
                                }
                                "CONFLICT" => {
                                    let _ = sync_queue_repo
                                        .update_status_ext(client_evt, SyncQueueStatus::Conflict, err_msg, None, false)
                                        .await;
                                }
                                _ => {
                                    let _ = sync_queue_repo
                                        .update_status_ext(client_evt, SyncQueueStatus::Pending, err_msg, None, true)
                                        .await;
                                }
                            }
                        }
                    }
                }
                let now = chrono::Utc::now().to_rfc3339();
                let remaining_pending = sync_queue_repo.count_pending().await.unwrap_or(0);
                let remaining_conflict = sync_queue_repo.count_conflict().await.unwrap_or(0);
                let remaining_failed = sync_queue_repo.count_failed_permanent().await.unwrap_or(0);

                let mut st = self.status.write().await;
                st.pending_count = remaining_pending;
                st.conflict_count = remaining_conflict;
                st.failed_count = remaining_failed;
                st.is_online = true;
                st.is_auth_paused = false;
                st.last_synced_at = Some(now);
                st.last_error = None;
            }
            Ok(resp) => {
                let status_code = resp.status();
                let status_u16 = status_code.as_u16();
                let err_body = resp.text().await.unwrap_or_else(|_| "Unknown server response".to_string());
                let err_msg = format!("Sync push HTTP {status_u16}: {err_body}");

                match status_u16 {
                    401 => {
                        for item in &pending_items {
                            let _ = sync_queue_repo
                                .update_status_ext(&item.client_event_id, SyncQueueStatus::Pending, Some(&err_msg), None, false)
                                .await;
                        }
                        let mut st = self.status.write().await;
                        st.is_online = true;
                        st.is_auth_paused = true;
                        st.last_error = Some("Authentication required (401 Unauthorized)".to_string());
                    }
                    403 => {
                        for item in &pending_items {
                            let _ = sync_queue_repo
                                .update_status_ext(&item.client_event_id, SyncQueueStatus::FailedPermanent, Some(&err_msg), None, true)
                                .await;
                        }
                        let mut st = self.status.write().await;
                        st.is_online = true;
                        st.last_error = Some(format!("Event authorization rejected (403 Forbidden): {err_body}"));
                    }
                    409 => {
                        for item in &pending_items {
                            let _ = sync_queue_repo
                                .update_status_ext(&item.client_event_id, SyncQueueStatus::Conflict, Some(&err_msg), None, false)
                                .await;
                        }
                        let mut st = self.status.write().await;
                        st.is_online = true;
                        st.last_error = Some(format!("Sync conflict (409): {err_body}"));
                    }
                    422 if err_body.contains("DEPENDENCY_NOT_FOUND") => {
                        for item in &pending_items {
                            let _ = sync_queue_repo
                                .update_status_ext(&item.client_event_id, SyncQueueStatus::Pending, Some(&err_msg), None, false)
                                .await;
                        }
                        let mut st = self.status.write().await;
                        st.is_online = true;
                        st.last_error = Some(format!("Sync retryable dependency error (422): {err_body}"));
                    }
                    400 | 404 | 422 => {
                        for item in &pending_items {
                            let _ = sync_queue_repo
                                .update_status_ext(&item.client_event_id, SyncQueueStatus::FailedPermanent, Some(&err_msg), None, true)
                                .await;
                        }
                        let mut st = self.status.write().await;
                        st.is_online = true;
                        st.last_error = Some(format!("Sync permanent error ({status_u16}): {err_body}"));
                    }
                    _ => {
                        for item in &pending_items {
                            let _ = sync_queue_repo
                                .update_status_ext(&item.client_event_id, SyncQueueStatus::Pending, Some(&err_msg), None, true)
                                .await;
                        }
                        let mut st = self.status.write().await;
                        st.is_online = true;
                        st.last_error = Some(format!("Sync retryable error ({status_u16}): {err_body}"));
                    }
                }

                let remaining_pending = sync_queue_repo.count_pending().await.unwrap_or(0);
                let remaining_conflict = sync_queue_repo.count_conflict().await.unwrap_or(0);
                let remaining_failed = sync_queue_repo.count_failed_permanent().await.unwrap_or(0);

                let mut st = self.status.write().await;
                st.pending_count = remaining_pending;
                st.conflict_count = remaining_conflict;
                st.failed_count = remaining_failed;
            }
            Err(e) => {
                let err_msg = format!("Server unreachable: {e}");
                for item in &pending_items {
                    let _ = sync_queue_repo
                        .update_status_ext(&item.client_event_id, SyncQueueStatus::Pending, Some(&err_msg), None, false)
                        .await;
                }
                let remaining_pending = sync_queue_repo.count_pending().await.unwrap_or(0);
                let remaining_conflict = sync_queue_repo.count_conflict().await.unwrap_or(0);
                let remaining_failed = sync_queue_repo.count_failed_permanent().await.unwrap_or(0);

                let mut st = self.status.write().await;
                st.is_online = false;
                st.pending_count = remaining_pending;
                st.conflict_count = remaining_conflict;
                st.failed_count = remaining_failed;
                st.last_error = Some(err_msg);
            }
        }
    }

    /// Pulls updated central change log deltas and applies them to local SQLite
    pub async fn sync_downstream_pull(&self) {
        let session = self.app_state.get_session().await;
        let token = match &session.active_token {
            Some(t) if session.is_authenticated => t.clone(),
            _ => return, // Wait for user authentication
        };

        let db = match &self.app_state.db {
            Some(db) => db.clone(),
            None => return, // SQLite required for desktop apply
        };

        let cursor_repo = crate::repositories::SQLiteSyncCursorRepository::new(db.clone());
        let org_id = crate::domain::organization::NIAZI_ORGANIZATION_ID;

        let last_seq = match cursor_repo.get_last_applied_sequence("downstream_delta", org_id).await {
            Ok(seq) => seq,
            Err(e) => {
                let mut st = self.status.write().await;
                st.last_error = Some(format!("Failed to get downstream sync cursor: {e}"));
                return;
            }
        };

        let server_url = std::env::var("CENTRAL_SERVER_URL")
            .unwrap_or_else(|_| DEFAULT_CENTRAL_SERVER_URL.to_string());

        let client = match reqwest::Client::builder().timeout(Duration::from_secs(10)).build() {
            Ok(c) => c,
            Err(_) => return,
        };

        let mut current_after_seq = last_seq;

        loop {
            let pull_url = format!(
                "{}/api/v1/sync/pull?after_sequence={}&limit=100",
                server_url.trim_end_matches('/'),
                current_after_seq
            );

            let resp = match client
                .get(&pull_url)
                .header("Authorization", format!("Bearer {token}"))
                .send()
                .await
            {
                Ok(r) if r.status().is_success() => r,
                Ok(r) => {
                    let err_msg = format!("Sync pull HTTP {}", r.status());
                    let mut st = self.status.write().await;
                    st.last_error = Some(err_msg);
                    break;
                }
                Err(e) => {
                    let mut st = self.status.write().await;
                    st.last_error = Some(format!("Sync pull network error: {e}"));
                    break;
                }
            };

            let pull_dto: crate::domain::change_log::DeltaPullResponseDto = match resp.json().await {
                Ok(dto) => dto,
                Err(e) => {
                    let mut st = self.status.write().await;
                    st.last_error = Some(format!("Failed to parse sync pull JSON: {e}"));
                    break;
                }
            };

            if pull_dto.changes.is_empty() {
                break;
            }

            let applier = crate::services::change_applier::ChangeApplier::new(db.clone());
            if let Err(e) = applier.apply_batch(org_id, &pull_dto.changes, pull_dto.next_sequence).await {
                let mut st = self.status.write().await;
                st.last_error = Some(format!("Failed to apply downstream sync batch: {e}"));
                break;
            }

            current_after_seq = pull_dto.next_sequence;
            if !pull_dto.has_more {
                break;
            }
        }

        self.sync_auth_snapshots().await;
    }

    /// Pulls central authentication snapshots and updates local SQLiteAuthSnapshotRepository
    pub async fn sync_auth_snapshots(&self) {
        let session = self.app_state.get_session().await;
        let token = match &session.active_token {
            Some(t) if session.is_authenticated && !t.trim().is_empty() => t.clone(),
            _ => return, // Cleanly skip if no Central JWT present (e.g. snapshot native session or unauthenticated)
        };

        let db = match &self.app_state.db {
            Some(db) => db.clone(),
            None => return, // SQLite required for desktop snapshot persistence
        };

        let server_url = std::env::var("CENTRAL_SERVER_URL")
            .unwrap_or_else(|_| DEFAULT_CENTRAL_SERVER_URL.to_string());

        let client = match reqwest::Client::builder().timeout(Duration::from_secs(10)).build() {
            Ok(c) => c,
            Err(_) => return,
        };

        let snapshot_url = format!("{}/api/v1/users/credential-snapshots", server_url.trim_end_matches('/'));

        let resp = match client
            .get(&snapshot_url)
            .header("Authorization", format!("Bearer {token}"))
            .send()
            .await
        {
            Ok(r) if r.status().is_success() => r,
            Ok(_r) => {
                info!("[SyncWorkerDaemon] Auth snapshot sync HTTP non-success response, preserving local snapshots");
                return;
            }
            Err(e) => {
                info!("[SyncWorkerDaemon] Auth snapshot sync network error: {e}, preserving local snapshots");
                return;
            }
        };

        let snapshots: Vec<crate::domain::auth_snapshot::AuthSnapshot> = match resp.json().await {
            Ok(s) => s,
            Err(e) => {
                info!("[SyncWorkerDaemon] Failed to parse auth snapshots JSON: {e}, preserving local snapshots");
                return;
            }
        };

        let snapshot_repo = crate::repositories::SQLiteAuthSnapshotRepository::new(db);
        let now = chrono::Utc::now().to_rfc3339();

        for mut snapshot in snapshots {
            // Validate required snapshot fields before upsert
            if snapshot.user_id.trim().is_empty()
                || snapshot.username.trim().is_empty()
                || snapshot.organization_id.trim().is_empty()
                || snapshot.credential_hash.trim().is_empty()
            {
                tracing::warn!("[SyncWorkerDaemon] Skipping invalid snapshot for user_id '{}'", snapshot.user_id);
                continue;
            }

            // Ensure valid access_profile_json (must parse cleanly)
            if serde_json::from_str::<crate::domain::access_control::StaffAccessProfile>(&snapshot.access_profile_json).is_err() {
                tracing::warn!("[SyncWorkerDaemon] Skipping snapshot with malformed access_profile_json for user '{}'", snapshot.username);
                continue;
            }

            snapshot.synced_at = now.clone();

            if let Err(e) = snapshot_repo.upsert(&snapshot).await {
                tracing::warn!("[SyncWorkerDaemon] Failed to upsert snapshot for user '{}': {e}", snapshot.username);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::access_control::StaffAccessProfile;
    use crate::domain::auth_snapshot::AuthSnapshot;
    use crate::domain::user::{UserRole, UserStatus};

    #[tokio::test]
    async fn test_sync_worker_skip_when_active_token_is_none() {
        let state = Arc::new(AppState::in_memory("1.2.15"));
        let daemon = SyncWorkerDaemon::new(state.clone());

        // Snapshot-authenticated session has active_token = None
        let snapshot = AuthSnapshot {
            user_id: "u1".to_string(),
            username: "snap_user".to_string(),
            organization_id: "org1".to_string(),
            branch_id: None,
            role: UserRole::Cashier,
            credential_hash: "hash".to_string(),
            access_profile_json: serde_json::to_string(&StaffAccessProfile::cashier_default()).unwrap(),
            credential_version: 1,
            status: UserStatus::Active,
            synced_at: "2026-01-01T00:00:00Z".to_string(),
            created_at: "2026-01-01T00:00:00Z".to_string(),
            updated_at: "2026-01-01T00:00:00Z".to_string(),
        };

        state.set_authenticated_from_snapshot(&snapshot, StaffAccessProfile::cashier_default()).await;
        assert!(state.get_session().await.active_token.is_none());

        // Calling sync_auth_snapshots must return cleanly without errors or fake token creation
        daemon.sync_auth_snapshots().await;

        let session = state.get_session().await;
        assert!(session.is_authenticated);
        assert!(session.active_token.is_none());
    }

    #[tokio::test]
    async fn test_sync_worker_skip_when_unauthenticated() {
        let state = Arc::new(AppState::in_memory("1.2.15"));
        let daemon = SyncWorkerDaemon::new(state.clone());

        daemon.sync_auth_snapshots().await;
        assert!(!state.get_session().await.is_authenticated);
    }

    #[tokio::test]
    async fn test_sync_worker_disabled_status_propagation() {
        let state = Arc::new(AppState::in_memory("1.2.15"));
        let db = state.db.as_ref().unwrap();
        let repo = crate::repositories::SQLiteAuthSnapshotRepository::new(db.clone());

        // 1. Initial active snapshot
        let active_snap = AuthSnapshot {
            user_id: "u-disabled-test".to_string(),
            username: "user_dis".to_string(),
            organization_id: "org1".to_string(),
            branch_id: None,
            role: UserRole::Staff,
            credential_hash: "hash".to_string(),
            access_profile_json: serde_json::to_string(&StaffAccessProfile::staff_default()).unwrap(),
            credential_version: 1,
            status: UserStatus::Active,
            synced_at: "2026-01-01T00:00:00Z".to_string(),
            created_at: "2026-01-01T00:00:00Z".to_string(),
            updated_at: "2026-01-01T00:00:00Z".to_string(),
        };

        repo.upsert(&active_snap).await.unwrap();
        assert_eq!(repo.find_by_user_id("u-disabled-test").await.unwrap().unwrap().status, UserStatus::Active);

        // 2. Central returns updated snapshot with status = DISABLED
        let mut disabled_snap = active_snap.clone();
        disabled_snap.status = UserStatus::Disabled;
        disabled_snap.credential_version = 2;

        repo.upsert(&disabled_snap).await.unwrap();
        let updated = repo.find_by_user_id("u-disabled-test").await.unwrap().unwrap();
        assert_eq!(updated.status, UserStatus::Disabled);
        assert_eq!(updated.credential_version, 2);
    }
}
