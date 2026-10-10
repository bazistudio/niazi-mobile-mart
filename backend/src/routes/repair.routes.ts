/**
 * Repair Job Routes
 * P6: Real PostgreSQL-backed repair job management, replacing mocked repair.api.ts
 *
 * Authorization:
 *   GET /api/repairs         — authenticated users (all roles)
 *   GET /api/repairs/:id     — authenticated users (all roles)
 *   POST /api/repairs        — admin-only (create job)
 *   PUT /api/repairs/:id/status — admin-only (update status)
 *   POST /api/repairs/:id/parts — admin-only (add part)
 *   POST /api/repairs/:id/payments — admin-only (add payment)
 */

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { authMiddleware, isAdmin, RequestIdentity } from '../auth';
import {
  listRepairJobs,
  getRepairJobById,
  createRepairJob,
  updateRepairStatus,
  addRepairPart,
  addRepairPayment,
  RepairRepoError,
  RepairJobFilters,
} from '../repositories/repair.repo';

export function buildRepairRouter(pool: Pool): Router {
  const router = Router();

  // ── GET /api/repairs — list with optional filters ──────────────────────────
  router.get('/', authMiddleware, async (req: Request, res: Response) => {
    try {
      const identity = req.identity as RequestIdentity;
      const callerIsAdmin = isAdmin(identity);

      const filters: RepairJobFilters = {
        page: req.query['page'] ? Number(req.query['page']) : 1,
        limit: req.query['limit'] ? Number(req.query['limit']) : 20,
        status: (req.query['status'] as string) || undefined,
        customer_id: (req.query['customer_id'] as string) || undefined,
        technician_id: (req.query['technician_id'] as string) || undefined,
      };

      // Non-admins are scoped to their own branch
      if (!callerIsAdmin) {
        filters.branch_id = identity.branch_id ?? undefined;
      } else {
        filters.branch_id = (req.query['branch_id'] as string) || undefined;
      }

      const result = await listRepairJobs(pool, filters);
      res.status(200).json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to list repair jobs' });
    }
  });

  // ── GET /api/repairs/:id — get by id or job_id ────────────────────────────
  router.get('/:id', authMiddleware, async (req: Request, res: Response) => {
    try {
      const id = req.params['id'] as string;
      const job = await getRepairJobById(pool, id);
      if (!job) {
        res.status(404).json({ error: `Repair job '${id}' not found` });
        return;
      }
      res.status(200).json(job);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to fetch repair job' });
    }
  });

  // ── POST /api/repairs — create new repair job (admin-only) ────────────────
  router.post('/', authMiddleware, async (req: Request, res: Response) => {
    try {
      const identity = req.identity as RequestIdentity;
      if (!isAdmin(identity)) {
        res.status(403).json({ error: 'Forbidden: creating repair jobs requires administrator role' });
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
      };

      const job = await createRepairJob(pool, dto, identity.user_id);
      res.status(201).json(job);
    } catch (err: any) {
      if (err instanceof RepairRepoError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      res.status(500).json({ error: err.message || 'Failed to create repair job' });
    }
  });

  // ── PUT /api/repairs/:id/status — update status (admin-only) ─────────────
  router.put('/:id/status', authMiddleware, async (req: Request, res: Response) => {
    try {
      const identity = req.identity as RequestIdentity;
      if (!isAdmin(identity)) {
        res.status(403).json({ error: 'Forbidden: updating repair status requires administrator role' });
        return;
      }

      const id = req.params['id'] as string;
      const status = req.body?.status as string | undefined;
      const note = req.body?.note as string | undefined;

      if (!status || typeof status !== 'string' || !status.trim()) {
        res.status(400).json({ error: 'status is required' });
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

  // ── POST /api/repairs/:id/parts — add part to job (admin-only) ───────────
  router.post('/:id/parts', authMiddleware, async (req: Request, res: Response) => {
    try {
      const identity = req.identity as RequestIdentity;
      if (!isAdmin(identity)) {
        res.status(403).json({ error: 'Forbidden: adding parts requires administrator role' });
        return;
      }

      const id = req.params['id'] as string;
      const body = req.body ?? {};
      const dto = {
        product_id: body.product_id || body.productId || null,
        product_name: body.product_name || body.productName || '',
        product_sku: body.product_sku || body.productSku || '',
        qty: Number(body.qty ?? body.quantity ?? 0),
        cost: Number(body.cost ?? 0),
        price: Number(body.price ?? 0),
      };

      const job = await addRepairPart(pool, id, dto, identity.user_id);
      res.status(200).json(job);
    } catch (err: any) {
      if (err instanceof RepairRepoError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      res.status(500).json({ error: err.message || 'Failed to add part to repair job' });
    }
  });

  // ── POST /api/repairs/:id/payments — add payment (admin-only) ────────────
  router.post('/:id/payments', authMiddleware, async (req: Request, res: Response) => {
    try {
      const identity = req.identity as RequestIdentity;
      if (!isAdmin(identity)) {
        res.status(403).json({ error: 'Forbidden: adding payments requires administrator role' });
        return;
      }

      const id = req.params['id'] as string;
      const body = req.body ?? {};
      const dto = {
        amount: Number(body.amount ?? 0),
        method: body.method || body.payment_method || 'CASH',
        reference: body.reference || body.reference_number || null,
      };

      const job = await addRepairPayment(pool, id, dto, identity.user_id);
      res.status(200).json(job);
    } catch (err: any) {
      if (err instanceof RepairRepoError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      res.status(500).json({ error: err.message || 'Failed to add payment to repair job' });
    }
  });

  return router;
}
