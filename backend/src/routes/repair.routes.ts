/**
 * Repair Job Routes
 * Phase A rewrite: atomic transactions, in-tx audit log, finish/delete-part endpoints.
 *
 * Authorization:
 *   GET  /api/repairs                    — authenticated users (all roles)
 *   GET  /api/repairs/:id                — authenticated users (all roles)
 *   POST /api/repairs                    — branch admin+
 *   PUT  /api/repairs/:id/status         — branch admin+
 *   POST /api/repairs/:id/parts          — branch admin+ (deducts stock)
 *   DELETE /api/repairs/:id/parts/:partId — branch admin+ (restores stock if deducted)
 *   POST /api/repairs/:id/payments       — branch admin+ (CASH: requires open session)
 *   POST /api/repairs/:id/finish         — branch admin+ (atomic delivery/settlement)
 *
 * All write endpoints call the *Tx variants which embed writeChangeLogEntry inside
 * the same BEGIN…COMMIT block. There are no setImmediate() fire-and-forget audit calls.
 */

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import {
  buildAuthMiddleware,
  isBranchAdmin,
  isOrgAdmin,
  canAccessBranch,
  RequestIdentity,
} from '../auth';
import {
  listRepairJobs,
  getRepairJobById,
  createRepairJobTx,
  updateRepairStatus,
  addRepairPartTx,
  removeRepairPartTx,
  addRepairPaymentTx,
  completeRepairJobTx,
  updateRepairJobTx,
  deleteRepairJobTx,
  transferRepairJobTx,
  RepairRepoError,
  RepairJobFilters,
} from '../repositories/repair.repo';

// Helper: check if caller has repair management privileges (Branch Admin or REPAIR_MECHANIC)
function canManageRepairs(identity: RequestIdentity): boolean {
  if (!identity) return false;
  if (isBranchAdmin(identity)) return true;
  const role = String(identity.role || '').toUpperCase();
  return role === 'REPAIR_MECHANIC';
}

