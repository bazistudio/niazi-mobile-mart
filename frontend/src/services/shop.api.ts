import { isTauriEnvironment, tauriClient } from '@/lib/tauri/tauriClient';

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

export const shopApi = {
  getMyShop: async (): Promise<{ success: boolean; data: ShopData; message: string }> => {
    if (isTauriEnvironment()) {
      try {
        const b = await tauriClient.branchGetMain();
        if (b) {
          return {
            success: true,
            data: {
              _id: b.id,
              name: b.name,
              ownerName: 'Niazi Admin',
              phone: '0300-1234567',
              email: 'admin@niazimobilemart.local',
              address: 'Main Branch Location',
              city: 'Mianwali',
              cashBalance: 0,
              status: b.is_active ? 'active' : 'inactive',
              planId: 'single-branch-erp',
            },
            message: 'Branch loaded from SQLite',
          };
        }
      } catch (err) {
        console.warn('Failed to load main branch via Tauri IPC', err);
      }
    }
    return {
      success: true,
      data: CANONICAL_BRANCH,
      message: 'Canonical branch loaded',
    };
  },

  getAllShops: async (_params?: { status?: string }): Promise<{ success: boolean; data: ShopData[]; message: string }> => {
    if (isTauriEnvironment()) {
      try {
        const branches = await tauriClient.branchList();
        const data: ShopData[] = branches.map((b) => ({
          _id: b.id,
          name: b.name,
          ownerName: 'Niazi Admin',
          phone: '0300-1234567',
          email: 'admin@niazimobilemart.local',
          address: 'Main Branch Location',
          city: 'Mianwali',
          cashBalance: 0,
          status: b.is_active ? 'active' : 'inactive',
          planId: 'single-branch-erp',
        }));
        return {
          success: true,
          data,
          message: 'Branches loaded from SQLite',
        };
      } catch (err) {
        console.warn('Failed to load branch list via Tauri IPC', err);
      }
    }
    return {
      success: true,
      data: [CANONICAL_BRANCH],
      message: 'Canonical branch loaded',
    };
  },

  getShopById: async (shopId: string): Promise<{ success: boolean; data: ShopData; message: string }> => {
    const res = await shopApi.getAllShops();
    const found = res.data.find((s) => s._id === shopId) || CANONICAL_BRANCH;
    return {
      success: true,
      data: found,
      message: 'Branch retrieved',
    };
  },

  createShop: async (payload: Partial<ShopData>): Promise<{ success: boolean; data: ShopData; message: string }> => {
    return {
      success: true,
      data: {
        ...CANONICAL_BRANCH,
        ...payload,
        _id: CANONICAL_BRANCH._id,
      },
      message: 'Branch management locked to permanent single branch in offline ERP.',
    };
  },

  updateShop: async (_shopId: string, payload: Partial<ShopData>): Promise<{ success: boolean; data: ShopData; message: string }> => {
    return {
      success: true,
      data: {
        ...CANONICAL_BRANCH,
        ...payload,
      },
      message: 'Branch updated',
    };
  },

  toggleShopStatus: async (_shopId: string, status: 'active' | 'suspended' | 'inactive'): Promise<{ success: boolean; data: ShopData; message: string }> => {
    return {
      success: true,
      data: {
        ...CANONICAL_BRANCH,
        status,
      },
      message: `Branch status set to ${status}`,
    };
  },

  deleteShop: async (_shopId: string): Promise<{ success: boolean; message: string }> => {
    return {
      success: true,
      message: 'Cannot delete permanent branch in single-branch ERP.',
    };
  },
};
