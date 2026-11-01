/**
 * NIAZI MOBILE MART — SHARED PAYMENT DOMAIN ENGINE
 * Module: payment.engine.ts
 *
 * Pure mathematical payment allocation, checked integer arithmetic,
 * credit limit enforcement, customer advance management, walk-in constraints,
 * and source-attributed multi-component refund allocation.
 *
 * Zero external dependencies:
 * - Independent of Express, React, PostgreSQL, Tauri, Browser APIs, Network services.
 * - Does NOT perform database I/O or state mutations.
 */

import {
  CanonicalPaymentMethod,
  CANONICAL_PAYMENT_METHODS,
  PaymentAllocationRequest,
  PaymentAllocationResult,
  RefundAllocationRequest,
  RefundAllocationResult,
  TenderLineRefundAllocation,
} from './payment.types';

export class PaymentDomainError extends Error {
  public readonly code: string;
  public readonly statusCode: number;

  constructor(message: string, code: string = 'INVALID_PAYMENT', statusCode: number = 400) {
    super(message);
    this.name = 'PaymentDomainError';
    this.code = code;
    this.statusCode = statusCode;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Checked Integer Arithmetic & Boundary Verification
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate that a number is a safe integer within JavaScript's safe integer boundary.
 * Prevents precision loss and documents PostgreSQL BIGINT boundary limitations.
 */
export function assertSafeInteger(value: unknown, fieldName: string, allowZero: boolean = false, allowNegative: boolean = false): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isSafeInteger(value)) {
    throw new PaymentDomainError(
      `${fieldName} must be a safe, finite integer. Received: ${String(value)}`,
      'UNSAFE_INTEGER'
    );
  }
  if (!allowNegative) {
    if (!allowZero && value <= 0) {
      throw new PaymentDomainError(
        `${fieldName} must be strictly greater than zero. Received: ${value}`,
        'NON_POSITIVE_AMOUNT'
      );
    }
    if (allowZero && value < 0) {
      throw new PaymentDomainError(
        `${fieldName} cannot be negative. Received: ${value}`,
        'NEGATIVE_AMOUNT'
      );
    }
  }
}

/**
 * Checked addition that rejects values exceeding Number.MAX_SAFE_INTEGER or falling below MIN_SAFE_INTEGER.
 */
export function safeAdd(a: number, b: number, context: string = 'Addition', allowNegative: boolean = false): number {
  assertSafeInteger(a, `${context} operand A`, true, allowNegative);
  assertSafeInteger(b, `${context} operand B`, true, allowNegative);
  const result = a + b;
  if (!Number.isSafeInteger(result)) {
    throw new PaymentDomainError(
      `${context} exceeded safe integer bounds (${Number.MAX_SAFE_INTEGER}).`,
      'INTEGER_OVERFLOW'
    );
  }
  return result;
}

/**
 * Checked subtraction that guarantees safe integer bounds.
 */
