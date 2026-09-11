use sqlx::{PgPool, Row};

use crate::domain::profit::DashboardProfitSummaryDto;
use crate::errors::{AppError, AppResult};

#[derive(Clone)]
pub struct PostgresProfitRepository {
    pool: PgPool,
}

impl PostgresProfitRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn get_profit_summary(
        &self,
        branch_id: Option<&str>,
        start_date: Option<&str>,
        end_date: Option<&str>,
    ) -> AppResult<DashboardProfitSummaryDto> {
        let mut sale_where = String::from("WHERE sale_status = 'COMPLETED'");
        let mut exp_where = String::from("WHERE status = 'COMPLETED'");
        let mut pur_where = String::from("WHERE status = 'COMPLETED'");
        let mut sret_where = String::from("WHERE status = 'COMPLETED'");

        if let Some(bid) = branch_id {
            sale_where.push_str(&format!(" AND branch_id = '{bid}'"));
            exp_where.push_str(&format!(" AND branch_id = '{bid}'"));
            pur_where.push_str(&format!(" AND branch_id = '{bid}'"));
            sret_where.push_str(&format!(" AND branch_id = '{bid}'"));
        }

        if let Some(start) = start_date {
            sale_where.push_str(&format!(" AND created_at >= '{start}'"));
            exp_where.push_str(&format!(" AND expense_date >= '{start}'"));
            pur_where.push_str(&format!(" AND created_at >= '{start}'"));
            sret_where.push_str(&format!(" AND created_at >= '{start}'"));
        }

        if let Some(end) = end_date {
            sale_where.push_str(&format!(" AND created_at <= '{end}'"));
            exp_where.push_str(&format!(" AND expense_date <= '{end}'"));
            pur_where.push_str(&format!(" AND created_at <= '{end}'"));
            sret_where.push_str(&format!(" AND created_at <= '{end}'"));
        }

        // Gross Revenue
        let rev_row: (i64,) = sqlx::query_as(&format!("SELECT COALESCE(SUM(total_amount), 0) FROM sales {sale_where}"))
            .fetch_one(&self.pool)
            .await
            .unwrap_or((0,));
        let gross_revenue = rev_row.0;

        // COGS
        let cogs_sql = format!(
            "SELECT COALESCE(SUM(l.cost_price_snapshot * l.quantity), 0)
             FROM sale_lines l
             JOIN sales s ON l.sale_id = s.id
             {sale_where}"
        );
        let cogs_row: (i64,) = sqlx::query_as(&cogs_sql)
            .fetch_one(&self.pool)
            .await
            .unwrap_or((0,));
        let cogs = cogs_row.0;

        // Sales Returns amount
        let sret_row: (i64,) = sqlx::query_as(&format!("SELECT COALESCE(SUM(total_amount), 0) FROM sales_returns {sret_where}"))
            .fetch_one(&self.pool)
            .await
            .unwrap_or((0,));
        let returns_amount = sret_row.0;

        let net_revenue = gross_revenue.saturating_sub(returns_amount);
        let gross_profit = net_revenue.saturating_sub(cogs);

        // Operating Expenses
        let exp_row: (i64,) = sqlx::query_as(&format!("SELECT COALESCE(SUM(amount), 0) FROM expenses {exp_where}"))
            .fetch_one(&self.pool)
            .await
            .unwrap_or((0,));
        let total_expenses = exp_row.0;

        let net_profit = gross_profit.saturating_sub(total_expenses);

        let profit_margin_percent = if net_revenue > 0 {
            (net_profit as f64 / net_revenue as f64) * 100.0
        } else {
            0.0
        };

        // Purchases Amount
        let pur_row: (i64,) = sqlx::query_as(&format!("SELECT COALESCE(SUM(total_amount), 0) FROM purchases {pur_where}"))
            .fetch_one(&self.pool)
            .await
            .unwrap_or((0,));
        let total_purchases = pur_row.0;

        let sales_count: (i64,) = sqlx::query_as(&format!("SELECT COUNT(*) FROM sales {sale_where}"))
            .fetch_one(&self.pool)
            .await
            .unwrap_or((0,));

        Ok(DashboardProfitSummaryDto {
            today: crate::domain::profit::ProfitMetricsDto {
                gross_revenue,
                discounts: returns_amount,
                net_revenue,
                cogs,
                gross_profit,
                gross_margin: profit_margin_percent as i64,
                orders_count: sales_count.0,
            },
            this_month: crate::domain::profit::ProfitMetricsDto::default(),
            total: crate::domain::profit::ProfitMetricsDto::default(),
        })
    }
}
