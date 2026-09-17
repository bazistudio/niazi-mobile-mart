use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;
use tracing::{info, warn, error};

use crate::domain::sync_queue::SyncQueueStatus;
use crate::state::AppState;

/// Status DTO representing live sync engine state for UI and monitoring
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SyncEngineStatus {
    pub pending_count: i64,
    pub is_online: bool,
    pub last_synced_at: Option<String>,
    pub last_error: Option<String>,
}

/// Background synchronization daemon responsible for outbox pushes and 15-minute reconciliation pulls
#[derive(Clone)]
pub struct SyncWorkerDaemon {
    app_state: Arc<AppState>,
    status: Arc<RwLock<SyncEngineStatus>>,
}

impl SyncWorkerDaemon {
    pub fn new(app_state: Arc<AppState>) -> Self {
        Self {
            app_state,
            status: Arc::new(RwLock::new(SyncEngineStatus {
                pending_count: 0,
                is_online: true,
                last_synced_at: None,
                last_error: None,
            })),
        }
    }

    pub fn get_status_lock(&self) -> Arc<RwLock<SyncEngineStatus>> {
        self.status.clone()
    }

    pub async fn get_status(&self) -> SyncEngineStatus {
        let guard = self.status.read().await;
        guard.clone()
    }

    /// Spawns the background daemon Tokio loop
    pub fn start(&self) {
        let daemon = self.clone();
        tokio::spawn(async move {
            info!("Starting background SyncWorkerDaemon loop...");
            let mut pull_timer = tokio::time::interval(Duration::from_secs(900)); // 15-minute reconciliation pull interval

            loop {
                tokio::select! {
                    _ = tokio::time::sleep(Duration::from_secs(5)) => {
                        daemon.sync_outbox_push().await;
                    }
                    _ = pull_timer.tick() => {
                        daemon.sync_downstream_pull().await;
                    }
                }
            }
        });
    }

    /// Pushes pending outbox items to central Cloud Run API endpoint
    pub async fn sync_outbox_push(&self) {
        let sync_queue_repo = match &self.app_state.sync_queue_repo {
            Some(r) => r,
            None => return,
        };

        let pending_count = match sync_queue_repo.count_pending().await {
            Ok(c) => c,
            Err(_) => 0,
        };

        {
            let mut st = self.status.write().await;
            st.pending_count = pending_count;
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
            .unwrap_or_else(|_| "http://localhost:8080".to_string());

        let client = match reqwest::Client::builder().timeout(Duration::from_secs(10)).build() {
            Ok(c) => c,
            Err(_) => return,
        };

        let push_url = format!("{}/api/v1/sync/push", server_url.trim_end_matches('/'));
        let payload = serde_json::json!({
            "events": pending_items
        });

        match client.post(&push_url).json(&payload).send().await {
            Ok(resp) if resp.status().is_success() => {
                if let Ok(ack_json) = resp.json::<serde_json::Value>().await {
                    if let Some(results) = ack_json.get("results").and_then(|r| r.as_array()) {
                        for res in results {
                            if let (Some(client_evt), Some(server_evt)) = (
                                res.get("client_event_id").and_then(|s| s.as_str()),
                                res.get("server_event_id").and_then(|s| s.as_str()),
                            ) {
                                let _ = sync_queue_repo
                                    .update_status(client_evt, SyncQueueStatus::Synced, None, Some(server_evt))
                                    .await;
                            }
                        }
                    }
                }
                let now = chrono::Utc::now().to_rfc3339();
                let remaining = sync_queue_repo.count_pending().await.unwrap_or(0);
                let mut st = self.status.write().await;
                st.pending_count = remaining;
                st.is_online = true;
                st.last_synced_at = Some(now);
                st.last_error = None;
            }
            Ok(resp) => {
                let err_msg = format!("Sync push HTTP {}", resp.status());
                let mut st = self.status.write().await;
                st.is_online = false;
                st.last_error = Some(err_msg);
            }
            Err(e) => {
                let mut st = self.status.write().await;
                st.is_online = false;
                st.last_error = Some(format!("Server unreachable: {e}"));
            }
        }
    }

    /// Pulls updated central records every 15 minutes for downstream read cache update
    pub async fn sync_downstream_pull(&self) {
        let server_url = std::env::var("CENTRAL_SERVER_URL")
            .unwrap_or_else(|_| "http://localhost:8080".to_string());

        let client = match reqwest::Client::builder().timeout(Duration::from_secs(10)).build() {
            Ok(c) => c,
            Err(_) => return,
        };

        let pull_url = format!("{}/api/v1/sync/pull", server_url.trim_end_matches('/'));
        let res = client.get(&pull_url).send().await;
        if let Ok(resp) = res {
            if resp.status().is_success() {
                info!("15-minute downstream pull completed successfully");
            }
        }
    }
}
