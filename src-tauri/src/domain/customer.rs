use serde::{Deserialize, Serialize};

/// Master Customer record with UUID v4 identity and whole PKR currency
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Customer {
    pub id: String,
    pub customer_code: String,
    pub name: String,
    pub phone: String,
    pub alternate_phone: Option<String>,
    pub email: Option<String>,
    pub address: Option<String>,
    pub notes: Option<String>,
    pub credit_limit: i64, // 0 = unlimited credit by Niazi policy
    pub is_active: bool,
    pub created_at: String,
    pub updated_at: String,
}

/// Lightweight customer summary with computed authoritative outstanding balance
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CustomerSummaryDto {
    pub id: String,
    pub customer_code: String,
    pub name: String,
    pub phone: String,
    pub credit_limit: i64,
    pub outstanding_balance: i64,
    pub is_active: bool,
    pub created_at: String,
}

/// Rich Customer Profile with financial stats
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CustomerDetailDto {
    pub customer: Customer,
    pub outstanding_balance: i64,
    pub total_sales_count: i64,
    pub total_sales_amount: i64,
    pub last_transaction_date: Option<String>,
}

/// DTO for creating a new Customer
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateCustomerDto {
    pub name: String,
    pub phone: String,
    pub alternate_phone: Option<String>,
    pub email: Option<String>,
    pub address: Option<String>,
    pub notes: Option<String>,
    pub credit_limit: Option<i64>,
}

/// DTO for updating an existing Customer
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateCustomerDto {
    pub name: Option<String>,
    pub phone: Option<String>,
    pub alternate_phone: Option<String>,
    pub email: Option<String>,
    pub address: Option<String>,
    pub notes: Option<String>,
    pub credit_limit: Option<i64>,
    pub is_active: Option<bool>,
}

/// Filter criteria for listing/searching customers
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CustomerFilter {
    pub search: Option<String>,
    pub is_active: Option<bool>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

/// Financial journal entry type in the customer ledger
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum CustomerLedgerEntryType {
    Sale,
    Payment,
    Adjustment,
}

impl CustomerLedgerEntryType {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Sale => "SALE",
            Self::Payment => "PAYMENT",
            Self::Adjustment => "ADJUSTMENT",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "SALE" => Some(Self::Sale),
            "PAYMENT" => Some(Self::Payment),
            "ADJUSTMENT" => Some(Self::Adjustment),
            _ => None,
        }
    }
}

/// Append-only Auditable Customer Ledger Entry
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CustomerLedgerEntry {
    pub id: String,
    pub customer_id: String,
    pub reference_id: Option<String>,
    pub reference_number: Option<String>,
    pub entry_type: CustomerLedgerEntryType,
    pub debit: i64,         // Receivable increased (e.g. credit sale)
    pub credit: i64,        // Receivable decreased (e.g. payment received)
    pub balance_after: i64, // Authoritative balance after this entry
    pub description: String,
    pub performed_by: Option<String>,
    pub created_at: String,
}

/// Printable statement line item
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CustomerStatementRowDto {
    pub id: String,
    pub date: String,
    pub reference_number: Option<String>,
    pub description: String,
    pub entry_type: String,
    pub debit: i64,
    pub credit: i64,
    pub balance: i64,
}

/// Complete Customer Statement DTO
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CustomerStatementDto {
    pub customer_id: String,
    pub customer_name: String,
    pub customer_code: String,
    pub phone: String,
    pub credit_limit: i64,
    pub current_balance: i64,
    pub entries: Vec<CustomerStatementRowDto>,
}

/// Payload for recording a customer payment against receivables
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecordCustomerPaymentDto {
    pub customer_id: String,
    pub amount: i64,
    pub payment_method: String,
    pub reference_number: Option<String>,
    pub notes: Option<String>,
}

/// Trace of a payment allocation to an individual sale
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AllocatedSaleDto {
    pub sale_id: String,
    pub invoice_number: String,
    pub amount_allocated: i64,
    pub previous_paid: i64,
    pub new_paid: i64,
    pub total_amount: i64,
    pub payment_status: String,
}

/// Result returned after atomically recording a customer payment
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CustomerPaymentResultDto {
    pub payment_id: String,
    pub receipt_number: String,
    pub customer_id: String,
    pub amount_paid: i64,
    pub previous_balance: i64,
    pub new_balance: i64,
    pub allocated_sales: Vec<AllocatedSaleDto>,
}
