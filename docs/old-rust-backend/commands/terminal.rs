use tauri::State;

use crate::domain::terminal::{RegisterTerminalDto, Terminal};
use crate::errors::AppResult;
use crate::services::terminal_service::TerminalService;
use crate::state::AppState;

/// Command to get or initialize the current installation's stable terminal identity
#[tauri::command]
pub async fn terminal_get_current(state: State<'_, AppState>) -> AppResult<Terminal> {
    TerminalService::get_current_terminal(&state.terminal_repo).await
}

/// Command to register/update terminal details
#[tauri::command]
pub async fn terminal_register(
    state: State<'_, AppState>,
    dto: RegisterTerminalDto,
) -> AppResult<Terminal> {
    TerminalService::register_terminal(&state.terminal_repo, dto).await
}
