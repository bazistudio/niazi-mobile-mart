use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum CashMovementType {
    SalePayment,
    CustomerPayment,
    SupplierPayment,
    Expense,
    CashAdjustment,
}

impl CashMovementType {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::SalePayment => "SALE_PAYMENT",
            Self::CustomerPayment => "CUSTOMER_PAYMENT",
            Self::SupplierPayment => "SUPPLIER_PAYMENT",
            Self::Expense => "EXPENSE",
            Self::CashAdjustment => "CASH_ADJUSTMENT",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "SALE_PAYMENT" => Some(Self::SalePayment),
            "CUSTOMER_PAYMENT" => Some(Self::CustomerPayment),
            "SUPPLIER_PAYMENT" => Some(Self::SupplierPayment),
            "EXPENSE" => Some(Self::Expense),
            "CASH_ADJUSTMENT" => Some(Self::CashAdjustment),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum CashMovementDirection {
    In,
    Out,
}

impl CashMovementDirection {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::In => "IN",
            Self::Out => "OUT",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "IN" => Some(Self::In),
            "OUT" => Some(Self::Out),
            _ => None,
        }
    }
}

/// Append-only Auditable Cash Movement Record
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CashMovement {
    pub id: String,
    pub session_id: Option<String>,
    pub branch_id: String,
    pub movement_type: CashMovementType,
    pub direction: CashMovementDirection,
    pub amount: i64, // Whole PKR rupees (1 stored integer = 1 PKR)
    pub reference_id: Option<String>,
    pub reference_number: Option<String>,
    pub payment_method: String,
    pub description: String,
    pub performed_by: Option<String>,
    pub performed_by_name: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum CashSessionStatus {
    Open,
    Closed,
}

impl CashSessionStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Open => "OPEN",
            Self::Closed => "CLOSED",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "OPEN" => Some(Self::Open),
            "CLOSED" => Some(Self::Closed),
            _ => None,
        }
    }
}

/// Daily Cash Session Record
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CashSession {
    pub id: String,
    pub branch_id: String,
    pub branch_name: Option<String>,
    pub business_date: String,
    pub opening_cash: i64,
    pub expected_closing_cash: Option<i64>,
    pub actual_closing_cash: Option<i64>,
    pub cash_variance: Option<i64>,
    pub status: CashSessionStatus,
    pub opened_at: String,
    pub closed_at: Option<String>,
    pub opened_by: Option<String>,
    pub opened_by_name: Option<String>,
    pub closed_by: Option<String>,
    pub closed_by_name: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenCashSessionDto {
    pub branch_id: Option<String>,
    pub business_date: Option<String>,
    pub opening_cash: i64,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CloseCashSessionDto {
    pub session_id: String,
    pub actual_closing_cash: i64,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateCashAdjustmentDto {
    pub branch_id: Option<String>,
    pub amount: i64,
    pub direction: String, // "IN" or "OUT"
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CashMovementFilterDto {
    pub session_id: Option<String>,
    pub branch_id: Option<String>,
    pub movement_type: Option<String>,
    pub direction: Option<String>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

/// Authoritative Daily Cash Summary DTO
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DailyCashSummaryDto {
    pub business_date: String,
    pub session_id: Option<String>,
    pub session_status: Option<String>,
    pub opening_cash: i64,
    pub cash_sales: i64,
    pub customer_payments: i64,
    pub supplier_payments: i64,
    pub cash_expenses: i64,
    pub cash_adjustments: i64,
    pub total_cash_in: i64,
    pub total_cash_out: i64,
    pub expected_closing_cash: i64,
    pub actual_closing_cash: Option<i64>,
    pub variance: Option<i64>,
}
