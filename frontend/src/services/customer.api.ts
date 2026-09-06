import { DBCustomer } from '@/types/db.types';

export const customerApi = {
  getCustomers: async (_page = 1, _limit = 100): Promise<{
    success: boolean;
    data: DBCustomer[];
    pagination: { page: number; limit: number; total: number; pages: number };
  }> => {
    return {
      success: true,
      data: [],
      pagination: { page: 1, limit: 100, total: 0, pages: 1 }
    };
  },

  searchCustomers: async (_keyword: string): Promise<{
    success: boolean;
    data: DBCustomer[];
  }> => {
    return {
      success: true,
      data: []
    };
  },

  addCustomer: async (customerData: Partial<DBCustomer>): Promise<{
    success: boolean;
    data: DBCustomer;
    message: string;
  }> => {
    const newCust: DBCustomer = {
      id: `cust_${Date.now()}`,
      accountCode: customerData.accountCode || 'CUST-001',
      name: customerData.name || 'New Customer',
      mobile: customerData.mobile || customerData.phone || '',
      currentBalance: customerData.currentBalance || 0,
      creditLimit: customerData.creditLimit || 0,
    };
    return {
      success: true,
      data: newCust,
      message: 'Customer saved locally (Phase 14 domain placeholder)',
    };
  },

  updateCustomer: async (id: string, customerData: Partial<DBCustomer>): Promise<{
    success: boolean;
    data: DBCustomer;
    message: string;
  }> => {
    return {
      success: true,
      data: {
        id,
        accountCode: customerData.accountCode || 'CUST-001',
        name: customerData.name || 'Customer',
        mobile: customerData.mobile || customerData.phone || '',
        currentBalance: customerData.currentBalance || 0,
        creditLimit: customerData.creditLimit || 0,
      },
      message: 'Customer updated locally',
    };
  },

  deleteCustomer: async (_id: string): Promise<{
    success: boolean;
    message: string;
  }> => {
    return {
      success: true,
      message: 'Customer deleted',
    };
  },

  getCustomerDetail: async (id: string): Promise<{
    success: boolean;
    data: {
      customer: DBCustomer;
      stats: {
        totalSales: number;
        outstanding: number;
        invoiceCount: number;
        lastTransactionDate: string | null;
        recentInvoices: any[];
      };
    };
  }> => {
    return {
      success: true,
      data: {
        customer: {
          id,
          accountCode: 'CUST-001',
          name: 'Walk-in Customer',
          mobile: '',
          currentBalance: 0,
          creditLimit: 0,
        },
        stats: {
          totalSales: 0,
          outstanding: 0,
          invoiceCount: 0,
          lastTransactionDate: null,
          recentInvoices: [],
        }
      }
    };
  }
};