export function buildRepairRouter(pool: Pool): Router {
  const router = Router();
  router.use(buildAuthMiddleware(pool));

  // ── GET /api/repairs — list with optional filters ──────────────────────────
  router.get('/', async (req: Request, res: Response) => {
    try {
      const identity = req.identity as RequestIdentity;
      const callerIsOrgAdmin = isOrgAdmin(identity);

      const filters: RepairJobFilters = {
        page: req.query['page'] ? Number(req.query['page']) : 1,
        limit: req.query['limit'] ? Number(req.query['limit']) : 20,
        status: (req.query['status'] as string) || undefined,
        customer_id: (req.query['customer_id'] as string) || undefined,
        technician_id: (req.query['technician_id'] as string) || undefined,
      };

      if (!callerIsOrgAdmin) {
        if (!identity.branch_id) {
          res.status(403).json({ error: 'Access denied: No branch assigned to your account' });
          return;
        }
        filters.branch_id = identity.branch_id;
      } else {
        const requestedBranchId = (req.query['branch_id'] as string) || undefined;
        if (requestedBranchId && !canAccessBranch(identity, requestedBranchId)) {
          res.status(403).json({ error: 'Access denied: You do not have permission to view repairs for this branch' });
          return;
        }
        filters.branch_id = requestedBranchId;
      }

      // Enforce organization isolation derived from authenticated identity
      filters.organization_id = identity.organization_id;

      const result = await listRepairJobs(pool, filters);
      res.status(200).json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to list repair jobs' });
    }
  });

  // ── GET /api/repairs/:id ───────────────────────────────────────────────────
  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const identity = req.identity as RequestIdentity;
      const id = req.params['id'] as string;
      const job = await getRepairJobById(pool, id);
      if (!job) {
        res.status(404).json({ error: `Repair job '${id}' not found` });
        return;
      }
      if (!canAccessBranch(identity, (job as any)?.branch_id ?? (job as any)?.branchId ?? null)) {
        res.status(403).json({ error: 'Access denied: You do not have permission to view this repair job' });
        return;
      }
      res.status(200).json(job);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to fetch repair job' });
    }
  });

  // ── POST /api/repairs — create new repair job ──────────────────────────────
  router.post('/', async (req: Request, res: Response) => {
    try {
      const identity = req.identity as RequestIdentity;
      if (!canManageRepairs(identity)) {
        res.status(403).json({ error: 'Forbidden: creating repair jobs requires Admin, ShopAdmin, or Repair Mechanic role' });
        return;
      }

      const body = req.body ?? {};
      const dto = {
        customer_id: body.customer_id || body.customerId || null,
        customer_name: body.customer_name || body.customerName || '',
        customer_phone: body.customer_phone || body.customerPhone || null,
        device: {
          type: body.device?.type || body.deviceType || '',
          brand: body.device?.brand || body.deviceBrand || '',
          model: body.device?.model || body.deviceModel || '',
          color: body.device?.color || body.deviceColor || '',
          imei: body.device?.imei || body.deviceImei || '',
          password: body.device?.password || null,
        },
        accessories: body.accessories ?? {},
        problem_description: body.problem_description || body.problemDescription || body.issueDescription || '',
        initial_inspection: body.initial_inspection || body.initialInspection || [],
        technician_id: body.technician_id || body.technicianId || null,
        priority: body.priority || 'Normal',
        estimated_cost: Number(body.estimated_cost ?? body.estimatedCost ?? 0),
        expected_delivery_date: body.expected_delivery_date || body.expectedDeliveryDate || null,
        internal_notes: body.internal_notes || body.internalNotes || null,
        customer_notes: body.customer_notes || body.customerNotes || null,
        branch_id: body.branch_id || body.branchId || identity.branch_id || null,
        advance_payment: body.advance_payment || body.advancePayment || null,
      };

      if (!canAccessBranch(identity, dto.branch_id)) {
        res.status(403).json({ error: 'Access denied: You do not have permission to create a repair job for this branch' });
        return;
      }

      const job = await createRepairJobTx(pool, dto, identity.user_id, identity.organization_id || '');
      res.status(201).json(job);
    } catch (err: any) {
      if (err instanceof RepairRepoError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      res.status(500).json({ error: err.message || 'Failed to create repair job' });
    }
  });

  // ── PUT /api/repairs/:id/status ────────────────────────────────────────────
  router.put('/:id/status', async (req: Request, res: Response) => {
    try {
      const identity = req.identity as RequestIdentity;
      if (!canManageRepairs(identity)) {
        res.status(403).json({ error: 'Forbidden: updating repair status requires Admin, ShopAdmin, or Repair Mechanic role' });
        return;
      }

      const id = req.params['id'] as string;
      const status = req.body?.status as string | undefined;
      const note = req.body?.note as string | undefined;

      if (!status || typeof status !== 'string' || !status.trim()) {
        res.status(400).json({ error: 'status is required' });
        return;
      }

      const existingJob = await getRepairJobById(pool, id);
      if (!existingJob) {
        res.status(404).json({ error: `Repair job '${id}' not found` });
        return;
      }
      if (!canAccessBranch(identity, (existingJob as any)?.branch_id ?? (existingJob as any)?.branchId ?? null)) {
        res.status(403).json({ error: 'Access denied: You do not have permission to update this repair job' });
        return;
      }

      const job = await updateRepairStatus(pool, id, { status: status.trim(), note }, identity.user_id);
      res.status(200).json(job);
    } catch (err: any) {
      if (err instanceof RepairRepoError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      res.status(500).json({ error: err.message || 'Failed to update repair status' });
    }
  });

  // ── POST /api/repairs/:id/parts — add part (deducts stock atomically) ─────
  router.post('/:id/parts', async (req: Request, res: Response) => {
    try {
      const identity = req.identity as RequestIdentity;
      if (!canManageRepairs(identity)) {
        res.status(403).json({ error: 'Forbidden: adding parts requires Admin, ShopAdmin, or Repair Mechanic role' });
        return;
      }

      const id = req.params['id'] as string;

      const existingJob = await getRepairJobById(pool, id);
      if (!existingJob) {
        res.status(404).json({ error: `Repair job '${id}' not found` });
        return;
      }
      if (!canAccessBranch(identity, (existingJob as any)?.branch_id ?? (existingJob as any)?.branchId ?? null)) {
        res.status(403).json({ error: 'Access denied: You do not have permission to modify this repair job' });
        return;
      }

      const body = req.body ?? {};
      const dto = {
        product_id: body.product_id || body.productId || null,
        product_name: body.product_name || body.productName || '',
        product_sku: body.product_sku || body.productSku || '',
        qty: Number(body.qty ?? body.quantity ?? 0),
        cost: Number(body.cost ?? 0),
        price: Number(body.price ?? 0),
        source_type: body.source_type || body.sourceType || undefined,
      };

      const job = await addRepairPartTx(pool, id, dto, identity.user_id, identity.organization_id || '');
      res.status(200).json(job);
    } catch (err: any) {
      if (err instanceof RepairRepoError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      res.status(500).json({ error: err.message || 'Failed to add part to repair job' });
    }
  });

  // ── DELETE /api/repairs/:id/parts/:partId — remove part (restores stock) ──
  router.delete('/:id/parts/:partId', async (req: Request, res: Response) => {
    try {
      const identity = req.identity as RequestIdentity;
      if (!canManageRepairs(identity)) {
        res.status(403).json({ error: 'Forbidden: removing parts requires Admin, ShopAdmin, or Repair Mechanic role' });
        return;
      }

      const id = req.params['id'] as string;
      const partId = req.params['partId'] as string;

      const existingJob = await getRepairJobById(pool, id);
      if (!existingJob) {
        res.status(404).json({ error: `Repair job '${id}' not found` });
        return;
      }
      if (!canAccessBranch(identity, (existingJob as any)?.branch_id ?? (existingJob as any)?.branchId ?? null)) {
        res.status(403).json({ error: 'Access denied: You do not have permission to modify this repair job' });
        return;
      }

      const job = await removeRepairPartTx(pool, id, partId, identity.user_id, identity.organization_id || '');
      res.status(200).json(job);
    } catch (err: any) {
      if (err instanceof RepairRepoError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      res.status(500).json({ error: err.message || 'Failed to remove part from repair job' });
    }
  });

  // ── POST /api/repairs/:id/payments — add payment (CASH: requires open session)
  router.post('/:id/payments', async (req: Request, res: Response) => {
    try {
      const identity = req.identity as RequestIdentity;
      if (!isBranchAdmin(identity)) {
        res.status(403).json({ error: 'Forbidden: adding payments requires Admin or ShopAdmin role' });
        return;
      }

      const id = req.params['id'] as string;

      const existingJob = await getRepairJobById(pool, id);
      if (!existingJob) {
        res.status(404).json({ error: `Repair job '${id}' not found` });
        return;
      }
      if (!canAccessBranch(identity, (existingJob as any)?.branch_id ?? (existingJob as any)?.branchId ?? null)) {
        res.status(403).json({ error: 'Access denied: You do not have permission to take payment for this repair job' });
        return;
      }

      const body = req.body ?? {};
      const dto = {
        amount: Number(body.amount ?? 0),
        method: body.method || body.payment_method || 'CASH',
        reference: body.reference || body.reference_number || null,
      };

      const job = await addRepairPaymentTx(pool, id, dto, identity.user_id, identity.organization_id || '');
      res.status(200).json(job);
    } catch (err: any) {
      if (err instanceof RepairRepoError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      res.status(500).json({ error: err.message || 'Failed to add payment to repair job' });
    }
  });

  // ── POST /api/repairs/:id/finish — atomic delivery and settlement ──────────
  router.post('/:id/finish', async (req: Request, res: Response) => {
    try {
      const identity = req.identity as RequestIdentity;
      if (!canManageRepairs(identity)) {
        res.status(403).json({ error: 'Forbidden: finishing a repair job requires Admin, ShopAdmin, or Repair Mechanic role' });
        return;
      }

      const id = req.params['id'] as string;

      // Branch-access preflight — completeRepairJobTx will also check, but we want
      // a clean 403 with a consistent message before entering the transaction.
      const existingJob = await getRepairJobById(pool, id);
      if (!existingJob) {
        res.status(404).json({ error: `Repair job '${id}' not found` });
        return;
      }
      if (!canAccessBranch(identity, (existingJob as any)?.branch_id ?? (existingJob as any)?.branchId ?? null)) {
        res.status(403).json({ error: 'Access denied: You do not have permission to finish this repair job' });
        return;
      }

      const body = req.body ?? {};
      const dto = {
        discount: body.discount !== undefined ? Number(body.discount) : undefined,
        additional_charges: body.additional_charges !== undefined ? Number(body.additional_charges) : undefined,
        settlement_payment: body.settlement_payment
          ? {
              amount: Number(body.settlement_payment.amount ?? 0),
              method: body.settlement_payment.method || 'CASH',
              reference: body.settlement_payment.reference || null,
            }
          : null,
        delivery_notes: body.delivery_notes || body.deliveryNotes || null,
      };

      const job = await completeRepairJobTx(pool, id, dto, identity.user_id, identity.organization_id || '');
      res.status(200).json(job);
    } catch (err: any) {
      if (err instanceof RepairRepoError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      res.status(500).json({ error: err.message || 'Failed to finish repair job' });
    }
  });

  // ── PUT /api/repairs/:id — edit / refill update ────────────────────────────
  router.put('/:id', async (req: Request, res: Response) => {
    try {
      const identity = req.identity as RequestIdentity;
      if (!canManageRepairs(identity)) {
        res.status(403).json({ error: 'Forbidden: editing repair jobs requires Admin, ShopAdmin, or Repair Mechanic role' });
        return;
      }

      const id = req.params['id'] as string;
      const body = req.body ?? {};
      const dto = {
        customer_name: body.customer_name || body.customerName,
        customer_phone: body.customer_phone || body.customerPhone,
        device: body.device ? {
          type: body.device.type || '',
          brand: body.device.brand || '',
          model: body.device.model || '',
          color: body.device.color || '',
          imei: body.device.imei || '',
          password: body.device.password || null,
        } : undefined,
        problem_description: body.problem_description || body.problemDescription,
        technician_id: body.technician_id || body.technicianId,
        priority: body.priority,
        estimated_cost: body.estimated_cost !== undefined ? Number(body.estimated_cost) : undefined,
        internal_notes: body.internal_notes || body.internalNotes,
      };

      const updated = await updateRepairJobTx(pool, id, dto, identity.user_id, identity.organization_id || '');
      res.status(200).json(updated);
    } catch (err: any) {
      if (err instanceof RepairRepoError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      res.status(500).json({ error: err.message || 'Failed to update repair job' });
    }
  });

  // ── POST /api/repairs/:id/transfer — transfer job across branches or mechanics ─
  router.post('/:id/transfer', async (req: Request, res: Response) => {
    try {
      const identity = req.identity as RequestIdentity;
      if (!canManageRepairs(identity)) {
        res.status(403).json({ error: 'Forbidden: transferring repair jobs requires Admin, ShopAdmin, or Repair Mechanic role' });
        return;
      }

      const id = req.params['id'] as string;
      const body = req.body || {};
      const targetBranchId = body.target_branch_id || body.targetBranchId;
      const targetTechnicianId = body.target_technician_id || body.targetTechnicianId || null;
      const reason = body.reason || 'Branch/mechanic workload transfer';

      if (!targetBranchId) {
        res.status(400).json({ error: 'target_branch_id is required for transfer' });
        return;
      }

      const transferred = await transferRepairJobTx(
        pool,
        id,
        targetBranchId,
        targetTechnicianId,
        reason,
        identity.user_id,
        identity.organization_id || ''
      );

      res.status(200).json(transferred);
    } catch (err: any) {
      if (err instanceof RepairRepoError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      res.status(500).json({ error: err.message || 'Failed to transfer repair job' });
    }
  });

  // ── DELETE /api/repairs/:id — cancel and delete repair job ─────────────────
  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      const identity = req.identity as RequestIdentity;
      if (!canManageRepairs(identity)) {
        res.status(403).json({ error: 'Forbidden: deleting repair jobs requires Admin, ShopAdmin, or Repair Mechanic role' });
        return;
      }

      const id = req.params['id'] as string;
      const result = await deleteRepairJobTx(pool, id, identity.user_id, identity.organization_id || '');
      res.status(200).json(result);
    } catch (err: any) {
      if (err instanceof RepairRepoError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      res.status(500).json({ error: err.message || 'Failed to delete repair job' });
    }
  });

  return router;
}
