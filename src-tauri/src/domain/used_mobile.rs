use serde::{Deserialize, Serialize};

/// Type of used mobile transaction
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum UsedMobileTransactionType {
    PurchaseFromSeller,
    SaleToCustomer,
}

impl UsedMobileTransactionType {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::PurchaseFromSeller => "PURCHASE_FROM_SELLER",
            Self::SaleToCustomer => "SALE_TO_CUSTOMER",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "PURCHASE_FROM_SELLER" => Some(Self::PurchaseFromSeller),
            "SALE_TO_CUSTOMER" => Some(Self::SaleToCustomer),
            _ => None,
        }
    }
}

/// Operational status of a used mobile transaction
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum UsedMobileStatus {
    Completed,
    Cancelled,
}

impl UsedMobileStatus {
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

/// Payment settlement status
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum UsedMobilePaymentStatus {
    Paid,
    PartiallyPaid,
    Unpaid,
}

impl UsedMobilePaymentStatus {
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

/// Immutable Used Mobile KYC Transaction
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct UsedMobileTransaction {
    pub id: String,
    pub transaction_number: String,
    pub branch_id: String,
    pub transaction_type: UsedMobileTransactionType,
    pub customer_id: String,
    pub seller_name_snapshot: String,
    pub seller_cnic: String,
    pub seller_mobile: String,
    pub device_brand: String,
    pub device_model: String,
    pub device_imei_1: String,
    pub device_imei_2: Option<String>,
    pub device_condition: String,
    pub transaction_amount: i64,
    pub payment_status: UsedMobilePaymentStatus,
    pub status: UsedMobileStatus,
    pub notes: Option<String>,
    pub performed_by: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// Input DTO for creating a used mobile transaction
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateUsedMobileTransactionDto {
    pub branch_id: Option<String>,
    pub transaction_type: UsedMobileTransactionType,
    pub customer_id: String,
    pub seller_name_snapshot: String,
    pub seller_cnic: String,
    pub seller_mobile: String,
    pub device_brand: String,
    pub device_model: String,
    pub device_imei_1: String,
    pub device_imei_2: Option<String>,
    pub device_condition: String,
    pub transaction_amount: i64,
    pub payment_status: UsedMobilePaymentStatus,
    pub notes: Option<String>,
}

/// Sync payload
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct UsedMobileTransactionSyncEventDto {
    pub transaction: UsedMobileTransaction,
}
