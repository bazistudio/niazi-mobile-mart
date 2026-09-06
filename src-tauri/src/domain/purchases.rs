use serde::{Deserialize, Serialize};

/// Payment settlement status on a purchase
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum PurchasePaymentStatus {
    Paid,
    PartiallyPaid,
    Unpaid,
}

impl PurchasePaymentStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Paid => "PAID",
            Self::PartiallyPaid => "PARTIALLY_PAID",
            Self::Unpaid => "UNPAID",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "PAID" => Some(Self::Paid),
            "PARTIALLY_PAID" => Some(Self::PartiallyPaid),
            "UNPAID" => Some(Self::Unpaid),
            _ => None,
        }
    }
}

/// Operational status of a purchase
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum PurchaseStatus {
    Completed,
    Cancelled,
}

impl PurchaseStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Completed => "COMPLETED",
            Self::Cancelled => "CANCELLED",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "COMPLETED" => Some(Self::Completed),
            "CANCELLED" => Some(Self::Cancelled),
            _ => None,
        }
    }
}

/// Immutable historical purchase header
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Purchase {
    pub id: String,
    pub purchase_number: String,
    pub supplier_id: String,
    pub branch_id: String,
    pub subtotal: i64,
    pub discount: i64,
    pub total_amount: i64,
    pub paid_amount: i64,
    pub credit_amount: i64,
    pub payment_status: PurchasePaymentStatus,
    pub status: PurchaseStatus,
    pub notes: Option<String>,
    pub performed_by: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// Line item on a purchase capturing unit cost and product snapshot
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PurchaseLine {
    pub id: String,
    pub purchase_id: String,
    pub product_id: String,
    pub product_name_snapshot: String,
    pub sku_snapshot: String,
    pub quantity: i64,
    pub unit_cost: i64,
    pub discount: i64,
    pub line_total: i64,
    pub created_at: String,
}

/// Input line item for completing a purchase
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PurchaseItemDto {
    pub product_id: String,
    pub quantity: i64,
    pub unit_cost: Option<i64>, // If None, defaults to current product purchase_price
    pub discount: Option<i64>,
}

/// Input payload for completing a purchase transaction
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompletePurchaseDto {
    pub branch_id: Option<String>,
    pub supplier_id: String,
    pub items: Vec<PurchaseItemDto>,
    pub discount: Option<i64>,
    pub paid_amount: Option<i64>,
    pub payment_method: Option<String>,
    pub notes: Option<String>,
}

/// Authoritative response after completing a purchase
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PurchaseResultDto {
    pub purchase: Purchase,
    pub lines: Vec<PurchaseLine>,
    pub credit_amount: i64,
    pub supplier_balance_after: i64,
}

/// Filter for querying purchases
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PurchaseFilterDto {
    pub supplier_id: Option<String>,
    pub branch_id: Option<String>,
    pub payment_status: Option<String>,
    pub status: Option<String>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}
