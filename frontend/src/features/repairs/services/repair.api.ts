import { RepairJob } from '../types/repair.types';

export const repairApi = {
  getRepairJobs: async (_filters: any = {}): Promise<{ data: RepairJob[], total: number, page: number, limit: number }> => {
    return {
      data: [],
      total: 0,
      page: 1,
      limit: 20
    };
  },

  getRepairJobById: async (id: string): Promise<RepairJob> => {
    return {
      id,
      ticketNumber: `REP-${Date.now().toString().slice(-4)}`,
      customerName: 'Customer',
      customerPhone: '',
      deviceModel: 'Device',
      issueDescription: 'Issue',
      status: 'RECEIVED',
      priority: 'MEDIUM',
      estimatedCost: 0,
      finalCost: 0,
      paidAmount: 0,
      parts: [],
      notes: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as unknown as RepairJob;
  },

  createRepairJob: async (jobData: any): Promise<RepairJob> => {
    return {
      id: `rep_${Date.now()}`,
      ticketNumber: `REP-${Date.now().toString().slice(-4)}`,
      ...jobData,
      status: 'RECEIVED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as unknown as RepairJob;
  },

  updateStatus: async (id: string, status: string, _note?: string): Promise<RepairJob> => {
    return {
      id,
      status,
    } as unknown as RepairJob;
  },

  addPart: async (id: string, _partData: { productId: string, qty: number, cost: number, price: number }): Promise<RepairJob> => {
    return {
      id,
    } as unknown as RepairJob;
  },

  addPayment: async (id: string, _paymentData: { amount: number, method: string }): Promise<RepairJob> => {
    return {
      id,
    } as unknown as RepairJob;
  }
};
