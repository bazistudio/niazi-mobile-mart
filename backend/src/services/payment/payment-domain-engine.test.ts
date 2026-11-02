/**
 * NIAZI MOBILE MART — Phase 4 Stage B
 * Payment Domain Engine — Pure Unit Tests
 *
 * HOW TO RUN (no database required):
 *   cd backend
 *   npx tsc --noEmit                                    # type check only
 *   npx tsc && node dist/services/payment/payment-domain-engine.test.js
 *
 * These are pure function tests.
 * No database, no environment variables, no network required.
 * The engine has zero external dependencies.
 *
 * Covers all 15 validation scenarios and accounting examples A–E
 * from the Phase 4 Stage B authorization document.
 */

import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';

import {
  calculatePaymentAllocation,
  validatePaymentRequest,
  PaymentDomainError,
  assertSafeInteger,
  safeAdd,
  safeSub,
} from './payment.engine';
import type { PaymentAllocationRequest } from './payment.types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function req(overrides: Partial<PaymentAllocationRequest> & Pick<PaymentAllocationRequest, 'invoiceTotal' | 'tenders'>): PaymentAllocationRequest {
  return {
    customerId: null,
    previousCustomerBalance: 0,
    customerCreditLimit: undefined,
    ...overrides,
  };
}

function assertEngineError(fn: () => unknown, expectedCode: string): void {
  let caught: unknown;
  try { fn(); } catch (e) { caught = e; }
  assert.ok(caught instanceof PaymentDomainError, `Expected PaymentDomainError, got: ${String(caught)}`);
  assert.strictEqual((caught as PaymentDomainError).code, expectedCode,
    `Expected error code ${expectedCode}, got ${(caught as PaymentDomainError).code}`);
}

// ─── Engine Validation Scenarios 1–6: Digital Overpayment Rejection ──────────

describe('Digital Overpayment Rejection (Stage B2 Hardening)', () => {

  // Scenario 1: Registered customer digital overpayment is rejected
  test('1. Registered customer — bank tender exceeds invoice', () => {
    assertEngineError(() => calculatePaymentAllocation(req({
      invoiceTotal: 10_000,
      customerId: 'cust-001',
      previousCustomerBalance: 0,
      tenders: [{ method: 'BANK_TRANSFER', amount: 12_000 }],
    })), 'DIGITAL_OVERPAYMENT_PROHIBITED');
  });

  // Scenario 2: Walk-in digital overpayment is rejected
  test('2. Walk-in customer — card tender exceeds invoice', () => {
    assertEngineError(() => calculatePaymentAllocation(req({
      invoiceTotal: 5_000,
      customerId: null,
      previousCustomerBalance: 0,
      tenders: [{ method: 'CARD', amount: 6_000 }],
    })), 'DIGITAL_OVERPAYMENT_PROHIBITED');
  });

  // Scenario 3: Digital excess with previous customer debt is rejected
  test('3. Registered customer with prior debt — digital overpayment rejected', () => {
    // Invoice Rs 10,000; prior debt Rs 5,000 (positive balance = owes shop);
    // bank tender Rs 12,000 → nonCash Rs 12,000 > remainingInvoiceAfterAdvance Rs 10,000
    assertEngineError(() => calculatePaymentAllocation(req({
      invoiceTotal: 10_000,
      customerId: 'cust-002',
      previousCustomerBalance: 5_000,  // customer owes Rs 5,000
      tenders: [{ method: 'BANK_TRANSFER', amount: 12_000 }],
    })), 'DIGITAL_OVERPAYMENT_PROHIBITED');
  });

  // Scenario 4: Digital excess with existing customer advance is rejected
  test('4. Registered customer with advance — digital overpayment rejected', () => {
    // Customer has advance of Rs 2,000 (balance -2,000);
    // remainingInvoiceAfterAdvance = 10,000 - 2,000 = 8,000
    // bank Rs 9,000 > 8,000 → rejected
    assertEngineError(() => calculatePaymentAllocation(req({
      invoiceTotal: 10_000,
      customerId: 'cust-003',
      previousCustomerBalance: -2_000,  // customer has Rs 2,000 advance
      tenders: [{ method: 'BANK_TRANSFER', amount: 9_000 }],
    })), 'DIGITAL_OVERPAYMENT_PROHIBITED');
  });

  // Scenario 5: Mixed cash/digital with digital excess is rejected
  test('5. Mixed tender — digital portion exceeds invoice', () => {
    // Invoice Rs 10,000; bank Rs 8,000 + cash Rs 5,000
    // nonCash Rs 8,000 > invoiceTotal Rs 10,000? No — 8,000 < 10,000, so this should PASS.
    // To trigger rejection: bank Rs 12,000 + cash Rs 1,000
    assertEngineError(() => calculatePaymentAllocation(req({
      invoiceTotal: 10_000,
      customerId: 'cust-004',
      previousCustomerBalance: 0,
      tenders: [
        { method: 'BANK_TRANSFER', amount: 12_000 },
        { method: 'CASH', amount: 1_000 },
      ],
    })), 'DIGITAL_OVERPAYMENT_PROHIBITED');
  });

  // Scenario 6: Cash overpayment remains supported (registered customer)
  test('6. Cash overpayment allowed — creates advance/settles debt', () => {
    // Invoice Rs 5,000; previous debt Rs 3,000; cash Rs 10,000
    // Cash excess Rs 5,000 → settle Rs 3,000 debt → Rs 2,000 advance
    const result = calculatePaymentAllocation(req({
      invoiceTotal: 5_000,
      customerId: 'cust-005',
      previousCustomerBalance: 3_000,
      tenders: [{ method: 'CASH', amount: 10_000 }],
    }));
    assert.strictEqual(result.paymentStatus, 'PAID');
    assert.strictEqual(result.invoiceAllocated, 5_000);
    assert.strictEqual(result.creditAllocated, 0);
    // Excess: 10,000 - 5,000 = 5,000; settles Rs 3,000 debt; Rs 2,000 advance
    assert.strictEqual(result.previousBalanceSettled, 3_000);
    assert.strictEqual(result.customerAdvanceCreated, 2_000);
    // Projected balance = 3,000 + 5,000 - 10,000 = -2,000 (advance)
    assert.strictEqual(result.projectedCustomerBalance, -2_000);
  });

});

