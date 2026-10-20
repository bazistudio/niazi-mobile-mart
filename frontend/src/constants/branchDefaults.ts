/**
 * Canonical identifier for the Main Branch.
 *
 * This UUID is the stable, permanently seeded identifier for the Main Branch:
 *   - PostgreSQL migration 001_initial_schema.sql seeds it as '00000000-0000-0000-0000-000000000002'
 *   - Rust constant DEFAULT_MAIN_BRANCH_ID matches
 *   - backend/src/routes/sync.routes.ts and settings.repo.ts reference the same value
 *
 * Do not use branch name or code ('MAIN') for comparison — use this ID.
 */
export const MAIN_BRANCH_ID = '00000000-0000-0000-0000-000000000002';

/**
 * The default navigation destinations for non-Main branches.
 *
 * Non-Main branch staff see only these destinations by default.
 * Existing permission checks on each item remain enforced — this list
 * does not grant any new permissions.
 *
 * Main Branch retains the full navigation set and is not filtered.
 *
 * Customer Ledger is not listed here because it is accessed through
 * /dashboard/shop-admin/customers/:id (customer detail), not as a
 * standalone parameterized default destination.
 *
 * Business Ledger (/dashboard/shop-admin/ledger) shows org-wide party
 * directories (customers/suppliers — intentionally org-scoped) and
 * branch-scoped expenses (resolveBranch() enforced on the backend).
 * Individual party ledger statements are keyed by party ID and carry
 * all entries regardless of branch; branch staff should be aware they
 * see org-wide party history. The existing FINANCE_VIEW / REPORTS_VIEW
 * PermissionGuard remains active and is not weakened by this entry.
 *
 * Cash Management (/dashboard/shop-admin/cash) is branch-scoped at the
 * backend: every cash-session, drawer, and movement query is gated by
 * canAccessBranch(identity, targetBranchId) which enforces
 * identity.branch_id === targetBranchId for non-org-admin users.
 * The existing FINANCE_VIEW PermissionGuard on the route is not weakened.
 */
export const NON_MAIN_BRANCH_DEFAULT_HREFS: ReadonlySet<string> = new Set([
  '/dashboard/shop-admin',              // Dashboard
  '/dashboard/shop-admin/pos',          // POS / Sales
  '/dashboard/shop-admin/sales',        // Sales Analytics
  '/dashboard/shop-admin/mobiles',      // Mobile Inventory (available across all branches)
  '/dashboard/shop-admin/inventory',    // Products & Stock
  '/dashboard/shop-admin/stock',        // Stock
  '/dashboard/shop-admin/history',      // Sales History (backend already enforces branch scope)
  '/dashboard/shop-admin/customers',    // Customer Directory (backend enforces branch scope)
  '/dashboard/shop-admin/expenses',     // Branch Expenses (backend auto-attributes to branch)
  '/dashboard/shop-admin/settings',     // Branch Settings (printer / invoice config)
  '/dashboard/shop-admin/ledger',       // Business Ledger (org-wide parties; branch-scoped expenses)
  '/dashboard/shop-admin/cash',         // Cash Management (backend enforces branch scope via canAccessBranch)
]);

/**
 * Returns true when the given branch ID or Shop object is the canonical Main Branch.
 * Safely handles null, undefined, empty string, and Shop object.
 */
export function isMainBranch(
  branchIdOrShop: string | { _id?: string; id?: string; name?: string; code?: string } | null | undefined
): boolean {
  if (!branchIdOrShop) return false;
  if (typeof branchIdOrShop === 'object') {
    const id = branchIdOrShop._id || branchIdOrShop.id;
    if (id && id.trim() === MAIN_BRANCH_ID) return true;
    if (branchIdOrShop.name && branchIdOrShop.name.trim().toLowerCase() === 'main branch') return true;
    if (branchIdOrShop.code && branchIdOrShop.code.trim().toUpperCase() === 'MAIN') return true;
    return false;
  }
  if (typeof branchIdOrShop === 'string') {
    const trimmed = branchIdOrShop.trim();
    return (
      trimmed === MAIN_BRANCH_ID ||
      trimmed.toLowerCase() === 'main branch' ||
      trimmed.toUpperCase() === 'MAIN'
    );
  }
  return false;
}
