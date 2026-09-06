use serde::{Deserialize, Serialize};

/// Status of a purchase return
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum PurchaseReturnStatus {
    #[serde(rename = "COMPLETED")]
    Completed,
    #[serde(rename = "CANCELLED")]
    Cancelled,
}

impl PurchaseReturnStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            PurchaseReturnStatus::Completed => "COMPLETED",
            PurchaseReturnStatus::Cancelled => "CANCELLED",
        }
    }

    pub fn from_str(s: &str) -> Result<Self, String> {
        match s.to_uppercase().as_str() {
            "COMPLETED" => Ok(PurchaseReturnStatus::Completed),
            "CANCELLED" => Ok(PurchaseReturnStatus::Cancelled),
            other => Err(format!("Unknown purchase return status: {other}")),
        }
    }
}

/// Settlement method for purchase return
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum PurchaseSettlementMethod {
    #[serde(rename = "CASH")]
    Cash,
    #[serde(rename = "SUPPLIER_CREDIT")]
    SupplierCredit,
}

impl PurchaseSettlementMethod {
    pub fn as_str(&self) -> &'static str {
        match self {
            PurchaseSettlementMethod::Cash => "CASH",
            PurchaseSettlementMethod::SupplierCredit => "SUPPLIER_CREDIT",
        }
    }

    pub fn from_str(s: &str) -> Result<Self, String> {
        match s.to_uppercase().as_str() {
            "CASH" => Ok(PurchaseSettlementMethod::Cash),
            "SUPPLIER_CREDIT" | "SUPPLIER_ACCOUNT" | "CREDIT" => Ok(PurchaseSettlementMethod::SupplierCredit),
            other => Err(format!("Unknown purchase settlement method: {other}")),
        }
    }
}

/// Authoritative purchase return header entity
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PurchaseReturn {
    pub id: String,
    pub return_number: String,
    pub purchase_id: String,
    pub branch_id: String,
    pub supplier_id: String,
    pub supplier_name_snapshot: Option<String>,
    pub total_amount: i64,
    pub settlement_method: PurchaseSettlementMethod,
    pub status: PurchaseReturnStatus,
    pub reason: Option<String>,
    pub notes: Option<String>,
    pub performed_by: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// Authoritative purchase return line entity
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PurchaseReturnLine {
    pub id: String,
    pub return_id: String,
    pub purchase_line_id: String,
    pub product_id: String,
    pub product_name_snapshot: String,
    pub sku_snapshot: String,
    pub unit_cost: i64,
    pub quantity: i64,
    pub return_amount: i64,
    pub created_at: String,
}

/// Request line item for creating a purchase return
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreatePurchaseReturnLineDto {
    pub purchase_line_id: String,
    pub quantity: i64,
}

/// Request payload for creating a purchase return
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreatePurchaseReturnDto {
    pub purchase_id: String,
    pub lines: Vec<CreatePurchaseReturnLineDto>,
    pub settlement_method: String,
    pub reason: Option<String>,
    pub notes: Option<String>,
}

/// Information about a single purchase line's returnable status
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PurchaseReturnableLineDto {
    pub purchase_line_id: String,
    pub product_id: String,
    pub product_name: String,
    pub sku: String,
    pub original_quantity: i64,
    pub already_returned_quantity: i64,
    pub returnable_quantity: i64,
    pub current_available_stock: i64,
    pub unit_cost: i64,
    pub line_total: i64,
    pub effective_unit_cost: i64,
}

/// Complete returnable inspection payload for an existing purchase
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PurchaseReturnableInfoDto {
    pub purchase_id: String,
    pub purchase_number: String,
    pub branch_id: String,
    pub supplier_id: String,
    pub supplier_name: Option<String>,
    pub purchase_date: String,
    pub total_amount: i64,
    pub paid_amount: i64,
    pub supplier_outstanding_payable: i64,
    pub lines: Vec<PurchaseReturnableLineDto>,
}

/// Complete purchase return detailed view
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PurchaseReturnDetailDto {
    pub purchase_return: PurchaseReturn,
    pub lines: Vec<PurchaseReturnLine>,
    pub purchase_number: String,
    pub supplier_payable_after: Option<i64>,
    pub cash_settled: Option<i64>,
}
