/**
 * Direct Advance Voucher HTTP Route Handlers
 *
 * Mounted at:
 *   /api/pos/vouchers
 *   /api/v1/pos/vouchers
 */

import express, { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { buildAuthMiddleware, authorizePermission, RequestIdentity } from '../auth';
import { VoucherRepoError, VoucherStatus, VoucherType } from '../repositories/voucher.repo';
import {
  createVoucher,
  getVoucherDetail,
  listVouchersForIdentity,
  addVoucherPayment,
  deliverVoucher,
  matchVoucherInventory,
  cancelVoucher,
  CreateVoucherRequestDto,
  RecordVoucherPaymentDto,
  DeliverVoucherDto,
  MatchVoucherInventoryDto,
  CancelVoucherDto,
} from '../services/voucher.service';

function isDbConnectionError(err: unknown): boolean {
  if (!err) return false;
  const msg = (err as { message?: string }).message || String(err);
  const code = (err as { code?: string }).code;
  return (
    code === 'ECONNRESET' ||
    code === 'ECONNREFUSED' ||
    msg.includes('ECONNRESET') ||
    msg.includes('ECONNREFUSED') ||
    msg.includes('Connection terminated')
  );
}

function sendError(_req: Request, res: Response, err: unknown): void {
  console.error('[voucher.routes] Error:', err);
  if (isDbConnectionError(err)) {
    res.status(503).json({ error: 'Database service unavailable', message: (err as Error).message });
    return;
  }
  if (err instanceof VoucherRepoError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }
  const status = (err as { statusCode?: number })?.statusCode;
  if (status && typeof status === 'number' && status >= 400 && status < 600) {
    res.status(status).json({ error: (err as Error).message });
    return;
  }
  const message = err instanceof Error ? err.message : 'Internal server error';
  res.status(500).json({ error: message });
}

export function createVoucherRouter(pool: Pool): Router {
  const router = express.Router();

  router.use(buildAuthMiddleware(pool));

  // ── POST / — Create voucher or INSTANT_INVENTORY registration ────────────
  router.post('/', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;
    const denied = authorizePermission(identity, 'pos', 'pos:sale');
    if (denied) {
      res.status(403).json({ error: denied });
      return;
    }

    try {
      const dto = req.body as CreateVoucherRequestDto;
      const result = await createVoucher(pool, identity, dto);
      res.status(result.idempotent_replay ? 200 : 201).json(result);
    } catch (err) {
      sendError(req, res, err);
    }
  });

  // ── GET / — List / filter vouchers ───────────────────────────────────────
  router.get('/', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;
    const denied = authorizePermission(identity, 'pos', null);
    if (denied) {
      res.status(403).json({ error: denied });
      return;
    }

    try {
      const vouchers = await listVouchersForIdentity(pool, identity, {
        branch_id: (req.query['branch_id'] as string) || null,
        voucher_type: (req.query['voucher_type'] as VoucherType) || null,
        status: (req.query['status'] as VoucherStatus) || null,
        customer_id: (req.query['customer_id'] as string) || null,
        search: (req.query['search'] as string) || null,
        limit: req.query['limit'] ? Number(req.query['limit']) : undefined,
        offset: req.query['offset'] ? Number(req.query['offset']) : undefined,
      });
      res.status(200).json(vouchers);
    } catch (err) {
      sendError(req, res, err);
    }
  });

  // ── GET /:id — Voucher details with payments and inventory matches ───────
  router.get('/:id', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;
    const denied = authorizePermission(identity, 'pos', null);
    if (denied) {
      res.status(403).json({ error: denied });
      return;
    }

    try {
      const detail = await getVoucherDetail(pool, identity, String(req.params['id']));
      res.status(200).json(detail);
    } catch (err) {
      sendError(req, res, err);
    }
  });

  // ── POST /:id/payments — Record additional payment ───────────────────────
  router.post('/:id/payments', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;
    const denied = authorizePermission(identity, 'pos', 'pos:sale');
    if (denied) {
      res.status(403).json({ error: denied });
      return;
    }

    try {
      const dto = req.body as RecordVoucherPaymentDto;
      const result = await addVoucherPayment(pool, identity, String(req.params['id']), dto);
      res.status(result.idempotent_replay ? 200 : 201).json(result);
    } catch (err) {
      sendError(req, res, err);
    }
  });

  // ── POST /:id/deliver — Record physical delivery (e.g. PRE_BOOKING) ──────
  router.post('/:id/deliver', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;
    const denied = authorizePermission(identity, 'pos', 'pos:sale');
    if (denied) {
      res.status(403).json({ error: denied });
      return;
    }

    try {
      const dto = req.body as DeliverVoucherDto;
      const result = await deliverVoucher(pool, identity, String(req.params['id']), dto);
      res.status(200).json(result);
    } catch (err) {
      sendError(req, res, err);
    }
  });

  // ── POST /:id/match-inventory — Reconcile purchase/stock against voucher ─
  router.post('/:id/match-inventory', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;
    const denied = authorizePermission(identity, 'inventory', null);
    if (denied) {
      res.status(403).json({ error: denied });
      return;
    }

    try {
      const dto = req.body as MatchVoucherInventoryDto;
      const result = await matchVoucherInventory(pool, identity, String(req.params['id']), dto);
      res.status(201).json(result);
    } catch (err) {
      sendError(req, res, err);
    }
  });

  // ── POST /:id/cancel — Safe cancellation (no financial/delivery activity) ──
  router.post('/:id/cancel', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;
    const denied = authorizePermission(identity, 'pos', 'pos:void');
    if (denied) {
      res.status(403).json({ error: denied });
      return;
    }

    try {
      const dto = req.body as CancelVoucherDto;
      const voucher = await cancelVoucher(pool, identity, String(req.params['id']), dto);
      res.status(200).json({ voucher });
    } catch (err) {
      sendError(req, res, err);
    }
  });

  return router;
}
