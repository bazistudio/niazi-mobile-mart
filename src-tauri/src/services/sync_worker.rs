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

/// Receives downstream-sync domain events produced by `SyncWorkerDaemon`.
///
/// Production implementation: the real Tauri `AppHandle`, routed through
/// `crate::events::broadcaster::emit_domain_event`.
/// Test implementation: a recorder that captures the exact event name and payload
/// produced by the downstream-pull path (it does NOT prove native WebView delivery).
pub trait SyncEventSink: Send + Sync {
    fn emit_sync_event(&self, event_name: &str, payload: &serde_json::Value) -> Result<(), String>;
}

impl SyncEventSink for tauri::AppHandle {
    fn emit_sync_event(&self, event_name: &str, payload: &serde_json::Value) -> Result<(), String> {
        crate::events::broadcaster::emit_domain_event(self, event_name, payload).map_err(|e| e.to_string())
    }
}

/// Upstream endpoint selection for central-server HTTP calls made by the worker.
#[derive(Debug, Clone)]
enum UpstreamEndpoint {
    /// Production behaviour (unchanged): `CENTRAL_SERVER_URL`, else `DEFAULT_CENTRAL_SERVER_URL`.
    Production,
    /// Test lockdown: only a validated IPv4-loopback URL may be used.
    /// `None` means fail closed: every request is refused before an HTTP client is built.
    TestLoopback(Option<String>),
}

/// Result of one `sync_downstream_pull()` call. Existing callers may ignore it.
#[derive(Debug, Clone, PartialEq)]
pub enum DownstreamPullOutcome {
    /// Preconditions not met (no authenticated session or no SQLite). No request sent.
    Skipped,
    /// The current pull failed (cursor, endpoint, client, HTTP, parse or batch error).
    /// No completion event is emitted.
    Failed(String),
    /// The pull succeeded but upstream returned no changes. No completion event is emitted.
    NoChanges,
    /// One or more batches were applied and their cursors committed.
    /// `event_delivered` is false when no sink is registered or the sink reported an error.
    Applied { last_sequence: i64, event_delivered: bool },
}

/// Strictly validates a test upstream URL. Accepts only `http://127.0.0.1:<expected_port>`
/// with no credentials, query, fragment or non-root path. Parsed-URL checks, not string prefixes.
pub fn validate_test_upstream(url: &str, expected_port: u16) -> Result<reqwest::Url, String> {
    let parsed = reqwest::Url::parse(url).map_err(|e| format!("Test upstream URL is not parseable: {e}"))?;
    if parsed.scheme() != "http" {
        return Err(format!("Test upstream scheme must be 'http', got '{}'", parsed.scheme()));
    }
    if parsed.host_str() != Some("127.0.0.1") {
        return Err(format!("Test upstream host must be exactly 127.0.0.1, got {:?}", parsed.host_str()));
    }
    if parsed.port() != Some(expected_port) {
        return Err(format!("Test upstream port must be {expected_port}, got {:?}", parsed.port()));
    }
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err("Test upstream URL must not contain credentials".to_string());
    }
    if parsed.query().is_some() || parsed.fragment().is_some() || (parsed.path() != "/" && !parsed.path().is_empty()) {
        return Err("Test upstream URL must not contain a path, query or fragment".to_string());
    }
    Ok(parsed)
}

