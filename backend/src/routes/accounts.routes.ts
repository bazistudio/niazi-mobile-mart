/**
 * Business Accounts HTTP Route Handlers
 *
 * Phase 1: account registry, opening-balance recording, and statement retrieval.
 * All routes require an authenticated Organization ADMIN JWT.
 * organization_id and performed_by are derived exclusively from the verified JWT identity.
 * No client-supplied ownership or actor identity is ever trusted.
 */

import express, { Router, Request, Response } from 'express';
import { Pool } from 'pg';

import {
  buildAuthMiddleware,
  isOrgAdmin,
  RequestIdentity,
  NIAZI_ORGANIZATION_ID,
} from '../auth';

import {
  listAccounts,
  createAccount,
  getAccountStatement,
  AccountRepoError,
  AccountType,
  CreateAccountDto,
} from '../repositories/accounts.repo';

const VALID_TYPES: AccountType[] = ['JAZZCASH', 'EASYPAISA', 'BANK'];

function sendError(res: Response, err: unknown): void {
  if (err instanceof AccountRepoError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }
  const msg = err instanceof Error ? err.message : 'Internal server error';
  res.status(500).json({ error: msg });
}

function requireOrgAdmin(identity: RequestIdentity, res: Response): boolean {
  if (!isOrgAdmin(identity)) {
    res
      .status(403)
      .json({
        error:
          'Access denied: Business account management requires organization administrator role.',
      });
    return false;
  }
  return true;
}

export function buildAccountsRouter(pool: Pool): Router {
  const router = express.Router();

  router.use(buildAuthMiddleware(pool));

  // ── GET /api/accounts ──────────────────────────────────────────────────────
  // List all organization business accounts.
  // Returns full account_number for ADMIN (all routes in this file are ADMIN-only).
  router.get('/', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;
    if (!requireOrgAdmin(identity, res)) return;

    try {
      const accounts = await listAccounts(pool, NIAZI_ORGANIZATION_ID);
      res.status(200).json({ accounts });
    } catch (err) {
      sendError(res, err);
    }
  });

  // ── POST /api/accounts ─────────────────────────────────────────────────────
  // Register a new organization-owned business account.
  // Atomically creates the account + opening-balance ledger entry.
  router.post('/', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;
    if (!requireOrgAdmin(identity, res)) return;

    try {
      const {
        name,
        account_type,
        account_holder_name,
        account_number,
        iban,
        bank_name,
        opening_balance,
        opening_balance_note,
      } = req.body as Record<string, unknown>;

      // Input validation
      if (!name || typeof name !== 'string' || !String(name).trim()) {
        res.status(400).json({ error: 'name is required.' });
        return;
      }
      const normalizedType = String(account_type || '').toUpperCase() as AccountType;
      if (!VALID_TYPES.includes(normalizedType)) {
        res.status(400).json({
          error: `account_type must be one of: ${VALID_TYPES.join(', ')}`,
        });
        return;
      }
      if (
        !account_holder_name ||
        typeof account_holder_name !== 'string' ||
        !String(account_holder_name).trim()
      ) {
        res.status(400).json({ error: 'account_holder_name is required.' });
        return;
      }
      if (
        !account_number ||
        typeof account_number !== 'string' ||
        !String(account_number).trim()
      ) {
        res.status(400).json({ error: 'account_number is required.' });
        return;
      }

      const balanceNum = Number(opening_balance);
      if (isNaN(balanceNum) || balanceNum < 0) {
        res
          .status(400)
          .json({ error: 'opening_balance must be a non-negative number.' });
        return;
      }

      const dto: CreateAccountDto = {
        name:                 String(name).trim(),
        account_type:         normalizedType,
        account_holder_name:  String(account_holder_name).trim(),
        account_number:       String(account_number).trim(),
        iban:                 iban ? String(iban).trim() || null : null,
        bank_name:            bank_name ? String(bank_name).trim() || null : null,
        opening_balance:      Math.round(balanceNum),
        opening_balance_note: opening_balance_note
          ? String(opening_balance_note).trim() || null
          : null,
      };

      const account = await createAccount(
        pool,
        dto,
        NIAZI_ORGANIZATION_ID,
        identity.user_id
      );
      res.status(201).json({ account });
    } catch (err) {
      sendError(res, err);
    }
  });

  // ── GET /api/accounts/:id/statement ──────────────────────────────────────
  // Retrieve paginated ledger statement for one account.
  router.get('/:id/statement', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;
    if (!requireOrgAdmin(identity, res)) return;

    try {
      const accountId = String(req.params['id'] || '');
      if (!accountId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(accountId)) {
        res.status(400).json({ error: 'Invalid account ID format.' });
        return;
      }

      const page = Math.max(
        1,
        parseInt((req.query['page'] as string) || '1', 10) || 1
      );
      const pageSize = Math.min(
        100,
        Math.max(1, parseInt((req.query['page_size'] as string) || '20', 10) || 20)
      );

      const statement = await getAccountStatement(
        pool,
        String(accountId),
        NIAZI_ORGANIZATION_ID,
        page,
        pageSize
      );
      res.status(200).json(statement);
    } catch (err) {
      sendError(res, err);
    }
  });

  return router;
}
