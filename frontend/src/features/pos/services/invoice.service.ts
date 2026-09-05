/**
 * @deprecated This service is deprecated. All invoice mathematical calculations
 * and structure generation have been migrated to the backend ERP layer.
 * Use the backend response payload to render invoice layouts.
 */
import { Transaction, CartItem } from '../store/usePosStore';

/**
 * Lazy helper for jsPDF if needed by external callers
 */
export const getJsPdf = async () => {
  const { jsPDF } = await import('jspdf');
  return jsPDF;
};


export interface ShopProfile {
  name: string;
  address: string;
  phone1: string;
  phone2?: string;
  ntn?: string;
  invoiceNote?: string;
  logo?: string;
}
export interface Invoice {
  invoiceNo: string;
  transactionId: string;
  shop: ShopProfile;
  date: string;
  items: CartItem[];
  returnedItems: CartItem[]; // included for replace/return scenarios
  
  summary: {
    newItemsTotal: number;
    returnTotal: number;
    discount: number;
    total: number;
  };
  
  payment: {
    method: string;
    cashReceived: number;
    change: number;
  };
  
  meta: {
    transactionType: string;
    status: string;
  };
}

export const generateInvoice = (transaction: Transaction, shop: ShopProfile): Invoice => {
  const newItemsTotal = transaction.subtotal - transaction.discountTotal;
  const returnTotal = transaction.returnedItems.reduce((acc, item: any) => acc + (item.subtotal || (item.unitPrice * item.quantity)), 0);

  const date = new Date(transaction.createdAt);
  const dateString = date.toISOString().split('T')[0].replace(/-/g, '');
  const randomCounter = Math.floor(1000 + Math.random() * 9000);
  
  const isRefund = transaction.grandTotal < 0;
    
  // We get payment methods as a comma separated list
  const methods = transaction.paymentBreakdown?.length > 0 
    ? transaction.paymentBreakdown.map(p => p.method).join(', ') 
    : 'CASH';

  return {
    invoiceNo: `INV-${dateString}-${randomCounter}`,
    transactionId: transaction.transactionId,
    shop,
    date: date.toISOString(),
    
    items: transaction.items,
    returnedItems: transaction.returnedItems,
    
    summary: {
      newItemsTotal,
      returnTotal,
      discount: transaction.discountTotal,
      total: transaction.grandTotal, // This is the net difference
    },
    
    payment: {
      method: isRefund ? 'REFUND' : methods,
      cashReceived: transaction.totalPaid || 0,
      change: transaction.changeReturned || 0,
    },
    
    meta: {
      transactionType: transaction.transactionType,
      status: transaction.status,
    }
  };
};
