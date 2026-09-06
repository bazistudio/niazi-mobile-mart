use serde::{Deserialize, Serialize};

/// Payment settlement status on a sale
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum PaymentStatus {
    Paid,
    PartiallyPaid,
    Unpaid,
}

impl PaymentStatus {
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

/// Operational status of a sale
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SaleStatus {
    Completed,
    Voided,
    Refunded,
}

impl SaleStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Completed => "COMPLETED",
            Self::Voided => "VOIDED",
            Self::Refunded => "REFUNDED",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "COMPLETED" => Some(Self::Completed),
            "VOIDED" => Some(Self::Voided),
            "REFUNDED" => Some(Self::Refunded),
            _ => None,
        }
    }
}

/// Immutable historical sale header
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Sale {
    pub id: String,
    pub invoice_number: String,
    pub branch_id: String,
    pub customer_id: Option<String>,
    pub customer_name_snapshot: Option<String>,
    pub subtotal: i64,
    pub discount: i64,
    pub tax_amount: i64,
    pub total_amount: i64,
    pub paid_amount: i64,
    pub change_amount: i64,
    pub payment_status: PaymentStatus,
    pub sale_status: SaleStatus,
    pub performed_by: Option<String>,
    pub notes: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// Line item on a sale capturing price and product snapshot
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SaleLine {
    pub id: String,
    pub sale_id: String,
    pub product_id: String,
    pub product_name_snapshot: String,
    pub sku_snapshot: String,
    pub unit_price: i64,
    pub cost_price_snapshot: i64,
    pub quantity: i64,
    pub discount: i64,
    pub line_total: i64,
    pub created_at: String,
}

/// Immediate payment collected on the sale at checkout
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SalePayment {
    pub id: String,
    pub sale_id: String,
    pub amount: i64,
    pub payment_method: String,
    pub reference_number: Option<String>,
    pub notes: Option<String>,
    pub created_at: String,
}

/// Input line item for completing a sale
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SaleItemDto {
    pub product_id: String,
    pub quantity: i64,
    pub discount: Option<i64>,
}

/// Input payload for atomic checkout transaction
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompleteSaleDto {
    pub branch_id: Option<String>,
    pub customer_id: Option<String>,
    pub items: Vec<SaleItemDto>,
    pub discount: Option<i64>,
    pub paid_amount: Option<i64>,
    pub payment_method: Option<String>,
    pub notes: Option<String>,
}

/// Authoritative response after atomic checkout
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SaleResultDto {
    pub sale: Sale,
    pub lines: Vec<SaleLine>,
    pub payments: Vec<SalePayment>,
    pub credit_amount: i64,
    pub customer_balance_after: Option<i64>,
}

/// Filter for querying sales
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SaleFilterDto {
    pub customer_id: Option<String>,
    pub branch_id: Option<String>,
    pub payment_status: Option<String>,
    pub sale_status: Option<String>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}
