/**
 * Mobile Inventory API Service
 *
 * Connects the Mobile Inventory feature to the backend routes at /api/mobiles.
 * All endpoints authenticate via the central httpClient with JWT Bearer tokens.
 */

import { httpClient } from '@/lib/http/httpClient';
import type {
  MobileFormData,
  MobileCondition,
  PtaStatus,
  PhysicalBodyGrade,
  ScreenCondition,
  MobileInventoryItem,
} from '../types/mobile.types';

export interface MobileImeiIdentifier {
  id: string;
  imei: string;
  slot: 'IMEI1' | 'IMEI2';
}

export interface MobileDeviceRow {
  id: string;
  organization_id: string;
  branch_id: string;
  brand: string;
  model: string;
  storage: string;
  ram: string | null;
  color: string | null;
  serial_number: string | null;
  pta_status: PtaStatus;
  condition: MobileCondition;
  status: 'IN_STOCK' | 'INSPECTION' | 'SOLD';
  cost_price: string;
  expected_sale_price: string | null;
  supplier_id: string | null;
  sale_id: string | null;
  notes: string | null;
  created_by: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  imeis?: MobileImeiIdentifier[];
  branch_name?: string | null;
  branch_code?: string | null;
}

export interface MobileBranchSummaryItem {
  branch_id: string;
  branch_name: string;
  branch_code: string;
  total_devices: number;
  in_stock_count: number;
  inspection_count: number;
  sold_count: number;
  new_count: number;
  used_count: number;
  total_valuation: number;
  new_valuation: number;
  used_valuation: number;
}

export interface MobileOrganizationSummary {
  total_devices: number;
  new_count: number;
  used_count: number;
  in_stock_count: number;
  inspection_count: number;
  sold_count: number;
  total_valuation: number;
  new_valuation: number;
  used_valuation: number;
  branches: MobileBranchSummaryItem[];
}

export interface SellerSearchResult {
  seller_id?: string | null;
  seller_name: string;
  father_name: string;
  seller_cnic: string;
  seller_phone: string;
  seller_address: string;
}

// ── Phase 2: Permanent Seller Registry types ────────────────────────────────

export type SellerVerificationStatus = 'UNVERIFIED' | 'IDENTITY_RECORDED' | 'FLAGGED';

export interface SellerSummaryRow {
  id: string;
  name: string;
  cnic_masked: string | null;
  phone: string;
  city: string | null;
  verification_status: SellerVerificationStatus;
  is_active: number;
}

export interface CreateSellerPayload {
  name: string;
  father_name?: string | null;
  cnic?: string | null;
  phone: string;
  alternate_phone?: string | null;
  address: string;
  city?: string | null;
  notes?: string | null;
}

export interface BranchInvestmentSummary {
  total_investment: number;
  new_investment: number;
  used_investment: number;
  total_in_stock: number;
  new_in_stock: number;
  used_in_stock: number;
}

export interface ListMobilesResult {
  devices: MobileDeviceRow[];
  total: number;
}

export interface ImeiCheckResult {
  imei: string;
  available: boolean;
}

export interface CreateMobilePayload {
  branch_id?: string;
  brand: string;
  model: string;
  storage: string;
  ram?: string;
  color?: string;
  serial_number?: string;
  pta_status: PtaStatus;
  condition: MobileCondition;
  cost_price: number;
  expected_sale_price?: number;
  supplier_id?: string | null;
  notes?: string;
  imei1: string;
  imei2?: string;
  inspection: {
    body_grade: PhysicalBodyGrade;
    screen_condition: ScreenCondition;
    battery_health_percent?: number | null;
    touch_working?: boolean;
    battery_backup_ok?: boolean;
    front_camera_ok?: boolean;
    back_camera_ok?: boolean;
    speaker_ok?: boolean;
    microphone_ok?: boolean;
    charging_port_ok?: boolean;
    buttons_ok?: boolean;
    biometrics_ok?: boolean;
    wifi_bluetooth_ok?: boolean;
    sim_network_ok?: boolean;
    accessories_box?: boolean;
    accessories_original_charger?: boolean;
    accessories_cable?: boolean;
    accessories_handsfree?: boolean;
    defect_notes?: string | null;
  };
  paperwork?: {
    voucher_no?: string;        // Optional — backend auto-allocates when omitted
    purchase_date: string;
    purchase_price: number;
    seller_name: string;
    father_name: string;
    seller_cnic: string;
    seller_phone: string;
    seller_address: string;
    seller_id?: string | null;
    ownership_declaration_acknowledged: boolean;
    physical_affidavit_acknowledged: boolean;
  };
}

