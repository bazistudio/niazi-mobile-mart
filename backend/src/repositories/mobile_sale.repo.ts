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

  // Validate item prices
  for (const item of dto.items) {
    if (!item.deviceId || typeof item.deviceId !== 'string') {
      throw new MobileSaleRepoError('Invalid device ID in sale cart.', 400);
    }
    if (typeof item.salePrice !== 'number' || isNaN(item.salePrice) || item.salePrice < 0) {
      throw new MobileSaleRepoError(`Invalid sale price for device ${item.deviceId}. Price cannot be negative.`, 400);
    }
  }

  // Validate duplicate device IDs in same request
  const uniqueDeviceIds = new Set(dto.items.map((i) => i.deviceId));
  if (uniqueDeviceIds.size !== dto.items.length) {
    throw new MobileSaleRepoError('Duplicate mobile device entries found in the cart.', 400);
  }

  const client: PoolClient = await pool.connect();

  try {
    await client.query('BEGIN');

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
      if (typeof p.amount !== 'number' || isNaN(p.amount) || p.amount < 0) {
        throw new MobileSaleRepoError(`Invalid payment amount: ${p.amount}.`, 400);
      }
      if (p.amount > 0) {
        if (p.method === 'CREDIT') {
          // Handled via ledger allocation
          continue;
        }
        totalTendered += p.amount;
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

    if (totalTendered >= totalAmount) {
      recordedPaid = totalAmount;
      changeAmount = totalTendered - totalAmount;
      creditAmount = 0;
      paymentStatus = 'PAID';
    } else {
      recordedPaid = totalTendered;
      changeAmount = 0;
      creditAmount = totalAmount - totalTendered;
      paymentStatus = totalTendered > 0 ? 'PARTIALLY_PAID' : 'UNPAID';
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

    // 6. Handle Customer Ledger Posting if Credit is Used
    let customerBalanceAfter: number | null = null;
    if (creditAmount > 0 && customerOpt) {
      const cid = customerOpt.id;
      const outstandingRow = await client.query(
        'SELECT COALESCE(SUM(debit) - SUM(credit), 0)::BIGINT as bal FROM customer_ledger_entries WHERE customer_id = $1',
        [cid]
      );
      const currentOutstanding = Number(outstandingRow.rows[0]?.bal ?? 0);

      if (customerOpt.credit_limit > 0) {
        if (currentOutstanding + creditAmount > customerOpt.credit_limit) {
          throw new MobileSaleRepoError(
            `Customer credit limit exceeded. Current outstanding: Rs ${currentOutstanding.toLocaleString()}, ` +
            `Sale credit: Rs ${creditAmount.toLocaleString()}, Limit: Rs ${customerOpt.credit_limit.toLocaleString()}`,
            400
          );
        }
      }

      customerBalanceAfter = currentOutstanding + creditAmount;
      const ledgerEntryId = uuidv4();
      await client.query(
        `INSERT INTO customer_ledger_entries (
           id, customer_id, reference_id, reference_number, entry_type,
           debit, credit, balance_after, description, performed_by, created_at
         ) VALUES ($1, $2, $3, $4, 'SALE', $5, 0, $6, $7, $8, $9)`,
        [
          ledgerEntryId,
          cid,
          saleId,
          invoiceNumber,
          creditAmount,
          customerBalanceAfter,
          `Mobile Sale Credit ${invoiceNumber}`,
          uid,
          now,
        ]
      );
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
