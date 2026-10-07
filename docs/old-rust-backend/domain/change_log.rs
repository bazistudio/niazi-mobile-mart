use serde::{Deserialize, Serialize};

/// Central Change Log record describing an authoritative committed business mutation
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ChangeLogEntry {
    pub sequence: i64,
    pub organization_id: String,
    pub branch_id: String,
    pub client_event_id: Option<String>,
    pub event_type: String,
    pub entity_type: String,
    pub entity_id: String,
    pub payload: String,
    pub created_at: String,
}

/// Query params for downstream delta pull API
#[derive(Debug, Clone, Deserialize)]
pub struct DeltaPullQuery {
    pub after_sequence: Option<i64>,
    pub limit: Option<i64>,
}

/// Response payload for downstream delta pull API
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DeltaPullResponseDto {
    pub changes: Vec<ChangeLogEntry>,
    pub next_sequence: i64,
    pub has_more: bool,
}

/// Local SQLite cursor tracking downstream delta pull position
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SyncCursor {
    pub stream_name: String,
    pub organization_id: String,
    pub last_applied_sequence: i64,
    pub updated_at: String,
}
