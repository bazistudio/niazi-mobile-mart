/**
 * Mobile Inventory Routes — Phase C
 *
 * Implements all approved Phase C endpoints:
 *   POST   /                  — register a NEW or USED phone
 *   GET    /                  — list devices (branch-scoped)
 *   GET    /imei-check        — IMEI availability probe
 *   GET    /:id               — single device detail
 *   GET    /:id/paperwork     — USED-phone paperwork (fail-closed transactional audit)
 *   PATCH  /:id               — restricted update (status / notes / expected_sale_price / pta_status)
 *
 * Authentication: every route requires a valid active session via buildAuthMiddleware(pool).
 *
 * F-02 — Explicit write authorization:
 *   requireInventoryWrite() checks isBranchAdmin(identity) first (passes through for
 *   SHOP_ADMIN and ADMIN). For non-admin staff it checks allowed_actions for an
 *   explicit 'inventory:edit' or '*' grant — default-deny when allowed_actions is
 *   empty. This matches hasProductActionAccess() semantics, not the legacy
 *   hasActionAccess() fallback that allows staff with empty allowed_actions.
 *
 * Branch isolation:
 *   Org-admin: branch_id from request body (validated non-blank).
 *   SHOP_ADMIN: branch_id from identity.branch_id (body branch_id is ignored).
 *   Others denied by F-02.
 *
 * Sensitive paperwork fields (seller_cnic, father_name, seller_phone, seller_address):
 *   Never returned by list / detail / IMEI-check endpoints.
 *   The paperwork endpoint uses a fail-closed transactional audit — data is only
 *   returned after the audit entry has been committed.
 *
 * Do NOT use the setImmediate() post-response audit pattern here.
 */

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import {
  buildAuthMiddleware,
  authorizePermission,
  isOrgAdmin,
  isBranchAdmin,
  canAccessBranch,
  RequestIdentity,
} from '../auth';
import {
  MobileRepo,
  MobileRepoError,
  RegisterMobileDeviceInput,
  RegisterImeiInput,
  RegisterInspectionInput,
  RegisterPaperworkInput,
  PatchMobileDeviceInput,
} from '../repositories/mobile.repo';
import {
  MOBILE_CONDITIONS,
  MOBILE_PTA_STATUSES,
  MOBILE_STATUSES,
  MOBILE_SLOTS,
  MOBILE_BODY_GRADES,
  MOBILE_SCREEN_CONDITIONS,
  isValidImei,
  isValidCnic,
  isNonBlankString,
  isNonNegativePrice,
  isPositivePrice,
  isValidBatteryHealth,
  pricesAreEqual,
  validateSupplierLinkage,
  isPermittedStatusTransition,
  MobileCondition,
  MobileStatus,
} from './mobile.validation';

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

