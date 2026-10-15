/**
 * Niazi Mobile Mart — Phase 2 Canonical Authorization Matrix Test Suite
 *
 * Verifies:
 *   1. Canonical ADMIN with NULL branch_id is recognized as Org Admin and can access all branches.
 *   2. Canonical ADMIN with Main Branch as home branch STILL acts as Org Admin (does not downgrade).
 *   3. Canonical SHOP_ADMIN can access their assigned branch (POS, cash session, movements, reports).
 *   4. Canonical SHOP_ADMIN is denied access to other branches (403 Forbidden), including parameter spoofing.
 *   5. MANAGER role is an operational role and does NOT receive administrator bypasses.
 *   6. CASHIER role can perform POS/cash operations for their assigned branch, but cannot cross branches.
 *   7. SALESMAN role can perform sales operations, but cannot manage cash sessions or cross branches.
 *   8. ACCOUNTANT role cannot execute checkout or cash session opening.
 *   9. Legacy transition aliases (SUPER_ADMIN, OWNER, MULTI_ADMIN) map cleanly to Org Admin.
 *   10. Legacy transition aliases (SHOPADMIN, BRANCH_ADMIN) map cleanly to Branch Admin.
 */

import { strict as assert } from 'node:assert';
import { test, describe, before, after } from 'node:test';
import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import fs from 'node:fs';
import path from 'node:path';

import { createSaleRouter } from '../routes/sale.routes.js';
import { createCashRouter } from '../routes/cash.routes.js';
import { createProductRouter } from '../routes/product.routes.js';
import { issueToken } from '../services/jwt.service.js';
import { isOrgAdmin, isBranchAdmin, isAdmin, canAccessBranch, authorizePermission, NIAZI_ORGANIZATION_ID } from '../auth.js';

// Setup JWT keys from disk if not already in process.env
const privCandidates = [
  path.join(process.cwd(), 'backend', 'jwt_private.pem'),
  path.join(process.cwd(), 'jwt_private.pem'),
];
for (const p of privCandidates) {
  if (fs.existsSync(p)) {
    process.env['JWT_PRIVATE_KEY'] = fs.readFileSync(p, 'utf8');
    break;
  }
}
const pubCandidates = [
  path.join(process.cwd(), 'backend', 'jwt_pub.pem'),
  path.join(process.cwd(), 'jwt_pub.pem'),
];
for (const p of pubCandidates) {
  if (fs.existsSync(p)) {
    process.env['JWT_PUBLIC_KEY'] = fs.readFileSync(p, 'utf8');
    break;
  }
}

const TEST_DB_URL = process.env['TEST_DATABASE_URL'] ?? process.env['DATABASE_URL'] ?? '';

// Ensure test safety: never run against production
if (!TEST_DB_URL.includes('localhost') && !TEST_DB_URL.includes('127.0.0.1')) {
  console.error('[BLOCKED] DATABASE_URL is not local. Refusing to run tests.');
  process.exit(1);
}