// ─── Payment Allocation Scenarios 7–15 ───────────────────────────────────────

describe('Payment Allocation Scenarios', () => {

  // Scenario 7: Registered customer exact payment
  test('7. Registered customer — exact cash payment', () => {
    const result = calculatePaymentAllocation(req({
      invoiceTotal: 8_000,
      customerId: 'cust-006',
      previousCustomerBalance: 0,
      tenders: [{ method: 'CASH', amount: 8_000 }],
    }));
    assert.strictEqual(result.paymentStatus, 'PAID');
    assert.strictEqual(result.invoiceAllocated, 8_000);
    assert.strictEqual(result.creditAllocated, 0);
    assert.strictEqual(result.changeReturned, 0);
    assert.strictEqual(result.customerAdvanceCreated, 0);
    assert.strictEqual(result.previousBalanceSettled, 0);
    assert.strictEqual(result.projectedCustomerBalance, 0);
  });

  // Scenario 8: Registered customer partial payment creating debt
  test('8. Registered customer — partial payment, credit created', () => {
    const result = calculatePaymentAllocation(req({
      invoiceTotal: 10_000,
      customerId: 'cust-007',
      previousCustomerBalance: 0,
      tenders: [{ method: 'CASH', amount: 4_000 }],
    }));
    assert.strictEqual(result.paymentStatus, 'PARTIALLY_PAID');
    assert.strictEqual(result.invoiceAllocated, 4_000);
    assert.strictEqual(result.creditAllocated, 6_000);
    assert.strictEqual(result.changeReturned, 0);
    // Balance = 0 + 10,000 - 4,000 = 6,000 (owes shop)
    assert.strictEqual(result.projectedCustomerBalance, 6_000);
    assert.strictEqual(result.projectedOutstanding, 6_000);
  });

  // Scenario 9: Cash excess settling previous debt
  test('9. Cash excess — settles existing debt', () => {
    // Invoice Rs 5,000; previous debt Rs 4,000; cash Rs 9,000
    // invoice paid, excess Rs 4,000 → settles Rs 4,000 debt exactly
    const result = calculatePaymentAllocation(req({
      invoiceTotal: 5_000,
      customerId: 'cust-008',
      previousCustomerBalance: 4_000,
      tenders: [{ method: 'CASH', amount: 9_000 }],
    }));
    assert.strictEqual(result.paymentStatus, 'PAID');
    assert.strictEqual(result.invoiceAllocated, 5_000);
    assert.strictEqual(result.previousBalanceSettled, 4_000);
    assert.strictEqual(result.customerAdvanceCreated, 0);
    // Balance = 4,000 + 5,000 - 9,000 = 0
    assert.strictEqual(result.projectedCustomerBalance, 0);
  });

  // Scenario 10: Cash excess settling debt and creating remaining advance
  test('10. Cash excess — settles debt and creates advance', () => {
    // Invoice Rs 5,000; previous debt Rs 10,000; cash Rs 18,000
    // excess = 18,000 - 5,000 = 13,000; settle Rs 10,000; advance Rs 3,000
    const result = calculatePaymentAllocation(req({
      invoiceTotal: 5_000,
      customerId: 'cust-009',
      previousCustomerBalance: 10_000,
      tenders: [{ method: 'CASH', amount: 18_000 }],
    }));
    assert.strictEqual(result.paymentStatus, 'PAID');
    assert.strictEqual(result.invoiceAllocated, 5_000);
    assert.strictEqual(result.previousBalanceSettled, 10_000);
    assert.strictEqual(result.customerAdvanceCreated, 3_000);
    // Balance = 10,000 + 5,000 - 18,000 = -3,000 (advance)
    assert.strictEqual(result.projectedCustomerBalance, -3_000);
    assert.strictEqual(result.remainingAdvanceBalance, 3_000);
  });

  // Scenario 11: Walk-in cash excess returns change
  test('11. Walk-in — cash overpayment returned as change', () => {
    const result = calculatePaymentAllocation(req({
      invoiceTotal: 5_000,
      customerId: null,
      previousCustomerBalance: 0,
      tenders: [{ method: 'CASH', amount: 8_000 }],
    }));
    assert.strictEqual(result.paymentStatus, 'PAID');
    assert.strictEqual(result.invoiceAllocated, 5_000);
    assert.strictEqual(result.changeReturned, 3_000);
    assert.strictEqual(result.cashToDrawer, 5_000);
    assert.strictEqual(result.customerAdvanceCreated, 0);
  });

  // Scenario 12: Mixed exact cash and bank payment
  test('12. Mixed tender — exact cash + bank payment', () => {
    // Invoice Rs 10,000; cash Rs 7,000 + bank Rs 3,000 = exact
    const result = calculatePaymentAllocation(req({
      invoiceTotal: 10_000,
      customerId: 'cust-010',
      previousCustomerBalance: 0,
      tenders: [
        { method: 'CASH', amount: 7_000 },
        { method: 'BANK_TRANSFER', amount: 3_000 },
      ],
    }));
    assert.strictEqual(result.paymentStatus, 'PAID');
    assert.strictEqual(result.invoiceAllocated, 10_000);
    assert.strictEqual(result.creditAllocated, 0);
    assert.strictEqual(result.changeReturned, 0);
    assert.strictEqual(result.customerAdvanceCreated, 0);
    assert.strictEqual(result.cashTenderReceived, 7_000);
    assert.strictEqual(result.nonCashTenderReceived, 3_000);
    // Projected balance: 0 + 10,000 - 10,000 = 0
    assert.strictEqual(result.projectedCustomerBalance, 0);
  });

  // Scenario 13: Credit-limit projection
  test('13. Credit limit — exceeded projection rejected', () => {
    // Current debt Rs 8,000; credit limit Rs 10,000; new credit Rs 3,000
    // Projected outstanding = 8,000 + 3,000 = 11,000 > 10,000 → rejected
    assertEngineError(() => calculatePaymentAllocation(req({
      invoiceTotal: 3_000,
      customerId: 'cust-011',
      previousCustomerBalance: 8_000,
      customerCreditLimit: 10_000,
      tenders: [],  // zero tender = full credit
    })), 'CREDIT_LIMIT_EXCEEDED');
  });

  // Scenario 13b: Fully paid cash sale for customer already at credit limit — NOT blocked
  test('13b. Credit limit — fully paid cash sale not blocked', () => {
    // Customer at exactly credit limit (Rs 10,000 outstanding, limit Rs 10,000)
    // but this sale is fully paid in cash → creditAllocated = 0 → not blocked
    const result = calculatePaymentAllocation(req({
      invoiceTotal: 5_000,
      customerId: 'cust-012',
      previousCustomerBalance: 10_000,
      customerCreditLimit: 10_000,
      tenders: [{ method: 'CASH', amount: 5_000 }],
    }));
    assert.strictEqual(result.paymentStatus, 'PAID');
    assert.strictEqual(result.creditAllocated, 0);
    assert.strictEqual(result.invoiceAllocated, 5_000);
  });

  // Scenario 14: Negative customer balance (advance) is preserved
  test('14. Negative balance preserved — advance applied to invoice', () => {
    // Customer has Rs 3,000 advance (balance -3,000)
    // Invoice Rs 5,000; cash Rs 2,000 → advance applies Rs 3,000 first
    // remainingInvoiceAfterAdvance = 5,000 - 3,000 = 2,000; cash covers Rs 2,000 exactly
    const result = calculatePaymentAllocation(req({
      invoiceTotal: 5_000,
      customerId: 'cust-013',
      previousCustomerBalance: -3_000,
      tenders: [{ method: 'CASH', amount: 2_000 }],
    }));
    assert.strictEqual(result.paymentStatus, 'PAID');
    assert.strictEqual(result.existingAdvanceApplied, 3_000);
    assert.strictEqual(result.invoiceAllocated, 5_000);
    assert.strictEqual(result.creditAllocated, 0);
    // Balance = -3,000 + 5,000 - 2,000 = 0
    assert.strictEqual(result.projectedCustomerBalance, 0);
  });

  // Scenario 15: Safe integer and overflow validation
  test('15. Safe integer validation — non-integer invoice rejected', () => {
    assertEngineError(() => calculatePaymentAllocation(req({
      invoiceTotal: 10_000.50,  // non-integer
      tenders: [{ method: 'CASH', amount: 10_001 }],
    })), 'UNSAFE_INTEGER');
  });

  test('15b. Safe integer validation — zero invoice rejected', () => {
    assertEngineError(() => calculatePaymentAllocation(req({
      invoiceTotal: 0,
      tenders: [{ method: 'CASH', amount: 1 }],
    })), 'NON_POSITIVE_AMOUNT');
  });

});

