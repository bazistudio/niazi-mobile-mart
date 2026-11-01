/**
 * NIAZI MOBILE MART — SHARED PAYMENT DOMAIN ENGINE TEST SUITE
 * Test File: payment-domain-engine.test.ts
 *
 * Comprehensive unit tests covering:
 * - All 29 business scenarios from Phase 2.3 specification.
 * - Walk-in restrictions, deterministic order, and digital overpayment rejection.
 * - Credit limit checks (0 limit vs positive limit, boundary, and violations).
 * - Checked integer arithmetic & safe boundary overflow protections.
 * - Multi-component refund allocations (Cash, Digital methods, Customer credit, Advance restoration, Unpaid credit cancellation).
 * - Partial refunds, multiple sequential refunds, and duplicate refund prevention.
 *
 * 100% pure in-memory tests with zero database or network dependencies.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import {
  calculatePaymentAllocation,
  calculateProjectedCustomerBalance,
  calculateRefundAllocation,
  PaymentDomainError,
  safeAdd,
  safeSub,
} from '../services/payment';

describe('Shared Payment Domain Engine — Unit Test Suite', () => {
  // ───────────────────────────────────────────────────────────────────────────
  // PART 1: REGISTERED CUSTOMER ALLOCATION SCENARIOS (1 to 13)
  // ───────────────────────────────────────────────────────────────────────────

  it('Scenario 1: Full Cash Payment (Registered)', () => {
    const res = calculatePaymentAllocation({
      invoiceTotal: 2600,
      tenders: [{ method: 'CASH', amount: 2600 }],
      customerId: 'cust-1',
      previousCustomerBalance: 45600,
      customerCreditLimit: 100000,
    });

    assert.equal(res.invoiceTotal, 2600);
    assert.equal(res.existingAdvanceApplied, 0);
    assert.equal(res.cashTenderReceived, 2600);
    assert.equal(res.tenderAppliedToInvoice, 2600);
    assert.equal(res.invoiceAllocated, 2600);
    assert.equal(res.previousBalanceSettled, 0);
    assert.equal(res.customerAdvanceCreated, 0);
    assert.equal(res.changeReturned, 0);
    assert.equal(res.creditAllocated, 0);
    assert.equal(res.projectedCustomerBalance, 45600);
    assert.equal(res.projectedOutstanding, 45600);
    assert.equal(res.paymentStatus, 'PAID');
    assert.equal(res.cashToDrawer, 2600);
  });

  it('Scenario 2: Partial Cash Payment (Registered)', () => {
    const res = calculatePaymentAllocation({
      invoiceTotal: 2600,
      tenders: [{ method: 'CASH', amount: 1000 }],
      customerId: 'cust-1',
      previousCustomerBalance: 45600,
      customerCreditLimit: 100000,
    });

    assert.equal(res.tenderAppliedToInvoice, 1000);
    assert.equal(res.invoiceAllocated, 1000);
    assert.equal(res.creditAllocated, 1600);
    assert.equal(res.previousBalanceSettled, 0);
    assert.equal(res.customerAdvanceCreated, 0);
    assert.equal(res.changeReturned, 0);
    assert.equal(res.projectedCustomerBalance, 47200);
    assert.equal(res.projectedOutstanding, 47200);
    assert.equal(res.paymentStatus, 'PARTIALLY_PAID');
    assert.equal(res.cashToDrawer, 1000);
  });

  it('Scenario 3: Pure Credit Sale (Registered)', () => {
    const res = calculatePaymentAllocation({
      invoiceTotal: 2600,
      tenders: [],
      customerId: 'cust-1',
      previousCustomerBalance: 45600,
      customerCreditLimit: 100000,
    });

    assert.equal(res.actualTenderReceived, 0);
    assert.equal(res.invoiceAllocated, 0);
    assert.equal(res.creditAllocated, 2600);
    assert.equal(res.projectedCustomerBalance, 48200);
    assert.equal(res.projectedOutstanding, 48200);
    assert.equal(res.paymentStatus, 'UNPAID');
    assert.equal(res.cashToDrawer, 0);
  });

  it('Scenario 4: Mixed Cash + Card Payment (Registered)', () => {
    const res = calculatePaymentAllocation({
      invoiceTotal: 2600,
      tenders: [
        { method: 'CASH', amount: 1000 },
        { method: 'CARD', amount: 1600 },
      ],
      customerId: 'cust-1',
      previousCustomerBalance: 45600,
      customerCreditLimit: 100000,
    });

    assert.equal(res.cashTenderReceived, 1000);
    assert.equal(res.nonCashTenderReceived, 1600);
    assert.equal(res.actualTenderReceived, 2600);
    assert.equal(res.invoiceAllocated, 2600);
    assert.equal(res.creditAllocated, 0);
    assert.equal(res.projectedCustomerBalance, 45600);
    assert.equal(res.paymentStatus, 'PAID');
    assert.equal(res.cashToDrawer, 1000);
  });

  it('Scenario 5: Cash + EasyPaisa Payment (Registered)', () => {
    const res = calculatePaymentAllocation({
      invoiceTotal: 2600,
      tenders: [
        { method: 'CASH', amount: 1000 },
        { method: 'EASYPAISA', amount: 1600 },
      ],
      customerId: 'cust-1',
      previousCustomerBalance: 45600,
      customerCreditLimit: 100000,
    });

    assert.equal(res.invoiceAllocated, 2600);
    assert.equal(res.creditAllocated, 0);
    assert.equal(res.projectedCustomerBalance, 45600);
    assert.equal(res.cashToDrawer, 1000);
  });

  it('Scenario 6: Excess Cash Settling Previous Debit (Registered)', () => {
    const res = calculatePaymentAllocation({
      invoiceTotal: 2600,
      tenders: [{ method: 'CASH', amount: 15000 }],
      customerId: 'cust-1',
      previousCustomerBalance: 45600,
      customerCreditLimit: 100000,
    });

    assert.equal(res.tenderAppliedToInvoice, 2600);
    assert.equal(res.invoiceAllocated, 2600);
    assert.equal(res.previousBalanceSettled, 12400);
    assert.equal(res.customerAdvanceCreated, 0);
    assert.equal(res.changeReturned, 0);
    assert.equal(res.projectedCustomerBalance, 33200);
    assert.equal(res.paymentStatus, 'PAID');
    assert.equal(res.cashToDrawer, 15000);
  });

  it('Scenario 7: Excess Cash Creating Customer Advance (Registered)', () => {
    const res = calculatePaymentAllocation({
      invoiceTotal: 2600,
      tenders: [{ method: 'CASH', amount: 5000 }],
      customerId: 'cust-1',
      previousCustomerBalance: 1000,
      customerCreditLimit: 100000,
    });

    assert.equal(res.tenderAppliedToInvoice, 2600);
    assert.equal(res.previousBalanceSettled, 1000);
    assert.equal(res.customerAdvanceCreated, 1400);
    assert.equal(res.changeReturned, 0);
    assert.equal(res.projectedCustomerBalance, -1400);
    assert.equal(res.projectedOutstanding, 0);
    assert.equal(res.remainingAdvanceBalance, 1400);
    assert.equal(res.cashToDrawer, 5000);
  });

  it('Scenario 8: Excess Digital Settling Previous Debit (Registered)', () => {
    const res = calculatePaymentAllocation({
      invoiceTotal: 2600,
      tenders: [{ method: 'CARD', amount: 5000 }],
      customerId: 'cust-1',
      previousCustomerBalance: 45600,
      customerCreditLimit: 100000,
    });

    assert.equal(res.tenderAppliedToInvoice, 2600);
    assert.equal(res.previousBalanceSettled, 2400);
    assert.equal(res.customerAdvanceCreated, 0);
    assert.equal(res.projectedCustomerBalance, 43200);
    assert.equal(res.cashToDrawer, 0);
  });

  it('Scenario 9: Excess Digital Creating Customer Advance (Registered)', () => {
    const res = calculatePaymentAllocation({
      invoiceTotal: 2600,
      tenders: [{ method: 'CARD', amount: 5000 }],
      customerId: 'cust-1',
      previousCustomerBalance: 0,
      customerCreditLimit: 100000,
    });

    assert.equal(res.tenderAppliedToInvoice, 2600);
    assert.equal(res.previousBalanceSettled, 0);
    assert.equal(res.customerAdvanceCreated, 2400);
    assert.equal(res.projectedCustomerBalance, -2400);
    assert.equal(res.remainingAdvanceBalance, 2400);
    assert.equal(res.cashToDrawer, 0);
  });

  it('Scenario 10: Existing Advance Fully Covering Invoice (Registered)', () => {
    const res = calculatePaymentAllocation({
      invoiceTotal: 2600,
      tenders: [],
      customerId: 'cust-1',
      previousCustomerBalance: -3000, // Rs 3,000 Advance
      customerCreditLimit: 0,
    });

    assert.equal(res.existingAdvanceApplied, 2600);
    assert.equal(res.actualTenderReceived, 0);
    assert.equal(res.tenderAppliedToInvoice, 0);
    assert.equal(res.invoiceAllocated, 2600);
    assert.equal(res.creditAllocated, 0);
    assert.equal(res.projectedCustomerBalance, -400);
    assert.equal(res.remainingAdvanceBalance, 400);
    assert.equal(res.paymentStatus, 'PAID');
  });

  it('Scenario 11: Existing Advance Partially Covering Invoice (Registered)', () => {
    const res = calculatePaymentAllocation({
      invoiceTotal: 2600,
      tenders: [],
      customerId: 'cust-1',
      previousCustomerBalance: -1000, // Rs 1,000 Advance
      customerCreditLimit: 5000,
    });

    assert.equal(res.existingAdvanceApplied, 1000);
    assert.equal(res.invoiceAllocated, 1000);
    assert.equal(res.creditAllocated, 1600);
    assert.equal(res.projectedCustomerBalance, 1600);
    assert.equal(res.projectedOutstanding, 1600);
    assert.equal(res.paymentStatus, 'PARTIALLY_PAID');
  });

  it('Scenario 12: Existing Advance + Partial Cash (Registered)', () => {
    const res = calculatePaymentAllocation({
      invoiceTotal: 2600,
      tenders: [{ method: 'CASH', amount: 1000 }],
      customerId: 'cust-1',
      previousCustomerBalance: -1000,
      customerCreditLimit: 5000,
    });

    assert.equal(res.existingAdvanceApplied, 1000);
    assert.equal(res.tenderAppliedToInvoice, 1000);
    assert.equal(res.invoiceAllocated, 2000);
    assert.equal(res.creditAllocated, 600);
    assert.equal(res.projectedCustomerBalance, 600);
    assert.equal(res.projectedOutstanding, 600);
    assert.equal(res.paymentStatus, 'PARTIALLY_PAID');
    assert.equal(res.cashToDrawer, 1000);
  });

  it('Scenario 13: Corrected Arithmetic — Advance + Mixed Tender Exact (Registered)', () => {
    const res = calculatePaymentAllocation({
      invoiceTotal: 2600,
      tenders: [
        { method: 'CASH', amount: 800 },
        { method: 'CARD', amount: 800 },
      ],
      customerId: 'cust-1',
      previousCustomerBalance: -1000,
      customerCreditLimit: 0,
    });

    assert.equal(res.existingAdvanceApplied, 1000);
    assert.equal(res.actualTenderReceived, 1600);
    assert.equal(res.tenderAppliedToInvoice, 1600);
    assert.equal(res.invoiceAllocated, 2600);
    assert.equal(res.creditAllocated, 0);
    assert.equal(res.projectedCustomerBalance, 0);
    assert.equal(res.projectedOutstanding, 0);
    assert.equal(res.remainingAdvanceBalance, 0);
    assert.equal(res.paymentStatus, 'PAID');
    assert.equal(res.cashToDrawer, 800);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // PART 2: WALK-IN CUSTOMER SCENARIOS (14 to 20)
  // ───────────────────────────────────────────────────────────────────────────

  it('Scenario 14: Walk-in Exact Cash', () => {
    const res = calculatePaymentAllocation({
      invoiceTotal: 2600,
      tenders: [{ method: 'CASH', amount: 2600 }],
      customerId: null,
      previousCustomerBalance: 0,
    });

    assert.equal(res.invoiceAllocated, 2600);
    assert.equal(res.changeReturned, 0);
    assert.equal(res.cashToDrawer, 2600);
    assert.equal(res.projectedCustomerBalance, 0);
    assert.equal(res.paymentStatus, 'PAID');
  });

  it('Scenario 15: Walk-in Cash Excess With Change Returned', () => {
    const res = calculatePaymentAllocation({
      invoiceTotal: 2600,
      tenders: [{ method: 'CASH', amount: 5000 }],
      customerId: 'walk-in',
      previousCustomerBalance: 0,
    });

    assert.equal(res.tenderAppliedToInvoice, 2600);
    assert.equal(res.invoiceAllocated, 2600);
    assert.equal(res.changeReturned, 2400);
    assert.equal(res.cashToDrawer, 2600); // 5000 - 2400 = 2600
    assert.equal(res.customerAdvanceCreated, 0);
    assert.equal(res.paymentStatus, 'PAID');
  });

  it('Scenario 16: Walk-in Exact Digital', () => {
    const res = calculatePaymentAllocation({
      invoiceTotal: 2600,
      tenders: [{ method: 'CARD', amount: 2600 }],
      customerId: null,
      previousCustomerBalance: 0,
    });

    assert.equal(res.invoiceAllocated, 2600);
    assert.equal(res.changeReturned, 0);
    assert.equal(res.cashToDrawer, 0);
    assert.equal(res.paymentStatus, 'PAID');
  });

  it('Scenario 17: Walk-in Digital Excess Rejection', () => {
    assert.throws(
      () => {
        calculatePaymentAllocation({
          invoiceTotal: 2600,
          tenders: [{ method: 'CARD', amount: 3000 }],
          customerId: null,
          previousCustomerBalance: 0,
        });
      },
      (err: any) => {
        assert.equal(err instanceof PaymentDomainError, true);
        assert.equal(err.code, 'DIGITAL_OVERPAYMENT_PROHIBITED');
        return true;
      }
    );
  });

  it('Scenario 18: Walk-in Mixed Tender Exact', () => {
    const res = calculatePaymentAllocation({
      invoiceTotal: 2600,
      tenders: [
        { method: 'CASH', amount: 1000 },
        { method: 'CARD', amount: 1600 },
      ],
      customerId: null,
      previousCustomerBalance: 0,
    });

    assert.equal(res.invoiceAllocated, 2600);
    assert.equal(res.changeReturned, 0);
    assert.equal(res.cashToDrawer, 1000);
    assert.equal(res.paymentStatus, 'PAID');
  });

  it('Scenario 19: Walk-in Mixed Tender With Cash Excess', () => {
    const res = calculatePaymentAllocation({
      invoiceTotal: 2600,
      tenders: [
        { method: 'CASH', amount: 2000 },
        { method: 'CARD', amount: 1000 },
      ],
      customerId: null,
      previousCustomerBalance: 0,
    });

    assert.equal(res.nonCashTenderReceived, 1000);
    assert.equal(res.cashTenderReceived, 2000);
    assert.equal(res.invoiceAllocated, 2600);
    assert.equal(res.changeReturned, 400);
    assert.equal(res.cashToDrawer, 1600); // 2000 - 400
    assert.equal(res.paymentStatus, 'PAID');
  });

  it('Scenario 20: Walk-in Mixed Tender With Digital Excess Rejection', () => {
    assert.throws(
      () => {
        calculatePaymentAllocation({
          invoiceTotal: 2600,
          tenders: [
            { method: 'CASH', amount: 1000 },
            { method: 'CARD', amount: 3000 },
          ],
          customerId: null,
          previousCustomerBalance: 0,
        });
      },
      (err: any) => {
        assert.equal(err instanceof PaymentDomainError, true);
        assert.equal(err.code, 'DIGITAL_OVERPAYMENT_PROHIBITED');
        return true;
      }
    );
  });

  // ───────────────────────────────────────────────────────────────────────────
  // PART 3: CREDIT LIMIT BOUNDARIES & WALK-IN RESTRICTIONS (21 to 24)
  // ───────────────────────────────────────────────────────────────────────────

  it('Scenario 21: Credit Limit Exact Boundary Accepted', () => {
    const res = calculatePaymentAllocation({
      invoiceTotal: 2600,
      tenders: [],
      customerId: 'cust-1',
      previousCustomerBalance: 47400,
      customerCreditLimit: 50000,
    });

    assert.equal(res.projectedOutstanding, 50000);
    assert.equal(res.creditAllocated, 2600);
    assert.equal(res.paymentStatus, 'UNPAID');
  });

  it('Scenario 22: Credit Limit Exceeded Rejected', () => {
    assert.throws(
      () => {
        calculatePaymentAllocation({
          invoiceTotal: 2600,
          tenders: [],
          customerId: 'cust-1',
          previousCustomerBalance: 48000,
          customerCreditLimit: 50000,
        });
      },
      (err: any) => {
        assert.equal(err instanceof PaymentDomainError, true);
        assert.equal(err.code, 'CREDIT_LIMIT_EXCEEDED');
        return true;
      }
    );
  });

  it('Scenario 22B: Zero Credit Limit Rejects Any Unpaid Debt', () => {
    assert.throws(
      () => {
        calculatePaymentAllocation({
          invoiceTotal: 2600,
          tenders: [{ method: 'CASH', amount: 1000 }],
          customerId: 'cust-1',
          previousCustomerBalance: 0,
          customerCreditLimit: 0,
        });
      },
      (err: any) => {
        assert.equal(err instanceof PaymentDomainError, true);
        assert.equal(err.code, 'CREDIT_LIMIT_ZERO_EXCEEDED');
        return true;
      }
    );
  });

  it('Scenario 22C: Zero Credit Limit Rejects Pure Credit Sale', () => {
    assert.throws(
      () => {
        calculatePaymentAllocation({
          invoiceTotal: 2600,
          tenders: [],
          customerId: 'cust-1',
          previousCustomerBalance: 0,
          customerCreditLimit: 0,
        });
      },
      (err: any) => {
        assert.equal(err instanceof PaymentDomainError, true);
        assert.equal(err.code, 'CREDIT_LIMIT_ZERO_EXCEEDED');
        return true;
      }
    );
  });

  it('Scenario 22D: Zero Credit Limit Allows Fully Settled Sale', () => {
    const res = calculatePaymentAllocation({
      invoiceTotal: 2600,
      tenders: [{ method: 'CASH', amount: 2600 }],
      customerId: 'cust-1',
      previousCustomerBalance: 0,
      customerCreditLimit: 0,
    });
    assert.equal(res.projectedOutstanding, 0);
    assert.equal(res.paymentStatus, 'PAID');
  });

  it('Scenario 25_WalkIn: Walk-in Credit Attempt Rejected', () => {
    assert.throws(
      () => {
        calculatePaymentAllocation({
          invoiceTotal: 2600,
          tenders: [{ method: 'CASH', amount: 1000 }],
          customerId: null,
          previousCustomerBalance: 0,
        });
      },
      (err: any) => {
        assert.equal(err instanceof PaymentDomainError, true);
        assert.equal(err.code, 'WALK_IN_CREDIT_PROHIBITED');
        return true;
      }
    );
  });

  it('Scenario 26_WalkIn: Walk-in with Non-Zero Balance Data Rejected', () => {
    assert.throws(
      () => {
        calculatePaymentAllocation({
          invoiceTotal: 2600,
          tenders: [{ method: 'CASH', amount: 2600 }],
          customerId: null,
          previousCustomerBalance: 500,
        });
      },
      (err: any) => {
        assert.equal(err instanceof PaymentDomainError, true);
        assert.equal(err.code, 'WALK_IN_BALANCE_FORBIDDEN');
        return true;
      }
    );
  });

  // ───────────────────────────────────────────────────────────────────────────
  // PART 4: MULTI-COMPONENT REFUND ALLOCATION TESTS (Mandatory & Partials)
  // ───────────────────────────────────────────────────────────────────────────

  it('Mandatory Accounting Scenario: Full Return with Rs 1,000 Cash Refund', () => {
    // Original sale: Advance 1,000, Cash 1,000, Credit 600, Total 2,600
    // Requesting full refund (2,600) with Rs 1,000 cash payout
    const res = calculateRefundAllocation({
      refundAmount: 2600,
      originalInvoiceTotal: 2600,
      originalAdvanceApplied: 1000,
      originalCreditAllocated: 600,
      originalTenders: [{ method: 'CASH', amount: 1000 }],
      requestedPayout: { cashAmount: 1000 },
    });

    assert.equal(res.unpaidInvoiceCreditCancelled, 600);
    assert.equal(res.existingAdvanceRestored, 1000);
    assert.equal(res.cashRefunded, 1000);
    assert.equal(res.customerCreditIssued, 0);
    assert.equal(res.totalRefundAllocated, 2600);
    assert.equal(res.remainingEligibleInvoiceBalance, 0);

    // Customer balance calculation:
    // Before refund: +600 (Debit).
    // Reversal of credit debt: -600.
    // Restoration of advance: -1000 (Credit).
    // Cash returned: 1,000 handed back in physical cash.
    // Final customer balance = +600 - 600 - 1000 = -1000 (Exact Rs 1,000 advance credit!).
    const finalCustomerBalance = 600 - res.unpaidInvoiceCreditCancelled - res.existingAdvanceRestored;
    assert.equal(finalCustomerBalance, -1000);
  });

  it('Mandatory Accounting Scenario Alternative: Full Return to Customer Credit (0 Cash Out)', () => {
    // Original sale: Advance 1,000, Cash 1,000, Credit 600, Total 2,600
    // Customer prefers keeping the cash-funded portion as store credit
    const res = calculateRefundAllocation({
      refundAmount: 2600,
      originalInvoiceTotal: 2600,
      originalAdvanceApplied: 1000,
      originalCreditAllocated: 600,
      originalTenders: [{ method: 'CASH', amount: 1000 }],
      requestedPayout: { customerCreditAmount: 1000 },
    });

    assert.equal(res.unpaidInvoiceCreditCancelled, 600);
    assert.equal(res.existingAdvanceRestored, 1000);
    assert.equal(res.cashRefunded, 0);
    assert.equal(res.customerCreditIssued, 1000);
    assert.equal(res.totalRefundAllocated, 2600);

    // Final customer balance: +600 - 600 - 1000 - 1000 = -2000 (Rs 2,000 total advance credit)
    const finalCustomerBalance = 600 - res.unpaidInvoiceCreditCancelled - res.existingAdvanceRestored - res.customerCreditIssued;
    assert.equal(finalCustomerBalance, -2000);
  });

  it('Partial Refund 1: Partial Cash Refund Capped at Original Cash Tender', () => {
    // Original sale: Cash 2,600. Refund 1,000 cash.
    const res = calculateRefundAllocation({
      refundAmount: 1000,
      originalInvoiceTotal: 2600,
      originalAdvanceApplied: 0,
      originalCreditAllocated: 0,
      originalTenders: [{ method: 'CASH', amount: 2600 }],
      requestedPayout: { cashAmount: 1000 },
    });

    assert.equal(res.cashRefunded, 1000);
    assert.equal(res.totalRefundAllocated, 1000);
    assert.equal(res.remainingEligibleInvoiceBalance, 1600);
  });

  it('Partial Refund 2: Partial Digital Refund Capped by Original Digital Method', () => {
    // Original sale: Card 1,600, Cash 1,000. Refund 1,000 via Card.
    const res = calculateRefundAllocation({
      refundAmount: 1000,
      originalInvoiceTotal: 2600,
      originalAdvanceApplied: 0,
      originalCreditAllocated: 0,
      originalTenders: [
        { method: 'CASH', amount: 1000 },
        { method: 'CARD', amount: 1600 },
      ],
      requestedPayout: { digitalPayouts: { CARD: 1000 } },
    });

    assert.equal(res.digitalRefundedByMethod.CARD, 1000);
    assert.equal(res.cashRefunded, 0);
    assert.equal(res.totalRefundAllocated, 1000);
  });

  it('Partial Refund 3: Partial Cancellation of Unpaid Invoice Debt', () => {
    // Original sale: Unpaid credit 1,600, Cash 1,000. Customer returns 1,000 item.
    const res = calculateRefundAllocation({
      refundAmount: 1000,
      originalInvoiceTotal: 2600,
      originalAdvanceApplied: 0,
      originalCreditAllocated: 1600,
      originalTenders: [{ method: 'CASH', amount: 1000 }],
    });

    assert.equal(res.unpaidInvoiceCreditCancelled, 1000);
    assert.equal(res.cashRefunded, 0);
    assert.equal(res.customerCreditIssued, 0);
    assert.equal(res.totalRefundAllocated, 1000);
  });

  it('Partial Refund 4: Partial Restoration of Advance', () => {
    // Original sale: Advance applied 2,600. Return 1,000 item.
    const res = calculateRefundAllocation({
      refundAmount: 1000,
      originalInvoiceTotal: 2600,
      originalAdvanceApplied: 2600,
      originalCreditAllocated: 0,
      originalTenders: [],
    });

    assert.equal(res.existingAdvanceRestored, 1000);
    assert.equal(res.totalRefundAllocated, 1000);
  });

  it('Partial Refund 5: Multiple Partial Refunds Followed by Full Settlement', () => {
    // Invoice 2,600 (Cash 2,600).
    // Step 1: Refund 1,000 cash
    const res1 = calculateRefundAllocation({
      refundAmount: 1000,
      originalInvoiceTotal: 2600,
      originalAdvanceApplied: 0,
      originalCreditAllocated: 0,
      originalTenders: [{ method: 'CASH', amount: 2600 }],
      requestedPayout: { cashAmount: 1000 },
    });
    assert.equal(res1.cashRefunded, 1000);

    // Step 2: Refund remaining 1,600 cash
    const res2 = calculateRefundAllocation({
      refundAmount: 1600,
      originalInvoiceTotal: 2600,
      originalAdvanceApplied: 0,
      originalCreditAllocated: 0,
      originalTenders: [{ method: 'CASH', amount: 2600 }],
      priorRefunds: { cashRefunded: 1000 },
      requestedPayout: { cashAmount: 1600 },
    });
    assert.equal(res2.cashRefunded, 1600);
    assert.equal(res2.remainingEligibleInvoiceBalance, 0);

    // Step 3: Attempting 3rd refund when 2,600 already refunded
    assert.throws(
      () => {
        calculateRefundAllocation({
          refundAmount: 100,
          originalInvoiceTotal: 2600,
          originalAdvanceApplied: 0,
          originalCreditAllocated: 0,
          originalTenders: [{ method: 'CASH', amount: 2600 }],
          priorRefunds: { cashRefunded: 2600 },
          requestedPayout: { cashAmount: 100 },
        });
      },
      (err: any) => err.code === 'REFUND_EXCEEDS_INVOICE'
    );
  });

  it('Partial Refund 6: Reject Attempt to Refund Beyond Original Cash Tender', () => {
    // Original sale: Cash 1,000, Card 1,600. Requesting 1,500 cash refund!
    assert.throws(
      () => {
        calculateRefundAllocation({
          refundAmount: 1500,
          originalInvoiceTotal: 2600,
          originalAdvanceApplied: 0,
          originalCreditAllocated: 0,
          originalTenders: [
            { method: 'CASH', amount: 1000 },
            { method: 'CARD', amount: 1600 },
          ],
          requestedPayout: { cashAmount: 1500 },
        });
      },
      (err: any) => err.code === 'CASH_REFUND_EXCEEDS_TENDER'
    );
  });

  it('Partial Refund 7: Reject Attempt to Refund Beyond Original Digital Funding', () => {
    // Original sale: Cash 1,000, Card 1,600. Requesting 2,000 card refund!
    assert.throws(
      () => {
        calculateRefundAllocation({
          refundAmount: 2000,
          originalInvoiceTotal: 2600,
          originalAdvanceApplied: 0,
          originalCreditAllocated: 0,
          originalTenders: [
            { method: 'CASH', amount: 1000 },
            { method: 'CARD', amount: 1600 },
          ],
          requestedPayout: { digitalPayouts: { CARD: 2000 } },
        });
      },
      (err: any) => err.code === 'DIGITAL_REFUND_EXCEEDS_TENDER'
    );
  });

  it('Partial Refund 8: Mixed Cash, Digital, and Customer-Credit Refund', () => {
    // Original sale: Cash 1,000, Card 1,000, Advance 600. Return 2,000 item.
    // Payout request: Cash 500, Card 500, Customer Credit 400 (Advance auto-restores 600)
    const res = calculateRefundAllocation({
      refundAmount: 2000,
      originalInvoiceTotal: 2600,
      originalAdvanceApplied: 600,
      originalCreditAllocated: 0,
      originalTenders: [
        { method: 'CASH', amount: 1000 },
        { method: 'CARD', amount: 1000 },
      ],
      requestedPayout: {
        cashAmount: 500,
        digitalPayouts: { CARD: 500 },
        customerCreditAmount: 400,
      },
    });

    assert.equal(res.existingAdvanceRestored, 600);
    assert.equal(res.cashRefunded, 500);
    assert.equal(res.digitalRefundedByMethod.CARD, 500);
    assert.equal(res.customerCreditIssued, 400);
    assert.equal(res.totalRefundAllocated, 2000);
    assert.equal(res.remainingEligibleInvoiceBalance, 600);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // PART 5: CHECKED INTEGER ARITHMETIC & OVERFLOW PROTECTION
  // ───────────────────────────────────────────────────────────────────────────

  it('Checked Addition Rejects Integer Overflow (> MAX_SAFE_INTEGER)', () => {
    assert.throws(
      () => {
        safeAdd(Number.MAX_SAFE_INTEGER, 1, 'Overflow addition');
      },
      (err: any) => err.code === 'INTEGER_OVERFLOW'
    );
  });

  it('Checked Subtraction Rejects Underflow (< MIN_SAFE_INTEGER)', () => {
    assert.throws(
      () => {
        safeSub(-Number.MAX_SAFE_INTEGER, 1, 'Underflow subtraction', true);
      },
      (err: any) => err.code === 'INTEGER_UNDERFLOW'
    );
  });

  it('Rejects Unsafe Integer in Payment Allocation Input', () => {
    assert.throws(
      () => {
        calculatePaymentAllocation({
          invoiceTotal: Number.MAX_SAFE_INTEGER + 1,
          tenders: [{ method: 'CASH', amount: 2600 }],
          customerId: null,
          previousCustomerBalance: 0,
        });
      },
      (err: any) => err.code === 'UNSAFE_INTEGER'
    );
  });

  it('Rejects Floating-point Fractional PKR Amounts', () => {
    assert.throws(
      () => {
        calculatePaymentAllocation({
          invoiceTotal: 2600.75,
          tenders: [{ method: 'CASH', amount: 2600.75 }],
          customerId: null,
          previousCustomerBalance: 0,
        });
      },
      (err: any) => err.code === 'UNSAFE_INTEGER'
    );
  });

  it('Invariance Test: Tender allocated + credit allocated equals invoice total', () => {
    const res = calculatePaymentAllocation({
      invoiceTotal: 3450,
      tenders: [{ method: 'CASH', amount: 2000 }],
      customerId: 'cust-1',
      previousCustomerBalance: 0,
      customerCreditLimit: 10000,
    });

    assert.equal(res.invoiceAllocated + res.creditAllocated, res.invoiceTotal);
  });

  it('Invariance Test: Drawer cash equals cash tender minus change returned', () => {
    const res = calculatePaymentAllocation({
      invoiceTotal: 2300,
      tenders: [{ method: 'CASH', amount: 5000 }],
      customerId: null,
      previousCustomerBalance: 0,
    });

    assert.equal(res.cashToDrawer, res.cashTenderReceived - res.changeReturned);
    assert.equal(res.cashToDrawer, 2300);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // PART 6: PHASE 3A.2.3 SOURCE-ATTRIBUTED REFUND CONSERVATION & FIFO TESTS
  // ───────────────────────────────────────────────────────────────────────────

  it('Mandatory Regression A: Cash-to-credit sequential refund rejects over-allocation', () => {
    // Original sale: CASH Rs 1,000, Total invoice Rs 2,000 (Rs 1,000 credit debt).
    // Refund 1: Rs 600 customer credit funded from cash.
    const res1 = calculateRefundAllocation({
      refundAmount: 600,
      originalInvoiceTotal: 2000,
      originalAdvanceApplied: 0,
      originalCreditAllocated: 1000,
      originalTenders: [{ id: 'line_cash_1', method: 'CASH', amount: 1000 }],
      priorRefunds: { unpaidCreditCancelled: 1000 }, // Credit debt already handled
      requestedPayout: { customerCreditAmount: 600 },
    });

    assert.equal(res1.customerCreditIssued, 600);
    assert.equal(res1.cashRefunded, 0);
    assert.equal(res1.tenderLineAllocations[0].currentCreditFunded, 600);
    assert.equal(res1.tenderLineAllocations[0].remainingEligibleAmount, 400);

    // Refund 2: Rs 500 physical cash requested. Invoice remaining capacity is 400.
    // If user returns Rs 400 item and requests Rs 500 cash payout:
    assert.throws(
      () => {
        calculateRefundAllocation({
          refundAmount: 400,
          originalInvoiceTotal: 2000,
          originalAdvanceApplied: 0,
          originalCreditAllocated: 1000,
          originalTenders: [{ id: 'line_cash_1', method: 'CASH', amount: 1000 }],
          priorRefunds: {
            unpaidCreditCancelled: 1000,
            customerCreditByLine: { line_cash_1: 600 },
            customerCreditIssued: 600,
          },
          requestedPayout: { cashAmount: 500 }, // Exceeds remaining 400 cash funding!
        });
      },
      (err: any) => err.code === 'CASH_REFUND_EXCEEDS_TENDER'
    );
  });

  it('Mandatory Regression B: Digital-to-credit sequential refund rejects over-allocation', () => {
    // Original sale: EASYPAISA Rs 1,000, Total invoice Rs 2,000 (Rs 1,000 credit debt).
    // Refund 1: Rs 600 customer credit funded from EasyPaisa.
    const res1 = calculateRefundAllocation({
      refundAmount: 600,
      originalInvoiceTotal: 2000,
      originalAdvanceApplied: 0,
      originalCreditAllocated: 1000,
      originalTenders: [{ id: 'line_ep_1', method: 'EASYPAISA', amount: 1000 }],
      priorRefunds: { unpaidCreditCancelled: 1000 },
      requestedPayout: { customerCreditAmount: 600 },
    });

    assert.equal(res1.customerCreditIssued, 600);
    assert.equal(res1.tenderLineAllocations[0].currentCreditFunded, 600);
    assert.equal(res1.tenderLineAllocations[0].remainingEligibleAmount, 400);

    // Refund 2: Rs 500 EasyPaisa payout requested when refunding Rs 400 item. Only Rs 400 funding remains!
    assert.throws(
      () => {
        calculateRefundAllocation({
          refundAmount: 400,
          originalInvoiceTotal: 2000,
          originalAdvanceApplied: 0,
          originalCreditAllocated: 1000,
          originalTenders: [{ id: 'line_ep_1', method: 'EASYPAISA', amount: 1000 }],
          priorRefunds: {
            unpaidCreditCancelled: 1000,
            customerCreditByLine: { line_ep_1: 600 },
            customerCreditIssued: 600,
          },
          requestedPayout: { digitalPayouts: { EASYPAISA: 500 } },
        });
      },
      (err: any) => err.code === 'DIGITAL_REFUND_EXCEEDS_TENDER'
    );
  });

  it('Mandatory Regression C: Multiple digital methods with FIFO credit allocation', () => {
    // Original tenders: EASYPAISA Rs 1,000, JAZZCASH Rs 500 (Invoice Rs 1,500).
    // Refund 1: Rs 600 customer credit.
    // Expected FIFO source allocation: First line (EASYPAISA) gets Rs 600.
    const res1 = calculateRefundAllocation({
      refundAmount: 600,
      originalInvoiceTotal: 1500,
      originalAdvanceApplied: 0,
      originalCreditAllocated: 0,
      originalTenders: [
        { id: 'ep_line', method: 'EASYPAISA', amount: 1000 },
        { id: 'jc_line', method: 'JAZZCASH', amount: 500 },
      ],
      requestedPayout: { customerCreditAmount: 600 },
    });

    assert.equal(res1.customerCreditIssued, 600);
    assert.equal(res1.tenderLineAllocations[0].currentCreditFunded, 600);
    assert.equal(res1.tenderLineAllocations[0].remainingEligibleAmount, 400);
    assert.equal(res1.tenderLineAllocations[1].currentCreditFunded, 0);
    assert.equal(res1.tenderLineAllocations[1].remainingEligibleAmount, 500);

    // Refund 2: Rs 500 EasyPaisa payout requested.
    // Should reject because only Rs 400 remains on EasyPaisa line!
    assert.throws(
      () => {
        calculateRefundAllocation({
          refundAmount: 500,
          originalInvoiceTotal: 1500,
          originalAdvanceApplied: 0,
          originalCreditAllocated: 0,
          originalTenders: [
            { id: 'ep_line', method: 'EASYPAISA', amount: 1000 },
            { id: 'jc_line', method: 'JAZZCASH', amount: 500 },
          ],
          priorRefunds: {
            customerCreditByLine: { ep_line: 600 },
            customerCreditIssued: 600,
          },
          requestedPayout: { digitalPayouts: { EASYPAISA: 500 } },
        });
      },
      (err: any) => err.code === 'DIGITAL_REFUND_EXCEEDS_TENDER'
    );

    // Refund 3: Rs 500 JazzCash payout requested.
    // Should accept because JazzCash funding (500) has not been consumed!
    const res3 = calculateRefundAllocation({
      refundAmount: 500,
      originalInvoiceTotal: 1500,
      originalAdvanceApplied: 0,
      originalCreditAllocated: 0,
      originalTenders: [
        { id: 'ep_line', method: 'EASYPAISA', amount: 1000 },
        { id: 'jc_line', method: 'JAZZCASH', amount: 500 },
      ],
      priorRefunds: {
        customerCreditByLine: { ep_line: 600 },
        customerCreditIssued: 600,
      },
      requestedPayout: { digitalPayouts: { JAZZCASH: 500 } },
    });

    assert.equal(res3.digitalRefundedByMethod.JAZZCASH, 500);
    assert.equal(res3.tenderLineAllocations[1].currentDirectRefunded, 500);
    assert.equal(res3.tenderLineAllocations[1].remainingEligibleAmount, 0);
  });

  it('Mandatory Regression D: Mixed tender sequence with FIFO customer-credit allocation', () => {
    // Original tender sequence:
    // 1. CASH Rs 500
    // 2. EASYPAISA Rs 700
    // 3. CASH Rs 300
    // Total invoice: Rs 1,500.
    // Customer credit requested: Rs 900.
    const res = calculateRefundAllocation({
      refundAmount: 900,
      originalInvoiceTotal: 1500,
      originalAdvanceApplied: 0,
      originalCreditAllocated: 0,
      originalTenders: [
        { id: 'line_cash_1', method: 'CASH', amount: 500 },
        { id: 'line_ep_2', method: 'EASYPAISA', amount: 700 },
        { id: 'line_cash_3', method: 'CASH', amount: 300 },
      ],
      requestedPayout: { customerCreditAmount: 900 },
    });

    assert.equal(res.customerCreditIssued, 900);
    // Line 1: CASH 500 fully consumed by credit
    assert.equal(res.tenderLineAllocations[0].currentCreditFunded, 500);
    assert.equal(res.tenderLineAllocations[0].remainingEligibleAmount, 0);

    // Line 2: EASYPAISA 700 consumed 400 by credit (remaining 300)
    assert.equal(res.tenderLineAllocations[1].currentCreditFunded, 400);
    assert.equal(res.tenderLineAllocations[1].remainingEligibleAmount, 300);

    // Line 3: CASH 300 unconsumed (remaining 300)
    assert.equal(res.tenderLineAllocations[2].currentCreditFunded, 0);
    assert.equal(res.tenderLineAllocations[2].remainingEligibleAmount, 300);

    // Subsequent direct cash refund of Rs 300 must succeed using line 3!
    const resCashDirect = calculateRefundAllocation({
      refundAmount: 300,
      originalInvoiceTotal: 1500,
      originalAdvanceApplied: 0,
      originalCreditAllocated: 0,
      originalTenders: [
        { id: 'line_cash_1', method: 'CASH', amount: 500 },
        { id: 'line_ep_2', method: 'EASYPAISA', amount: 700 },
        { id: 'line_cash_3', method: 'CASH', amount: 300 },
      ],
      priorRefunds: {
        customerCreditByLine: { line_cash_1: 500, line_ep_2: 400 },
        customerCreditIssued: 900,
      },
      requestedPayout: { cashAmount: 300 },
    });
    assert.equal(resCashDirect.cashRefunded, 300);
    assert.equal(resCashDirect.tenderLineAllocations[2].currentDirectRefunded, 300);
    assert.equal(resCashDirect.tenderLineAllocations[2].remainingEligibleAmount, 0);

    // Subsequent direct cash refund of Rs 350 must reject because only Rs 300 cash remains!
    assert.throws(
      () => {
        calculateRefundAllocation({
          refundAmount: 350,
          originalInvoiceTotal: 1500,
          originalAdvanceApplied: 0,
          originalCreditAllocated: 0,
          originalTenders: [
            { id: 'line_cash_1', method: 'CASH', amount: 500 },
            { id: 'line_ep_2', method: 'EASYPAISA', amount: 700 },
            { id: 'line_cash_3', method: 'CASH', amount: 300 },
          ],
          priorRefunds: {
            customerCreditByLine: { line_cash_1: 500, line_ep_2: 400 },
            customerCreditIssued: 900,
          },
          requestedPayout: { cashAmount: 350 },
        });
      },
      (err: any) => err.code === 'CASH_REFUND_EXCEEDS_TENDER'
    );
  });

  it('Mandatory Regression E: Direct payout priority over customer credit within one refund', () => {
    // Original tenders: CASH Rs 1,000, EASYPAISA Rs 1,000 (Invoice Rs 2,000).
    // One refund requests: CASH payout Rs 700, Customer credit Rs 800. Total refund: Rs 1,500.
    const res = calculateRefundAllocation({
      refundAmount: 1500,
      originalInvoiceTotal: 2000,
      originalAdvanceApplied: 0,
      originalCreditAllocated: 0,
      originalTenders: [
        { id: 'line_cash', method: 'CASH', amount: 1000 },
        { id: 'line_ep', method: 'EASYPAISA', amount: 1000 },
      ],
      requestedPayout: {
        cashAmount: 700,
        customerCreditAmount: 800,
      },
    });

    assert.equal(res.cashRefunded, 700);
    assert.equal(res.customerCreditIssued, 800);
    assert.equal(res.totalRefundAllocated, 1500);

    // Cash line: Rs 700 direct payout reserved first. Remaining Rs 300 consumed by credit!
    assert.equal(res.tenderLineAllocations[0].currentDirectRefunded, 700);
    assert.equal(res.tenderLineAllocations[0].currentCreditFunded, 300);
    assert.equal(res.tenderLineAllocations[0].remainingEligibleAmount, 0);

    // EasyPaisa line: Remaining Rs 500 of credit consumed here (800 - 300 = 500). Remaining capacity = 500.
    assert.equal(res.tenderLineAllocations[1].currentDirectRefunded, 0);
    assert.equal(res.tenderLineAllocations[1].currentCreditFunded, 500);
    assert.equal(res.tenderLineAllocations[1].remainingEligibleAmount, 500);
  });

  it('Mandatory Regression F: Sequential advance restoration cannot exceed original advance', () => {
    // Original advance applied: Rs 1,000.
    // Refund 1: Rs 700 return
    const res1 = calculateRefundAllocation({
      refundAmount: 700,
      originalInvoiceTotal: 1000,
      originalAdvanceApplied: 1000,
      originalCreditAllocated: 0,
      originalTenders: [],
    });
    assert.equal(res1.existingAdvanceRestored, 700);

    // Refund 2: Rs 500 return with prior advance restored 700.
    // Must reject because 700 + 500 = 1,200 > 1,000!
    assert.throws(
      () => {
        calculateRefundAllocation({
          refundAmount: 500,
          originalInvoiceTotal: 1000,
          originalAdvanceApplied: 1000,
          originalCreditAllocated: 0,
          originalTenders: [],
          priorRefunds: { advanceRestored: 700 },
        });
      },
      (err: any) => err.code === 'REFUND_EXCEEDS_INVOICE'
    );
  });

  it('Mandatory Regression G: Sequential unpaid debt cancellation cannot exceed original debt', () => {
    // Original credit debt allocated: Rs 600.
    // Refund 1: Rs 400 return
    const res1 = calculateRefundAllocation({
      refundAmount: 400,
      originalInvoiceTotal: 600,
      originalAdvanceApplied: 0,
      originalCreditAllocated: 600,
      originalTenders: [],
    });
    assert.equal(res1.unpaidInvoiceCreditCancelled, 400);

    // Refund 2: Rs 300 return with prior debt cancelled 400.
    // Must reject because 400 + 300 = 700 > 600!
    assert.throws(
      () => {
        calculateRefundAllocation({
          refundAmount: 300,
          originalInvoiceTotal: 600,
          originalAdvanceApplied: 0,
          originalCreditAllocated: 600,
          originalTenders: [],
          priorRefunds: { unpaidCreditCancelled: 400 },
        });
      },
      (err: any) => err.code === 'REFUND_EXCEEDS_INVOICE'
    );
  });

  it('Mandatory Regression H: Mixed original funding sequential conservation', () => {
    // Original invoice: Rs 3,100
    // Advance: Rs 1,000, Cash: Rs 1,000, EasyPaisa: Rs 500, Unpaid credit: Rs 600
    const tenders = [
      { id: 't_cash', method: 'CASH' as const, amount: 1000 },
      { id: 't_ep', method: 'EASYPAISA' as const, amount: 500 },
    ];

    // Step 1: Return Rs 800 item. Cancels Rs 600 debt + restores Rs 200 advance.
    const res1 = calculateRefundAllocation({
      refundAmount: 800,
      originalInvoiceTotal: 3100,
      originalAdvanceApplied: 1000,
      originalCreditAllocated: 600,
      originalTenders: tenders,
    });
    assert.equal(res1.unpaidInvoiceCreditCancelled, 600);
    assert.equal(res1.existingAdvanceRestored, 200);
    assert.equal(res1.cashRefunded, 0);
    assert.equal(res1.customerCreditIssued, 0);

    // Step 2: Return Rs 1,500 item.
    // Remaining debt to cancel: 0. Remaining advance to restore: 1,000 - 200 = 800.
    // Remaining to allocate: 1,500 - 800 = 700.
    // Requested payout: Cash Rs 500, Customer credit Rs 200.
    const res2 = calculateRefundAllocation({
      refundAmount: 1500,
      originalInvoiceTotal: 3100,
      originalAdvanceApplied: 1000,
      originalCreditAllocated: 600,
      originalTenders: tenders,
      priorRefunds: {
        unpaidCreditCancelled: 600,
        advanceRestored: 200,
      },
      requestedPayout: {
        cashAmount: 500,
        customerCreditAmount: 200,
      },
    });

    assert.equal(res2.existingAdvanceRestored, 800);
    assert.equal(res2.cashRefunded, 500);
    assert.equal(res2.customerCreditIssued, 200);
    // Cash line: 500 direct + 200 credit = 700 consumed. Remaining = 300.
    assert.equal(res2.tenderLineAllocations[0].currentDirectRefunded, 500);
    assert.equal(res2.tenderLineAllocations[0].currentCreditFunded, 200);
    assert.equal(res2.tenderLineAllocations[0].remainingEligibleAmount, 300);
    // EasyPaisa line: 0 consumed. Remaining = 500.
    assert.equal(res2.tenderLineAllocations[1].remainingEligibleAmount, 500);

    // Step 3: Return remaining Rs 800 item (3,100 - 800 - 1,500 = 800).
    // Requested payout: Cash Rs 300, EasyPaisa Rs 500.
    const res3 = calculateRefundAllocation({
      refundAmount: 800,
      originalInvoiceTotal: 3100,
      originalAdvanceApplied: 1000,
      originalCreditAllocated: 600,
      originalTenders: tenders,
      priorRefunds: {
        unpaidCreditCancelled: 600,
        advanceRestored: 1000,
        directRefundByLine: { t_cash: 500 },
        customerCreditByLine: { t_cash: 200 },
        cashRefunded: 500,
        customerCreditIssued: 200,
      },
      requestedPayout: {
        cashAmount: 300,
        digitalPayouts: { EASYPAISA: 500 },
      },
    });

    assert.equal(res3.cashRefunded, 300);
    assert.equal(res3.digitalRefundedByMethod.EASYPAISA, 500);
    assert.equal(res3.remainingEligibleInvoiceBalance, 0);
    assert.equal(res3.tenderLineAllocations[0].remainingEligibleAmount, 0);
    assert.equal(res3.tenderLineAllocations[1].remainingEligibleAmount, 0);
  });

  it('Mandatory Regression I: Rejects invalid refund history and corrupt line records', () => {
    const tenders = [{ id: 'line_1', method: 'CASH' as const, amount: 1000 }];

    // 1. Unknown line ID in prior direct refunds
    assert.throws(
      () => {
        calculateRefundAllocation({
          refundAmount: 100,
          originalInvoiceTotal: 1000,
          originalAdvanceApplied: 0,
          originalCreditAllocated: 0,
          originalTenders: tenders,
          priorRefunds: { directRefundByLine: { phantom_line: 100 } },
        });
      },
      (err: any) => err.code === 'UNKNOWN_TENDER_LINE_ID'
    );

    // 2. Prior line refund exceeds original tender amount
    assert.throws(
      () => {
        calculateRefundAllocation({
          refundAmount: 100,
          originalInvoiceTotal: 1000,
          originalAdvanceApplied: 0,
          originalCreditAllocated: 0,
          originalTenders: tenders,
          priorRefunds: { directRefundByLine: { line_1: 1500 } },
        });
      },
      (err: any) => err.code === 'PRIOR_LINE_REFUND_EXCEEDS_ORIGINAL'
    );

    // 3. Aggregate prior credit inconsistent with detailed line credits
    assert.throws(
      () => {
        calculateRefundAllocation({
          refundAmount: 100,
          originalInvoiceTotal: 1000,
          originalAdvanceApplied: 0,
          originalCreditAllocated: 0,
          originalTenders: tenders,
          priorRefunds: {
            customerCreditByLine: { line_1: 200 },
            customerCreditIssued: 999, // Mismatch!
          },
        });
      },
      (err: any) => err.code === 'PRIOR_CREDIT_AGGREGATE_MISMATCH'
    );

    // 4. Duplicate tender line IDs
    assert.throws(
      () => {
        calculateRefundAllocation({
          refundAmount: 100,
          originalInvoiceTotal: 2000,
          originalAdvanceApplied: 0,
          originalCreditAllocated: 0,
          originalTenders: [
            { id: 'dup_id', method: 'CASH', amount: 1000 },
            { id: 'dup_id', method: 'EASYPAISA', amount: 1000 },
          ],
        });
      },
      (err: any) => err.code === 'DUPLICATE_TENDER_LINE_ID'
    );
  });

  // ───────────────────────────────────────────────────────────────────────────
  // PART 7: PHASE 3A.2.5 M-01 LEGACY REFUND AGGREGATE CONSISTENCY TESTS
  // ───────────────────────────────────────────────────────────────────────────

  it('Phase 3A.2.5 Test A: Cash aggregate mismatch rejection', () => {
    // Detailed line cash direct refund is 700, but legacy cashRefunded is 600.
    const tenders = [{ id: 'c1', method: 'CASH' as const, amount: 1000 }];
    assert.throws(
      () => {
        calculateRefundAllocation({
          refundAmount: 100,
          originalInvoiceTotal: 1000,
          originalAdvanceApplied: 0,
          originalCreditAllocated: 0,
          originalTenders: tenders,
          priorRefunds: {
            directRefundByLine: { c1: 700 },
            cashRefunded: 600, // Contradictory mismatch!
          },
        });
      },
      (err: any) => err.code === 'PRIOR_CASH_AGGREGATE_MISMATCH'
    );
  });

  it('Phase 3A.2.5 Test B: Cash aggregate match acceptance', () => {
    // Detailed line cash direct refund is 700 and legacy cashRefunded is 700.
    const tenders = [{ id: 'c1', method: 'CASH' as const, amount: 1000 }];
    const res = calculateRefundAllocation({
      refundAmount: 100,
      originalInvoiceTotal: 1000,
      originalAdvanceApplied: 0,
      originalCreditAllocated: 0,
      originalTenders: tenders,
      priorRefunds: {
        directRefundByLine: { c1: 700 },
        cashRefunded: 700,
      },
      requestedPayout: { cashAmount: 100 },
    });
    assert.equal(res.cashRefunded, 100);
    assert.equal(res.tenderLineAllocations[0].remainingEligibleAmount, 200);
  });

  it('Phase 3A.2.5 Test C: Digital aggregate mismatch rejection', () => {
    // Detailed EasyPaisa is 500, but legacy EasyPaisa aggregate is 400.
    const tenders = [{ id: 'ep1', method: 'EASYPAISA' as const, amount: 1000 }];
    assert.throws(
      () => {
        calculateRefundAllocation({
          refundAmount: 100,
          originalInvoiceTotal: 1000,
          originalAdvanceApplied: 0,
          originalCreditAllocated: 0,
          originalTenders: tenders,
          priorRefunds: {
            directRefundByLine: { ep1: 500 },
            digitalRefundedByMethod: { EASYPAISA: 400 },
          },
        });
      },
      (err: any) => err.code === 'PRIOR_DIGITAL_AGGREGATE_MISMATCH'
    );
  });

  it('Phase 3A.2.5 Test D: Digital aggregate match acceptance', () => {
    // Detailed EasyPaisa is 500 and legacy EasyPaisa aggregate is 500.
    const tenders = [{ id: 'ep1', method: 'EASYPAISA' as const, amount: 1000 }];
    const res = calculateRefundAllocation({
      refundAmount: 100,
      originalInvoiceTotal: 1000,
      originalAdvanceApplied: 0,
      originalCreditAllocated: 0,
      originalTenders: tenders,
      priorRefunds: {
        directRefundByLine: { ep1: 500 },
        digitalRefundedByMethod: { EASYPAISA: 500 },
      },
      requestedPayout: { digitalPayouts: { EASYPAISA: 100 } },
    });
    assert.equal(res.digitalRefundedByMethod.EASYPAISA, 100);
    assert.equal(res.tenderLineAllocations[0].remainingEligibleAmount, 400);
  });

  it('Phase 3A.2.5 Test E: Multiple digital methods independent reconciliation', () => {
    const tenders = [
      { id: 'ep1', method: 'EASYPAISA' as const, amount: 1000 },
      { id: 'jc1', method: 'JAZZCASH' as const, amount: 800 },
    ];

    // Subtest E1: Both match -> Accepted
    const res = calculateRefundAllocation({
      refundAmount: 100,
      originalInvoiceTotal: 1800,
      originalAdvanceApplied: 0,
      originalCreditAllocated: 0,
      originalTenders: tenders,
      priorRefunds: {
        directRefundByLine: { ep1: 400, jc1: 300 },
        digitalRefundedByMethod: { EASYPAISA: 400, JAZZCASH: 300 },
      },
      requestedPayout: { digitalPayouts: { EASYPAISA: 100 } },
    });
    assert.equal(res.digitalRefundedByMethod.EASYPAISA, 100);

    // Subtest E2: JazzCash differs -> Rejection
    assert.throws(
      () => {
        calculateRefundAllocation({
          refundAmount: 100,
          originalInvoiceTotal: 1800,
          originalAdvanceApplied: 0,
          originalCreditAllocated: 0,
          originalTenders: tenders,
          priorRefunds: {
            directRefundByLine: { ep1: 400, jc1: 300 },
            digitalRefundedByMethod: { EASYPAISA: 400, JAZZCASH: 299 },
          },
        });
      },
      (err: any) => err.code === 'PRIOR_DIGITAL_AGGREGATE_MISMATCH'
    );
  });

  it('Phase 3A.2.5 Test F: Mixed cash and digital contradiction rejection', () => {
    const tenders = [
      { id: 'c1', method: 'CASH' as const, amount: 1000 },
      { id: 'ep1', method: 'EASYPAISA' as const, amount: 1000 },
    ];

    // Cash matches (500), but EasyPaisa differs (detailed 300 vs legacy 350)
    assert.throws(
      () => {
        calculateRefundAllocation({
          refundAmount: 100,
          originalInvoiceTotal: 2000,
          originalAdvanceApplied: 0,
          originalCreditAllocated: 0,
          originalTenders: tenders,
          priorRefunds: {
            directRefundByLine: { c1: 500, ep1: 300 },
            cashRefunded: 500, // Matches
            digitalRefundedByMethod: { EASYPAISA: 350 }, // Mismatches!
          },
        });
      },
      (err: any) => err.code === 'PRIOR_DIGITAL_AGGREGATE_MISMATCH'
    );
  });

  it('Phase 3A.2.5 Test G: Omitted legacy aggregates with detailed maps preserved', () => {
    // Detailed maps present, legacy cash/digital aggregates omitted -> Accepted
    const tenders = [{ id: 'c1', method: 'CASH' as const, amount: 1000 }];
    const res = calculateRefundAllocation({
      refundAmount: 200,
      originalInvoiceTotal: 1000,
      originalAdvanceApplied: 0,
      originalCreditAllocated: 0,
      originalTenders: tenders,
      priorRefunds: {
        directRefundByLine: { c1: 500 },
      },
      requestedPayout: { cashAmount: 200 },
    });
    assert.equal(res.cashRefunded, 200);
    assert.equal(res.tenderLineAllocations[0].remainingEligibleAmount, 300);
  });

  it('Phase 3A.2.5 Test H: Customer-credit compatibility when agreed', () => {
    const tenders = [{ id: 'c1', method: 'CASH' as const, amount: 1000 }];
    const res = calculateRefundAllocation({
      refundAmount: 100,
      originalInvoiceTotal: 1000,
      originalAdvanceApplied: 0,
      originalCreditAllocated: 0,
      originalTenders: tenders,
      priorRefunds: {
        customerCreditByLine: { c1: 400 },
        customerCreditIssued: 400, // Matches!
      },
      requestedPayout: { customerCreditAmount: 100 },
    });
    assert.equal(res.customerCreditIssued, 100);
    assert.equal(res.tenderLineAllocations[0].remainingEligibleAmount, 500);
  });

  it('Phase 3A.2.5 Test I: Customer-credit contradiction rejection preserved', () => {
    const tenders = [{ id: 'c1', method: 'CASH' as const, amount: 1000 }];
    assert.throws(
      () => {
        calculateRefundAllocation({
          refundAmount: 100,
          originalInvoiceTotal: 1000,
          originalAdvanceApplied: 0,
          originalCreditAllocated: 0,
          originalTenders: tenders,
          priorRefunds: {
            customerCreditByLine: { c1: 400 },
            customerCreditIssued: 450, // Mismatches!
          },
        });
      },
      (err: any) => err.code === 'PRIOR_CREDIT_AGGREGATE_MISMATCH'
    );
  });

  it('Phase 3A.2.5 Test J: No detailed maps preserved with legacy aggregate FIFO behavior', () => {
    // Only legacy aggregates provided -> Consumed FIFO across lines without rejection
    const tenders = [
      { id: 'c1', method: 'CASH' as const, amount: 600 },
      { id: 'c2', method: 'CASH' as const, amount: 400 },
    ];
    const res = calculateRefundAllocation({
      refundAmount: 200,
      originalInvoiceTotal: 1000,
      originalAdvanceApplied: 0,
      originalCreditAllocated: 0,
      originalTenders: tenders,
      priorRefunds: {
        cashRefunded: 700, // FIFO consumes 600 on c1, 100 on c2
      },
      requestedPayout: { cashAmount: 200 },
    });
    assert.equal(res.cashRefunded, 200);
    assert.equal(res.tenderLineAllocations[0].remainingEligibleAmount, 0);
    assert.equal(res.tenderLineAllocations[1].remainingEligibleAmount, 100); // 400 - 100 - 200 = 100
  });
});
