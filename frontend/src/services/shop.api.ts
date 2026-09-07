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

const STORAGE_KEY = 'niazi_erp_shops';

function getStoredShops(): ShopData[] {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Failed to parse stored shops', err);
  }
  if (typeof window !== 'undefined') {
    saveStoredShops([CANONICAL_BRANCH]);
  }
  return [CANONICAL_BRANCH];
}

function saveStoredShops(shops: ShopData[]) {
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(shops));
    }
  } catch (err) {
    console.warn('Failed to save stored shops to localStorage', err);
  }
}

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
    const list = getStoredShops();
    return {
      success: true,
      data: list[0] || CANONICAL_BRANCH,
      message: 'Active branch loaded',
    };
  },

  getAllShops: async (params?: { status?: string }): Promise<{ success: boolean; data: ShopData[]; message: string }> => {
    let list = getStoredShops();

    if (isTauriEnvironment()) {
      try {
        const branches = await tauriClient.branchList();
        if (branches && branches.length > 0) {
          branches.forEach((b) => {
            if (!list.some((s) => s._id === b.id)) {
              list.push({
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
              });
            }
          });
          saveStoredShops(list);
        }
      } catch (err) {
        console.warn('Failed to load branch list via Tauri IPC', err);
      }
    }

    if (params?.status) {
      const filterStatus = params.status.toLowerCase();
      list = list.filter((s) => s.status.toLowerCase() === filterStatus);
    }

    return {
      success: true,
      data: list,
      message: 'Shops loaded successfully',
    };
  },

  getShopById: async (shopId: string): Promise<{ success: boolean; data: ShopData; message: string }> => {
    const list = getStoredShops();
    const found = list.find((s) => s._id === shopId) || list[0] || CANONICAL_BRANCH;
    return {
      success: true,
      data: found,
      message: 'Branch retrieved',
    };
  },

  createShop: async (payload: Partial<ShopData>): Promise<{ success: boolean; data: ShopData; message: string }> => {
    const list = getStoredShops();
    const newId = typeof crypto !== 'undefined' && crypto.randomUUID 
      ? crypto.randomUUID() 
      : `shop-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    const newShop: ShopData = {
      _id: newId,
      name: payload.name?.trim() || 'New Shop Branch',
      ownerName: payload.ownerName?.trim() || 'Niazi Admin',
      phone: payload.phone?.trim() || '',
      email: payload.email?.trim() || '',
      address: payload.address?.trim() || '',
      city: payload.city?.trim() || '',
      cashBalance: payload.cashBalance || 0,
      status: payload.status || 'active',
      planId: 'multi-branch-erp',
    };

    list.push(newShop);
    saveStoredShops(list);

    return {
      success: true,
      data: newShop,
      message: 'Shop created successfully',
    };
  },

  updateShop: async (shopId: string, payload: Partial<ShopData>): Promise<{ success: boolean; data: ShopData; message: string }> => {
    const list = getStoredShops();
    const index = list.findIndex((s) => s._id === shopId);
    if (index !== -1) {
      list[index] = {
        ...list[index],
        ...payload,
        _id: shopId,
      };
      saveStoredShops(list);
      return {
        success: true,
        data: list[index],
        message: 'Shop updated successfully',
      };
    }
    return {
      success: false,
      data: CANONICAL_BRANCH,
      message: 'Shop not found',
    };
  },

  toggleShopStatus: async (shopId: string, status: 'active' | 'suspended' | 'inactive'): Promise<{ success: boolean; data: ShopData; message: string }> => {
    const list = getStoredShops();
    const index = list.findIndex((s) => s._id === shopId);
    if (index !== -1) {
      list[index].status = status;
      saveStoredShops(list);
      return {
        success: true,
        data: list[index],
        message: `Shop status set to ${status}`,
      };
    }
    return {
      success: false,
      data: CANONICAL_BRANCH,
      message: 'Shop not found',
    };
  },

  deleteShop: async (shopId: string): Promise<{ success: boolean; message: string }> => {
    const list = getStoredShops();
    if (list.length <= 1) {
      return {
        success: false,
        message: 'Cannot delete the only remaining shop branch.',
      };
    }
    const filtered = list.filter((s) => s._id !== shopId);
    saveStoredShops(filtered);
    return {
      success: true,
      message: 'Shop deleted successfully',
    };
  },
};
