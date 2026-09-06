export interface RecordPaymentPayload {
  customerId: string;
  amount: number;
  method: string;
  notes?: string;
}

export const paymentApi = {
  recordPayment: async (payload: RecordPaymentPayload): Promise<{
    success: boolean;
    data: {
      paymentId: string;
      newBalance: number;
    };
    message: string;
  }> => {
    return {
      success: true,
      data: {
        paymentId: `pay_${Date.now()}`,
        newBalance: 0,
      },
      message: `Payment of ${payload.amount} recorded`,
    };
  }
};
