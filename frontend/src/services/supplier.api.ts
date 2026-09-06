export const supplierApi = {
  getSuppliers: async (_page = 1, _limit = 100): Promise<{
    success: boolean;
    data: any[];
    pagination: { page: number; limit: number; total: number; pages: number };
  }> => {
    return {
      success: true,
      data: [],
      pagination: { page: 1, limit: 100, total: 0, pages: 1 }
    };
  },

  searchSuppliers: async (_keyword: string): Promise<{
    success: boolean;
    data: any[];
  }> => {
    return {
      success: true,
      data: []
    };
  },

  addSupplier: async (supplierData: any): Promise<{
    success: boolean;
    data: any;
  }> => {
    return {
      success: true,
      data: {
        id: `supp_${Date.now()}`,
        ...supplierData,
      }
    };
  },

  updateSupplier: async (id: string, supplierData: any): Promise<{
    success: boolean;
    data: any;
  }> => {
    return {
      success: true,
      data: {
        id,
        ...supplierData,
      }
    };
  },

  deleteSupplier: async (_id: string): Promise<{
    success: boolean;
    message: string;
  }> => {
    return {
      success: true,
      message: 'Supplier deleted',
    };
  },

  getSupplierDetail: async (id: string): Promise<{
    success: boolean;
    data: {
      supplier: any;
      stats: {
        totalPurchases: number;
        payable: number;
        purchaseCount: number;
        lastTransactionDate: string | null;
        recentPurchases: any[];
      };
    };
  }> => {
    return {
      success: true,
      data: {
        supplier: {
          id,
          name: 'Supplier',
        },
        stats: {
          totalPurchases: 0,
          payable: 0,
          purchaseCount: 0,
          lastTransactionDate: null,
          recentPurchases: [],
        }
      }
    };
  }
};
