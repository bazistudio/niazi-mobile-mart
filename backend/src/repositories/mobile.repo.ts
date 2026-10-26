/**
 * Mobile Inventory Repository — Phase C
 *
 * Implements all Phase C repository operations:
 *   - registerMobileDeviceTx  — atomic NEW/USED registration transaction
 *   - listMobileDevices       — branch-scoped paginated list
 *   - getMobileDevice         — single device detail (no sensitive paperwork)
 *   - getMobilePaperwork      — fail-closed transactional paperwork audit
 *   - patchMobileDevice       — restricted field update with movement log
 *   - checkImeiAvailability   — standalone IMEI availability probe
 *
 * F-03: isImeiTaken() and isVoucherTaken() accept an optional PoolClient.
 * When supplied the client is used (same transaction); otherwise this.pool
 * is used for standalone checks.
 *
 * Key conventions (unchanged from Phase B):
 *   - IDs: TEXT (36-char UUID-shaped) generated with uuidv4()
 *   - Timestamps: TEXT (ISO string) from new Date().toISOString()
 *   - Transactions: pool.connect() → BEGIN → ... → COMMIT / ROLLBACK → release()
 *   - Audit: writeChangeLogEntry(client, opts) called INSIDE the open transaction
 *     with payloadStr (already-serialized JSON string), NOT payload.
 *   - Sensitive paperwork fields (seller_cnic, father_name, seller_phone,
 *     seller_address) must never appear in list/detail responses or audit payloads.
 *   - setImmediate() post-response audit pattern is NOT used here.
 *
 * Gate 3 (disposable database identity) and Gate 4 (migration execution) remain
 * CLOSED. No database connection or SQL execution occurs at import time.
 */

import { Pool, PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { writeChangeLogEntry } from './change_log.repo';

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class MobileRepoError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number
  ) {
    super(message);
    this.name = 'MobileRepoError';
  }
}

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export type MobilePtaStatus = 'PTA_APPROVED' | 'NON_PTA' | 'JV' | 'GEVEY';
export type MobileCondition = 'NEW' | 'USED';
export type MobileStatus = 'IN_STOCK' | 'INSPECTION' | 'SOLD';
export type MobileSlot = 'IMEI1' | 'IMEI2';
export type MobileBodyGrade = 'PRISTINE' | 'GOOD' | 'HEAVY_WEAR' | 'DENTED';
export type MobileScreenCondition = 'ORIGINAL' | 'REPLACED' | 'CRACKED';
export type MobileMovementType =
  | 'ACQUIRED'
  | 'TRANSFERRED'
  | 'SOLD'
  | 'RETURNED'
  | 'STATUS_CHANGE'
  | 'INSPECTION_UPDATE';

/** Permitted status transitions — Phase C PATCH. SOLD is terminal. */
export const PERMITTED_STATUS_TRANSITIONS: Record<MobileStatus, MobileStatus[]> = {
  IN_STOCK:   ['INSPECTION'],
  INSPECTION: ['IN_STOCK'],
  SOLD:       [],
};

// ---------------------------------------------------------------------------
// Registration input types
// ---------------------------------------------------------------------------

export interface RegisterImeiInput {
  imei: string;
  slot: MobileSlot;
}

/** Inspection data supplied at registration time (all booleans default true when omitted). */
export interface RegisterInspectionInput {
  body_grade: MobileBodyGrade;
  screen_condition: MobileScreenCondition;
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
}

/** Paperwork supplied at USED-device registration time. */
export interface RegisterPaperworkInput {
  voucher_no?: string;          // Optional — omit to auto-allocate next sequential number for the branch
  purchase_date: string;        // ISO date string
  purchase_price: number;       // Must equal cost_price
  seller_name: string;
  father_name: string;          // sensitive
  seller_cnic: string;          // sensitive
  seller_phone: string;         // sensitive
  seller_address: string;       // sensitive
  ownership_declaration_acknowledged: boolean;
  physical_affidavit_acknowledged: boolean;
  seller_id?: string | null;    // Phase 2: optional FK to mobile_sellers.id (same org, validated in tx)
}

export interface RegisterMobileDeviceInput {
  organization_id: string;      // Authenticated organization from session
  branch_id: string;
  created_by: string;           // user_id from JWT identity
  brand: string;
  model: string;
  storage: string;
  ram?: string | null;
  color?: string | null;
  serial_number?: string | null;
  pta_status: MobilePtaStatus;
  condition: MobileCondition;
  cost_price: number;
  expected_sale_price?: number | null;
  supplier_id?: string | null;  // NEW only; USED must be null
  notes?: string | null;
  imeis: RegisterImeiInput[];   // 1 or 2 entries
  inspection: RegisterInspectionInput;
  paperwork?: RegisterPaperworkInput; // Required when condition === 'USED'
}

// ---------------------------------------------------------------------------
// Response row types
// ---------------------------------------------------------------------------

/** Device row returned by list/detail — no sensitive paperwork fields. */
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
  pta_status: MobilePtaStatus;
  condition: MobileCondition;
  status: MobileStatus;
  cost_price: string;           // NUMERIC returns as string from pg
  expected_sale_price: string | null;
  supplier_id: string | null;
  sale_id: string | null;
  notes: string | null;
  created_by: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  imeis?: Array<{ id: string; imei: string; slot: MobileSlot }>;
  branch_name?: string | null;
  branch_code?: string | null;
}

/** Paperwork row — includes sensitive fields; only the paperwork endpoint returns this. */
export interface MobilePaperworkRow {
  id: string;
  device_id: string;
  organization_id: string;
  branch_id: string;
  voucher_no: string;
  purchase_date: string;
  purchase_price: string;
  seller_name: string;
  father_name: string;          // sensitive
  seller_cnic: string;          // sensitive
  seller_phone: string;         // sensitive
  seller_address: string;       // sensitive
  ownership_declaration_acknowledged: boolean;
  physical_affidavit_acknowledged: boolean;
  recorded_by: string;
  created_at: string;
  updated_at: string;
}

/** Inspection record row. */
export interface MobileInspectionRow {
  id: string;
  device_id: string;
  organization_id: string;
  body_grade: MobileBodyGrade;
  screen_condition: MobileScreenCondition;
  battery_health_percent: number | null;
  touch_working: boolean;
  battery_backup_ok: boolean;
  front_camera_ok: boolean;
  back_camera_ok: boolean;
  speaker_ok: boolean;
  microphone_ok: boolean;
  charging_port_ok: boolean;
  buttons_ok: boolean;
  biometrics_ok: boolean;
  wifi_bluetooth_ok: boolean;
  sim_network_ok: boolean;
  accessories_box: boolean;
  accessories_original_charger: boolean;
  accessories_cable: boolean;
  accessories_handsfree: boolean;
  defect_notes: string | null;
  inspected_by: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Movement log row. */
export interface MobileMovementRow {
  id: string;
  device_id: string;
  organization_id: string;
  movement_type: MobileMovementType;
  from_branch_id: string | null;
  to_branch_id: string | null;
  from_status: string | null;
  to_status: string;
  notes: string | null;
  performed_by: string;
  created_at: string;
}

/** List filter parameters for GET /. */
export interface ListMobileDevicesFilter {
  organization_id: string;
  branch_id?: string | null;
  condition?: MobileCondition;
  status?: MobileStatus;
  brand?: string;
  limit?: number;
  offset?: number;
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

/** Seller search result — fields needed for autofill. Sensitive: must not be surfaced on list/detail endpoints. */
export interface SellerSearchResult {
  seller_id?: string | null;
  seller_name: string;
  father_name: string;
  seller_cnic: string;
  seller_phone: string;
  seller_address: string;
}

// ---------------------------------------------------------------------------
// Seller Registry — Types (Phase 2)
// ---------------------------------------------------------------------------

export type SellerVerificationStatus = 'UNVERIFIED' | 'IDENTITY_RECORDED' | 'FLAGGED';

/** Full seller profile row (sensitive — only returned on explicit profile access). */
export interface SellerRow {
  id: string;
  organization_id: string;
  name: string;
  father_name: string | null;
  cnic: string | null;          // sensitive — full CNIC, never in broad list results
  phone: string;                // sensitive
  alternate_phone: string | null;
  address: string;              // sensitive
  city: string | null;
  verification_status: SellerVerificationStatus;
  is_active: number;
  notes: string | null;
  created_by: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Safe seller summary row for search/list — CNIC is masked. */
export interface SellerSummaryRow {
  id: string;
  name: string;
  cnic_masked: string | null;   // e.g. "35201-*******-1"
  phone: string;
  city: string | null;
  verification_status: SellerVerificationStatus;
  is_active: number;
}

/** Device-history item returned by getSellerDevices. */
export interface SellerDeviceHistoryRow {
  paperwork_id: string;
  voucher_no: string;
  purchase_date: string;
  purchase_price: string;
  // Snapshot fields (from paperwork — historical, may differ from current profile)
  snapshot_seller_name: string;
  snapshot_seller_cnic_masked: string | null; // masked for safety (null if unrecorded)
  // Device fields
  device_id: string;
  brand: string;
  model: string;
  storage: string;
  condition: MobileCondition;
  status: MobileStatus;
  branch_id: string;
  branch_name: string | null;
  // IMEIs — only included when caller requests them (inventory-write scope)
  imeis?: Array<{ imei: string; slot: MobileSlot }>;
}

/** Input for createSeller. */
export interface CreateSellerInput {
  organization_id: string;      // from JWT — never client-supplied
  created_by: string;           // from JWT — never client-supplied
  name: string;
  father_name?: string | null;
  cnic?: string | null;         // optional; if provided must pass CNIC regex
  phone: string;
  alternate_phone?: string | null;
  address: string;
  city?: string | null;
  notes?: string | null;
}

/** Input for patchImei (PATCH /:id/imei) — Org Admin only. */
export interface PatchImeiInput {
  device_id: string;
  organization_id: string;
  branch_id: string;
  updated_by: string;
  imei_id: string;    // PK of the row in mobile_imei_identifiers to correct
  new_imei: string;   // replacement value (15-digit, must not already be registered)
}

/** Input for patchPaperwork (PATCH /:id/paperwork) — Org Admin only. */
export interface PatchPaperworkInput {
  device_id: string;
  organization_id: string;
  branch_id: string;
  updated_by: string;
  // All seller identity fields are optional — only supplied ones are updated
  seller_name?: string;
  father_name?: string;
  seller_cnic?: string;
  seller_phone?: string;
  seller_address?: string;
}

/** Input for updateSeller (PATCH). */
export interface UpdateSellerInput {
  seller_id: string;
  organization_id: string;      // from JWT
  updated_by: string;           // from JWT
  branch_id?: string | null;    // active branch for audit attribution
  phone?: string;
  alternate_phone?: string | null;
  address?: string;
  city?: string | null;
  verification_status?: SellerVerificationStatus;
  is_active?: number;
  notes?: string | null;
}

/** Branch-scoped investment summary (NEW + USED breakdown, IN_STOCK only). */
export interface BranchInvestmentSummary {
  total_investment: number;
  new_investment: number;
  used_investment: number;
  total_in_stock: number;
  new_in_stock: number;
  used_in_stock: number;
}

/** Input for PATCH /:id. */
export interface PatchMobileDeviceInput {
  device_id: string;
  organization_id: string;
  branch_id: string;
  updated_by: string;
  status?: MobileStatus;
  expected_sale_price?: number | null;
  pta_status?: MobilePtaStatus;
  notes?: string | null;
  // Org-Admin-only USED-device edit fields (ignored for NEW devices):
  brand?: string;
  model?: string;
  storage?: string;
  ram?: string | null;
  color?: string | null;
  serial_number?: string | null;
  // Paperwork edits (USED only, Org Admin only):
  purchase_date?: string;
  purchase_price?: number;
  // Inspection update fields:
  body_grade?: MobileBodyGrade;
  screen_condition?: MobileScreenCondition;
  battery_health_percent?: number | null;
  touch_working?: boolean;
  battery_backup_ok?: boolean;
  front_camera_ok?: boolean;
  back_camera_ok?: boolean;
  accessories_box?: boolean;
  accessories_original_charger?: boolean;
  accessories_cable?: boolean;
  accessories_handsfree?: boolean;
  defect_notes?: string | null;
}

// ---------------------------------------------------------------------------
// Full-profile response type (Phase 2 — for MobileDetailModal)
// ---------------------------------------------------------------------------

/** Seller details surfaced in a full-profile response (CNIC masked for non-admin roles). */
export interface FullProfileSellerInfo {
  seller_id: string | null;
  seller_name: string;
  father_name: string;           // sensitive — only for org-admin
  seller_cnic: string;           // full CNIC for official printed paperwork / legal receipts
  seller_cnic_masked: string | null;    // masked: "35201-*******-8", or null if CNIC unrecorded
  seller_phone: string;          // sensitive — only for org-admin
  seller_address: string;        // sensitive — only for org-admin
  ownership_declaration_acknowledged: boolean;
  physical_affidavit_acknowledged: boolean;
}

/** Complete device record including device, paperwork, seller and inspection data. */
export interface MobileFullProfile {
  // Device
  device: MobileDeviceRow;
  // Paperwork — null for NEW devices
  paperwork: {
    id: string;
    voucher_no: string;
    purchase_date: string;
    purchase_price: string;
    recorded_by: string;
    created_at: string;
    seller: FullProfileSellerInfo;
  } | null;
  // Inspection
  inspection: MobileInspectionRow | null;
  // Branch
  branch_name: string | null;
  branch_code: string | null;
}

// ---------------------------------------------------------------------------
// Repository class
// ---------------------------------------------------------------------------

export class MobileRepo {
  constructor(private readonly pool: Pool) {}

