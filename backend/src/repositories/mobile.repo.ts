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
  voucher_no: string;
  purchase_date: string;        // ISO date string
  purchase_price: number;       // Must equal cost_price
  seller_name: string;
  father_name: string;          // sensitive
  seller_cnic: string;          // sensitive
  seller_phone: string;         // sensitive
  seller_address: string;       // sensitive
  ownership_declaration_acknowledged: boolean;
  physical_affidavit_acknowledged: boolean;
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
  branch_id: string;
  condition?: MobileCondition;
  status?: MobileStatus;
  brand?: string;
  limit?: number;
  offset?: number;
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
        const voucherTaken = await this.isVoucherTaken(
          input.branch_id,
          input.paperwork.voucher_no,
          client
        );
        if (voucherTaken) {
          throw new MobileRepoError(
            `VOUCHER_ALREADY_REGISTERED: voucher number "${input.paperwork.voucher_no}" is already used in this branch`,
            409
          );
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
        await client.query(
          `INSERT INTO mobile_purchase_paperwork (
             id, device_id, organization_id, branch_id,
             voucher_no, purchase_date, purchase_price,
             seller_name, father_name, seller_cnic, seller_phone, seller_address,
             ownership_declaration_acknowledged, physical_affidavit_acknowledged,
             recorded_by, created_at, updated_at
           ) VALUES (
             $1,  $2,  $3,  $4,
             $5,  $6,  $7,
             $8,  $9,  $10, $11, $12,
             $13, $14,
             $15, $16, $16
           )`,
          [
            pwId, deviceId, orgId, input.branch_id,
            pw.voucher_no, pw.purchase_date, String(pw.purchase_price),
            pw.seller_name, pw.father_name, pw.seller_cnic,
            pw.seller_phone, pw.seller_address,
            pw.ownership_declaration_acknowledged,
            pw.physical_affidavit_acknowledged,
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

    const params: unknown[] = [filter.organization_id, filter.branch_id];
    let where = `d.organization_id = $1 AND d.branch_id = $2`;
    let paramIdx = 3;

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
         (SELECT imei FROM mobile_imei_identifiers
          WHERE device_id = d.id AND slot = 'IMEI1' LIMIT 1) AS imei1,
         (SELECT imei FROM mobile_imei_identifiers
          WHERE device_id = d.id AND slot = 'IMEI2' LIMIT 1) AS imei2
       FROM mobile_devices d
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

      await client.query(
        `UPDATE mobile_devices
         SET status              = $1,
             expected_sale_price = $2,
             pta_status          = $3,
             notes               = $4,
             updated_by          = $5,
             updated_at          = $6
         WHERE id = $7`,
        [
          newStatus, newExpectedSalePrice, newPtaStatus,
          newNotes, input.updated_by, now,
          input.device_id,
        ]
      );

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
}
