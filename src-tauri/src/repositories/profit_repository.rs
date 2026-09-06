use std::collections::HashMap;
use rusqlite::Connection;

use crate::db::connection::DatabaseConnection;
use crate::domain::profit::{
    calculate_gross_margin, DailyProfitabilityDto, DashboardProfitSummaryDto, PeriodProfitabilityDto,
    ProductProfitabilityDto, ProfitMetricsDto, SaleProfitabilityDto,
};
use crate::errors::{AppError, AppResult};

/// Helper to normalize start/end date filters for SQLite ISO-8601 string comparisons
fn normalize_date_range(
    start: Option<&str>,
    end: Option<&str>,
) -> (Option<String>, Option<String>) {
    let start_norm = start.map(|s| {
        let trimmed = s.trim();
        if trimmed.len() == 10 {
            format!("{}T00:00:00Z", trimmed)
        } else {
            trimmed.to_string()
        }
    });

    let end_norm = end.map(|e| {
        let trimmed = e.trim();
        if trimmed.len() == 10 {
            format!("{}T23:59:59.999Z", trimmed)
        } else {
            trimmed.to_string()
        }
    });

    (start_norm, end_norm)
}

#[derive(Clone)]
pub struct SQLiteProfitRepository {
    db: DatabaseConnection,
}

impl SQLiteProfitRepository {
    pub fn new(db: DatabaseConnection) -> Self {
        Self { db }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Period Profitability
    // ──────────────────────────────────────────────────────────────────────────

    pub async fn get_period_profitability(
        &self,
        start_date: Option<&str>,
        end_date: Option<&str>,
        branch_id: Option<&str>,
    ) -> AppResult<PeriodProfitabilityDto> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        Self::get_period_profitability_in_conn(&guard, start_date, end_date, branch_id)
    }