  // -------------------------------------------------------------------------
  // F-03 — IMEI and voucher uniqueness checks (accept optional PoolClient)
  // -------------------------------------------------------------------------

  /**
   * Returns true if the IMEI is already registered in the organization.
   *
   * F-03: accepts an optional PoolClient so callers can use the same client
   * as the surrounding transaction, ensuring a consistent snapshot during
   * concurrent registrations. Falls back to pool for standalone checks.
   */
  async isImeiTaken(
    organizationId: string,
    imei: string,
    client?: PoolClient
  ): Promise<boolean> {
    const executor = client ?? this.pool;
    const result = await executor.query<{ exists: boolean }>(
      `SELECT EXISTS(
         SELECT 1 FROM mobile_imei_identifiers
         WHERE organization_id = $1 AND imei = $2
       ) AS exists`,
      [organizationId, imei]
    );
    return result.rows[0]?.exists === true;
  }

  /**
   * Returns true if the voucher number is already used in the branch.
   *
   * F-03: accepts an optional PoolClient for use inside the registration
   * transaction. Falls back to pool for standalone checks.
   */
  async isVoucherTaken(
    branchId: string,
    voucherNo: string,
    client?: PoolClient
  ): Promise<boolean> {
    const executor = client ?? this.pool;
    const result = await executor.query<{ exists: boolean }>(
      `SELECT EXISTS(
         SELECT 1 FROM mobile_purchase_paperwork
         WHERE branch_id = $1 AND voucher_no = $2
       ) AS exists`,
      [branchId, voucherNo]
    );
    return result.rows[0]?.exists === true;
  }

  // -------------------------------------------------------------------------
  // Audit helper
  // -------------------------------------------------------------------------

  /**
   * Writes a Mobile Inventory audit entry inside an existing open transaction.
   * MUST be called with the same PoolClient used for the surrounding transaction.
   * The transaction is NOT committed here — caller handles COMMIT/ROLLBACK.
   *
   * Sensitive paperwork fields must NOT appear in eventPayload.
   */
  async writeAuditEntry(
    client: PoolClient,
    opts: {
      organizationId: string;
      branchId: string;
      eventType: string;
      entityId: string;
      eventPayload: Record<string, unknown>;
    }
  ): Promise<void> {
    await writeChangeLogEntry(client, {
      organizationId: opts.organizationId,
      branchId: opts.branchId,
      eventType: opts.eventType,
      entityType: 'mobile_device',
      entityId: opts.entityId,
      payloadStr: JSON.stringify(opts.eventPayload),
    });
  }

  // -------------------------------------------------------------------------
  // ID / timestamp helpers
  // -------------------------------------------------------------------------

  /** Generates a new 36-char UUID-shaped text ID. */
  newId(): string {
    return uuidv4();
  }

  /** Returns current timestamp as ISO string. */
  nowIso(): string {
    return new Date().toISOString();
  }

  // -------------------------------------------------------------------------
  // Phase C — registerMobileDeviceTx
  // -------------------------------------------------------------------------

  /**
   * Atomically registers a NEW or USED mobile device.
   *
   * Transaction boundary:
   *   BEGIN
   *     [F-03] isImeiTaken(org, imei1, client)   → 409 IMEI_ALREADY_REGISTERED
   *     [F-03] isImeiTaken(org, imei2?, client)  → 409 IMEI_ALREADY_REGISTERED
   *     [USED] isVoucherTaken(branch, no, client) → 409 VOUCHER_ALREADY_REGISTERED
   *     [NEW + supplier_id] SELECT suppliers WHERE id=$1 AND is_active=1
   *     INSERT INTO mobile_devices
   *     INSERT INTO mobile_imei_identifiers (IMEI1)
   *     [IMEI2] INSERT INTO mobile_imei_identifiers (IMEI2)
   *     [USED] INSERT INTO mobile_purchase_paperwork
   *     [USED] INSERT INTO mobile_inspection_records
   *     [NEW]  INSERT INTO mobile_inspection_records
   *     INSERT INTO mobile_device_movements (ACQUIRED)
   *     writeChangeLogEntry(client, MOBILE_DEVICE_REGISTERED — no sensitive fields)
   *   COMMIT
   *
   * Returns the new device id on success.
   * Throws MobileRepoError with appropriate statusCode on business-rule violations.
   */
  async registerMobileDeviceTx(input: RegisterMobileDeviceInput): Promise<string> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const now = this.nowIso();
      const orgId = input.organization_id;

      // ── F-03 uniqueness checks inside transaction ──────────────────────────
      for (const imeiEntry of input.imeis) {
        const taken = await this.isImeiTaken(orgId, imeiEntry.imei, client);
        if (taken) {
          throw new MobileRepoError(
            `IMEI_ALREADY_REGISTERED: ${imeiEntry.imei} is already registered in this organization`,
            409
          );
        }
      }

      if (input.condition === 'USED') {
        if (!input.paperwork) {
          throw new MobileRepoError('Paperwork is required for USED devices', 422);
        }
        // Auto-allocate voucher number when client omits it or submits an empty value.
        // Branch row is locked inside getNextVoucherNumber — allocation and all subsequent
        // INSERTs share the same client and transaction, guaranteeing no duplicates.
        if (!input.paperwork.voucher_no || input.paperwork.voucher_no.trim() === '') {
          input.paperwork.voucher_no = await this.getNextVoucherNumber(input.branch_id, client);
        } else {
          // Explicit voucher supplied — validate uniqueness as before.
          const voucherTaken = await this.isVoucherTaken(
            input.branch_id,
            input.paperwork.voucher_no.trim(),
            client
          );
          if (voucherTaken) {
            throw new MobileRepoError(
              `VOUCHER_ALREADY_REGISTERED: voucher number "${input.paperwork.voucher_no}" is already used in this branch`,
              409
            );
          }
          input.paperwork.voucher_no = input.paperwork.voucher_no.trim();
        }
      }

      // ── Supplier active-status check (NEW + supplier_id provided) ──────────
      if (input.condition === 'NEW' && input.supplier_id) {
        const supResult = await client.query<{ is_active: number | boolean }>(
          `SELECT is_active FROM suppliers WHERE id = $1`,
          [input.supplier_id]
        );
        if (supResult.rows.length === 0) {
          throw new MobileRepoError(
            `Supplier "${input.supplier_id}" not found`,
            422
          );
        }
        const isActive =
          typeof supResult.rows[0].is_active === 'boolean'
            ? supResult.rows[0].is_active
            : Number(supResult.rows[0].is_active) === 1;
        if (!isActive) {
          throw new MobileRepoError(
            `Supplier "${input.supplier_id}" is not active`,
            422
          );
        }
      }