export function safeSub(a: number, b: number, context: string = 'Subtraction', allowNegative: boolean = false): number {
  assertSafeInteger(a, `${context} operand A`, true, allowNegative);
  assertSafeInteger(b, `${context} operand B`, true, allowNegative);
  const result = a - b;
  if (!Number.isSafeInteger(result)) {
    throw new PaymentDomainError(
      `${context} exceeded safe integer bounds (${Number.MIN_SAFE_INTEGER}).`,
      'INTEGER_UNDERFLOW'
    );
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation & Core Calculations
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate request boundaries and sanity checks.
 */
export function validatePaymentRequest(request: PaymentAllocationRequest): void {
  if (!request) {
    throw new PaymentDomainError('Payment allocation request cannot be null or undefined.', 'EMPTY_REQUEST');
  }

  // 1. Invoice Total Validation
  assertSafeInteger(request.invoiceTotal, 'Invoice total', false);

  // 2. Previous Balance Validation
  if (
    typeof request.previousCustomerBalance !== 'number' ||
    !Number.isFinite(request.previousCustomerBalance) ||
    !Number.isSafeInteger(request.previousCustomerBalance)
  ) {
    throw new PaymentDomainError(
      'Previous customer balance must be a safe, finite integer.',
      'INVALID_PREVIOUS_BALANCE'
    );
  }

  const isWalkIn = !request.customerId || request.customerId.trim() === '' || request.customerId === 'walk-in';

  // 3. Walk-in Invariants
  if (isWalkIn) {
    if (request.previousCustomerBalance !== 0) {
      throw new PaymentDomainError(
        'Walk-in customers cannot have an existing customer balance or advance.',
        'WALK_IN_BALANCE_FORBIDDEN'
      );
    }
  }

  // 4. Credit Limit Validation
  if (request.customerCreditLimit !== undefined && request.customerCreditLimit !== null) {
    assertSafeInteger(request.customerCreditLimit, 'Customer credit limit', true);
  }

  // 5. Tenders Collection Validation
  if (!request.tenders || !Array.isArray(request.tenders)) {
    throw new PaymentDomainError('Tenders must be provided as an array.', 'INVALID_TENDERS');
  }

  const seenNonCashKeys = new Set<string>();

  for (let i = 0; i < request.tenders.length; i++) {
    const t = request.tenders[i];
    if (!t) {
      throw new PaymentDomainError(`Tender line at index ${i} is null or undefined.`, 'INVALID_TENDER_LINE');
    }

    // Method Validation
    if (!CANONICAL_PAYMENT_METHODS.includes(t.method)) {
      throw new PaymentDomainError(
        `Unsupported payment method '${t.method}' at line ${i + 1}.`,
        'UNSUPPORTED_METHOD'
      );
    }

    // Tender Amount Validation
    assertSafeInteger(t.amount, `Tender amount for ${t.method} (line ${i + 1})`, false);

    // Duplicate detection: identical non-cash method with same non-empty reference
    if (t.method !== 'CASH' && t.referenceNumber && t.referenceNumber.trim() !== '') {
      const key = `${t.method}::${t.referenceNumber.trim().toUpperCase()}`;
      if (seenNonCashKeys.has(key)) {
        throw new PaymentDomainError(
          `Duplicate non-cash tender detected for ${t.method} with reference '${t.referenceNumber}'.`,
          'DUPLICATE_TENDER_LINE'
        );
      }
      seenNonCashKeys.add(key);
    }
  }
}

/**
 * Pure calculation of projected customer balance after transaction.
 */
export function calculateProjectedCustomerBalance(
  previousCustomerBalance: number,
  invoiceTotal: number,
  actualTenderReceived: number
): {
  projectedCustomerBalance: number;
  projectedOutstanding: number;
  remainingAdvanceBalance: number;
} {
  // Balance formula: B1 = B0 + I - T
  const step1 = safeAdd(previousCustomerBalance, invoiceTotal, 'Customer balance after invoice', true);
  const projectedCustomerBalance = safeSub(step1, actualTenderReceived, 'Customer balance after tender', true);
  const projectedOutstanding = Math.max(0, projectedCustomerBalance);
  const remainingAdvanceBalance = Math.max(0, -projectedCustomerBalance);

  return {
    projectedCustomerBalance,
    projectedOutstanding,
    remainingAdvanceBalance,
  };
}

/**
 * Pure deterministic payment allocation engine.
 *
 * Enforces all approved frozen business policies:
 * - Registered: Auto-apply advance -> Apply tender -> Settle previous debt -> Create new advance.
 * - Walk-in: Non-cash applied first, capped at invoice -> Cash applied second -> Excess cash is change -> 0 digital excess.
 * - Credit Limit: credit_limit === 0 allows NO credit; credit_limit > 0 enforces projectedOutstanding <= credit_limit.
 */
export function calculatePaymentAllocation(request: PaymentAllocationRequest): PaymentAllocationResult {
  validatePaymentRequest(request);

  const {
    invoiceTotal,
    tenders,
    customerId,
    previousCustomerBalance,
    customerCreditLimit = 0,
  } = request;

  const isRegisteredCustomer = Boolean(customerId && customerId.trim() !== '' && customerId !== 'walk-in');
  const effectiveCreditLimit = customerCreditLimit ?? 0;

  // 1. Checked Sum of Cash and Non-Cash Tenders
  let cashTenderReceived = 0;
  let nonCashTenderReceived = 0;

  for (const t of tenders) {
    if (t.method === 'CASH') {
      cashTenderReceived = safeAdd(cashTenderReceived, t.amount, 'Cash tender sum');
    } else {
      nonCashTenderReceived = safeAdd(nonCashTenderReceived, t.amount, 'Non-cash tender sum');
    }
  }

  const actualTenderReceived = safeAdd(cashTenderReceived, nonCashTenderReceived, 'Total actual tender');

  // 2. Existing Customer Advance Application (Registered only)
  const existingAdvanceAvailable = isRegisteredCustomer ? Math.max(0, -previousCustomerBalance) : 0;
  const existingAdvanceApplied = Math.min(existingAdvanceAvailable, invoiceTotal);
  const remainingInvoiceAfterAdvance = safeSub(invoiceTotal, existingAdvanceApplied, 'Remaining invoice after advance');

  // 3. Walk-In Specific Invariants & Deterministic Allocation
  if (!isRegisteredCustomer) {
    if (nonCashTenderReceived > remainingInvoiceAfterAdvance) {
      throw new PaymentDomainError(
        `Walk-in digital tender (Rs ${nonCashTenderReceived.toLocaleString()}) cannot exceed the invoice amount (Rs ${remainingInvoiceAfterAdvance.toLocaleString()}). Digital overpayment cannot be converted to cash change.`,
        'DIGITAL_OVERPAYMENT_PROHIBITED'
      );
    }

    const nonCashAppliedToInvoice = nonCashTenderReceived;
    const remainingInvoiceAfterNonCash = safeSub(remainingInvoiceAfterAdvance, nonCashAppliedToInvoice, 'Remaining invoice after digital');

    const cashAppliedToInvoice = Math.min(cashTenderReceived, remainingInvoiceAfterNonCash);
    const tenderAppliedToInvoice = safeAdd(nonCashAppliedToInvoice, cashAppliedToInvoice, 'Tender applied to invoice');
    const invoiceAllocated = safeAdd(existingAdvanceApplied, tenderAppliedToInvoice, 'Invoice allocated');
    const creditAllocated = safeSub(invoiceTotal, invoiceAllocated, 'Credit allocated');

    // Walk-ins must pay in full
    if (creditAllocated > 0) {
      throw new PaymentDomainError(
        `Walk-in customers cannot make purchases on credit. Unpaid balance: Rs ${creditAllocated.toLocaleString()}.`,
        'WALK_IN_CREDIT_PROHIBITED'
      );
    }

    // Cash excess becomes physical change returned
    const changeReturned = safeSub(cashTenderReceived, cashAppliedToInvoice, 'Change returned');
    const cashToDrawer = safeSub(cashTenderReceived, changeReturned, 'Cash to drawer');

    const projected = calculateProjectedCustomerBalance(0, invoiceTotal, actualTenderReceived - changeReturned);

    const persistedTenders = tenders.map((t) => ({
      method: t.method,
      amount: t.amount,
      referenceNumber: t.referenceNumber ?? null,
      notes: t.notes ?? null,
    }));

    return {
      invoiceTotal,
      existingAdvanceApplied,
      cashTenderReceived,
      nonCashTenderReceived,
      actualTenderReceived,
      tenderAppliedToInvoice,
      invoiceAllocated,
      previousBalanceSettled: 0,
      customerAdvanceCreated: 0,
      changeReturned,
      creditAllocated: 0,
      projectedCustomerBalance: 0,
      projectedOutstanding: 0,
      remainingAdvanceBalance: 0,
      paymentStatus: 'PAID',
      cashToDrawer,
      persistedTenders,
    };
  }

  // 4. Registered Customer Allocation
  const tenderAppliedToInvoice = Math.min(actualTenderReceived, remainingInvoiceAfterAdvance);
  const invoiceAllocated = safeAdd(existingAdvanceApplied, tenderAppliedToInvoice, 'Invoice allocated');
  const creditAllocated = safeSub(invoiceTotal, invoiceAllocated, 'Credit allocated'); // Remaining unpaid invoice due

  // Excess tender applied to previous customer debit
  const remainingTender = safeSub(actualTenderReceived, tenderAppliedToInvoice, 'Remaining tender after invoice');
  const previousDebit = Math.max(0, previousCustomerBalance);
  const previousBalanceSettled = Math.min(remainingTender, previousDebit);

  // Remaining excess becomes customer advance
  const customerAdvanceCreated = safeSub(remainingTender, previousBalanceSettled, 'Customer advance created');

  // Registered customers: 0 change by default
  const changeReturned = 0;
  const cashToDrawer = cashTenderReceived;

  // 5. Projected Customer Balances & Credit Limit Verification
  const projected = calculateProjectedCustomerBalance(previousCustomerBalance, invoiceTotal, actualTenderReceived);

  // Credit Limit Enforcement:
  // Rule 1: credit_limit = 0 means NO credit allowed
  if (effectiveCreditLimit === 0 && projected.projectedOutstanding > 0) {
    throw new PaymentDomainError(
      `Credit purchase not allowed for customer. Credit limit is 0, but projected debt is Rs ${projected.projectedOutstanding.toLocaleString()}.`,
      'CREDIT_LIMIT_ZERO_EXCEEDED'
    );
  }

  // Rule 2: credit_limit > 0 enforces projectedOutstanding <= credit_limit
  if (effectiveCreditLimit > 0 && projected.projectedOutstanding > effectiveCreditLimit) {
    throw new PaymentDomainError(
      `Credit limit exceeded. Projected outstanding debt Rs ${projected.projectedOutstanding.toLocaleString()} exceeds credit limit Rs ${effectiveCreditLimit.toLocaleString()}.`,
      'CREDIT_LIMIT_EXCEEDED'
    );
  }

  // 6. Payment Status
  const paymentStatus =
    invoiceAllocated >= invoiceTotal ? 'PAID' :
    invoiceAllocated > 0 ? 'PARTIALLY_PAID' : 'UNPAID';

  const persistedTenders = tenders.map((t) => ({
    method: t.method,
    amount: t.amount,
    referenceNumber: t.referenceNumber ?? null,
    notes: t.notes ?? null,
  }));

  return {
    invoiceTotal,
    existingAdvanceApplied,
    cashTenderReceived,
    nonCashTenderReceived,
    actualTenderReceived,
    tenderAppliedToInvoice,
    invoiceAllocated,
    previousBalanceSettled,
    customerAdvanceCreated,
    changeReturned,
    creditAllocated,
    projectedCustomerBalance: projected.projectedCustomerBalance,
    projectedOutstanding: projected.projectedOutstanding,
    remainingAdvanceBalance: projected.remainingAdvanceBalance,
    paymentStatus,
    cashToDrawer,
    persistedTenders,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Source-Attributed Multi-Component Refund Allocation Engine (FIFO)
// ─────────────────────────────────────────────────────────────────────────────

interface InternalLineState {
  lineId: string;
  method: CanonicalPaymentMethod;
  originalAmount: number;
  priorDirectRefunded: number;
  priorCreditFunded: number;
  currentDirectRefunded: number;
  currentCreditFunded: number;
}

/**
 * Pure calculation of source-attributed multi-component refund allocations.
 *
 * Implements strict FIFO attribution of customer credit across original tender lines.
 * Strictly guarantees funding-source conservation:
 * directRefunded + customerCreditFunded <= originalTenderAmount per tender line.
 */
export function calculateRefundAllocation(request: RefundAllocationRequest): RefundAllocationResult {
  if (!request) {
    throw new PaymentDomainError('Refund request cannot be null or undefined.', 'EMPTY_REFUND_REQUEST');
  }

  assertSafeInteger(request.refundAmount, 'Refund amount', false);
  assertSafeInteger(request.originalInvoiceTotal, 'Original invoice total', false);
  assertSafeInteger(request.originalAdvanceApplied, 'Original advance applied', true, true);
  assertSafeInteger(request.originalCreditAllocated, 'Original credit allocated', true, true);

  if (!request.originalTenders || !Array.isArray(request.originalTenders)) {
    throw new PaymentDomainError('Original tenders must be provided as an array.', 'INVALID_ORIGINAL_TENDERS');
  }

  const {
    refundAmount,
    originalInvoiceTotal,
    originalAdvanceApplied,
    originalCreditAllocated,
    originalTenders,
    priorRefunds = {},
    requestedPayout = {},
  } = request;

  // 1. Process and Index Original Tender Lines (Preserving exact receipt order)
  const lineStates: InternalLineState[] = [];
  const lineIdSet = new Set<string>();

  for (let i = 0; i < originalTenders.length; i++) {
    const t = originalTenders[i];
    if (!t) {
      throw new PaymentDomainError(`Original tender at index ${i} is invalid.`, 'INVALID_ORIGINAL_TENDER_LINE');
    }
    if (!CANONICAL_PAYMENT_METHODS.includes(t.method)) {
      throw new PaymentDomainError(`Invalid original payment method "${t.method}".`, 'INVALID_PAYMENT_METHOD');
    }
    assertSafeInteger(t.amount, `Original tender line ${i} amount`, false);

    const lineId = (t.id && t.id.trim().length > 0) ? t.id.trim() : `line_${i}`;
    if (lineIdSet.has(lineId)) {
      throw new PaymentDomainError(`Duplicate tender line ID detected: "${lineId}". Tender line IDs must be unique.`, 'DUPLICATE_TENDER_LINE_ID');
    }
    lineIdSet.add(lineId);

    lineStates.push({
      lineId,
      method: t.method,
      originalAmount: t.amount,
      priorDirectRefunded: 0,
      priorCreditFunded: 0,
      currentDirectRefunded: 0,
      currentCreditFunded: 0,
    });
  }

  // 2. Validate and Bind Prior Refunds (With Source Attribution Support)
  const priorCreditCancelled = priorRefunds.unpaidCreditCancelled ?? 0;
  const priorAdvanceRestored = priorRefunds.advanceRestored ?? 0;
  assertSafeInteger(priorCreditCancelled, 'Prior credit cancelled', true);
  assertSafeInteger(priorAdvanceRestored, 'Prior advance restored', true);

  if (priorCreditCancelled > originalCreditAllocated) {
    throw new PaymentDomainError(
      `Prior unpaid credit cancelled (Rs ${priorCreditCancelled.toLocaleString()}) exceeds original credit allocated (Rs ${originalCreditAllocated.toLocaleString()}).`,
      'PRIOR_CREDIT_CANCEL_EXCEEDS_ORIGINAL'
    );
  }

  if (priorAdvanceRestored > originalAdvanceApplied) {
    throw new PaymentDomainError(
      `Prior advance restored (Rs ${priorAdvanceRestored.toLocaleString()}) exceeds original advance applied (Rs ${originalAdvanceApplied.toLocaleString()}).`,
      'PRIOR_ADVANCE_RESTORE_EXCEEDS_ORIGINAL'
    );
  }

  // Validate prior line allocations if provided
  const priorDirectByLine = priorRefunds.directRefundByLine ?? {};
  const priorCreditByLine = priorRefunds.customerCreditByLine ?? {};

  // Check for unknown line IDs in prior records
  for (const id of Object.keys(priorDirectByLine)) {
    if (!lineIdSet.has(id)) {
      throw new PaymentDomainError(`Unknown tender line ID in prior direct refunds: "${id}".`, 'UNKNOWN_TENDER_LINE_ID');
    }
  }
  for (const id of Object.keys(priorCreditByLine)) {
    if (!lineIdSet.has(id)) {
      throw new PaymentDomainError(`Unknown tender line ID in prior customer credit: "${id}".`, 'UNKNOWN_TENDER_LINE_ID');
    }
  }

  const hasDetailedPriorLines = Object.keys(priorDirectByLine).length > 0 || Object.keys(priorCreditByLine).length > 0;

  if (hasDetailedPriorLines) {
    // Populate directly from detailed line maps
    for (const state of lineStates) {
      const priorDirect = priorDirectByLine[state.lineId] ?? 0;
      const priorCredit = priorCreditByLine[state.lineId] ?? 0;
      assertSafeInteger(priorDirect, `Prior direct refund for line ${state.lineId}`, true);
      assertSafeInteger(priorCredit, `Prior credit funded for line ${state.lineId}`, true);

      const totalPriorOnLine = safeAdd(priorDirect, priorCredit, `Total prior on line ${state.lineId}`);
      if (totalPriorOnLine > state.originalAmount) {
        throw new PaymentDomainError(
          `Prior refunds on line ${state.lineId} (Rs ${totalPriorOnLine.toLocaleString()}) exceed original amount (Rs ${state.originalAmount.toLocaleString()}).`,
          'PRIOR_LINE_REFUND_EXCEEDS_ORIGINAL'
        );
      }

      state.priorDirectRefunded = priorDirect;
      state.priorCreditFunded = priorCredit;
    }
  } else {
    // Backward Compatibility: Populate from legacy aggregate prior fields using deterministic FIFO order
    const priorCash = priorRefunds.cashRefunded ?? 0;
    const priorDigital = priorRefunds.digitalRefundedByMethod ?? {};
    const priorCreditTotal = priorRefunds.customerCreditIssued ?? 0;

    assertSafeInteger(priorCash, 'Prior cash refunded', true);
    assertSafeInteger(priorCreditTotal, 'Prior customer credit aggregate', true);

    // Attribute prior direct cash payouts
    let unallocatedPriorCash = priorCash;
    for (const state of lineStates) {
      if (state.method === 'CASH' && unallocatedPriorCash > 0) {
        const canTake = safeSub(state.originalAmount, state.priorDirectRefunded, 'Remaining line capacity');
        const take = Math.min(unallocatedPriorCash, canTake);
        state.priorDirectRefunded = safeAdd(state.priorDirectRefunded, take, 'Line prior direct cash');
        unallocatedPriorCash = safeSub(unallocatedPriorCash, take, 'Unallocated prior cash');
      }
    }
    if (unallocatedPriorCash > 0) {
      throw new PaymentDomainError(
        `Prior cash refunded (Rs ${priorCash.toLocaleString()}) exceeds total original cash tenders.`,
        'PRIOR_CASH_EXCEEDS_TENDER'
      );
    }

    // Attribute prior direct digital payouts per method
    for (const [m, amt] of Object.entries(priorDigital) as [CanonicalPaymentMethod, number][]) {
      if (amt && amt > 0) {
        assertSafeInteger(amt, `Prior digital refund for ${m}`, true);
        let unallocatedMethod = amt;
        for (const state of lineStates) {
          if (state.method === m && unallocatedMethod > 0) {
            const canTake = safeSub(state.originalAmount, state.priorDirectRefunded, 'Remaining line capacity');
            const take = Math.min(unallocatedMethod, canTake);
            state.priorDirectRefunded = safeAdd(state.priorDirectRefunded, take, `Line prior direct ${m}`);
            unallocatedMethod = safeSub(unallocatedMethod, take, `Unallocated prior ${m}`);
          }
        }
        if (unallocatedMethod > 0) {
          throw new PaymentDomainError(
            `Prior digital refund for ${m} (Rs ${amt.toLocaleString()}) exceeds total original ${m} tenders.`,
            'PRIOR_DIGITAL_EXCEEDS_TENDER'
          );
        }
      }
    }

    // Attribute prior customer credit aggregate FIFO across remaining lines
    let unallocatedPriorCredit = priorCreditTotal;
    for (const state of lineStates) {
      if (unallocatedPriorCredit > 0) {
        const remainingOnLine = safeSub(state.originalAmount, safeAdd(state.priorDirectRefunded, state.priorCreditFunded, 'Line prior sum'), 'Line available for credit');
        const take = Math.min(unallocatedPriorCredit, remainingOnLine);
        state.priorCreditFunded = safeAdd(state.priorCreditFunded, take, 'Line prior credit');
        unallocatedPriorCredit = safeSub(unallocatedPriorCredit, take, 'Unallocated prior credit');
      }
    }
    if (unallocatedPriorCredit > 0) {
      throw new PaymentDomainError(
        `Prior customer credit issued (Rs ${priorCreditTotal.toLocaleString()}) exceeds available original tender lines.`,
        'PRIOR_CREDIT_EXCEEDS_TENDER'
      );
    }
  }

  // Calculate total prior refunds across all components
  let totalPriorRefunded = safeAdd(priorCreditCancelled, priorAdvanceRestored, 'Prior debt + advance');
  for (const state of lineStates) {
    totalPriorRefunded = safeAdd(
      totalPriorRefunded,
      safeAdd(state.priorDirectRefunded, state.priorCreditFunded, `Prior refunds on line ${state.lineId}`),
      'Accumulated prior refunds'
    );
  }

  // Validate aggregate prior customer credit if explicitly passed alongside detailed lines
  if (priorRefunds.customerCreditIssued !== undefined) {
    let sumLineCredit = 0;
    for (const state of lineStates) {
      sumLineCredit = safeAdd(sumLineCredit, state.priorCreditFunded, 'Sum line credit');
    }
    if (sumLineCredit !== priorRefunds.customerCreditIssued) {
      throw new PaymentDomainError(
        `Supplied prior customer credit aggregate (Rs ${priorRefunds.customerCreditIssued.toLocaleString()}) does not match sum of line credits (Rs ${sumLineCredit.toLocaleString()}).`,
        'PRIOR_CREDIT_AGGREGATE_MISMATCH'
      );
    }
  }

  // M-01 Validation: When detailed lines are present, validate any supplied legacy direct aggregates
  if (hasDetailedPriorLines) {
    // 1. Validate cash aggregate if supplied
    if (priorRefunds.cashRefunded !== undefined) {
      assertSafeInteger(priorRefunds.cashRefunded, 'Supplied prior cash refunded aggregate', true);
      let sumLineCash = 0;
      for (const state of lineStates) {
        if (state.method === 'CASH') {
          sumLineCash = safeAdd(sumLineCash, state.priorDirectRefunded, 'Sum line direct cash');
        }
      }
      if (sumLineCash !== priorRefunds.cashRefunded) {
        throw new PaymentDomainError(
          `Supplied prior cash refund aggregate (Rs ${priorRefunds.cashRefunded.toLocaleString()}) does not match sum of line direct cash refunds (Rs ${sumLineCash.toLocaleString()}).`,
          'PRIOR_CASH_AGGREGATE_MISMATCH'
        );
      }
    }

    // 2. Validate digital aggregates per method if supplied
    if (priorRefunds.digitalRefundedByMethod !== undefined) {
      for (const [m, amt] of Object.entries(priorRefunds.digitalRefundedByMethod) as [CanonicalPaymentMethod, number | undefined][]) {
        if (amt !== undefined) {
          assertSafeInteger(amt, `Supplied prior digital aggregate for ${m}`, true);
          let sumLineDigital = 0;
          for (const state of lineStates) {
            if (state.method === m) {
              sumLineDigital = safeAdd(sumLineDigital, state.priorDirectRefunded, `Sum line direct ${m}`);
            }
          }
          if (sumLineDigital !== amt) {
            throw new PaymentDomainError(
              `Supplied prior digital refund aggregate for ${m} (Rs ${amt.toLocaleString()}) does not match sum of line direct refunds (Rs ${sumLineDigital.toLocaleString()}).`,
              'PRIOR_DIGITAL_AGGREGATE_MISMATCH'
            );
          }
        }
      }
    }
  }

  const remainingEligibleInvoiceBalance = safeSub(originalInvoiceTotal, totalPriorRefunded, 'Remaining eligible invoice');
  if (refundAmount > remainingEligibleInvoiceBalance) {
    throw new PaymentDomainError(
      `Requested refund Rs ${refundAmount.toLocaleString()} exceeds remaining eligible invoice balance Rs ${remainingEligibleInvoiceBalance.toLocaleString()}.`,
      'REFUND_EXCEEDS_INVOICE'
    );
  }

  let remainingToAllocate = refundAmount;

  // Step 1: Cancel unpaid invoice debt first
  const uncancelledCreditRemaining = Math.max(0, safeSub(originalCreditAllocated, priorCreditCancelled, 'Remaining credit to cancel'));
  const unpaidInvoiceCreditCancelled = Math.min(remainingToAllocate, uncancelledCreditRemaining);
  remainingToAllocate = safeSub(remainingToAllocate, unpaidInvoiceCreditCancelled, 'Remaining after credit cancel');

  // Step 2: Restore existing advance second
  const uncancelledAdvanceRemaining = Math.max(0, safeSub(originalAdvanceApplied, priorAdvanceRestored, 'Remaining advance to restore'));
  const existingAdvanceRestored = Math.min(remainingToAllocate, uncancelledAdvanceRemaining);
  remainingToAllocate = safeSub(remainingToAllocate, existingAdvanceRestored, 'Remaining after advance restore');

  // Step 3 & 4: Payout allocations (Priority: Direct Payouts First, then FIFO Customer Credit)
  let cashRefunded = 0;
  let customerCreditIssued = 0;
  const digitalRefundedByMethod: Partial<Record<CanonicalPaymentMethod, number>> = {};

  if (remainingToAllocate > 0) {
    const reqCash = requestedPayout.cashAmount ?? 0;
    const reqCredit = requestedPayout.customerCreditAmount ?? 0;
    const reqDigital = requestedPayout.digitalPayouts ?? {};

    // ─────────────────────────────────────────────────────────────────────────
    // Step 3: Reserve Direct Cash and Digital Payouts First
    // ─────────────────────────────────────────────────────────────────────────
    if (reqCash > 0) {
      assertSafeInteger(reqCash, 'Requested cash refund', true);
      // Validate cash tender ceiling first
      let availableCashFunding = 0;
      for (const state of lineStates) {
        if (state.method === 'CASH') {
          const used = safeAdd(state.priorDirectRefunded, state.priorCreditFunded, 'Line used');
          const avail = Math.max(0, safeSub(state.originalAmount, used, 'Line available'));
          availableCashFunding = safeAdd(availableCashFunding, avail, 'Available cash sum');
        }
      }

      if (reqCash > availableCashFunding) {
        throw new PaymentDomainError(
          `Requested cash refund Rs ${reqCash.toLocaleString()} exceeds eligible original cash tender funding Rs ${availableCashFunding.toLocaleString()}.`,
          'CASH_REFUND_EXCEEDS_TENDER'
        );
      }

      if (reqCash > remainingToAllocate) {
        throw new PaymentDomainError(
          `Requested cash refund Rs ${reqCash.toLocaleString()} exceeds remaining refund amount Rs ${remainingToAllocate.toLocaleString()}.`,
          'PAYOUT_EXCEEDS_REFUND'
        );
      }

      // Reserve direct cash across cash lines (FIFO)
      let unallocatedCash = reqCash;
      for (const state of lineStates) {
        if (state.method === 'CASH' && unallocatedCash > 0) {
          const used = safeAdd(state.priorDirectRefunded, state.priorCreditFunded, 'Line used');
          const avail = Math.max(0, safeSub(state.originalAmount, used, 'Line available'));
          const take = Math.min(unallocatedCash, avail);
          state.currentDirectRefunded = safeAdd(state.currentDirectRefunded, take, 'Current direct cash line');
          unallocatedCash = safeSub(unallocatedCash, take, 'Unallocated cash');
        }
      }

      cashRefunded = reqCash;
      remainingToAllocate = safeSub(remainingToAllocate, cashRefunded, 'Remaining after cash payout');
    }

    // Direct Digital Payouts
    for (const [m, amt] of Object.entries(reqDigital) as [CanonicalPaymentMethod, number][]) {
      if (amt && amt > 0) {
        assertSafeInteger(amt, `Requested digital refund for ${m}`, true);
        let availableDigitalFunding = 0;
        for (const state of lineStates) {
          if (state.method === m) {
            const used = safeAdd(state.priorDirectRefunded, state.priorCreditFunded, 'Line used');
            const avail = Math.max(0, safeSub(state.originalAmount, used, 'Line available'));
            availableDigitalFunding = safeAdd(availableDigitalFunding, avail, `Available ${m} sum`);
          }
        }

        if (amt > availableDigitalFunding) {
          throw new PaymentDomainError(
            `Requested digital refund for ${m} (Rs ${amt.toLocaleString()}) exceeds eligible original tender funding Rs ${availableDigitalFunding.toLocaleString()}.`,
            'DIGITAL_REFUND_EXCEEDS_TENDER'
          );
        }

        if (amt > remainingToAllocate) {
          throw new PaymentDomainError(
            `Requested digital refund for ${m} (Rs ${amt.toLocaleString()}) exceeds remaining refund amount Rs ${remainingToAllocate.toLocaleString()}.`,
            'PAYOUT_EXCEEDS_REFUND'
          );
        }

        // Reserve direct digital across lines of this method (FIFO)
        let unallocatedDigital = amt;
        for (const state of lineStates) {
          if (state.method === m && unallocatedDigital > 0) {
            const used = safeAdd(state.priorDirectRefunded, state.priorCreditFunded, 'Line used');
            const avail = Math.max(0, safeSub(state.originalAmount, used, 'Line available'));
            const take = Math.min(unallocatedDigital, avail);
            state.currentDirectRefunded = safeAdd(state.currentDirectRefunded, take, `Current direct ${m} line`);
            unallocatedDigital = safeSub(unallocatedDigital, take, 'Unallocated digital');
          }
        }

        digitalRefundedByMethod[m] = amt;
        remainingToAllocate = safeSub(remainingToAllocate, amt, `Remaining after ${m} digital payout`);
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Step 4: Allocate Customer Credit Across Remaining Tender Lines in FIFO Order
    // ─────────────────────────────────────────────────────────────────────────
    let creditTarget = 0;
    if (reqCredit > 0) {
      assertSafeInteger(reqCredit, 'Requested customer credit refund', true);
      if (reqCredit > remainingToAllocate) {
        throw new PaymentDomainError(
          `Requested customer credit Rs ${reqCredit.toLocaleString()} exceeds remaining refund amount Rs ${remainingToAllocate.toLocaleString()}.`,
          'PAYOUT_EXCEEDS_REFUND'
        );
      }
      creditTarget = reqCredit;
    } else if (remainingToAllocate > 0) {
      // Default Fallback: If no explicit payout was provided, convert remaining to customer credit
      creditTarget = remainingToAllocate;
    }

    if (creditTarget > 0) {
      let unallocatedCredit = creditTarget;
      for (const state of lineStates) {
        if (unallocatedCredit > 0) {
          const used = safeAdd(
            safeAdd(state.priorDirectRefunded, state.priorCreditFunded, 'Line prior'),
            state.currentDirectRefunded,
            'Line current direct'
          );
          const avail = Math.max(0, safeSub(state.originalAmount, used, 'Line available for credit'));
          const take = Math.min(unallocatedCredit, avail);
          if (take > 0) {
            state.currentCreditFunded = safeAdd(state.currentCreditFunded, take, 'Line current credit');
            unallocatedCredit = safeSub(unallocatedCredit, take, 'Unallocated credit');
          }
        }
      }

      if (unallocatedCredit > 0) {
        throw new PaymentDomainError(
          `Customer credit allocation (Rs ${creditTarget.toLocaleString()}) exceeds eligible original tender funding across all lines.`,
          'CREDIT_REFUND_EXCEEDS_TENDER_FUNDING'
        );
      }

      customerCreditIssued = creditTarget;
      remainingToAllocate = safeSub(remainingToAllocate, customerCreditIssued, 'Remaining after credit allocation');
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Step 5: Build Result & Verify All Conservation Invariants
  // ─────────────────────────────────────────────────────────────────────────
  const tenderLineAllocations: TenderLineRefundAllocation[] = [];

  for (const state of lineStates) {
    const totalLineConsumed = safeAdd(
      safeAdd(state.priorDirectRefunded, state.priorCreditFunded, 'Prior line sum'),
      safeAdd(state.currentDirectRefunded, state.currentCreditFunded, 'Current line sum'),
      'Total line consumed'
    );

    if (totalLineConsumed > state.originalAmount) {
      throw new PaymentDomainError(
        `Tender line ${state.lineId} (${state.method}) total consumed Rs ${totalLineConsumed.toLocaleString()} exceeds original amount Rs ${state.originalAmount.toLocaleString()}.`,
        'TENDER_LINE_OVERCONSUMED'
      );
    }

    const remainingEligibleAmount = safeSub(state.originalAmount, totalLineConsumed, `Remaining on line ${state.lineId}`);

    tenderLineAllocations.push({
      lineId: state.lineId,
      method: state.method,
      originalAmount: state.originalAmount,
      priorDirectRefunded: state.priorDirectRefunded,
      priorCreditFunded: state.priorCreditFunded,
      currentDirectRefunded: state.currentDirectRefunded,
      currentCreditFunded: state.currentCreditFunded,
      remainingEligibleAmount,
    });
  }

  // Verify total refund matches requested
  let totalRefundAllocated = safeAdd(
    safeAdd(unpaidInvoiceCreditCancelled, existingAdvanceRestored, 'Credit cancel + advance restore'),
    safeAdd(cashRefunded, customerCreditIssued, 'Cash + credit issued'),
    'Total refund allocated'
  );

  for (const amt of Object.values(digitalRefundedByMethod)) {
    if (amt && amt > 0) {
      totalRefundAllocated = safeAdd(totalRefundAllocated, amt, 'Total refund with digital');
    }
  }

  if (totalRefundAllocated !== refundAmount) {
    throw new PaymentDomainError(
      `Allocated refund components sum (Rs ${totalRefundAllocated.toLocaleString()}) does not match requested refund (Rs ${refundAmount.toLocaleString()}).`,
      'REFUND_COMPONENT_SUM_MISMATCH'
    );
  }

  return {
    requestedRefundAmount: refundAmount,
    unpaidInvoiceCreditCancelled,
    existingAdvanceRestored,
    cashRefunded,
    digitalRefundedByMethod,
    customerCreditIssued,
    tenderLineAllocations,
    totalRefundAllocated,
    remainingEligibleInvoiceBalance: safeSub(remainingEligibleInvoiceBalance, totalRefundAllocated, 'Remaining invoice balance after refund'),
  };
}
