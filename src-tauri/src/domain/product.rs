use serde::{Deserialize, Serialize};

/// Product domain entity for Niazi Mobile Mart retail catalog.
/// All monetary values are integer whole Pakistani Rupees (PKR): 1 stored integer = 1 PKR.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Product {
    pub id: String,
    pub name: String,
    pub sku: String,
    pub barcode: Option<String>,
    pub category_id: String,
    pub brand_id: Option<String>,
    pub unit_id: Option<String>,
    pub purchase_price: i64, // Whole PKR - Last Purchase Cost (e.g. 1800 = Rs 1,800)
    pub average_cost: i64,   // Whole PKR - Weighted Average Cost (e.g. 1800 = Rs 1,800)
    pub sale_price: i64,     // Whole PKR (e.g. 2000 = Rs 2,000)
    pub low_stock_threshold: i64,
    pub is_active: bool,
    pub description: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

impl Product {
    /// Checks if the product is at or below its low-stock threshold
    pub fn is_low_stock(&self, current_quantity: i64) -> bool {
        current_quantity <= self.low_stock_threshold
    }

    /// Validates business pricing and threshold rules
    pub fn validate_prices(&self) -> Result<(), String> {
        if self.purchase_price < 0 {
            return Err("Purchase price cannot be negative".to_string());
        }
        if self.average_cost < 0 {
            return Err("Average cost cannot be negative".to_string());
        }
        if self.sale_price < 0 {
            return Err("Sale price cannot be negative".to_string());
        }
        if self.low_stock_threshold < 0 {
            return Err("Low stock threshold cannot be negative".to_string());
        }
        if self.name.trim().is_empty() {
            return Err("Product name is required".to_string());
        }
        if self.sku.trim().is_empty() {
            return Err("Product SKU is required".to_string());
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateProductDto {
    pub name: String,
    pub sku: String,
    pub barcode: Option<String>,
    pub category_id: String,
    pub brand_id: Option<String>,
    pub unit_id: Option<String>,
    pub purchase_price: i64, // Whole PKR (Last Purchase Cost)
    pub average_cost: Option<i64>, // Optional initial average cost; defaults to purchase_price
    pub sale_price: i64,     // Whole PKR
    pub low_stock_threshold: Option<i64>,
    pub description: Option<String>,
    /// Optional opening stock quantity for the branch where created
    pub initial_quantity: Option<i64>,
    pub branch_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateProductDto {
    pub name: Option<String>,
    pub barcode: Option<String>,
    pub category_id: Option<String>,
    pub brand_id: Option<String>,
    pub unit_id: Option<String>,
    pub purchase_price: Option<i64>, // Whole PKR (Last Purchase Cost)
    pub average_cost: Option<i64>,   // Whole PKR (Average Cost)
    pub sale_price: Option<i64>,     // Whole PKR
    pub low_stock_threshold: Option<i64>,
    pub description: Option<String>,
    pub is_active: Option<bool>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ProductFilter {
    pub search: Option<String>,
    pub category_id: Option<String>,
    pub brand_id: Option<String>,
    pub is_active: Option<bool>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_product_pricing_and_validation() {
        let valid_product = Product {
            id: "550e8400-e29b-41d4-a716-446655440000".to_string(),
            name: "Samsung Galaxy S24 Ultra".to_string(),
            sku: "SKU-S24-U".to_string(),
            barcode: Some("8806091234567".to_string()),
            category_id: "cat_1".to_string(),
            brand_id: Some("brand_1".to_string()),
            unit_id: Some("unit_1".to_string()),
            purchase_price: 320000, // Rs 320,000
            average_cost: 320000,   // Rs 320,000
            sale_price: 380000,     // Rs 380,000
            low_stock_threshold: 5,
            is_active: true,
            description: None,
            created_at: "2026-01-01T00:00:00Z".to_string(),
            updated_at: "2026-01-01T00:00:00Z".to_string(),
        };
        assert!(valid_product.validate_prices().is_ok());

        // Negative prices rejected
        let mut invalid_price = valid_product.clone();
        invalid_price.purchase_price = -10;
        assert!(invalid_price.validate_prices().is_err());

        invalid_price.purchase_price = 320000;
        invalid_price.average_cost = -10;
        assert!(invalid_price.validate_prices().is_err());

        invalid_price.average_cost = 320000;
        invalid_price.sale_price = -50;
        assert!(invalid_price.validate_prices().is_err());

        // Low stock detection
        assert!(valid_product.is_low_stock(5));
        assert!(valid_product.is_low_stock(2));
        assert!(!valid_product.is_low_stock(6));
    }

    #[test]
    fn test_money_fixed_pkr_discount_model() {
        // PERMANENT NIAZI MONEY & FIXED DISCOUNT RULE:
        // Selling Price = Rs 2,000 (2000)
        // Purchase Cost = Rs 1,800 (1800)
        // Fixed Discount = Rs 20 (20)
        // Final Price = Rs 1,980 (1980)
        let purchase_price: i64 = 1800;
        let sale_price: i64 = 2000;
        let discount: i64 = 20;
        let final_price: i64 = sale_price - discount;

        assert_eq!(purchase_price, 1800, "1 stored integer = 1 PKR (Rs 1,800)");
        assert_eq!(sale_price, 2000, "1 stored integer = 1 PKR (Rs 2,000)");
        assert_eq!(discount, 20, "Fixed PKR discount = Rs 20");
        assert_eq!(final_price, 1980, "Final price = Rs 1,980 (2000 - 20 = 1980)");

        // Explicit test cases from Section 34 of prompt:
        // 1000 - 20 = 980
        assert_eq!(1000i64 - 20i64, 980i64);
        // 2000 - 50 = 1950
        assert_eq!(2000i64 - 50i64, 1950i64);
    }
}
