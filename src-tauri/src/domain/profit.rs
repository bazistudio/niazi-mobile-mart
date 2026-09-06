use serde::{Deserialize, Serialize};

/// Authoritative summary metrics for a given period or filter
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct ProfitMetricsDto {
    pub gross_revenue: i64,
    pub discounts: i64,
    pub net_revenue: i64,
    pub cogs: i64,
    pub gross_profit: i64,
    pub gross_margin: i64, // Whole PKR integer percentage (e.g. 30 for 30%)
    pub orders_count: i64,
}

/// Period-level profitability report DTO
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PeriodProfitabilityDto {
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub gross_revenue: i64,
    pub discounts: i64,
    pub net_revenue: i64,
    pub cogs: i64,
    pub gross_profit: i64,
    pub gross_margin: i64, // Whole PKR integer percentage
    pub sales_count: i64,
    pub returns_count: i64,
}

/// Day-by-day profitability breakdown DTO
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DailyProfitabilityDto {
    pub date: String, // YYYY-MM-DD
    pub gross_revenue: i64,
    pub discounts: i64,
    pub net_revenue: i64,
    pub cogs: i64,
    pub gross_profit: i64,
    pub gross_margin: i64,
}

/// Product-level profitability DTO
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProductProfitabilityDto {
    pub product_id: String,
    pub product_name: String,
    pub sku: String,
    pub quantity_sold: i64,
    pub quantity_returned: i64,
    pub net_quantity: i64,
    pub gross_revenue: i64,
    pub discounts: i64,
    pub net_revenue: i64,
    pub cogs: i64,
    pub gross_profit: i64,
    pub gross_margin: i64,
}

/// Single-sale profitability DTO
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SaleProfitabilityDto {
    pub sale_id: String,
    pub invoice_number: String,
    pub gross_revenue: i64,
    pub discounts: i64,
    pub net_revenue: i64,
    pub cogs: i64,
    pub gross_profit: i64,
    pub gross_margin: i64,
}

/// Dashboard profitability KPI summary (Today, This Month, Total)
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct DashboardProfitSummaryDto {
    pub today: ProfitMetricsDto,
    pub this_month: ProfitMetricsDto,
    pub total: ProfitMetricsDto,
}

/// Helper function to calculate gross margin percentage deterministically
/// using checked integer arithmetic.
/// Margin % = (gross_profit * 100) / net_revenue
/// If net_revenue <= 0, margin is 0.
pub fn calculate_gross_margin(gross_profit: i64, net_revenue: i64) -> i64 {
    if net_revenue <= 0 {
        return 0;
    }
    // Use checked arithmetic to prevent overflow with large revenue values
    match gross_profit.checked_mul(100) {
        Some(product) => product / net_revenue,
        None => {
            // In case of extreme overflow, divide first
            (gross_profit / net_revenue).saturating_mul(100)
        }
    }
}
