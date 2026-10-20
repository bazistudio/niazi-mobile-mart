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
}

export interface MobileOrganizationSummary {
  total_devices: number;
  new_count: number;
  used_count: number;
  in_stock_count: number;
  inspection_count: number;
  sold_count: number;
  total_valuation: number;
  branches: MobileBranchSummaryItem[];
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
    voucher_no: string;
    purchase_date: string;
    purchase_price: number;
    seller_name: string;
    father_name: string;
    seller_cnic: string;
    seller_phone: string;
    seller_address: string;
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
  branchId?: string | null
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
    supplier_id: isUsed ? null : undefined,
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
      voucher_no: formData.paperwork.voucherNo.trim(),
      purchase_date: formData.paperwork.purchaseDate || new Date().toISOString().split('T')[0],
      purchase_price: effectiveCost,
      seller_name: formData.paperwork.sellerName.trim(),
      father_name: formData.paperwork.fatherName.trim(),
      seller_cnic: formData.paperwork.sellerCnic.trim(),
      seller_phone: formData.paperwork.sellerPhone.trim(),
      seller_address: formData.paperwork.sellerAddress.trim(),
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
   * Retrieve organization-wide consolidated mobile inventory summary and per-branch breakdown.
   * Accessible by Organization Administrators.
   */
  getOrganizationSummary: async (): Promise<{ summary: MobileOrganizationSummary }> => {
    return httpClient.get<{ summary: MobileOrganizationSummary }>('/api/mobiles/summary');
  },
};