      // ── INSERT mobile_devices ───────────────────────────────────────────────
      const deviceId = this.newId();
      await client.query(
        `INSERT INTO mobile_devices (
           id, organization_id, branch_id,
           brand, model, storage, ram, color, serial_number,
           pta_status, condition, status,
           cost_price, expected_sale_price,
           supplier_id, sale_id, notes,
           created_by, updated_by, created_at, updated_at
         ) VALUES (
           $1,  $2,  $3,
           $4,  $5,  $6,  $7,  $8,  $9,
           $10, $11, $12,
           $13, $14,
           $15, NULL, $16,
           $17, NULL, $18, $18
         )`,
        [
          deviceId, orgId, input.branch_id,
          input.brand, input.model, input.storage,
          input.ram ?? null, input.color ?? null, input.serial_number ?? null,
          input.pta_status, input.condition, 'IN_STOCK',
          String(input.cost_price),
          input.expected_sale_price != null ? String(input.expected_sale_price) : null,
          input.supplier_id ?? null,
          input.notes ?? null,
          input.created_by, now,
        ]
      );

      // ── INSERT mobile_imei_identifiers ─────────────────────────────────────
      for (const imeiEntry of input.imeis) {
        const imeiId = this.newId();
        await client.query(
          `INSERT INTO mobile_imei_identifiers (id, device_id, organization_id, imei, slot, created_at)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [imeiId, deviceId, orgId, imeiEntry.imei, imeiEntry.slot, now]
        );
      }

      // ── USED: INSERT mobile_purchase_paperwork ─────────────────────────────
      if (input.condition === 'USED' && input.paperwork) {
        const pw = input.paperwork;
        const pwId = this.newId();

        // Phase 2: if a seller_id is provided, validate it belongs to this org
        // and is active inside the same transaction (consistent read, no independent connection).
        if (pw.seller_id) {
          const sellerCheck = await client.query<{ id: string; is_active: number }>(
            `SELECT id, is_active FROM mobile_sellers WHERE id = $1 AND organization_id = $2`,
            [pw.seller_id, orgId]
          );
          if (sellerCheck.rows.length === 0) {
            throw new MobileRepoError(
              `SELLER_NOT_FOUND: seller_id "${pw.seller_id}" not found in this organization`,
              422
            );
          }
          if (sellerCheck.rows[0].is_active !== 1) {
            throw new MobileRepoError(
              `SELLER_INACTIVE: seller_id "${pw.seller_id}" is inactive and cannot be linked to new purchases`,
              422
            );
          }
        }

        await client.query(
          `INSERT INTO mobile_purchase_paperwork (
             id, device_id, organization_id, branch_id,
             voucher_no, purchase_date, purchase_price,
             seller_name, father_name, seller_cnic, seller_phone, seller_address,
             ownership_declaration_acknowledged, physical_affidavit_acknowledged,
             seller_id,
             recorded_by, created_at, updated_at
           ) VALUES (
             $1,  $2,  $3,  $4,
             $5,  $6,  $7,
             $8,  $9,  $10, $11, $12,
             $13, $14,
             $15,
             $16, $17, $17
           )`,
          [
            pwId, deviceId, orgId, input.branch_id,
            pw.voucher_no, pw.purchase_date, String(pw.purchase_price),
            pw.seller_name, pw.father_name, pw.seller_cnic,
            pw.seller_phone, pw.seller_address,
            pw.ownership_declaration_acknowledged,
            pw.physical_affidavit_acknowledged,
            pw.seller_id ?? null,
            input.created_by, now,
          ]
        );
      }

      // ── INSERT mobile_inspection_records ───────────────────────────────────
      const insp = input.inspection;
      const inspId = this.newId();
      await client.query(
        `INSERT INTO mobile_inspection_records (
           id, device_id, organization_id,
           body_grade, screen_condition, battery_health_percent,
           touch_working, battery_backup_ok,
           front_camera_ok, back_camera_ok,
           speaker_ok, microphone_ok, charging_port_ok,
           buttons_ok, biometrics_ok,
           wifi_bluetooth_ok, sim_network_ok,
           accessories_box, accessories_original_charger,
           accessories_cable, accessories_handsfree,
           defect_notes,
           inspected_by, updated_by, created_at, updated_at
         ) VALUES (
           $1,  $2,  $3,
           $4,  $5,  $6,
           $7,  $8,
           $9,  $10,
           $11, $12, $13,
           $14, $15,
           $16, $17,
           $18, $19,
           $20, $21,
           $22,
           $23, NULL, $24, $24
         )`,
        [
          inspId, deviceId, orgId,
          insp.body_grade, insp.screen_condition,
          insp.battery_health_percent ?? null,
          insp.touch_working          ?? true,
          insp.battery_backup_ok      ?? true,
          insp.front_camera_ok        ?? true,
          insp.back_camera_ok         ?? true,
          insp.speaker_ok             ?? true,
          insp.microphone_ok          ?? true,
          insp.charging_port_ok       ?? true,
          insp.buttons_ok             ?? true,
          insp.biometrics_ok          ?? true,
          insp.wifi_bluetooth_ok      ?? true,
          insp.sim_network_ok         ?? true,
          insp.accessories_box              ?? false,
          insp.accessories_original_charger ?? false,
          insp.accessories_cable            ?? false,
          insp.accessories_handsfree        ?? false,
          insp.defect_notes ?? null,
          input.created_by, now,
        ]
      );

      // ── INSERT mobile_device_movements (ACQUIRED) ──────────────────────────
      const movId = this.newId();
      await client.query(
        `INSERT INTO mobile_device_movements (
           id, device_id, organization_id,
           movement_type,
           from_branch_id, to_branch_id,
           from_status, to_status,
           notes, performed_by, created_at
         ) VALUES (
           $1, $2, $3,
           'ACQUIRED',
           NULL, $4,
           NULL, 'IN_STOCK',
           $5, $6, $7
         )`,
        [
          movId, deviceId, orgId,
          input.branch_id,
          input.notes ?? null,
          input.created_by, now,
        ]
      );

      // ── Audit — MOBILE_DEVICE_REGISTERED (no sensitive fields) ────────────
      await this.writeAuditEntry(client, {
        organizationId: orgId,
        branchId: input.branch_id,
        eventType: 'MOBILE_DEVICE_REGISTERED',
        entityId: deviceId,
        eventPayload: {
          device_id:    deviceId,
          branch_id:    input.branch_id,
          brand:        input.brand,
          model:        input.model,
          storage:      input.storage,
          condition:    input.condition,
          pta_status:   input.pta_status,
          status:       'IN_STOCK',
          cost_price:   String(input.cost_price),
          supplier_id:  input.supplier_id ?? null,
          imei_count:   input.imeis.length,
          created_by:   input.created_by,
          // NOTE: seller_cnic, father_name, seller_phone, seller_address
          // are intentionally excluded from audit payloads.
        },
      });

      await client.query('COMMIT');
      return deviceId;
    } catch (err: unknown) {
      await client.query('ROLLBACK');
      const pgErr = err as { code?: string; constraint?: string };
      if (pgErr && pgErr.code === '23505') {
        const constraint = String(pgErr.constraint || '');
        if (constraint.includes('imei') || constraint === 'mobile_imei_identifiers_organization_id_imei_key') {
          throw new MobileRepoError(
            'IMEI_ALREADY_REGISTERED: An IMEI is already registered in this organization',
            409
          );
        }
        if (constraint.includes('voucher') || constraint === 'idx_mobile_paperwork_branch_voucher') {
          throw new MobileRepoError(
            'VOUCHER_ALREADY_REGISTERED: Voucher number is already used in this branch',
            409
          );
        }
        if (constraint.includes('device_id')) {
          throw new MobileRepoError(
            'DEVICE_RECORD_CONFLICT: A record already exists for this device',
            409
          );
        }
        throw new MobileRepoError(
          'UNIQUE_CONSTRAINT_VIOLATION: A unique constraint was violated',
          409
        );
      }
      throw err;
    } finally {
      client.release();
    }
  }

  // -------------------------------------------------------------------------
  // Phase C — listMobileDevices
  // -------------------------------------------------------------------------

  /**
   * Returns a paginated list of mobile devices for a branch.
   * Sensitive paperwork fields are never included.
   */
  async listMobileDevices(filter: ListMobileDevicesFilter): Promise<{
    devices: MobileDeviceRow[];
    total: number;
  }> {
    const limit  = filter.limit  ?? 50;
    const offset = filter.offset ?? 0;

    const params: unknown[] = [filter.organization_id];
    let where = `d.organization_id = $1`;
    let paramIdx = 2;

    if (filter.branch_id && filter.branch_id !== 'all') {
      where += ` AND d.branch_id = $${paramIdx++}`;
      params.push(filter.branch_id);
    }

    if (filter.condition) {
      where += ` AND d.condition = $${paramIdx++}`;
      params.push(filter.condition);
    }
    if (filter.status) {
      where += ` AND d.status = $${paramIdx++}`;
      params.push(filter.status);
    }
    if (filter.brand) {
      where += ` AND lower(d.brand) = lower($${paramIdx++})`;
      params.push(filter.brand);
    }

    const countResult = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM mobile_devices d WHERE ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

    const listParams = [...params, limit, offset];
    const listResult = await this.pool.query<MobileDeviceRow & { imei1: string | null; imei2: string | null }>(
      `SELECT
         d.id, d.organization_id, d.branch_id,
         d.brand, d.model, d.storage, d.ram, d.color, d.serial_number,
         d.pta_status, d.condition, d.status,
         d.cost_price, d.expected_sale_price,
         d.supplier_id, d.sale_id, d.notes,
         d.created_by, d.updated_by, d.created_at, d.updated_at,
         b.name AS branch_name,
         b.code AS branch_code,
         (SELECT imei FROM mobile_imei_identifiers
          WHERE device_id = d.id AND slot = 'IMEI1' LIMIT 1) AS imei1,
         (SELECT imei FROM mobile_imei_identifiers
          WHERE device_id = d.id AND slot = 'IMEI2' LIMIT 1) AS imei2
       FROM mobile_devices d
       LEFT JOIN branches b ON b.id = d.branch_id
       WHERE ${where}
       ORDER BY d.created_at DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      listParams
    );

    const devices = listResult.rows.map((row) => {
      const imeis: Array<{ id: string; imei: string; slot: MobileSlot }> = [];
      if (row.imei1) imeis.push({ id: '', imei: row.imei1, slot: 'IMEI1' });
      if (row.imei2) imeis.push({ id: '', imei: row.imei2, slot: 'IMEI2' });
      const { imei1: _i1, imei2: _i2, ...device } = row as typeof row;
      return { ...device, imeis } as MobileDeviceRow;
    });

    return { devices, total };
  }