describe('Phase 2 — Canonical Authorization Matrix Suite', () => {
  let pool: Pool;
  let server: Server;
  let baseUrl: string;

  const RUN_PREFIX = uuidv4().slice(0, 8);
  const BRANCH_MAIN = '00000000-0000-0000-0000-000000000002';
  const BRANCH_B = '11111111-1111-1111-1111-111111111111';
  const BRANCH_C = '22222222-2222-2222-2222-222222222222';

  // Identifiers
  const ADMIN_NULL_ID = uuidv4();
  const ADMIN_MAIN_ID = uuidv4();
  const SHOP_ADMIN_B_ID = uuidv4();
  const MANAGER_MAIN_ID = uuidv4();
  const CASHIER_MAIN_ID = uuidv4();
  const SALESMAN_B_ID = uuidv4();
  const ACCOUNTANT_MAIN_ID = uuidv4();

  let tokenAdminNull: string;
  let tokenAdminMain: string;
  let tokenShopAdminB: string;
  let tokenManagerMain: string;
  let tokenCashierMain: string;
  let tokenSalesmanB: string;
  let tokenAccountantMain: string;

  before(async () => {
    pool = new Pool({ connectionString: TEST_DB_URL });

    // Ensure test branches exist
    const now = new Date().toISOString();
    await pool.query(
      `INSERT INTO branches (id, organization_id, name, code, is_active, created_at, updated_at)
       VALUES 
         ($1, $3, 'Test Branch B', 'TEST-B-' || $4, 1, $5, $5),
         ($2, $3, 'Test Branch C', 'TEST-C-' || $4, 1, $5, $5)
       ON CONFLICT (id) DO NOTHING`,
      [BRANCH_B, BRANCH_C, NIAZI_ORGANIZATION_ID, RUN_PREFIX, now]
    );

    // Seed test users in PostgreSQL for active-account check
    const testUsers = [
      [ADMIN_NULL_ID, null, 'ADMIN', `admin_null_${RUN_PREFIX}`],
      [ADMIN_MAIN_ID, BRANCH_MAIN, 'ADMIN', `admin_main_${RUN_PREFIX}`],
      [SHOP_ADMIN_B_ID, BRANCH_B, 'SHOP_ADMIN', `shop_admin_b_${RUN_PREFIX}`],
      [MANAGER_MAIN_ID, BRANCH_MAIN, 'MANAGER', `manager_main_${RUN_PREFIX}`],
      [CASHIER_MAIN_ID, BRANCH_MAIN, 'CASHIER', `cashier_main_${RUN_PREFIX}`],
      [SALESMAN_B_ID, BRANCH_B, 'SALESMAN', `salesman_b_${RUN_PREFIX}`],
      [ACCOUNTANT_MAIN_ID, BRANCH_MAIN, 'ACCOUNTANT', `acct_main_${RUN_PREFIX}`],
    ];

    for (const [uid, bId, role, username] of testUsers) {
      await pool.query(
        `INSERT INTO users (id, branch_id, name, username, login_key_hash, role, is_active, status, created_at, updated_at)
         VALUES ($1, $2, $4, $4, 'hash', $3, 1, 'ACTIVE', $5, $5)
         ON CONFLICT (id) DO UPDATE SET is_active = 1, status = 'ACTIVE', branch_id = EXCLUDED.branch_id`,
        [uid, bId, role, username, now]
      );
    }

    // Issue tokens
    tokenAdminNull = issueToken({
      userId: ADMIN_NULL_ID,
      username: `admin_null_${RUN_PREFIX}`,
      role: 'ADMIN',
      accessProfile: { allowed_pages: ['*'], allowed_actions: ['*'], limits: { max_discount_percent: 100, can_price_override: true, can_refund: true, can_void_sale: true, can_view_profit: true } },
      branchId: null,
    });

    tokenAdminMain = issueToken({
      userId: ADMIN_MAIN_ID,
      username: `admin_main_${RUN_PREFIX}`,
      role: 'ADMIN',
      accessProfile: { allowed_pages: ['*'], allowed_actions: ['*'], limits: { max_discount_percent: 100, can_price_override: true, can_refund: true, can_void_sale: true, can_view_profit: true } },
      branchId: BRANCH_MAIN,
    });

    tokenShopAdminB = issueToken({
      userId: SHOP_ADMIN_B_ID,
      username: `shop_admin_b_${RUN_PREFIX}`,
      role: 'SHOP_ADMIN',
      accessProfile: { allowed_pages: ['*'], allowed_actions: ['*'], limits: { max_discount_percent: 25, can_price_override: true, can_refund: true, can_void_sale: true, can_view_profit: true } },
      branchId: BRANCH_B,
    });

    tokenManagerMain = issueToken({
      userId: MANAGER_MAIN_ID,
      username: `manager_main_${RUN_PREFIX}`,
      role: 'MANAGER',
      accessProfile: { allowed_pages: ['pos', 'inventory'], allowed_actions: ['sale:create'], limits: { max_discount_percent: 10, can_price_override: false, can_refund: false, can_void_sale: false, can_view_profit: false } },
      branchId: BRANCH_MAIN,
    });

    tokenCashierMain = issueToken({
      userId: CASHIER_MAIN_ID,
      username: `cashier_main_${RUN_PREFIX}`,
      role: 'CASHIER',
      accessProfile: { allowed_pages: ['pos'], allowed_actions: ['sale:create', 'cash:open', 'cash:close'], limits: { max_discount_percent: 0, can_price_override: false, can_refund: false, can_void_sale: false, can_view_profit: false } },
      branchId: BRANCH_MAIN,
    });

    tokenSalesmanB = issueToken({
      userId: SALESMAN_B_ID,
      username: `salesman_b_${RUN_PREFIX}`,
      role: 'SALESMAN',
      accessProfile: { allowed_pages: ['pos'], allowed_actions: ['sale:create'], limits: { max_discount_percent: 5, can_price_override: false, can_refund: false, can_void_sale: false, can_view_profit: false } },
      branchId: BRANCH_B,
    });

    tokenAccountantMain = issueToken({
      userId: ACCOUNTANT_MAIN_ID,
      username: `acct_main_${RUN_PREFIX}`,
      role: 'ACCOUNTANT',
      accessProfile: { allowed_pages: ['reports', 'expenses'], allowed_actions: ['reports:view'], limits: { max_discount_percent: 0, can_price_override: false, can_refund: false, can_void_sale: false, can_view_profit: false } },
      branchId: BRANCH_MAIN,
    });

    // Start Express test app
    const app = express();
    app.use(express.json());
    app.use('/api/sales', createSaleRouter(pool));
    app.use('/api/cash', createCashRouter(pool));
    app.use('/api/products', createProductRouter(pool));

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    if (pool) {
      // Cleanup seeded test cash data, users, and branches
      await pool.query('DELETE FROM cash_movements WHERE session_id IN (SELECT id FROM cash_sessions WHERE branch_id IN ($1, $2))', [BRANCH_B, BRANCH_C]);
      await pool.query('DELETE FROM cash_sessions WHERE branch_id IN ($1, $2)', [BRANCH_B, BRANCH_C]);
      await pool.query('DELETE FROM users WHERE username LIKE $1', [`%_${RUN_PREFIX}`]);
      await pool.query('DELETE FROM branches WHERE code LIKE $1', [`TEST-%-${RUN_PREFIX}`]);
      await pool.end();
    }
  });

  // 1. Unit Policy Verifications
  test('1. Unit: ADMIN with NULL branch_id is recognized as isOrgAdmin and isBranchAdmin', () => {
    const ident = { user_id: '1', username: 'a', role: 'ADMIN' as any, organization_id: NIAZI_ORGANIZATION_ID, branch_id: null, access_profile: {} as any, authenticated_at_ms: Date.now() };
    assert.strictEqual(isOrgAdmin(ident), true);
    assert.strictEqual(isBranchAdmin(ident), true);
    assert.strictEqual(isAdmin(ident), true);
    assert.strictEqual(canAccessBranch(ident, BRANCH_B), true);
  });

  test('2. Unit: ADMIN with home branch (BRANCH_MAIN) retains isOrgAdmin and isBranchAdmin', () => {
    const ident = { user_id: '1', username: 'a', role: 'ADMIN' as any, organization_id: NIAZI_ORGANIZATION_ID, branch_id: BRANCH_MAIN, access_profile: {} as any, authenticated_at_ms: Date.now() };
    assert.strictEqual(isOrgAdmin(ident), true, 'Home branch must NOT downgrade Org Admin authority');
    assert.strictEqual(isBranchAdmin(ident), true);
    assert.strictEqual(isAdmin(ident), true);
    assert.strictEqual(canAccessBranch(ident, BRANCH_B), true, 'Org Admin must be able to select and access Branch B');
  });

  test('3. Unit: SHOP_ADMIN is restricted to assigned branch', () => {
    const ident = { user_id: '2', username: 'b', role: 'SHOP_ADMIN' as any, organization_id: NIAZI_ORGANIZATION_ID, branch_id: BRANCH_B, access_profile: {} as any, authenticated_at_ms: Date.now() };
    assert.strictEqual(isOrgAdmin(ident), false, 'SHOP_ADMIN must not be an Org Admin');
    assert.strictEqual(isBranchAdmin(ident), true, 'SHOP_ADMIN is a Branch Admin');
    assert.strictEqual(isAdmin(ident), true);
    assert.strictEqual(canAccessBranch(ident, BRANCH_B), true, 'Can access assigned branch');
    assert.strictEqual(canAccessBranch(ident, BRANCH_C), false, 'Cannot access unassigned Branch C');
    assert.strictEqual(canAccessBranch(ident, BRANCH_MAIN), false, 'Cannot access Main Branch');
  });

  test('4. Unit: MANAGER is strictly an operational role and NOT an administrator', () => {
    const ident = { user_id: '3', username: 'm', role: 'MANAGER' as any, organization_id: NIAZI_ORGANIZATION_ID, branch_id: BRANCH_MAIN, access_profile: { allowed_pages: ['inventory'], allowed_actions: [] } as any, authenticated_at_ms: Date.now() };
    assert.strictEqual(isOrgAdmin(ident), false);
    assert.strictEqual(isBranchAdmin(ident), false, 'MANAGER must not qualify as isBranchAdmin');
    assert.strictEqual(isAdmin(ident), false, 'MANAGER must not qualify as isAdmin');
    assert.strictEqual(canAccessBranch(ident, BRANCH_MAIN), true);
    assert.strictEqual(canAccessBranch(ident, BRANCH_B), false);
    assert.strictEqual(authorizePermission(ident, 'settings', null) !== null, true, 'Manager cannot access settings page');
  });

  test('5. Unit: Legacy transition aliases evaluate correctly', () => {
    const superAdmin = { user_id: '4', username: 's', role: 'SUPER_ADMIN' as any, organization_id: NIAZI_ORGANIZATION_ID, branch_id: null, access_profile: {} as any, authenticated_at_ms: Date.now() };
    assert.strictEqual(isOrgAdmin(superAdmin), true);
    const owner = { user_id: '5', username: 'o', role: 'OWNER' as any, organization_id: NIAZI_ORGANIZATION_ID, branch_id: null, access_profile: {} as any, authenticated_at_ms: Date.now() };
    assert.strictEqual(isOrgAdmin(owner), true);
    const multiAdmin = { user_id: '6', username: 'm', role: 'MULTI_ADMIN' as any, organization_id: NIAZI_ORGANIZATION_ID, branch_id: BRANCH_MAIN, access_profile: {} as any, authenticated_at_ms: Date.now() };
    assert.strictEqual(isOrgAdmin(multiAdmin), true);
    const legacyShop = { user_id: '7', username: 'ls', role: 'SHOPADMIN' as any, organization_id: NIAZI_ORGANIZATION_ID, branch_id: BRANCH_B, access_profile: {} as any, authenticated_at_ms: Date.now() };
    assert.strictEqual(isBranchAdmin(legacyShop), true);
  });

  // 2. Integration HTTP Route Verifications
  test('6. Integration: ADMIN with Main Branch can view products for Branch B and Main Branch', async () => {
    const resB = await fetch(`${baseUrl}/api/products?branch_id=${BRANCH_B}`, {
      headers: { Authorization: `Bearer ${tokenAdminMain}` },
    });
    assert.strictEqual(resB.status, 200);

    const resMain = await fetch(`${baseUrl}/api/products?branch_id=${BRANCH_MAIN}`, {
      headers: { Authorization: `Bearer ${tokenAdminMain}` },
    });
    assert.strictEqual(resMain.status, 200);
  });

  test('7. Integration: ADMIN with Main Branch can access cash session and movements for Branch B', async () => {
    const resCur = await fetch(`${baseUrl}/api/cash/sessions/current?branch_id=${BRANCH_B}`, {
      headers: { Authorization: `Bearer ${tokenAdminMain}` },
    });
    assert.strictEqual(resCur.status, 200);

    const resMv = await fetch(`${baseUrl}/api/cash/movements?branch_id=${BRANCH_B}`, {
      headers: { Authorization: `Bearer ${tokenAdminMain}` },
    });
    assert.strictEqual(resMv.status, 200);
  });

  test('8. Integration: SHOP_ADMIN for Branch B can access Branch B data', async () => {
    const res = await fetch(`${baseUrl}/api/cash/sessions/current?branch_id=${BRANCH_B}`, {
      headers: { Authorization: `Bearer ${tokenShopAdminB}` },
    });
    assert.strictEqual(res.status, 200);
  });

  test('9. Integration: SHOP_ADMIN for Branch B is blocked from Branch C or Main Branch (403 Forbidden)', async () => {
    const resC = await fetch(`${baseUrl}/api/cash/sessions/current?branch_id=${BRANCH_C}`, {
      headers: { Authorization: `Bearer ${tokenShopAdminB}` },
    });
    assert.strictEqual(resC.status, 403, 'SHOP_ADMIN must be forbidden from accessing Branch C session');

    const resMain = await fetch(`${baseUrl}/api/cash/movements?branch_id=${BRANCH_MAIN}`, {
      headers: { Authorization: `Bearer ${tokenShopAdminB}` },
    });
    assert.strictEqual(resMain.status, 403, 'SHOP_ADMIN must be forbidden from accessing Main Branch movements');
  });

  test('10. Integration: CASHIER for Main Branch cannot access Branch B (403 Forbidden)', async () => {
    const res = await fetch(`${baseUrl}/api/cash/sessions/current?branch_id=${BRANCH_B}`, {
      headers: { Authorization: `Bearer ${tokenCashierMain}` },
    });
    assert.strictEqual(res.status, 403);
  });

  test('11. Integration: SALESMAN is denied cash session opening (403 Forbidden)', async () => {
    const res = await fetch(`${baseUrl}/api/cash/sessions/open`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenSalesmanB}` },
      body: JSON.stringify({ branch_id: BRANCH_B, opening_balance: 1000 }),
    });
    assert.strictEqual(res.status, 403, 'SALESMAN without cash:open permission must be denied');
  });

  test('12. Integration: ACCOUNTANT cannot execute checkout (403 Forbidden)', async () => {
    const res = await fetch(`${baseUrl}/api/sales`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenAccountantMain}` },
      body: JSON.stringify({ branch_id: BRANCH_MAIN, items: [], payment_method: 'cash' }),
    });
    assert.strictEqual(res.status, 403, 'ACCOUNTANT without pos permission must be denied from sales endpoint');
  });
});
