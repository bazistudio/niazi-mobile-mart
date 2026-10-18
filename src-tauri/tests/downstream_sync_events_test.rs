//! downstream_sync_events_test.rs — Phase 2-F Native Downstream Sync Event Tests
//!
//! Exercising downstream sync against:
//!   - A local loopback HTTP server (127.0.0.1:port)
//!   - In-memory SQLite (AppState::in_memory)
//!   - Synthetic JWT authentication
//!   - SyncEventSink recording
//!
//! SAFETY:
//!   - Rejects any non-loopback host or non-matching port (validate_test_upstream).
//!   - Fails closed if upstream mock server is not bound.
//!   - Uses in-memory SQLite: zero disk files created or modified.
//!   - Zero connections to production central Cloud Run or production databases.

use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use tokio::sync::Mutex;

use niazi_mobile_mart_lib::domain::catalog::Category;
use niazi_mobile_mart_lib::domain::change_log::{ChangeLogEntry, DeltaPullResponseDto};
use niazi_mobile_mart_lib::domain::organization::NIAZI_ORGANIZATION_ID;
use niazi_mobile_mart_lib::domain::user::UserRole;
use niazi_mobile_mart_lib::repositories::SQLiteSyncCursorRepository;
use niazi_mobile_mart_lib::services::sync_worker::{
    validate_test_upstream, DownstreamPullOutcome, SyncEventSink, SyncWorkerDaemon,
};
use niazi_mobile_mart_lib::state::{AppState, SessionContext};

/// In-memory sink recorder that captures domain events produced by SyncWorkerDaemon.
#[derive(Default)]
struct RecordingSink {
    events: Arc<std::sync::Mutex<Vec<(String, serde_json::Value)>>>,
}

impl SyncEventSink for RecordingSink {
    fn emit_sync_event(&self, event_name: &str, payload: &serde_json::Value) -> Result<(), String> {
        let mut list = self.events.lock().map_err(|e| e.to_string())?;
        list.push((event_name.to_string(), payload.clone()));
        Ok(())
    }
}

/// Helper to set up an in-memory authenticated AppState with synthetic session.
async fn setup_test_app_state() -> Arc<AppState> {
    let state = Arc::new(AppState::in_memory("1.3.41"));
    {
        let mut session = state.session.write().await;
        *session = SessionContext {
            is_authenticated: true,
            is_locked: false,
            user_id: Some("test-user-0001".to_string()),
            username: Some("testadmin".to_string()),
            role: Some(UserRole::Admin),
            login_time_ms: Some(1000),
            access_profile: None,
            active_token: Some("synthetic-test-jwt-token-xyz".to_string()),
        };
    }
    state
}

/// Helper that binds a single-purpose loopback HTTP server with an ephemeral port.
/// Returns (base_url, port, request_counter, shutdown_tx).
async fn spawn_mock_server<F>(
    handler: F,
) -> (
    String,
    u16,
    Arc<AtomicUsize>,
    tokio::sync::oneshot::Sender<()>,
)
where
    F: Fn(String, String) -> (u16, String, String) + Send + Sync + 'static,
{
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("Failed to bind ephemeral loopback listener");
    let port = listener.local_addr().unwrap().port();
    let base_url = format!("http://127.0.0.1:{port}");
    let handler = Arc::new(handler);
    let request_count = Arc::new(AtomicUsize::new(0));
    let (shutdown_tx, mut shutdown_rx) = tokio::sync::oneshot::channel::<()>();

    let req_counter = request_count.clone();
    tokio::spawn(async move {
        loop {
            tokio::select! {
                _ = &mut shutdown_rx => break,
                accepted = listener.accept() => {
                    let (mut stream, _) = match accepted {
                        Ok(conn) => conn,
                        Err(_) => break,
                    };
                    req_counter.fetch_add(1, Ordering::SeqCst);
                    let h = handler.clone();
                    tokio::spawn(async move {
                        use tokio::io::{AsyncReadExt, AsyncWriteExt};
                        let mut buf = vec![0u8; 4096];
                        let n = stream.read(&mut buf).await.unwrap_or(0);
                        let req_str = String::from_utf8_lossy(&buf[..n]).to_string();

                        let first_line = req_str.lines().next().unwrap_or("GET / HTTP/1.1");
                        let parts: Vec<&str> = first_line.split_whitespace().collect();
                        let method = parts.get(0).copied().unwrap_or("GET").to_string();
                        let path = parts.get(1).copied().unwrap_or("/").to_string();

                        let (status, content_type, body) = h(method, path);

                        let resp = format!(
                            "HTTP/1.1 {status} OK\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                            body.len()
                        );
                        let _ = stream.write_all(resp.as_bytes()).await;
                        let _ = stream.flush().await;
                    });
                }
            }
        }
    });

    (base_url, port, request_count, shutdown_tx)
}

