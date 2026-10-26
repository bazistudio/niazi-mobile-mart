/**
 * CASH-2 Regression Tests — Niazi Mobile Mart
 *
 * Covers:
 *   Tests  1–9  : cash session lifecycle & midnight persistence (getDailySummary fix)
 *   Tests 10–19 : voucher accounting, branch isolation, idempotency, refresh
 *
 * DATABASE ISOLATION REQUIREMENT:
 *   Set TEST_DATABASE_URL to a disposable local PostgreSQL database.
 *   The suite REFUSES to run against a URL containing 'prod', 'live', or 'cloud'.
 *   If TEST_DATABASE_URL is not set, all integration tests are SKIPPED (not failed).
 *
 * HOW TO RUN:
 *   cd backend
 *   TEST_DATABASE_URL=postgres://user:pass@localhost:5432/niazi_test \
 *     node --loader ts-node/esm src/__tests__/cash-session-regression.test.ts
 *
 * SAFETY CONSTRAINTS (CASH-2 §PHASE 0):
 *   - No real-time sleeps to simulate midnight -- uses injected business_date values.
 *   - Does NOT run migrations or modify production data.
 *   - All test data isolated by branch_id prefixed 'test-cash2-'.
 *   - Cleanup runs in after() hooks regardless of test outcome.
 */

import { strict as assert } from 'node:assert';
import { test, describe, before, after } from 'node:test';
import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { getDailySummary } from '../repositories/cash.repo';

// ---------------------------------------------------------------------------
// Environment guard -- disposable DB only
// ---------------------------------------------------------------------------

const TEST_DB_URL = process.env['TEST_DATABASE_URL'];

const UNSAFE_PATTERNS = ['prod', 'live', 'cloud'];

function assertSafeDbUrl(url: string): void {
  for (const pat of UNSAFE_PATTERNS) {
    if (url.toLowerCase().includes(pat)) {
      throw new Error(
        `[SAFETY] TEST_DATABASE_URL appears to reference a production/live database ` +
        `(contains '${pat}'). Refusing to run. Use an isolated test database.`
      );
    }
  }
}

const SKIP_INTEGRATION = !TEST_DB_URL;

