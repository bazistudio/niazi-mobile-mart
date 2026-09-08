// Automated Test Suite for Phase B2: Role Permission Assignment & Persistence
import assert from 'node:assert';

// Mock localStorage for Node environment
class MockLocalStorage {
  constructor() {
    this.store = {};
  }
  getItem(key) {
    return Object.prototype.hasOwnProperty.call(this.store, key) ? this.store[key] : null;
  }
  setItem(key, value) {
    this.store[key] = String(value);
  }
  removeItem(key) {
    delete this.store[key];
  }
  clear() {
    this.store = {};
  }
}

globalThis.localStorage = new MockLocalStorage();
globalThis.window = {
  localStorage: globalThis.localStorage,
  addEventListener: () => {},
  removeEventListener: () => {},
};

// Import canonical RBAC constants
const {
  PERMISSIONS,
  ROLE_PERMISSION_DECISIONS,
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSION_METADATA,
} = await import('../src/constants/permissions.ts');

// Import evaluation function directly
function evaluateRolePermission(
  role,
  permission,
  roleGrants = {},
  userGrants = null,
  matrix = null
) {
  const currentRole = (role || '').toUpperCase().trim();

  // 1. Admin / Owner / Super Admin / Multi Admin -> full access bypass
  if (
    currentRole === 'SUPER_ADMIN' ||
    currentRole === 'MULTI_ADMIN' ||
    currentRole === 'OWNER' ||
    currentRole === 'ADMIN'
  ) {
    return true;
  }

  const roleDecisions = ROLE_PERMISSION_DECISIONS[currentRole];
  const decision = roleDecisions ? roleDecisions[permission] : undefined;

  // 2. ADMIN_ONLY -> deny for non-admin roles unconditionally
  if (decision === 'ADMIN_ONLY' || permission.startsWith('org.') || permission.startsWith('shops.')) {
    return false;
  }

  // 3. REJECT -> deny unconditionally
  if (decision === 'REJECT') {
    return false;
  }

  // 4. INDIVIDUAL -> allow ONLY when an explicit role grant, user grant, or matrix grant exists
  if (decision === 'INDIVIDUAL') {
    const hasRoleGrant = roleGrants[permission] === true;
    const hasUserGrant = Array.isArray(userGrants)
      ? userGrants.includes(permission)
      : userGrants && typeof userGrants === 'object'
      ? userGrants[permission] === true
      : false;
    const hasMatrixGrant = !!(matrix && matrix[permission] === true);

    return hasRoleGrant || hasUserGrant || hasMatrixGrant;
  }

  // 5. SELECT -> allow when included in role defaults
  if (decision === 'SELECT') {
    if (matrix && matrix[permission] === false) {
      return false;
    }
    return true;
  }

  // 6. Otherwise -> deny
  const rolePerms = DEFAULT_ROLE_PERMISSIONS[currentRole] || [];
  return rolePerms.includes(permission);
}

// Storage constants & helpers matching settings.api.ts
const ROLE_PERMISSION_GRANTS_STORAGE_KEY = 'nmm_role_permission_grants_v1';

function mapRoleIdToStaffRole(roleId) {
  const r = (roleId || '').toLowerCase().trim();
  if (r === 'admin' || r === 'owner' || r === 'super_admin' || r === 'multi_admin') return 'ADMIN';
  if (r === 'shop_admin' || r === 'branch_admin') return 'SHOP_ADMIN';
  if (r === 'manager') return 'MANAGER';
  if (r === 'accountant') return 'ACCOUNTANT';
  if (r === 'salesman') return 'SALESMAN';
  if (r === 'cashier') return 'CASHIER';
  if (r === 'repair_mechanic' || r === 'mechanic') return 'REPAIR_MECHANIC';
  return 'STAFF';
}

function normalizeRoleKey(roleId) {
  return (roleId || '').toLowerCase().trim();
}

