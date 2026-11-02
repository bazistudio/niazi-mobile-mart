/**
 * Mobile Sale PostgreSQL Repository
 *
 * Implements atomic, concurrency-safe mobile device checkout:
 *  - Verifies and locks requested mobile devices with SELECT FOR UPDATE
 *  - Enforces branch/organization isolation
 *  - Verifies status = 'IN_STOCK' (fails if already SOLD or under INSPECTION)
 *  - Generates concurrency-safe user-scoped invoice number
 *  - Creates core sales record with performed_by = authenticated user UUID
 *  - Inserts mobile_sale_items with immutable snapshots and sold_by attribution
 *  - Records sale_payments (CASH, CARD, BANK_TRANSFER, EASYPAISA, JAZZCASH, OTHER)
 *  - Posts to customer_ledger_entries if credit is used (enforces credit limit)
 *  - Enforces active cash_sessions when CASH payment is accepted & inserts cash_movements
 *  - Updates mobile_devices: status -> 'SOLD', sale_id -> sales.id
 *  - Inserts mobile_device_movements audit row (movement_type = 'SOLD')
 *  - Returns complete invoice and cashier/receipt payload
 */

import { Pool, PoolClient } from 'pg';
import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { writeChangeLogEntry } from './change_log.repo';

// ─── Domain Types & Errors ────────────────────────────────────────────────────

export class MobileSaleRepoError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 400
  ) {
    super(message);
    this.name = 'MobileSaleRepoError';
  }
}

export interface MobileSaleItemInput {
  deviceId: string;
  salePrice: number;
}

export interface MobileSalePaymentInput {
  method: 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'EASYPAISA' | 'JAZZCASH' | 'OTHER' | 'CREDIT';
  amount: number;
  referenceNumber?: string | null;
  notes?: string | null;
}

export interface CompleteMobileSaleDto {
  items: MobileSaleItemInput[];
  payments: MobileSalePaymentInput[];
  customerId?: string | null;
  branchId?: string | null;
  notes?: string | null;
  idempotencyKey?: string | null;
  /**
   * Phase 4 Stage C — Cashier-controlled advance application.
   * Whole PKR integer >= 0. Omitting is equivalent to 0.
   * Walk-in sales (customerId = null) must omit or pass 0.
   * Backend validates against live locked customer ledger balance.
   */
  advanceApplied?: number | null;
}

export interface MobileSaleResult {
  saleId: string;
  invoiceNumber: string;
  branchId: string;
  customerId: string | null;
  customerName: string | null;
  subtotal: number;
  discount: number;
  totalAmount: number;
  paidAmount: number;
  changeAmount: number;
  creditAmount: number;
  paymentStatus: 'PAID' | 'PARTIALLY_PAID' | 'UNPAID';
  /** Phase 4 Stage C — Advance amount applied to this invoice (0 when not used). */
  advanceApplied: number;
  devices: Array<{
    deviceId: string;
    brand: string;
    model: string;
    imei1: string;
    imei2: string | null;
    salePrice: number;
    costPrice: number;
  }>;
  payments: Array<{
    id: string;
    method: string;
    amount: number;
  }>;
  cashier: {
    userId: string;
    name: string;
    role: string;
  };
  customerBalanceAfter: number | null;
  createdAt: string;
}

