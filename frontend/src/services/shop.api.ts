import { httpClient } from '@/lib/http/httpClient';

export interface ShopData {
  _id: string;
  name: string;
  ownerName: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  cashBalance: number;
  status: string;
  planId: any;
}

const CANONICAL_BRANCH: ShopData = {
  _id: '00000000-0000-0000-0000-000000000002',
  name: 'Main Branch',
  ownerName: 'Niazi Admin',
  phone: '0300-1234567',
  email: 'admin@niazimobilemart.local',
  address: 'Main Branch Location',
  city: 'Mianwali',
  cashBalance: 0,
  status: 'active',
  planId: 'single-branch-erp',
};

// Map backend Branch entity to frontend ShopData
function mapBranchToShopData(b: any): ShopData {
  return {
    _id: b.id,
    name: b.name,
    ownerName: 'Niazi Admin',
    phone: '',
    email: '',
    address: '',
    city: '',
    cashBalance: 0,
    status: b.is_active ? 'active' : 'inactive',
    planId: 'single-branch-erp',
  };
}

export const shopApi = {
  getMyShop: async (): Promise<{ success: boolean; data: ShopData; message: string }> => {
    try {
      const res = await httpClient.get<{ data: any[] }>('/api/v1/branches');
      if (res.data && Array.isArray(res.data)) {
        const main = res.data.find((b: any) => b.code === 'MAIN');
        if (main) {
          return { success: true, data: mapBranchToShopData(main), message: 'Loaded from Postgres' };
        }
      }
    } catch (err: any) {
      console.warn('Failed to load main branch via API', err);
    }
    return {
      success: true,
      data: CANONICAL_BRANCH,
      message: 'Active branch loaded fallback',
    };
  },

  getAllShops: async (params?: { status?: string }): Promise<{ success: boolean; data: ShopData[]; message: string }> => {
    try {
      const res = await httpClient.get<{ data: any[] }>('/api/v1/branches');
      let list: ShopData[] = [];
      if (res.data && Array.isArray(res.data)) {
        list = res.data.map(mapBranchToShopData);
      } else if (Array.isArray(res)) {
        list = res.map(mapBranchToShopData);
      }
      
      if (params?.status) {
        const filterStatus = params.status.toLowerCase();
        list = list.filter((s) => s.status.toLowerCase() === filterStatus);
      }

      return {
        success: true,
        data: list.length > 0 ? list : [CANONICAL_BRANCH],
        message: 'Shops loaded successfully from Postgres',
      };
    } catch (err: any) {
      console.error('getAllShops failed', err);
      return { success: false, data: [CANONICAL_BRANCH], message: err.message };
    }
  },

  getShopById: async (shopId: string): Promise<{ success: boolean; data: ShopData; message: string }> => {
    try {
      const all = await shopApi.getAllShops();
      const found = all.data.find(s => s._id === shopId) || CANONICAL_BRANCH;
      return { success: true, data: found, message: 'Branch retrieved' };
    } catch (err) {
      return { success: false, data: CANONICAL_BRANCH, message: 'Error' };
    }
  },

  createShop: async (payload: Partial<ShopData>): Promise<{ success: boolean; data: ShopData; message: string }> => {
    try {
      const res = await httpClient.post<{ data: any }>('/api/v1/branches', {
        name: payload.name?.trim() || 'New Shop Branch',
        is_active: payload.status !== 'inactive'
      });
      // The API returns the Branch object
      const created = res.data || res;
      return {
        success: true,
        data: mapBranchToShopData(created),
        message: 'Shop created successfully in Postgres',
      };
    } catch (err: any) {
      return {
        success: false,
        data: CANONICAL_BRANCH,
        message: err.message || 'Failed to create shop in Postgres',
      };
    }
  },

  updateShop: async (shopId: string, payload: Partial<ShopData>): Promise<{ success: boolean; data: ShopData; message: string }> => {
    // Phase 1 migration: Branch update not yet implemented in backend.
    return {
      success: false,
      data: CANONICAL_BRANCH,
      message: 'Branch updates are not supported by the current API yet.',
    };
  },

  toggleShopStatus: async (shopId: string, status: 'active' | 'suspended' | 'inactive'): Promise<{ success: boolean; data: ShopData; message: string }> => {
    return {
      success: false,
      data: CANONICAL_BRANCH,
      message: 'Branch status updates are not supported by the current API yet.',
    };
  },

  deleteShop: async (shopId: string): Promise<{ success: boolean; message: string }> => {
    return {
      success: false,
      message: 'Branch deletion is not supported by the current API.',
    };
  },
};
