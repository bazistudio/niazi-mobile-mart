/**
 * Purchase Repository — TypeScript/PostgreSQL
 *
 * Implements the full atomic purchase invoice engine for Niazi Mobile Mart.
 * Covers Phases 4, 5, and 6 of the Supplier & Procurement implementation:
 *
 *   Phase 4 — Purchase Invoice Engine
 *     POST /api/purchases  → completePurchase()
 *     GET  /api/purchases  → listPurchases()
 *     GET  /api/purchases/:id → getPurchase()
 *     GET  /api/purchases/:id/lines → getPurchaseLines()
 *
 *   Phase 5 — WAC Integration
 *     All WAC calculations are performed in this transaction (not delegated
 *     back to receiveStock) to ensure atomicity across multiple purchase lines.
 *
 *   Phase 6 — Demand Fulfillment
 *     saveDemand() / listDemands() / getDemand() / updateDemandStatus()
 *     fulfillDemand() calls completePurchase() and links demand items.
 *
 * ARCHITECTURAL RULES:
 *   - Single authoritative purchase path: completePurchase() is the only
 *     function that creates purchases, purchase_lines, WAC updates,
 *     supplier_ledger_entries DEBIT, and optional cash_movements CREDIT.
 *   - receiveStock() in product.repo.ts now delegates to completePurchase()
 *     when supplier_id is present. Direct call remains for non-supplier
 *     stock adjustments and opening inventory.
 *   - All PKR monetary values are BIGINT (whole rupees); Math.round() is used
 *     at every floating-point boundary.
 *   - No global pg type parsers are modified. BigInt fields are coerced via
 *     Math.round(Number(...)) at the read boundary.
 */

import { Pool, PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';

// ─── Error ────────────────────────────────────────────────────────────────────

export class PurchaseRepoError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number
  ) {
    super(message);
    this.name = 'PurchaseRepoError';
  }
}

// ─── Idempotency fingerprint ────────────────────────────────────────────────

/**
 * Compute a canonical SHA-256 fingerprint for a purchase request.
 *
 * Fields included: supplier_id, branch_id, sorted product lines
 * (product_id, quantity, unit_cost, discount), total paid_amount,
 * payment_method, demand_id.  Transient UI fields (notes, references)
 * are intentionally excluded so minor annotation differences do not
 * cause a spurious 409.
 *
 * Returns the first 64 hex characters of the SHA-256 digest.
 */
function computeRequestFingerprint(dto: {
  supplier_id: string;
  branch_id: string;
  lines: Array<{ product_id: string; quantity: number; unit_cost: number; discount?: number | null }>;
  paid_amount?: number | null;
  payment_method?: string | null;
  demand_id?: string | null;
}): string {
  const sortedLines = [...dto.lines]
    .map(l => ({
      p: l.product_id.trim(),
      q: Math.round(Number(l.quantity)),
      c: Math.round(Number(l.unit_cost)),
      d: Math.round(Number(l.discount ?? 0)),
    }))
    .sort((a, b) => a.p < b.p ? -1 : a.p > b.p ? 1 : 0);
  const canonical = JSON.stringify({
    s: dto.supplier_id.trim(),
    b: dto.branch_id.trim(),
    l: sortedLines,
    p: Math.round(Number(dto.paid_amount ?? 0)),
    m: (dto.payment_method ?? '').trim().toUpperCase(),
    d: (dto.demand_id ?? '').trim(),
  });
  return createHash('sha256').update(canonical, 'utf8').digest('hex').slice(0, 64);
}

// ─── DTOs — Purchase Invoice ──────────────────────────────────────────────────

export interface PurchaseLineInputDto {
  product_id: string;
  quantity: number;             // must be > 0
  unit_cost: number;            // whole PKR rupees, >= 0
  discount?: number | null;     // whole PKR rupees discount off this line
  new_sale_price?: number | null; // optional: update product sale_price
  demand_item_id?: string | null; // optional: link to supplier_demand_items.id
}

export interface CompletePurchaseDto {
  supplier_id: string;
  branch_id: string;
  lines: PurchaseLineInputDto[];        // at least 1 line
  paid_amount?: number | null;          // immediate payment (0 = on credit)
  payment_method?: string | null;       // CASH | BANK | EASYPAISA | JAZZCASH | OTHER
  payment_reference?: string | null;
  notes?: string | null;
  demand_id?: string | null;            // optional: fulfill a saved demand order
  supplier_invoice_ref?: string | null; // supplier's own invoice number
  idempotency_key?: string | null;      // optional: client UUID to prevent duplicate-submit on retry
  account_id?: string | null;           // Phase 1: FK to business_accounts for BANK/EASYPAISA/JAZZCASH payments
}

export interface PurchaseLine {
  id: string;
  purchase_id: string;
  product_id: string;
  product_name_snapshot: string;
  sku_snapshot: string | null;
  quantity: number;
  unit_cost: number;
  discount: number;
  line_total: number;
  created_at: string;
}

