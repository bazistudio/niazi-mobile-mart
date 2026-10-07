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

/// SYNC-H1 — Sync payload for a single manual inventory operation.
///
/// Represents one of: INCREASE, DECREASE, ADJUST, TRANSFER.
/// `operation_id` is the stable business identity used for idempotency
/// (stable across queue retries; separate from `stock_movements.id`).
/// For ADJUST, `target_quantity` holds the authoritative resulting quantity
/// and `quantity` holds the absolute delta (|target - prev|).
/// For TRANSFER, `from_branch_id` and `to_branch_id` are both set.
/// For non-transfer operations, `from_branch_id == branch_id` and
/// `to_branch_id` is None.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct InventoryOperationSyncEventDto {
    /// Stable operation identity (UUID, generated once at the producer site).
    pub operation_id: String,
    /// One of: "INCREASE", "DECREASE", "ADJUST", "TRANSFER"
    pub operation_type: String,
    pub product_id: String,
    /// For INCREASE / DECREASE / ADJUST: the affected branch.
    /// For TRANSFER: the source branch.
    pub branch_id: String,
    /// TRANSFER only: the destination branch.
    pub to_branch_id: Option<String>,
    /// Movement quantity (always positive).
    /// For ADJUST: absolute delta |target - previous|.
    pub quantity: i64,
    /// ADJUST only: the authoritative resulting quantity after adjustment.
    pub target_quantity: Option<i64>,
    pub reason: Option<String>,
    pub performed_by: Option<String>,
    pub created_at: String,
}
