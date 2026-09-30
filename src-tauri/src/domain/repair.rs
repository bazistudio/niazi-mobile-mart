use serde::{Deserialize, Serialize};

/// Operational status of a repair job
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RepairJobStatus {
    Booked,
    InProgress,
    Completed,
    Cancelled,
}

impl RepairJobStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Booked => "BOOKED",
            Self::InProgress => "IN_PROGRESS",
            Self::Completed => "COMPLETED",
            Self::Cancelled => "CANCELLED",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "BOOKED" => Some(Self::Booked),
            "IN_PROGRESS" => Some(Self::InProgress),
            "COMPLETED" => Some(Self::Completed),
            "CANCELLED" => Some(Self::Cancelled),
            _ => None,
        }
    }
}

/// Immutable Repair Job header
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RepairJob {
    pub id: String,
    pub job_number: String,
    pub branch_id: String,
    pub customer_id: String,
    pub customer_name_snapshot: String,
    pub device_brand: String,
    pub device_model: String,
    pub device_imei: Option<String>,
    pub problem_description: String,
    pub estimated_charges: i64,
    pub final_charges: i64,
    pub paid_amount: i64,
    pub status: RepairJobStatus,
    pub notes: Option<String>,
    pub performed_by: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// Input DTO for creating a repair job
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateRepairJobDto {
    pub branch_id: Option<String>,
    pub customer_id: String,
    pub device_brand: String,
    pub device_model: String,
    pub device_imei: Option<String>,
    pub problem_description: String,
    pub estimated_charges: i64,
    pub notes: Option<String>,
}

/// Input DTO for updating a repair job
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateRepairJobDto {
    pub status: Option<RepairJobStatus>,
    pub final_charges: Option<i64>,
    pub paid_amount: Option<i64>,
    pub notes: Option<String>,
}

/// Sync payload
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RepairJobSyncEventDto {
    pub job: RepairJob,
}