export function buildMobileRouter(pool: Pool): Router {
  const router = Router();

  // Authentication middleware — every mobile route requires a valid active session.
  router.use(buildAuthMiddleware(pool));

  const repo = new MobileRepo(pool);

  // -------------------------------------------------------------------------
  // Permission helpers
  // -------------------------------------------------------------------------

  /**
   * Requires INVENTORY_VIEW page permission.
   * Returns false and sends 401/403 if the check fails.
   */
  function requireInventoryView(req: Request, res: Response): boolean {
    const identity = req.identity;
    if (!identity) {
      res.status(401).json({ error: 'Not authenticated' });
      return false;
    }
    const err = authorizePermission(identity, 'inventory', null);
    if (err) {
      res.status(403).json({ error: 'FORBIDDEN', message: err });
      return false;
    }
    return true;
  }

  /**
   * F-02 — Strict inventory write authorization.
   *
   * Strategy:
   *   1. isBranchAdmin (SHOP_ADMIN or ADMIN) → pass through.
   *   2. Otherwise: require explicit 'inventory:edit' or '*' in allowed_actions.
   *      Empty allowed_actions → default-deny (no fallback to staff roles).
   *
   * This mirrors the hasProductActionAccess() internal logic from auth.ts —
   * NOT the legacy hasActionAccess() fallback that allows SALESMAN/CASHIER/
   * STAFF/MANAGER/ACCOUNTANT when allowed_actions is empty.
   *
   * Returns false and sends 401/403 if the check fails.
   */
  function requireInventoryWrite(req: Request, res: Response): boolean {
    const identity = req.identity;
    if (!identity) {
      res.status(401).json({ error: 'Not authenticated' });
      return false;
    }

    // Fast path: branch-admin or org-admin passes without checking actions
    if (isBranchAdmin(identity)) return true;

    // Strict action check — default-deny when allowed_actions is empty
    const profile = identity.access_profile;
    const hasExplicitGrant =
      Array.isArray(profile?.allowed_actions) &&
      profile.allowed_actions.length > 0 &&
      profile.allowed_actions.some((a: string) => a === '*' || a === 'inventory:edit');

    if (!hasExplicitGrant) {
      res.status(403).json({
        error: 'FORBIDDEN',
        message: 'Inventory write operations require branch-admin role or explicit inventory:edit permission',
      });
      return false;
    }
    return true;
  }

  /**
   * Resolves the effective branch_id for a write operation.
   *
   * - Org-admin: uses branch_id from request body (must be non-blank and belong to authenticated org).
   * - SHOP_ADMIN: uses identity.branch_id (body value is ignored).
   *
   * Returns the resolved branch_id string, or sends 400/403 and returns null.
   * Caller must return immediately if null is returned.
   */
  async function resolveWriteBranchId(
    identity: RequestIdentity,
    bodyBranchId: unknown,
    res: Response
  ): Promise<string | null> {
    if (isOrgAdmin(identity)) {
      if (!isNonBlankString(bodyBranchId)) {
        res.status(400).json({ error: 'branch_id is required for organization administrators' });
        return null;
      }
      const branchId = (bodyBranchId as string).trim();
      const belongs = await repo.isBranchInOrganization(identity.organization_id, branchId);
      if (!belongs) {
        res.status(403).json({ error: 'FORBIDDEN', message: 'Target branch does not belong to your organization' });
        return null;
      }
      return branchId;
    }
    // SHOP_ADMIN — branch locked to JWT claim
    const branchId = identity.branch_id;
    if (!branchId) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'No branch assigned to this account' });
      return null;
    }
    return branchId;
  }

  /**
   * Resolves and validates the branch_id for a read operation.
   * Org-admin can pass branch_id as a query param (verified to belong to authenticated org);
   * SHOP_ADMIN is locked to JWT claim.
   *
   * Returns the resolved branch_id string, or sends 400/403 and returns null.
   */
  async function resolveReadBranchId(
    identity: RequestIdentity,
    queryBranchId: unknown,
    res: Response
  ): Promise<string | null> {
    if (isOrgAdmin(identity)) {
      if (!isNonBlankString(queryBranchId)) {
        res.status(400).json({ error: 'branch_id query parameter is required for organization administrators' });
        return null;
      }
      const branchId = (queryBranchId as string).trim();
      const belongs = await repo.isBranchInOrganization(identity.organization_id, branchId);
      if (!belongs) {
        res.status(403).json({ error: 'FORBIDDEN', message: 'Target branch does not belong to your organization' });
        return null;
      }
      return branchId;
    }
    const branchId = identity.branch_id;
    if (!branchId) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'No branch assigned to this account' });
      return null;
    }
    return branchId;
  }

  // -------------------------------------------------------------------------
  // GET /health — domain health check (Phase B, kept)
  // -------------------------------------------------------------------------

  router.get('/health', (req: Request, res: Response) => {
    if (!requireInventoryView(req, res)) return;
    res.status(200).json({
      status: 'ok',
      domain: 'mobile_inventory',
      phase: 'C — registration, list, detail, paperwork, IMEI-check, PATCH implemented',
    });
  });

  // -------------------------------------------------------------------------
  // GET /imei-check — IMEI availability probe
  // Must be defined BEFORE /:id to avoid route shadowing.
  // -------------------------------------------------------------------------

  /**
   * GET /imei-check?imei=<15digits>
   *
   * Returns { imei, available: boolean }.
   * Requires INVENTORY_VIEW.
   * Does not reveal which device holds a taken IMEI.
   */
  router.get('/imei-check', async (req: Request, res: Response) => {
    if (!requireInventoryView(req, res)) return;

    const { imei } = req.query;
    if (!isValidImei(imei)) {
      res.status(400).json({ error: 'imei must be exactly 15 decimal digits' });
      return;
    }

    try {
      const identity = req.identity!;
      const result = await repo.checkImeiAvailability(identity.organization_id, imei as string);
      res.status(200).json(result);
    } catch (err) {
      handleMobileError(res, err, 'imei-check');
    }
  });

  // -------------------------------------------------------------------------
  // POST / — register a NEW or USED mobile device
  // -------------------------------------------------------------------------

  /**
   * POST /
   *
   * Body (NEW):
   * {
   *   branch_id?: string,   // required for org-admin; ignored for SHOP_ADMIN
   *   brand: string,
   *   model: string,
   *   storage: string,
   *   ram?: string,
   *   color?: string,
   *   serial_number?: string,
   *   pta_status: 'PTA_APPROVED'|'NON_PTA'|'JV'|'GEVEY',
   *   condition: 'NEW',
   *   cost_price: number,
   *   expected_sale_price?: number,
   *   supplier_id?: string,   // optional for NEW
   *   notes?: string,
   *   imei1: string,          // primary IMEI (15 digits)
   *   imei2?: string,         // secondary IMEI (optional)
   *   inspection: { body_grade, screen_condition, battery_health_percent?, ... }
   * }
   *
   * Body (USED): same as NEW, plus:
   * {
   *   condition: 'USED',
   *   paperwork: {
   *     voucher_no: string,
   *     purchase_date: string,   // ISO date
   *     purchase_price: number,  // must equal cost_price
   *     seller_name: string,
   *     father_name: string,
   *     seller_cnic: string,     // DDDDD-DDDDDDD-D
   *     seller_phone: string,
   *     seller_address: string,
   *     ownership_declaration_acknowledged: boolean,
   *     physical_affidavit_acknowledged: boolean,
   *   }
   * }
   *
   * Requires INVENTORY_EDIT (F-02 strict check).
   * Returns 201 { device_id } on success.
   */
  router.post('/', async (req: Request, res: Response) => {
    if (!requireInventoryWrite(req, res)) return;

    const identity = req.identity!;
    const body = req.body ?? {};

    // ── Branch resolution ───────────────────────────────────────────────────
    const branchId = await resolveWriteBranchId(identity, body.branch_id, res);
    if (!branchId) return;

    // ── Required string fields ──────────────────────────────────────────────
    if (!isNonBlankString(body.brand)) {
      res.status(400).json({ error: 'brand is required' });
      return;
    }
    if (!isNonBlankString(body.model)) {
      res.status(400).json({ error: 'model is required' });
      return;
    }
    if (!isNonBlankString(body.storage)) {
      res.status(400).json({ error: 'storage is required' });
      return;
    }
    if (!MOBILE_PTA_STATUSES.includes(body.pta_status)) {
      res.status(400).json({
        error: `pta_status must be one of: ${MOBILE_PTA_STATUSES.join(', ')}`,
      });
      return;
    }
    if (!MOBILE_CONDITIONS.includes(body.condition)) {
      res.status(400).json({
        error: `condition must be one of: ${MOBILE_CONDITIONS.join(', ')}`,
      });
      return;
    }

    const condition = body.condition as MobileCondition;

    // ── Monetary validation (F-01) ──────────────────────────────────────────
    if (!isNonNegativePrice(body.cost_price)) {
      res.status(400).json({ error: 'cost_price must be a non-negative number' });
      return;
    }
    if (body.expected_sale_price !== undefined && body.expected_sale_price !== null) {
      if (!isNonNegativePrice(body.expected_sale_price)) {
        res.status(400).json({ error: 'expected_sale_price must be a non-negative number when provided' });
        return;
      }
    }

    // ── Supplier linkage ────────────────────────────────────────────────────
    const supplierErr = validateSupplierLinkage(condition, body.supplier_id ?? null);
    if (supplierErr) {
      res.status(400).json({ error: supplierErr });
      return;
    }

    // ── IMEI validation ─────────────────────────────────────────────────────
    if (!isValidImei(body.imei1)) {
      res.status(400).json({ error: 'imei1 must be exactly 15 decimal digits' });
      return;
    }
    const imeis: RegisterImeiInput[] = [{ imei: body.imei1, slot: 'IMEI1' }];
    if (body.imei2 !== undefined && body.imei2 !== null && body.imei2 !== '') {
      if (!isValidImei(body.imei2)) {
        res.status(400).json({ error: 'imei2 must be exactly 15 decimal digits when provided' });
        return;
      }
      if (body.imei1 === body.imei2) {
        res.status(400).json({ error: 'imei1 and imei2 must be different' });
        return;
      }
      imeis.push({ imei: body.imei2, slot: 'IMEI2' });
    }

    // ── Inspection validation ───────────────────────────────────────────────
    const insp = body.inspection;
    if (!insp || typeof insp !== 'object') {
      res.status(400).json({ error: 'inspection object is required' });
      return;
    }
    if (!MOBILE_BODY_GRADES.includes(insp.body_grade)) {
      res.status(400).json({
        error: `inspection.body_grade must be one of: ${MOBILE_BODY_GRADES.join(', ')}`,
      });
      return;
    }
    if (!MOBILE_SCREEN_CONDITIONS.includes(insp.screen_condition)) {
      res.status(400).json({
        error: `inspection.screen_condition must be one of: ${MOBILE_SCREEN_CONDITIONS.join(', ')}`,
      });
      return;
    }
    if (!isValidBatteryHealth(insp.battery_health_percent)) {
      res.status(400).json({ error: 'inspection.battery_health_percent must be an integer between 1 and 100 when provided' });
      return;
    }

    const inspectionInput: RegisterInspectionInput = {
      body_grade:               insp.body_grade,
      screen_condition:         insp.screen_condition,
      battery_health_percent:   insp.battery_health_percent ?? null,
      touch_working:            insp.touch_working,
      battery_backup_ok:        insp.battery_backup_ok,
      front_camera_ok:          insp.front_camera_ok,
      back_camera_ok:           insp.back_camera_ok,
      speaker_ok:               insp.speaker_ok,
      microphone_ok:            insp.microphone_ok,
      charging_port_ok:         insp.charging_port_ok,
      buttons_ok:               insp.buttons_ok,
      biometrics_ok:            insp.biometrics_ok,
      wifi_bluetooth_ok:        insp.wifi_bluetooth_ok,
      sim_network_ok:           insp.sim_network_ok,
      accessories_box:              insp.accessories_box,
      accessories_original_charger: insp.accessories_original_charger,
      accessories_cable:            insp.accessories_cable,
      accessories_handsfree:        insp.accessories_handsfree,
      defect_notes:             insp.defect_notes ?? null,
    };

    // ── USED-phone paperwork validation ─────────────────────────────────────
    let paperworkInput: RegisterPaperworkInput | undefined;
    if (condition === 'USED') {
      const pw = body.paperwork;
      if (!pw || typeof pw !== 'object') {
        res.status(400).json({ error: 'paperwork is required for USED devices' });
        return;
      }
      if (!isNonBlankString(pw.voucher_no)) {
        res.status(400).json({ error: 'paperwork.voucher_no is required and must not be blank' });
        return;
      }
      if (!isNonBlankString(pw.purchase_date)) {
        res.status(400).json({ error: 'paperwork.purchase_date is required' });
        return;
      }
      if (!isPositivePrice(pw.purchase_price)) {
        res.status(400).json({ error: 'paperwork.purchase_price must be a positive number' });
        return;
      }
      // F-01: integer-paisas comparison — cost_price and purchase_price must be equal
      if (!pricesAreEqual(body.cost_price, pw.purchase_price)) {
        res.status(400).json({
          error: 'For USED devices, cost_price and paperwork.purchase_price must be exactly equal',
        });
        return;
      }
      if (!isNonBlankString(pw.seller_name)) {
        res.status(400).json({ error: 'paperwork.seller_name is required' });
        return;
      }
      if (!isNonBlankString(pw.father_name)) {
        res.status(400).json({ error: 'paperwork.father_name is required' });
        return;
      }
      if (!isValidCnic(pw.seller_cnic)) {
        res.status(400).json({ error: 'paperwork.seller_cnic must be in format DDDDD-DDDDDDD-D' });
        return;
      }
      if (!isNonBlankString(pw.seller_phone)) {
        res.status(400).json({ error: 'paperwork.seller_phone is required' });
        return;
      }
      if (!isNonBlankString(pw.seller_address)) {
        res.status(400).json({ error: 'paperwork.seller_address is required' });
        return;
      }
      if (pw.ownership_declaration_acknowledged !== true) {
        res.status(400).json({ error: 'paperwork.ownership_declaration_acknowledged must be true' });
        return;
      }
      if (pw.physical_affidavit_acknowledged !== true) {
        res.status(400).json({ error: 'paperwork.physical_affidavit_acknowledged must be true' });
        return;
      }

      paperworkInput = {
        voucher_no:                          pw.voucher_no.trim(),
        purchase_date:                       pw.purchase_date,
        purchase_price:                      Number(pw.purchase_price),
        seller_name:                         pw.seller_name,
        father_name:                         pw.father_name,
        seller_cnic:                         pw.seller_cnic,
        seller_phone:                        pw.seller_phone,
        seller_address:                      pw.seller_address,
        ownership_declaration_acknowledged:  true,
        physical_affidavit_acknowledged:     true,
      };
    }

    // ── Build repository input and execute transaction ──────────────────────
    const repoInput: RegisterMobileDeviceInput = {
      organization_id:     identity.organization_id,
      branch_id:           branchId,
      created_by:          identity.user_id,
      brand:               (body.brand as string).trim(),
      model:               (body.model as string).trim(),
      storage:             (body.storage as string).trim(),
      ram:                 isNonBlankString(body.ram) ? body.ram : null,
      color:               isNonBlankString(body.color) ? body.color : null,
      serial_number:       isNonBlankString(body.serial_number) ? body.serial_number : null,
      pta_status:          body.pta_status,
      condition,
      cost_price:          Number(body.cost_price),
      expected_sale_price: body.expected_sale_price != null ? Number(body.expected_sale_price) : null,
      supplier_id:         isNonBlankString(body.supplier_id) ? body.supplier_id : null,
      notes:               isNonBlankString(body.notes) ? body.notes : null,
      imeis:               imeis,
      inspection:          inspectionInput,
      paperwork:           paperworkInput,
    };

    try {
      const deviceId = await repo.registerMobileDeviceTx(repoInput);
      res.status(201).json({ device_id: deviceId });
    } catch (err) {
      handleMobileError(res, err, 'register');
    }
  });

  // -------------------------------------------------------------------------
  // GET / — list devices (branch-scoped)
  // -------------------------------------------------------------------------

  /**
   * GET /?branch_id=<id>&condition=<NEW|USED>&status=<...>&brand=<...>&limit=50&offset=0
   *
   * branch_id query param required for org-admin; ignored (taken from JWT) for SHOP_ADMIN.
   * Requires INVENTORY_VIEW.
   * Returns { devices: MobileDeviceRow[], total: number }.
   * Sensitive paperwork fields are never included.
   */
  router.get('/', async (req: Request, res: Response) => {
    if (!requireInventoryView(req, res)) return;

    const identity = req.identity!;
    const branchId = await resolveReadBranchId(identity, req.query.branch_id, res);
    if (!branchId) return;

    const limit  = parseInt(String(req.query.limit  ?? '50'), 10);
    const offset = parseInt(String(req.query.offset ?? '0'),  10);

    if (isNaN(limit) || limit < 1 || limit > 200) {
      res.status(400).json({ error: 'limit must be an integer between 1 and 200' });
      return;
    }
    if (isNaN(offset) || offset < 0) {
      res.status(400).json({ error: 'offset must be a non-negative integer' });
      return;
    }

    const condition = req.query.condition as string | undefined;
    if (condition && !MOBILE_CONDITIONS.includes(condition as MobileCondition)) {
      res.status(400).json({ error: `condition must be one of: ${MOBILE_CONDITIONS.join(', ')}` });
      return;
    }

    const status = req.query.status as string | undefined;
    if (status && !MOBILE_STATUSES.includes(status as MobileStatus)) {
      res.status(400).json({ error: `status must be one of: ${MOBILE_STATUSES.join(', ')}` });
      return;
    }

    try {
      const result = await repo.listMobileDevices({
        organization_id: identity.organization_id,
        branch_id:       branchId,
        condition:       condition as MobileCondition | undefined,
        status:          status as MobileStatus | undefined,
        brand:           isNonBlankString(req.query.brand) ? (req.query.brand as string) : undefined,
        limit,
        offset,
      });
      res.status(200).json(result);
    } catch (err) {
      handleMobileError(res, err, 'list');
    }
  });

  // -------------------------------------------------------------------------
  // GET /:id — single device detail
  // -------------------------------------------------------------------------

  /**
   * GET /:id?branch_id=<id>   (branch_id required for org-admin)
   *
   * Returns { device: MobileDeviceRow } including IMEI list.
   * Sensitive paperwork fields are never included.
   * Requires INVENTORY_VIEW.
   */
  router.get('/:id', async (req: Request, res: Response) => {
    if (!requireInventoryView(req, res)) return;

    const identity = req.identity!;
    const deviceId = typeof req.params.id === 'string' ? req.params.id : String(req.params.id ?? '');

    const branchId = await resolveReadBranchId(identity, req.query.branch_id, res);
    if (!branchId) return;

    try {
      const device = await repo.getMobileDevice(deviceId, identity.organization_id, branchId);
      if (!device) {
        res.status(404).json({ error: 'Device not found' });
        return;
      }
      res.status(200).json({ device });
    } catch (err) {
      handleMobileError(res, err, 'get-device');
    }
  });

  // -------------------------------------------------------------------------
  // GET /:id/paperwork — USED-phone paperwork (fail-closed transactional audit)
  // -------------------------------------------------------------------------

  /**
   * GET /:id/paperwork?branch_id=<id>   (branch_id required for org-admin)
   *
   * Returns { paperwork: MobilePaperworkRow } including sensitive fields.
   * The paperwork is only returned AFTER the audit entry has been committed
   * to the change_log table (fail-closed pattern from Phase A.3 §10.2).
   *
   * Requires INVENTORY_VIEW.
   * Returns 404 if no paperwork exists (device is NEW or not found in branch).
   */
  router.get('/:id/paperwork', async (req: Request, res: Response) => {
    if (!requireInventoryView(req, res)) return;

    const identity = req.identity!;
    const deviceId = typeof req.params.id === 'string' ? req.params.id : String(req.params.id ?? '');

    const branchId = await resolveReadBranchId(identity, req.query.branch_id, res);
    if (!branchId) return;

    try {
      const paperwork = await repo.getMobilePaperwork(deviceId, identity.organization_id, branchId, identity.user_id);
      if (!paperwork) {
        res.status(404).json({ error: 'Paperwork not found for this device' });
        return;
      }
      res.status(200).json({ paperwork });
    } catch (err) {
      handleMobileError(res, err, 'get-paperwork');
    }
  });

  // -------------------------------------------------------------------------
  // PATCH /:id — restricted device update
  // -------------------------------------------------------------------------

  /**
   * PATCH /:id
   *
   * Body:
   * {
   *   branch_id?: string,          // required for org-admin; ignored for SHOP_ADMIN
   *   status?: 'IN_STOCK'|'INSPECTION',
   *   expected_sale_price?: number|null,
   *   pta_status?: 'PTA_APPROVED'|'NON_PTA'|'JV'|'GEVEY',
   *   notes?: string|null,
   * }
   *
   * Immutable fields (id, organization_id, branch_id, condition, cost_price,
   * created_by, created_at, sale_id, IMEIs, paperwork) must not be in the body;
   * any supplied values for those fields are silently ignored.
   *
   * SOLD is a terminal status — cannot be set or transitioned out of via PATCH.
   * Requires INVENTORY_EDIT (F-02 strict check).
   * Returns 200 { device: MobileDeviceRow } on success.
   */
  router.patch('/:id', async (req: Request, res: Response) => {
    if (!requireInventoryWrite(req, res)) return;

    const identity = req.identity!;
    const deviceId = typeof req.params.id === 'string' ? req.params.id : String(req.params.id ?? '');
    const body = req.body ?? {};

    const branchId = await resolveWriteBranchId(identity, body.branch_id, res);
    if (!branchId) return;

    // Reject unknown / immutable fields (DEF-03)
    const ALLOWED_PATCH_BODY_KEYS = new Set(['branch_id', 'status', 'expected_sale_price', 'pta_status', 'notes']);
    const unknownKeys = Object.keys(body).filter((k) => !ALLOWED_PATCH_BODY_KEYS.has(k));
    if (unknownKeys.length > 0) {
      res.status(400).json({
        error: `Disallowed or unknown field(s) in PATCH request: ${unknownKeys.join(', ')}`,
      });
      return;
    }

    // Validate optional fields when present
    if (body.status !== undefined) {
      if (!MOBILE_STATUSES.includes(body.status)) {
        res.status(400).json({ error: `status must be one of: ${MOBILE_STATUSES.join(', ')}` });
        return;
      }
      if (body.status === 'SOLD') {
        res.status(400).json({ error: 'SOLD status cannot be set via PATCH; it is assigned during the sale workflow' });
        return;
      }
    }

    if (body.expected_sale_price !== undefined && body.expected_sale_price !== null) {
      if (!isNonNegativePrice(body.expected_sale_price)) {
        res.status(400).json({ error: 'expected_sale_price must be a non-negative number when provided' });
        return;
      }
    }

    if (body.pta_status !== undefined) {
      if (!MOBILE_PTA_STATUSES.includes(body.pta_status)) {
        res.status(400).json({ error: `pta_status must be one of: ${MOBILE_PTA_STATUSES.join(', ')}` });
        return;
      }
    }

    const patchInput: PatchMobileDeviceInput = {
      device_id:           deviceId,
      organization_id:     identity.organization_id,
      branch_id:           branchId,
      updated_by:          identity.user_id,
      status:              body.status,
      expected_sale_price: body.expected_sale_price !== undefined
        ? (body.expected_sale_price !== null ? Number(body.expected_sale_price) : null)
        : undefined,
      pta_status:          body.pta_status,
      notes:               body.notes !== undefined ? (body.notes ?? null) : undefined,
    };

    try {
      const updated = await repo.patchMobileDevice(patchInput);
      if (!updated) {
        res.status(404).json({ error: 'Device not found' });
        return;
      }
      res.status(200).json({ device: updated });
    } catch (err) {
      handleMobileError(res, err, 'patch');
    }
  });

  return router;
}