export interface ListMobilesParams {
  branch_id?: string;
  condition?: MobileCondition;
  status?: string;
  brand?: string;
  limit?: number;
  offset?: number;
}

/**
 * Transforms frontend form state into the validated backend DTO payload.
 */
export function transformFormDataToApiPayload(
  formData: MobileFormData,
  branchId?: string | null,
  supplierId?: string | null
): CreateMobilePayload {
  const isUsed = formData.condition === 'USED';
  const effectiveCost = isUsed
    ? Number(formData.paperwork.purchasePrice)
    : Number(formData.specs.costPrice);

  const payload: CreateMobilePayload = {
    branch_id: branchId || undefined,
    brand: formData.specs.brand.trim(),
    model: formData.specs.model.trim(),
    storage: formData.specs.storage.trim(),
    ram: formData.specs.ram?.trim() || undefined,
    color: formData.specs.color?.trim() || undefined,
    serial_number: formData.specs.serialNumber?.trim() || undefined,
    pta_status: formData.specs.ptaStatus,
    condition: formData.condition,
    cost_price: effectiveCost,
    expected_sale_price: formData.specs.expectedSalePrice > 0 ? Number(formData.specs.expectedSalePrice) : undefined,
    supplier_id: isUsed ? null : (supplierId || null),
    notes: formData.specs.notes?.trim() || undefined,
    imei1: formData.specs.imei1.trim(),
    imei2: formData.specs.imei2?.trim() || undefined,
    inspection: isUsed
      ? {
          body_grade: formData.inspection.bodyGrade,
          screen_condition: formData.inspection.screenCondition,
          battery_health_percent: formData.inspection.batteryHealthPercent
            ? Number(formData.inspection.batteryHealthPercent)
            : null,
          touch_working: formData.inspection.touchWorking ?? true,
          battery_backup_ok: formData.inspection.batteryBackupOk ?? true,
          front_camera_ok: formData.inspection.frontCameraOk ?? true,
          back_camera_ok: formData.inspection.backCameraOk ?? true,
          speaker_ok: formData.inspection.speakerOk ?? true,
          microphone_ok: formData.inspection.microphoneOk ?? true,
          charging_port_ok: formData.inspection.chargingPortOk ?? true,
          buttons_ok: formData.inspection.buttonsOk ?? true,
          biometrics_ok: formData.inspection.biometricsOk ?? true,
          wifi_bluetooth_ok: formData.inspection.wifiBluetoothOk ?? true,
          sim_network_ok: formData.inspection.simNetworkOk ?? true,
          accessories_box: Boolean(formData.inspection.accessories?.box),
          accessories_original_charger: Boolean(formData.inspection.accessories?.originalCharger),
          accessories_cable: Boolean(formData.inspection.accessories?.cable),
          accessories_handsfree: Boolean(formData.inspection.accessories?.handsfree),
          defect_notes: formData.inspection.defectNotes?.trim() || null,
        }
      : {
          body_grade: 'PRISTINE',
          screen_condition: 'ORIGINAL',
          battery_health_percent: 100,
          touch_working: true,
          battery_backup_ok: true,
          front_camera_ok: true,
          back_camera_ok: true,
          speaker_ok: true,
          microphone_ok: true,
          charging_port_ok: true,
          buttons_ok: true,
          biometrics_ok: true,
          wifi_bluetooth_ok: true,
          sim_network_ok: true,
          accessories_box: true,
          accessories_original_charger: true,
          accessories_cable: true,
          accessories_handsfree: false,
          defect_notes: null,
        },
  };

  if (isUsed) {
    payload.paperwork = {
      ...(formData.paperwork.voucherNo.trim() ? { voucher_no: formData.paperwork.voucherNo.trim() } : {}),
      purchase_date: formData.paperwork.purchaseDate || new Date().toISOString().split('T')[0],
      purchase_price: effectiveCost,
      seller_name: formData.paperwork.sellerName.trim(),
      father_name: formData.paperwork.fatherName.trim(),
      seller_cnic: formData.paperwork.sellerCnic.trim(),
      seller_phone: formData.paperwork.sellerPhone.trim(),
      seller_address: formData.paperwork.sellerAddress.trim(),
      seller_id: formData.paperwork.sellerId ?? null,   // Phase 2: optional registry link
      ownership_declaration_acknowledged: formData.paperwork.ownershipDeclarationAcknowledged,
      physical_affidavit_acknowledged: formData.paperwork.physicalAffidavitAcknowledged,
    };
  }

  return payload;
}

/**
 * Maps a backend MobileDeviceRow to the frontend MobileInventoryItem shape.
 */
