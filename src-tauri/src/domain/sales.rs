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
    pub cogs: i64,
    pub gross_profit: i64,
    pub gross_margin: i64,
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sale_receipt_data_mapping_and_pkr_money_formatting() {
        let sale = Sale {
            id: "sale_uuid_101".to_string(),
            invoice_number: "INV-000001".to_string(),
            branch_id: "00000000-0000-0000-0000-000000000002".to_string(),
            customer_id: Some("cust_1".to_string()),
            customer_name_snapshot: Some("Tariq Mahmood".to_string()),
            subtotal: 1300,        // Rs 1,300
            discount: 50,          // Rs 50
            tax_amount: 0,
            total_amount: 1250,    // Rs 1,250
            paid_amount: 1500,     // Rs 1,500
            change_amount: 250,    // Rs 250
            payment_status: PaymentStatus::Paid,
            sale_status: SaleStatus::Completed,
            performed_by: Some("cashier_1".to_string()),
            notes: None,
            created_at: "2026-09-18T10:00:00Z".to_string(),
            updated_at: "2026-09-18T10:00:00Z".to_string(),
        };

        let line1 = SaleLine {
            id: "line_1".to_string(),
            sale_id: sale.id.clone(),
            product_id: "prod_1".to_string(),
            product_name_snapshot: "Samsung Galaxy Charger 25W".to_string(),
            sku_snapshot: "SKU-CHG-25W".to_string(),
            unit_price: 500,
            cost_price_snapshot: 350,
            quantity: 2,
            discount: 0,
            line_total: 1000,
            created_at: sale.created_at.clone(),
        };

        let line2 = SaleLine {
            id: "line_2".to_string(),
            sale_id: sale.id.clone(),
            product_id: "prod_2".to_string(),
            product_name_snapshot: "Type-C Fast Cable 1m".to_string(),
            sku_snapshot: "SKU-CBL-1M".to_string(),
            unit_price: 300,
            cost_price_snapshot: 180,
            quantity: 1,
            discount: 0,
            line_total: 300,
            created_at: sale.created_at.clone(),
        };

        let payment = SalePayment {
            id: "pay_1".to_string(),
            sale_id: sale.id.clone(),
            amount: 1500,
            payment_method: "CASH".to_string(),
            reference_number: None,
            notes: None,
            created_at: sale.created_at.clone(),
        };

        let result_dto = SaleResultDto {
            sale: sale.clone(),
            lines: vec![line1.clone(), line2.clone()],
            payments: vec![payment.clone()],
            credit_amount: 0,
            customer_balance_after: Some(0),
            cogs: 880,
            gross_profit: 370,
            gross_margin: 2960,
        };

        // 1. Invoice identity
        assert_eq!(result_dto.sale.invoice_number, "INV-000001");
        assert_eq!(result_dto.sale.customer_name_snapshot.as_deref(), Some("Tariq Mahmood"));

        // 2. Integer PKR Money Rule (1 stored integer = 1 PKR, no float decimals)
        assert_eq!(result_dto.sale.subtotal, 1300);
        assert_eq!(result_dto.sale.discount, 50);
        assert_eq!(result_dto.sale.total_amount, 1250);
        assert_eq!(result_dto.sale.paid_amount, 1500);
        assert_eq!(result_dto.sale.change_amount, 250);

        // 3. Line items correctness
        assert_eq!(result_dto.lines.len(), 2);
        assert_eq!(result_dto.lines[0].quantity, 2);
        assert_eq!(result_dto.lines[0].unit_price, 500);
        assert_eq!(result_dto.lines[0].line_total, 1000);

        assert_eq!(result_dto.lines[1].quantity, 1);
        assert_eq!(result_dto.lines[1].unit_price, 300);
        assert_eq!(result_dto.lines[1].line_total, 300);

        // 4. Subtotal validation: 1000 + 300 = 1300
        let items_sum: i64 = result_dto.lines.iter().map(|l| l.line_total).sum();
        assert_eq!(items_sum, result_dto.sale.subtotal);

        // 5. Grand total validation: 1300 - 50 = 1250
        assert_eq!(result_dto.sale.subtotal - result_dto.sale.discount, result_dto.sale.total_amount);

        // 6. Payment method and tendered
        assert_eq!(result_dto.payments[0].payment_method, "CASH");
        assert_eq!(result_dto.payments[0].amount, 1500);
        assert_eq!(result_dto.sale.paid_amount - result_dto.sale.total_amount, result_dto.sale.change_amount);
    }

    #[test]
    fn test_walk_in_customer_optional_data_safety() {
        let sale = Sale {
            id: "sale_uuid_102".to_string(),
            invoice_number: "INV-000002".to_string(),
            branch_id: "00000000-0000-0000-0000-000000000002".to_string(),
            customer_id: None,
            customer_name_snapshot: None, // Walk-in customer has no snapshot name
            subtotal: 500,
            discount: 0,
            tax_amount: 0,
            total_amount: 500,
            paid_amount: 500,
            change_amount: 0,
            payment_status: PaymentStatus::Paid,
            sale_status: SaleStatus::Completed,
            performed_by: None,
            notes: None,
            created_at: "2026-09-18T10:05:00Z".to_string(),
            updated_at: "2026-09-18T10:05:00Z".to_string(),
        };

        assert!(sale.customer_id.is_none());
        assert!(sale.customer_name_snapshot.is_none());
        assert_eq!(sale.total_amount, 500);
    }
}