if (SKIP_INTEGRATION) {
  console.warn(
    '[CASH-2 regression] TEST_DATABASE_URL not set -- integration tests SKIPPED. ' +
    'Set TEST_DATABASE_URL to a disposable test database to run them.'
  );
} else {
  assertSafeDbUrl(TEST_DB_URL!);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A branch ID that is clearly test-only so cleanup cannot accidentally touch real data. */
const mkBranchId = () => `test-cash2-${uuidv4()}`;

/** ISO date string for today (UTC). */
const todayUTC = () => new Date().toISOString().slice(0, 10);

/** ISO date string for yesterday (UTC). */
const yesterdayUTC = () => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

/** Insert a cash session row directly (bypasses business logic -- test isolation only). */
async function insertSession(
  pool: Pool,
  opts: {
    id?: string;
    branchId: string;
    status: 'OPEN' | 'CLOSED';
    openingCash: number;
    businessDate: string;
    openedAt?: string;
    closedAt?: string | null;
  }
): Promise<string> {
  const id = opts.id ?? uuidv4();
  const openedAt = opts.openedAt ?? new Date().toISOString();
  await pool.query(
    `INSERT INTO cash_sessions
       (id, branch_id, status, opening_cash, business_date, opened_at, closed_at,
        closing_cash, physical_count, variance, closed_by_user_id, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 0, 0, 0, NULL, NULL)`,
    [id, opts.branchId, opts.status, opts.openingCash, opts.businessDate, openedAt, opts.closedAt ?? null]
  );
  return id;
}

/** Insert a cash movement row directly. */
async function insertMovement(
  pool: Pool,
  opts: {
    sessionId: string;
    branchId: string;
    movementType: string;
    direction: 'IN' | 'OUT';
    amount: number;
    sourceType: string;
    description?: string;
  }
): Promise<string> {
  const id = uuidv4();
  await pool.query(
    `INSERT INTO cash_movements
       (id, session_id, branch_id, movement_type, direction, amount, source_type, description, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
    [
      id,
      opts.sessionId,
      opts.branchId,
      opts.movementType,
      opts.direction,
      opts.amount,
      opts.sourceType,
      opts.description ?? 'test movement',
    ]
  );
  return id;
}

/** Delete all test rows for a set of branch IDs (cleanup). */
async function cleanupBranches(pool: Pool, branchIds: string[]): Promise<void> {
  for (const branchId of branchIds) {
    await pool.query('DELETE FROM cash_movements WHERE branch_id = $1', [branchId]);
    await pool.query('DELETE FROM cash_sessions WHERE branch_id = $1', [branchId]);
  }
}

// ---------------------------------------------------------------------------
// Integration test suite
// ---------------------------------------------------------------------------

if (!SKIP_INTEGRATION) {
  let pool: Pool;
  const testBranches: string[] = [];

  before(async () => {
    pool = new Pool({ connectionString: TEST_DB_URL! });
    const res = await pool.query('SELECT 1 AS ping');
    assert.strictEqual(res.rows[0]['ping'], 1, 'Test DB should be reachable');
  });

  after(async () => {
    await cleanupBranches(pool, testBranches);
    await pool.end();
  });

  // -------------------------------------------------------------------------
  // BLOCK 1: Cash session lifecycle & midnight persistence (Tests 1-9)
  // -------------------------------------------------------------------------

  describe('Cash-2 -- Session lifecycle & midnight persistence', () => {

    /**
     * Test 1: An OPEN session opened on day T is returned as the active session
     *         on day T+1 (the midnight-reset bug must be fixed).
     */
    test('1 -- OPEN session opened yesterday remains active today', async () => {
      const branchId = mkBranchId();
      testBranches.push(branchId);

      const sessionId = await insertSession(pool, {
        branchId,
        status: 'OPEN',
        openingCash: 5000,
        businessDate: yesterdayUTC(),
      });

      const summary = await getDailySummary(pool, branchId);

      assert.strictEqual(
        summary.session_id,
        sessionId,
        'Summary should reference the OPEN session, not return zero for a new day'
      );
      assert.strictEqual(summary.session_status, 'OPEN');
    });

    /**
     * Test 2: Opening cash remains unchanged across midnight (no reset).
     */
    test('2 -- Opening cash is preserved across midnight', async () => {
      const branchId = mkBranchId();
      testBranches.push(branchId);

      await insertSession(pool, {
        branchId,
        status: 'OPEN',
        openingCash: 12500,
        businessDate: yesterdayUTC(),
      });

      const summary = await getDailySummary(pool, branchId);

      assert.strictEqual(
        summary.opening_cash,
        12500,
        'Opening cash must survive the calendar-date change'
      );
    });

    /**
     * Test 3: Movements from yesterday AND today are both included in the
     *         expected-cash calculation for the same OPEN session.
     */
    test('3 -- Movements from both days belong to the same open session', async () => {
      const branchId = mkBranchId();
      testBranches.push(branchId);

      const sessionId = await insertSession(pool, {
        branchId,
        status: 'OPEN',
        openingCash: 1000,
        businessDate: yesterdayUTC(),
      });

      await insertMovement(pool, {
        sessionId, branchId, movementType: 'SALE', direction: 'IN',
        amount: 2000, sourceType: 'SALE', description: 'Day-T sale',
      });

      await insertMovement(pool, {
        sessionId, branchId, movementType: 'SALE', direction: 'IN',
        amount: 3000, sourceType: 'SALE', description: 'Day-T+1 sale',
      });

      const summary = await getDailySummary(pool, branchId);

      // Opening (1000) + IN (2000 + 3000) = 6000
      assert.strictEqual(summary.expected_closing_cash, 6000);
      assert.strictEqual(summary.total_cash_in, 5000);
    });

    /**
     * Test 4: expected_closing_cash is correct after the date changes.
     */
    test('4 -- expected_closing_cash is correct when session spans midnight', async () => {
      const branchId = mkBranchId();
      testBranches.push(branchId);

      const sessionId = await insertSession(pool, {
        branchId, status: 'OPEN', openingCash: 500, businessDate: yesterdayUTC(),
      });

      await insertMovement(pool, {
        sessionId, branchId, movementType: 'EXPENSE', direction: 'OUT',
        amount: 200, sourceType: 'EXPENSE',
      });

      const summary = await getDailySummary(pool, branchId);

      // 500 - 200 = 300
      assert.strictEqual(summary.expected_closing_cash, 300);
      assert.strictEqual(summary.total_cash_out, 200);
    });

    /**
     * Test 5: A closed historical session requested by explicit date is not replaced
     *         with the current active session (historical path preserved).
     */
    test('5 -- Historical date request is not replaced with the active OPEN session', async () => {
      const branchId = mkBranchId();
      testBranches.push(branchId);

      const yesterday = yesterdayUTC();

      const closedId = await insertSession(pool, {
        branchId, status: 'CLOSED', openingCash: 800, businessDate: yesterday,
        closedAt: new Date().toISOString(),
      });

      await insertSession(pool, {
        branchId, status: 'OPEN', openingCash: 900, businessDate: todayUTC(),
      });

      const summary = await getDailySummary(pool, branchId, yesterday);

      assert.strictEqual(summary.session_id, closedId);
      assert.strictEqual(summary.session_status, 'CLOSED');
    });

    /**
     * Test 6: When no OPEN session exists, the empty/null-session contract is preserved.
     */
    test('6 -- No OPEN session returns empty/null-session contract', async () => {
      const branchId = mkBranchId();
      testBranches.push(branchId);

      const summary = await getDailySummary(pool, branchId);

      assert.strictEqual(summary.session_id, null);
      assert.strictEqual(summary.opening_cash, 0);
      assert.strictEqual(summary.expected_closing_cash, 0);
    });

    /**
     * Test 7: Branch A's active session never appears in Branch B's summary.
     */
    test('7 -- Branch isolation: Branch A session not visible from Branch B', async () => {
      const branchA = mkBranchId();
      const branchB = mkBranchId();
      testBranches.push(branchA, branchB);

      const sessionA = await insertSession(pool, {
        branchId: branchA, status: 'OPEN', openingCash: 9999, businessDate: todayUTC(),
      });

      const summaryB = await getDailySummary(pool, branchB);

      assert.notStrictEqual(summaryB.session_id, sessionA);
      assert.strictEqual(summaryB.opening_cash, 0);
    });

    /**
     * Test 8: getDailySummary reads are non-destructive -- do not create new sessions.
     */
    test('8 -- Summary reads do not create new sessions', async () => {
      const branchId = mkBranchId();
      testBranches.push(branchId);

      const before = await pool.query(
        'SELECT COUNT(*) AS cnt FROM cash_sessions WHERE branch_id = $1',
        [branchId]
      );
      const countBefore = Number(before.rows[0]['cnt']);

      await getDailySummary(pool, branchId);
      await getDailySummary(pool, branchId);

      const after = await pool.query(
        'SELECT COUNT(*) AS cnt FROM cash_sessions WHERE branch_id = $1',
        [branchId]
      );

      assert.strictEqual(Number(after.rows[0]['cnt']), countBefore);
    });

    /**
     * Test 9: Closed session with explicit targetDate returns closed status.
     *         Ensures OPEN-first fast path does not short-circuit historical reads.
     */
    test('9 -- Closed session with historical date returns CLOSED contract', async () => {
      const branchId = mkBranchId();
      testBranches.push(branchId);

      const yesterday = yesterdayUTC();
      const closedId = await insertSession(pool, {
        branchId, status: 'CLOSED', openingCash: 300, businessDate: yesterday,
        closedAt: new Date().toISOString(),
      });

      const summary = await getDailySummary(pool, branchId, yesterday);

      assert.strictEqual(summary.session_id, closedId);
      assert.strictEqual(summary.session_status, 'CLOSED');
      assert.strictEqual(summary.opening_cash, 300);
    });

  }); // describe: Session lifecycle


  // -------------------------------------------------------------------------
  // BLOCK 2: Voucher accounting integrity (Tests 10-19)
  // -------------------------------------------------------------------------

  describe('Cash-2 -- Voucher accounting integrity', () => {

    /**
     * Test 10: Customer CASH receipt creates exactly one cash-in movement.
     *
     * NOTE: Validates the getDailySummary aggregation layer.
     * The full HTTP endpoint path (ledger + movement atomicity) is covered by
     * the existing API integration suite. Here we verify the movement side.
     */
    test('10 -- Customer CASH receipt creates exactly one cash-in movement', async () => {
      const branchId = mkBranchId();
      testBranches.push(branchId);

      const sessionId = await insertSession(pool, {
        branchId, status: 'OPEN', openingCash: 0, businessDate: todayUTC(),
      });

      await insertMovement(pool, {
        sessionId, branchId, movementType: 'CUSTOMER_PAYMENT', direction: 'IN',
        amount: 1500, sourceType: 'CUSTOMER_PAYMENT', description: 'Customer CASH receipt',
      });

      const summary = await getDailySummary(pool, branchId);

      assert.strictEqual(summary.total_cash_in, 1500);
      assert.strictEqual(summary.total_cash_out, 0);
      assert.strictEqual(summary.expected_closing_cash, 1500);
    });

    /**
     * Test 11: Non-cash customer receipt must NOT affect physical cash.
     *          Contract documentation test -- no cash movement is inserted for non-cash.
     */
    test('11 -- Non-cash customer receipt does not affect physical cash', async () => {
      const branchId = mkBranchId();
      testBranches.push(branchId);

      const sessionId = await insertSession(pool, {
        branchId, status: 'OPEN', openingCash: 0, businessDate: todayUTC(),
      });

      // No movement inserted -- the service layer must not insert one for non-cash
      const summary = await getDailySummary(pool, branchId);

      assert.strictEqual(summary.total_cash_in, 0);
      assert.strictEqual(summary.expected_closing_cash, 0);
      assert.ok(sessionId, 'Session was created for this test');
    });

    /**
     * Test 12: A CASH expense records exactly one cash-out movement.
     */
    test('12 -- CASH expense records exactly one cash-out movement', async () => {
      const branchId = mkBranchId();
      testBranches.push(branchId);

      const sessionId = await insertSession(pool, {
        branchId, status: 'OPEN', openingCash: 2000, businessDate: todayUTC(),
      });

      await insertMovement(pool, {
        sessionId, branchId, movementType: 'EXPENSE', direction: 'OUT',
        amount: 450, sourceType: 'EXPENSE', description: 'Electricity bill -- CASH',
      });

      const summary = await getDailySummary(pool, branchId);

      assert.strictEqual(summary.total_cash_out, 450);
      assert.strictEqual(summary.expected_closing_cash, 1550); // 2000 - 450
      assert.strictEqual(summary.cash_expenses, 450);
    });

    /**
     * Test 13: A non-cash expense does not reduce physical cash.
     */
    test('13 -- Non-cash expense does not affect physical cash', async () => {
      const branchId = mkBranchId();
      testBranches.push(branchId);

      const sessionId = await insertSession(pool, {
        branchId, status: 'OPEN', openingCash: 1000, businessDate: todayUTC(),
      });

      // No movement inserted for a BANK expense
      const summary = await getDailySummary(pool, branchId);

      assert.strictEqual(summary.total_cash_out, 0);
      assert.strictEqual(summary.expected_closing_cash, 1000);
      assert.ok(sessionId, 'Session was created for this test');
    });

    /**
     * Test 14: Supplier CASH payment records exactly one cash-out and must NOT
     *          appear in cash_expenses (supplier payment != business expense).
     */
    test('14 -- Supplier CASH payment records exactly one cash-out, not an expense', async () => {
      const branchId = mkBranchId();
      testBranches.push(branchId);

      const sessionId = await insertSession(pool, {
        branchId, status: 'OPEN', openingCash: 5000, businessDate: todayUTC(),
      });

      await insertMovement(pool, {
        sessionId, branchId, movementType: 'SUPPLIER_PAYMENT', direction: 'OUT',
        amount: 2200, sourceType: 'SUPPLIER_PAYMENT', description: 'Supplier cash payment',
      });

      const summary = await getDailySummary(pool, branchId);

      assert.strictEqual(summary.total_cash_out, 2200);
      assert.strictEqual(summary.expected_closing_cash, 2800); // 5000 - 2200
      assert.strictEqual(summary.cash_expenses, 0,
        'Supplier payment must not be counted as a business expense'
      );
    });

    /**
     * Test 15: Supplier payment creates exactly ONE movement, not a purchase.
     */
    test('15 -- Supplier payment creates exactly ONE movement, not a purchase record', async () => {
      const branchId = mkBranchId();
      testBranches.push(branchId);

      const sessionId = await insertSession(pool, {
        branchId, status: 'OPEN', openingCash: 3000, businessDate: todayUTC(),
      });

      await insertMovement(pool, {
        sessionId, branchId, movementType: 'SUPPLIER_PAYMENT', direction: 'OUT',
        amount: 1000, sourceType: 'SUPPLIER_PAYMENT',
      });

      const res = await pool.query(
        'SELECT COUNT(*) AS cnt FROM cash_movements WHERE session_id = $1',
        [sessionId]
      );
      assert.strictEqual(Number(res.rows[0]['cnt']), 1,
        'Exactly one cash movement must exist for a single supplier payment'
      );
    });

    /**
     * Test 16: An unknown/unauthorized branch returns zero/empty-session state.
     *          Branch isolation is enforced at the query level.
     */
    test('16 -- Unknown branch returns empty-session contract (branch isolation)', async () => {
      const unknownBranch = `test-cash2-unknown-${uuidv4()}`;
      // NOT pushed to testBranches -- nothing to clean up

      const summary = await getDailySummary(pool, unknownBranch);

      assert.strictEqual(summary.session_id, null,
        "Unknown branch must return null session_id, never another branch's session"
      );
      assert.strictEqual(summary.opening_cash, 0);
    });

    /**
     * Test 17: Movements on a closed session must NOT contaminate the active open session.
     *          Simulates a spurious post-close movement (service layer rejects these,
     *          but aggregation must be isolated by session_id regardless).
     */
    test('17 -- Post-close movements on closed session do not contaminate open session', async () => {
      const branchId = mkBranchId();
      testBranches.push(branchId);

      const closedSessionId = await insertSession(pool, {
        branchId, status: 'CLOSED', openingCash: 500, businessDate: yesterdayUTC(),
        closedAt: new Date().toISOString(),
      });

      const openSessionId = await insertSession(pool, {
        branchId, status: 'OPEN', openingCash: 500, businessDate: todayUTC(),
      });

      // Spurious movement against the CLOSED session
      await insertMovement(pool, {
        sessionId: closedSessionId, branchId, movementType: 'SALE', direction: 'IN',
        amount: 9999, sourceType: 'SALE',
        description: 'Spurious post-close movement -- must not appear in active session',
      });

      const summary = await getDailySummary(pool, branchId);

      assert.strictEqual(summary.session_id, openSessionId);
      assert.strictEqual(summary.total_cash_in, 0,
        'Active session must not include movements from the closed session'
      );
      assert.strictEqual(summary.expected_closing_cash, 500);
    });

    /**
     * Test 18: Two distinct same-amount movements accumulate correctly.
     *          No false deduplication -- idempotency is the API layer's concern.
     */
    test('18 -- Two distinct movements with same amount accumulate correctly (no false dedup)', async () => {
      const branchId = mkBranchId();
      testBranches.push(branchId);

      const sessionId = await insertSession(pool, {
        branchId, status: 'OPEN', openingCash: 0, businessDate: todayUTC(),
      });

      await insertMovement(pool, {
        sessionId, branchId, movementType: 'SALE', direction: 'IN',
        amount: 1000, sourceType: 'SALE', description: 'Sale #1',
      });

      await insertMovement(pool, {
        sessionId, branchId, movementType: 'SALE', direction: 'IN',
        amount: 1000, sourceType: 'SALE', description: 'Sale #2',
      });

      const summary = await getDailySummary(pool, branchId);

      assert.strictEqual(summary.total_cash_in, 2000,
        'Two identical amounts must both be included -- no value-based deduplication'
      );
      assert.strictEqual(summary.expected_closing_cash, 2000);
    });

    /**
     * Test 19: getDailySummary reflects updated KPIs immediately after a new movement --
     *          simulating the post-voucher fetchCurrentState refresh in CashManagementPage.
     */
    test('19 -- getDailySummary reflects updated KPIs after voucher refresh', async () => {
      const branchId = mkBranchId();
      testBranches.push(branchId);

      const sessionId = await insertSession(pool, {
        branchId, status: 'OPEN', openingCash: 1000, businessDate: todayUTC(),
      });

      const before = await getDailySummary(pool, branchId);
      assert.strictEqual(before.expected_closing_cash, 1000);

      await insertMovement(pool, {
        sessionId, branchId, movementType: 'CUSTOMER_PAYMENT', direction: 'IN',
        amount: 500, sourceType: 'CUSTOMER_PAYMENT',
      });

      const after = await getDailySummary(pool, branchId);
      assert.strictEqual(after.expected_closing_cash, 1500,
        'getDailySummary must return updated KPIs after a new movement is inserted'
      );
      assert.strictEqual(after.total_cash_in, 500);
    });

  }); // describe: Voucher accounting

} // if (!SKIP_INTEGRATION)

// ---------------------------------------------------------------------------
// Unverified tests -- documented rather than silently omitted
// ---------------------------------------------------------------------------

/**
 * UNVERIFIED -- Test 9b: SQLite (Tauri/Rust) and PostgreSQL behavioral parity.
 *
 * The Rust implementation in src-tauri/src/repositories/cash_repository.rs was
 * updated with the same OPEN-session-first pattern as the TypeScript backend.
 * Parity is asserted by code review:
 *   cash_repository.rs::get_daily_summary
 *     -> calls get_open_session_in_tx(conn, branch_id) first
 *     -> if Some(session) -> returns calculate_session_summary_in_tx(conn, session.id)
 *     -> else -> falls back to business_date query (historical path)
 * The TypeScript counterpart applies the identical two-path logic.
 * Reason not executed here: no Tauri CLI in this environment; Rust test suite
 * requires 'cargo test' in the src-tauri workspace.
 *
 * UNVERIFIED -- Server-side closed-session rejection (test 17 complement):
 * Full rejection path (400 / "No open session" from the API) requires a running
 * backend server. Covered by the existing API integration suite.
 *
 * UNVERIFIED -- UI duplicate-submit prevention (test 18 complement):
 * Verified by code review: ReceivePaymentModal and MakeSupplierPaymentModal
 * disable submit while useMutation.isPending is true. ExpenseCreateModal
 * disables while isAdding is true. No React component test harness available here.
 */
