/**
 * Cash HTTP Route Handlers
 */

import express, { Router, Request, Response } from 'express';
import { Pool } from 'pg';

import { buildAuthMiddleware, authorizePermission, canAccessBranch, RequestIdentity, NIAZI_ORGANIZATION_ID } from '../auth';
import {
  closeCashSession,
  getCurrentCashSession,
  listCashMovements,
  openCashSession,
  recordCashMovement,
  CashRepoError,
  CloseCashSessionDto,
  OpenCashSessionDto,
  RecordCashMovementDto,
} from '../repositories/cash.repo';

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
  console.error('[cash.routes] Error handled by sendError:', err);
  if (isDbConnectionError(err)) {
    res.status(503).json({ error: 'Database service unavailable', message: (err as Error).message });
    return;
  }
  if (err instanceof CashRepoError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }
  const message = err instanceof Error ? err.message : 'Internal server error';
  res.status(500).json({ error: message });
}

export function createCashRouter(pool: Pool): Router {
  const router = express.Router();

  router.use(buildAuthMiddleware(pool));

  // ── GET /api/cash/sessions/current ────────────────────────────────────────
  router.get('/sessions/current', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;

    const denied = authorizePermission(identity, 'pos', null);
    if (denied) {
      res.status(403).json({ error: denied });
      return;
    }

    try {
      const requestedBranchId = (req.query['branch_id'] as string) || undefined;

      // Validate branch access when a specific branch is requested
      if (requestedBranchId && !canAccessBranch(identity, requestedBranchId)) {
        res.status(403).json({ error: 'Access denied: You do not have permission to access this branch' });
        return;
      }

      // F-07: Do not fall back to org UUID if no valid branch can be resolved.
      const branchId = requestedBranchId || identity.branch_id;
      if (!branchId) {
        res.status(403).json({ error: 'Access denied: No branch assigned to your account' });
        return;
      }
      const session = await getCurrentCashSession(pool, branchId);
      res.status(200).json({ session });
    } catch (err) {
      sendError(req, res, err);
    }
  });

  // ── POST /api/cash/sessions/open ─────────────────────────────────────────
  router.post('/sessions/open', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;

    const denied = authorizePermission(identity, 'pos', null);
    if (denied) {
      res.status(403).json({ error: denied });
      return;
    }

    try {
      const dto = req.body as OpenCashSessionDto;

      // Validate branch access when branch_id is supplied in body
      if (dto.branch_id && !canAccessBranch(identity, dto.branch_id)) {
        res.status(403).json({ error: 'Access denied: You do not have permission to open a session for this branch' });
        return;
      }

      if (!dto.branch_id && identity.branch_id) {
        dto.branch_id = identity.branch_id;
      }
      const session = await openCashSession(pool, dto, identity.user_id);
      res.status(201).json(session);
    } catch (err) {
      sendError(req, res, err);
    }
  });

  // ── POST /api/cash/sessions/close ────────────────────────────────────────
  router.post('/sessions/close', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;

    const denied = authorizePermission(identity, 'pos', null);
    if (denied) {
      res.status(403).json({ error: denied });
      return;
    }

    try {
      const dto = req.body as CloseCashSessionDto;

      // F-03: Verify the session belongs to a branch the caller can access.
      // Load the session record to obtain its actual stored branch_id.
      const sessionCheck = await pool.query<{ branch_id: string }>(
        'SELECT branch_id FROM cash_sessions WHERE id = $1',
        [dto.session_id]
      );
      if (sessionCheck.rows.length === 0) {
        res.status(404).json({ error: 'Cash session not found' });
        return;
      }
      const sessionBranchId = sessionCheck.rows[0]!.branch_id;
      if (!canAccessBranch(identity, sessionBranchId)) {
        res.status(403).json({ error: 'Access denied: You do not have permission to close this cash session' });
        return;
      }

      const session = await closeCashSession(pool, dto, identity.user_id);
      res.status(200).json(session);
    } catch (err) {
      sendError(req, res, err);
    }
  });

  // ── POST /api/cash/movements ──────────────────────────────────────────────
  router.post('/movements', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;

    const denied = authorizePermission(identity, 'pos', null);
    if (denied) {
      res.status(403).json({ error: denied });
      return;
    }

    try {
      const dto = req.body as RecordCashMovementDto;

      // Validate branch access when branch_id is supplied in body
      if (dto.branch_id && !canAccessBranch(identity, dto.branch_id)) {
        res.status(403).json({ error: 'Access denied: You do not have permission to record movements for this branch' });
        return;
      }

      if (!dto.branch_id && identity.branch_id) {
        dto.branch_id = identity.branch_id;
      }
      const mv = await recordCashMovement(pool, dto, identity.user_id);
      res.status(201).json(mv);
    } catch (err) {
      sendError(req, res, err);
    }
  });

  // ── GET /api/cash/movements ───────────────────────────────────────────────
  router.get('/movements', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;

    const denied = authorizePermission(identity, 'pos', null);
    if (denied) {
      res.status(403).json({ error: denied });
      return;
    }

    try {
      const requestedBranchId = (req.query['branch_id'] as string) || undefined;

      // Validate branch access when a specific branch is requested
      if (requestedBranchId && !canAccessBranch(identity, requestedBranchId)) {
        res.status(403).json({ error: 'Access denied: You do not have permission to view movements for this branch' });
        return;
      }

      const branchId = requestedBranchId || identity.branch_id || null;
      const movements = await listCashMovements(pool, branchId);
      res.status(200).json(movements);
    } catch (err) {
      sendError(req, res, err);
    }
  });

  return router;
}
