/**
 * Sales Analytics HTTP Client Service
 * Phase 2: Live backend integration.
 * All endpoints require Shop Admin or higher role.
 */

import { httpClient } from '@/lib/http/httpClient';

// ─── Filter params ─────────────────────────────────────────────────────────

export interface SaRequestFilters {
  branch_id?: string | null;
  start_date?: string | null;
  end_date?: string | null;
}

function toQuery(f: SaRequestFilters): string {
  const parts: string[] = [];
  if (f.branch_id)  parts.push(`branch_id=${encodeURIComponent(f.branch_id)}`);
  if (f.start_date) parts.push(`start_date=${encodeURIComponent(f.start_date)}`);
  if (f.end_date)   parts.push(`end_date=${encodeURIComponent(f.end_date)}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

// ─── Response types ────────────────────────────────────────────────────────

export interface SaOverview {
  gross_sales?: number;
  net_sales: number;
  total_cogs: number;
  gross_profit: number;
  gross_margin: number;
  cash_received: number;
  credit_sales: number;
  total_invoices: number;
  returns_count: number;
  returned_revenue: number;
}

export interface SaProductRow {
  product_id: string;
  product_name: string;
  sku: string;
  quantity_sold: number;
  gross_revenue: number;
  net_revenue: number;
  total_cogs: number;
  gross_profit: number;
  margin_pct: number;
  missing_cost_snapshot: boolean;
}

export interface SaRepairSummary {
  total_jobs: number;
  completed_jobs: number;
  total_billed: number;
  total_collected?: number;
  outstanding_balance?: number;
  parts_revenue: number;
  parts_cost: number;
  labour_revenue: number;
  total_profit: number;
}

export interface SaMobileSummary {
  total_devices: number;
  devices_sold: number;
  devices_in_stock: number;
  total_sale_revenue: number;
  total_cogs: number;
  gross_profit: number;
  gross_margin_pct: number;
}

export interface SaAnomaly {
  anomaly_type: 'PAYMENT_MISMATCH' | 'BELOW_COST_SALE' | 'MISSING_COST_SNAPSHOT';
  sale_id: string;
  invoice_ref: string | null;
  expected_amount: number | null;
  actual_amount: number | null;
  difference: number | null;
  created_at: string;
}

export interface SaException {
  id: string;
  category: string;
  severity: string;
  source_type: string;
  source_id: string;
  source_ref: string | null;
  rule_code: string;
  explanation: string;
  status: string;
  created_at: string;
}

export interface SaFullReport {
  overview: SaOverview;
  products: SaProductRow[];
  repair_summary: SaRepairSummary;
  mobile_summary: SaMobileSummary;
  anomalies: SaAnomaly[];
  exceptions: SaException[];
}

// ─── API client ────────────────────────────────────────────────────────────

const BASE = '/api/reports/sales-analytics';

export const salesAnalyticsApi = {
  fetchOverview(f: SaRequestFilters = {}): Promise<SaOverview> {
    return httpClient.get<SaOverview>(`${BASE}/overview${toQuery(f)}`);
  },

  fetchProducts(f: SaRequestFilters = {}): Promise<SaProductRow[]> {
    return httpClient.get<SaProductRow[]>(`${BASE}/products${toQuery(f)}`);
  },

  fetchRepairs(f: SaRequestFilters = {}): Promise<SaRepairSummary> {
    return httpClient.get<SaRepairSummary>(`${BASE}/repairs${toQuery(f)}`);
  },

  fetchMobiles(f: SaRequestFilters = {}): Promise<SaMobileSummary> {
    return httpClient.get<SaMobileSummary>(`${BASE}/mobiles${toQuery(f)}`);
  },

  fetchReconciliation(f: SaRequestFilters = {}): Promise<SaAnomaly[]> {
    return httpClient.get<SaAnomaly[]>(`${BASE}/reconciliation${toQuery(f)}`);
  },

  fetchExceptions(f: SaRequestFilters = {}): Promise<SaException[]> {
    return httpClient.get<SaException[]>(`${BASE}/exceptions${toQuery(f)}`);
  },

  fetchFullReport(f: SaRequestFilters = {}): Promise<SaFullReport> {
    return httpClient.get<SaFullReport>(`${BASE}/full-report${toQuery(f)}`);
  },

  checkConnection(): Promise<SaOverview> {
    return httpClient.get<SaOverview>(`${BASE}/overview`);
  },
};
