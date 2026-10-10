/**
 * Repair API — P6: Replaces 100% mocked implementation with real HTTP calls
 * to the TypeScript backend at /api/repairs.
 *
 * All endpoints require a valid JWT (Authorization: Bearer ...).
 * Write operations (create, update status, add parts, add payments) are admin-only.
 */

import { httpClient } from '@/lib/http/httpClient';
import { RepairJob } from '../types/repair.types';

export interface RepairJobListResult {
  data: RepairJob[];
  total: number;
  page: number;
  limit: number;
}

export interface RepairJobFilters {
  status?: string;
  branch_id?: string;
  customer_id?: string;
  technician_id?: string;
  page?: number;
  limit?: number;
}

export interface CreateRepairJobPayload {
  customer_id?: string | null;
  customer_name: string;
  customer_phone?: string | null;
  device: {
    type?: string;
    brand?: string;
    model: string;
    color?: string;
    imei?: string;
    password?: string;
  };
  accessories?: {
    charger?: boolean;
    battery?: boolean;
    sim?: boolean;
    memoryCard?: boolean;
    cover?: boolean;
    box?: boolean;
    other?: string;
  };
  problem_description: string;
  initial_inspection?: string[];
  technician_id?: string | null;
  priority?: 'Low' | 'Normal' | 'High' | 'Urgent';
  estimated_cost?: number;
  expected_delivery_date?: string | null;
  internal_notes?: string | null;
  customer_notes?: string | null;
  branch_id?: string | null;
}

function buildQueryString(filters: RepairJobFilters): string {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.branch_id) params.set('branch_id', filters.branch_id);
  if (filters.customer_id) params.set('customer_id', filters.customer_id);
  if (filters.technician_id) params.set('technician_id', filters.technician_id);
  if (filters.page) params.set('page', String(filters.page));
  if (filters.limit) params.set('limit', String(filters.limit));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export const repairApi = {
  /**
   * List repair jobs with optional filters.
   * Non-admins automatically receive only their branch's jobs (enforced server-side).
   */
  getRepairJobs: async (filters: RepairJobFilters = {}): Promise<RepairJobListResult> => {
    const qs = buildQueryString(filters);
    return httpClient.get<RepairJobListResult>(`/api/repairs${qs}`);
  },

  /**
   * Get a single repair job by UUID or human-readable job_id (e.g. "REP-0001").
   */
  getRepairJobById: async (id: string): Promise<RepairJob> => {
    return httpClient.get<RepairJob>(`/api/repairs/${encodeURIComponent(id)}`);
  },

  /**
   * Create a new repair job. Admin-only.
   */
  createRepairJob: async (jobData: CreateRepairJobPayload): Promise<RepairJob> => {
    return httpClient.post<RepairJob>('/api/repairs', jobData);
  },

  /**
   * Update the status of a repair job. Admin-only.
   * Appends a timeline event with the new status and optional note.
   */
  updateStatus: async (id: string, status: string, note?: string): Promise<RepairJob> => {
    return httpClient.put<RepairJob>(`/api/repairs/${encodeURIComponent(id)}/status`, {
      status,
      note: note ?? null,
    });
  },

  /**
   * Add a part consumed in the repair. Admin-only.
   * If product_id is supplied, it links to the products catalog for stock visibility.
   */
  addPart: async (
    id: string,
    partData: { productId?: string; productName: string; productSku?: string; qty: number; cost: number; price: number }
  ): Promise<RepairJob> => {
    return httpClient.post<RepairJob>(`/api/repairs/${encodeURIComponent(id)}/parts`, {
      product_id: partData.productId ?? null,
      product_name: partData.productName,
      product_sku: partData.productSku ?? '',
      qty: partData.qty,
      cost: partData.cost,
      price: partData.price,
    });
  },

  /**
   * Record a payment against a repair job. Admin-only.
   */
  addPayment: async (
    id: string,
    paymentData: { amount: number; method: string; reference?: string }
  ): Promise<RepairJob> => {
    return httpClient.post<RepairJob>(`/api/repairs/${encodeURIComponent(id)}/payments`, {
      amount: paymentData.amount,
      method: paymentData.method,
      reference: paymentData.reference ?? null,
    });
  },
};
