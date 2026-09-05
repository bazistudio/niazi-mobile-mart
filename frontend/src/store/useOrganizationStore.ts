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
  name: string;
  organizationId: string;
  status: string;
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
  
  clear: () => void;
}

export const useOrganizationStore = create<OrganizationState>()(
  persist(
    (set) => ({
      activeOrganizationId: null,
      activeShopId: null,
      viewMode: 'shop',
      
      activeOrganization: null,
      activeShop: null,
      organizations: [],
      memberships: [],
      
      setActiveContext: (orgId, shopId) => set({
        activeOrganizationId: orgId,
        activeShopId: shopId,
        viewMode: shopId ? 'shop' : 'organization'
      }),
      
      setActiveOrganization: (org) => set({ activeOrganization: org }),
      
      setActiveShop: (shop) => {
        set({ 
          activeShop: shop,
        });
      },
      
      setViewMode: (mode) => set({ viewMode: mode }),
      setOrganizations: (orgs) => set({ organizations: orgs }),
      setMemberships: (memberships) => set({ memberships: memberships }),
      
      clear: () => set({
        activeOrganizationId: null,
        activeShopId: null,
        viewMode: 'shop',
        activeOrganization: null,
        activeShop: null,
        organizations: [],
        memberships: []
      })
    }),
    {
      name: 'tijaratpro-org-storage',
      // We ONLY persist the IDs and ViewMode. Everything else loads from the API to stay fresh.
      partialize: (state) => ({ 
        activeOrganizationId: state.activeOrganizationId,
        activeShopId: state.activeShopId,
        viewMode: state.viewMode
      }),
    }
  )
);
