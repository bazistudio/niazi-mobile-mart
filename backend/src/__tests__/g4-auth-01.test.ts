import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isOrgAdmin,
  isBranchAdmin,
  isAdmin,
  canAccessBranch,
  authorizeProductMutation,
  authorizePermission,
  buildAuthMiddleware,
  getCanonicalUserRole,
  ROLE_CANONICAL_MAP,
  CANONICAL_USER_ROLES,
  BLOCKED_LEGACY_ADMIN_ROLES,
  RESTRICTED_ADMIN_PAGES,
  RESTRICTED_ADMIN_ACTIONS,
  ORG_ADMIN_ONLY_PAGES,
  ORG_ADMIN_ONLY_ACTIONS,
  UserRole,
  RequestIdentity,
  NIAZI_ORGANIZATION_ID,
} from '../auth.js';
import type { Request, Response, NextFunction } from 'express';
import type { Pool } from 'pg';

describe('G4-AUTH-03 Phase 4.4.3: Explicit Administrative Revocation & SHOP_ADMIN Scope Enforcement', () => {

  function createTestIdentity(overrides: Partial<RequestIdentity> = {}): RequestIdentity {
    return {
      user_id: 'user-uuid-123',
      username: 'test_user',
      role: 'CASHIER',
      organization_id: NIAZI_ORGANIZATION_ID,
      branch_id: 'branch-101',
      access_profile: {
        allowed_pages: ['pos'],
        allowed_actions: ['sales:create'],
        limits: {
          max_discount_percent: 10,
          can_price_override: false,
          can_refund: false,
          can_void_sale: false,
          can_view_profit: false
        }
      },
      authenticated_at_ms: Date.now(),
      ...overrides
    };
  }

  describe('Page Authorization Matrix (Tests 1 - 8)', () => {
    // 1. CASHIER + stale explicit settings grant -> DENY
    it('1. CASHIER + stale explicit settings grant -> DENY', () => {
      const cashierWithSettings = createTestIdentity({
        role: 'CASHIER',
        access_profile: {
          allowed_pages: ['settings', 'pos'],
          allowed_actions: ['pos:sale'],
          limits: { max_discount_percent: 5, can_price_override: false, can_refund: false, can_void_sale: false, can_view_profit: false }
        }
      });
      const denied = authorizePermission(cashierWithSettings, 'settings', null);
      assert.match(denied || '', /Access denied: You do not have permission to access page 'settings'/);
    });

    // 2. CASHIER + stale explicit users grant -> DENY
    it('2. CASHIER + stale explicit users grant -> DENY', () => {
      const cashierWithUsers = createTestIdentity({
        role: 'CASHIER',
        access_profile: {
          allowed_pages: ['users', 'pos'],
          allowed_actions: ['pos:sale'],
          limits: { max_discount_percent: 5, can_price_override: false, can_refund: false, can_void_sale: false, can_view_profit: false }
        }
      });
      const denied = authorizePermission(cashierWithUsers, 'users', null);
      assert.match(denied || '', /Access denied: You do not have permission to access page 'users'/);
    });

    // 3. CASHIER + stale explicit roles grant -> DENY
    it('3. CASHIER + stale explicit roles grant -> DENY', () => {
      const cashierWithRoles = createTestIdentity({
        role: 'CASHIER',
        access_profile: {
          allowed_pages: ['roles', 'pos'],
          allowed_actions: ['pos:sale'],
          limits: { max_discount_percent: 5, can_price_override: false, can_refund: false, can_void_sale: false, can_view_profit: false }
        }
      });
      const denied = authorizePermission(cashierWithRoles, 'roles', null);
      assert.match(denied || '', /Access denied: You do not have permission to access page 'roles'/);
    });

    // 4. CASHIER + stale explicit audit grant -> DENY
    it('4. CASHIER + stale explicit audit grant -> DENY', () => {
      const cashierWithAudit = createTestIdentity({
        role: 'CASHIER',
        access_profile: {
          allowed_pages: ['audit', 'pos'],
          allowed_actions: ['pos:sale'],
          limits: { max_discount_percent: 5, can_price_override: false, can_refund: false, can_void_sale: false, can_view_profit: false }
        }
      });
      const denied = authorizePermission(cashierWithAudit, 'audit', null);
      assert.match(denied || '', /Access denied: You do not have permission to access page 'audit'|Organization administrator/);
    });

    // 5. CASHIER + stale explicit branches grant -> DENY
    it('5. CASHIER + stale explicit branches grant -> DENY', () => {
      const cashierWithBranches = createTestIdentity({
        role: 'CASHIER',
        access_profile: {
          allowed_pages: ['branches', 'pos'],
          allowed_actions: ['pos:sale'],
          limits: { max_discount_percent: 5, can_price_override: false, can_refund: false, can_void_sale: false, can_view_profit: false }
        }
      });
      const denied = authorizePermission(cashierWithBranches, 'branches', null);
      assert.match(denied || '', /Access denied: You do not have permission to access page 'branches'|Organization administrator/);
    });

    // 6. CASHIER + legitimate pos grant -> preserve existing permitted behavior
    it('6. CASHIER + legitimate pos grant -> preserve existing permitted behavior', () => {
      const cashierValid = createTestIdentity({
        role: 'CASHIER',
        access_profile: {
          allowed_pages: ['pos'],
          allowed_actions: ['pos:sale'],
          limits: { max_discount_percent: 5, can_price_override: false, can_refund: false, can_void_sale: false, can_view_profit: false }
        }
      });
      assert.equal(authorizePermission(cashierValid, 'pos', null), null);
    });

    // 7. SHOP_ADMIN + organization-wide ADMIN-only page grant -> DENY
    it('7. SHOP_ADMIN + organization-wide ADMIN-only page grant -> DENY', () => {
      const shopAdmin = createTestIdentity({
        role: 'SHOP_ADMIN',
        access_profile: {
          allowed_pages: ['audit', 'branches', 'dashboard'],
          allowed_actions: [],
          limits: { max_discount_percent: 25, can_price_override: true, can_refund: true, can_void_sale: true, can_view_profit: true }
        }
      });
      const deniedAudit = authorizePermission(shopAdmin, 'audit', null);
      assert.match(deniedAudit || '', /Organization administrator authority required/);

      const deniedBranches = authorizePermission(shopAdmin, 'branches', null);
      assert.match(deniedBranches || '', /Organization administrator authority required/);
    });

    // 8. SHOP_ADMIN + legitimate branch administration page -> preserve
    it('8. SHOP_ADMIN + legitimate branch administration page -> preserve', () => {
      const shopAdmin = createTestIdentity({
        role: 'SHOP_ADMIN',
        access_profile: {
          allowed_pages: ['dashboard', 'pos', 'settings', 'expenses'],
          allowed_actions: [],
          limits: { max_discount_percent: 25, can_price_override: true, can_refund: true, can_void_sale: true, can_view_profit: true }
        }
      });
      assert.equal(authorizePermission(shopAdmin, 'settings', null), null);
      assert.equal(authorizePermission(shopAdmin, 'pos', null), null);
      assert.equal(authorizePermission(shopAdmin, 'dashboard', null), null);
    });
  });

  describe('Action Authorization Matrix (Tests 9 - 14)', () => {
    // 9. CASHIER + stale explicit user-management action -> DENY
    it('9. CASHIER + stale explicit user-management action -> DENY', () => {
      const cashierWithUserAction = createTestIdentity({
        role: 'CASHIER',
        access_profile: {
          allowed_pages: ['pos'],
          allowed_actions: ['users:delete', 'pos:sale'],
          limits: { max_discount_percent: 5, can_price_override: false, can_refund: false, can_void_sale: false, can_view_profit: false }
        }
      });
      const denied = authorizePermission(cashierWithUserAction, null, 'users:delete');
      assert.match(denied || '', /Access denied: You do not have permission to execute action 'users:delete'/);
    });

    // 10. CASHIER + stale explicit role-management action -> DENY
    it('10. CASHIER + stale explicit role-management action -> DENY', () => {
      const cashierWithRoleAction = createTestIdentity({
        role: 'CASHIER',
        access_profile: {
          allowed_pages: ['pos'],
          allowed_actions: ['roles:edit', 'pos:sale'],
          limits: { max_discount_percent: 5, can_price_override: false, can_refund: false, can_void_sale: false, can_view_profit: false }
        }
      });
      const denied = authorizePermission(cashierWithRoleAction, null, 'roles:edit');
      assert.match(denied || '', /Access denied: You do not have permission to execute action 'roles:edit'|Organization administrator/);
    });

    // 11. CASHIER + stale explicit branch-management action -> DENY
    it('11. CASHIER + stale explicit branch-management action -> DENY', () => {
      const cashierWithBranchAction = createTestIdentity({
        role: 'CASHIER',
        access_profile: {
          allowed_pages: ['pos'],
          allowed_actions: ['branches:manage', 'pos:sale'],
          limits: { max_discount_percent: 5, can_price_override: false, can_refund: false, can_void_sale: false, can_view_profit: false }
        }
      });
      const denied = authorizePermission(cashierWithBranchAction, null, 'branches:manage');
      assert.match(denied || '', /Access denied: You do not have permission to execute action 'branches:manage'|Organization administrator/);
    });

    // 12. CASHIER + legitimate POS action -> preserve permitted behavior
    it('12. CASHIER + legitimate POS action -> preserve permitted behavior', () => {
      const cashierWithPosAction = createTestIdentity({
        role: 'CASHIER',
        access_profile: {
          allowed_pages: ['pos'],
          allowed_actions: ['pos:sale', 'cash:open'],
          limits: { max_discount_percent: 5, can_price_override: false, can_refund: false, can_void_sale: false, can_view_profit: false }
        }
      });
      assert.equal(authorizePermission(cashierWithPosAction, null, 'pos:sale'), null);
      assert.equal(authorizePermission(cashierWithPosAction, null, 'cash:open'), null);
    });

    // 13. SHOP_ADMIN + organization-wide ADMIN-only action -> DENY
    it('13. SHOP_ADMIN + organization-wide ADMIN-only action -> DENY', () => {
      const shopAdmin = createTestIdentity({
        role: 'SHOP_ADMIN',
        access_profile: {
          allowed_pages: ['dashboard'],
          allowed_actions: ['products:delete', 'roles:edit', 'branches:manage'],
          limits: { max_discount_percent: 25, can_price_override: true, can_refund: true, can_void_sale: true, can_view_profit: true }
        }
      });
      const deniedProd = authorizePermission(shopAdmin, null, 'products:delete');
      assert.match(deniedProd || '', /Organization administrator authority required/);

      const deniedRole = authorizePermission(shopAdmin, null, 'roles:edit');
      assert.match(deniedRole || '', /Organization administrator authority required/);

      const deniedBranch = authorizePermission(shopAdmin, null, 'branches:manage');
      assert.match(deniedBranch || '', /Organization administrator authority required/);
    });

    // 14. SHOP_ADMIN + legitimate branch-scoped action -> preserve
    it('14. SHOP_ADMIN + legitimate branch-scoped action -> preserve', () => {
      const shopAdmin = createTestIdentity({
        role: 'SHOP_ADMIN',
        access_profile: {
          allowed_pages: ['pos'],
          allowed_actions: ['pos:sale', 'cash:manage', 'expense:create'],
          limits: { max_discount_percent: 25, can_price_override: true, can_refund: true, can_void_sale: true, can_view_profit: true }
        }
      });
      assert.equal(authorizePermission(shopAdmin, null, 'pos:sale'), null);
      assert.equal(authorizePermission(shopAdmin, null, 'cash:manage'), null);
      assert.equal(authorizePermission(shopAdmin, null, 'expense:create'), null);
    });
  });

  describe('Isolation and Product Mutation Matrix (Tests 15 - 18)', () => {
    // 15. SHOP_ADMIN cannot access another branch
    it('15. SHOP_ADMIN cannot access another branch', () => {
      const shopAdmin = createTestIdentity({
        role: 'SHOP_ADMIN',
        branch_id: 'branch-101'
      });
      assert.equal(canAccessBranch(shopAdmin, 'branch-101'), true);
      assert.equal(canAccessBranch(shopAdmin, 'branch-102'), false);
      assert.equal(canAccessBranch(shopAdmin, null), false);
      assert.equal(canAccessBranch(shopAdmin, ''), false);
    });

    // 16. CASHIER cannot access another branch
    it('16. CASHIER cannot access another branch', () => {
      const cashier = createTestIdentity({
        role: 'CASHIER',
        branch_id: 'branch-101'
      });
      assert.equal(canAccessBranch(cashier, 'branch-101'), true);
      assert.equal(canAccessBranch(cashier, 'branch-102'), false);
      assert.equal(canAccessBranch(cashier, null), false);
    });

    // 17. Foreign organization identity remains rejected
    it('17. Foreign organization identity remains rejected', () => {
      const foreignAdmin = createTestIdentity({
        organization_id: '00000000-0000-0000-0000-888888888888',
        role: 'ADMIN',
        branch_id: 'branch-101'
      });
      assert.equal(canAccessBranch(foreignAdmin, 'branch-101'), false);
    });

    // 18. Product mutation remains denied for non-org-admin roles
    it('18. Product mutation remains denied for non-org-admin roles', () => {
      const shopAdmin = createTestIdentity({ role: 'SHOP_ADMIN' });
      const cashier = createTestIdentity({ role: 'CASHIER' });
      const orgAdmin = createTestIdentity({ role: 'ADMIN' });

      assert.match(authorizeProductMutation(shopAdmin, 'products', 'products:edit') || '', /Only organization administrators/);
      assert.match(authorizeProductMutation(cashier, 'products', 'products:delete') || '', /Only organization administrators/);
      assert.equal(authorizeProductMutation(orgAdmin, 'products', 'products:edit'), null);
    });
  });
});
