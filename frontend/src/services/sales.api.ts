export interface CreateOrderPayload {
  items: {
    productId: string;
    quantity: number;
    price: number;
  }[];
  customerId?: string;
  paymentMethod: string;
  transactionType?: string;
  taxRate?: number;
  discount?: number;
  idempotencyKey?: string;
}

export const salesApi = {
  createOrder: async (_payload: CreateOrderPayload): Promise<{
    success: boolean;
    order: any;
    message: string;
  }> => {
    return {
      success: true,
      order: {
        id: `order_${Date.now()}`,
        orderNumber: `ORD-${Date.now().toString().slice(-6)}`,
        status: 'completed',
        createdAt: new Date().toISOString(),
      },
      message: 'Order created (Phase 14 domain placeholder)',
    };
  },

  getOrders: async (_params?: { startDate?: string; endDate?: string; limit?: number; orderNumber?: string }): Promise<{
    success: boolean;
    data: any[];
  }> => {
    return {
      success: true,
      data: [],
    };
  },

  updateOrderStatus: async (orderId: string, status: string): Promise<{
    success: boolean;
    message: string;
    order?: any;
  }> => {
    return {
      success: true,
      message: `Order status updated to ${status}`,
      order: { id: orderId, status },
    };
  },

  cancelOrder: async (orderId: string): Promise<{
    success: boolean;
    message: string;
  }> => {
    return {
      success: true,
      message: 'Order cancelled',
    };
  }
};
