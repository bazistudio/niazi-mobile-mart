/**
 * Direct Advance Voucher Service
 *
 * Orchestrates business rules, integer-safe financial validation, payment allocation,
 * idempotency fingerprinting, and transaction boundaries for all voucher operations.
 */

import { Pool } from 'pg';
import { createHash } from 'crypto';
import { RequestIdentity, canAccessBranch, isOrgAdmin } from '../auth';
import {
  calculatePaymentAllocation,
  assertSafeInteger,
  PaymentDomainError,
} from './payment/payment.engine';
import type { CanonicalPaymentMethod, TenderInputLine } from './payment/payment.types';
import {
  VoucherType,
  VoucherStatus,
  VoucherListFilter,
  VoucherPaymentInput,
  CreateVoucherRepoInput,
  CreateVoucherResult,
  VoucherRecord,
  VoucherPaymentRecord,
  VoucherInventoryMatchRecord,
  VoucherRepoError,
  createVoucherTx,
  getVoucherById,
  listVouchers,
  recordVoucherPaymentTx,
  deliverVoucherTx,
  matchVoucherInventoryTx,
  cancelVoucherTx,
} from '../repositories/voucher.repo';

// ─── DTOs ─────────────────────────────────────────────────────────────────────

export interface CreateVoucherRequestDto {
  voucher_type?: VoucherType;
  branch_id?: string | null;
  customer_id?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  product_id?: string | null;
  product_name?: string | null;
  spec_category?: string | null;
  spec_quality?: string | null;
  spec_color?: string | null;
  spec_brand?: string | null;
  spec_company?: string | null;
  new_product?: {
    name: string;
    category_id?: string | null;
    brand_id?: string | null;
    company_id?: string | null;
    color_id?: string | null;
    quality_id?: string | null;
    unit_id?: string | null;
    sku?: string | null;
    barcode?: string | null;
    description?: string | null;
    purchase_price: number;
    catalog_sale_price: number;
    open_stock?: number;
    low_stock_threshold?: number;
  } | null;
  voucher_qty?: number;
  locked_purchase_price: number;
  catalog_sale_price?: number | null;
  voucher_sale_price: number;
  payments?: Array<{
    method: string;
    amount: number;
    reference_number?: string | null;
    notes?: string | null;
  }>;
  notes?: string | null;
  idempotency_key?: string | null;
}

export interface RecordVoucherPaymentDto {
  branch_id?: string | null;
  payments: Array<{
    method: string;
    amount: number;
    reference_number?: string | null;
    notes?: string | null;
  }>;
  idempotency_key?: string | null;
}

export interface DeliverVoucherDto {
  branch_id?: string | null;
  quantity_delivered: number;
  idempotency_key: string;
  notes?: string | null;
}

export interface MatchVoucherInventoryDto {
  branch_id?: string | null;
  product_id: string;
  purchase_id?: string | null;
  purchase_line_id?: string | null;
  stock_movement_in_id?: string | null;
  quantity_matched: number;
  actual_receiving_cost?: number | null;
  reconciliation_notes?: string | null;
}