#[tokio::test]
async fn test_url_guard_strict_validation() {
    // 1. Rejects production Cloud Run URL
    assert!(validate_test_upstream("https://niazi-server-860232188829.asia-south1.run.app", 8080).is_err());
    // 2. Rejects non-loopback host
    assert!(validate_test_upstream("http://192.168.1.100:8080", 8080).is_err());
    // 3. Rejects port mismatch
    assert!(validate_test_upstream("http://127.0.0.1:9999", 8080).is_err());
    // 4. Rejects HTTPS
    assert!(validate_test_upstream("https://127.0.0.1:8080", 8080).is_err());
    // 5. Rejects URL with non-root path or query
    assert!(validate_test_upstream("http://127.0.0.1:8080/api", 8080).is_err());
    assert!(validate_test_upstream("http://127.0.0.1:8080/?q=1", 8080).is_err());
    // 6. Accepts exact valid loopback URL
    assert!(validate_test_upstream("http://127.0.0.1:8080", 8080).is_ok());
    assert!(validate_test_upstream("http://127.0.0.1:8080/", 8080).is_ok());
}

#[tokio::test]
async fn test_scenario_a_successful_non_empty_pull() {
    let category = Category {
        id: "550e8400-e29b-41d4-a716-446655440020".to_string(),
        name: "Test Smart Watches".to_string(),
        code: "WATCH-TEST".to_string(),
        description: Some("Integration test category".to_string()),
        is_active: true,
        created_at: "2026-10-18T00:00:00Z".to_string(),
        updated_at: "2026-10-18T00:00:00Z".to_string(),
    };
    let payload = serde_json::to_string(&category).unwrap();

    let entry = ChangeLogEntry {
        sequence: 42,
        organization_id: NIAZI_ORGANIZATION_ID.to_string(),
        branch_id: "00000000-0000-0000-0000-000000000001".to_string(),
        client_event_id: Some("client-evt-001".to_string()),
        event_type: "CATEGORY_CREATED".to_string(),
        entity_type: "category".to_string(),
        entity_id: category.id.clone(),
        payload,
        created_at: "2026-10-18T00:00:00Z".to_string(),
    };

    let dto = DeltaPullResponseDto {
        changes: vec![entry],
        next_sequence: 42,
        has_more: false,
    };
    let json_body = serde_json::to_string(&dto).unwrap();

    let (base_url, port, _, _shutdown) = spawn_mock_server(move |_m, path| {
        if path.starts_with("/api/v1/sync/pull") {
            (200, "application/json".to_string(), json_body.clone())
        } else if path.starts_with("/api/v1/users/credential-snapshots") {
            (200, "application/json".to_string(), "[]".to_string())
        } else {
            (404, "text/plain".to_string(), "Not Found".to_string())
        }
    })
    .await;

    let app_state = setup_test_app_state().await;
    let daemon = SyncWorkerDaemon::new(app_state.clone());
    daemon.set_test_upstream(&base_url, port).await.unwrap();

    let sink = Arc::new(RecordingSink::default());
    daemon.set_event_sink_for_test(sink.clone()).await;

    // Run pull
    let outcome = daemon.sync_downstream_pull().await;
    assert_eq!(
        outcome,
        DownstreamPullOutcome::Applied {
            last_sequence: 42,
            event_delivered: true
        }
    );

    // 1. Verify cursor advanced in SQLite
    let db = app_state.db.clone().unwrap();
    let cursor_repo = SQLiteSyncCursorRepository::new(db.clone());
    let seq = cursor_repo
        .get_last_applied_sequence("downstream_delta", NIAZI_ORGANIZATION_ID)
        .await
        .unwrap();
    assert_eq!(seq, 42, "Committed SQLite cursor must equal 42");

    // 2. Verify synthetic Category was persisted in SQLite
    let exists: bool = {
        let conn = db.inner();
        let guard = conn.lock().await;
        guard
            .query_row(
                "SELECT 1 FROM categories WHERE id = ?1",
                rusqlite::params![category.id],
                |_| Ok(true),
            )
            .unwrap_or(false)
    };
    assert!(exists, "Synthetic Category must be applied in SQLite");

    // 3. Verify exactly one completion event with expected payload
    let recorded = sink.events.lock().unwrap().clone();
    assert_eq!(recorded.len(), 1, "Exactly one event must be emitted");
    assert_eq!(recorded[0].0, "domain:sync_pull_completed");
    assert_eq!(
        recorded[0].1,
        serde_json::json!({
            "applied": true,
            "last_sequence": 42
        })
    );
}

