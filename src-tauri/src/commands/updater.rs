use serde::Serialize;
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_updater::UpdaterExt;

use crate::errors::{AppError, AppResult};
use crate::state::AppState;

#[derive(Debug, Clone, Serialize)]
pub struct UpdateCheckResponse {
    pub available: bool,
    pub version: String,
    pub body: Option<String>,
    pub current_version: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct UpdateProgressPayload {
    pub downloaded: u64,
    pub total: Option<u64>,
    pub percentage: Option<f64>,
    pub status: String,
    pub error: Option<String>,
}

/// Check for available updates using configured Tauri v2 updater endpoint
#[tauri::command]
pub async fn check_app_update(
    app_handle: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<UpdateCheckResponse> {
    let current_version = state.app_version.clone();

    let updater = app_handle
        .updater()
        .map_err(|e| AppError::Internal(format!("Failed to initialize updater plugin: {e}")))?;

    match updater.check().await {
        Ok(Some(update)) => Ok(UpdateCheckResponse {
            available: true,
            version: update.version,
            body: update.body,
            current_version,
        }),
        Ok(None) => Ok(UpdateCheckResponse {
            available: false,
            version: current_version.clone(),
            body: None,
            current_version,
        }),
        Err(e) => Err(AppError::Internal(format!(
            "Failed to check for updates: {e}"
        ))),
    }
}

/// Downloads and installs the pending update while emitting real-time progress events
#[tauri::command]
pub async fn download_and_install_update(app_handle: AppHandle) -> AppResult<()> {
    let updater = app_handle
        .updater()
        .map_err(|e| AppError::Internal(format!("Failed to initialize updater: {e}")))?;

    let update = match updater.check().await {
        Ok(Some(u)) => u,
        Ok(None) => return Err(AppError::Internal("No update available to install.".into())),
        Err(e) => return Err(AppError::Internal(format!("Update check failed: {e}"))),
    };

    let handle_clone = app_handle.clone();
    let mut downloaded_bytes: u64 = 0;

    // Emit initial downloading state
    let _ = handle_clone.emit(
        "update-progress",
        UpdateProgressPayload {
            downloaded: 0,
            total: None,
            percentage: None,
            status: "downloading".to_string(),
            error: None,
        },
    );

    let handle_progress = app_handle.clone();
    let download_result = update
        .download_and_install(
            move |chunk_length, content_length| {
                downloaded_bytes += chunk_length as u64;

                let percentage = content_length.and_then(|total| {
                    if total > 0 {
                        let pct = (downloaded_bytes as f64 / total as f64) * 100.0;
                        Some(pct.clamp(0.0, 100.0))
                    } else {
                        None
                    }
                });

                let _ = handle_progress.emit(
                    "update-progress",
                    UpdateProgressPayload {
                        downloaded: downloaded_bytes,
                        total: content_length,
                        percentage,
                        status: "downloading".to_string(),
                        error: None,
                    },
                );
            },
            move || {
                let _ = app_handle.emit(
                    "update-progress",
                    UpdateProgressPayload {
                        downloaded: downloaded_bytes,
                        total: None,
                        percentage: Some(100.0),
                        status: "installing".to_string(),
                        error: None,
                    },
                );
            },
        )
        .await;

    match download_result {
        Ok(_) => {
            let _ = handle_clone.emit(
                "update-progress",
                UpdateProgressPayload {
                    downloaded: downloaded_bytes,
                    total: None,
                    percentage: Some(100.0),
                    status: "completed".to_string(),
                    error: None,
                },
            );
            Ok(())
        }
        Err(e) => {
            let err_msg = format!("{e}");
            let _ = handle_clone.emit(
                "update-progress",
                UpdateProgressPayload {
                    downloaded: downloaded_bytes,
                    total: None,
                    percentage: None,
                    status: "error".to_string(),
                    error: Some(err_msg.clone()),
                },
            );
            Err(AppError::Internal(format!(
                "Update download and installation failed: {err_msg}"
            )))
        }
    }
}

/// Relaunches the desktop application after a successful update installation
#[tauri::command]
pub async fn relaunch_app(app_handle: AppHandle) -> AppResult<()> {
    app_handle.restart();
    Ok(())
}

/// Opens an external web URL using the desktop system opener
#[tauri::command]
pub async fn open_external_url(app_handle: AppHandle, url: String) -> AppResult<()> {
    use tauri_plugin_opener::OpenerExt;
    let _ = app_handle.opener().open_url(&url, None::<&str>);
    Ok(())
}
