/**
 * Business Accounts Repository
 *
 * Phase 1: account registration, opening-balance ledger entry, and statement.
 * POS inflow, withdrawals, transfers, and payroll integration are deferred to Phase 2+.
 *
 * Security: organization_id and performed_by are ALWAYS derived from the authenticated
 * JWT identity in the route layer — never trusted from request body.
 */

import { Pool, PoolClient } from 'pg';

export type AccountType = 'JAZZCASH' | 'EASYPAISA' | 'BANK';
export type LedgerDirection = 'IN' | 'OUT';

export interface BusinessAccount {
  id: string;
  organization_id: string;
  branch_id: string | null;
  name: string;
  account_type: AccountType;
  account_holder_name: string;
  account_number: string;
  account_number_masked: string;
  iban: string | null;
  bank_name: string | null;
  opening_balance: number;
  currency: string;
  is_active: boolean;
  current_balance: number;
  created_at: string;
  updated_at: string;
}

export interface LedgerEntry {
  id: string;
  account_id: string;
  entry_type: string;
  direction: LedgerDirection;
  amount: number;
  balance_after: number;
  reference_type: string | null;
  reference_number: string | null;
  description: string | null;
  created_at: string;
}

export interface AccountStatement {
  account: BusinessAccount;
  entries: LedgerEntry[];
  total: number;
  page: number;
  page_size: number;
}

export interface CreateAccountDto {
  name: string;
  account_type: AccountType;
  account_holder_name: string;
  account_number: string;
  iban?: string | null;
  bank_name?: string | null;
  opening_balance: number;
  opening_balance_note?: string | null;
}

export class AccountRepoError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number
  ) {
    super(message);
    this.name = 'AccountRepoError';
  }
}

const VALID_TYPES: AccountType[] = ['JAZZCASH', 'EASYPAISA', 'BANK'];

/**
 * Masks account number for display.
 * Phone-based accounts (JazzCash/Easypaisa): show first 4 digits + ****last 3.
 * Bank accounts: show ****last 4.
 * Never logs the full number.
 */
function maskAccountNumber(type: AccountType, raw: string): string {
  const n = raw.replace(/[-\s]/g, '');
  if (type === 'JAZZCASH' || type === 'EASYPAISA') {
    if (n.length < 7) return '****';
    return n.slice(0, 4) + '-****' + n.slice(-3);
  }
  if (n.length <= 4) return n;
  return '****' + n.slice(-4);
}

function mapAccountRow(row: Record<string, unknown>): BusinessAccount {
  return {
    id:                   String(row['id']),
    organization_id:      String(row['organization_id']),
    branch_id:            row['branch_id'] ? String(row['branch_id']) : null,
    name:                 String(row['name']),
    account_type:         String(row['account_type']) as AccountType,
    account_holder_name:  String(row['account_holder_name']),
    account_number:       String(row['account_number']),
    account_number_masked: maskAccountNumber(
      String(row['account_type']) as AccountType,
      String(row['account_number'])
    ),
    iban:                 row['iban'] ? String(row['iban']) : null,
    bank_name:            row['bank_name'] ? String(row['bank_name']) : null,
    opening_balance:      Number(row['opening_balance']),
    currency:             String(row['currency'] || 'PKR'),
    is_active:            Boolean(row['is_active']),
    current_balance:      Number(row['current_balance'] ?? 0),
    created_at:           String(row['created_at']),
    updated_at:           String(row['updated_at']),
  };
}

/** List all business accounts for an organization, ordered by creation date. */
export async function listAccounts(
  pool: Pool,
  organizationId: string
): Promise<BusinessAccount[]> {
  const result = await pool.query(
    `SELECT
       ba.id, ba.organization_id, ba.branch_id,
       ba.name, ba.account_type, ba.account_holder_name,
       ba.account_number, ba.iban, ba.bank_name,
       ba.opening_balance::BIGINT AS opening_balance,
       ba.currency, ba.is_active,
       ba.created_at, ba.updated_at,
       COALESCE((
         SELECT SUM(
           CASE WHEN ale.direction = 'IN' THEN ale.amount
                ELSE -ale.amount END
         )::BIGINT
         FROM account_ledger_entries ale
         WHERE ale.account_id = ba.id
       ), 0) AS current_balance
     FROM business_accounts ba
     WHERE ba.organization_id = $1
     ORDER BY ba.created_at ASC`,
    [organizationId]
  );
  return result.rows.map(mapAccountRow);
}

/**
 * Create a new organization-owned business account.
 * Atomically inserts the account and its opening-balance ledger entry (if balance > 0).
 * Rolls back entirely if either insert fails.
 */