export interface Purchase {
  id: string;
  purchase_number: string;
  supplier_id: string;
  supplier_name?: string;
  branch_id: string;
  subtotal: number;
  discount: number;
  total_amount: number;
  paid_amount: number;
  credit_amount: number;
  payment_status: 'PAID' | 'PARTIALLY_PAID' | 'UNPAID';
  status: 'COMPLETED' | 'CANCELLED';
  notes: string | null;
  performed_by: string | null;
  created_at: string;
  updated_at: string;
  payment_method: string | null; // Phase 1: persisted from migration 057
  account_id: string | null;    // Phase 1: FK to business_accounts for digital payments
  lines?: PurchaseLine[];
}

export interface PurchaseResult {
  purchase_id: string;
  purchase_number: string;
  total_amount: number;
  paid_amount: number;
  credit_amount: number;
  payment_status: string;
  supplier_new_balance: number;
  lines_processed: number;
}

// ─── DTOs — Demand Orders ─────────────────────────────────────────────────────

export interface SaveDemandDto {
  supplier_id?: string | null;
  customer_id?: string | null;
  branch_id: string;
  items: DemandItemInputDto[];
  notes?: string | null;
  status?: 'DRAFT' | 'ORDERED';
}

export interface DemandItemInputDto {
  product_id: string;
  requested_quantity: number;
  estimated_unit_cost: number;
}