#[tokio::test]
async fn test_scenario_b_empty_pull() {
    let dto = DeltaPullResponseDto {
        changes: vec![],
        next_sequence: 0,
        has_more: false,
    };
    let json_body = serde_json::to_string(&dto).unwrap();

    let (base_url, port, _, _shutdown) = spawn_mock_server(move |_m, path| {
        if path.starts_with("/api/v1/sync/pull") {
            (200, "application/json".to_string(), json_body.clone())
        } else {
            (200, "application/json".to_string(), "[]".to_string())
        }
    })
    .await;

    let app_state = setup_test_app_state().await;
    let daemon = SyncWorkerDaemon::new(app_state.clone());
    daemon.set_test_upstream(&base_url, port).await.unwrap();

    let sink = Arc::new(RecordingSink::default());
    daemon.set_event_sink_for_test(sink.clone()).await;

    let outcome = daemon.sync_downstream_pull().await;
    assert_eq!(outcome, DownstreamPullOutcome::NoChanges);

    // Verify ZERO events emitted
    let recorded = sink.events.lock().unwrap().clone();
    assert_eq!(recorded.len(), 0, "No event should be emitted on empty pull");
}

#[tokio::test]
async fn test_scenario_c_http_500_error() {
    let (base_url, port, _, _shutdown) = spawn_mock_server(|_m, _p| {
        (500, "text/plain".to_string(), "Internal Server Error".to_string())
    })
    .await;

    let app_state = setup_test_app_state().await;
    let daemon = SyncWorkerDaemon::new(app_state.clone());
    daemon.set_test_upstream(&base_url, port).await.unwrap();

    let sink = Arc::new(RecordingSink::default());
    daemon.set_event_sink_for_test(sink.clone()).await;

    let outcome = daemon.sync_downstream_pull().await;
    match outcome {
        DownstreamPullOutcome::Failed(err) => {
            assert!(err.contains("500"), "Error must mention HTTP 500");
        }
        other => panic!("Expected Failed outcome, got: {other:?}"),
    }

    let recorded = sink.events.lock().unwrap().clone();
    assert_eq!(recorded.len(), 0, "Zero events on HTTP 500");
}

#[tokio::test]
async fn test_scenario_d_malformed_json() {
    let (base_url, port, _, _shutdown) = spawn_mock_server(|_m, path| {
        if path.starts_with("/api/v1/sync/pull") {
            (200, "application/json".to_string(), "{ not valid json !!".to_string())
        } else {
            (200, "application/json".to_string(), "[]".to_string())
        }
    })
    .await;

    let app_state = setup_test_app_state().await;
    let daemon = SyncWorkerDaemon::new(app_state.clone());
    daemon.set_test_upstream(&base_url, port).await.unwrap();

    let sink = Arc::new(RecordingSink::default());
    daemon.set_event_sink_for_test(sink.clone()).await;

    let outcome = daemon.sync_downstream_pull().await;
    match outcome {
        DownstreamPullOutcome::Failed(err) => {
            assert!(err.contains("Failed to parse sync pull JSON"));
        }
        other => panic!("Expected Failed outcome, got: {other:?}"),
    }

    let recorded = sink.events.lock().unwrap().clone();
    assert_eq!(recorded.len(), 0, "Zero events on malformed JSON");
}