  // -------------------------------------------------------------------------
  // Phase C — getMobileDevice
  // -------------------------------------------------------------------------

  /**
   * Returns a single device with its IMEI list.
   * Enforces organization and branch scope.
   * Sensitive paperwork fields are never included.
   */
  async getMobileDevice(
    deviceId: string,
    organizationId: string,
    branchId: string
  ): Promise<MobileDeviceRow | null> {
    const result = await this.pool.query<MobileDeviceRow>(
      `SELECT
         id, organization_id, branch_id,
         brand, model, storage, ram, color, serial_number,
         pta_status, condition, status,
         cost_price, expected_sale_price,
         supplier_id, sale_id, notes,
         created_by, updated_by, created_at, updated_at
       FROM mobile_devices
       WHERE id = $1 AND organization_id = $2 AND branch_id = $3`,
      [deviceId, organizationId, branchId]
    );
    if (result.rows.length === 0) return null;

    const device = result.rows[0];

    const imeiResult = await this.pool.query<{ id: string; imei: string; slot: MobileSlot }>(
      `SELECT id, imei, slot FROM mobile_imei_identifiers
       WHERE device_id = $1 AND organization_id = $2
       ORDER BY slot`,
      [deviceId, organizationId]
    );
    device.imeis = imeiResult.rows;

    return device;
  }

  // -------------------------------------------------------------------------
  // Phase C — getMobilePaperwork (fail-closed transactional audit)
  // -------------------------------------------------------------------------

  /**
   * Returns USED-phone paperwork for a device.
   *
   * Fail-closed audit pattern (Phase A.3 §10.2):
   *   BEGIN
   *     SELECT paperwork WHERE device_id = $1
   *     writeChangeLogEntry(client, MOBILE_PAPERWORK_ACCESSED)
   *   COMMIT → return paperwork only after audit committed
   *   ROLLBACK (on any error) → return null; caller gets 500
   *
   * Sensitive fields are included in the returned row (only the paperwork
   * endpoint may return them; list/detail must never call this method).
   * The audit payload must NOT contain sensitive fields.
   */
  async getMobilePaperwork(
    deviceId: string,
    organizationId: string,
    branchId: string,
    accessedBy: string
  ): Promise<MobilePaperworkRow | null> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query<MobilePaperworkRow>(
        `SELECT
           id, device_id, organization_id, branch_id,
           voucher_no, purchase_date, purchase_price,
           seller_name, father_name, seller_cnic, seller_phone, seller_address,
           ownership_declaration_acknowledged, physical_affidavit_acknowledged,
           recorded_by, created_at, updated_at
         FROM mobile_purchase_paperwork
         WHERE device_id = $1 AND organization_id = $2 AND branch_id = $3`,
        [deviceId, organizationId, branchId]
      );

      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        return null;
      }

      const paperwork = result.rows[0];

      // Audit must commit before we return data — sensitive fields excluded.
      await this.writeAuditEntry(client, {
        organizationId,
        branchId,
        eventType: 'MOBILE_PAPERWORK_ACCESSED',
        entityId: deviceId,
        eventPayload: {
          device_id:    deviceId,
          branch_id:    branchId,
          voucher_no:   paperwork.voucher_no,
          accessed_by:  accessedBy,
          // seller_cnic, father_name, seller_phone, seller_address excluded
        },
      });

      await client.query('COMMIT');
      return paperwork;
    } catch (err) {
      await client.query('ROLLBACK');
      // Fail closed — do not return paperwork if audit failed
      throw err;
    } finally {
      client.release();
    }
  }

  // -------------------------------------------------------------------------
  // Phase C.1 — patchPaperwork (Org Admin: correct seller info on paperwork)
  // ---------------------------------------------------------------------------

  /**
   * Updates seller identity fields on an existing mobile_purchase_paperwork record.
   * Only fields explicitly provided in input are changed; omitted fields keep their
   * current value. Org-Admin-only — enforced by the route before calling this.
   */
  async patchPaperwork(input: PatchPaperworkInput): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const existing = await client.query<{
        seller_name: string; father_name: string;
        seller_cnic: string; seller_phone: string; seller_address: string;
      }>(
        `SELECT seller_name, father_name, seller_cnic, seller_phone, seller_address
         FROM mobile_purchase_paperwork
         WHERE device_id = $1 AND organization_id = $2 AND branch_id = $3
         FOR UPDATE`,
        [input.device_id, input.organization_id, input.branch_id]
      );

      if (existing.rows.length === 0) {
        await client.query('ROLLBACK');
        return false;
      }

      const cur = existing.rows[0];
      const newSellerName    = input.seller_name    !== undefined ? input.seller_name    : cur.seller_name;
      const newFatherName    = input.father_name    !== undefined ? input.father_name    : cur.father_name;
      const newSellerCnic    = input.seller_cnic    !== undefined ? input.seller_cnic    : cur.seller_cnic;
      const newSellerPhone   = input.seller_phone   !== undefined ? input.seller_phone   : cur.seller_phone;
      const newSellerAddress = input.seller_address !== undefined ? input.seller_address : cur.seller_address;
      const now = this.nowIso();

      await client.query(
        `UPDATE mobile_purchase_paperwork
         SET seller_name    = $1,
             father_name    = $2,
             seller_cnic    = $3,
             seller_phone   = $4,
             seller_address = $5,
             updated_at     = $6
         WHERE device_id = $7 AND organization_id = $8 AND branch_id = $9`,
        [
          newSellerName, newFatherName, newSellerCnic,
          newSellerPhone, newSellerAddress, now,
          input.device_id, input.organization_id, input.branch_id,
        ]
      );

      await this.writeAuditEntry(client, {
        organizationId: input.organization_id,
        branchId:       input.branch_id,
        eventType:      'MOBILE_PAPERWORK_CORRECTED',
        entityId:       input.device_id,
        eventPayload: {
          device_id:  input.device_id,
          updated_by: input.updated_by,
          fields_updated: [
            ...(input.seller_name    !== undefined ? ['seller_name']    : []),
            ...(input.father_name    !== undefined ? ['father_name']    : []),
            ...(input.seller_cnic    !== undefined ? ['seller_cnic']    : []),
            ...(input.seller_phone   !== undefined ? ['seller_phone']   : []),
            ...(input.seller_address !== undefined ? ['seller_address'] : []),
          ],
        },
      });

      await client.query('COMMIT');
      return true;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // Phase C.2 — patchImei (Org Admin: correct a mis-typed IMEI)
  // ---------------------------------------------------------------------------

  /**
   * Replaces one IMEI on a device with a corrected value.
   * - Verifies the imei_id row belongs to the device / org.
   * - Checks the new IMEI is not already registered in the org.
   * - Updates mobile_imei_identifiers in a transaction.
   * - Writes a MOBILE_IMEI_CORRECTED audit entry (old slot recorded, value NOT logged).
   * Returns 'not_found' | 'conflict' | 'ok'.
   */
  async patchImei(input: PatchImeiInput): Promise<'not_found' | 'conflict' | 'ok'> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Lock the target IMEI row and verify ownership
      const existing = await client.query<{ id: string; imei: string; slot: MobileSlot }>(
        `SELECT id, imei, slot
         FROM mobile_imei_identifiers
         WHERE id = $1 AND device_id = $2 AND organization_id = $3
         FOR UPDATE`,
        [input.imei_id, input.device_id, input.organization_id]
      );

      if (existing.rows.length === 0) {
        await client.query('ROLLBACK');
        return 'not_found';
      }

      const old = existing.rows[0];

      // No-op: same value
      if (old.imei === input.new_imei) {
        await client.query('ROLLBACK');
        return 'ok';
      }

      // Check uniqueness within the org (pass client for same-tx check)
      const taken = await this.isImeiTaken(input.organization_id, input.new_imei, client);
      if (taken) {
        await client.query('ROLLBACK');
        return 'conflict';
      }

      await client.query(
        `UPDATE mobile_imei_identifiers SET imei = $1 WHERE id = $2`,
        [input.new_imei, input.imei_id]
      );

      await this.writeAuditEntry(client, {
        organizationId: input.organization_id,
        branchId:       input.branch_id,
        eventType:      'MOBILE_IMEI_CORRECTED',
        entityId:       input.device_id,
        eventPayload: {
          device_id:  input.device_id,
          updated_by: input.updated_by,
          imei_id:    input.imei_id,
          slot:       old.slot,
          // Note: old/new IMEI values intentionally not logged (device identity data)
        },
      });

      await client.query('COMMIT');
      return 'ok';
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // Phase C — patchMobileDevice
  // -------------------------------------------------------------------------

  /**
   * Applies a restricted update to a device.
   *
   * Allowed fields: status, expected_sale_price, pta_status, notes.
   * Immutable: id, organization_id, branch_id, condition, cost_price,
   *            created_by, created_at, sale_id, supplier_id (once set for NEW),
   *            IMEI identifiers, paperwork.
   *
   * A status change also inserts a STATUS_CHANGE movement record.
   * Emits a MOBILE_DEVICE_UPDATED audit entry.
   */
  async patchMobileDevice(input: PatchMobileDeviceInput): Promise<MobileDeviceRow | null> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Load current device inside transaction for consistent read
      const current = await client.query<MobileDeviceRow>(
        `SELECT id, branch_id, organization_id, status, condition,
                cost_price, expected_sale_price, pta_status, notes,
                brand, model, storage, ram, color, serial_number,
                supplier_id, sale_id, created_by, updated_by, created_at, updated_at
         FROM mobile_devices
         WHERE id = $1 AND organization_id = $2 AND branch_id = $3
         FOR UPDATE`,
        [input.device_id, input.organization_id, input.branch_id]
      );

