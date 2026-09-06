use serde::{Deserialize, Serialize};

/// Status of a sales return
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SalesReturnStatus {
    #[serde(rename = "COMPLETED")]
    Completed,
    #[serde(rename = "CANCELLED")]
    Cancelled,
}

impl SalesReturnStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            SalesReturnStatus::Completed => "COMPLETED",
            SalesReturnStatus::Cancelled => "CANCELLED",
        }
    }

    pub fn from_str(s: &str) -> Result<Self, String> {
        match s.to_uppercase().as_str() {
            "COMPLETED" => Ok(SalesReturnStatus::Completed),
            "CANCELLED" => Ok(SalesReturnStatus::Cancelled),
            other => Err(format!("Unknown sales return status: {other}")),
        }
    }
}

/// Settlement / refund method for sales return
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SalesRefundMethod {
    #[serde(rename = "CASH")]
    Cash,
    #[serde(rename = "CUSTOMER_CREDIT")]
    CustomerCredit,
}

impl SalesRefundMethod {
    pub fn as_str(&self) -> &'static str {
        match self {
            SalesRefundMethod::Cash => "CASH",
            SalesRefundMethod::CustomerCredit => "CUSTOMER_CREDIT",
        }
    }

    pub fn from_str(s: &str) -> Result<Self, String> {
        match s.to_uppercase().as_str() {
            "CASH" => Ok(SalesRefundMethod::Cash),
            "CUSTOMER_CREDIT" | "CUSTOMER_ACCOUNT" | "CREDIT" => Ok(SalesRefundMethod::CustomerCredit),
            other => Err(format!("Unknown sales refund method: {other}")),
        }
    }
}

/// Authoritative sales return header entity
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SalesReturn {
    pub id: String,
    pub return_number: String,
    pub sale_id: String,
    pub branch_id: String,
    pub customer_id: Option<String>,
    pub customer_name_snapshot: Option<String>,
    pub total_amount: i64,
    pub refund_method: SalesRefundMethod,
    pub status: SalesReturnStatus,
    pub reason: Option<String>,
    pub notes: Option<String>,
    pub performed_by: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// Authoritative sales return line entity
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SalesReturnLine {
    pub id: String,
    pub return_id: String,
    pub sale_line_id: String,
    pub product_id: String,
    pub product_name_snapshot: String,
    pub sku_snapshot: String,
    pub unit_price: i64,
    pub quantity: i64,
    pub return_amount: i64,
    pub created_at: String,
}

/// Request line item for creating a sales return
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateSalesReturnLineDto {
    pub sale_line_id: String,
    pub quantity: i64,
}

/// Request payload for creating a sales return
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateSalesReturnDto {
    pub sale_id: String,
    pub lines: Vec<CreateSalesReturnLineDto>,
    pub refund_method: String,
    pub reason: Option<String>,
    pub notes: Option<String>,
}

/// Information about a single sale line's returnable status
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SaleReturnableLineDto {
    pub sale_line_id: String,
    pub product_id: String,
    pub product_name: String,
    pub sku: String,
    pub original_quantity: i64,
    pub already_returned_quantity: i64,
    pub returnable_quantity: i64,
    pub unit_price: i64,
    pub line_total: i64,
    pub effective_unit_price: i64,
}

/// Complete returnable inspection payload for an existing sale
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SaleReturnableInfoDto {
    pub sale_id: String,
    pub invoice_number: String,
    pub branch_id: String,
    pub customer_id: Option<String>,
    pub customer_name: Option<String>,
    pub sale_date: String,
    pub total_amount: i64,
    pub paid_amount: i64,
    pub customer_outstanding_balance: i64,
    pub lines: Vec<SaleReturnableLineDto>,
}

/// Complete sales return detailed view
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SalesReturnDetailDto {
    pub sales_return: SalesReturn,
    pub lines: Vec<SalesReturnLine>,
    pub invoice_number: String,
    pub customer_balance_after: Option<i64>,
    pub cash_refunded: Option<i64>,
}