export async function createAccount(
  pool: Pool,
  dto: CreateAccountDto,
  organizationId: string,
  userId: string
): Promise<BusinessAccount> {
  if (!VALID_TYPES.includes(dto.account_type)) {
    throw new AccountRepoError(
      `Invalid account_type. Must be one of: ${VALID_TYPES.join(', ')}`,
      400
    );
  }

  const openingBalance = Math.round(Number(dto.opening_balance) || 0);
  if (isNaN(openingBalance) || openingBalance < 0) {
    throw new AccountRepoError('opening_balance must be a non-negative integer PKR amount.', 400);
  }

  const client: PoolClient = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check for duplicate: same org, type, and account_number
    const dupCheck = await client.query(
      `SELECT id FROM business_accounts
       WHERE organization_id = $1
         AND account_type = $2
         AND account_number = $3`,
      [organizationId, dto.account_type, dto.account_number.trim()]
    );
    if (dupCheck.rows.length > 0) {
      throw new AccountRepoError(
        `A ${dto.account_type} account with this number already exists in this organization.`,
        409
      );
    }

    // Insert the account
    const accResult = await client.query(
      `INSERT INTO business_accounts
         (organization_id, branch_id, name, account_type, account_holder_name,
          account_number, iban, bank_name, opening_balance, currency, is_active, created_by)
       VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8, 'PKR', TRUE, $9)
       RETURNING
         id, organization_id, branch_id, name, account_type, account_holder_name,
         account_number, iban, bank_name,
         opening_balance::BIGINT AS opening_balance,
         currency, is_active, created_at, updated_at`,
      [
        organizationId,
        dto.name.trim(),
        dto.account_type,
        dto.account_holder_name.trim(),
        dto.account_number.trim(),
        dto.iban?.trim() || null,
        dto.bank_name?.trim() || null,
        openingBalance,
        userId,
      ]
    );
    const accountRow = accResult.rows[0] as Record<string, unknown>;

    // Insert opening-balance ledger entry if balance > 0
    if (openingBalance > 0) {
      const entryDescription = dto.opening_balance_note?.trim()
        || 'Opening balance recorded at account registration.';
      await client.query(
        `INSERT INTO account_ledger_entries
           (organization_id, account_id, branch_id, entry_type, direction,
            amount, balance_after, reference_type, description, performed_by)
         VALUES ($1, $2, NULL, 'OPENING_BALANCE', 'IN', $3, $3, NULL, $4, $5)`,
        [
          organizationId,
          accountRow['id'],
          openingBalance,
          entryDescription,
          userId,
        ]
      );
    }

    await client.query('COMMIT');

    return {
      ...mapAccountRow(accountRow),
      current_balance: openingBalance,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Retrieve a paginated ledger statement for one account.
 * Verifies the account belongs to the caller's organization before returning.
 */
export async function getAccountStatement(
  pool: Pool,
  accountId: string,
  organizationId: string,
  page: number,
  pageSize: number
): Promise<AccountStatement> {
  // Verify account exists and belongs to this organization
  const accResult = await pool.query(
    `SELECT
       ba.id, ba.organization_id, ba.branch_id,
       ba.name, ba.account_type, ba.account_holder_name,
       ba.account_number, ba.iban, ba.bank_name,
       ba.opening_balance::BIGINT AS opening_balance,
       ba.currency, ba.is_active,
       ba.created_at, ba.updated_at,
       COALESCE((
         SELECT SUM(
           CASE WHEN ale.direction = 'IN' THEN ale.amount
                ELSE -ale.amount END
         )::BIGINT
         FROM account_ledger_entries ale
         WHERE ale.account_id = ba.id
       ), 0) AS current_balance
     FROM business_accounts ba
     WHERE ba.id = $1 AND ba.organization_id = $2`,
    [accountId, organizationId]
  );

  if (accResult.rows.length === 0) {
    throw new AccountRepoError('Account not found or access denied.', 404);
  }

  const offset = (page - 1) * pageSize;

  const [entriesResult, countResult] = await Promise.all([
    pool.query(
      `SELECT
         id, account_id, entry_type, direction,
         amount::BIGINT AS amount,
         balance_after::BIGINT AS balance_after,
         reference_type, reference_number, description, created_at
       FROM account_ledger_entries
       WHERE account_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [accountId, pageSize, offset]
    ),
    pool.query(
      `SELECT COUNT(*)::INT AS total
       FROM account_ledger_entries
       WHERE account_id = $1`,
      [accountId]
    ),
  ]);

  const entries: LedgerEntry[] = entriesResult.rows.map((r) => ({
    id:               String(r.id),
    account_id:       String(r.account_id),
    entry_type:       String(r.entry_type),
    direction:        String(r.direction) as LedgerDirection,
    amount:           Number(r.amount),
    balance_after:    Number(r.balance_after),
    reference_type:   r.reference_type ? String(r.reference_type) : null,
    reference_number: r.reference_number ? String(r.reference_number) : null,
    description:      r.description ? String(r.description) : null,
    created_at:       String(r.created_at),
  }));

  return {
    account: mapAccountRow(accResult.rows[0] as Record<string, unknown>),
    entries,
    total:     Number(countResult.rows[0].total),
    page,
    page_size: pageSize,
  };
}