export interface CancelVoucherDto {
  branch_id?: string | null;
  reason?: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeMethod(raw: string): CanonicalPaymentMethod {
  const m = String(raw || '').trim().toUpperCase();
  if (m === 'CASH') return 'CASH';
  if (m === 'CARD' || m === 'DEBIT_CARD' || m === 'CREDIT_CARD') return 'CARD';
  if (m === 'BANK' || m === 'BANK_TRANSFER' || m === 'BANK TRANSFER') return 'BANK_TRANSFER';
  if (m === 'EASYPAISA') return 'EASYPAISA';
  if (m === 'JAZZCASH') return 'JAZZCASH';
  if (m === 'OTHER') return 'OTHER';
  throw new VoucherRepoError(`Unsupported payment method '${raw}'`, 400);
}

function resolveBranchId(identity: RequestIdentity, requestedBranchId?: string | null): string {
  const cleanRequested = requestedBranchId?.trim() || null;
  if (cleanRequested) {
    if (!canAccessBranch(identity, cleanRequested)) {
      throw new VoucherRepoError('Access denied: you do not have access to the requested branch', 403);
    }
    return cleanRequested;
  }
  if (!identity.branch_id) {
    throw new VoucherRepoError('branch_id is required when caller has no assigned branch', 400);
  }
  return identity.branch_id;
}

function computeFingerprint(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function parseWholeRupee(val: unknown, fieldName: string, allowZero: boolean): number {
  if (typeof val !== 'number' || !Number.isFinite(val)) {
    throw new VoucherRepoError(`${fieldName} must be a valid number`, 400);
  }
  const rounded = Math.round(val);
  if (rounded !== val) {
    throw new VoucherRepoError(`${fieldName} must be a whole integer rupee amount`, 400);
  }
  try {
    assertSafeInteger(rounded, fieldName, allowZero, false);
  } catch (err) {
    if (err instanceof PaymentDomainError) {
      throw new VoucherRepoError(err.message, err.statusCode);
    }
    throw err;
  }
  return rounded;
}

async function withTransaction<T>(
  pool: Pool,
  fn: (client: import('pg').PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore rollback error
    }
    throw err;
  } finally {
    client.release();
  }
}

// ─── Service Operations ───────────────────────────────────────────────────────

export async function createVoucher(
  pool: Pool,
  identity: RequestIdentity,
  dto: CreateVoucherRequestDto
): Promise<CreateVoucherResult> {
  const voucherType: VoucherType = dto.voucher_type ?? 'INSTANT_INVENTORY';
  if (!['INSTANT_INVENTORY', 'DIRECT_ADVANCE', 'PRE_BOOKING'].includes(voucherType)) {
    throw new VoucherRepoError(`Invalid voucher_type '${voucherType}'`, 400);
  }

  const branchId = resolveBranchId(identity, dto.branch_id);
  const voucherQty = parseWholeRupee(dto.voucher_qty ?? 1, 'voucher_qty', false);
  const lockedPurchasePrice = parseWholeRupee(dto.locked_purchase_price, 'locked_purchase_price', true);
  const voucherSalePrice = parseWholeRupee(dto.voucher_sale_price, 'voucher_sale_price', false);

  let catalogSalePrice: number | null = null;
  if (dto.catalog_sale_price !== undefined && dto.catalog_sale_price !== null) {
    catalogSalePrice = parseWholeRupee(dto.catalog_sale_price, 'catalog_sale_price', true);
  }

  const productName = (dto.new_product?.name ?? dto.product_name ?? '').trim();
  if (!productName) {
    throw new VoucherRepoError('product_name is required', 400);
  }

  const customerId = dto.customer_id?.trim() || null;
  if (voucherType === 'PRE_BOOKING' && !customerId) {
    throw new VoucherRepoError('PRE_BOOKING vouchers require a registered customer_id', 400);
  }

  // Validate new_product for INSTANT_INVENTORY
  let newProductPayload: CreateVoucherRepoInput['new_product'] = null;
  if (dto.new_product) {
    if (voucherType !== 'INSTANT_INVENTORY') {
      throw new VoucherRepoError('new_product registration is only permitted for INSTANT_INVENTORY vouchers', 400);
    }
    const npPurchase = parseWholeRupee(dto.new_product.purchase_price, 'new_product.purchase_price', true);
    const npCatalogSale = parseWholeRupee(dto.new_product.catalog_sale_price, 'new_product.catalog_sale_price', false);
    const npOpenStock = parseWholeRupee(dto.new_product.open_stock ?? 1, 'new_product.open_stock', true);
    if (npCatalogSale < npPurchase) {
      throw new VoucherRepoError('new_product.catalog_sale_price cannot be less than purchase_price', 400);
    }
    newProductPayload = {
      ...dto.new_product,
      name: dto.new_product.name.trim(),
      purchase_price: npPurchase,
      catalog_sale_price: npCatalogSale,
      open_stock: npOpenStock,
    };
    if (catalogSalePrice === null) {
      catalogSalePrice = npCatalogSale;
    }
  }

  // VCH-04: Require non-empty idempotency_key on voucher creation
  const idempotencyKey = dto.idempotency_key?.trim() || null;
  if (!idempotencyKey) {
    throw new VoucherRepoError('idempotency_key is required for voucher creation', 400);
  }
  const fingerprint = computeFingerprint({ ...dto, idempotency_key: undefined });

  const totalSaleAmount = voucherQty * voucherSalePrice;
  const rawPayments = dto.payments ?? [];

  // Normalize tender lines
  const tenderLines: TenderInputLine[] = rawPayments.map((p, idx) => ({
    method: normalizeMethod(p.method),
    amount: parseWholeRupee(p.amount, `payments[${idx}].amount`, false),
    referenceNumber: p.reference_number ?? null,
    notes: p.notes ?? null,
  }));

  const voucherPayments: VoucherPaymentInput[] = tenderLines.map((t) => ({
    method: t.method,
    amount: t.amount,
    reference_number: t.referenceNumber,
    notes: t.notes,
  }));

  return withTransaction(pool, async (client) => {
    // Resolve customer snapshot
    let customerNameSnapshot = (dto.customer_name || 'Walk-In Customer').trim();
    let customerPhoneSnapshot = dto.customer_phone?.trim() || null;
    let previousBalance = 0;
    let customerCreditLimit = 0;

    if (customerId) {
      const custRes = await client.query<{
        name: string;
        phone: string | null;
        credit_limit: string;
      }>('SELECT name, phone, credit_limit FROM customers WHERE id = $1', [customerId]);
      if (custRes.rows.length === 0) {
        throw new VoucherRepoError(`Customer '${customerId}' not found`, 404);
      }
      customerNameSnapshot = custRes.rows[0]!.name;
      customerPhoneSnapshot = custRes.rows[0]!.phone;
      customerCreditLimit = Number(custRes.rows[0]!.credit_limit ?? 0);

      const balRes = await client.query<{ balance: string }>(
        `SELECT COALESCE(SUM(debit) - SUM(credit), 0)::BIGINT AS balance
         FROM customer_ledger_entries WHERE customer_id = $1`,
        [customerId]
      );
      previousBalance = Number(balRes.rows[0]?.balance ?? 0);
    }

    // Lifecycle & accounting policy by voucher_type
    let deliveredQty = 0;
    let paymentMethodSummary = 'NONE';
    let paymentStatusSummary = 'REGISTRATION_ONLY';
    let paidAmount = 0;
    let postSaleDebit = false;
    let saleDebitAmount = 0;
    let postPaymentCredit = false;
    let paymentCreditAmount = 0;

    if (voucherType === 'INSTANT_INVENTORY') {
      // Registration-only: POS completeSale handles the financial invoice, payment, and stock deduction.
      if (tenderLines.length > 0) {
        throw new VoucherRepoError(
          'INSTANT_INVENTORY vouchers are registration-only and must not carry initial payment tenders.',
          400
        );
      }
      deliveredQty = 0;
      paymentMethodSummary = 'NONE';
      paymentStatusSummary = 'REGISTRATION_ONLY';
      paidAmount = 0;
    } else if (voucherType === 'DIRECT_ADVANCE') {
      deliveredQty = voucherQty;

      try {
        const allocation = calculatePaymentAllocation({
          invoiceTotal: totalSaleAmount,
          tenders: tenderLines,
          customerId,
          previousCustomerBalance: previousBalance,
          customerCreditLimit,
        });

        // VCH-02: For DIRECT_ADVANCE:
        // paidAmount represents total payment credited against this voucher invoice,
        // which includes existingAdvanceApplied and tenderAppliedToInvoice (capped at totalSaleAmount).
        // Any tender applied to previousBalanceSettled settles prior debt and does NOT inflate voucher paid_amount.
        const voucherAllocatedPaid = allocation.existingAdvanceApplied + allocation.tenderAppliedToInvoice;
        paidAmount = Math.min(totalSaleAmount, voucherAllocatedPaid);

        if (tenderLines.length > 1) {
          paymentMethodSummary = 'SPLIT';
        } else if (tenderLines.length === 1) {
          paymentMethodSummary = tenderLines[0]!.method;
        } else {
          paymentMethodSummary = 'CREDIT';
        }

        if (allocation.creditAllocated === 0) {
          paymentStatusSummary = 'PAID';
        } else if (paidAmount > 0) {
          paymentStatusSummary = 'PARTIALLY_PAID';
        } else {
          paymentStatusSummary = 'ON_ACCOUNT';
        }

        postSaleDebit = Boolean(customerId);
        saleDebitAmount = totalSaleAmount;
        // The customer ledger payment credit for incoming tender (actual received minus change)
        const totalTenderReceived = allocation.actualTenderReceived - allocation.changeReturned;
        postPaymentCredit = Boolean(customerId && totalTenderReceived > 0);
        paymentCreditAmount = totalTenderReceived;
      } catch (err) {
        if (err instanceof PaymentDomainError) {
          throw new VoucherRepoError(err.message, err.statusCode);
        }
        throw err;
      }
    } else if (voucherType === 'PRE_BOOKING') {
      // Zero delivery initially; advance payments create customer credit until handover
      deliveredQty = 0;
      const totalTender = tenderLines.reduce((s, t) => s + t.amount, 0);
      if (totalTender > totalSaleAmount) {
        throw new VoucherRepoError(
          `Pre-booking advance (Rs ${totalTender.toLocaleString()}) cannot exceed total voucher price (Rs ${totalSaleAmount.toLocaleString()}).`,
          400
        );
      }
      paidAmount = totalTender;
      if (tenderLines.length > 1) {
        paymentMethodSummary = 'SPLIT';
      } else if (tenderLines.length === 1) {
        paymentMethodSummary = tenderLines[0]!.method;
      } else {
        paymentMethodSummary = 'CREDIT';
      }

      if (paidAmount >= totalSaleAmount) {
        paymentStatusSummary = 'PAID';
      } else if (paidAmount > 0) {
        paymentStatusSummary = 'PARTIALLY_PAID';
      } else {
        paymentStatusSummary = 'UNPAID';
      }

      postSaleDebit = false; // Deferred until deliverVoucher
      saleDebitAmount = 0;
      postPaymentCredit = paidAmount > 0;
      paymentCreditAmount = paidAmount;
    }

    const repoInput: CreateVoucherRepoInput = {
      voucher_type: voucherType,
      organization_id: identity.organization_id,
      branch_id: branchId,
      performed_by: identity.user_id,
      customer_id: customerId,
      customer_name_snapshot: customerNameSnapshot,
      customer_phone_snapshot: customerPhoneSnapshot,
      product_id: dto.product_id?.trim() || null,
      product_name: productName,
      spec_category: dto.spec_category?.trim() || null,
      spec_quality: dto.spec_quality?.trim() || null,
      spec_color: dto.spec_color?.trim() || null,
      spec_brand: dto.spec_brand?.trim() || null,
      spec_company: dto.spec_company?.trim() || null,
      new_product: newProductPayload,
      voucher_qty: voucherQty,
      delivered_qty: deliveredQty,
      locked_purchase_price: lockedPurchasePrice,
      catalog_sale_price: catalogSalePrice,
      voucher_sale_price: voucherSalePrice,
      payment_method: paymentMethodSummary,
      payment_status: paymentStatusSummary,
      paid_amount: paidAmount,
      payments: voucherPayments,
      post_sale_debit: postSaleDebit,
      sale_debit_amount: saleDebitAmount,
      post_payment_credit: postPaymentCredit,
      payment_credit_amount: paymentCreditAmount,
      notes: dto.notes?.trim() || null,
      idempotency_key: idempotencyKey,
      request_fingerprint: fingerprint,
    };

    return createVoucherTx(pool, client, repoInput);
  });
}

export async function getVoucherDetail(
  pool: Pool,
  identity: RequestIdentity,
  voucherId: string
): Promise<{
  voucher: VoucherRecord;
  payments: VoucherPaymentRecord[];
  matches: VoucherInventoryMatchRecord[];
}> {
  const detail = await getVoucherById(pool, voucherId, identity.organization_id);
  if (!detail) {
    throw new VoucherRepoError(`Voucher '${voucherId}' not found`, 404);
  }
  if (!canAccessBranch(identity, detail.voucher.branch_id)) {
    throw new VoucherRepoError('Access denied: voucher belongs to another branch', 403);
  }
  return detail;
}

export async function listVouchersForIdentity(
  pool: Pool,
  identity: RequestIdentity,
  query: {
    branch_id?: string | null;
    voucher_type?: VoucherType | null;
    status?: VoucherStatus | null;
    customer_id?: string | null;
    search?: string | null;
    limit?: number;
    offset?: number;
  }
): Promise<VoucherRecord[]> {
  let effectiveBranchId: string | null = null;
  if (isOrgAdmin(identity)) {
    effectiveBranchId = query.branch_id?.trim() || null;
  } else {
    if (!identity.branch_id) {
      throw new VoucherRepoError('Access denied: no branch assigned', 403);
    }
    if (query.branch_id && query.branch_id.trim() !== identity.branch_id) {
      throw new VoucherRepoError('Access denied: cannot list vouchers from another branch', 403);
    }
    effectiveBranchId = identity.branch_id;
  }

  const filter: VoucherListFilter = {
    organization_id: identity.organization_id,
    branch_id: effectiveBranchId,
    voucher_type: query.voucher_type ?? null,
    status: query.status ?? null,
    customer_id: query.customer_id?.trim() || null,
    search: query.search?.trim() || null,
    limit: query.limit,
    offset: query.offset,
  };
  return listVouchers(pool, filter);
}

export async function addVoucherPayment(
  pool: Pool,
  identity: RequestIdentity,
  voucherId: string,
  dto: RecordVoucherPaymentDto
) {
  const branchId = resolveBranchId(identity, dto.branch_id);
  if (!Array.isArray(dto.payments) || dto.payments.length === 0) {
    throw new VoucherRepoError('At least one payment tender line is required', 400);
  }
  const normalizedPayments: VoucherPaymentInput[] = dto.payments.map((p, idx) => ({
    method: normalizeMethod(p.method),
    amount: parseWholeRupee(p.amount, `payments[${idx}].amount`, false),
    reference_number: p.reference_number ?? null,
    notes: p.notes ?? null,
  }));

  return withTransaction(pool, (client) =>
    recordVoucherPaymentTx(client, {
      voucher_id: voucherId,
      organization_id: identity.organization_id,
      branch_id: branchId,
      performed_by: identity.user_id,
      payments: normalizedPayments,
      idempotency_key: dto.idempotency_key?.trim() || null,
    })
  );
}

export async function deliverVoucher(
  pool: Pool,
  identity: RequestIdentity,
  voucherId: string,
  dto: DeliverVoucherDto
) {
  const branchId = resolveBranchId(identity, dto.branch_id);
  const qty = parseWholeRupee(dto.quantity_delivered, 'quantity_delivered', false);
  const idempotencyKey = dto.idempotency_key?.trim() || null;
  if (!idempotencyKey) {
    throw new VoucherRepoError('idempotency_key is required for voucher delivery', 400);
  }

  const fingerprint = computeFingerprint({
    voucher_id: voucherId,
    quantity_delivered: qty,
    notes: dto.notes ?? null,
  });

  return withTransaction(pool, (client) =>
    deliverVoucherTx(client, {
      voucher_id: voucherId,
      organization_id: identity.organization_id,
      branch_id: branchId,
      quantity_delivered: qty,
      performed_by: identity.user_id,
      idempotency_key: idempotencyKey,
      request_fingerprint: fingerprint,
      notes: dto.notes ?? null,
    })
  );
}

export async function matchVoucherInventory(
  pool: Pool,
  identity: RequestIdentity,
  voucherId: string,
  dto: MatchVoucherInventoryDto
) {
  const branchId = resolveBranchId(identity, dto.branch_id);
  if (!dto.product_id || dto.product_id.trim().length < 32) {
    throw new VoucherRepoError('Valid product_id is required for inventory matching', 400);
  }
  const qty = parseWholeRupee(dto.quantity_matched, 'quantity_matched', false);
  const actualCost =
    dto.actual_receiving_cost !== undefined && dto.actual_receiving_cost !== null
      ? parseWholeRupee(dto.actual_receiving_cost, 'actual_receiving_cost', true)
      : null;

  return withTransaction(pool, (client) =>
    matchVoucherInventoryTx(client, {
      voucher_id: voucherId,
      organization_id: identity.organization_id,
      branch_id: branchId,
      product_id: dto.product_id.trim(),
      purchase_id: dto.purchase_id?.trim() || null,
      purchase_line_id: dto.purchase_line_id?.trim() || null,
      stock_movement_in_id: dto.stock_movement_in_id?.trim() || null,
      quantity_matched: qty,
      actual_receiving_cost: actualCost,
      reconciliation_notes: dto.reconciliation_notes?.trim() || null,
      matched_by: identity.user_id,
    })
  );
}

export async function cancelVoucher(
  pool: Pool,
  identity: RequestIdentity,
  voucherId: string,
  dto: CancelVoucherDto
): Promise<VoucherRecord> {
  const branchId = resolveBranchId(identity, dto.branch_id);
  return withTransaction(pool, (client) =>
    cancelVoucherTx(client, {
      voucher_id: voucherId,
      organization_id: identity.organization_id,
      branch_id: branchId,
      reason: dto.reason ?? null,
    })
  );
}