#[tokio::test]
async fn test_scenario_f_stale_last_error_isolation() {
    // Inject a previous stale error into status
    let category = Category {
        id: "cat-sync-test-stale-01".to_string(),
        name: "Test Stale Category".to_string(),
        code: "STALE-CAT".to_string(),
        description: None,
        is_active: true,
        created_at: "2026-10-18T00:00:00Z".to_string(),
        updated_at: "2026-10-18T00:00:00Z".to_string(),
    };
    let payload = serde_json::to_string(&category).unwrap();

    let entry = ChangeLogEntry {
        sequence: 77,
        organization_id: NIAZI_ORGANIZATION_ID.to_string(),
        branch_id: "00000000-0000-0000-0000-000000000001".to_string(),
        client_event_id: None,
        event_type: "CATEGORY_CREATED".to_string(),
        entity_type: "category".to_string(),
        entity_id: category.id.clone(),
        payload,
        created_at: "2026-10-18T00:00:00Z".to_string(),
    };

    let dto = DeltaPullResponseDto {
        changes: vec![entry],
        next_sequence: 77,
        has_more: false,
    };
    let json_body = serde_json::to_string(&dto).unwrap();

    let (base_url, port, _, _shutdown) = spawn_mock_server(move |_m, path| {
        if path.starts_with("/api/v1/sync/pull") {
            (200, "application/json".to_string(), json_body.clone())
        } else {
            (200, "application/json".to_string(), "[]".to_string())
        }
    })
    .await;

    let app_state = setup_test_app_state().await;
    let daemon = SyncWorkerDaemon::new(app_state.clone());
    daemon.set_test_upstream(&base_url, port).await.unwrap();

    // Manually inject a stale error from an earlier operation
    {
        let status_lock = daemon.get_status_lock();
        let mut st = status_lock.write().await;
        st.last_error = Some("Previous outbox push 401 error".to_string());
    }

    let sink = Arc::new(RecordingSink::default());
    daemon.set_event_sink_for_test(sink.clone()).await;

    // Run pull - should succeed and emit despite previous last_error!
    let outcome = daemon.sync_downstream_pull().await;
    assert_eq!(
        outcome,
        DownstreamPullOutcome::Applied {
            last_sequence: 77,
            event_delivered: true
        }
    );

    // Event emitted!
    let recorded = sink.events.lock().unwrap().clone();
    assert_eq!(recorded.len(), 1, "Event MUST be emitted even if stale error was present");
    assert_eq!(recorded[0].1["last_sequence"], 77);

    // Verify previous diagnostic error was not arbitrarily erased
    let status_lock = daemon.get_status_lock();
    let st = status_lock.read().await;
    assert_eq!(
        st.last_error.as_deref(),
        Some("Previous outbox push 401 error"),
        "Previous diagnostic must remain preserved when current pull had no error"
    );
}

#[tokio::test]
async fn test_scenario_g_repeated_pull_no_duplicate_event() {
    let call_count = Arc::new(AtomicUsize::new(0));
    let cc = call_count.clone();

    let category = Category {
        id: "cat-sync-test-repeat-01".to_string(),
        name: "Test Repeat Category".to_string(),
        code: "REPEAT-CAT".to_string(),
        description: None,
        is_active: true,
        created_at: "2026-10-18T00:00:00Z".to_string(),
        updated_at: "2026-10-18T00:00:00Z".to_string(),
    };
    let payload = serde_json::to_string(&category).unwrap();

    let entry = ChangeLogEntry {
        sequence: 99,
        organization_id: NIAZI_ORGANIZATION_ID.to_string(),
        branch_id: "00000000-0000-0000-0000-000000000001".to_string(),
        client_event_id: None,
        event_type: "CATEGORY_CREATED".to_string(),
        entity_type: "category".to_string(),
        entity_id: category.id.clone(),
        payload,
        created_at: "2026-10-18T00:00:00Z".to_string(),
    };

    let first_dto = DeltaPullResponseDto {
        changes: vec![entry],
        next_sequence: 99,
        has_more: false,
    };
    let first_body = serde_json::to_string(&first_dto).unwrap();

    let empty_dto = DeltaPullResponseDto {
        changes: vec![],
        next_sequence: 99,
        has_more: false,
    };
    let empty_body = serde_json::to_string(&empty_dto).unwrap();

    let (base_url, port, _, _shutdown) = spawn_mock_server(move |_m, path| {
        if path.starts_with("/api/v1/sync/pull") {
            let n = cc.fetch_add(1, Ordering::SeqCst);
            if n == 0 {
                (200, "application/json".to_string(), first_body.clone())
            } else {
                (200, "application/json".to_string(), empty_body.clone())
            }
        } else {
            (200, "application/json".to_string(), "[]".to_string())
        }
    })
    .await;

    let app_state = setup_test_app_state().await;
    let daemon = SyncWorkerDaemon::new(app_state.clone());
    daemon.set_test_upstream(&base_url, port).await.unwrap();

    let sink = Arc::new(RecordingSink::default());
    daemon.set_event_sink_for_test(sink.clone()).await;

    // Pull 1: Applied
    let outcome1 = daemon.sync_downstream_pull().await;
    assert_eq!(
        outcome1,
        DownstreamPullOutcome::Applied {
            last_sequence: 99,
            event_delivered: true
        }
    );

    // Pull 2: Empty
    let outcome2 = daemon.sync_downstream_pull().await;
    assert_eq!(outcome2, DownstreamPullOutcome::NoChanges);

    // Still exactly 1 event emitted in total
    let recorded = sink.events.lock().unwrap().clone();
    assert_eq!(recorded.len(), 1, "Repeated pull must not emit duplicate events");
}
