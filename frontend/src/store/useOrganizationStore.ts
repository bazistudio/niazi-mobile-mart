import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Organization {
  _id: string;
  name: string;
  code: string;
  businessType: string;
  subscriptionId?: string;
}

export interface Shop {
  _id: string;
  id?: string;
  name: string;
  organizationId: string;
  status: string;
  address?: string;
}

export interface ShopAccess {
  shopId: string;
  role: string;
  permissions: string[];
}

export interface OrganizationMember {
  _id: string;
  organizationId: string;
  userId: string;
  role: string;
  permissions: string[];
  isSystemOwner: boolean;
  shopAccess: ShopAccess[];
}

interface OrganizationState {
  activeOrganizationId: string | null;
  activeShopId: string | null;
  viewMode: 'shop' | 'organization';

  /**
   * Branch-specific default landing page paths, keyed by branch _id.
   * Example: { 'abc123': '/dashboard/shop-admin/pos', 'def456': '/dashboard/shop-admin' }
   *
   * Used for navigation convenience only — not for access control.
   * A user will only land on a default page they are authorized to access;
   * PermissionGuard enforces that at the route level. An unauthorized or
   * disabled default falls back to the base /dashboard/shop-admin route.
   *
   * Persisted to localStorage alongside other org IDs via the existing
   * niazi-org-storage key. No database migration required.
   */
  branchDefaultPages: Record<string, string>;

  // These objects are loaded from API and NOT persisted
  activeOrganization: Organization | null;
  activeShop: Shop | null;
  organizations: Organization[];
  memberships: OrganizationMember[];

  setActiveContext: (orgId: string | null, shopId: string | null) => void;
  setActiveOrganization: (org: Organization | null) => void;
  setActiveShop: (shop: Shop | null) => void;
  setViewMode: (mode: 'shop' | 'organization') => void;
  setOrganizations: (orgs: Organization[]) => void;
  setMemberships: (memberships: OrganizationMember[]) => void;
  /** Set the default landing page path for a specific branch. Admin-only action in the UI. */
  setBranchDefaultPage: (branchId: string, path: string) => void;
  /** Clear the stored default for a branch (falls back to /dashboard/shop-admin). */
  clearBranchDefaultPage: (branchId: string) => void;

  clear: () => void;
}

// Migrate legacy storage key if present
if (typeof window !== 'undefined' && !localStorage.getItem('niazi-org-storage')) {
  const legacyOrg = localStorage.getItem('tijaratpro-org-storage');
  if (legacyOrg) {
    localStorage.setItem('niazi-org-storage', legacyOrg);
  }
}

export const useOrganizationStore = create<OrganizationState>()(
  persist(
    (set, get) => ({
      activeOrganizationId: null,
      activeShopId: null,
      viewMode: 'shop',
      branchDefaultPages: {},

      activeOrganization: null,
      activeShop: null,
      organizations: [],
      memberships: [],

      setActiveContext: (orgId, shopId) => set({
        activeOrganizationId: orgId,
        activeShopId: shopId,
        viewMode: shopId ? 'shop' : 'organization'
      }),

      setActiveOrganization: (org) => set({
        activeOrganization: org,
        activeOrganizationId: org?._id || null
      }),

      setActiveShop: (shop) => set({
        activeShop: shop,
        activeShopId: shop?._id || null
      }),

      setViewMode: (mode) => set({ viewMode: mode }),
      setOrganizations: (orgs) => set({ organizations: orgs }),
      setMemberships: (memberships) => set({ memberships }),

      setBranchDefaultPage: (branchId, path) => set((state) => ({
        branchDefaultPages: { ...state.branchDefaultPages, [branchId]: path },
      })),

      clearBranchDefaultPage: (branchId) => set((state) => {
        const updated = { ...state.branchDefaultPages };
        delete updated[branchId];
        return { branchDefaultPages: updated };
      }),

      clear: () => set({
        activeOrganizationId: null,
        activeShopId: null,
        viewMode: 'shop',
        branchDefaultPages: {},
        activeOrganization: null,
        activeShop: null,
        organizations: [],
        memberships: []
      })
    }),
    {
      name: 'niazi-org-storage',
      // Persist IDs, ViewMode, and branch default pages. API-loaded objects are excluded.
      partialize: (state) => ({
        activeOrganizationId: state.activeOrganizationId,
        activeShopId: state.activeShopId,
        viewMode: state.viewMode,
        branchDefaultPages: state.branchDefaultPages,
      }),
    }
  )
);