      if (current.rows.length === 0) {
        await client.query('ROLLBACK');
        return null;
      }

      const device = current.rows[0];
      const now = this.nowIso();

      // Validate status transition
      if (input.status !== undefined && input.status !== device.status) {
        const allowed = PERMITTED_STATUS_TRANSITIONS[device.status];
        if (!allowed.includes(input.status)) {
          throw new MobileRepoError(
            `Status transition from ${device.status} to ${input.status} is not permitted`,
            422
          );
        }
      }

      const newStatus           = input.status ?? device.status;
      const newExpectedSalePrice =
        input.expected_sale_price !== undefined
          ? (input.expected_sale_price != null ? String(input.expected_sale_price) : null)
          : device.expected_sale_price;
      const newPtaStatus        = input.pta_status ?? device.pta_status;
      const newNotes            = input.notes !== undefined ? input.notes : device.notes;

      // Org-Admin USED-device fields (undefined = unchanged)
      const newBrand         = input.brand          !== undefined ? input.brand          : device.brand;
      const newModel         = input.model          !== undefined ? input.model          : device.model;
      const newStorage       = input.storage        !== undefined ? input.storage        : device.storage;
      const newRam           = input.ram            !== undefined ? input.ram            : device.ram;
      const newColor         = input.color          !== undefined ? input.color          : device.color;
      const newSerialNumber  = input.serial_number  !== undefined ? input.serial_number  : device.serial_number;

      await client.query(
        `UPDATE mobile_devices
         SET status              = $1,
             expected_sale_price = $2,
             pta_status          = $3,
             notes               = $4,
             brand               = $5,
             model               = $6,
             storage             = $7,
             ram                 = $8,
             color               = $9,
             serial_number       = $10,
             updated_by          = $11,
             updated_at          = $12
         WHERE id = $13`,
        [
          newStatus, newExpectedSalePrice, newPtaStatus,
          newNotes,
          newBrand, newModel, newStorage, newRam, newColor, newSerialNumber,
          input.updated_by, now,
          input.device_id,
        ]
      );

      // USED-device paperwork fields (only update when supplied and device is USED)
      if (device.condition === 'USED' && (input.purchase_date !== undefined || input.purchase_price !== undefined)) {
        const pwCurrent = await client.query<{ purchase_date: string; purchase_price: string }>(
          `SELECT purchase_date, purchase_price FROM mobile_purchase_paperwork
           WHERE device_id = $1 AND branch_id = $2
           FOR UPDATE`,
          [input.device_id, input.branch_id]
        );
        if (pwCurrent.rows.length > 0) {
          const pw = pwCurrent.rows[0];
          const newPurchaseDate  = input.purchase_date  !== undefined ? input.purchase_date  : pw.purchase_date;
          const newPurchasePrice = input.purchase_price !== undefined ? String(input.purchase_price) : pw.purchase_price;
          await client.query(
            `UPDATE mobile_purchase_paperwork
             SET purchase_date  = $1,
                 purchase_price = $2,
                 updated_at     = $3
             WHERE device_id = $4 AND branch_id = $5`,
            [newPurchaseDate, newPurchasePrice, now, input.device_id, input.branch_id]
          );

          // Maintain accounting consistency between mobile_devices.cost_price and mobile_purchase_paperwork.purchase_price
          if (input.purchase_price !== undefined) {
            await client.query(
              `UPDATE mobile_devices
               SET cost_price = $1,
                   updated_at = $2
               WHERE id = $3`,
              [newPurchasePrice, now, input.device_id]
            );
          }
        }
      }

      // USED-device inspection update (only when supplied)
      const hasInspectionUpdate = input.body_grade !== undefined
        || input.screen_condition !== undefined
        || input.battery_health_percent !== undefined
        || input.touch_working !== undefined
        || input.battery_backup_ok !== undefined
        || input.front_camera_ok !== undefined
        || input.back_camera_ok !== undefined
        || input.accessories_box !== undefined
        || input.accessories_original_charger !== undefined
        || input.accessories_cable !== undefined
        || input.accessories_handsfree !== undefined
        || input.defect_notes !== undefined;
      if (device.condition === 'USED' && hasInspectionUpdate) {
        // Build dynamic SET clause only for supplied fields
        const inspUpdates: string[] = [];
        const inspParams: unknown[] = [];
        let pidx = 1;
        if (input.body_grade !== undefined) {
          inspUpdates.push(`body_grade = $${pidx++}`);
          inspParams.push(input.body_grade);
        }
        if (input.screen_condition !== undefined) {
          inspUpdates.push(`screen_condition = $${pidx++}`);
          inspParams.push(input.screen_condition);
        }
        if (input.battery_health_percent !== undefined) {
          inspUpdates.push(`battery_health_percent = $${pidx++}`);
          inspParams.push(input.battery_health_percent);
        }
        if (input.touch_working !== undefined) {
          inspUpdates.push(`touch_working = $${pidx++}`);
          inspParams.push(input.touch_working);
        }
        if (input.battery_backup_ok !== undefined) {
          inspUpdates.push(`battery_backup_ok = $${pidx++}`);
          inspParams.push(input.battery_backup_ok);
        }
        if (input.front_camera_ok !== undefined) {
          inspUpdates.push(`front_camera_ok = $${pidx++}`);
          inspParams.push(input.front_camera_ok);
        }
        if (input.back_camera_ok !== undefined) {
          inspUpdates.push(`back_camera_ok = $${pidx++}`);
          inspParams.push(input.back_camera_ok);
        }
        if (input.accessories_box !== undefined) {
          inspUpdates.push(`accessories_box = $${pidx++}`);
          inspParams.push(input.accessories_box);
        }
        if (input.accessories_original_charger !== undefined) {
          inspUpdates.push(`accessories_original_charger = $${pidx++}`);
          inspParams.push(input.accessories_original_charger);
        }
        if (input.accessories_cable !== undefined) {
          inspUpdates.push(`accessories_cable = $${pidx++}`);
          inspParams.push(input.accessories_cable);
        }
        if (input.accessories_handsfree !== undefined) {
          inspUpdates.push(`accessories_handsfree = $${pidx++}`);
          inspParams.push(input.accessories_handsfree);
        }
        if (input.defect_notes !== undefined) {
          inspUpdates.push(`defect_notes = $${pidx++}`);
          inspParams.push(input.defect_notes);
        }
        inspUpdates.push(`updated_by = $${pidx++}`);
        inspParams.push(input.updated_by);
        inspUpdates.push(`updated_at = $${pidx++}`);
        inspParams.push(now);
        inspParams.push(input.device_id);
        inspParams.push(input.organization_id);
        await client.query(
          `UPDATE mobile_inspection_records
           SET ${inspUpdates.join(', ')}
           WHERE device_id = $${pidx++} AND organization_id = $${pidx}`,
          inspParams
        );
      }

      // Status change → movement record
      if (input.status !== undefined && input.status !== device.status) {
        const movId = this.newId();
        await client.query(
          `INSERT INTO mobile_device_movements (
             id, device_id, organization_id,
             movement_type,
             from_branch_id, to_branch_id,
             from_status, to_status,
             notes, performed_by, created_at
           ) VALUES (
             $1, $2, $3,
             'STATUS_CHANGE',
             $4, $4,
             $5, $6,
             NULL, $7, $8
           )`,
          [
            movId, input.device_id, input.organization_id,
            input.branch_id,
            device.status, input.status,
            input.updated_by, now,
          ]
        );
      }

      // Audit
      await this.writeAuditEntry(client, {
        organizationId: input.organization_id,
        branchId: input.branch_id,
        eventType: 'MOBILE_DEVICE_UPDATED',
        entityId: input.device_id,
        eventPayload: {
          device_id:           input.device_id,
          branch_id:           input.branch_id,
          updated_by:          input.updated_by,
          status_from:         device.status,
          status_to:           newStatus,
          expected_sale_price: newExpectedSalePrice,
          pta_status:          newPtaStatus,
          // Include org-admin field changes in audit (no sensitive seller data)
          brand_changed:       input.brand    !== undefined,
          model_changed:       input.model    !== undefined,
          storage_changed:     input.storage  !== undefined,
          paperwork_updated:   input.purchase_date !== undefined || input.purchase_price !== undefined,
          inspection_updated:  input.body_grade !== undefined || input.screen_condition !== undefined
                               || input.battery_health_percent !== undefined || input.defect_notes !== undefined,
        },
      });

      await client.query('COMMIT');

      // Return updated device
      return this.getMobileDevice(input.device_id, input.organization_id, input.branch_id);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // -------------------------------------------------------------------------
  // Phase C — checkImeiAvailability (standalone, no transaction)
  // -------------------------------------------------------------------------

  /**
   * Returns availability status for an IMEI.
   * Uses this.pool (no transaction needed for standalone probe).
   */
  async checkImeiAvailability(
    organizationId: string,
    imei: string
  ): Promise<{ available: boolean; imei: string }> {
    const taken = await this.isImeiTaken(organizationId, imei);
    return { available: !taken, imei };
  }