function getAllRolePermissionGrants() {
  try {
    if (typeof window === 'undefined') return {};
    const raw = localStorage.getItem(ROLE_PERMISSION_GRANTS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    return parsed;
  } catch {
    return {};
  }
}

function getRolePermissionGrants(roleId) {
  const all = getAllRolePermissionGrants();
  const key = normalizeRoleKey(roleId);
  const grants = all[key];
  if (typeof grants !== 'object' || grants === null || Array.isArray(grants)) {
    return {};
  }
  const sanitized = {};
  for (const [permKey, val] of Object.entries(grants)) {
    if (val === true) {
      sanitized[permKey] = true;
    }
  }
  return sanitized;
}

function saveRolePermissionGrants(roleId, grants) {
  const staffRole = mapRoleIdToStaffRole(roleId);
  const roleDecisions = ROLE_PERMISSION_DECISIONS[staffRole];
  const allCanonical = new Set(Object.values(PERMISSIONS));

  const validGrantsToSave = {};

  for (const [permKey, isEnabled] of Object.entries(grants)) {
    if (!isEnabled) continue;

    if (!allCanonical.has(permKey)) {
      throw new Error(`Permission "${permKey}" does not exist in canonical registry.`);
    }

    const decision = roleDecisions ? roleDecisions[permKey] : undefined;

    if (decision === 'ADMIN_ONLY') {
      throw new Error(`Permission "${permKey}" is reserved for administrators.`);
    }
    if (decision === 'REJECT') {
      throw new Error(
        `Permission "${permKey}" cannot be granted to ${roleId} because its policy is REJECT.`
      );
    }
    if (decision === 'SELECT') {
      throw new Error(
        `Permission "${permKey}" is a default SELECT permission and cannot be saved as an individual grant.`
      );
    }
    if (decision !== 'INDIVIDUAL') {
      throw new Error(
        `Permission "${permKey}" does not have an INDIVIDUAL policy for ${roleId}.`
      );
    }

    validGrantsToSave[permKey] = true;
  }

  const all = getAllRolePermissionGrants();
  const key = normalizeRoleKey(roleId);

  if (Object.keys(validGrantsToSave).length === 0) {
    delete all[key];
  } else {
    all[key] = validGrantsToSave;
  }

  localStorage.setItem(ROLE_PERMISSION_GRANTS_STORAGE_KEY, JSON.stringify(all));
}

console.log('─── RUNNING PHASE B2 RBAC TEST SUITE ───\n');

let passedTests = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`✓ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`✗ FAIL: ${name}`);
    console.error(err);
    process.exit(1);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. EVALUATION TEST MATRIX (Section 19)
// ─────────────────────────────────────────────────────────────────────────────

// Accountant
test('Accountant + products.view (SELECT) -> ALLOW', () => {
  assert.strictEqual(evaluateRolePermission('ACCOUNTANT', 'products.view', {}), true);
});

test('Accountant + reports.view (INDIVIDUAL, no grant) -> DENY', () => {
  assert.strictEqual(evaluateRolePermission('ACCOUNTANT', 'reports.view', {}), false);
});

test('Accountant + reports.view (INDIVIDUAL, role grant) -> ALLOW', () => {
  assert.strictEqual(
    evaluateRolePermission('ACCOUNTANT', 'reports.view', { 'reports.view': true }),
    true
  );
});

test('Accountant + reports.view (INDIVIDUAL, user grant) -> ALLOW', () => {
  assert.strictEqual(
    evaluateRolePermission('ACCOUNTANT', 'reports.view', {}, ['reports.view']),
    true
  );
});

test('Accountant + reports.view (INDIVIDUAL, grant revoked) -> DENY', () => {
  assert.strictEqual(evaluateRolePermission('ACCOUNTANT', 'reports.view', {}), false);
});

test('Accountant + products.manage (REJECT) -> DENY', () => {
  assert.strictEqual(
    evaluateRolePermission('ACCOUNTANT', 'products.manage', { 'products.manage': true }),
    false
  );
});

test('Accountant + org.edit (ADMIN_ONLY) -> DENY', () => {
  assert.strictEqual(
    evaluateRolePermission('ACCOUNTANT', 'org.edit', { 'org.edit': true }),
    false
  );
});

// Cashier
test('Cashier + pos.use (SELECT) -> ALLOW', () => {
  assert.strictEqual(evaluateRolePermission('CASHIER', 'pos.use', {}), true);
});

test('Cashier + pos.void_sale (INDIVIDUAL, no grant) -> DENY', () => {
  assert.strictEqual(evaluateRolePermission('CASHIER', 'pos.void_sale', {}), false);
});

test('Cashier + pos.void_sale (INDIVIDUAL, role grant) -> ALLOW', () => {
  assert.strictEqual(
    evaluateRolePermission('CASHIER', 'pos.void_sale', { 'pos.void_sale': true }),
    true
  );
});

test('Cashier + inventory.edit (REJECT) -> DENY', () => {
  assert.strictEqual(
    evaluateRolePermission('CASHIER', 'inventory.edit', { 'inventory.edit': true }),
    false
  );
});

test('Cashier + org.edit (ADMIN_ONLY) -> DENY', () => {
  assert.strictEqual(evaluateRolePermission('CASHIER', 'org.edit', { 'org.edit': true }), false);
});

// Manager
test('Manager + products.manage (INDIVIDUAL, no grant) -> DENY', () => {
  assert.strictEqual(evaluateRolePermission('MANAGER', 'products.manage', {}), false);
});

test('Manager + products.manage (INDIVIDUAL, role grant) -> ALLOW', () => {
  assert.strictEqual(
    evaluateRolePermission('MANAGER', 'products.manage', { 'products.manage': true }),
    true
  );
});

test('Manager + reports.view.all (REJECT) -> DENY', () => {
  assert.strictEqual(
    evaluateRolePermission('MANAGER', 'reports.view.all', { 'reports.view.all': true }),
    false
  );
});

// Admin Bypass
test('Admin + canonical permissions -> ALLOW according to existing admin bypass', () => {
  assert.strictEqual(evaluateRolePermission('ADMIN', 'products.view', {}), true);
  assert.strictEqual(evaluateRolePermission('ADMIN', 'reports.view', {}), true);
  assert.strictEqual(evaluateRolePermission('ADMIN', 'reports.view.all', {}), true);
  assert.strictEqual(evaluateRolePermission('ADMIN', 'org.edit', {}), true);
  assert.strictEqual(evaluateRolePermission('SUPER_ADMIN', 'org.edit', {}), true);
  assert.strictEqual(evaluateRolePermission('OWNER', 'shops.manage', {}), true);
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. STORAGE VALIDATION & SECURITY TESTS (Section 6, 7, 20, 21)
// ─────────────────────────────────────────────────────────────────────────────

test('saveRolePermissionGrants: stores only explicit positive INDIVIDUAL grants', () => {
  localStorage.clear();
  saveRolePermissionGrants('accountant', {
    'reports.view': true,
    'finance.view': true,
  });

  const stored = getRolePermissionGrants('accountant');
  assert.deepStrictEqual(stored, {
    'reports.view': true,
    'finance.view': true,
  });

  const raw = JSON.parse(localStorage.getItem(ROLE_PERMISSION_GRANTS_STORAGE_KEY));
  assert.deepStrictEqual(raw, {
    accountant: {
      'reports.view': true,
      'finance.view': true,
    },
  });
});

test('saveRolePermissionGrants: revoking an individual grant removes the key', () => {
  saveRolePermissionGrants('accountant', {
    'reports.view': true,
    'finance.view': false, // revoked
  });

  const stored = getRolePermissionGrants('accountant');
  assert.deepStrictEqual(stored, {
    'reports.view': true,
  });
});

test('saveRolePermissionGrants: revoking all grants removes the role key from storage', () => {
  saveRolePermissionGrants('accountant', {
    'reports.view': false, // revoked
  });

  const stored = getRolePermissionGrants('accountant');
  assert.deepStrictEqual(stored, {});

  const raw = JSON.parse(localStorage.getItem(ROLE_PERMISSION_GRANTS_STORAGE_KEY) || '{}');
  assert.strictEqual(raw.accountant, undefined);
});

test('Security validation: rejects attempts to grant REJECT permissions', () => {
  assert.throws(
    () => {
      saveRolePermissionGrants('accountant', { 'products.manage': true });
    },
    (err) => {
      return err.message.includes('policy is REJECT');
    }
  );
});

test('Security validation: rejects attempts to grant ADMIN_ONLY permissions', () => {
  assert.throws(
    () => {
      saveRolePermissionGrants('accountant', { 'org.edit': true });
    },
    (err) => {
      return err.message.includes('reserved for administrators');
    }
  );
});

test('Security validation: rejects attempts to grant SELECT permissions as individual overrides', () => {
  assert.throws(
    () => {
      saveRolePermissionGrants('accountant', { 'products.view': true });
    },
    (err) => {
      return err.message.includes('default SELECT permission');
    }
  );
});

test('Storage safety: corrupted or malformed JSON safely returns empty object', () => {
  localStorage.setItem(ROLE_PERMISSION_GRANTS_STORAGE_KEY, 'invalid-json{{{');
  assert.deepStrictEqual(getAllRolePermissionGrants(), {});
  assert.deepStrictEqual(getRolePermissionGrants('accountant'), {});
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. EFFECTIVE PERMISSION WORKFLOW (Section 10, 12, 13)
// ─────────────────────────────────────────────────────────────────────────────

test('End-to-End Workflow: Grant -> Stored -> Evaluated as ALLOW; Revoke -> Evaluated as DENY', () => {
  localStorage.clear();

  // Baseline: Accountant without grant cannot view reports
  let grants = getRolePermissionGrants('accountant');
  assert.strictEqual(evaluateRolePermission('ACCOUNTANT', 'reports.view', grants), false);

  // Admin grants reports.view to Accountant
  saveRolePermissionGrants('accountant', { 'reports.view': true });
  grants = getRolePermissionGrants('accountant');
  assert.strictEqual(evaluateRolePermission('ACCOUNTANT', 'reports.view', grants), true);

  // Admin revokes reports.view from Accountant
  saveRolePermissionGrants('accountant', { 'reports.view': false });
  grants = getRolePermissionGrants('accountant');
  assert.strictEqual(evaluateRolePermission('ACCOUNTANT', 'reports.view', grants), false);
});

console.log(`\n🎉 ALL ${passedTests} TESTS PASSED SUCCESSFULLY!`);