export interface DemandItem {
  id: string;
  demand_id: string;
  product_id: string;
  product_name?: string;
  product_sku?: string;
  requested_quantity: number;
  received_quantity: number;
  estimated_unit_cost: number;
  actual_unit_cost: number | null;
  estimated_line_total: number;
  actual_line_total: number | null;
  fulfilled_purchase_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Demand {
  id: string;
  demand_number: string;
  supplier_id: string | null;
  supplier_name?: string | null;
  customer_id: string | null;
  customer_name?: string | null;
  branch_id: string;
  status: 'DRAFT' | 'ORDERED' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'CANCELLED';
  total_estimated_amount: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  items?: DemandItem[];
}

export interface DemandListFilters {
  supplier_id?: string | null;
  branch_id?: string | null;
  status?: string | null;
  limit?: number;
  offset?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function bigint(val: unknown): number {
  return Math.round(Number(val ?? 0));
}

function safeStr(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  return String(val);
}

// ─── completePurchase ─────────────────────────────────────────────────────────
//
// 17-step atomic transaction:
//  1.  Validate supplier (exists + locked FOR UPDATE)
//  2.  Validate branch (exists, optionally check authorization upstream)
//  3.  Validate products (each line's product_id must exist)
//  4.  Validate quantities and unit costs (> 0 / >= 0)
//  5.  Validate demand fulfillment quantities (if demand_id provided)
//  6.  Generate sequential purchase number (PUR-000001) from counters table
//  7.  Create purchases header row
//  8.  Create purchase_lines rows (product_name_snapshot, sku_snapshot stored)
//  9.  Update products.average_cost (WAC) per line, plus purchase_price / sale_price
// 10.  Increase stock.quantity at branch (upsert)
// 11.  Insert stock_movements rows (movement_type = 'IN')
// 12.  Compute new supplier running balance
// 13.  Insert supplier_ledger_entries DEBIT (entry_type = 'PURCHASE')
// 14.  If paid_amount > 0: insert supplier_ledger_entries CREDIT (entry_type = 'PAYMENT')
// 15.  If paid_amount > 0 and payment_method == 'CASH': insert cash_movements OUT row
// 16.  If demand_id provided: update demand_items received_quantity + demand status
// 17.  COMMIT

export async function completePurchase(
  pool: Pool,
  dto: CompletePurchaseDto,
  performedBy?: string | null
): Promise<PurchaseResult> {
  // ── Input validation ────────────────────────────────────────────────────────
  if (!dto.supplier_id?.trim()) {
    throw new PurchaseRepoError('supplier_id is required', 400);
  }
  if (!dto.branch_id?.trim()) {
    throw new PurchaseRepoError('branch_id is required', 400);
  }
  if (!dto.lines || dto.lines.length === 0) {
    throw new PurchaseRepoError('At least one purchase line is required', 400);
  }
  for (const line of dto.lines) {
    if (!line.product_id?.trim()) {
      throw new PurchaseRepoError('Each line must have a product_id', 400);
    }
    const qty = Math.round(Number(line.quantity ?? 0));
    if (qty <= 0) {
      throw new PurchaseRepoError(`quantity must be > 0 for product ${line.product_id}`, 400);
    }
    const cost = Math.round(Number(line.unit_cost ?? 0));
    if (cost < 0) {
      throw new PurchaseRepoError(`unit_cost cannot be negative for product ${line.product_id}`, 400);
    }
  }

  const paidAmount = Math.round(Number(dto.paid_amount ?? 0));
  if (paidAmount < 0) {
    throw new PurchaseRepoError('paid_amount cannot be negative', 400);
  }

  const supplierId = dto.supplier_id.trim();
  const branchId   = dto.branch_id.trim();
  const now        = new Date().toISOString();

  // ── Global idempotency pre-flight (before any row lock) ───────────────────
  // Check outside any transaction to avoid holding supplier row locks while
  // scanning the idempotency index.  Concurrent requests with the same key
  // race only on the unique-index INSERT; the loser catches error code 23505
  // and re-fetches the winning row.
  const requestFingerprint = dto.idempotency_key?.trim()
    ? computeRequestFingerprint(dto)
    : null;

  if (dto.idempotency_key?.trim()) {
    const idemKey = dto.idempotency_key.trim();
    const preCheck = await pool.query<{
      id: string; purchase_number: string;
      total_amount: number; paid_amount: number; credit_amount: number;
      payment_status: string; supplier_id: string; lines_count: number;
      request_fingerprint: string | null;
    }>(
      `SELECT p.id, p.purchase_number, p.total_amount, p.paid_amount,
              p.credit_amount, p.payment_status, p.supplier_id,
              COUNT(pl.id)::int AS lines_count,
              p.request_fingerprint
         FROM purchases p
         LEFT JOIN purchase_lines pl ON pl.purchase_id = p.id
        WHERE p.idempotency_key = $1
        GROUP BY p.id
        LIMIT 1`,
      [idemKey]
    );
    if (preCheck.rowCount && preCheck.rowCount > 0) {
      const ex = preCheck.rows[0];
      // If stored fingerprint exists and differs → payload conflict (409)
      if (
        ex.request_fingerprint !== null &&
        requestFingerprint !== null &&
        ex.request_fingerprint !== requestFingerprint
      ) {
        throw new PurchaseRepoError(
          `Idempotency key conflict: same key was used with a different purchase payload (supplier, products, quantities or payment differ). Use a new idempotency_key for a genuinely new purchase.`,
          409
        );
      }
      // Same key + same (or unknown) payload → return original result
      const balRes = await pool.query<{ balance_after: number }>(
        `SELECT balance_after FROM supplier_ledger_entries
          WHERE supplier_id = $1
          ORDER BY created_at DESC, id DESC
          LIMIT 1`,
        [ex.supplier_id]
      );
      const supplierBalance = Math.round(Number(balRes.rows[0]?.balance_after ?? 0));
      return {
        purchase_id:          ex.id,
        purchase_number:      ex.purchase_number,
        total_amount:         Math.round(Number(ex.total_amount)),
        paid_amount:          Math.round(Number(ex.paid_amount)),
        credit_amount:        Math.round(Number(ex.credit_amount)),
        payment_status:       ex.payment_status as 'PAID' | 'PARTIALLY_PAID' | 'UNPAID',
        supplier_new_balance: supplierBalance,
        lines_processed:      Number(ex.lines_count),
      };
    }
  }

  const client: PoolClient = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── Step 1: Validate & lock supplier ────────────────────────────────────
    const supplierRes = await client.query(
      `SELECT id, name FROM suppliers WHERE id = $1 FOR UPDATE`,
      [supplierId]
    );
    if (supplierRes.rowCount === 0) {
      throw new PurchaseRepoError(`Supplier '${supplierId}' not found`, 404);
    }
    const supplierName = supplierRes.rows[0].name as string;

    // ── Step 2: Validate branch ──────────────────────────────────────────────
    const branchRes = await client.query(
      `SELECT id FROM branches WHERE id = $1`,
      [branchId]
    );
    if (branchRes.rowCount === 0) {
      throw new PurchaseRepoError(`Branch '${branchId}' not found`, 404);
    }

    // ── Step 3 & 4: Validate products and collect snapshots ──────────────────
    const productIds = dto.lines.map(l => l.product_id.trim());
    const productRes = await client.query(
      `SELECT id, name, sku, average_cost, sale_price
       FROM products WHERE id = ANY($1::uuid[])`,
      [productIds]
    );
    const productMap = new Map<string, {
      id: string; name: string; sku: string | null;
      average_cost: number; sale_price: number;
    }>();
    for (const row of productRes.rows) {
      productMap.set(String(row.id), {
        id: String(row.id),
        name: String(row.name),
        sku: safeStr(row.sku),
        average_cost: bigint(row.average_cost),
        sale_price: bigint(row.sale_price),
      });
    }
    for (const line of dto.lines) {
      if (!productMap.has(line.product_id.trim())) {
        throw new PurchaseRepoError(`Product '${line.product_id}' not found`, 404);
      }
    }

    // ── Step 5: Validate demand if provided ──────────────────────────────────
    if (dto.demand_id) {
      const demandRes = await client.query(
        `SELECT id, status FROM supplier_demands WHERE id = $1 FOR UPDATE`,
        [dto.demand_id]
      );
      if (demandRes.rowCount === 0) {
        throw new PurchaseRepoError(`Demand order '${dto.demand_id}' not found`, 404);
      }
      const demStatus = String(demandRes.rows[0].status);
      if (demStatus === 'CANCELLED' || demStatus === 'RECEIVED') {
        throw new PurchaseRepoError(
          `Demand order '${dto.demand_id}' is already ${demStatus} and cannot be fulfilled again`, 400
        );
      }
    }

    // ── Step 6: Generate sequential purchase number ──────────────────────────
    // Pattern: PUR-000001, PUR-000002, ...
    // Uses counters table with SELECT FOR UPDATE to prevent races.
    const ctrRes = await client.query(
      `UPDATE counters SET value = value + 1 WHERE name = 'purchase_number' RETURNING value`
    );
    if (!ctrRes.rowCount || ctrRes.rowCount === 0) {
      // Counter row missing — insert it and use 1
      await client.query(
        `INSERT INTO counters (name, value) VALUES ('purchase_number', 1) ON CONFLICT (name) DO UPDATE SET value = counters.value + 1`
      );
      const ctrRes2 = await client.query(
        `SELECT value FROM counters WHERE name = 'purchase_number'`
      );
      const num2 = Number(ctrRes2.rows[0].value);
      var purchaseNumber = 'PUR-' + String(num2).padStart(6, '0');
    } else {
      const num = Number(ctrRes.rows[0].value);
      var purchaseNumber = 'PUR-' + String(num).padStart(6, '0');
    }

    // ── Compute totals ───────────────────────────────────────────────────────
    let subtotal = 0;
    let totalDiscount = 0;
    for (const line of dto.lines) {
      const qty  = Math.round(Number(line.quantity));
      const cost = Math.round(Number(line.unit_cost));
      const disc = Math.round(Number(line.discount ?? 0));
      subtotal      += qty * cost;
      totalDiscount += disc;
    }
    const totalAmount = Math.max(0, subtotal - totalDiscount);
    const cappedPaid  = Math.min(paidAmount, totalAmount);
    const creditAmount = totalAmount - cappedPaid;
    const paymentStatus: 'PAID' | 'PARTIALLY_PAID' | 'UNPAID' =
      cappedPaid >= totalAmount ? 'PAID'
        : cappedPaid > 0        ? 'PARTIALLY_PAID'
        : 'UNPAID';

    // ── Step 7: Create purchases header ─────────────────────────────────────
    const purchaseId = uuidv4();
    await client.query(
      `INSERT INTO purchases (
         id, purchase_number, supplier_id, branch_id,
         subtotal, discount, total_amount, paid_amount, credit_amount,
         payment_status, status, notes, performed_by, created_at, updated_at,
         idempotency_key, request_fingerprint, payment_method, account_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'COMPLETED',$11,$12,$13,$13,$14,$15,$16,$17)`,
      [
        purchaseId, purchaseNumber, supplierId, branchId,
        subtotal, totalDiscount, totalAmount, cappedPaid, creditAmount,
        paymentStatus,
        dto.notes ?? null,
        performedBy ?? null,
        now,
        dto.idempotency_key?.trim() || null,  // store key for future duplicate checks
        requestFingerprint,                   // payload hash for conflict detection
        (dto.payment_method ?? 'CASH').toUpperCase(),  // Phase 1: persist payment method
        dto.account_id ?? null,                        // Phase 1: FK to business_accounts
      ]
    );

    // ── Steps 8–11: Per-line processing ─────────────────────────────────────
    for (const line of dto.lines) {
      const pid  = line.product_id.trim();
      const qRec = Math.round(Number(line.quantity));
      const cNew = Math.round(Number(line.unit_cost));
      const disc = Math.round(Number(line.discount ?? 0));
      const lineTotal = Math.max(0, qRec * cNew - disc);
      const prod = productMap.get(pid)!;

      // Step 8: Create purchase_lines row (historical snapshot)
      await client.query(
        `INSERT INTO purchase_lines (
           id, purchase_id, product_id, product_name_snapshot,
           sku_snapshot, quantity, unit_cost, discount, line_total, created_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          uuidv4(), purchaseId, pid,
          prod.name,            // snapshot — immutable for history
          prod.sku ?? null,
          qRec, cNew, disc, lineTotal, now,
        ]
      );

      // Step 9: Compute WAC and update products
      // Lock products row for WAC computation
      const pLockRes = await client.query(
        `SELECT average_cost FROM products WHERE id = $1 FOR UPDATE`,
        [pid]
      );
      const cOld = bigint(pLockRes.rows[0]?.average_cost ?? 0);

      // Global stock quantity across all branches (WAC denominator)
      const gRes = await client.query(
        `SELECT COALESCE(SUM(quantity), 0) AS total_qty FROM stock WHERE product_id = $1`,
        [pid]
      );
      const qOld = bigint(gRes.rows[0].total_qty);

      const denom = qOld + qRec;
      const cWac = denom > 0
        ? Math.round(((qOld * cOld) + (qRec * cNew)) / denom)
        : cNew;

      // Determine updated sale_price
      let updatedSalePrice: number | null = null;
      if (line.new_sale_price !== undefined && line.new_sale_price !== null) {
        const sp = Math.round(Number(line.new_sale_price));
        if (sp < 0) throw new PurchaseRepoError('sale_price cannot be negative', 400);
        updatedSalePrice = sp;
      }

      await client.query(
        `UPDATE products
         SET average_cost   = $1,
             purchase_price = $2,
             sale_price     = COALESCE($3, sale_price),
             updated_at     = $4
         WHERE id = $5`,
        [cWac, cNew, updatedSalePrice, now, pid]
      );

      // Step 10: Upsert branch stock
      await client.query(
        `INSERT INTO stock (product_id, branch_id, quantity, updated_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (product_id, branch_id)
         DO UPDATE SET
           quantity   = stock.quantity + $5::BIGINT,
           updated_at = $4`,
        [pid, branchId, qRec, now, qRec]
      );

      // Step 11: Insert stock_movements row
      const stockLockRes = await client.query(
        `SELECT quantity FROM stock WHERE product_id = $1 AND branch_id = $2`,
        [pid, branchId]
      );
      const newQty = bigint(stockLockRes.rows[0]?.quantity ?? qRec);
      const prevQty = newQty - qRec;

      await client.query(
        `INSERT INTO stock_movements (
           id, product_id, branch_id, movement_type, quantity,
           previous_stock, resulting_stock, reason, reference_id,
           performed_by, created_at
         ) VALUES ($1,$2,$3,'IN',$4,$5,$6,$7,$8,$9,$10)`,
        [
          uuidv4(), pid, branchId,
          qRec, Math.max(0, prevQty), newQty,
          dto.notes ? `Purchase Invoice — ${dto.notes}` : `Purchase Invoice ${purchaseNumber}`,
          purchaseId,          // reference_id = purchase
          performedBy ?? null,
          now,
        ]
      );

      // Step 16 (demand items): update received_quantity on demand_item if linked
      if (line.demand_item_id) {
        await client.query(
          `UPDATE supplier_demand_items
           SET received_quantity   = received_quantity + $1,
               actual_unit_cost    = $2,
               actual_line_total   = (received_quantity + $1) * $2,
               fulfilled_purchase_id = $3,
               updated_at          = $4
           WHERE id = $5 AND demand_id = $6`,
          [qRec, cNew, purchaseId, now, line.demand_item_id, dto.demand_id ?? null]
        );
      }
    }

    // ── Steps 12–13: Supplier DEBIT ledger entry ─────────────────────────────
    const balResult = await client.query(
      `SELECT COALESCE(SUM(debit) - SUM(credit), 0)::BIGINT AS balance
       FROM supplier_ledger_entries WHERE supplier_id = $1`,
      [supplierId]
    );
    const currentBalance = bigint(balResult.rows[0].balance);
    const balanceAfterDebit = currentBalance + totalAmount;

    const debitEntryId = uuidv4();
    await client.query(
      `INSERT INTO supplier_ledger_entries (
         id, supplier_id, reference_id, reference_number, entry_type,
         debit, credit, balance_after, description, performed_by, created_at
       ) VALUES ($1,$2,$3,$4,'PURCHASE',$5,0,$6,$7,$8,$9)`,
      [
        debitEntryId, supplierId,
        purchaseId,   purchaseNumber,
        totalAmount,  // debit increases payable
        balanceAfterDebit,
        dto.notes
          ? `Purchase invoice ${purchaseNumber} — ${dto.notes}`
          : `Purchase invoice ${purchaseNumber}`,
        performedBy ?? null,
        now,
      ]
    );

    let finalBalance = balanceAfterDebit;

    // ── Step 14: Supplier CREDIT ledger entry if immediate payment ────────────
    if (cappedPaid > 0) {
      const balanceAfterCredit = balanceAfterDebit - cappedPaid;
      const creditEntryId = uuidv4();

      // Generate payment receipt number
      let receiptNumber: string;
      if (dto.payment_reference?.trim()) {
        receiptNumber = dto.payment_reference.trim();
      } else {
        const prCtrRes = await client.query(
          `UPDATE counters SET value = value + 1 WHERE name = 'supplier_payment_number' RETURNING value`
        );
        if (!prCtrRes.rowCount || prCtrRes.rowCount === 0) {
          await client.query(
            `INSERT INTO counters (name, value) VALUES ('supplier_payment_number', 1) ON CONFLICT (name) DO UPDATE SET value = counters.value + 1`
          );
          const prCtrRes2 = await client.query(`SELECT value FROM counters WHERE name = 'supplier_payment_number'`);
          receiptNumber = 'PAY-' + String(Number(prCtrRes2.rows[0].value)).padStart(6, '0');
        } else {
          receiptNumber = 'PAY-' + String(Number(prCtrRes.rows[0].value)).padStart(6, '0');
        }
      }

      await client.query(
        `INSERT INTO supplier_ledger_entries (
           id, supplier_id, reference_id, reference_number, entry_type,
           debit, credit, balance_after, description, performed_by, created_at
         ) VALUES ($1,$2,$3,$4,'PAYMENT',0,$5,$6,$7,$8,$9)`,
        [
          creditEntryId, supplierId,
          purchaseId,    receiptNumber,
          cappedPaid,    // credit decreases payable
          balanceAfterCredit,
          `Payment for ${purchaseNumber} (${dto.payment_method ?? 'CASH'})`,
          performedBy ?? null,
          now,
        ]
      );

      finalBalance = balanceAfterCredit;

      // ── Step 15: Cash movement for CASH payments ───────────────────────────
      if ((dto.payment_method ?? 'CASH').toUpperCase() === 'CASH') {
        const sessionRes = await client.query(
          `SELECT id FROM cash_sessions WHERE status = 'OPEN' AND branch_id = $1 LIMIT 1`,
          [branchId]
        );
        if (!sessionRes.rowCount || sessionRes.rowCount === 0) {
          throw new PurchaseRepoError(
            'No open cash session found for this branch. Please open a cash session before recording cash payments.',
            400
          );
        }
        const sessionId = String(sessionRes.rows[0].id);

        await client.query(
          `INSERT INTO cash_movements (
             id, session_id, branch_id, reference_id, movement_type,
             direction, amount, description, performed_by, created_at
           ) VALUES ($1,$2,$3,$4,'SUPPLIER_PAYMENT','OUT',$5,$6,$7,$8)`,
          [
            uuidv4(), sessionId, branchId,
            purchaseId,
            cappedPaid,
            `Purchase payment ${purchaseNumber}`,
            performedBy ?? null,
            now,
          ]
        );
      }
    }

    // ── Step 16 (demand header): update demand status if demand_id provided ──
    if (dto.demand_id) {
      // Check if all items are fully received
      const demItemsRes = await client.query(
        `SELECT requested_quantity, received_quantity FROM supplier_demand_items WHERE demand_id = $1`,
        [dto.demand_id]
      );
      const allReceived = demItemsRes.rows.every(
        (r: { requested_quantity: unknown; received_quantity: unknown }) =>
          bigint(r.received_quantity) >= bigint(r.requested_quantity)
      );
      const anyReceived = demItemsRes.rows.some(
        (r: { received_quantity: unknown }) => bigint(r.received_quantity) > 0
      );
      const newDemandStatus = allReceived ? 'RECEIVED'
        : anyReceived ? 'PARTIALLY_RECEIVED'
        : 'ORDERED';

      await client.query(
        `UPDATE supplier_demands SET status = $1, updated_at = $2 WHERE id = $3`,
        [newDemandStatus, now, dto.demand_id]
      );
    }

    // ── Step 17: Commit ───────────────────────────────────────────────────────
    await client.query('COMMIT');

    return {
      purchase_id:           purchaseId,
      purchase_number:       purchaseNumber,
      total_amount:          totalAmount,
      paid_amount:           cappedPaid,
      credit_amount:         creditAmount,
      payment_status:        paymentStatus,
      supplier_new_balance:  finalBalance,
      lines_processed:       dto.lines.length,
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err instanceof PurchaseRepoError) throw err;
    // ── Unique-index race: concurrent request won the idempotency_key INSERT ──────
    // PostgreSQL error code 23505 = unique_violation.
    // The parallel request committed before this one; re-fetch and return it.
    const pgErr = err as { code?: string };
    if (pgErr.code === '23505' && dto.idempotency_key?.trim()) {
      const idemKey = dto.idempotency_key.trim();
      try {
        const raceRes = await pool.query<{
          id: string; purchase_number: string;
          total_amount: number; paid_amount: number; credit_amount: number;
          payment_status: string; supplier_id: string; lines_count: number;
        }>(
          `SELECT p.id, p.purchase_number, p.total_amount, p.paid_amount,
                  p.credit_amount, p.payment_status, p.supplier_id,
                  COUNT(pl.id)::int AS lines_count
             FROM purchases p
             LEFT JOIN purchase_lines pl ON pl.purchase_id = p.id
            WHERE p.idempotency_key = $1
            GROUP BY p.id LIMIT 1`,
          [idemKey]
        );
        if (raceRes.rowCount && raceRes.rowCount > 0) {
          const ex = raceRes.rows[0];
          const balRes = await pool.query<{ balance_after: number }>(
            `SELECT balance_after FROM supplier_ledger_entries
              WHERE supplier_id = $1
              ORDER BY created_at DESC, id DESC LIMIT 1`,
            [ex.supplier_id]
          );
          return {
            purchase_id:          ex.id,
            purchase_number:      ex.purchase_number,
            total_amount:         Math.round(Number(ex.total_amount)),
            paid_amount:          Math.round(Number(ex.paid_amount)),
            credit_amount:        Math.round(Number(ex.credit_amount)),
            payment_status:       ex.payment_status as 'PAID' | 'PARTIALLY_PAID' | 'UNPAID',
            supplier_new_balance: Math.round(Number(balRes.rows[0]?.balance_after ?? 0)),
            lines_processed:      Number(ex.lines_count),
          };
        }
      } catch {
        // fall through to generic error below
      }
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[PurchaseRepo.completePurchase] Error:', err);
    throw new PurchaseRepoError(`Purchase transaction failed: ${msg}`, 500);
  } finally {
    client.release();
  }
}

// ─── listPurchases ────────────────────────────────────────────────────────────

export interface PurchaseListFilters {
  supplier_id?: string | null;
  branch_id?: string | null;
  payment_status?: string | null;
  limit?: number;
  offset?: number;
}

export async function listPurchases(
  pool: Pool,
  filters: PurchaseListFilters = {}
): Promise<Purchase[]> {
  const params: unknown[] = [];
  const clauses: string[] = [];

  if (filters.supplier_id) {
    params.push(filters.supplier_id);
    clauses.push(`p.supplier_id = $${params.length}`);
  }
  if (filters.branch_id) {
    params.push(filters.branch_id);
    clauses.push(`p.branch_id = $${params.length}`);
  }
  if (filters.payment_status) {
    params.push(filters.payment_status);
    clauses.push(`p.payment_status = $${params.length}`);
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const limit  = Math.min(filters.limit  ?? 50, 200);
  const offset = filters.offset ?? 0;

  const result = await pool.query(
    `SELECT p.*, s.name AS supplier_name
     FROM purchases p
     LEFT JOIN suppliers s ON s.id = p.supplier_id
     ${where}
     ORDER BY p.created_at DESC
     LIMIT ${limit} OFFSET ${offset}`,
    params
  );

  return result.rows.map(rowToPurchase);
}

// ─── getPurchase ──────────────────────────────────────────────────────────────

export async function getPurchase(pool: Pool, purchaseId: string): Promise<Purchase> {
  const result = await pool.query(
    `SELECT p.*, s.name AS supplier_name
     FROM purchases p
     LEFT JOIN suppliers s ON s.id = p.supplier_id
     WHERE p.id = $1`,
    [purchaseId]
  );
  if (result.rowCount === 0) {
    throw new PurchaseRepoError(`Purchase '${purchaseId}' not found`, 404);
  }
  const purchase = rowToPurchase(result.rows[0]);
  purchase.lines = await getPurchaseLines(pool, purchaseId);
  return purchase;
}

// ─── getPurchaseLines ─────────────────────────────────────────────────────────

export async function getPurchaseLines(pool: Pool, purchaseId: string): Promise<PurchaseLine[]> {
  const result = await pool.query(
    `SELECT * FROM purchase_lines WHERE purchase_id = $1 ORDER BY created_at`,
    [purchaseId]
  );
  return result.rows.map((r): PurchaseLine => ({
    id:                     String(r.id),
    purchase_id:            String(r.purchase_id),
    product_id:             String(r.product_id),
    product_name_snapshot:  String(r.product_name_snapshot),
    sku_snapshot:           safeStr(r.sku_snapshot),
    quantity:               bigint(r.quantity),
    unit_cost:              bigint(r.unit_cost),
    discount:               bigint(r.discount ?? 0),
    line_total:             bigint(r.line_total),
    created_at:             String(r.created_at),
  }));
}

// ─── saveDemand ───────────────────────────────────────────────────────────────

export async function saveDemand(
  pool: Pool,
  dto: SaveDemandDto,
  performedBy?: string | null
): Promise<Demand> {
  if (!dto.branch_id?.trim()) {
    throw new PurchaseRepoError('branch_id is required', 400);
  }
  if (!dto.items || dto.items.length === 0) {
    throw new PurchaseRepoError('At least one demand item is required', 400);
  }

  const now = new Date().toISOString();
  const client: PoolClient = await pool.connect();

  try {
    await client.query('BEGIN');

    // Generate sequential demand number (DEM-000001)
    const demCtrRes = await client.query(
      `UPDATE counters SET value = value + 1 WHERE name = 'demand_number' RETURNING value`
    );
    let demandNumber: string;
    if (!demCtrRes.rowCount || demCtrRes.rowCount === 0) {
      await client.query(
        `INSERT INTO counters (name, value) VALUES ('demand_number', 1) ON CONFLICT (name) DO UPDATE SET value = counters.value + 1`
      );
      const r2 = await client.query(`SELECT value FROM counters WHERE name = 'demand_number'`);
      demandNumber = 'DEM-' + String(Number(r2.rows[0].value)).padStart(6, '0');
    } else {
      demandNumber = 'DEM-' + String(Number(demCtrRes.rows[0].value)).padStart(6, '0');
    }

    // Compute total estimated amount
    const totalEstimated = dto.items.reduce((sum, item) => {
      return sum + Math.round(Number(item.requested_quantity)) * Math.round(Number(item.estimated_unit_cost));
    }, 0);

    const demandId = uuidv4();
    const status   = dto.status ?? 'DRAFT';

    await client.query(
      `INSERT INTO supplier_demands (
         id, demand_number, supplier_id, customer_id, branch_id,
         status, total_estimated_amount, notes, created_by, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)`,
      [
        demandId, demandNumber,
        dto.supplier_id ?? null,
        dto.customer_id ?? null,
        dto.branch_id.trim(),
        status,
        totalEstimated,
        dto.notes ?? null,
        performedBy ?? null,
        now,
      ]
    );

    // Insert demand items
    for (const item of dto.items) {
      await client.query(
        `INSERT INTO supplier_demand_items (
           id, demand_id, product_id, requested_quantity,
           received_quantity, estimated_unit_cost, created_at, updated_at
         ) VALUES ($1,$2,$3,$4,0,$5,$6,$6)
         ON CONFLICT (demand_id, product_id) DO UPDATE SET
           requested_quantity  = EXCLUDED.requested_quantity,
           estimated_unit_cost = EXCLUDED.estimated_unit_cost,
           updated_at          = EXCLUDED.updated_at`,
        [
          uuidv4(), demandId,
          item.product_id.trim(),
          Math.round(Number(item.requested_quantity)),
          Math.round(Number(item.estimated_unit_cost)),
          now,
        ]
      );
    }

    await client.query('COMMIT');
    return getDemand(pool, demandId);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err instanceof PurchaseRepoError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    throw new PurchaseRepoError(`Failed to save demand: ${msg}`, 500);
  } finally {
    client.release();
  }
}

// ─── listDemands ──────────────────────────────────────────────────────────────

export async function listDemands(
  pool: Pool,
  filters: DemandListFilters = {}
): Promise<Demand[]> {
  const params: unknown[] = [];
  const clauses: string[] = [];

  if (filters.supplier_id) {
    params.push(filters.supplier_id);
    clauses.push(`sd.supplier_id = $${params.length}`);
  }
  if (filters.branch_id) {
    params.push(filters.branch_id);
    clauses.push(`sd.branch_id = $${params.length}`);
  }
  if (filters.status) {
    params.push(filters.status);
    clauses.push(`sd.status = $${params.length}`);
  }

  const where  = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const limit  = Math.min(filters.limit ?? 50, 200);
  const offset = filters.offset ?? 0;

  const result = await pool.query(
    `SELECT sd.*,
            s.name AS supplier_name,
            c.name AS customer_name
     FROM supplier_demands sd
     LEFT JOIN suppliers s ON s.id = sd.supplier_id
     LEFT JOIN customers c ON c.id = sd.customer_id
     ${where}
     ORDER BY sd.created_at DESC
     LIMIT ${limit} OFFSET ${offset}`,
    params
  );

  return result.rows.map(rowToDemand);
}

// ─── getDemand ────────────────────────────────────────────────────────────────

export async function getDemand(pool: Pool, demandId: string): Promise<Demand> {
  const result = await pool.query(
    `SELECT sd.*,
            s.name AS supplier_name,
            c.name AS customer_name
     FROM supplier_demands sd
     LEFT JOIN suppliers s ON s.id = sd.supplier_id
     LEFT JOIN customers c ON c.id = sd.customer_id
     WHERE sd.id = $1`,
    [demandId]
  );
  if (result.rowCount === 0) {
    throw new PurchaseRepoError(`Demand '${demandId}' not found`, 404);
  }
  const demand = rowToDemand(result.rows[0]);

  // Load demand items with product info
  const itemsRes = await pool.query(
    `SELECT sdi.*, p.name AS product_name, p.sku AS product_sku
     FROM supplier_demand_items sdi
     JOIN products p ON p.id = sdi.product_id
     WHERE sdi.demand_id = $1
     ORDER BY sdi.created_at`,
    [demandId]
  );
  demand.items = itemsRes.rows.map((r): DemandItem => ({
    id:                   String(r.id),
    demand_id:            String(r.demand_id),
    product_id:           String(r.product_id),
    product_name:         safeStr(r.product_name) ?? undefined,
    product_sku:          safeStr(r.product_sku) ?? undefined,
    requested_quantity:   bigint(r.requested_quantity),
    received_quantity:    bigint(r.received_quantity),
    estimated_unit_cost:  bigint(r.estimated_unit_cost),
    actual_unit_cost:     r.actual_unit_cost !== null ? bigint(r.actual_unit_cost) : null,
    estimated_line_total: bigint(r.estimated_line_total),
    actual_line_total:    r.actual_line_total !== null ? bigint(r.actual_line_total) : null,
    fulfilled_purchase_id: safeStr(r.fulfilled_purchase_id),
    created_at:           String(r.created_at),
    updated_at:           String(r.updated_at),
  }));

  return demand;
}

// ─── updateDemandStatus ───────────────────────────────────────────────────────

export async function updateDemandStatus(
  pool: Pool,
  demandId: string,
  status: 'ORDERED' | 'CANCELLED',
  performedBy?: string | null
): Promise<Demand> {
  const result = await pool.query(
    `UPDATE supplier_demands
     SET status = $1, updated_at = NOW()
     WHERE id = $2
       AND status NOT IN ('RECEIVED', 'CANCELLED')
     RETURNING id`,
    [status, demandId]
  );
  if (!result.rowCount || result.rowCount === 0) {
    throw new PurchaseRepoError(
      `Demand '${demandId}' not found or cannot be updated (already received or cancelled)`, 404
    );
  }
  return getDemand(pool, demandId);
}

// ─── Row mappers ──────────────────────────────────────────────────────────────

function rowToPurchase(r: Record<string, unknown>): Purchase {
  return {
    id:             String(r['id']),
    purchase_number: String(r['purchase_number']),
    supplier_id:    String(r['supplier_id']),
    supplier_name:  safeStr(r['supplier_name']) ?? undefined,
    branch_id:      String(r['branch_id']),
    subtotal:       bigint(r['subtotal']),
    discount:       bigint(r['discount'] ?? 0),
    total_amount:   bigint(r['total_amount']),
    paid_amount:    bigint(r['paid_amount']),
    credit_amount:  bigint(r['credit_amount']),
    payment_status: (String(r['payment_status']) as 'PAID' | 'PARTIALLY_PAID' | 'UNPAID'),
    status:         (String(r['status']) as 'COMPLETED' | 'CANCELLED'),
    notes:          safeStr(r['notes']),
    performed_by:   safeStr(r['performed_by']),
    created_at:     String(r['created_at']),
    updated_at:     String(r['updated_at']),
    payment_method: safeStr(r['payment_method']),  // Phase 1: null for pre-057 rows
    account_id:     safeStr(r['account_id']),      // Phase 1: null for cash/card/other
  };
}

function rowToDemand(r: Record<string, unknown>): Demand {
  return {
    id:                     String(r['id']),
    demand_number:          String(r['demand_number']),
    supplier_id:            safeStr(r['supplier_id']),
    supplier_name:          safeStr(r['supplier_name']),
    customer_id:            safeStr(r['customer_id']),
    customer_name:          safeStr(r['customer_name']),
    branch_id:              String(r['branch_id']),
    status:                 (String(r['status']) as Demand['status']),
    total_estimated_amount: bigint(r['total_estimated_amount']),
    notes:                  safeStr(r['notes']),
    created_by:             safeStr(r['created_by']),
    created_at:             String(r['created_at']),
    updated_at:             String(r['updated_at']),
  };
}