// ---------------------------------------------------------------------------
// Generic error handler
// ---------------------------------------------------------------------------

export function handleMobileError(
  res: Response,
  err: unknown,
  operation: string
): void {
  if (err instanceof MobileRepoError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }
  const pgErr = err as { code?: string; constraint?: string };
  if (pgErr && pgErr.code === '23505') {
    const constraint = String(pgErr.constraint || '');
    if (constraint.includes('imei') || constraint === 'mobile_imei_identifiers_organization_id_imei_key') {
      res.status(409).json({ error: 'IMEI_ALREADY_REGISTERED: An IMEI is already registered in this organization' });
      return;
    }
    if (constraint.includes('voucher') || constraint === 'idx_mobile_paperwork_branch_voucher') {
      res.status(409).json({ error: 'VOUCHER_ALREADY_REGISTERED: Voucher number is already used in this branch' });
      return;
    }
    if (constraint.includes('device_id')) {
      res.status(409).json({ error: 'DEVICE_RECORD_CONFLICT: A record already exists for this device' });
      return;
    }
    res.status(409).json({ error: 'UNIQUE_CONSTRAINT_VIOLATION: A unique constraint was violated' });
    return;
  }
  const message = err instanceof Error ? err.message : String(err);
  // Sensitive seller fields must never appear in error logs — errors from the
  // registration or paperwork flow may reference device IDs but not CNIC/name data.
  console.error(`[mobile] ${operation} failed:`, message);
  res.status(500).json({ error: `${operation} failed` });
}