// ─── Accounting Examples A–E (exact figures from authorization document) ──────

describe('Authorization Document Accounting Examples', () => {

  // Test A: Invoice Rs 5,000, previous debt Rs 10,000, cash Rs 18,000
  test('A. Debt settlement and advance creation', () => {
    const result = calculatePaymentAllocation(req({
      invoiceTotal: 5_000,
      customerId: 'cust-A',
      previousCustomerBalance: 10_000,  // owes Rs 10,000
      tenders: [{ method: 'CASH', amount: 18_000 }],
    }));

    // Invoice allocation
    assert.strictEqual(result.invoiceAllocated, 5_000, 'A: invoice allocated Rs 5,000');
    assert.strictEqual(result.paymentStatus, 'PAID', 'A: payment status PAID');

    // Debt settlement and advance
    assert.strictEqual(result.previousBalanceSettled, 10_000, 'A: debt settled Rs 10,000');
    assert.strictEqual(result.customerAdvanceCreated, 3_000, 'A: advance Rs 3,000');

    // Final ledger balance: 10,000 + 5,000 - 18,000 = -3,000
    assert.strictEqual(result.projectedCustomerBalance, -3_000, 'A: final balance -Rs 3,000');
    assert.strictEqual(result.remainingAdvanceBalance, 3_000, 'A: remaining advance Rs 3,000');

    // Cash drawer: all Rs 18,000 retained (Rs 5,000 invoice + Rs 13,000 settlement/advance)
    assert.strictEqual(result.cashToDrawer, 18_000, 'A: cash to drawer Rs 18,000');
  });

  // Test B: Invoice Rs 10,000, cash Rs 7,000 + bank Rs 3,000
  test('B. Mixed tender exact payment', () => {
    const result = calculatePaymentAllocation(req({
      invoiceTotal: 10_000,
      customerId: 'cust-B',
      previousCustomerBalance: 0,
      tenders: [
        { method: 'CASH', amount: 7_000 },
        { method: 'BANK_TRANSFER', amount: 3_000 },
      ],
    }));

    assert.strictEqual(result.invoiceAllocated, 10_000, 'B: invoice paid Rs 10,000');
    assert.strictEqual(result.paymentStatus, 'PAID', 'B: status PAID');
    assert.strictEqual(result.cashTenderReceived, 7_000, 'B: cash Rs 7,000');
    assert.strictEqual(result.nonCashTenderReceived, 3_000, 'B: bank Rs 3,000 excluded from drawer');
    assert.strictEqual(result.customerAdvanceCreated, 0, 'B: no advance');
    assert.strictEqual(result.creditAllocated, 0, 'B: no credit');
    assert.strictEqual(result.changeReturned, 0, 'B: no change');
    // Only cash enters drawer for registered customer
    assert.strictEqual(result.cashToDrawer, 7_000, 'B: cash drawer Rs 7,000 only');
  });

  // Test C: Invoice Rs 10,000, bank Rs 12,000 → REJECTED
  test('C. Digital overpayment rejected', () => {
    assertEngineError(() => calculatePaymentAllocation(req({
      invoiceTotal: 10_000,
      customerId: 'cust-C',
      previousCustomerBalance: 0,
      tenders: [{ method: 'BANK_TRANSFER', amount: 12_000 }],
    })), 'DIGITAL_OVERPAYMENT_PROHIBITED');
  });

  // Test D: Walk-in invoice Rs 5,000, cash Rs 8,000 → change Rs 3,000
  test('D. Walk-in cash overpayment — change returned', () => {
    const result = calculatePaymentAllocation(req({
      invoiceTotal: 5_000,
      customerId: null,
      previousCustomerBalance: 0,
      tenders: [{ method: 'CASH', amount: 8_000 }],
    }));

    assert.strictEqual(result.invoiceAllocated, 5_000, 'D: invoice paid Rs 5,000');
    assert.strictEqual(result.paymentStatus, 'PAID', 'D: status PAID');
    assert.strictEqual(result.changeReturned, 3_000, 'D: change Rs 3,000');
    assert.strictEqual(result.cashToDrawer, 5_000, 'D: drawer Rs 5,000 only');
    assert.strictEqual(result.customerAdvanceCreated, 0, 'D: no advance for walk-in');
    assert.strictEqual(result.creditAllocated, 0, 'D: no credit');
  });

  // Test E: Current debt Rs 8,000, credit limit Rs 10,000, new credit Rs 3,000 → REJECTED
  test('E. Credit limit exceeded — partial payment with credit', () => {
    // Invoice Rs 3,000; no tender; full credit
    // projected = 8,000 + 3,000 = 11,000 > limit 10,000 → REJECTED
    assertEngineError(() => calculatePaymentAllocation(req({
      invoiceTotal: 3_000,
      customerId: 'cust-E',
      previousCustomerBalance: 8_000,
      customerCreditLimit: 10_000,
      tenders: [],
    })), 'CREDIT_LIMIT_EXCEEDED');
  });

});

