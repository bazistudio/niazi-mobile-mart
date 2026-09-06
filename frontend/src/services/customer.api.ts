import { DBCustomer } from '@/types/db.types';
import { tauriClient, CustomerSummaryDto, Customer } from '@/lib/tauri/tauriClient';

function mapSummaryToDBCustomer(c: CustomerSummaryDto): DBCustomer {
  return {
    id: c.id,
    _id: c.id,
    accountCode: c.customer_code,
    name: c.name,
    mobile: c.phone,
    phone: c.phone,
    currentBalance: c.outstanding_balance,
    creditLimit: c.credit_limit,
    createdAt: new Date(c.created_at).getTime(),
  };
}

function mapCustomerToDBCustomer(c: Customer, balance = 0): DBCustomer {
  return {
    id: c.id,
    _id: c.id,
    accountCode: c.customer_code,
    name: c.name,
    mobile: c.phone,
    phone: c.phone,
    currentBalance: balance,
    creditLimit: c.credit_limit,
    createdAt: new Date(c.created_at).getTime(),
  };
}

export const customerApi = {
  getCustomers: async (page = 1, limit = 100): Promise<{
    success: boolean;
    data: DBCustomer[];
    pagination: { page: number; limit: number; total: number; pages: number };
  }> => {
    try {
      const summaries = await tauriClient.customerList({
        limit,
        offset: (page - 1) * limit,
      });
      const data = summaries.map(mapSummaryToDBCustomer);
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
      console.error('Failed to get customers via Tauri IPC:', err);
      return {
        success: false,
        data: [],
        pagination: { page: 1, limit, total: 0, pages: 1 },
      };
    }
  },

  searchCustomers: async (keyword: string): Promise<{
    success: boolean;
    data: DBCustomer[];
  }> => {
    try {
      if (!keyword || !keyword.trim()) {
        const all = await tauriClient.customerList({ limit: 50 });
        return {
          success: true,
          data: all.map(mapSummaryToDBCustomer),
        };
      }
      const results = await tauriClient.customerSearch(keyword.trim());
      return {
        success: true,
        data: results.map(mapSummaryToDBCustomer),
      };
    } catch (err: any) {
      console.error('Failed to search customers via Tauri IPC:', err);
      return {
        success: false,
        data: [],
      };
    }
  },

  addCustomer: async (customerData: Partial<DBCustomer>): Promise<{
    success: boolean;
    data: DBCustomer;
    message: string;
  }> => {
    try {
      const created = await tauriClient.customerCreate({
        name: customerData.name || 'Unnamed Customer',
        phone: customerData.phone || customerData.mobile || '',
        alternate_phone: (customerData as any).alternate_phone || null,
        email: (customerData as any).email || null,
        address: (customerData as any).address || null,
        notes: (customerData as any).notes || null,
        credit_limit: customerData.creditLimit ?? 0,
      });
      return {
        success: true,
        data: mapCustomerToDBCustomer(created, 0),
        message: 'Customer created successfully',
      };
    } catch (err: any) {
      console.error('Failed to add customer via Tauri IPC:', err);
      throw new Error(err?.toString() || 'Failed to add customer');
    }
  },

  updateCustomer: async (id: string, customerData: Partial<DBCustomer>): Promise<{
    success: boolean;
    data: DBCustomer;
    message: string;
  }> => {
    try {
      const updated = await tauriClient.customerUpdate(id, {
        name: customerData.name,
        phone: customerData.phone || customerData.mobile,
        alternate_phone: (customerData as any).alternate_phone,
        email: (customerData as any).email,
        address: (customerData as any).address,
        notes: (customerData as any).notes,
        credit_limit: customerData.creditLimit,
        is_active: (customerData as any).is_active,
      });
      const balance = await tauriClient.customerGetBalance(id).catch(() => 0);
      return {
        success: true,
        data: mapCustomerToDBCustomer(updated, balance),
        message: 'Customer updated successfully',
      };
    } catch (err: any) {
      console.error('Failed to update customer via Tauri IPC:', err);
      throw new Error(err?.toString() || 'Failed to update customer');
    }
  },

  deleteCustomer: async (id: string): Promise<{
    success: boolean;
    message: string;
  }> => {
    try {
      // Phase 15 Rule: Customers with financial history are safely deactivated, never physically deleted
      await tauriClient.customerDeactivate(id);
      return {
        success: true,
        message: 'Customer deactivated successfully',
      };
    } catch (err: any) {
      console.error('Failed to deactivate customer via Tauri IPC:', err);
      throw new Error(err?.toString() || 'Failed to deactivate customer');
    }
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
    try {
      const detail = await tauriClient.customerGetDetail(id);
      return {
        success: true,
        data: {
          customer: mapCustomerToDBCustomer(detail.customer, detail.outstanding_balance),
          stats: {
            totalSales: detail.total_sales_amount,
            outstanding: detail.outstanding_balance,
            invoiceCount: detail.total_sales_count,
            lastTransactionDate: detail.last_transaction_date,
            recentInvoices: [],
          },
        },
      };
    } catch (err: any) {
      console.error('Failed to get customer detail via Tauri IPC:', err);
      throw new Error(err?.toString() || 'Failed to get customer detail');
    }
  },
};
