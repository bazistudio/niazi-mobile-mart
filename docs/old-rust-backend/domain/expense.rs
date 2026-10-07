use serde::{Deserialize, Serialize};

/// Master Operational Expense Category
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ExpenseCategory {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub is_active: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateExpenseCategoryDto {
    pub name: String,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateExpenseCategoryDto {
    pub name: Option<String>,
    pub description: Option<String>,
    pub is_active: Option<bool>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ExpenseStatus {
    Completed,
    Cancelled,
}

impl ExpenseStatus {
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

/// Operational Expense Header Record
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Expense {
    pub id: String,
    pub expense_number: String,
    pub category_id: String,
    pub category_name: Option<String>,
    pub branch_id: String,
    pub amount: i64, // Whole PKR rupees (1 stored integer = 1 PKR)
    pub payment_method: String,
    pub description: String,
    pub notes: Option<String>,
    pub expense_date: String,
    pub status: ExpenseStatus,
    pub performed_by: Option<String>,
    pub performed_by_name: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateExpenseDto {
    pub category_id: String,
    pub branch_id: Option<String>,
    pub amount: i64,
    pub payment_method: Option<String>, // Defaults to "CASH"
    pub description: String,
    pub notes: Option<String>,
    pub expense_date: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ExpenseFilterDto {
    pub category_id: Option<String>,
    pub branch_id: Option<String>,
    pub payment_method: Option<String>,
    pub status: Option<String>,
    pub search: Option<String>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}
