use serde::{Deserialize, Serialize};

/// Supported immutable stock movement types for the inventory ledger
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum StockMovementType {
    #[serde(rename = "IN")]
    In,
    #[serde(rename = "OUT")]
    Out,
    #[serde(rename = "ADJUSTMENT")]
    Adjustment,
    #[serde(rename = "TRANSFER_IN")]
    TransferIn,
    #[serde(rename = "TRANSFER_OUT")]
    TransferOut,
}

impl StockMovementType {
    pub fn as_str(&self) -> &'static str {
        match self {
            StockMovementType::In => "IN",
            StockMovementType::Out => "OUT",
            StockMovementType::Adjustment => "ADJUSTMENT",
            StockMovementType::TransferIn => "TRANSFER_IN",
            StockMovementType::TransferOut => "TRANSFER_OUT",
        }
    }

    pub fn from_str(s: &str) -> Result<Self, String> {
        match s {
            "IN" => Ok(StockMovementType::In),
            "OUT" => Ok(StockMovementType::Out),
            "ADJUSTMENT" => Ok(StockMovementType::Adjustment),
            "TRANSFER_IN" => Ok(StockMovementType::TransferIn),
            "TRANSFER_OUT" => Ok(StockMovementType::TransferOut),
            other => Err(format!("Unknown stock movement type: {other}")),
        }
    }
}

/// Branch stock state entity (current physical quantity at a controlled branch)
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Stock {
    pub product_id: String,
    pub branch_id: String,
    pub quantity: i64,
    pub updated_at: String,
}

/// Immutable historical ledger entry of every stock change
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct StockMovement {
    pub id: String,
    pub product_id: String,
    pub branch_id: String,
    pub movement_type: StockMovementType,
    pub quantity: i64,
    pub previous_stock: i64,
    pub resulting_stock: i64,
    pub reason: Option<String>,
    pub performed_by: Option<String>,
    pub reference_id: Option<String>,
    pub created_at: String,
}

/// Low stock report projection
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct LowStockItemDto {
    pub product_id: String,
    pub product_name: String,
    pub sku: String,
    pub branch_id: String,
    pub branch_name: String,
    pub current_quantity: i64,
    pub threshold: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IncreaseStockDto {
    pub product_id: String,
    pub branch_id: String,
    pub quantity: i64,
    pub reason: Option<String>,
    pub reference_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DecreaseStockDto {
    pub product_id: String,
    pub branch_id: String,
    pub quantity: i64,
    pub reason: Option<String>,
    pub reference_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdjustStockDto {
    pub product_id: String,
    pub branch_id: String,
    pub target_quantity: i64,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransferStockDto {
    pub product_id: String,
    pub from_branch_id: String,
    pub to_branch_id: String,
    pub quantity: i64,
    pub reason: Option<String>,
    pub reference_id: Option<String>,
}