export function mapDeviceRowToItem(row: MobileDeviceRow): MobileInventoryItem {
  const imei1 =
    row.imeis?.find((i) => i.slot === 'IMEI1')?.imei ||
    row.imeis?.[0]?.imei ||
    '';

  return {
    id: row.id,
    brand: row.brand,
    model: row.model,
    condition: row.condition,
    storage: row.storage,
    ram: row.ram || '',
    color: row.color || '',
    imei1,
    purchaseCost: parseFloat(row.cost_price) || 0,
    salePrice: parseFloat(row.expected_sale_price || '0') || 0,
    ptaStatus: row.pta_status,
    branch: row.branch_id,
    branchName: row.branch_name || undefined,
    branchCode: row.branch_code || undefined,
    status: row.status,
    createdAt: row.created_at,
  };
}


// ── Phase 3: Full Profile types ─────────────────────────────────────────────

export interface FullProfileSellerInfo {
  seller_id: string | null;
  seller_name: string;
  father_name: string;
  seller_cnic?: string;
  seller_cnic_masked: string | null;
  seller_phone: string;
  seller_address: string;
  ownership_declaration_acknowledged: boolean;
  physical_affidavit_acknowledged: boolean;
}

export interface MobileInspectionRecord {
  id: string;
  device_id: string;
  organization_id: string;
  body_grade: string;
  screen_condition: string;
  battery_health_percent: number | null;
  touch_working: boolean | null;
  battery_backup_ok: boolean | null;
  front_camera_ok: boolean | null;
  back_camera_ok: boolean | null;
  speaker_ok: boolean | null;
  microphone_ok: boolean | null;
  charging_port_ok: boolean | null;
  buttons_ok: boolean | null;
  biometrics_ok: boolean | null;
  wifi_bluetooth_ok: boolean | null;
  sim_network_ok: boolean | null;
  accessories_box: boolean | null;
  accessories_original_charger: boolean | null;
  accessories_cable: boolean | null;
  accessories_handsfree: boolean | null;
  defect_notes: string | null;
  inspected_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface MobileFullProfile {
  device: MobileDeviceRow;
  paperwork: {
    id: string;
    voucher_no: string;
    purchase_date: string;
    purchase_price: string;
    recorded_by: string;
    created_at: string;
    seller: FullProfileSellerInfo;
  } | null;
  inspection: MobileInspectionRecord | null;
  branch_name: string | null;
  branch_code: string | null;
}

export interface PatchMobilePayload {
  branch_id: string;
  status?: 'IN_STOCK' | 'INSPECTION' | 'SOLD';
  expected_sale_price?: number | null;
  pta_status?: string;
  notes?: string | null;
  // Org-Admin-only USED-device fields:
  brand?: string;
  model?: string;
  storage?: string;
  ram?: string | null;
  color?: string | null;
  serial_number?: string | null;
  purchase_date?: string;
  purchase_price?: number;
  body_grade?: string;
  screen_condition?: string;
  battery_health_percent?: number | null;
  defect_notes?: string | null;
}

export const mobileApi = {
  /**
   * Register a NEW or USED mobile device.
   */
  createMobile: async (payload: CreateMobilePayload): Promise<{ device_id: string }> => {
    return httpClient.post<{ device_id: string }>('/api/mobiles', payload);
  },

  /**
   * List mobile devices with optional filters.
   */
  getMobiles: async (params: ListMobilesParams = {}): Promise<ListMobilesResult> => {
    const searchParams = new URLSearchParams();
    if (params.branch_id) searchParams.set('branch_id', params.branch_id);
    if (params.condition) searchParams.set('condition', params.condition);
    if (params.status) searchParams.set('status', params.status);
    if (params.brand) searchParams.set('brand', params.brand);
    if (params.limit) searchParams.set('limit', String(params.limit));
    if (params.offset !== undefined) searchParams.set('offset', String(params.offset));

    const qs = searchParams.toString();
    const endpoint = qs ? `/api/mobiles?${qs}` : '/api/mobiles';
    return httpClient.get<ListMobilesResult>(endpoint);
  },

  /**
   * Probe IMEI availability before registration.
   */
  checkImeiAvailability: async (imei: string): Promise<ImeiCheckResult> => {
    return httpClient.get<ImeiCheckResult>(`/api/mobiles/imei-check?imei=${encodeURIComponent(imei)}`);
  },

  /**
   * Retrieve device details by ID.
   */
  getMobileById: async (id: string, branchId?: string): Promise<{ device: MobileDeviceRow }> => {
    const qs = branchId ? `?branch_id=${encodeURIComponent(branchId)}` : '';
    return httpClient.get<{ device: MobileDeviceRow }>(`/api/mobiles/${encodeURIComponent(id)}${qs}`);
  },

  /**
   * Retrieve used phone paperwork (with transactional audit log).
   */
  getMobilePaperwork: async (id: string, branchId?: string): Promise<{ paperwork: unknown }> => {
    const qs = branchId ? `?branch_id=${encodeURIComponent(branchId)}` : '';
    return httpClient.get<{ paperwork: unknown }>(`/api/mobiles/${encodeURIComponent(id)}/paperwork${qs}`);
  },

  /**
   * Search previously recorded used-mobile sellers by name, CNIC, or phone.
   * Results are deduplicated and limited. Empty query returns nothing.
   */
  searchSellers: async (
    q: string,
    limit: number = 10
  ): Promise<{ success: boolean; sellers: SellerSearchResult[] }> => {
    const params = new URLSearchParams({ q: q.trim(), limit: String(limit) });
    const data = await httpClient.get<{ sellers: SellerSearchResult[] }>(
      `/api/mobiles/sellers/search?${params.toString()}`
    );
    return { success: true, sellers: data.sellers ?? [] };
  },

  /**
   * Create a new seller in the permanent registry.
   * Returns a safe summary (CNIC masked). Use getSellerById for the full profile.
   */
  createSeller: async (
    payload: CreateSellerPayload
  ): Promise<{ success: boolean; seller: SellerSummaryRow; error?: string }> => {
    try {
      const data = await httpClient.post<{ seller: SellerSummaryRow }>(
        '/api/mobiles/sellers',
        payload
      );
      return { success: true, seller: data.seller };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create seller';
      return { success: false, seller: {} as SellerSummaryRow, error: msg };
    }
  },

  /**
   * Retrieve a seller profile by ID.
   * Returns full profile including full CNIC and address (authorized access).
   */
  getSellerById: async (
    sellerId: string
  ): Promise<{ success: boolean; seller?: unknown; error?: string }> => {
    try {
      const data = await httpClient.get<{ seller: unknown }>(
        `/api/mobiles/sellers/${encodeURIComponent(sellerId)}`
      );
      return { success: true, seller: data.seller };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch seller';
      return { success: false, error: msg };
    }
  },

  /**
   * Retrieve branch-scoped investment summary (IN_STOCK devices only).
   * Respects ALL/NEW/USED filter semantics via returned fields.
   */
  getBranchInvestmentSummary: async (
    branchId?: string
  ): Promise<{ summary: BranchInvestmentSummary }> => {
    const qs = branchId ? `?branch_id=${encodeURIComponent(branchId)}` : '';
    return httpClient.get<{ summary: BranchInvestmentSummary }>(
      `/api/mobiles/branch-summary${qs}`
    );
  },

  /**
   * Retrieve organization-wide consolidated mobile inventory summary and per-branch breakdown.
   * Accessible by Organization Administrators.
   */
  getOrganizationSummary: async (): Promise<{ summary: MobileOrganizationSummary }> => {
    return httpClient.get<{ summary: MobileOrganizationSummary }>('/api/mobiles/summary');
  },
  /**
   * Retrieve the complete full profile for a single device.
   * Includes device, IMEIs, paperwork, seller, and inspection.
   * Seller sensitive fields are redacted for non-Org-Admin roles by the backend.
   */
  getMobileFullProfile: async (
    deviceId: string,
    branchId?: string
  ): Promise<{ profile: MobileFullProfile }> => {
    const qs = branchId ? `?branch_id=${encodeURIComponent(branchId)}` : '';
    return httpClient.get<{ profile: MobileFullProfile }>(
      `/api/mobiles/${encodeURIComponent(deviceId)}/full-profile${qs}`
    );
  },

  /**
   * Preview the next sequential Sr No for a branch.
   * Advisory only — actual number is assigned at registration time.
   */
  getNextSrNo: async (branchId: string): Promise<{ next_sr_no: string; branch_id: string }> => {
    return httpClient.get<{ next_sr_no: string; branch_id: string }>(
      `/api/mobiles/next-sr-no?branch_id=${encodeURIComponent(branchId)}`
    );
  },

  /**
   * Patch a mobile device record.
   * Org-Admin-only fields (brand, model, etc.) are enforced server-side.
   */
  patchMobile: async (
    deviceId: string,
    payload: PatchMobilePayload
  ): Promise<{ device: MobileDeviceRow }> => {
    return httpClient.patch<{ device: MobileDeviceRow }>(
      `/api/mobiles/${encodeURIComponent(deviceId)}`,
      payload
    );
  },


};