  /**
   * Returns organization-wide consolidated mobile inventory summary and per-branch breakdown.
   * Scoped strictly to the authenticated organization.
   */
  /**
   * Searches historical mobile_purchase_paperwork for reusable seller details.
   *
   * Deduplicates by normalized CNIC (keeping the most recent record per CNIC).
   * Falls back to deduplication by seller_name when CNIC is absent.
   * Matches against seller_name, seller_cnic, or seller_phone (case-insensitive).
   *
   * Branch visibility:
   *   - SHOP_ADMIN: restricted to their own branch (branchId required).
   *   - Org-admin: all branches within the organization (branchId may be null).
   *
   * SECURITY: seller CNIC, phone, address, and father_name are included here
   * for autofill only. This method must NEVER be called from list/detail endpoints.
   */
  async searchSellers(
    organizationId: string,
    branchId: string | null,
    q: string,
    limit: number = 10
  ): Promise<SellerSearchResult[]> {
    const pattern = `%${q.replace(/[%_\\]/g, '\\$&')}%`;

    // Phase 2: query mobile_sellers registry first, then fall back to historical
    // paperwork for sellers not yet linked (seller_id IS NULL). Results are merged
    // and de-duplicated by CNIC (registry wins when CNIC matches).

    // --- Registry query (mobile_sellers) -----------------------------------
    const registryResult = await this.pool.query<{
      id: string;
      seller_name: string;
      father_name: string | null;
      seller_cnic: string | null;
      seller_phone: string;
      seller_address: string;
    }>(
      `SELECT
         id,
         name        AS seller_name,
         father_name,
         cnic        AS seller_cnic,
         phone       AS seller_phone,
         address     AS seller_address
       FROM mobile_sellers
       WHERE organization_id = $1
         AND is_active = 1
         AND (
           name  ILIKE $2
           OR cnic   ILIKE $2
           OR phone  ILIKE $2
         )
       ORDER BY name ASC
       LIMIT $3`,
      [organizationId, pattern, limit]
    );

    // --- Historical query (paperwork rows not yet linked to registry) -------
    const params: (string | number)[] = [organizationId, pattern, pattern, pattern, limit];
    const branchClause = branchId ? `AND d.branch_id = $6` : '';
    if (branchId) params.push(branchId);

    const historicalResult = await this.pool.query<{
      seller_name: string;
      father_name: string;
      seller_cnic: string;
      seller_phone: string;
      seller_address: string;
    }>(
      `SELECT DISTINCT ON (COALESCE(NULLIF(TRIM(p.seller_cnic), ''), p.seller_name))
         p.seller_name,
         p.father_name,
         p.seller_cnic,
         p.seller_phone,
         p.seller_address
       FROM mobile_purchase_paperwork p
       INNER JOIN mobile_devices d ON d.id = p.device_id
       WHERE d.organization_id = $1
         AND p.seller_id IS NULL
         ${branchClause}
         AND (
           p.seller_name   ILIKE $2
           OR p.seller_cnic  ILIKE $3
           OR p.seller_phone ILIKE $4
         )
       ORDER BY COALESCE(NULLIF(TRIM(p.seller_cnic), ''), p.seller_name), p.created_at DESC
       LIMIT $5`,
      params
    );

    // --- Merge: registry results take precedence; deduplicate by CNIC ------
    const seen = new Set<string>();
    const merged: SellerSearchResult[] = [];

    for (const r of registryResult.rows) {
      const key = r.seller_cnic ? r.seller_cnic.trim() : `name:${r.seller_name}`;
      if (!seen.has(key)) {
        seen.add(key);
        merged.push({
          seller_id:      r.id,
          seller_name:    r.seller_name,
          father_name:    r.father_name ?? '',
          seller_cnic:    r.seller_cnic ?? '',
          seller_phone:   r.seller_phone,
          seller_address: r.seller_address,
        });
      }
    }

    for (const r of historicalResult.rows) {
      const key = r.seller_cnic ? r.seller_cnic.trim() : `name:${r.seller_name}`;
      if (!seen.has(key)) {
        seen.add(key);
        merged.push({
          seller_id:      null,
          seller_name:    r.seller_name,
          father_name:    r.father_name,
          seller_cnic:    r.seller_cnic,
          seller_phone:   r.seller_phone,
          seller_address: r.seller_address,
        });
      }
    }

    return merged.slice(0, limit);
  }

  // -------------------------------------------------------------------------
  // Seller Registry — Phase 2 CRUD methods
  // -------------------------------------------------------------------------

  /**
   * Masks the middle segment of a CNIC for safe display in list results.
   * "35201-1234567-8" → "35201-*******-8"
   */
  private maskCnic(cnic: string | null | undefined): string | null {
    if (!cnic) return null;
    const match = cnic.match(/^(\d{5})-(\d{7})-(\d)$/);
    if (!match) return cnic.replace(/\d/g, '*');
    return `${match[1]}-${'*'.repeat(7)}-${match[3]}`;
  }

  /**
   * Creates a new seller in the permanent registry.
   *
   * Organization scope is enforced: organization_id must come from the JWT,
   * never from the client body. If a non-null CNIC is provided, the partial
   * unique index (idx_mobile_sellers_org_cnic WHERE cnic IS NOT NULL) prevents
   * duplicates; the PG 23505 error is mapped to a 409 MobileRepoError.
   *
   * Returns the new seller row (full profile — the handler must not forward
   * CNIC to the client; return only the id and masked fields).
   */
  async createSeller(input: CreateSellerInput): Promise<SellerRow> {
    const now = this.nowIso();
    const id  = this.newId();

    try {
      const result = await this.pool.query<SellerRow>(
        `INSERT INTO mobile_sellers (
           id, organization_id,
           name, father_name, cnic, phone, alternate_phone,
           address, city, verification_status,
           is_active, notes,
           created_by, updated_by, created_at, updated_at
         ) VALUES (
           $1,  $2,
           $3,  $4,  $5,  $6,  $7,
           $8,  $9,  'UNVERIFIED',
           1,   $10,
           $11, NULL, $12, $12
         )
         RETURNING *`,
        [
          id, input.organization_id,
          input.name,
          input.father_name   ?? null,
          input.cnic          ?? null,
          input.phone,
          input.alternate_phone ?? null,
          input.address,
          input.city          ?? null,
          input.notes         ?? null,
          input.created_by,
          now,
        ]
      );
      return result.rows[0];
    } catch (err: unknown) {
      const pgErr = err as { code?: string; constraint?: string };
      if (pgErr?.code === '23505' && pgErr.constraint === 'idx_mobile_sellers_org_cnic') {
        throw new MobileRepoError(
          'SELLER_CNIC_DUPLICATE: A seller with this CNIC already exists in your organization',
          409
        );
      }
      throw err;
    }
  }

  /**
   * Searches the mobile_sellers registry (org-scoped).
   *
   * Returns masked seller summaries suitable for selection dropdowns.
   * Full CNIC, address, and father_name are NOT included — callers must
   * use getSellerById for the full profile.
   */
  async searchSellerRegistry(
    organizationId: string,
    q: string,
    limit: number = 20,
    offset: number = 0
  ): Promise<{ sellers: SellerSummaryRow[]; total: number }> {
    const safeLimit  = Math.min(Math.max(1, limit), 50);
    const safeOffset = Math.max(0, offset);
    const pattern    = `%${q.replace(/[%_\\]/g, '\\$&')}%`;

    const countResult = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count
       FROM mobile_sellers
       WHERE organization_id = $1
         AND is_active = 1
         AND (
           name  ILIKE $2
           OR cnic   ILIKE $2
           OR phone  ILIKE $2
         )`,
      [organizationId, pattern]
    );
    const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

    const rows = await this.pool.query<{
      id: string;
      name: string;
      cnic: string | null;
      phone: string;
      city: string | null;
      verification_status: SellerVerificationStatus;
      is_active: number;
    }>(
      `SELECT id, name, cnic, phone, city, verification_status, is_active
       FROM mobile_sellers
       WHERE organization_id = $1
         AND is_active = 1
         AND (
           name  ILIKE $2
           OR cnic   ILIKE $2
           OR phone  ILIKE $2
         )
       ORDER BY name ASC
       LIMIT $3 OFFSET $4`,
      [organizationId, pattern, safeLimit, safeOffset]
    );

    const sellers: SellerSummaryRow[] = rows.rows.map((r) => ({
      id:                  r.id,
      name:                r.name,
      cnic_masked:         this.maskCnic(r.cnic),
      phone:               r.phone,
      city:                r.city,
      verification_status: r.verification_status,
      is_active:           r.is_active,
    }));

    return { sellers, total };
  }

  /**
   * Returns the full seller profile for a given ID.
   *
   * Organization scope is enforced: returns null if the seller does not
   * belong to the authenticated organization.
   */
  async getSellerById(
    sellerId: string,
    organizationId: string
  ): Promise<SellerRow | null> {
    const result = await this.pool.query<SellerRow>(
      `SELECT
         id, organization_id,
         name, father_name, cnic, phone, alternate_phone,
         address, city, verification_status,
         is_active, notes,
         created_by, updated_by, created_at, updated_at
       FROM mobile_sellers
       WHERE id = $1 AND organization_id = $2`,
      [sellerId, organizationId]
    );
    return result.rows[0] ?? null;
  }

  /**
   * Returns the purchase/device history for a seller.
   *
   * Organization scope is enforced. If branchId is supplied, only paperwork
   * from that branch is returned (SHOP_ADMIN branch restriction). Org-admins
   * pass null to see all branches.
   *
   * IMEIs are included when includeImeis is true (callers must verify that
   * the authenticated user has inventory-write permission before passing true).
   */
  async getSellerDevices(
    sellerId: string,
    organizationId: string,
    branchId: string | null,
    includeImeis: boolean = false,
    limit: number = 20,
    offset: number = 0
  ): Promise<{ history: SellerDeviceHistoryRow[]; total: number }> {
    const safeLimit  = Math.min(Math.max(1, limit), 50);
    const safeOffset = Math.max(0, offset);

    const params: unknown[] = [sellerId, organizationId];
    let branchClause = '';
    if (branchId) {
      branchClause = `AND p.branch_id = $${params.length + 1}`;
      params.push(branchId);
    }

    const countResult = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count
       FROM mobile_purchase_paperwork p
       WHERE p.seller_id = $1
         AND p.organization_id = $2
         ${branchClause}`,
      params
    );
    const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

