use serde::{Deserialize, Serialize};

/// Terminal identity representing a physical PC / terminal installation of Niazi Mobile Mart.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Terminal {
    pub id: String,
    pub organization_id: String,
    pub branch_id: Option<String>,
    pub device_name: String,
    pub is_active: bool,
    pub is_offline_terminal: bool,
    pub registered_centrally: bool,
    pub created_at: String,
    pub updated_at: String,
    pub last_seen_at: Option<String>,
}

/// DTO for creating/registering a terminal
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegisterTerminalDto {
    pub device_name: String,
    pub branch_id: Option<String>,
    pub is_offline_terminal: Option<bool>,
}
