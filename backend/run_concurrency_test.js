/**
 * NIAZI MOBILE MART — PHASE 3B.4.3.2
 * AUTHORIZED TEN-ITERATION DISPOSABLE POSTGRESQL CONCURRENCY VALIDATION
 * 
 * Strict boundary rules:
 * - Runs against disposable database: niazi_phase3b4_concurrency_disposable ONLY.
 * - Validates customer row lock in returns.repo.ts using actual compiled repo functions.
 * - Deterministic physical PID-to-PID lock detection with multi-stage customerLockQueryIssued barrier.
 * - Marker-gated teardown only upon complete 10/10 success.
 */

const { Client, Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Import compiled production repository functions
const { createSalesReturn } = require('./dist/repositories/returns.repo');
const { recordCustomerPayment } = require('./dist/repositories/customer.repo');

const DB_HOST = '127.0.0.1';
const DB_PORT = 5432;
const DB_USER = 'postgres';
const DB_PASS = 'Bazi@620';
const DISPOSABLE_DB = 'niazi_phase3b4_concurrency_disposable';
const RUN_ID = 'phase3b4_run_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Fail-closed customer row lock SQL matcher & parameter validator
function isCustomerLockQuery(sql, values, expectedCustomerId) {
  if (typeof sql !== 'string') return false;
  // Matches both:
  // SELECT id, name, is_active FROM customers WHERE id = $1 FOR UPDATE (from createSalesReturn)
  // SELECT id, name FROM customers WHERE id = $1 FOR UPDATE (from recordCustomerPayment)
  const isMatch = /SELECT\s+id,\s*name(,\s*is_active)?\s+FROM\s+customers\s+WHERE\s+id\s*=\s*\$1\s+FOR\s+UPDATE/i.test(sql);
  if (!isMatch) return false;
  if (!values || values.length === 0 || values[0] !== expectedCustomerId) {
    throw new Error(`CRITICAL: Customer lock query emitted with mismatched parameter $1: expected ${expectedCustomerId}, got ${values && values[0]}`);
  }
  return true;
}

// MinimalRepositoryClient wrapping the real PoolClient
class MinimalRepositoryClient {
  constructor(rawClient, role, runId, expectedCustomerId, onCustomerLockQueryIssued, onTransactionFinished) {
    this.rawClient = rawClient;
    this.role = role;
    this.runId = runId;
    this.expectedCustomerId = expectedCustomerId;
    this.onCustomerLockQueryIssued = onCustomerLockQueryIssued;
    this.onTransactionFinished = onTransactionFinished;
    this.released = false;
    this.pid = null;
  }

  async query(sqlOrConfig, values) {
    let sql = typeof sqlOrConfig === 'string' ? sqlOrConfig : sqlOrConfig.text;
    let vals = typeof sqlOrConfig === 'string' ? values : sqlOrConfig.values;

    if (isCustomerLockQuery(sql, vals, this.expectedCustomerId)) {
      if (this.onCustomerLockQueryIssued) {
        this.onCustomerLockQueryIssued();
      }
    }

    try {
      const res = await this.rawClient.query(sqlOrConfig, values);
      return res;
    } finally {
      if (typeof sql === 'string' && /^(COMMIT|ROLLBACK)/i.test(sql.trim())) {
        if (this.onTransactionFinished) {
          this.onTransactionFinished(sql.trim().toUpperCase());
        }
      }
    }
  }

  release() {
    if (this.released) return;
    this.released = true;
    return this.rawClient.release();
  }
}

// MinimalRepositoryPool wrapping pg.Pool
class MinimalRepositoryPool {
  constructor(poolConfig, role, runId, expectedCustomerId, onCustomerLockQueryIssued, onTransactionFinished, onClientConnected) {
    this.innerPool = new Pool(poolConfig);
    this.role = role;
    this.runId = runId;
    this.expectedCustomerId = expectedCustomerId;
    this.onCustomerLockQueryIssued = onCustomerLockQueryIssued;
    this.onTransactionFinished = onTransactionFinished;
    this.onClientConnected = onClientConnected;
  }

  async connect() {
    const rawClient = await this.innerPool.connect();
    // Synchronously verify session parameters and backend PID
    const identRes = await rawClient.query("SELECT pg_backend_pid() AS pid, current_database() AS db, current_setting('application_name') AS app_name");
    const pid = identRes.rows[0].pid;
    const db = identRes.rows[0].db;
    const appName = identRes.rows[0].app_name;

    if (db !== DISPOSABLE_DB) {
      rawClient.release();
      throw new Error(`CRITICAL: Connection checked out from incorrect database: ${db} !== ${DISPOSABLE_DB}`);
    }

    const clientWrapper = new MinimalRepositoryClient(
      rawClient,
      this.role,
      this.runId,
      this.expectedCustomerId,
      this.onCustomerLockQueryIssued,
      this.onTransactionFinished
    );
    clientWrapper.pid = pid;

    if (this.onClientConnected) {
      this.onClientConnected({ pid, appName, db });
    }

    return clientWrapper;
  }

  async end() {
    await this.innerPool.end();
  }
}

async function main() {
  console.log('================================================================');
  console.log('NIAZI MOBILE MART — PHASE 3B.4.3.2 CONCURRENCY VALIDATION');
  console.log(`RUN ID: ${RUN_ID}`);
  console.log(`TARGET DATABASE: ${DISPOSABLE_DB}`);
  console.log('================================================================');

  // Step 1: Connect to maintenance database and create disposable database
  const maintClient = new Client({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASS,
    database: 'postgres'
  });

  await maintClient.connect();

  const checkDb = await maintClient.query('SELECT datname FROM pg_database WHERE datname = $1', [DISPOSABLE_DB]);
  if (checkDb.rows.length > 0) {
    console.log(`Database ${DISPOSABLE_DB} exists from incomplete prior step. Dropping for fresh run...`);
    await maintClient.query(`
      SELECT pg_terminate_backend(pid) 
      FROM pg_stat_activity 
      WHERE datname = $1 AND pid <> pg_backend_pid()
    `, [DISPOSABLE_DB]);
    await maintClient.query(`DROP DATABASE "${DISPOSABLE_DB}"`);
  }

  console.log(`[1/5] Creating clean disposable database: ${DISPOSABLE_DB}...`);
  await maintClient.query(`CREATE DATABASE "${DISPOSABLE_DB}" OWNER "${DB_USER}"`);
  console.log('Disposable database created successfully.');

  let allIterationsPassed = false;
  let testDbClient = null;

  try {
    testDbClient = new Client({
      host: DB_HOST,
      port: DB_PORT,
      user: DB_USER,
      password: DB_PASS,
      database: DISPOSABLE_DB
    });
    await testDbClient.connect();

    // Step 2: Apply migrations 001 to 041
    console.log('[2/5] Applying migrations 001 to 041...');
    const migrationsDir = path.resolve(__dirname, '..', 'src-tauri', 'migrations', 'postgres');
    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
    
    for (const f of files) {
      const match = f.match(/^(\d+)/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num >= 1 && num <= 41) {
          const sql = fs.readFileSync(path.join(migrationsDir, f), 'utf8');
          await testDbClient.query(sql);
        }
      }
    }
    console.log('Migrations applied successfully.');

    // Step 3: Insert disposable test marker
    console.log('[3/5] Inserting disposable test marker...');
    await testDbClient.query(`
      CREATE TABLE _disposable_test_marker (
        run_id TEXT PRIMARY KEY,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        status TEXT
      )
    `);
    await testDbClient.query(
      'INSERT INTO _disposable_test_marker (run_id, status) VALUES ($1, $2)',
      [RUN_ID, 'INITIALIZED']
    );

    // Global coordinator client to monitor pg_stat_activity
    const coordPool = new Pool({
      host: DB_HOST,
      port: DB_PORT,
      user: DB_USER,
      password: DB_PASS,
      database: DISPOSABLE_DB,
      application_name: `coord_${RUN_ID.slice(-8)}`
    });

    const iterationResults = [];

    // Ensure open cash session exists for branch (once for all iterations)
    const sessionId = crypto.randomUUID();
    const branchId = '00000000-0000-0000-0000-000000000002'; // MAIN branch pre-seeded
    await testDbClient.query(`
      INSERT INTO cash_sessions (id, branch_id, business_date, opening_cash, status, opened_at)
      VALUES ($1, $2, '2026-11-02', 100000, 'OPEN', NOW()::text)
      ON CONFLICT (id) DO NOTHING
    `, [sessionId, branchId]);

    // Ensure receipt_number counter exists
    await testDbClient.query(`
      INSERT INTO counters (name, value)
      VALUES ('receipt_number', 1000)
      ON CONFLICT (name) DO NOTHING
    `);

    // Step 4: Execute 10 iterations (1-5: Schedule A, 6-10: Schedule B)
    console.log('[4/5] Executing 10 concurrency validation iterations...');

    for (let i = 1; i <= 10; i++) {
      const schedule = i <= 5 ? 'A' : 'B';
      const iterTag = `Iter ${i} (Schedule ${schedule})`;
      console.log(`\n------------------------------------------------------------`);
      console.log(`Starting ${iterTag}...`);

      // 4.1 Create synthetic fixtures
      const custId = crypto.randomUUID();
      const prodId = crypto.randomUUID();
      const saleId = crypto.randomUUID();
      const userId = crypto.randomUUID();
      const typeId = crypto.randomUUID();

      // Ensure test user exists
      await testDbClient.query(`
        INSERT INTO users (id, branch_id, name, username, login_key_hash, role, is_active, created_at, updated_at)
        VALUES ($1, $2, 'Test Admin', $3, 'dummyhash', 'ADMIN', 1, NOW()::text, NOW()::text)
      `, [userId, branchId, `admin_${i}_${Date.now().toString().slice(-4)}`]);

      // Ensure product type exists
      await testDbClient.query(`
        INSERT INTO product_types (id, name, code, is_active, created_at, updated_at)
        VALUES ($1, $2, $3, 1, NOW()::text, NOW()::text)
      `, [typeId, `Test Type ${i}`, `TYPE-${i}-${Date.now().toString().slice(-4)}`]);

      // Customer
      await testDbClient.query(`
        INSERT INTO customers (id, customer_code, name, phone, is_active, created_at, updated_at)
        VALUES ($1, $2, $3, $4, 1, NOW()::text, NOW()::text)
      `, [custId, `CUST-${i}-${Date.now().toString().slice(-4)}`, `Test Customer ${i}`, `030012345${i.toString().padStart(2, '0')}`]);

      // Opening balance: Rs 30,000 DEBIT (Customer owes 30,000)
      await testDbClient.query(`
        INSERT INTO customer_ledger_entries (id, customer_id, entry_type, debit, credit, balance_after, description, created_at)
        VALUES ($1, $2, 'OPENING_BALANCE', 30000, 0, 30000, 'Opening Balance', NOW()::text)
      `, [crypto.randomUUID(), custId]);

      // Product
      await testDbClient.query(`
        INSERT INTO products (id, name, normalized_name, sku, type_id, purchase_price, sale_price, is_active, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, 4000, 5000, 1, NOW()::text, NOW()::text)
      `, [prodId, `Test Product ${i}`, `test product ${i}`, `SKU-${i}-${Date.now().toString().slice(-4)}`, typeId]);

      // Stock: 10 units
      await testDbClient.query(`
        INSERT INTO stock (product_id, branch_id, quantity, updated_at)
        VALUES ($1, $2, 10, NOW()::text)
      `, [prodId, branchId]);

      // Completed Sale: 1 unit of product for Rs 5,000
      await testDbClient.query(`
        INSERT INTO sales (id, invoice_number, branch_id, customer_id, subtotal, discount, tax_amount, total_amount, paid_amount, change_amount, payment_status, sale_status, performed_by, created_at, updated_at)
        VALUES ($1, $2, $3, $4, 5000, 0, 0, 5000, 5000, 0, 'PAID', 'COMPLETED', $5, NOW()::text, NOW()::text)
      `, [saleId, `INV-${i}-${Date.now().toString().slice(-4)}`, branchId, custId, userId]);

      const saleLineId = crypto.randomUUID();

      await testDbClient.query(`
        INSERT INTO sale_lines (id, sale_id, product_id, product_name_snapshot, sku_snapshot, unit_price, cost_price_snapshot, quantity, discount, line_total, created_at)
        VALUES ($1, $2, $3, $4, $5, 5000, 4000, 1, 0, 5000, NOW()::text)
      `, [saleLineId, saleId, prodId, `Test Product ${i}`, `SKU-${i}`]);

      // 4.2 Setup holder and waiter
      let holderPid = null;
      let waiterPid = null;

      let holderCommitResolve = null;
      const holderCommitSignal = new Promise((resolve) => {
        holderCommitResolve = resolve;
      });

      let waiterLockQueryIssued = false;
      let waiterLockQueryResolve = null;
      const waiterLockQuerySignal = new Promise((resolve) => {
        waiterLockQueryResolve = resolve;
      });

      // App names
      const holderAppName = `h_${i}_${RUN_ID.slice(-4)}`;
      const waiterAppName = `w_${i}_${RUN_ID.slice(-4)}`;

      // Construct isolated pools
      const holderPool = new MinimalRepositoryPool(
        {
          host: DB_HOST,
          port: DB_PORT,
          user: DB_USER,
          password: DB_PASS,
          database: DISPOSABLE_DB,
          application_name: holderAppName,
          max: 1
        },
        'HOLDER',
        RUN_ID,
        custId,
        null,
        null,
        (info) => {
          holderPid = info.pid;
        }
      );

      const waiterPool = new MinimalRepositoryPool(
        {
          host: DB_HOST,
          port: DB_PORT,
          user: DB_USER,
          password: DB_PASS,
          database: DISPOSABLE_DB,
          application_name: waiterAppName,
          max: 1
        },
        'WAITER',
        RUN_ID,
        custId,
        () => {
          waiterLockQueryIssued = true;
          if (waiterLockQueryResolve) waiterLockQueryResolve();
        },
        null,
        (info) => {
          waiterPid = info.pid;
        }
      );

      let detectedContention = false;
      let observedWaitEvent = null;
      let observedWaitEventType = null;

      let holderPromise = null;
      let waiterPromise = null;

      const returnDto = {
        sale_id: saleId,
        refund_method: 'CREDIT',
        reason: 'DEFECTIVE',
        notes: `Schedule ${schedule} Return Iter ${i}`,
        lines: [{ sale_line_id: saleLineId, quantity: 1 }]
      };

      const paymentDto = {
        amount: 8000.00,
        payment_method: 'CASH',
        notes: `Schedule ${schedule} Payment Iter ${i}`
      };

      if (schedule === 'A') {
        // SCHEDULE A:
        // Holder = createSalesReturn (pauses at COMMIT)
        // Waiter = recordCustomerPayment (blocks at customer FOR UPDATE)

        let commitIntercepted = false;
        const origConnect = holderPool.connect.bind(holderPool);
        holderPool.connect = async () => {
          const client = await origConnect();
          const origQuery = client.query.bind(client);
          client.query = async (sqlOrConfig, values) => {
            let sql = typeof sqlOrConfig === 'string' ? sqlOrConfig : sqlOrConfig.text;
            if (typeof sql === 'string' && /^COMMIT/i.test(sql.trim()) && !commitIntercepted) {
              commitIntercepted = true;
              console.log(`[${iterTag}] Holder reached COMMIT point. Pausing commit to allow waiter contention observation...`);
              await holderCommitSignal;
              console.log(`[${iterTag}] Resuming Holder COMMIT.`);
            }
            return origQuery(sqlOrConfig, values);
          };
          return client;
        };

        // Launch Holder
        holderPromise = createSalesReturn(holderPool, returnDto, userId, branchId, false);

        while (!holderPid) {
          await sleep(10);
        }
        await sleep(100);

        // Launch Waiter
        waiterPromise = recordCustomerPayment(waiterPool, custId, paymentDto, userId, branchId);

        while (!waiterPid) {
          await sleep(10);
        }

        console.log(`[${iterTag}] Awaiting waiter customerLockQueryIssued barrier...`);
        const lockIssuedTimeout = setTimeout(() => {
          if (!waiterLockQueryIssued) {
            console.error(`[${iterTag}] Warning: Waiter did not issue customer lock query within 3000ms`);
          }
        }, 3000);
        await waiterLockQuerySignal;
        clearTimeout(lockIssuedTimeout);
        console.log(`[${iterTag}] Waiter emitted customerLockQueryIssued! (waiterPid: ${waiterPid}, holderPid: ${holderPid})`);

        // Observe contention via coordinator client
        const pollStart = Date.now();
        while (Date.now() - pollStart < 5000) {
          const contentionRes = await coordPool.query(`
            SELECT 
              blocked.pid AS blocked_pid,
              blocked.application_name AS blocked_app,
              blocked.wait_event_type,
              blocked.wait_event,
              blocked.state,
              blocking.pid AS blocking_pid,
              blocking.application_name AS blocking_app
            FROM pg_stat_activity blocked
            JOIN unnest(pg_blocking_pids(blocked.pid)) WITH ORDINALITY AS b(blocking_pid, ord) ON true
            JOIN pg_stat_activity blocking ON blocking.pid = b.blocking_pid
            WHERE blocked.pid = $1 
              AND blocking.pid = $2
              AND blocked.wait_event_type = 'Lock'
          `, [waiterPid, holderPid]);

          if (contentionRes.rows.length > 0) {
            detectedContention = true;
            observedWaitEvent = contentionRes.rows[0].wait_event;
            observedWaitEventType = contentionRes.rows[0].wait_event_type;
            console.log(`[${iterTag}] ✓ Positive Lock Contention Observed! Blocked: ${waiterPid} (${contentionRes.rows[0].blocked_app}), Blocking: ${holderPid} (${contentionRes.rows[0].blocking_app}), Event: ${observedWaitEventType}/${observedWaitEvent}`);
            break;
          }
          await sleep(25);
        }

        // Release holder commit
        holderCommitResolve();

        // Await completion of both operations
        const [returnResult, paymentResult] = await Promise.all([holderPromise, waiterPromise]);
        console.log(`[${iterTag}] Both operations completed. Return ID: ${returnResult.return_id}, Payment ref: ${paymentResult.reference_number}`);

      } else {
        // SCHEDULE B:
        // Holder = recordCustomerPayment (pauses at COMMIT)
        // Waiter = createSalesReturn (blocks on customer FOR UPDATE line 379)

        let commitIntercepted = false;
        const origConnect = holderPool.connect.bind(holderPool);
        holderPool.connect = async () => {
          const client = await origConnect();
          const origQuery = client.query.bind(client);
          client.query = async (sqlOrConfig, values) => {
            let sql = typeof sqlOrConfig === 'string' ? sqlOrConfig : sqlOrConfig.text;
            if (typeof sql === 'string' && /^COMMIT/i.test(sql.trim()) && !commitIntercepted) {
              commitIntercepted = true;
              console.log(`[${iterTag}] Holder reached COMMIT point. Pausing commit to allow waiter contention observation...`);
              await holderCommitSignal;
              console.log(`[${iterTag}] Resuming Holder COMMIT.`);
            }
            return origQuery(sqlOrConfig, values);
          };
          return client;
        };

        // Launch Holder
        holderPromise = recordCustomerPayment(holderPool, custId, paymentDto, userId, branchId);

        while (!holderPid) {
          await sleep(10);
        }
        await sleep(100);

        // Launch Waiter
        waiterPromise = createSalesReturn(waiterPool, returnDto, userId, branchId, false);

        while (!waiterPid) {
          await sleep(10);
        }

        console.log(`[${iterTag}] Awaiting waiter customerLockQueryIssued barrier...`);
        const lockIssuedTimeout = setTimeout(() => {
          if (!waiterLockQueryIssued) {
            console.error(`[${iterTag}] Warning: Waiter did not issue customer lock query within 3000ms`);
          }
        }, 3000);
        await waiterLockQuerySignal;
        clearTimeout(lockIssuedTimeout);
        console.log(`[${iterTag}] Waiter emitted customerLockQueryIssued! (waiterPid: ${waiterPid}, holderPid: ${holderPid})`);

        // Observe contention via coordinator client
        const pollStart = Date.now();
        while (Date.now() - pollStart < 5000) {
          const contentionRes = await coordPool.query(`
            SELECT 
              blocked.pid AS blocked_pid,
              blocked.application_name AS blocked_app,
              blocked.wait_event_type,
              blocked.wait_event,
              blocked.state,
              blocking.pid AS blocking_pid,
              blocking.application_name AS blocking_app
            FROM pg_stat_activity blocked
            JOIN unnest(pg_blocking_pids(blocked.pid)) WITH ORDINALITY AS b(blocking_pid, ord) ON true
            JOIN pg_stat_activity blocking ON blocking.pid = b.blocking_pid
            WHERE blocked.pid = $1 
              AND blocking.pid = $2
              AND blocked.wait_event_type = 'Lock'
          `, [waiterPid, holderPid]);

          if (contentionRes.rows.length > 0) {
            detectedContention = true;
            observedWaitEvent = contentionRes.rows[0].wait_event;
            observedWaitEventType = contentionRes.rows[0].wait_event_type;
            console.log(`[${iterTag}] ✓ Positive Lock Contention Observed! Blocked: ${waiterPid} (${contentionRes.rows[0].blocked_app}), Blocking: ${holderPid} (${contentionRes.rows[0].blocking_app}), Event: ${observedWaitEventType}/${observedWaitEvent}`);
            break;
          }
          await sleep(25);
        }

        // Release holder commit
        holderCommitResolve();

        // Await completion of both operations
        const [paymentResult, returnResult] = await Promise.all([holderPromise, waiterPromise]);
        console.log(`[${iterTag}] Both operations completed. Payment ref: ${paymentResult.reference_number}, Return ID: ${returnResult.return_id}`);
      }

      // Close iteration pools
      await holderPool.end();
      await waiterPool.end();

      // Financial & Ledger Assertions
      const ledgerRows = (await testDbClient.query(`
        SELECT id, entry_type, debit, credit, balance_after, created_at
        FROM customer_ledger_entries
        WHERE customer_id = $1
        ORDER BY created_at ASC, id ASC
      `, [custId])).rows;

      console.log(`[${iterTag}] Ledger entries count: ${ledgerRows.length}`);
      ledgerRows.forEach((r, idx) => {
        console.log(`  Entry ${idx + 1}: ${r.entry_type} | Debit: ${r.debit} | Credit: ${r.credit} | Balance: ${r.balance_after}`);
      });

      if (!detectedContention) {
        throw new Error(`CRITICAL TEST FAILURE: Lock contention was NOT detected in ${iterTag} within 5,000ms!`);
      }

      if (ledgerRows.length !== 3) {
        throw new Error(`CRITICAL TEST FAILURE: Expected exactly 3 ledger rows, got ${ledgerRows.length} in ${iterTag}`);
      }

      const finalBalance = parseFloat(ledgerRows[2].balance_after);
      if (Math.abs(finalBalance - 17000.00) > 0.001) {
        throw new Error(`CRITICAL FINANCIAL ERROR: Final ledger balance expected 17000.00, got ${finalBalance} in ${iterTag}`);
      }

      // Verify sequence of balances
      // Schedule A: 30000 -> (Return credit 5000 -> 25000) -> (Payment credit 8000 -> 17000)
      // Schedule B: 30000 -> (Payment credit 8000 -> 22000) -> (Return credit 5000 -> 17000)
      const expectedIntermBalance = schedule === 'A' ? 25000.00 : 22000.00;
      const actualIntermBalance = parseFloat(ledgerRows[1].balance_after);
      if (Math.abs(actualIntermBalance - expectedIntermBalance) > 0.001) {
        throw new Error(`CRITICAL FINANCIAL ERROR: Intermediate balance expected ${expectedIntermBalance}, got ${actualIntermBalance} in ${iterTag}`);
      }

      iterationResults.push({
        iteration: i,
        schedule,
        holderPid,
        waiterPid,
        waitEvent: `${observedWaitEventType} / ${observedWaitEvent}`,
        detectedContention,
        ledgerRowsCount: ledgerRows.length,
        finalBalance,
        status: 'PASSED'
      });
      console.log(`[${iterTag}] PASSED successfully.`);
    }

    await coordPool.end();

    // Check all 10 passed
    if (iterationResults.length === 10 && iterationResults.every(r => r.status === 'PASSED')) {
      allIterationsPassed = true;
      console.log('\n================================================================');
      console.log('ALL 10 CONCURRENCY ITERATIONS COMPLETED AND VALIDATED SUCCESSFULLY!');
      console.log('Schedule A: 5/5 PASSED');
      console.log('Schedule B: 5/5 PASSED');
      console.log('================================================================');
    } else {
      throw new Error(`Incomplete iterations: only ${iterationResults.length}/10 succeeded.`);
    }

  } catch (err) {
    console.error('\nEXECUTION FAILURE:', err.message);
    console.error(err.stack);
    throw err;
  } finally {
    // Step 5: Teardown protocol
    if (testDbClient) {
      if (allIterationsPassed) {
        console.log('\n[5/5] All iterations passed. Executing marker-gated cleanup protocol...');
        try {
          const markerRes = await testDbClient.query('SELECT run_id FROM _disposable_test_marker WHERE run_id = $1', [RUN_ID]);
          if (markerRes.rows.length === 1 && markerRes.rows[0].run_id === RUN_ID) {
            console.log(`Marker verified: ${RUN_ID}. Disconnecting and dropping database...`);
            await testDbClient.end();
            testDbClient = null;

            // Terminate any remaining backends
            await maintClient.query(`
              SELECT pg_terminate_backend(pid) 
              FROM pg_stat_activity 
              WHERE datname = $1 AND pid <> pg_backend_pid()
            `, [DISPOSABLE_DB]);

            await maintClient.query(`DROP DATABASE "${DISPOSABLE_DB}"`);
            console.log(`Disposable database ${DISPOSABLE_DB} dropped successfully.`);
          } else {
            console.error('CRITICAL: Marker verification failed! Database will NOT be dropped.');
            await testDbClient.end();
          }
        } catch (cleanupErr) {
          console.error('Cleanup error:', cleanupErr.message);
        }
      } else {
        console.warn(`\nSAFETY PRESERVATION: Iterations failed or did not complete. Preserving ${DISPOSABLE_DB} for forensic analysis.`);
        await testDbClient.end();
      }
    }
    await maintClient.end();
  }
}

main().catch(() => process.exit(1));