    const listParams = [...params, safeLimit, safeOffset];
    const rows = await this.pool.query<{
      paperwork_id: string;
      voucher_no: string;
      purchase_date: string;
      purchase_price: string;
      snapshot_seller_name: string;
      snapshot_seller_cnic: string;
      device_id: string;
      brand: string;
      model: string;
      storage: string;
      condition: MobileCondition;
      status: MobileStatus;
      branch_id: string;
      branch_name: string | null;
    }>(
      `SELECT
         p.id            AS paperwork_id,
         p.voucher_no,
         p.purchase_date,
         p.purchase_price,
         p.seller_name   AS snapshot_seller_name,
         p.seller_cnic   AS snapshot_seller_cnic,
         d.id            AS device_id,
         d.brand,
         d.model,
         d.storage,
         d.condition,
         d.status,
         p.branch_id,
         b.name          AS branch_name
       FROM mobile_purchase_paperwork p
       INNER JOIN mobile_devices d ON d.id = p.device_id
       LEFT  JOIN branches b      ON b.id  = p.branch_id
       WHERE p.seller_id = $1
         AND p.organization_id = $2
         ${branchClause}
       ORDER BY p.purchase_date DESC, p.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      listParams
    );

    // F-03: Batch-fetch all IMEIs in a single parameterized query instead of N+1 loop queries
    const imeiMap = new Map<string, Array<{ imei: string; slot: MobileSlot }>>();
    if (includeImeis && rows.rows.length > 0) {
      const deviceIds = rows.rows.map((r) => r.device_id);
      const imeiResult = await this.pool.query<{ device_id: string; imei: string; slot: MobileSlot }>(
        `SELECT device_id, imei, slot
         FROM mobile_imei_identifiers
         WHERE device_id = ANY($1::text[]) AND organization_id = $2
         ORDER BY slot`,
        [deviceIds, organizationId]
      );
      for (const imeiRow of imeiResult.rows) {
        let list = imeiMap.get(imeiRow.device_id);
        if (!list) {
          list = [];
          imeiMap.set(imeiRow.device_id, list);
        }
        list.push({ imei: imeiRow.imei, slot: imeiRow.slot });
      }
    }

    const history: SellerDeviceHistoryRow[] = rows.rows.map((row) => ({
      paperwork_id:                row.paperwork_id,
      voucher_no:                  row.voucher_no,
      purchase_date:               row.purchase_date,
      purchase_price:              row.purchase_price,
      snapshot_seller_name:        row.snapshot_seller_name,
      snapshot_seller_cnic_masked: this.maskCnic(row.snapshot_seller_cnic),
      device_id:                   row.device_id,
      brand:                       row.brand,
      model:                       row.model,
      storage:                     row.storage,
      condition:                   row.condition,
      status:                      row.status,
      branch_id:                   row.branch_id,
      branch_name:                 row.branch_name,
      ...(includeImeis ? { imeis: imeiMap.get(row.device_id) ?? [] } : {}),
    }));

    return { history, total };
  }

  /**
   * Updates editable fields on a seller profile.
   *
   * Only phone, alternate_phone, address, city, verification_status, is_active,
   * and notes may be updated. CNIC and name changes are intentionally blocked
   * to prevent silent identity substitution.
   *
   * Records the update in change_logs (seller entity audit trail).
   * Returns the updated full seller row, or null if not found / wrong org.
   */
  async updateSeller(input: UpdateSellerInput): Promise<SellerRow | null> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const current = await client.query<SellerRow>(
        `SELECT * FROM mobile_sellers
         WHERE id = $1 AND organization_id = $2
         FOR UPDATE`,
        [input.seller_id, input.organization_id]
      );

      if (current.rows.length === 0) {
        await client.query('ROLLBACK');
        return null;
      }

      const s   = current.rows[0];
      const now = this.nowIso();

      const newPhone       = input.phone               !== undefined ? input.phone               : s.phone;
      const newAltPhone    = input.alternate_phone      !== undefined ? input.alternate_phone      : s.alternate_phone;
      const newAddress     = input.address             !== undefined ? input.address             : s.address;
      const newCity        = input.city                !== undefined ? input.city                : s.city;
      const newVerifStatus = input.verification_status !== undefined ? input.verification_status : s.verification_status;
      const newIsActive    = input.is_active           !== undefined ? input.is_active           : s.is_active;
      const newNotes       = input.notes               !== undefined ? input.notes               : s.notes;

      await client.query(
        `UPDATE mobile_sellers
         SET phone               = $1,
             alternate_phone     = $2,
             address             = $3,
             city                = $4,
             verification_status = $5,
             is_active           = $6,
             notes               = $7,
             updated_by          = $8,
             updated_at          = $9
         WHERE id = $10`,
        [
          newPhone, newAltPhone, newAddress, newCity,
          newVerifStatus, newIsActive, newNotes,
          input.updated_by, now,
          input.seller_id,
        ]
      );

      // Audit trail via change_logs (branch-attributed when active branch provided)
      const auditBranchId = typeof input.branch_id === 'string' ? input.branch_id.trim() : null;
      if (auditBranchId) {
        // Enforce tenant boundary: branch must belong to caller's organization
        const branchCheck = await client.query<{ exists: boolean }>(
          `SELECT EXISTS(
             SELECT 1 FROM branches
             WHERE id = $1 AND organization_id = $2
           ) AS exists`,
          [auditBranchId, input.organization_id]
        );
        if (!branchCheck.rows[0]?.exists) {
          await client.query('ROLLBACK');
          throw new MobileRepoError('Target branch does not belong to your organization', 403);
        }

        await writeChangeLogEntry(client, {
          organizationId: input.organization_id,
          branchId:       auditBranchId,
          eventType:      'MOBILE_SELLER_UPDATED',
          entityType:     'mobile_seller',
          entityId:       input.seller_id,
          payloadStr:     JSON.stringify({
            seller_id:           input.seller_id,
            updated_by:          input.updated_by,
            verification_status: newVerifStatus,
            is_active:           newIsActive,
            // phone, address, city omitted — sensitive
          }),
        });
      }

      await client.query('COMMIT');
      return this.getSellerById(input.seller_id, input.organization_id);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async getBranchInvestmentSummary(
    organizationId: string,
    branchId: string
  ): Promise<BranchInvestmentSummary> {
    const result = await this.pool.query<{
      total_investment: string;
      new_investment: string;
      used_investment: string;
      total_in_stock: string;
      new_in_stock: string;
      used_in_stock: string;
    }>(
      `SELECT
         COALESCE(SUM(cost_price) FILTER (WHERE status = 'IN_STOCK'), 0)::numeric(12,2)                          AS total_investment,
         COALESCE(SUM(cost_price) FILTER (WHERE status = 'IN_STOCK' AND condition = 'NEW'), 0)::numeric(12,2)    AS new_investment,
         COALESCE(SUM(cost_price) FILTER (WHERE status = 'IN_STOCK' AND condition = 'USED'), 0)::numeric(12,2)   AS used_investment,
         COUNT(*)        FILTER (WHERE status = 'IN_STOCK')::int                                                 AS total_in_stock,
         COUNT(*)        FILTER (WHERE status = 'IN_STOCK' AND condition = 'NEW')::int                           AS new_in_stock,
         COUNT(*)        FILTER (WHERE status = 'IN_STOCK' AND condition = 'USED')::int                          AS used_in_stock
       FROM mobile_devices
       WHERE organization_id = $1
         AND branch_id = $2`,
      [organizationId, branchId]
    );

    const row = result.rows[0];
    return {
      total_investment: parseFloat(row?.total_investment || '0'),
      new_investment:   parseFloat(row?.new_investment   || '0'),
      used_investment:  parseFloat(row?.used_investment  || '0'),
      total_in_stock:   parseInt(row?.total_in_stock     || '0', 10),
      new_in_stock:     parseInt(row?.new_in_stock       || '0', 10),
      used_in_stock:    parseInt(row?.used_in_stock      || '0', 10),
    };
  }

  async getMobileOrganizationSummary(organizationId: string): Promise<MobileOrganizationSummary> {
    const orgTotalsResult = await this.pool.query<{
      total_devices: string;
      new_count: string;
      used_count: string;
      in_stock_count: string;
      inspection_count: string;
      sold_count: string;
      total_valuation: string;
      new_valuation: string;
      used_valuation: string;
    }>(
      `SELECT
         COUNT(*)::int AS total_devices,
         COUNT(*) FILTER (WHERE condition = 'NEW')::int AS new_count,
         COUNT(*) FILTER (WHERE condition = 'USED')::int AS used_count,
         COUNT(*) FILTER (WHERE status = 'IN_STOCK')::int AS in_stock_count,
         COUNT(*) FILTER (WHERE status = 'INSPECTION')::int AS inspection_count,
         COUNT(*) FILTER (WHERE status = 'SOLD')::int AS sold_count,
         COALESCE(SUM(cost_price) FILTER (WHERE status = 'IN_STOCK'), 0)::numeric(12,2)                        AS total_valuation,
         COALESCE(SUM(cost_price) FILTER (WHERE status = 'IN_STOCK' AND condition = 'NEW'), 0)::numeric(12,2)  AS new_valuation,
         COALESCE(SUM(cost_price) FILTER (WHERE status = 'IN_STOCK' AND condition = 'USED'), 0)::numeric(12,2) AS used_valuation
       FROM mobile_devices
       WHERE organization_id = $1`,
      [organizationId]
    );

    const branchBreakdownResult = await this.pool.query<{
      branch_id: string;
      branch_name: string;
      branch_code: string;
      total_devices: string;
      in_stock_count: string;
      inspection_count: string;
      sold_count: string;
      new_count: string;
      used_count: string;
      total_valuation: string;
      new_valuation: string;
      used_valuation: string;
    }>(
      `SELECT
         b.id AS branch_id,
         b.name AS branch_name,
         b.code AS branch_code,
         COUNT(d.id)::int AS total_devices,
         COUNT(d.id) FILTER (WHERE d.status = 'IN_STOCK')::int AS in_stock_count,
         COUNT(d.id) FILTER (WHERE d.status = 'INSPECTION')::int AS inspection_count,
         COUNT(d.id) FILTER (WHERE d.status = 'SOLD')::int AS sold_count,
         COUNT(d.id) FILTER (WHERE d.condition = 'NEW')::int AS new_count,
         COUNT(d.id) FILTER (WHERE d.condition = 'USED')::int AS used_count,
         COALESCE(SUM(d.cost_price) FILTER (WHERE d.status = 'IN_STOCK'), 0)::numeric(12,2)                        AS total_valuation,
         COALESCE(SUM(d.cost_price) FILTER (WHERE d.status = 'IN_STOCK' AND d.condition = 'NEW'), 0)::numeric(12,2) AS new_valuation,
         COALESCE(SUM(d.cost_price) FILTER (WHERE d.status = 'IN_STOCK' AND d.condition = 'USED'), 0)::numeric(12,2) AS used_valuation
       FROM branches b
       LEFT JOIN mobile_devices d ON d.branch_id = b.id AND d.organization_id = b.organization_id
       WHERE b.organization_id = $1
       GROUP BY b.id, b.name, b.code
       ORDER BY b.name ASC`,
      [organizationId]
    );

    const orgRow = orgTotalsResult.rows[0];
    const branches: MobileBranchSummaryItem[] = branchBreakdownResult.rows.map((r) => ({
      branch_id: r.branch_id,
      branch_name: r.branch_name,
      branch_code: r.branch_code,
      total_devices: parseInt(r.total_devices || '0', 10),
      in_stock_count: parseInt(r.in_stock_count || '0', 10),
      inspection_count: parseInt(r.inspection_count || '0', 10),
      sold_count: parseInt(r.sold_count || '0', 10),
      new_count: parseInt(r.new_count || '0', 10),
      used_count: parseInt(r.used_count || '0', 10),
      total_valuation: parseFloat(r.total_valuation || '0'),
      new_valuation: parseFloat(r.new_valuation || '0'),
      used_valuation: parseFloat(r.used_valuation || '0'),
    }));

    return {
      total_devices: parseInt(orgRow?.total_devices || '0', 10),
      new_count: parseInt(orgRow?.new_count || '0', 10),
      used_count: parseInt(orgRow?.used_count || '0', 10),
      in_stock_count: parseInt(orgRow?.in_stock_count || '0', 10),
      inspection_count: parseInt(orgRow?.inspection_count || '0', 10),
      sold_count: parseInt(orgRow?.sold_count || '0', 10),
      total_valuation: parseFloat(orgRow?.total_valuation || '0'),
      new_valuation: parseFloat(orgRow?.new_valuation || '0'),
      used_valuation: parseFloat(orgRow?.used_valuation || '0'),
      branches,
    };
  }

  /**
   * Verifies that the specified branch belongs to the authenticated organization.
   */
  async isBranchInOrganization(organizationId: string, branchId: string): Promise<boolean> {
    const result = await this.pool.query<{ exists: boolean }>(
      `SELECT EXISTS(
         SELECT 1 FROM branches
         WHERE id = $1 AND organization_id = $2
       ) AS exists`,
      [branchId, organizationId]
    );
    return result.rows[0]?.exists === true;
  }
  // -------------------------------------------------------------------------
  // Phase 2 — getNextVoucherNumber (branch-locked sequential allocation)
  // -------------------------------------------------------------------------

  /**
   * Allocates and returns the next sequential voucher number for a branch.
   *
   * MUST be called inside an existing open transaction with the same client.
   * Locks the branch row (`FOR UPDATE`) so concurrent registrations for the
   * same branch serialize correctly — each receives a distinct number.
   *
   * Sequence starts at 1001 when no numeric voucher exists for the branch.
   * Non-numeric legacy values are skipped safely via the `~ '^[0-9]+$'` guard.
   * Returns the allocated number as a string (e.g. "1001").
   */
  async getNextVoucherNumber(branchId: string, client: PoolClient): Promise<string> {
    // Lock the branch row to serialize concurrent same-branch allocations.
    // Different branches lock different rows and proceed in parallel.
    await client.query(
      `SELECT id FROM branches WHERE id = $1 FOR UPDATE`,
      [branchId]
    );

    // MAX over numeric-only vouchers; defaults to 1000 so first allocation = 1001.
    const result = await client.query<{ next_no: string }>(
      `SELECT (
         COALESCE(
           MAX(
             CASE WHEN voucher_no ~ '^[0-9]+$'
             THEN voucher_no::BIGINT
             ELSE 0 END
           ),
           1000
         ) + 1
       )::TEXT AS next_no
       FROM mobile_purchase_paperwork
       WHERE branch_id = $1`,
      [branchId]
    );

    const nextNo = result.rows[0]?.next_no ?? '1001';
    return nextNo;
  }

  // -------------------------------------------------------------------------
  // Phase 2 — getMobileFullProfile (complete detail for MobileDetailModal)
  // -------------------------------------------------------------------------

  /**
   * Returns a complete device profile including device specs, IMEIs, paperwork,
   * seller details, and inspection data in a single efficient call.
   *
   * Authorization: caller must have already verified organization ownership
   * and branch visibility. This method enforces organization_id and branch_id
   * scoping but does NOT enforce role-based field visibility — the route
   * handler is responsible for filtering sensitive seller fields per role.
   *
   * Follows the fail-closed audit pattern: paperwork access is audited inside
   * the same transaction; data is returned only after the audit commits.
   *
   * Returns null when the device is not found in the given org/branch scope.
   */
  async getMobileFullProfile(
    deviceId: string,
    organizationId: string,
    branchId: string,
    accessedBy: string
  ): Promise<MobileFullProfile | null> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // ── Device + IMEIs ───────────────────────────────────────────────────
      const deviceResult = await client.query<MobileDeviceRow>(
        `SELECT
           d.id, d.organization_id, d.branch_id,
           d.brand, d.model, d.storage, d.ram, d.color, d.serial_number,
           d.pta_status, d.condition, d.status,
           d.cost_price, d.expected_sale_price,
           d.supplier_id, d.sale_id, d.notes,
           d.created_by, d.updated_by, d.created_at, d.updated_at,
           b.name AS branch_name,
           b.code AS branch_code
         FROM mobile_devices d
         LEFT JOIN branches b ON b.id = d.branch_id
         WHERE d.id = $1 AND d.organization_id = $2 AND d.branch_id = $3`,
        [deviceId, organizationId, branchId]
      );

      if (deviceResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return null;
      }

      const deviceRow = deviceResult.rows[0];
      const branchName = (deviceRow as MobileDeviceRow & { branch_name?: string | null }).branch_name ?? null;
      const branchCode = (deviceRow as MobileDeviceRow & { branch_code?: string | null }).branch_code ?? null;

      const imeiResult = await client.query<{ id: string; imei: string; slot: MobileSlot }>(
        `SELECT id, imei, slot FROM mobile_imei_identifiers
         WHERE device_id = $1 AND organization_id = $2
         ORDER BY slot`,
        [deviceId, organizationId]
      );
      deviceRow.imeis = imeiResult.rows;

      // ── Paperwork + Seller (USED devices only) ───────────────────────────
      let paperwork: MobileFullProfile['paperwork'] = null;

      if (deviceRow.condition === 'USED') {
        const pwResult = await client.query<{
          id: string;
          voucher_no: string;
          purchase_date: string;
          purchase_price: string;
          seller_name: string;
          father_name: string;
          seller_cnic: string;
          seller_phone: string;
          seller_address: string;
          ownership_declaration_acknowledged: boolean;
          physical_affidavit_acknowledged: boolean;
          seller_id: string | null;
          recorded_by: string;
          created_at: string;
        }>(
          `SELECT
             id, voucher_no, purchase_date, purchase_price,
             seller_name, father_name, seller_cnic, seller_phone, seller_address,
             ownership_declaration_acknowledged, physical_affidavit_acknowledged,
             seller_id, recorded_by, created_at
           FROM mobile_purchase_paperwork
           WHERE device_id = $1 AND organization_id = $2 AND branch_id = $3`,
          [deviceId, organizationId, branchId]
        );

        if (pwResult.rows.length > 0) {
          const pw = pwResult.rows[0];

          // Fail-closed audit — paperwork access is logged before data is returned
          await this.writeAuditEntry(client, {
            organizationId,
            branchId,
            eventType: 'MOBILE_PAPERWORK_ACCESSED',
            entityId: deviceId,
            eventPayload: {
              device_id:   deviceId,
              branch_id:   branchId,
              voucher_no:  pw.voucher_no,
              accessed_by: accessedBy,
              source:      'full_profile',
              // seller_cnic, father_name, seller_phone, seller_address excluded
            },
          });

          paperwork = {
            id:            pw.id,
            voucher_no:    pw.voucher_no,
            purchase_date: pw.purchase_date,
            purchase_price: pw.purchase_price,
            recorded_by:   pw.recorded_by,
            created_at:    pw.created_at,
            seller: {
              seller_id:       pw.seller_id ?? null,
              seller_name:     pw.seller_name,
              father_name:     pw.father_name,
              seller_cnic:     pw.seller_cnic,
              seller_cnic_masked: this.maskCnic(pw.seller_cnic),
              // Full phone/address returned here — route handler strips for non-admin roles
              seller_phone:    pw.seller_phone,
              seller_address:  pw.seller_address,
              ownership_declaration_acknowledged: pw.ownership_declaration_acknowledged,
              physical_affidavit_acknowledged:    pw.physical_affidavit_acknowledged,
            },
          };
        }
      }

      // ── Inspection ───────────────────────────────────────────────────────
      const inspResult = await client.query<MobileInspectionRow>(
        `SELECT
           id, device_id, organization_id,
           body_grade, screen_condition, battery_health_percent,
           touch_working, battery_backup_ok,
           front_camera_ok, back_camera_ok,
           speaker_ok, microphone_ok, charging_port_ok,
           buttons_ok, biometrics_ok,
           wifi_bluetooth_ok, sim_network_ok,
           accessories_box, accessories_original_charger,
           accessories_cable, accessories_handsfree,
           defect_notes,
           inspected_by, updated_by, created_at, updated_at
         FROM mobile_inspection_records
         WHERE device_id = $1 AND organization_id = $2`,
        [deviceId, organizationId]
      );

      const inspection = inspResult.rows[0] ?? null;

      await client.query('COMMIT');

      return {
        device:      deviceRow,
        paperwork,
        inspection,
        branch_name: branchName,
        branch_code: branchCode,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }


}