// ─── Additional Edge Cases ────────────────────────────────────────────────────

describe('Edge Cases', () => {

  test('Walk-in with zero tenders rejected (cannot credit)', () => {
    assertEngineError(() => calculatePaymentAllocation(req({
      invoiceTotal: 5_000,
      customerId: null,
      previousCustomerBalance: 0,
      tenders: [],
    })), 'WALK_IN_CREDIT_PROHIBITED');
  });

  test('Easypaisa overpayment rejected for registered customer', () => {
    assertEngineError(() => calculatePaymentAllocation(req({
      invoiceTotal: 5_000,
      customerId: 'cust-ep',
      previousCustomerBalance: 0,
      tenders: [{ method: 'EASYPAISA', amount: 6_000 }],
    })), 'DIGITAL_OVERPAYMENT_PROHIBITED');
  });

  test('JazzCash overpayment rejected for walk-in customer', () => {
    assertEngineError(() => calculatePaymentAllocation(req({
      invoiceTotal: 3_000,
      customerId: null,
      previousCustomerBalance: 0,
      tenders: [{ method: 'JAZZCASH', amount: 4_000 }],
    })), 'DIGITAL_OVERPAYMENT_PROHIBITED');
  });

  test('Exact digital payment accepted — no excess', () => {
    const result = calculatePaymentAllocation(req({
      invoiceTotal: 7_000,
      customerId: 'cust-exact',
      previousCustomerBalance: 0,
      tenders: [{ method: 'CARD', amount: 7_000 }],
    }));
    assert.strictEqual(result.paymentStatus, 'PAID');
    assert.strictEqual(result.invoiceAllocated, 7_000);
    assert.strictEqual(result.creditAllocated, 0);
    assert.strictEqual(result.changeReturned, 0);
  });

  test('safeAdd — overflow rejected', () => {
    assertEngineError(
      () => safeAdd(Number.MAX_SAFE_INTEGER, 1, 'Overflow test'),
      'INTEGER_OVERFLOW'
    );
  });

  test('safeSub — underflow rejected', () => {
    assertEngineError(
      () => safeSub(Number.MIN_SAFE_INTEGER, 1, 'Underflow test', true),
      'INTEGER_UNDERFLOW'
    );
  });

  test('assertSafeInteger — float rejected', () => {
    assertEngineError(
      () => assertSafeInteger(1.5, 'Test float'),
      'UNSAFE_INTEGER'
    );
  });

});