/// Background synchronization daemon responsible for outbox pushes and 15-minute reconciliation pulls
#[derive(Clone)]
pub struct SyncWorkerDaemon {
    app_state: Arc<AppState>,
    status: Arc<RwLock<SyncEngineStatus>>,
    execution_lock: Arc<tokio::sync::Mutex<()>>,
    event_sink: Arc<RwLock<Option<Arc<dyn SyncEventSink>>>>,
    upstream: Arc<RwLock<UpstreamEndpoint>>,
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
            event_sink: Arc::new(RwLock::new(None)),
            upstream: Arc::new(RwLock::new(UpstreamEndpoint::Production)),
        }
    }

    pub async fn set_app_handle(&self, handle: tauri::AppHandle) {
        let mut w = self.event_sink.write().await;
        *w = Some(Arc::new(handle));
    }

    /// TEST-ONLY: installs a recorder sink in place of the Tauri `AppHandle`.
    #[doc(hidden)]
    pub async fn set_event_sink_for_test(&self, sink: Arc<dyn SyncEventSink>) {
        let mut w = self.event_sink.write().await;
        *w = Some(sink);
    }

    /// TEST-ONLY: enters fail-closed lockdown. Until a validated loopback endpoint is set,
    /// every central-server request is refused. There is no path back to production mode.
    #[doc(hidden)]
    pub async fn lock_upstream_for_test(&self) {
        let mut w = self.upstream.write().await;
        *w = UpstreamEndpoint::TestLoopback(None);
    }

    /// TEST-ONLY: enters lockdown, then installs `url` only if it validates as
    /// `http://127.0.0.1:<expected_port>`. On rejection the worker stays locked (fail closed).
    #[doc(hidden)]
    pub async fn set_test_upstream(&self, url: &str, expected_port: u16) -> Result<(), String> {
        let mut w = self.upstream.write().await;
        *w = UpstreamEndpoint::TestLoopback(None);
        let parsed = validate_test_upstream(url, expected_port)?;
        *w = UpstreamEndpoint::TestLoopback(Some(parsed.as_str().trim_end_matches('/').to_string()));
        Ok(())
    }

    /// Resolves the central-server base URL. Production behaviour is unchanged.
    async fn resolve_server_url(&self) -> Result<String, String> {
        match &*self.upstream.read().await {
            UpstreamEndpoint::Production => Ok(std::env::var("CENTRAL_SERVER_URL")
                .unwrap_or_else(|_| DEFAULT_CENTRAL_SERVER_URL.to_string())),
            UpstreamEndpoint::TestLoopback(Some(url)) => Ok(url.clone()),
            UpstreamEndpoint::TestLoopback(None) => Err(
                "Test upstream lockdown: no validated loopback endpoint configured; request refused".to_string(),
            ),
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
            // M7: Clear stale error/timestamp at the START of each manual sync so that
            // a previous failure does not remain visible during or after a new operation.
            // The UI uses last_error to decide whether to show a success or error toast
            // on completion; without this reset, a successful new sync would still
            // display the previous error and last_synced_at would not be updated.
            st.is_syncing = true;
            st.last_error = None;
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
        // M7: last_error is now either None (cleared above, not re-set → success)
        // or Some(...) set by a sub-operation during this sync cycle.
        // Update last_synced_at only when the cycle completed without error.
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

        let server_url = match self.resolve_server_url().await {
            Ok(u) => u,
            Err(msg) => {
                let mut st = self.status.write().await;
                st.last_error = Some(msg);
                return;
            }
        };

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
                                    // SYNC-H6: increment attempt_count so the bounded retry
                                    // policy (MAX_RETRIES) applies; prevents infinite loop.
                                    let _ = sync_queue_repo
                                        .update_status_ext(client_evt, SyncQueueStatus::Pending, err_msg, None, true)
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
                        // M4: A bare HTTP 409 from the transport layer (proxy / load-balancer)
                        // carries no per-event identity. Marking every item in the batch as
                        // Conflict is incorrect — unrelated valid events would be permanently
                        // stuck and never retried. Route through the existing bounded-retry
                        // path (H6/H7) instead: increment attempt_count and keep Pending.
                        // update_status_ext auto-promotes to FailedPermanent once MAX_RETRIES
                        // is reached, so the retry budget is still enforced.
                        // Note: per-event CONFLICT results from a normal HTTP 200 response are
                        // handled separately above and continue to use SyncQueueStatus::Conflict.
                        for item in &pending_items {
                            let _ = sync_queue_repo
                                .update_status_ext(&item.client_event_id, SyncQueueStatus::Pending, Some(&err_msg), None, true)
                                .await;
                        }
                        let mut st = self.status.write().await;
                        st.is_online = true;
                        st.last_error = Some(format!("Sync push rejected (409): retrying via bounded retry — {err_body}"));
                    }
                    422 if err_body.contains("DEPENDENCY_NOT_FOUND") => {
                        for item in &pending_items {
                            // SYNC-H6: increment attempt_count so the bounded retry
                            // policy (MAX_RETRIES) applies; prevents infinite loop.
                            let _ = sync_queue_repo
                                .update_status_ext(&item.client_event_id, SyncQueueStatus::Pending, Some(&err_msg), None, true)
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
                    // SYNC-H7: increment attempt_count so the bounded retry
                    // policy (MAX_RETRIES) applies; prevents infinite loop on
                    // persistent transport/network failures.
                    let _ = sync_queue_repo
                        .update_status_ext(&item.client_event_id, SyncQueueStatus::Pending, Some(&err_msg), None, true)
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

    /// Pulls updated central change log deltas and applies them to local SQLite.
    ///
    /// Returns the outcome of THIS pull. Existing callers (900 s timer, manual sync) ignore it.
    pub async fn sync_downstream_pull(&self) -> DownstreamPullOutcome {
        let session = self.app_state.get_session().await;
        let token = match &session.active_token {
            Some(t) if session.is_authenticated => t.clone(),
            _ => return DownstreamPullOutcome::Skipped, // Wait for user authentication
        };

        let db = match &self.app_state.db {
            Some(db) => db.clone(),
            None => return DownstreamPullOutcome::Skipped, // SQLite required for desktop apply
        };

        let cursor_repo = crate::repositories::SQLiteSyncCursorRepository::new(db.clone());
        let org_id = crate::domain::organization::NIAZI_ORGANIZATION_ID;

        let last_seq = match cursor_repo.get_last_applied_sequence("downstream_delta", org_id).await {
            Ok(seq) => seq,
            Err(e) => {
                let msg = format!("Failed to get downstream sync cursor: {e}");
                let mut st = self.status.write().await;
                st.last_error = Some(msg.clone());
                return DownstreamPullOutcome::Failed(msg);
            }
        };

        let server_url = match self.resolve_server_url().await {
            Ok(u) => u,
            Err(msg) => {
                let mut st = self.status.write().await;
                st.last_error = Some(msg.clone());
                return DownstreamPullOutcome::Failed(msg);
            }
        };

        let client = match reqwest::Client::builder().timeout(Duration::from_secs(10)).build() {
            Ok(c) => c,
            Err(e) => return DownstreamPullOutcome::Failed(format!("Failed to build HTTP client: {e}")),
        };

        let mut current_after_seq = last_seq;
        let mut changes_applied = false;
        // Outcome of THIS pull only. Set on any HTTP, network, parse or batch error.
        let mut pull_error: Option<String> = None;

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
                    st.last_error = Some(err_msg.clone());
                    pull_error = Some(err_msg);
                    break;
                }
                Err(e) => {
                    let err_msg = format!("Sync pull network error: {e}");
                    let mut st = self.status.write().await;
                    st.last_error = Some(err_msg.clone());
                    pull_error = Some(err_msg);
                    break;
                }
            };

            let pull_dto: crate::domain::change_log::DeltaPullResponseDto = match resp.json().await {
                Ok(dto) => dto,
                Err(e) => {
                    let err_msg = format!("Failed to parse sync pull JSON: {e}");
                    let mut st = self.status.write().await;
                    st.last_error = Some(err_msg.clone());
                    pull_error = Some(err_msg);
                    break;
                }
            };

            if pull_dto.changes.is_empty() {
                break;
            }

            let applier = crate::services::change_applier::ChangeApplier::new(db.clone());
            if let Err(e) = applier.apply_batch(org_id, &pull_dto.changes, pull_dto.next_sequence).await {
                let err_msg = format!("Failed to apply downstream sync batch: {e}");
                let mut st = self.status.write().await;
                st.last_error = Some(err_msg.clone());
                pull_error = Some(err_msg);
                break;
            }

            changes_applied = true;
            current_after_seq = pull_dto.next_sequence;
            if !pull_dto.has_more {
                break;
            }
        }

        // Completion-event decision (Phase 2-F):
        // - Based ONLY on this pull's outcome (`pull_error`, `changes_applied`), not on the shared
        //   `status.last_error`, which may hold a stale diagnostic from an earlier unrelated
        //   push/pull. That stale diagnostic is intentionally left untouched here.
        // - Any error in this pull (including a failure on a later page after earlier pages were
        //   committed) suppresses the success event.
        // - Skipped individual changes: `ChangeApplier::apply_batch` isolates per-change failures
        //   (logs, skips, advances the cursor past them) and returns Ok. Such a batch is treated as
        //   applied and the event IS emitted, because the cursor genuinely advanced.
        let outcome = if let Some(err) = pull_error {
            DownstreamPullOutcome::Failed(err)
        } else if changes_applied {
            let payload = serde_json::json!({
                "applied": true,
                "last_sequence": current_after_seq,
            });
            let sink = self.event_sink.read().await.clone();
            let event_delivered = match sink {
                Some(sink) => match sink.emit_sync_event(
                    crate::events::broadcaster::event_names::SYNC_PULL_COMPLETED,
                    &payload,
                ) {
                    Ok(()) => true,
                    Err(e) => {
                        tracing::warn!("[SyncWorkerDaemon] sync_pull_completed emission failed: {e}");
                        false
                    }
                },
                None => {
                    tracing::warn!("[SyncWorkerDaemon] No event sink registered; sync_pull_completed not delivered");
                    false
                }
            };
            DownstreamPullOutcome::Applied { last_sequence: current_after_seq, event_delivered }
        } else {
            DownstreamPullOutcome::NoChanges
        };

        self.sync_auth_snapshots().await;
        outcome
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

        let server_url = match self.resolve_server_url().await {
            Ok(u) => u,
            Err(msg) => {
                info!("[SyncWorkerDaemon] Auth snapshot sync skipped: {msg}");
                return;
            }
        };

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

    // ─── M7: Manual Sync Now stale-status regression tests ───────────────────

    /// M7-T01: A new manual sync clears stale last_error before the pipeline begins.
    /// After a previous failure, a successful new manual sync must not leave the
    /// previous error visible; last_synced_at must be updated on clean completion.
    #[tokio::test]
    async fn m7_t01_manual_sync_clears_stale_error_before_pipeline() {
        let state = Arc::new(AppState::in_memory("1.2.15"));
        let daemon = SyncWorkerDaemon::new(state.clone());

        // Inject a stale error as if a previous sync had failed
        {
            let mut st = daemon.status.write().await;
            st.last_error = Some("stale error from previous sync cycle".to_string());
            st.last_synced_at = Some("2026-01-01T00:00:00Z".to_string());
        }

        // Verify precondition: stale error is present
        {
            let st = daemon.status.read().await;
            assert!(st.last_error.is_some(), "Precondition: last_error should be set before sync");
        }

        // Run manual sync (no active token → skips push and pull pipelines cleanly)
        daemon.run_manual_sync().await;

        // Post-condition: last_error must be None (cleared at start, not re-set because
        // pipelines returned early due to missing token, not due to an error)
        let st = daemon.status.read().await;
        assert!(st.last_error.is_none(),
            "M7-T01 FAIL: last_error should be None after successful manual sync, got: {:?}", st.last_error);
        assert!(st.last_synced_at.is_some(),
            "M7-T01 FAIL: last_synced_at should be updated after successful manual sync");
        assert!(!st.is_syncing,
            "M7-T01 FAIL: is_syncing must be false after completion");
    }

    /// M7-T02: is_syncing is set to true during the sync and false after completion.
    /// The UI must not report stale completion state while the operation is in progress.
    #[tokio::test]
    async fn m7_t02_is_syncing_false_after_manual_sync_completes() {
        let state = Arc::new(AppState::in_memory("1.2.15"));
        let daemon = SyncWorkerDaemon::new(state.clone());

        daemon.run_manual_sync().await;

        let st = daemon.status.read().await;
        assert!(!st.is_syncing,
            "M7-T02 FAIL: is_syncing must be false after run_manual_sync returns");
    }

    /// M7-T03: last_synced_at is updated when the sync completes without error.
    /// The UI must not show a stale previous timestamp after a clean manual sync.
    #[tokio::test]
    async fn m7_t03_last_synced_at_updated_on_clean_completion() {
        let state = Arc::new(AppState::in_memory("1.2.15"));
        let daemon = SyncWorkerDaemon::new(state.clone());

        // Set a known prior timestamp
        {
            let mut st = daemon.status.write().await;
            st.last_synced_at = Some("2020-01-01T00:00:00Z".to_string());
            st.last_error = None;
        }

        daemon.run_manual_sync().await;

        let st = daemon.status.read().await;
        let ts = st.last_synced_at.as_deref().unwrap_or("");
        assert!(!ts.starts_with("2020"),
            "M7-T03 FAIL: last_synced_at was not updated; still shows stale value: {ts}");
        assert!(st.last_error.is_none(),
            "M7-T03 FAIL: no error should be present after clean completion");
    }

    /// M7-T04: When a second manual sync fires while a first is still executing,
    /// the execution_lock ensures they run sequentially, not concurrently.
    /// The second call blocks until the first completes, preserving status integrity.
    #[tokio::test]
    async fn m7_t04_concurrent_manual_sync_serialised_by_execution_lock() {
        let state = Arc::new(AppState::in_memory("1.2.15"));
        let daemon = Arc::new(SyncWorkerDaemon::new(state.clone()));

        let d1 = daemon.clone();
        let d2 = daemon.clone();

        // Fire two concurrent manual syncs
        let h1 = tokio::spawn(async move { d1.run_manual_sync().await });
        let h2 = tokio::spawn(async move { d2.run_manual_sync().await });

        h1.await.unwrap();
        h2.await.unwrap();

        // Both must have completed; final state must be coherent
        let st = daemon.status.read().await;
        assert!(!st.is_syncing,
            "M7-T04 FAIL: is_syncing must be false after both concurrent calls complete");
    }

    /// M7-T05: After a stale error is present, running manual sync followed by
    /// another manual sync with no new errors leaves last_error = None.
    /// Ensures the stale-error reset applies consistently across multiple invocations.
    #[tokio::test]
    async fn m7_t05_repeated_manual_sync_does_not_accumulate_stale_errors() {
        let state = Arc::new(AppState::in_memory("1.2.15"));
        let daemon = SyncWorkerDaemon::new(state.clone());

        // Inject stale error
        {
            let mut st = daemon.status.write().await;
            st.last_error = Some("old error".to_string());
        }

        daemon.run_manual_sync().await;

        {
            let st = daemon.status.read().await;
            assert!(st.last_error.is_none(),
                "M7-T05 FAIL: first clean sync should have cleared last_error");
        }

        // Second sync must also leave last_error = None
        daemon.run_manual_sync().await;

        let st = daemon.status.read().await;
        assert!(st.last_error.is_none(),
            "M7-T05 FAIL: second clean sync should keep last_error = None");
    }
}
