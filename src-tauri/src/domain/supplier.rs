use serde::{Deserialize, Serialize};

/// Master Supplier record with UUID v4 identity and whole PKR currency
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Supplier {
    pub id: String,
    pub supplier_code: String,
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

/// Lightweight supplier summary with computed authoritative outstanding balance
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SupplierSummaryDto {
    pub id: String,
    pub supplier_code: String,
    pub name: String,
    pub phone: String,
    pub credit_limit: i64,
    pub outstanding_balance: i64,
    pub is_active: bool,
    pub created_at: String,
}

/// Rich Supplier Profile with procurement stats
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SupplierDetailDto {
    pub supplier: Supplier,
    pub outstanding_balance: i64,
    pub total_purchases_count: i64,
    pub total_purchases_amount: i64,
    pub last_transaction_date: Option<String>,
}

/// DTO for creating a new Supplier
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateSupplierDto {
    pub name: String,
    pub phone: String,
    pub alternate_phone: Option<String>,
    pub email: Option<String>,
    pub address: Option<String>,
    pub notes: Option<String>,
    pub credit_limit: Option<i64>,
}

/// DTO for updating an existing Supplier
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateSupplierDto {
    pub name: Option<String>,
    pub phone: Option<String>,
    pub alternate_phone: Option<String>,
    pub email: Option<String>,
    pub address: Option<String>,
    pub notes: Option<String>,
    pub credit_limit: Option<i64>,
    pub is_active: Option<bool>,
}

/// Filter criteria for listing/searching suppliers
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SupplierFilter {
    pub search: Option<String>,
    pub is_active: Option<bool>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

/// Financial journal entry type in the supplier ledger
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SupplierLedgerEntryType {
    Purchase,
    Payment,
    Adjustment,
}

impl SupplierLedgerEntryType {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Purchase => "PURCHASE",
            Self::Payment => "PAYMENT",
            Self::Adjustment => "ADJUSTMENT",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "PURCHASE" => Some(Self::Purchase),
            "PAYMENT" => Some(Self::Payment),
            "ADJUSTMENT" => Some(Self::Adjustment),
            _ => None,
        }
    }
}

/// Append-only Auditable Supplier Ledger Entry
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SupplierLedgerEntry {
    pub id: String,
    pub supplier_id: String,
    pub reference_id: Option<String>,
    pub reference_number: Option<String>,
    pub entry_type: SupplierLedgerEntryType,
    pub debit: i64,         // Payable increased (e.g. credit purchase)
    pub credit: i64,        // Payable decreased (e.g. payment made to supplier)
    pub balance_after: i64, // Authoritative balance after this entry
    pub description: String,
    pub performed_by: Option<String>,
    pub created_at: String,
}

/// Printable statement line item
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SupplierStatementRowDto {
    pub id: String,
    pub date: String,
    pub reference_number: Option<String>,
    pub description: String,
    pub entry_type: String,
    pub debit: i64,
    pub credit: i64,
    pub balance: i64,
}

/// Complete Supplier Statement DTO
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SupplierStatementDto {
    pub supplier_id: String,
    pub supplier_name: String,
    pub supplier_code: String,
    pub phone: String,
    pub credit_limit: i64,
    pub current_balance: i64,
    pub entries: Vec<SupplierStatementRowDto>,
}

/// Payload for recording a payment made to a supplier against payables
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecordSupplierPaymentDto {
    pub supplier_id: String,
    pub amount: i64,
    pub payment_method: String,
    pub reference_number: Option<String>,
    pub notes: Option<String>,
}

/// Trace of a payment allocation to an individual purchase
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AllocatedPurchaseDto {
    pub purchase_id: String,
    pub purchase_number: String,
    pub amount_allocated: i64,
    pub previous_paid: i64,
    pub new_paid: i64,
    pub total_amount: i64,
    pub payment_status: String,
}

/// Result returned after atomically recording a supplier payment
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SupplierPaymentResultDto {
    pub payment_id: String,
    pub receipt_number: String,
    pub supplier_id: String,
    pub amount_paid: i64,
    pub previous_balance: i64,
    pub new_balance: i64,
    pub allocated_purchases: Vec<AllocatedPurchaseDto>,
}
