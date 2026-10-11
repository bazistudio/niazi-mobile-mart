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
 * The five default navigation destinations for non-Main branches.
 *
 * Non-Main branch staff should see only these destinations by default.
 * Existing permission checks on each item remain enforced — this list
 * does not grant any new permissions.
 *
 * Main Branch retains the full navigation set and is not filtered.
 */
export const NON_MAIN_BRANCH_DEFAULT_HREFS: ReadonlySet<string> = new Set([
  '/dashboard/shop-admin',           // Dashboard
  '/dashboard/shop-admin/pos',       // POS / Sales
  '/dashboard/shop-admin/sales',     // Sales Analytics
  '/dashboard/shop-admin/inventory', // Products & Stock
  '/dashboard/shop-admin/stock',     // Stock
]);

/**
 * Returns true when the given branch ID is the canonical Main Branch.
 * Safely handles null, undefined, and empty string.
 */
export function isMainBranch(branchId: string | null | undefined): boolean {
  if (!branchId || typeof branchId !== 'string') return false;
  return branchId.trim() === MAIN_BRANCH_ID;
}