function getPeriodYYYYMM(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${year}${month}`;
}


// ─── Idempotency Helpers (Phase 2) ──────────────────────────────────────────

/**
 * Validates idempotency key according to strict Phase 2 security contract.
 * Rejects whitespace, colons, alien prefixes, and length > 128.
 * Preserves null/undefined for backward compatibility.
 */
export function validateMobileIdempotencyKey(key?: string | null): string | null {
  if (key === undefined || key === null) {
    return null;
  }
  if (typeof key !== 'string') {
    throw new MobileSaleRepoError('Invalid idempotency key: must be a string.', 400);
  }
  if (key.length === 0) {
    throw new MobileSaleRepoError('Invalid idempotency key: cannot be empty string.', 400);
  }
  if (key !== key.trim()) {
    throw new MobileSaleRepoError('Invalid idempotency key: leading or trailing whitespace is not permitted.', 400);
  }
  if (key.length > 128) {
    throw new MobileSaleRepoError('Invalid idempotency key: exceeds maximum length of 128 characters.', 400);
  }
  if (key.includes(':')) {
    throw new MobileSaleRepoError('Invalid idempotency key: colon character is reserved and not permitted.', 400);
  }
  if (
    key.startsWith('pos_txn_') ||
    key.startsWith('pos_exchange_') ||
    key.startsWith('exchange:') ||
    key.startsWith('mobiles:')
  ) {
    throw new MobileSaleRepoError('Invalid idempotency key: reserved workflow prefix.', 400);
  }
  return key;
}

/**
 * Computes deterministic canonical SHA-256 hash of the financially binding fields.
 * Items are canonically sorted by deviceId using locale-independent ASCII comparison.
 * Payments preserve exact submission order because order dictates allocation.
 * Informational metadata (notes, references) is excluded.
 */
function computeMobilePayloadHash(dto: CompleteMobileSaleDto, authoritativeBranchId: string): string {
  const canonical = {
    branch_id: authoritativeBranchId,
    customer_id: dto.customerId ?? null,
    items: [...dto.items]
      .sort((a, b) => (a.deviceId < b.deviceId ? -1 : a.deviceId > b.deviceId ? 1 : 0))
      .map((i) => ({
        deviceId: i.deviceId,
        salePrice: i.salePrice,
      })),
    payments: dto.payments
      ? dto.payments.map((p) => ({
          method: p.method,
          amount: p.amount,
        }))
      : [],
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

/**
 * Derives deterministic 32-bit signed integer pair for PostgreSQL pg_advisory_xact_lock.
 * Scoped to workflow namespace 'mobiles', branch_id, and rawKey.
 */
function computeMobileAdvisoryLockKeys(branchId: string, rawKey: string): [number, number] {
  const hash = createHash('sha256').update(`mobiles:${branchId}:${rawKey}`).digest();
  const k1 = hash.readInt32BE(0);
  const k2 = hash.readInt32BE(4);
  return [k1, k2];
}

/**
 * Reconstructs original MobileSaleResult from committed immutable database records.
 * Verifies workflow ownership via mobile_sale_items existence.
 */
async function reconstructMobileSaleResult(
  pool: Pool,
  saleId: string,
  authoritativeBranchId: string
): Promise<MobileSaleResult | null> {
  const saleRes = await pool.query(
    `SELECT id, invoice_number, branch_id, customer_id, customer_name_snapshot,
            subtotal, discount, total_amount, paid_amount, change_amount,
            payment_status, performed_by, created_at
     FROM sales
     WHERE id = $1`,
    [saleId]
  );
  if (saleRes.rows.length === 0) {
    return null;
  }
  const s = saleRes.rows[0];

  // Verify branch match
  if (s.branch_id !== authoritativeBranchId) {
    throw new MobileSaleRepoError('Cross-branch sale access denied during idempotency replay.', 403);
  }

  // 1. Query mobile_sale_items and verify workflow ownership
  const itemsRes = await pool.query(
    `SELECT device_id, brand_snapshot, model_snapshot, imei1_snapshot, imei2_snapshot,
            sale_price, cost_price_snapshot
     FROM mobile_sale_items
     WHERE sale_id = $1
     ORDER BY created_at ASC, id ASC`,
    [saleId]
  );
  if (itemsRes.rows.length === 0) {
    throw new MobileSaleRepoError('Idempotency key collision detected with non-mobile workflow.', 409);
  }

  const devices: MobileSaleResult['devices'] = itemsRes.rows.map((r: any) => ({
    deviceId: r.device_id,
    brand: r.brand_snapshot,
    model: r.model_snapshot,
    imei1: r.imei1_snapshot,
    imei2: r.imei2_snapshot,
    salePrice: Number(r.sale_price),
    costPrice: Number(r.cost_price_snapshot),
  }));

  // 2. Query original sale_payments
  const paymentsRes = await pool.query(
    `SELECT id, payment_method, amount
     FROM sale_payments
     WHERE sale_id = $1
     ORDER BY created_at ASC, id ASC`,
    [saleId]
  );
  const payments: MobileSaleResult['payments'] = paymentsRes.rows.map((r: any) => ({
    id: r.id,
    method: r.payment_method,
    amount: Number(r.amount),
  }));

  // 3. Query cashier attribution
  let cashier = {
    userId: s.performed_by || '',
    name: 'Unknown Cashier',
    role: 'STAFF',
  };
  if (s.performed_by) {
    const userRes = await pool.query(
      `SELECT id, username, role FROM users WHERE id = $1`,
      [s.performed_by]
    );
    if (userRes.rows.length > 0) {
      cashier = {
        userId: userRes.rows[0].id,
        name: userRes.rows[0].username,
        role: userRes.rows[0].role,
      };
    }
  }

  const subtotal = Number(s.subtotal);
  const discount = Number(s.discount);
  const totalAmount = Number(s.total_amount);
  const paidAmount = Number(s.paid_amount);
  const changeAmount = Number(s.change_amount);
  const creditAmount = Math.max(0, totalAmount - paidAmount);

  // 4. Phase 4.C — Deterministic description-based ledger replay (ORDER BY removed)
  // Both mobile-sale ledger entries share the same `now` timestamp and have UUIDv4 ids
  // stored as TEXT — neither created_at nor id ordering is reliable for identifying the
  // final balance row. Entries are identified exclusively by their description prefix,
  // which is stable and written atomically by the same transaction.
  let customerBalanceAfter: number | null = null;
  let advanceApplied = 0;

  if (s.customer_id) {
    const ledgerEntries = await pool.query(
      `SELECT entry_type, debit, credit, balance_after, description
       FROM customer_ledger_entries
       WHERE reference_id = $1`,
      [saleId]
    );

    if (ledgerEntries.rows.length > 0) {
      // Identify entries by description prefix — the only stable discriminator.
      // Advance-consumption entry: description starts with 'Advance applied'
      // Unpaid-credit entry:       description starts with 'Mobile Sale Credit'
      const advanceRows = ledgerEntries.rows.filter(
        (row: any) =>
          typeof row.description === 'string' &&
          row.description.startsWith('Advance applied')
      );
      const creditRows = ledgerEntries.rows.filter(
        (row: any) =>
          typeof row.description === 'string' &&
          row.description.startsWith('Mobile Sale Credit')
      );

      // Defensive: multiple entries with the same description prefix indicates corruption.
      if (advanceRows.length > 1) {
        throw new MobileSaleRepoError(
          `Ledger integrity error: multiple advance-consumption entries found for sale '${saleId}'. Manual investigation required.`,
          500
        );
      }
      if (creditRows.length > 1) {
        throw new MobileSaleRepoError(
          `Ledger integrity error: multiple credit-debt entries found for sale '${saleId}'. Manual investigation required.`,
          500
        );
      }

      const advanceRow = advanceRows[0] ?? null;
      const creditRow = creditRows[0] ?? null;

      // advanceApplied is the debit amount of the advance-consumption entry, or 0.
      advanceApplied = advanceRow ? Number(advanceRow.debit) : 0;

      // customerBalanceAfter: prefer the credit-debt entry's balance (it is posted last
      // and reflects the final state). Fall back to the advance-entry balance if only
      // advance was applied. Return null if no ledger mutation occurred for this sale.
      if (creditRow !== null) {
        customerBalanceAfter = Number(creditRow.balance_after);
      } else if (advanceRow !== null) {
        customerBalanceAfter = Number(advanceRow.balance_after);
      }
      // else: customerBalanceAfter remains null (fully paid walk-in or no ledger entries)
    }
  }

  return {
    saleId: s.id,
    invoiceNumber: s.invoice_number,
    branchId: s.branch_id,
    customerId: s.customer_id ?? null,
    customerName: s.customer_name_snapshot ?? 'Walk-In Customer',
    subtotal,
    discount,
    totalAmount,
    paidAmount,
    changeAmount,
    creditAmount,
    paymentStatus: s.payment_status,
    advanceApplied,
    devices,
    payments,
    cashier,
    customerBalanceAfter,
    createdAt: s.created_at,
  };
}

// ─── Core Transactional Sale Execution ─────────────────────────────────────────

export async function executeMobileSale(
  pool: Pool,
  dto: CompleteMobileSaleDto,
  authIdentity: {
    userId: string;
    username: string;
    role: string;
    organizationId: string;
    branchId: string | null;
  },
  isOrgAdmin: boolean
): Promise<MobileSaleResult> {
  if (!dto.items || dto.items.length === 0) {
    throw new MobileSaleRepoError('Cart cannot be empty. At least one mobile device must be selected.', 400);
  }

  // Branch Scoping: Org-Admin may specify branchId; staff always locked to token branch_id
  const branchId = isOrgAdmin && dto.branchId ? dto.branchId : authIdentity.branchId;
  if (!branchId) {
    throw new MobileSaleRepoError('Branch ID is required to process mobile sale.', 400);
  }
  const organizationId = authIdentity.organizationId;
  const uid = authIdentity.userId;

  // Phase 1: Defensive validation for item prices (Safe Integer Whole PKR)
  let subtotalSum = 0;
  for (const item of dto.items) {
    if (!item.deviceId || typeof item.deviceId !== 'string') {
      throw new MobileSaleRepoError('Invalid device ID in sale cart.', 400);
    }
    if (
      typeof item.salePrice !== 'number' ||
      !Number.isSafeInteger(item.salePrice) ||
      item.salePrice < 0
    ) {
      throw new MobileSaleRepoError(
        `Invalid sale price for device ${item.deviceId}. Price must be a non-negative whole PKR integer.`,
        400
      );
    }
    subtotalSum += item.salePrice;
    if (!Number.isSafeInteger(subtotalSum)) {
      throw new MobileSaleRepoError('Aggregate sale subtotal exceeds safe integer bounds.', 400);
    }
  }

  // Validate duplicate device IDs in same request
  const uniqueDeviceIds = new Set(dto.items.map((i) => i.deviceId));
  if (uniqueDeviceIds.size !== dto.items.length) {
    throw new MobileSaleRepoError('Duplicate mobile device entries found in the cart.', 400);
  }

  // Phase 1: Defensive validation for payment tender lines before database acquisition
  const paymentsList = dto.payments || [];
  let tenderCheckSum = 0;
  for (const p of paymentsList) {
    if (
      typeof p.amount !== 'number' ||
      !Number.isSafeInteger(p.amount) ||
      p.amount < 0
    ) {
      throw new MobileSaleRepoError(
        `Invalid payment amount for ${p.method || 'tender'}. Amount must be a non-negative whole PKR integer.`,
        400
      );
    }
    if (p.amount > 0 && p.method !== 'CREDIT') {
      tenderCheckSum += p.amount;
      if (!Number.isSafeInteger(tenderCheckSum)) {
        throw new MobileSaleRepoError('Aggregate payment tender exceeds safe integer bounds.', 400);
      }
    }
  }

  // Defense-in-depth: Validate idempotency key contract directly inside repository
  const rawIdempotencyKey = validateMobileIdempotencyKey(dto.idempotencyKey);
  const storageKey = rawIdempotencyKey ? `mobiles:${rawIdempotencyKey}` : null;
  let incomingHash: string | null = null;
  if (rawIdempotencyKey) {
    incomingHash = computeMobilePayloadHash(dto, branchId);
    // ── Tier 1: Fast-Path Read-Only Check (No transaction client acquired) ──
    let existingRow: Record<string, unknown> | null = null;
    try {
      const existingRes = await pool.query(
        'SELECT sale_id, payload_hash FROM sale_idempotency_keys WHERE idempotency_key = $1 AND branch_id = $2',
        [storageKey, branchId]
      );
      if (existingRes.rows.length > 0) {
        existingRow = existingRes.rows[0] as Record<string, unknown>;
      }
    } catch (lookupErr: unknown) {
      const msg = (lookupErr as Error).message || String(lookupErr);
      if (
        msg.includes('sale_idempotency_keys') ||
        msg.includes('does not exist') ||
        (lookupErr as { code?: string }).code === '42P01'
      ) {
        console.error('[mobile_sale.repo] sale_idempotency_keys table missing. Failing closed.');
        throw new MobileSaleRepoError(
          'Sale service is temporarily unavailable: required idempotency schema has not been applied. Contact system administrator.',
          500
        );
      }
      throw lookupErr;
    }

    if (existingRow) {
      const storedHash = existingRow['payload_hash'] as string | null;
      if (storedHash === null || storedHash !== incomingHash) {
        throw new MobileSaleRepoError(
          `Idempotency key '${rawIdempotencyKey}' was already used for a different payload. Submit a new request with a unique idempotency key.`,
          409
        );
      }
      const existingSaleId = existingRow['sale_id'] as string;
      const replayedResult = await reconstructMobileSaleResult(pool, existingSaleId, branchId);
      if (replayedResult) {
        return replayedResult;
      }
      throw new MobileSaleRepoError('Original sale record could not be resolved during idempotency replay.', 500);
    }
  }

  const client: PoolClient = await pool.connect();

  try {
    await client.query('BEGIN');

    // ── Tier 2: Transaction-Scoped Advisory Lock & Re-Check Under Lock ──
    if (rawIdempotencyKey && storageKey && incomingHash) {
      const [k1, k2] = computeMobileAdvisoryLockKeys(branchId, rawIdempotencyKey);
      await client.query('SELECT pg_advisory_xact_lock($1, $2)', [k1, k2]);

      // Re-check under exclusive lock
      const recheck = await client.query(
        'SELECT sale_id, payload_hash FROM sale_idempotency_keys WHERE idempotency_key = $1 AND branch_id = $2',
        [storageKey, branchId]
      );

      if (recheck.rows.length > 0) {
        // Another concurrent transaction committed while we waited!
        await client.query('ROLLBACK');
        const row = recheck.rows[0] as Record<string, unknown>;
        const storedHash = row['payload_hash'] as string | null;
        if (storedHash === null || storedHash !== incomingHash) {
          throw new MobileSaleRepoError(
            `Idempotency key '${rawIdempotencyKey}' was already used for a different payload. Submit a new request with a unique idempotency key.`,
            409
          );
        }
        const existingSaleId = row['sale_id'] as string;
        const replayedResult = await reconstructMobileSaleResult(pool, existingSaleId, branchId);
        if (replayedResult) {
          return replayedResult;
        }
        throw new MobileSaleRepoError('Original sale record could not be resolved during idempotency replay.', 500);
      }
    }

    // 1. Fetch & Lock Customer if specified
    let customerOpt: { id: string; name: string; credit_limit: number; is_active: number } | null = null;
    if (dto.customerId && dto.customerId !== 'walk-in') {
      const custRes = await client.query(
        'SELECT id, name, credit_limit, is_active FROM customers WHERE id = $1 FOR UPDATE',
        [dto.customerId]
      );
      if (custRes.rows.length === 0) {
        throw new MobileSaleRepoError(`Customer with ID '${dto.customerId}' not found.`, 404);
      }
      const c = custRes.rows[0];
      if (c.is_active !== 1) {
        throw new MobileSaleRepoError(`Customer '${c.name}' is inactive. Cannot proceed with sale.`, 400);
      }
      customerOpt = {
        id: c.id,
        name: c.name,
        credit_limit: Number(c.credit_limit ?? 0),
        is_active: c.is_active,
      };
    }

    // Phase C2: Validate and resolve customer advance application
    // Must occur inside the FOR UPDATE customer lock to serialize concurrent balance reads.
    const rawAdvance = dto.advanceApplied;
    let safeAdvanceApplied = 0;

    if (rawAdvance !== undefined && rawAdvance !== null && rawAdvance !== 0) {
      // Walk-in sales cannot carry an advance (route layer also enforces this, but fail defensively here)
      if (!customerOpt) {
        throw new MobileSaleRepoError(
          'Advance application requires a registered customer. Walk-in sales cannot use advance credit.',
          400
        );
      }
      // Reject non-integer, non-finite, negative, or non-safe values
      if (
        typeof rawAdvance !== 'number' ||
        !Number.isSafeInteger(rawAdvance) ||
        rawAdvance < 0
      ) {
        throw new MobileSaleRepoError(
          'Invalid advanceApplied: must be a non-negative whole PKR integer.',
          400
        );
      }
      // Read live authoritative customer ledger balance under the FOR UPDATE lock
      const advBalRes = await client.query(
        'SELECT COALESCE(SUM(debit) - SUM(credit), 0)::BIGINT AS bal FROM customer_ledger_entries WHERE customer_id = $1',
        [customerOpt.id]
      );
      const liveBalance = Number(advBalRes.rows[0]?.bal ?? 0);
      // availableAdvance is positive only when balance is negative (customer has credit)
      const availableAdvance = Math.max(0, -liveBalance);

      if (rawAdvance > availableAdvance) {
        throw new MobileSaleRepoError(
          `Insufficient customer advance balance. Requested: Rs ${rawAdvance.toLocaleString()}, Available: Rs ${availableAdvance.toLocaleString()}.`,
          400
        );
      }
      // Advance cannot exceed the invoice total
      if (rawAdvance > subtotalSum) {
        throw new MobileSaleRepoError(
          `Advance applied (Rs ${rawAdvance.toLocaleString()}) cannot exceed invoice total (Rs ${subtotalSum.toLocaleString()}).`,
          400
        );
      }
      safeAdvanceApplied = rawAdvance;
    }

    // 2. Lock & Validate each mobile device in deterministic sorted order (Deadlock prevention)
    const sortedDeviceIds = Array.from(uniqueDeviceIds).sort();
    const lockedDevices: Array<{
      id: string;
      brand: string;
      model: string;
      color: string | null;
      storage: string | null;
      status: string;
      cost_price: number;
      expected_sale_price: number | null;
      branch_id: string;
      organization_id: string;
      imei1: string;
      imei2: string | null;
    }> = [];

    for (const devId of sortedDeviceIds) {
      const devRes = await client.query(
        `SELECT d.id, d.brand, d.model, d.color, d.storage, d.status, d.cost_price,
                d.expected_sale_price, d.branch_id, d.organization_id
         FROM mobile_devices d
         WHERE d.id = $1
         FOR UPDATE`,
        [devId]
      );

      if (devRes.rows.length === 0) {
        throw new MobileSaleRepoError(`Mobile device '${devId}' does not exist.`, 404);
      }

      const d = devRes.rows[0];

      // Verify Org and Branch ownership
      if (d.organization_id !== organizationId) {
        throw new MobileSaleRepoError(`Access denied: Device does not belong to your organization.`, 403);
      }
      if (d.branch_id !== branchId) {
        throw new MobileSaleRepoError(`Access denied: Device belongs to another branch.`, 403);
      }

      // Concurrency Gate: must be strictly IN_STOCK
      if (d.status === 'SOLD') {
        throw new MobileSaleRepoError(
          `Conflict: Mobile '${d.brand} ${d.model}' (ID: ${d.id}) has already been sold.`,
          409
        );
      }
      if (d.status !== 'IN_STOCK') {
        throw new MobileSaleRepoError(
          `Device '${d.brand} ${d.model}' cannot be sold because its current status is '${d.status}'.`,
          400
        );
      }

      // Fetch IMEIs for snapshot
      const imeiRes = await client.query(
        `SELECT imei, slot FROM mobile_imei_identifiers WHERE device_id = $1 ORDER BY slot ASC`,
        [devId]
      );
      const imei1 = imeiRes.rows.find((r) => r.slot === 'IMEI1')?.imei ?? '';
      const imei2 = imeiRes.rows.find((r) => r.slot === 'IMEI2')?.imei ?? null;

      if (!imei1) {
        throw new MobileSaleRepoError(`Device '${d.brand} ${d.model}' is missing registered IMEI1.`, 400);
      }

      lockedDevices.push({
        id: d.id,
        brand: d.brand,
        model: d.model,
        color: d.color,
        storage: d.storage,
        status: d.status,
        cost_price: Number(d.cost_price ?? 0),
        expected_sale_price: d.expected_sale_price ? Number(d.expected_sale_price) : null,
        branch_id: d.branch_id,
        organization_id: d.organization_id,
        imei1,
        imei2,
      });
    }

    // 3. Compute Totals
    const subtotal = dto.items.reduce((acc, item) => acc + item.salePrice, 0);
    const totalAmount = subtotal; // Net amount

    // 4. Validate Payments & Allocation
    const paymentsList = dto.payments || [];
    let totalTendered = 0;
    const cleanPayments: Array<{
      id: string;
      method: string;
      amount: number;
      reference_number: string | null;
      notes: string | null;
    }> = [];

    for (const p of paymentsList) {
      if (
        typeof p.amount !== 'number' ||
        !Number.isSafeInteger(p.amount) ||
        p.amount < 0
      ) {
        throw new MobileSaleRepoError(
          `Invalid payment amount for ${p.method || 'tender'}. Amount must be a non-negative whole PKR integer.`,
          400
        );
      }
      if (p.amount > 0) {
        if (p.method === 'CREDIT') {
          // Handled via ledger allocation
          continue;
        }
        totalTendered += p.amount;
        if (!Number.isSafeInteger(totalTendered)) {
          throw new MobileSaleRepoError('Aggregate payment tender exceeds safe integer bounds.', 400);
        }
        cleanPayments.push({
          id: uuidv4(),
          method: p.method,
          amount: p.amount,
          reference_number: p.referenceNumber ?? null,
          notes: p.notes ?? null,
        });
      }
    }

    let recordedPaid = 0;
    let changeAmount = 0;
    let creditAmount = 0;
    let paymentStatus: 'PAID' | 'PARTIALLY_PAID' | 'UNPAID';

    // Phase C2: effectivePayable is the portion the customer must cover with tender.
    // Advance pre-pays safeAdvanceApplied, so tender only needs to cover the remainder.
    const effectivePayable = totalAmount - safeAdvanceApplied;

    if (totalTendered >= effectivePayable) {
      // Full tender covers effective payable; advance covers the rest.
      recordedPaid = totalAmount; // Full invoice is paid (advance + tender)
      changeAmount = totalTendered - effectivePayable; // Change on tender above effective payable
      creditAmount = 0;
      paymentStatus = 'PAID';
    } else {
      // Tender is less than effective payable; remaining goes to customer credit.
      recordedPaid = safeAdvanceApplied + totalTendered; // Advance + actual tender
      changeAmount = 0;
      creditAmount = effectivePayable - totalTendered; // Unpaid remainder after advance and tender
      paymentStatus = totalTendered > 0 || safeAdvanceApplied > 0 ? 'PARTIALLY_PAID' : 'UNPAID';
    }

    if (creditAmount > 0 && !customerOpt) {
      throw new MobileSaleRepoError(
        'Credit purchases require a registered customer. Walk-in customers must pay full balance.',
        400
      );
    }

    const now = new Date().toISOString();

    // 5. Generate Concurrency-Safe User-Scoped Invoice Number
    const branchCodeRow = await client.query('SELECT code FROM branches WHERE id = $1', [branchId]);
    const branchCode: string = (branchCodeRow.rows[0]?.code as string) || 'MAIN';

    await client.query(`
      CREATE TABLE IF NOT EXISTS user_invoice_counters (
        branch_id UUID NOT NULL,
        user_id UUID NOT NULL,
        period_yyyymm VARCHAR(10) NOT NULL,
        next_value BIGINT NOT NULL DEFAULT 1,
        PRIMARY KEY (branch_id, user_id, period_yyyymm)
      )
    `);

    const effectiveUserId = uid || '00000000-0000-0000-0000-000000000001';
    let userCode = 'U01';
    try {
      const shortHex = uid.replace(/-/g, '').slice(-2).toUpperCase();
      userCode = `U${shortHex}`;
    } catch {
      userCode = 'U01';
    }

    const periodYYYYMM = getPeriodYYYYMM();
    const seqRow = await client.query(
      `INSERT INTO user_invoice_counters (branch_id, user_id, period_yyyymm, next_value)
       VALUES ($1, $2, $3, 2)
       ON CONFLICT (branch_id, user_id, period_yyyymm)
       DO UPDATE SET next_value = user_invoice_counters.next_value + 1
       RETURNING (user_invoice_counters.next_value - 1) AS seq_value`,
      [branchId, effectiveUserId, periodYYYYMM]
    );
    const rawVal = seqRow.rows[0]?.seq_value ?? seqRow.rows[0]?.next_value;
    const seqValue = Number(rawVal);
    if (isNaN(seqValue) || seqValue <= 0) {
      throw new MobileSaleRepoError('Failed to generate valid sequential invoice counter.', 500);
    }
    const invoiceNumber = `${branchCode}-${userCode}-${periodYYYYMM}-${String(seqValue).padStart(6, '0')}`;
    const saleId = uuidv4();

    // 6. Handle Customer Ledger Posting
    // Canonical Niazi Mobile Mart ledger convention:
    // Cash / card / bank tenders paid at checkout are recorded in sale_payments and cash_movements.
    // They are NOT posted to customer_ledger_entries (the customer does not owe what was already paid).
    //
    // The customer ledger is strictly adjusted for:
    //   1. Advance Consumption (debit = safeAdvanceApplied):
    //      Moves negative balance towards zero (reduces customer's available credit).
    //   2. Unpaid Invoice Balance / Debt (debit = creditAmount):
    //      Increases positive receivable balance (customer owes shop for unpaid portion).
    //
    // Net ledger change = safeAdvanceApplied + creditAmount
    // Final balance = initialBalance + safeAdvanceApplied + creditAmount
    let customerBalanceAfter: number | null = null;

    if (customerOpt && (safeAdvanceApplied > 0 || creditAmount > 0)) {
      const cid = customerOpt.id;

      // Authoritative balance read under customer FOR UPDATE lock
      const outstandingRow = await client.query(
        'SELECT COALESCE(SUM(debit) - SUM(credit), 0)::BIGINT as bal FROM customer_ledger_entries WHERE customer_id = $1',
        [cid]
      );
      const initialBalance = Number(outstandingRow.rows[0]?.bal ?? 0);
      let runningBalance = initialBalance;

      // Credit limit enforcement on remaining unpaid debt
      if (creditAmount > 0) {
        const projectedFinalBalance = initialBalance + safeAdvanceApplied + creditAmount;
        const projectedOutstanding = Math.max(0, projectedFinalBalance);

        if (customerOpt.credit_limit === 0 && projectedOutstanding > 0) {
          throw new MobileSaleRepoError(
            `Credit purchase not allowed for customer '${customerOpt.name}'. Credit limit is 0, but sale leaves Rs ${creditAmount.toLocaleString()} unpaid.`,
            400
          );
        }

        if (customerOpt.credit_limit > 0 && projectedOutstanding > customerOpt.credit_limit) {
          throw new MobileSaleRepoError(
            `Customer credit limit exceeded. Current balance: Rs ${initialBalance.toLocaleString()}, ` +
            `Projected debt: Rs ${projectedOutstanding.toLocaleString()}, Limit: Rs ${customerOpt.credit_limit.toLocaleString()}`,
            400
          );
        }
      }

      // Entry 1: Advance Consumption (if advance was applied)
      if (safeAdvanceApplied > 0) {
        runningBalance += safeAdvanceApplied; // Increases balance from negative towards zero
        await client.query(
          `INSERT INTO customer_ledger_entries (
             id, customer_id, reference_id, reference_number, entry_type,
             debit, credit, balance_after, description, performed_by, created_at
           ) VALUES ($1, $2, $3, $4, 'SALE', $5, 0, $6, $7, $8, $9)`,
          [
            uuidv4(),
            cid,
            saleId,
            invoiceNumber,
            safeAdvanceApplied,
            runningBalance,
            `Advance applied to Mobile Sale Invoice ${invoiceNumber}`,
            uid,
            now,
          ]
        );
      }

      // Entry 2: Remaining Unpaid Credit Debt (if sale is not fully covered)
      if (creditAmount > 0) {
        runningBalance += creditAmount; // Increases receivable due
        const desc = paymentStatus === 'PARTIALLY_PAID' && recordedPaid > 0
          ? `Mobile Sale Credit ${invoiceNumber} (Partial Paid: Rs ${recordedPaid.toLocaleString()}, Remaining Due: Rs ${creditAmount.toLocaleString()})`
          : `Mobile Sale Credit ${invoiceNumber}`;

        await client.query(
          `INSERT INTO customer_ledger_entries (
             id, customer_id, reference_id, reference_number, entry_type,
             debit, credit, balance_after, description, performed_by, created_at
           ) VALUES ($1, $2, $3, $4, 'SALE', $5, 0, $6, $7, $8, $9)`,
          [
            uuidv4(),
            cid,
            saleId,
            invoiceNumber,
            creditAmount,
            runningBalance,
            desc,
            uid,
            now,
          ]
        );
      }

      customerBalanceAfter = runningBalance;
    }

    // 7. Insert Master Sale Header
    await client.query(
      `INSERT INTO sales (
         id, invoice_number, branch_id, customer_id, customer_name_snapshot,
         subtotal, discount, tax_amount, total_amount, paid_amount, change_amount,
         payment_status, sale_status, performed_by, notes, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
      [
        saleId,
        invoiceNumber,
        branchId,
        customerOpt?.id ?? null,
        customerOpt?.name ?? 'Walk-In Customer',
        subtotal,
        0,
        0,
        totalAmount,
        recordedPaid,
        changeAmount,
        paymentStatus,
        'COMPLETED',
        uid,
        dto.notes ? `[MOBILE_POS] ${dto.notes}` : '[MOBILE_POS] Mobile Device Sale',
        now,
        now,
      ]
    );

    // 8. Insert mobile_sale_items, update mobile_devices status to 'SOLD', and insert mobile_device_movements
    const insertedDevicesPayload: MobileSaleResult['devices'] = [];

    for (const item of dto.items) {
      const lockedDev = lockedDevices.find((d) => d.id === item.deviceId)!;
      const saleItemId = uuidv4();

      await client.query(
        `INSERT INTO mobile_sale_items (
           id, sale_id, device_id, organization_id, branch_id,
           sold_by, sold_by_role_snapshot, brand_snapshot, model_snapshot,
           imei1_snapshot, imei2_snapshot, cost_price_snapshot, sale_price,
           is_return, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, FALSE, $14)`,
        [
          saleItemId,
          saleId,
          lockedDev.id,
          organizationId,
          branchId,
          uid,
          authIdentity.role,
          lockedDev.brand,
          lockedDev.model,
          lockedDev.imei1,
          lockedDev.imei2,
          lockedDev.cost_price,
          item.salePrice,
          now,
        ]
      );

      // Transition Status
      await client.query(
        `UPDATE mobile_devices
         SET status = 'SOLD', sale_id = $1, updated_by = $2, updated_at = $3
         WHERE id = $4`,
        [saleId, uid, now, lockedDev.id]
      );

      // Append Audit Movement
      const movementId = uuidv4();
      await client.query(
        `INSERT INTO mobile_device_movements (
           id, device_id, organization_id, movement_type,
           from_branch_id, to_branch_id, from_status, to_status,
           notes, performed_by, created_at
         ) VALUES ($1, $2, $3, 'SOLD', $4, NULL, 'IN_STOCK', 'SOLD', $5, $6, $7)`,
        [
          movementId,
          lockedDev.id,
          organizationId,
          branchId,
          `Sold via Mobile POS Invoice ${invoiceNumber} by ${authIdentity.username} (${authIdentity.role})`,
          uid,
          now,
        ]
      );

      insertedDevicesPayload.push({
        deviceId: lockedDev.id,
        brand: lockedDev.brand,
        model: lockedDev.model,
        imei1: lockedDev.imei1,
        imei2: lockedDev.imei2,
        salePrice: item.salePrice,
        costPrice: lockedDev.cost_price,
      });
    }

    // 9. Insert sale_payments
    let remainingAllocation = recordedPaid;
    const finalPaymentsList: Array<{ id: string; method: string; amount: number }> = [];

    for (const p of cleanPayments) {
      if (remainingAllocation <= 0) break;
      const allocated = Math.min(p.amount, remainingAllocation);
      if (allocated > 0) {
        await client.query(
          `INSERT INTO sale_payments (id, sale_id, amount, payment_method, reference_number, notes, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [p.id, saleId, allocated, p.method, p.reference_number, p.notes, now]
        );
        finalPaymentsList.push({
          id: p.id,
          method: p.method,
          amount: allocated,
        });
        remainingAllocation -= allocated;
      }
    }

    // 10. Record Cash Movement for CASH portion if present (Enforces open cash session)
    const allocatedCash = finalPaymentsList
      .filter((p) => p.method === 'CASH')
      .reduce((sum, p) => sum + p.amount, 0);

    if (allocatedCash > 0) {
      const openSessionRow = await client.query(
        "SELECT id FROM cash_sessions WHERE branch_id = $1 AND status = 'OPEN' LIMIT 1",
        [branchId]
      );
      const openSessionId: string | null = openSessionRow.rows[0]?.id ?? null;

      if (!openSessionId) {
        throw new MobileSaleRepoError(
          'No open cash register session found for this branch. Please open a cash session before accepting cash payments.',
          400
        );
      }

      const cashMvId = uuidv4();
      await client.query(
        `INSERT INTO cash_movements (
           id, session_id, branch_id, movement_type, direction,
           amount, reference_id, reference_number, payment_method,
           description, performed_by, created_at
         ) VALUES ($1, $2, $3, 'SALE_PAYMENT', 'IN', $4, $5, $6, 'CASH', $7, $8, $9)`,
        [
          cashMvId,
          openSessionId,
          branchId,
          allocatedCash,
          saleId,
          invoiceNumber,
          `Mobile Sale Cash Payment ${invoiceNumber}`,
          uid,
          now,
        ]
      );
    }

    // Write change log entry
    await writeChangeLogEntry(client, {
      organizationId,
      branchId,
      eventType: 'SALE_COMPLETED',
      entityType: 'sale',
      entityId: saleId,
      payloadStr: JSON.stringify({
        invoiceNumber,
        mobileCount: dto.items.length,
        totalAmount,
        paidAmount: recordedPaid,
        performedBy: uid,
        performedByRole: authIdentity.role,
      }),
    });

    // Persist Idempotency Record atomically (Strict plain INSERT without ON CONFLICT DO NOTHING)
    if (rawIdempotencyKey && storageKey && incomingHash) {
      try {
        await client.query(
          `INSERT INTO sale_idempotency_keys (idempotency_key, branch_id, sale_id, payload_hash, created_at)
           VALUES ($1, $2, $3, $4, now())`,
          [storageKey, branchId, saleId, incomingHash]
        );
      } catch (insertErr: unknown) {
        const errCode = (insertErr as { code?: string })?.code;
        if (errCode === '23505') {
          // PostgreSQL unique violation: key already exists
          throw new MobileSaleRepoError(
            `Idempotency key '${rawIdempotencyKey}' was already used. Submit a new request with a unique idempotency key.`,
            409
          );
        }
        throw insertErr;
      }
    }

    await client.query('COMMIT');

    return {
      saleId,
      invoiceNumber,
      branchId,
      customerId: customerOpt?.id ?? null,
      customerName: customerOpt?.name ?? 'Walk-In Customer',
      subtotal,
      discount: 0,
      totalAmount,
      paidAmount: recordedPaid,
      changeAmount,
      creditAmount,
      paymentStatus,
      advanceApplied: safeAdvanceApplied,
      devices: insertedDevicesPayload,
      payments: finalPaymentsList,
      cashier: {
        userId: authIdentity.userId,
        name: authIdentity.username,
        role: authIdentity.role,
      },
      customerBalanceAfter,
      createdAt: now,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