    pub fn get_period_profitability_in_conn(
        conn: &Connection,
        start_date: Option<&str>,
        end_date: Option<&str>,
        branch_id: Option<&str>,
    ) -> AppResult<PeriodProfitabilityDto> {
        let (s_date, e_date) = normalize_date_range(start_date, end_date);

        // 1. Query Completed Sales aggregations
        let (sales_count, gross_sales, total_discounts, total_sale_amount, sales_cogs): (
            i64,
            i64,
            i64,
            i64,
            i64,
        ) = {
            let sql = "
                SELECT
                    COUNT(DISTINCT s.id) as sales_count,
                    COALESCE(SUM(sl.quantity * sl.unit_price), 0) as gross_sales,
                    COALESCE(SUM(sl.discount), 0) + COALESCE((SELECT SUM(s2.discount) FROM sales s2 WHERE s2.sale_status = 'COMPLETED' AND (?1 IS NULL OR s2.created_at >= ?1) AND (?2 IS NULL OR s2.created_at <= ?2) AND (?3 IS NULL OR s2.branch_id = ?3)), 0) as total_discounts,
                    COALESCE((SELECT SUM(s3.total_amount) FROM sales s3 WHERE s3.sale_status = 'COMPLETED' AND (?1 IS NULL OR s3.created_at >= ?1) AND (?2 IS NULL OR s3.created_at <= ?2) AND (?3 IS NULL OR s3.branch_id = ?3)), 0) as total_sale_amount,
                    COALESCE(SUM(sl.quantity * sl.cost_price_snapshot), 0) as sales_cogs
                FROM sales s
                LEFT JOIN sale_lines sl ON s.id = sl.sale_id
                WHERE s.sale_status = 'COMPLETED'
                  AND (?1 IS NULL OR s.created_at >= ?1)
                  AND (?2 IS NULL OR s.created_at <= ?2)
                  AND (?3 IS NULL OR s.branch_id = ?3)
            ";

            conn.query_row(
                sql,
                rusqlite::params![s_date, e_date, branch_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
            )
            .map_err(|e| AppError::Database(format!("Failed to query period sales: {e}")))?
        };

        // 2. Query Completed Sales Returns aggregations
        let (returns_count, returned_revenue, returned_cogs): (i64, i64, i64) = {
            let sql = "
                SELECT
                    COUNT(DISTINCT sr.id) as returns_count,
                    COALESCE((SELECT SUM(sr2.total_amount) FROM sales_returns sr2 WHERE sr2.status = 'COMPLETED' AND (?1 IS NULL OR sr2.created_at >= ?1) AND (?2 IS NULL OR sr2.created_at <= ?2) AND (?3 IS NULL OR sr2.branch_id = ?3)), 0) as returned_revenue,
                    COALESCE(SUM(srl.quantity * sl.cost_price_snapshot), 0) as returned_cogs
                FROM sales_returns sr
                LEFT JOIN sales_return_lines srl ON sr.id = srl.return_id
                LEFT JOIN sale_lines sl ON srl.sale_line_id = sl.id
                WHERE sr.status = 'COMPLETED'
                  AND (?1 IS NULL OR sr.created_at >= ?1)
                  AND (?2 IS NULL OR sr.created_at <= ?2)
                  AND (?3 IS NULL OR sr.branch_id = ?3)
            ";

            conn.query_row(
                sql,
                rusqlite::params![s_date, e_date, branch_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .map_err(|e| AppError::Database(format!("Failed to query period returns: {e}")))?
        };

        let net_revenue = total_sale_amount.saturating_sub(returned_revenue);
        let cogs = sales_cogs.saturating_sub(returned_cogs);
        let gross_profit = net_revenue - cogs;
        let gross_margin = calculate_gross_margin(gross_profit, net_revenue);

        Ok(PeriodProfitabilityDto {
            start_date: start_date.map(|s| s.to_string()),
            end_date: end_date.map(|s| s.to_string()),
            gross_revenue: gross_sales,
            discounts: total_discounts,
            net_revenue,
            cogs,
            gross_profit,
            gross_margin,
            sales_count,
            returns_count,
        })
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Daily Profitability Breakdown
    // ──────────────────────────────────────────────────────────────────────────

    pub async fn get_daily_profitability(
        &self,
        start_date: Option<&str>,
        end_date: Option<&str>,
        branch_id: Option<&str>,
    ) -> AppResult<Vec<DailyProfitabilityDto>> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        let (s_date, e_date) = normalize_date_range(start_date, end_date);

        // Map date string (YYYY-MM-DD) -> accumulator
        #[derive(Default)]
        struct DailyAccumulator {
            gross_sales: i64,
            discounts: i64,
            sales_net: i64,
            sales_cogs: i64,
            returned_rev: i64,
            returned_cogs: i64,
        }

        let mut map: HashMap<String, DailyAccumulator> = HashMap::new();

        // 1. Group sales by YYYY-MM-DD
        {
            let sql = "
                SELECT
                    substr(s.created_at, 1, 10) as sale_day,
                    COALESCE(SUM(sl.quantity * sl.unit_price), 0) as gross,
                    COALESCE(SUM(sl.discount), 0) as line_disc,
                    COALESCE(SUM(sl.quantity * sl.cost_price_snapshot), 0) as cogs
                FROM sales s
                JOIN sale_lines sl ON s.id = sl.sale_id
                WHERE s.sale_status = 'COMPLETED'
                  AND (?1 IS NULL OR s.created_at >= ?1)
                  AND (?2 IS NULL OR s.created_at <= ?2)
                  AND (?3 IS NULL OR s.branch_id = ?3)
                GROUP BY sale_day
            ";

            let mut stmt = guard
                .prepare(sql)
                .map_err(|e| AppError::Database(format!("Failed to prepare daily sales lines: {e}")))?;

            let rows = stmt
                .query_map(rusqlite::params![s_date, e_date, branch_id], |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, i64>(1)?,
                        row.get::<_, i64>(2)?,
                        row.get::<_, i64>(3)?,
                    ))
                })
                .map_err(|e| AppError::Database(format!("Failed to query daily sales lines: {e}")))?;

            for r in rows {
                let (day, gross, disc, cogs) = r.map_err(|e| AppError::Database(e.to_string()))?;
                let acc = map.entry(day).or_default();
                acc.gross_sales += gross;
                acc.discounts += disc;
                acc.sales_cogs += cogs;
            }
        }

        // Add sale header totals (including invoice discounts) by day
        {
            let sql = "
                SELECT
                    substr(s.created_at, 1, 10) as sale_day,
                    COALESCE(SUM(s.discount), 0) as inv_disc,
                    COALESCE(SUM(s.total_amount), 0) as net_amount
                FROM sales s
                WHERE s.sale_status = 'COMPLETED'
                  AND (?1 IS NULL OR s.created_at >= ?1)
                  AND (?2 IS NULL OR s.created_at <= ?2)
                  AND (?3 IS NULL OR s.branch_id = ?3)
                GROUP BY sale_day
            ";

            let mut stmt = guard
                .prepare(sql)
                .map_err(|e| AppError::Database(format!("Failed to prepare daily sales headers: {e}")))?;

            let rows = stmt
                .query_map(rusqlite::params![s_date, e_date, branch_id], |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, i64>(1)?,
                        row.get::<_, i64>(2)?,
                    ))
                })
                .map_err(|e| AppError::Database(format!("Failed to query daily sales headers: {e}")))?;

            for r in rows {
                let (day, inv_disc, net_amount) = r.map_err(|e| AppError::Database(e.to_string()))?;
                let acc = map.entry(day).or_default();
                acc.discounts += inv_disc;
                acc.sales_net += net_amount;
            }
        }

        // 2. Group returns by YYYY-MM-DD
        {
            let sql = "
                SELECT
                    substr(sr.created_at, 1, 10) as return_day,
                    COALESCE(SUM(srl.quantity * sl.cost_price_snapshot), 0) as ret_cogs
                FROM sales_returns sr
                JOIN sales_return_lines srl ON sr.id = srl.return_id
                JOIN sale_lines sl ON srl.sale_line_id = sl.id
                WHERE sr.status = 'COMPLETED'
                  AND (?1 IS NULL OR sr.created_at >= ?1)
                  AND (?2 IS NULL OR sr.created_at <= ?2)
                  AND (?3 IS NULL OR sr.branch_id = ?3)
                GROUP BY return_day
            ";

            let mut stmt = guard
                .prepare(sql)
                .map_err(|e| AppError::Database(format!("Failed to prepare daily return lines: {e}")))?;

            let rows = stmt
                .query_map(rusqlite::params![s_date, e_date, branch_id], |row| {
                    Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
                })
                .map_err(|e| AppError::Database(format!("Failed to query daily return lines: {e}")))?;

            for r in rows {
                let (day, ret_cogs) = r.map_err(|e| AppError::Database(e.to_string()))?;
                let acc = map.entry(day).or_default();
                acc.returned_cogs += ret_cogs;
            }
        }

        // Add return header totals by day
        {
            let sql = "
                SELECT
                    substr(sr.created_at, 1, 10) as return_day,
                    COALESCE(SUM(sr.total_amount), 0) as ret_amount
                FROM sales_returns sr
                WHERE sr.status = 'COMPLETED'
                  AND (?1 IS NULL OR sr.created_at >= ?1)
                  AND (?2 IS NULL OR sr.created_at <= ?2)
                  AND (?3 IS NULL OR sr.branch_id = ?3)
                GROUP BY return_day
            ";

            let mut stmt = guard
                .prepare(sql)
                .map_err(|e| AppError::Database(format!("Failed to prepare daily return headers: {e}")))?;

            let rows = stmt
                .query_map(rusqlite::params![s_date, e_date, branch_id], |row| {
                    Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
                })
                .map_err(|e| AppError::Database(format!("Failed to query daily return headers: {e}")))?;

            for r in rows {
                let (day, ret_amount) = r.map_err(|e| AppError::Database(e.to_string()))?;
                let acc = map.entry(day).or_default();
                acc.returned_rev += ret_amount;
            }
        }

        // Compile and sort descending by date
        let mut results: Vec<DailyProfitabilityDto> = map
            .into_iter()
            .map(|(date, acc)| {
                let net_revenue = acc.sales_net.saturating_sub(acc.returned_rev);
                let cogs = acc.sales_cogs.saturating_sub(acc.returned_cogs);
                let gross_profit = net_revenue - cogs;
                let gross_margin = calculate_gross_margin(gross_profit, net_revenue);

                DailyProfitabilityDto {
                    date,
                    gross_revenue: acc.gross_sales,
                    discounts: acc.discounts,
                    net_revenue,
                    cogs,
                    gross_profit,
                    gross_margin,
                }
            })
            .collect();

        results.sort_by(|a, b| b.date.cmp(&a.date));
        Ok(results)
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Product-Level Profitability
    // ──────────────────────────────────────────────────────────────────────────

    pub async fn get_product_profitability(
        &self,
        product_id: Option<&str>,
        start_date: Option<&str>,
        end_date: Option<&str>,
        branch_id: Option<&str>,
    ) -> AppResult<Vec<ProductProfitabilityDto>> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        let (s_date, e_date) = normalize_date_range(start_date, end_date);

        #[derive(Default)]
        struct ProductAccumulator {
            product_name: String,
            sku: String,
            qty_sold: i64,
            gross_revenue: i64,
            discounts: i64,
            sales_net: i64,
            sales_cogs: i64,
            qty_returned: i64,
            returned_rev: i64,
            returned_cogs: i64,
        }

        let mut map: HashMap<String, ProductAccumulator> = HashMap::new();

        // 1. Sales by Product
        {
            let sql = "
                SELECT
                    p.id,
                    p.name,
                    p.sku,
                    COALESCE(SUM(sl.quantity), 0) as qty,
                    COALESCE(SUM(sl.quantity * sl.unit_price), 0) as gross,
                    COALESCE(SUM(sl.discount), 0) as disc,
                    COALESCE(SUM(sl.line_total), 0) as net_line,
                    COALESCE(SUM(sl.quantity * sl.cost_price_snapshot), 0) as cogs
                FROM products p
                JOIN sale_lines sl ON p.id = sl.product_id
                JOIN sales s ON sl.sale_id = s.id
                WHERE s.sale_status = 'COMPLETED'
                  AND (?1 IS NULL OR p.id = ?1)
                  AND (?2 IS NULL OR s.created_at >= ?2)
                  AND (?3 IS NULL OR s.created_at <= ?3)
                  AND (?4 IS NULL OR s.branch_id = ?4)
                GROUP BY p.id
            ";

            let mut stmt = guard
                .prepare(sql)
                .map_err(|e| AppError::Database(format!("Failed to prepare product sales query: {e}")))?;

            let rows = stmt
                .query_map(
                    rusqlite::params![product_id, s_date, e_date, branch_id],
                    |row| {
                        Ok((
                            row.get::<_, String>(0)?,
                            row.get::<_, String>(1)?,
                            row.get::<_, String>(2)?,
                            row.get::<_, i64>(3)?,
                            row.get::<_, i64>(4)?,
                            row.get::<_, i64>(5)?,
                            row.get::<_, i64>(6)?,
                            row.get::<_, i64>(7)?,
                        ))
                    },
                )
                .map_err(|e| AppError::Database(format!("Failed to query product sales: {e}")))?;

            for r in rows {
                let (pid, name, sku, qty, gross, disc, net, cogs) =
                    r.map_err(|e| AppError::Database(e.to_string()))?;
                let acc = map.entry(pid).or_default();
                acc.product_name = name;
                acc.sku = sku;
                acc.qty_sold += qty;
                acc.gross_revenue += gross;
                acc.discounts += disc;
                acc.sales_net += net;
                acc.sales_cogs += cogs;
            }
        }

        // 2. Returns by Product
        {
            let sql = "
                SELECT
                    p.id,
                    p.name,
                    p.sku,
                    COALESCE(SUM(srl.quantity), 0) as qty_ret,
                    COALESCE(SUM(srl.return_amount), 0) as ret_rev,
                    COALESCE(SUM(srl.quantity * sl.cost_price_snapshot), 0) as ret_cogs
                FROM products p
                JOIN sales_return_lines srl ON p.id = srl.product_id
                JOIN sales_returns sr ON srl.return_id = sr.id
                JOIN sale_lines sl ON srl.sale_line_id = sl.id
                WHERE sr.status = 'COMPLETED'
                  AND (?1 IS NULL OR p.id = ?1)
                  AND (?2 IS NULL OR sr.created_at >= ?2)
                  AND (?3 IS NULL OR sr.created_at <= ?3)
                  AND (?4 IS NULL OR sr.branch_id = ?4)
                GROUP BY p.id
            ";

            let mut stmt = guard
                .prepare(sql)
                .map_err(|e| AppError::Database(format!("Failed to prepare product returns query: {e}")))?;

            let rows = stmt
                .query_map(
                    rusqlite::params![product_id, s_date, e_date, branch_id],
                    |row| {
                        Ok((
                            row.get::<_, String>(0)?,
                            row.get::<_, String>(1)?,
                            row.get::<_, String>(2)?,
                            row.get::<_, i64>(3)?,
                            row.get::<_, i64>(4)?,
                            row.get::<_, i64>(5)?,
                        ))
                    },
                )
                .map_err(|e| AppError::Database(format!("Failed to query product returns: {e}")))?;

            for r in rows {
                let (pid, name, sku, qty_ret, ret_rev, ret_cogs) =
                    r.map_err(|e| AppError::Database(e.to_string()))?;
                let acc = map.entry(pid).or_default();
                if acc.product_name.is_empty() {
                    acc.product_name = name;
                    acc.sku = sku;
                }
                acc.qty_returned += qty_ret;
                acc.returned_rev += ret_rev;
                acc.returned_cogs += ret_cogs;
            }
        }

        // If product_id was specified but no sales/returns exist, query product catalog info
        if map.is_empty() {
            if let Some(pid) = product_id {
                let prod_info: Result<(String, String), _> = guard.query_row(
                    "SELECT name, sku FROM products WHERE id = ?1",
                    [pid],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                );

                if let Ok((name, sku)) = prod_info {
                    return Ok(vec![ProductProfitabilityDto {
                        product_id: pid.to_string(),
                        product_name: name,
                        sku,
                        quantity_sold: 0,
                        quantity_returned: 0,
                        net_quantity: 0,
                        gross_revenue: 0,
                        discounts: 0,
                        net_revenue: 0,
                        cogs: 0,
                        gross_profit: 0,
                        gross_margin: 0,
                    }]);
                }
            }
        }

        let mut list: Vec<ProductProfitabilityDto> = map
            .into_iter()
            .map(|(pid, acc)| {
                let net_quantity = acc.qty_sold.saturating_sub(acc.qty_returned);
                let net_revenue = acc.sales_net.saturating_sub(acc.returned_rev);
                let cogs = acc.sales_cogs.saturating_sub(acc.returned_cogs);
                let gross_profit = net_revenue - cogs;
                let gross_margin = calculate_gross_margin(gross_profit, net_revenue);

                ProductProfitabilityDto {
                    product_id: pid,
                    product_name: acc.product_name,
                    sku: acc.sku,
                    quantity_sold: acc.qty_sold,
                    quantity_returned: acc.qty_returned,
                    net_quantity,
                    gross_revenue: acc.gross_revenue,
                    discounts: acc.discounts,
                    net_revenue,
                    cogs,
                    gross_profit,
                    gross_margin,
                }
            })
            .collect();

        list.sort_by(|a, b| b.net_revenue.cmp(&a.net_revenue));
        Ok(list)
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Single Sale Profitability
    // ──────────────────────────────────────────────────────────────────────────

    pub async fn get_sale_profitability(&self, sale_id: &str) -> AppResult<Option<SaleProfitabilityDto>> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        // 1. Fetch sale header
        let sale_opt: Option<(String, String, i64, i64, String)> = guard
            .query_row(
                "SELECT id, invoice_number, discount, total_amount, sale_status FROM sales WHERE id = ?1",
                [sale_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
            )
            .ok();

        let (id, invoice_number, invoice_disc, total_amount, sale_status) = match sale_opt {
            Some(s) => s,
            None => return Ok(None),
        };

        // If sale was voided/cancelled, return None or 0 profitability
        if sale_status != "COMPLETED" {
            return Ok(Some(SaleProfitabilityDto {
                sale_id: id,
                invoice_number,
                gross_revenue: 0,
                discounts: 0,
                net_revenue: 0,
                cogs: 0,
                gross_profit: 0,
                gross_margin: 0,
            }));
        }

        // 2. Query lines for this sale
        let (gross_sales, line_discounts, sales_cogs): (i64, i64, i64) = guard
            .query_row(
                "SELECT
                    COALESCE(SUM(quantity * unit_price), 0),
                    COALESCE(SUM(discount), 0),
                    COALESCE(SUM(quantity * cost_price_snapshot), 0)
                 FROM sale_lines
                 WHERE sale_id = ?1",
                [sale_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap_or((0, 0, 0));

        // 3. Query returns against this sale
        let (returned_revenue, returned_cogs): (i64, i64) = guard
            .query_row(
                "SELECT
                    COALESCE((SELECT SUM(sr.total_amount) FROM sales_returns sr WHERE sr.sale_id = ?1 AND sr.status = 'COMPLETED'), 0),
                    COALESCE(SUM(srl.quantity * sl.cost_price_snapshot), 0)
                 FROM sales_returns sr
                 JOIN sales_return_lines srl ON sr.id = srl.return_id
                 JOIN sale_lines sl ON srl.sale_line_id = sl.id
                 WHERE sr.sale_id = ?1 AND sr.status = 'COMPLETED'",
                [sale_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap_or((0, 0));

        let total_discounts = line_discounts + invoice_disc;
        let net_revenue = total_amount.saturating_sub(returned_revenue);
        let cogs = sales_cogs.saturating_sub(returned_cogs);
        let gross_profit = net_revenue - cogs;
        let gross_margin = calculate_gross_margin(gross_profit, net_revenue);

        Ok(Some(SaleProfitabilityDto {
            sale_id: id,
            invoice_number,
            gross_revenue: gross_sales,
            discounts: total_discounts,
            net_revenue,
            cogs,
            gross_profit,
            gross_margin,
        }))
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Dashboard Profit Summary
    // ──────────────────────────────────────────────────────────────────────────

    pub async fn get_dashboard_profit_summary(
        &self,
        branch_id: Option<&str>,
    ) -> AppResult<DashboardProfitSummaryDto> {
        let conn_arc = self.db.inner();
        let guard = conn_arc.lock().await;

        let now_utc = chrono::Utc::now();
        let today_str = now_utc.format("%Y-%m-%d").to_string();
        let today_start = format!("{}T00:00:00Z", today_str);

        let this_month_start = format!("{}-{:02}-01T00:00:00Z", now_utc.year(), now_utc.month());

        // 1. Today
        let today_period = Self::get_period_profitability_in_conn(
            &guard,
            Some(&today_start),
            None,
            branch_id,
        )?;

        // 2. This Month
        let month_period = Self::get_period_profitability_in_conn(
            &guard,
            Some(&this_month_start),
            None,
            branch_id,
        )?;

        // 3. Total
        let total_period = Self::get_period_profitability_in_conn(&guard, None, None, branch_id)?;

        Ok(DashboardProfitSummaryDto {
            today: ProfitMetricsDto {
                gross_revenue: today_period.gross_revenue,
                discounts: today_period.discounts,
                net_revenue: today_period.net_revenue,
                cogs: today_period.cogs,
                gross_profit: today_period.gross_profit,
                gross_margin: today_period.gross_margin,
                orders_count: today_period.sales_count,
            },
            this_month: ProfitMetricsDto {
                gross_revenue: month_period.gross_revenue,
                discounts: month_period.discounts,
                net_revenue: month_period.net_revenue,
                cogs: month_period.cogs,
                gross_profit: month_period.gross_profit,
                gross_margin: month_period.gross_margin,
                orders_count: month_period.sales_count,
            },
            total: ProfitMetricsDto {
                gross_revenue: total_period.gross_revenue,
                discounts: total_period.discounts,
                net_revenue: total_period.net_revenue,
                cogs: total_period.cogs,
                gross_profit: total_period.gross_profit,
                gross_margin: total_period.gross_margin,
                orders_count: total_period.sales_count,
            },
        })
    }
}

// Add Datelike trait for Utc::now() year/month access
use chrono::Datelike;
