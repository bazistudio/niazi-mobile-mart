/**
 * Mobile Inventory Routes — Phase C
 *
 * Implements all approved Phase C endpoints:
 *   POST   /                  — register a NEW or USED phone
 *   GET    /                  — list devices (branch-scoped)
 *   GET    /imei-check        — IMEI availability probe
 *   POST   /sellers           — create a permanent seller (Phase 2)
 *   GET    /sellers           — search/list sellers in registry (Phase 2)
 *   GET    /sellers/search    — used-phone seller autofill (must be before /:id)
 *   GET    /sellers/:sellerId — seller profile (Phase 2, must be before /:id)
 *   GET    /sellers/:sellerId/devices — seller purchase history (Phase 2)
 *   PATCH  /sellers/:sellerId — update seller profile (Phase 2)
 *   GET    /branch-summary    — branch-scoped investment summary (must be before /:id)
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
  SellerSearchResult,
  SellerVerificationStatus,
  SellerRow,
  SellerSummaryRow,
  CreateSellerInput,
  UpdateSellerInput,
  BranchInvestmentSummary,
  RegisterMobileDeviceInput,
  RegisterImeiInput,
  RegisterInspectionInput,
  RegisterPaperworkInput,
  PatchMobileDeviceInput,
  MobileFullProfile,
  FullProfileSellerInfo,
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
   * If allowAll is true and branch_id is omitted or 'all', returns null (consolidated org view).
   * SHOP_ADMIN is locked to JWT claim.
   *
   * Returns the resolved branch_id string (or null if all branches allowed), or sends 400/403 and returns undefined.
   */
  async function resolveReadBranchId(
    identity: RequestIdentity,
    queryBranchId: unknown,
    res: Response,
    allowAll = false
  ): Promise<string | null | undefined> {
    if (isOrgAdmin(identity)) {
      if (!isNonBlankString(queryBranchId) || queryBranchId === 'all' || queryBranchId === '*') {
        if (allowAll) return null; // Consolidated all branches
        res.status(400).json({ error: 'branch_id query parameter is required for organization administrators' });
        return undefined;
      }
      const branchId = (queryBranchId as string).trim();
      const belongs = await repo.isBranchInOrganization(identity.organization_id, branchId);
      if (!belongs) {
        res.status(403).json({ error: 'FORBIDDEN', message: 'Target branch does not belong to your organization' });
        return undefined;
      }
      return branchId;
    }
    const branchId = identity.branch_id;
    if (!branchId) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'No branch assigned to this account' });
      return undefined;
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
  // GET /summary — organization-wide consolidated summary (Org Admin only)
  // Must be defined BEFORE /:id to avoid route shadowing.
  // -------------------------------------------------------------------------

  /**
   * GET /summary
   *
   * Returns organization-wide consolidated mobile inventory summary and per-branch breakdown.
   * Restricted strictly to Organization Administrators (role = ADMIN).
   * Requires INVENTORY_VIEW.
   */
  router.get('/summary', async (req: Request, res: Response) => {
    if (!requireInventoryView(req, res)) return;

    const identity = req.identity!;
    if (!isOrgAdmin(identity)) {
      res.status(403).json({
        error: 'FORBIDDEN',
        message: 'Consolidated mobile inventory summary is restricted to organization administrators',
      });
      return;
    }

    try {
      const summary = await repo.getMobileOrganizationSummary(identity.organization_id);
      res.status(200).json({ summary });
    } catch (err) {
      handleMobileError(res, err, 'org-summary');
    }
  });

  // -------------------------------------------------------------------------
  // GET /sellers/search — used-phone seller autofill (must be before /:id)
  // -------------------------------------------------------------------------

  /**
   * GET /sellers/search?q=<term>
   *
   * Searches historical mobile_purchase_paperwork for previously recorded sellers.
   * Returns deduplicated seller details (by CNIC) for autofill in the AddMobileForm.
   *
   * Security:
   *   - Requires INVENTORY_VIEW permission.
   *   - SHOP_ADMIN: restricted to their own branch only.
   *   - Org-admin: searches across all branches in their organization.
   *   - Response fields are limited to autofill-necessary fields only.
   *     Seller CNIC, phone, address are intentionally included for autofill
   *     but MUST NOT be exposed through normal device list/detail endpoints.
   *
   * Query params:
   *   q    — search term (min 2, max 100 chars); required
   *   limit — max results (1–20, default 10)
   */
  router.get('/sellers/search', async (req: Request, res: Response) => {
    if (!requireInventoryView(req, res)) return;
    const identity = req.identity!;

    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!q || q.length < 2) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'Query parameter q must be at least 2 characters' });
      return;
    }
    if (q.length > 100) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'Query parameter q must not exceed 100 characters' });
      return;
    }

    const rawLimit = parseInt(String(req.query.limit || '10'), 10);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 20) : 10;

    // Branch resolution: SHOP_ADMIN is restricted to their own branch; org-admin searches all
    const branchId: string | null = isBranchAdmin(identity) && !isOrgAdmin(identity)
      ? (identity.branch_id ?? null)
      : null;

    try {
      const sellers: SellerSearchResult[] = await repo.searchSellers(
        identity.organization_id,
        branchId,
        q,
        limit
      );
      res.status(200).json({ sellers });
    } catch (err) {
      handleMobileError(res, err, 'sellers-search');
    }
  });

  // -------------------------------------------------------------------------
  // GET /branch-summary — branch-scoped investment summary (must be before /:id)
  // -------------------------------------------------------------------------

  /**
   * GET /branch-summary?branch_id=<uuid>
   *
   * Returns branch-scoped investment totals broken down by condition (NEW/USED).
   * Only IN_STOCK devices are included.
   *
   * Branch resolution follows the same rules as the device list:
   *   - Org-admin: must supply branch_id query param (validated membership).
   *   - SHOP_ADMIN: branch_id is taken from their JWT identity (param ignored).
   *
   * Responds to the active filter: the caller passes the desired condition
   * in the UI but the endpoint always returns all three totals
   * (total, new, used) and the UI selects the appropriate value.
   */
  router.get('/branch-summary', async (req: Request, res: Response) => {
    if (!requireInventoryView(req, res)) return;
    const identity = req.identity!;

    try {
      const branchId = await resolveReadBranchId(identity, req.query.branch_id, res);
      if (!branchId) return;

      const summary: BranchInvestmentSummary = await repo.getBranchInvestmentSummary(
        identity.organization_id,
        branchId
      );
      res.status(200).json({ summary });
    } catch (err) {
      handleMobileError(res, err, 'branch-summary');
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
  // -------------------------------------------------------------------------
  // GET /next-sr-no -- preview next voucher number for a branch
  // Must be defined BEFORE /:id to avoid route shadowing.
  // -------------------------------------------------------------------------

  /**
   * GET /next-sr-no?branch_id=<uuid>
   *
   * Returns the anticipated next sequential voucher/Sr No for the given branch.
   * This is a PREVIEW ONLY -- it does NOT reserve the number. The actual
   * allocation happens inside registerMobileDeviceTx via getNextVoucherNumber().
   *
   * Security:
   *   - Requires authenticated session and INVENTORY_VIEW permission.
   *   - Validates branch ownership via resolveReadBranchId (prevents
   *     probing another branch's sequence by changing query param).
   *
   * Response: { next_sr_no: string, branch_id: string }
   */
  router.get('/next-sr-no', async (req: Request, res: Response) => {
    if (!requireInventoryView(req, res)) return;

    const identity = req.identity!;

    const branchId = await resolveReadBranchId(identity, req.query.branch_id, res);
    if (branchId === undefined) return;
    if (!branchId) {
      res.status(400).json({ error: 'branch_id query parameter is required' });
      return;
    }

    try {
      // Preview query -- does NOT lock the branch row (no FOR UPDATE).
      // The advisory nature is intentional: the registration transaction
      // allocates the authoritative number with a branch row lock.
      const result = await pool.query<{ next_no: string }>(
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
      const next_sr_no = result.rows[0]?.next_no ?? '1001';
      res.status(200).json({ next_sr_no, branch_id: branchId });
    } catch (err) {
      handleMobileError(res, err, 'next-sr-no');
    }
  });

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
      let validVoucherNo = '';
      if (pw.voucher_no !== undefined) {
        if (!isNonBlankString(pw.voucher_no)) {
          res.status(400).json({ error: 'paperwork.voucher_no must not be blank when provided' });
          return;
        }
        validVoucherNo = pw.voucher_no.trim();
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
      // F-01: Validate and forward optional seller_id if present
      let validSellerId: string | undefined = undefined;
      if (pw.seller_id !== undefined && pw.seller_id !== null) {
        if (!isNonBlankString(pw.seller_id)) {
          res.status(400).json({ error: 'paperwork.seller_id must not be blank when provided' });
          return;
        }
        validSellerId = String(pw.seller_id).trim();
      }

      paperworkInput = {
        voucher_no:                          validVoucherNo,
        purchase_date:                       pw.purchase_date,
        purchase_price:                      Number(pw.purchase_price),
        seller_name:                         pw.seller_name,
        father_name:                         pw.father_name,
        seller_cnic:                         pw.seller_cnic,
        seller_phone:                        pw.seller_phone,
        seller_address:                      pw.seller_address,
        seller_id:                           validSellerId,
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
    const branchId = await resolveReadBranchId(identity, req.query.branch_id, res, true);
    if (branchId === undefined) return;

    const limit  = parseInt(String(req.query.limit  ?? '50'), 10);
    const offset = parseInt(String(req.query.offset ?? '0'),  10);

    if (isNaN(limit) || limit < 1 || limit > 500) {
      res.status(400).json({ error: 'limit must be an integer between 1 and 500' });
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
  // =========================================================================
  // Seller Registry — Phase 2 (must be before /:id to avoid route collision)
  // =========================================================================

  /**
   * POST /sellers
   *
   * Creates a new seller in the permanent registry.
   *
   * Security:
   *   - Requires inventory-write permission.
   *   - organization_id and created_by are derived from the JWT (never client-supplied).
   *   - CNIC must be in DDDDD-DDDDDDD-D format when provided.
   *   - Duplicate CNIC within the org → 409 with SELLER_CNIC_DUPLICATE error code.
   *
   * Body: { name, father_name?, cnic?, phone, alternate_phone?, address, city?, notes? }
   * Returns: { seller: { id, name, cnic_masked, phone, city, verification_status } }
   */
  router.post('/sellers', async (req: Request, res: Response) => {
    if (!requireInventoryWrite(req, res)) return;
    const identity = req.identity!;

    const body = req.body as Partial<CreateSellerInput & Record<string, unknown>>;

    // Validate required fields
    if (!isNonBlankString(body.name)) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'name is required' });
      return;
    }
    if (!isNonBlankString(body.phone)) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'phone is required' });
      return;
    }
    if (!isNonBlankString(body.address)) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'address is required' });
      return;
    }
    // CNIC: optional, but if provided must be valid format
    const rawCnic = typeof body.cnic === 'string' && body.cnic.trim() ? body.cnic.trim() : null;
    if (rawCnic !== null && !isValidCnic(rawCnic)) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'cnic must be in format DDDDD-DDDDDDD-D' });
      return;
    }

    const input: CreateSellerInput = {
      organization_id:  identity.organization_id,
      created_by:       identity.user_id,
      name:             String(body.name).trim(),
      father_name:      isNonBlankString(body.father_name) ? String(body.father_name).trim() : null,
      cnic:             rawCnic,
      phone:            String(body.phone).trim(),
      alternate_phone:  isNonBlankString(body.alternate_phone) ? String(body.alternate_phone).trim() : null,
      address:          String(body.address).trim(),
      city:             isNonBlankString(body.city) ? String(body.city).trim() : null,
      notes:            isNonBlankString(body.notes) ? String(body.notes).trim() : null,
    };

    try {
      const seller: SellerRow = await repo.createSeller(input);
      // Return safe summary (never expose full CNIC or address in response)
      res.status(201).json({
        seller: {
          id:                  seller.id,
          name:                seller.name,
          cnic_masked:         seller.cnic
                                 ? seller.cnic.replace(/^(\d{5})-(\d{7})-(\d)$/, '$1-*******-$3')
                                 : null,
          phone:               seller.phone,
          city:                seller.city,
          verification_status: seller.verification_status,
          is_active:           seller.is_active,
        },
      });
    } catch (err) {
      handleMobileError(res, err, 'sellers-create');
    }
  });

  /**
   * GET /sellers?q=...&limit=...&offset=...
   *
   * Searches the mobile_sellers registry (org-scoped).
   *
   * Security:
   *   - Requires INVENTORY_VIEW permission.
   *   - CNIC is masked in all results.
   *   - Full address/notes are never returned in list results.
   *
   * Query params:
   *   q       — search term (min 2, max 100 chars); required
   *   limit   — max results (1–50, default 20)
   *   offset  — pagination offset (default 0)
   *
   * Returns: { sellers: SellerSummaryRow[], total: number }
   */
  router.get('/sellers', async (req: Request, res: Response) => {
    if (!requireInventoryView(req, res)) return;
    const identity = req.identity!;

    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!q || q.length < 2) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'Query parameter q must be at least 2 characters' });
      return;
    }
    if (q.length > 100) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'Query parameter q must not exceed 100 characters' });
      return;
    }

    const rawLimit  = parseInt(String(req.query.limit  || '20'), 10);
    const rawOffset = parseInt(String(req.query.offset || '0'),  10);
    const limit  = Number.isFinite(rawLimit)  ? Math.min(Math.max(rawLimit, 1), 50) : 20;
    const offset = Number.isFinite(rawOffset) ? Math.max(rawOffset, 0) : 0;

    try {
      const { sellers, total } = await repo.searchSellerRegistry(
        identity.organization_id,
        q,
        limit,
        offset
      );
      res.status(200).json({ sellers, total });
    } catch (err) {
      handleMobileError(res, err, 'sellers-list');
    }
  });

  /**
   * GET /sellers/:sellerId
   *
   * Returns the full profile for a single seller.
   *
   * Security:
   *   - Requires INVENTORY_VIEW permission.
   *   - Organization scope is enforced by the repository.
   *   - Full CNIC and address are included (authorized profile access).
   *
   * Returns: { seller: SellerRow } or 404 if not found / wrong org.
   */
  router.get('/sellers/:sellerId', async (req: Request, res: Response) => {
    if (!requireInventoryView(req, res)) return;
    const identity = req.identity!;

    const sellerId = typeof req.params.sellerId === 'string'
      ? req.params.sellerId.trim()
      : '';
    if (!sellerId) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'sellerId is required' });
      return;
    }

    try {
      const seller: SellerRow | null = await repo.getSellerById(
        sellerId,
        identity.organization_id
      );
      if (!seller) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Seller not found' });
        return;
      }
      res.status(200).json({ seller });
    } catch (err) {
      handleMobileError(res, err, 'sellers-get');
    }
  });

  /**
   * GET /sellers/:sellerId/devices?limit=...&offset=...
   *
   * Returns the purchase/device history for a seller.
   *
   * Security:
   *   - Requires INVENTORY_VIEW permission.
   *   - SHOP_ADMIN: scoped to their branch only.
   *   - Org-admin: sees all branches.
   *   - IMEIs are included only when the caller also has inventory-write permission.
   *   - CNIC snapshot is masked.
   *
   * Returns: { history: SellerDeviceHistoryRow[], total: number }
   */
  router.get('/sellers/:sellerId/devices', async (req: Request, res: Response) => {
    if (!requireInventoryView(req, res)) return;
    const identity = req.identity!;

    const sellerId = typeof req.params.sellerId === 'string'
      ? req.params.sellerId.trim()
      : '';
    if (!sellerId) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'sellerId is required' });
      return;
    }

    const rawLimit  = parseInt(String(req.query.limit  || '20'), 10);
    const rawOffset = parseInt(String(req.query.offset || '0'),  10);
    const limit  = Number.isFinite(rawLimit)  ? Math.min(Math.max(rawLimit, 1), 50) : 20;
    const offset = Number.isFinite(rawOffset) ? Math.max(rawOffset, 0) : 0;

    // Branch restriction: SHOP_ADMIN sees only their own branch
    const branchId: string | null = isBranchAdmin(identity) && !isOrgAdmin(identity)
      ? (identity.branch_id ?? null)
      : null;

    // IMEIs included only for users with write permission (hides sensitive IMEI data from view-only)
    const profile = identity.access_profile;
    const includeImeis =
      isBranchAdmin(identity) ||
      (Array.isArray(profile?.allowed_actions) &&
        profile.allowed_actions.length > 0 &&
        profile.allowed_actions.some((a: string) => a === '*' || a === 'inventory:edit'));

    try {
      const { history, total } = await repo.getSellerDevices(
        sellerId,
        identity.organization_id,
        branchId,
        includeImeis,
        limit,
        offset
      );
      res.status(200).json({ history, total });
    } catch (err) {
      handleMobileError(res, err, 'sellers-devices');
    }
  });

  /**
   * PATCH /sellers/:sellerId
   *
   * Updates editable fields on a seller profile.
   *
   * Security:
   *   - Requires inventory-write permission.
   *   - Organization scope enforced by repository.
   *   - CNIC and name updates are intentionally blocked.
   *
   * Body (all optional): { phone?, alternate_phone?, address?, city?,
   *                        verification_status?, is_active?, notes? }
   * Returns: { seller: SellerRow } (full profile of updated seller)
   */
  router.patch('/sellers/:sellerId', async (req: Request, res: Response) => {
    if (!requireInventoryWrite(req, res)) return;
    const identity = req.identity!;

    const sellerId = typeof req.params.sellerId === 'string'
      ? req.params.sellerId.trim()
      : '';
    if (!sellerId) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'sellerId is required' });
      return;
    }

    const body = req.body as Partial<UpdateSellerInput & Record<string, unknown>>;

    // Validate optional fields that are present
    if (body.phone !== undefined && !isNonBlankString(body.phone)) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'phone must not be blank' });
      return;
    }
    if (body.address !== undefined && !isNonBlankString(body.address)) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'address must not be blank' });
      return;
    }
    const VALID_VERIFICATION_STATUSES: SellerVerificationStatus[] = ['UNVERIFIED', 'IDENTITY_RECORDED', 'FLAGGED'];
    if (body.verification_status !== undefined) {
      // F-04: Restrict changing verification_status (especially FLAGGED) to Organization Admin / ADMIN
      if (!isOrgAdmin(identity)) {
        res.status(403).json({
          error: 'FORBIDDEN',
          message: 'Only organization administrators can update seller verification status',
        });
        return;
      }
      if (!VALID_VERIFICATION_STATUSES.includes(body.verification_status as SellerVerificationStatus)) {
        res.status(400).json({
          error: 'BAD_REQUEST',
          message: `verification_status must be one of: ${VALID_VERIFICATION_STATUSES.join(', ')}`,
        });
        return;
      }
    }
    if (body.is_active !== undefined && body.is_active !== 0 && body.is_active !== 1) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'is_active must be 0 or 1' });
      return;
    }

    // Resolve optional branch attribution for change_log audit trail:
    // If body.branch_id is explicitly supplied, validate tenant boundary (must belong to caller's org).
    // Otherwise, fall back to operator's assigned identity.branch_id if present.
    let branchId: string | null = null;
    if (body.branch_id !== undefined) {
      if (!isNonBlankString(body.branch_id)) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'branch_id must not be blank if provided' });
        return;
      }
      const candidateBranchId = String(body.branch_id).trim();
      const belongs = await repo.isBranchInOrganization(identity.organization_id, candidateBranchId);
      if (!belongs) {
        res.status(403).json({ error: 'FORBIDDEN', message: 'Target branch does not belong to your organization' });
        return;
      }
      branchId = candidateBranchId;
    } else if (identity.branch_id) {
      branchId = identity.branch_id;
    }

    const input: UpdateSellerInput = {
      seller_id:           sellerId,
      organization_id:     identity.organization_id,
      updated_by:          identity.user_id,
      branch_id:           branchId ?? undefined,
      phone:               body.phone               !== undefined ? String(body.phone).trim()    : undefined,
      alternate_phone:     body.alternate_phone      !== undefined
                             ? (isNonBlankString(body.alternate_phone) ? String(body.alternate_phone).trim() : null)
                             : undefined,
      address:             body.address             !== undefined ? String(body.address).trim()  : undefined,
      city:                body.city                !== undefined
                             ? (isNonBlankString(body.city) ? String(body.city).trim() : null)
                             : undefined,
      verification_status: body.verification_status !== undefined
                             ? (body.verification_status as SellerVerificationStatus)
                             : undefined,
      is_active:           body.is_active           !== undefined ? Number(body.is_active)       : undefined,
      notes:               body.notes               !== undefined
                             ? (isNonBlankString(body.notes) ? String(body.notes).trim() : null)
                             : undefined,
    };

    try {
      const seller: SellerRow | null = await repo.updateSeller(input);
      if (!seller) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Seller not found' });
        return;
      }
      res.status(200).json({ seller });
    } catch (err) {
      handleMobileError(res, err, 'sellers-update');
    }
  });

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
  // -------------------------------------------------------------------------
  // GET /:id/full-profile -- complete device detail (device + paperwork + inspection)
  // Must be before PATCH /:id (both match /:id param)
  // -------------------------------------------------------------------------

  /**
   * GET /:id/full-profile?branch_id=<uuid>
   *
   * Returns a complete mobile record including:
   *   - Device specs, IMEIs, branch info
   *   - Purchase paperwork and seller details (USED only, fail-closed audit)
   *   - Inspection data
   *
   * Role-based field visibility:
   *   - Org Admin (ADMIN): full seller details (phone, address, father_name)
   *   - SHOP_ADMIN / branch users: CNIC is masked; phone and address are
   *     redacted from the response to protect seller privacy.
   *
   * Requires INVENTORY_VIEW.
   * Returns 404 if device not found in org/branch scope.
   */
  router.get('/:id/full-profile', async (req: Request, res: Response) => {
    if (!requireInventoryView(req, res)) return;

    const identity = req.identity!;
    const deviceId = typeof req.params.id === 'string' ? req.params.id : String(req.params.id ?? '');

    let branchId: string | null = null;
    if (isOrgAdmin(identity) && (!req.query.branch_id || !isNonBlankString(req.query.branch_id))) {
      const devCheck = await pool.query<{ branch_id: string }>(
        `SELECT branch_id FROM mobile_devices WHERE id = $1 AND organization_id = $2`,
        [deviceId, identity.organization_id]
      );
      if (devCheck.rows.length === 0) {
        res.status(404).json({ error: 'Device not found' });
        return;
      }
      branchId = devCheck.rows[0].branch_id;
    } else {
      const resolved = await resolveReadBranchId(identity, req.query.branch_id, res);
      if (resolved === undefined) return;
      if (!resolved) {
        res.status(400).json({ error: 'branch_id query parameter is required' });
        return;
      }
      branchId = resolved;
    }

    try {
      const profile: MobileFullProfile | null = await repo.getMobileFullProfile(
        deviceId,
        identity.organization_id,
        branchId,
        identity.user_id
      );

      if (!profile) {
        res.status(404).json({ error: 'Device not found' });
        return;
      }

      // Role-based seller field visibility:
      // Non-org-admin roles see CNIC masked and phone/address redacted.
      if (profile.paperwork?.seller && !isOrgAdmin(identity)) {
        profile.paperwork.seller = {
          ...profile.paperwork.seller,
          father_name:    '[REDACTED]',
          seller_phone:   '[REDACTED]',
          seller_address: '[REDACTED]',
        };
      }

      res.status(200).json({ profile });
    } catch (err) {
      handleMobileError(res, err, 'full-profile');
    }
  });

  router.patch('/:id', async (req: Request, res: Response) => {
    if (!requireInventoryWrite(req, res)) return;

    const identity = req.identity!;
    const deviceId = typeof req.params.id === 'string' ? req.params.id : String(req.params.id ?? '');
    const body = req.body ?? {};

    // SECURITY: Under MOB-FIX-05, ALL mobile record edits (both NEW and USED)
    // require Organization Admin authority. Branch users receive 403 FORBIDDEN.
    if (!isOrgAdmin(identity)) {
      res.status(403).json({
        error: 'FORBIDDEN',
        message: 'Only organization administrators may update mobile inventory records',
      });
      return;
    }

    const branchId = await resolveWriteBranchId(identity, body.branch_id, res);
    if (!branchId) return;

    // Define allowed keys before evaluating request body (prevents TDZ ReferenceError)
    const orgAdminOnlyKeys = new Set([
      'brand', 'model', 'storage', 'ram', 'color', 'serial_number',
      'purchase_date', 'purchase_price',
      'body_grade', 'screen_condition', 'battery_health_percent', 'defect_notes',
    ]);
    const ALLOWED_PATCH_BODY_KEYS = new Set([
      'branch_id', 'status', 'expected_sale_price', 'pta_status', 'notes',
      // Org-admin USED-device fields:
      'brand', 'model', 'storage', 'ram', 'color', 'serial_number',
      'purchase_date', 'purchase_price',
      'body_grade', 'screen_condition', 'battery_health_percent', 'defect_notes',
    ]);

    // Reject unknown / immutable fields (DEF-03)
    const unknownKeys = Object.keys(body).filter((k) => !ALLOWED_PATCH_BODY_KEYS.has(k));
    if (unknownKeys.length > 0) {
      res.status(400).json({
        error: `Disallowed or unknown field(s) in PATCH request: ${unknownKeys.join(', ')}`,
      });
      return;
    }

    // Reject org-admin-only keys if caller is not org-admin
    const hasOrgAdminOnlyKey = Object.keys(body).some((k) => orgAdminOnlyKeys.has(k));
    if (hasOrgAdminOnlyKey && !isOrgAdmin(identity)) {
      res.status(403).json({
        error: 'FORBIDDEN',
        message: 'Only organization administrators may update device specifications, paperwork, or inspection fields',
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

    if (body.body_grade !== undefined) {
      if (!MOBILE_BODY_GRADES.includes(body.body_grade)) {
        res.status(400).json({ error: `body_grade must be one of: ${MOBILE_BODY_GRADES.join(', ')}` });
        return;
      }
    }

    if (body.screen_condition !== undefined) {
      if (!MOBILE_SCREEN_CONDITIONS.includes(body.screen_condition)) {
        res.status(400).json({ error: `screen_condition must be one of: ${MOBILE_SCREEN_CONDITIONS.join(', ')}` });
        return;
      }
    }

    if (body.battery_health_percent !== undefined && body.battery_health_percent !== null) {
      if (!isValidBatteryHealth(body.battery_health_percent)) {
        res.status(400).json({ error: 'battery_health_percent must be an integer between 1 and 100 when provided' });
        return;
      }
    }

    if (body.purchase_price !== undefined) {
      if (!isPositivePrice(body.purchase_price)) {
        res.status(400).json({ error: 'purchase_price must be a positive number when provided' });
        return;
      }
    }

    // SECURITY: Load device to check condition before allowing USED-device edit.
    // If the device is USED and caller is not Org Admin -> 403.
    // This check runs in the DB so it cannot be bypassed via client body.
    if (!isOrgAdmin(identity)) {
      const existing = await repo.getMobileDevice(deviceId, identity.organization_id, branchId);
      if (!existing) {
        res.status(404).json({ error: 'Device not found' });
        return;
      }
      if (existing.condition === 'USED') {
        res.status(403).json({
          error: 'FORBIDDEN',
          message: 'Only organization administrators may edit USED mobile records',
        });
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
      // Org-admin USED-device fields (undefined when not provided = unchanged)
      brand:          body.brand   !== undefined ? String(body.brand).trim()   : undefined,
      model:          body.model   !== undefined ? String(body.model).trim()   : undefined,
      storage:        body.storage !== undefined ? String(body.storage).trim() : undefined,
      ram:            body.ram     !== undefined ? (body.ram ?? null)           : undefined,
      color:          body.color   !== undefined ? (body.color ?? null)         : undefined,
      serial_number:  body.serial_number !== undefined ? (body.serial_number ?? null) : undefined,
      purchase_date:  body.purchase_date  !== undefined ? String(body.purchase_date).trim()  : undefined,
      purchase_price: body.purchase_price !== undefined ? Number(body.purchase_price)        : undefined,
      body_grade:          body.body_grade          !== undefined ? body.body_grade          : undefined,
      screen_condition:    body.screen_condition    !== undefined ? body.screen_condition    : undefined,
      battery_health_percent: body.battery_health_percent !== undefined
        ? (body.battery_health_percent !== null ? Number(body.battery_health_percent) : null)
        : undefined,
      defect_notes:        body.defect_notes !== undefined ? (body.defect_notes ?? null) : undefined,
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
