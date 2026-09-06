import { tauriClient, SupplierSummaryDto, Supplier } from '@/lib/tauri/tauriClient';

export interface FrontendSupplier {
  id: string;
  _id: string;
  supplier_code: string;
  code: string;
  name: string;
  companyName?: string;
  phone: string;
  alternate_phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
  creditLimit: number;
  credit_limit: number;
  currentPayable: number;
  currentBalance: number;
  outstanding_balance: number;
  status: 'active' | 'inactive';
  is_active: boolean;
  createdAt: number;
  created_at: string;
}

function mapSummaryToFrontendSupplier(s: SupplierSummaryDto): FrontendSupplier {
  return {
    id: s.id,
    _id: s.id,
    supplier_code: s.supplier_code,
    code: s.supplier_code,
    name: s.name,
    companyName: s.name,
    phone: s.phone,
    creditLimit: s.credit_limit,
    credit_limit: s.credit_limit,
    currentPayable: s.outstanding_balance,
    currentBalance: s.outstanding_balance,
    outstanding_balance: s.outstanding_balance,
    status: s.is_active ? 'active' : 'inactive',
    is_active: s.is_active,
    createdAt: Date.now(),
    created_at: new Date().toISOString(),
  };
}

function mapSupplierToFrontendSupplier(s: Supplier, balance = 0): FrontendSupplier {
  return {
    id: s.id,
    _id: s.id,
    supplier_code: s.supplier_code,
    code: s.supplier_code,
    name: s.name,
    companyName: s.name,
    phone: s.phone,
    alternate_phone: s.alternate_phone,
    email: s.email,
    address: s.address,
    notes: s.notes,
    creditLimit: s.credit_limit,
    credit_limit: s.credit_limit,
    currentPayable: balance,
    currentBalance: balance,
    outstanding_balance: balance,
    status: s.is_active ? 'active' : 'inactive',
    is_active: s.is_active,
    createdAt: new Date(s.created_at).getTime(),
    created_at: s.created_at,
  };
}

export const supplierApi = {
  getSuppliers: async (page = 1, limit = 100): Promise<{
    success: boolean;
    data: FrontendSupplier[];
    pagination: { page: number; limit: number; total: number; pages: number };
  }> => {
    try {
      const summaries = await tauriClient.supplierList({
        limit,
        offset: (page - 1) * limit,
      });
      const data = summaries.map(mapSummaryToFrontendSupplier);
      return {
        success: true,
        data,
        pagination: {
          page,
          limit,
          total: data.length,
          pages: Math.ceil(data.length / limit) || 1,
        },
      };
    } catch (err: any) {
      console.error('Failed to get suppliers via Tauri IPC:', err);
      return {
        success: false,
        data: [],
        pagination: { page: 1, limit, total: 0, pages: 1 },
      };
    }
  },

  searchSuppliers: async (keyword: string): Promise<{
    success: boolean;
    data: FrontendSupplier[];
  }> => {
    try {
      if (!keyword || !keyword.trim()) {
        const all = await tauriClient.supplierList({ limit: 50 });
        return {
          success: true,
          data: all.map(mapSummaryToFrontendSupplier),
        };
      }
      const results = await tauriClient.supplierSearch(keyword.trim());
      return {
        success: true,
        data: results.map(mapSummaryToFrontendSupplier),
      };
    } catch (err: any) {
      console.error('Failed to search suppliers via Tauri IPC:', err);
      return {
        success: false,
        data: [],
      };
    }
  },

  addSupplier: async (supplierData: any): Promise<{
    success: boolean;
    data: FrontendSupplier;
    message?: string;
  }> => {
    try {
      const created = await tauriClient.supplierCreate({
        name: supplierData.name || 'Unnamed Supplier',
        phone: supplierData.phone || '',
        alternate_phone: supplierData.alternate_phone || null,
        email: supplierData.email || null,
        address: supplierData.address || null,
        notes: supplierData.notes || null,
        credit_limit: supplierData.credit_limit ?? supplierData.creditLimit ?? 0,
      });
      return {
        success: true,
        data: mapSupplierToFrontendSupplier(created, 0),
        message: 'Supplier added successfully',
      };
    } catch (err: any) {
      console.error('Failed to add supplier via Tauri IPC:', err);
      throw new Error(err?.toString() || 'Failed to add supplier');
    }
  },

  updateSupplier: async (id: string, supplierData: any): Promise<{
    success: boolean;
    data: FrontendSupplier;
    message?: string;
  }> => {
    try {
      const updated = await tauriClient.supplierUpdate(id, {
        name: supplierData.name,
        phone: supplierData.phone,
        alternate_phone: supplierData.alternate_phone,
        email: supplierData.email,
        address: supplierData.address,
        notes: supplierData.notes,
        credit_limit: supplierData.credit_limit ?? supplierData.creditLimit,
        is_active: supplierData.is_active ?? (supplierData.status === 'active' ? true : undefined),
      });
      const balance = await tauriClient.supplierGetBalance(id).catch(() => 0);
      return {
        success: true,
        data: mapSupplierToFrontendSupplier(updated, balance),
        message: 'Supplier updated successfully',
      };
    } catch (err: any) {
      console.error('Failed to update supplier via Tauri IPC:', err);
      throw new Error(err?.toString() || 'Failed to update supplier');
    }
  },

  deleteSupplier: async (id: string): Promise<{
    success: boolean;
    message: string;
  }> => {
    try {
      await tauriClient.supplierDeactivate(id);
      return {
        success: true,
        message: 'Supplier deactivated successfully',
      };
    } catch (err: any) {
      console.error('Failed to deactivate supplier via Tauri IPC:', err);
      throw new Error(err?.toString() || 'Failed to deactivate supplier');
    }
  },

  getSupplierDetail: async (id: string): Promise<{
    success: boolean;
    data: {
      supplier: FrontendSupplier;
      stats: {
        totalPurchases: number;
        payable: number;
        purchaseCount: number;
        lastTransactionDate: string | null;
        recentPurchases: any[];
      };
    };
  }> => {
    try {
      const detail = await tauriClient.supplierGetDetail(id);
      const totalPurchases = detail.recent_purchases.reduce((acc, p) => acc + p.total_amount, 0);
      const lastTx = detail.recent_purchases[0]?.created_at || detail.recent_payments[0]?.created_at || null;
      return {
        success: true,
        data: {
          supplier: mapSupplierToFrontendSupplier(detail.supplier, detail.outstanding_balance),
          stats: {
            totalPurchases,
            payable: detail.outstanding_balance,
            purchaseCount: detail.recent_purchases.length,
            lastTransactionDate: lastTx,
            recentPurchases: detail.recent_purchases,
          },
        },
      };
    } catch (err: any) {
      console.error('Failed to get supplier detail via Tauri IPC:', err);
      throw new Error(err?.toString() || 'Failed to get supplier detail');
    }
  },
};
