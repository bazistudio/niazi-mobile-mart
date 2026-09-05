import axiosInstance from '@/lib/api/axios';

export interface RecordPaymentPayload {
  customerId: string;
  amount: number;
  method: string;
  notes?: string;
}

export const paymentApi = {
  recordPayment: async (payload: RecordPaymentPayload) => {
    const response = await axiosInstance.post<{
      success: boolean;
      data: {
        paymentId: string;
        newBalance: number;
      };
      message: string;
    }>('/api/v1/ledger/payment', payload);
    return response.data;
  }
};
