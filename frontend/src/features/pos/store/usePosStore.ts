import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import toast from 'react-hot-toast';
import { DBInventory } from '@/types/db.types';
import { salesApi } from '@/services/sales.api';
import { customerApi } from '@/services/customer.api';
import { shopApi } from '@/services/shop.api';
import { ledgerApi } from '@/services/ledger.api';
import { platformAdapter } from '@/lib/platformAdapter';
import { InvoiceDocument } from '../services/document/document.service';

export interface CartItem {
  productId: string;
  sku: string;
  barcode: string;
  productName: string;
  unitPrice: number;
  costPrice: number;
  maxStock: number;
  quantity: number;
}

export type PaymentMethod = 'cash' | 'card' | 'bank' | 'easypaisa' | 'jazzcash' | 'credit';

export interface Transaction {
  transactionId: string;
  transactionType: 'sale' | 'replace_exchange' | 'return_only';
  status: 'pending' | 'completed' | 'void' | 'refunded' | 'locked';
  
  items: CartItem[]; // New items (for sales/exchanges)
  returnedItems: CartItem[]; // Returned items (for returns/exchanges)
  
  subtotal: number;
  discountTotal: number;
  invoiceDiscountType: 'percentage' | 'fixed';
  invoiceDiscountValue: number;
  invoiceDiscountAmount: number;
  grandTotal: number;
  
  paymentBreakdown: { method: string; amount: number }[];
  paymentStatus: 'PAID' | 'PARTIAL' | 'DUE';
  totalPaid: number;
  remainingDue: number;
  changeReturned: number;
  
  customer: {
    id: string;
    name: string;
  } | null;
  
  createdAt: number;

  // Locking Mechanics
  lockedAt?: number;
  hash?: string;
  version?: number;
  previousHash?: string;
}

export interface SaleCustomer {
  id: string;
  name: string;
  phone?: string;
  mobile?: string;
  currentBalance?: number;
  creditLimit?: number;
}

export interface SaleSession {
  id: string;
  name: string;
  status: 'draft' | 'processing' | 'completed';
  mode: 'sale' | 'replace';
  transactionType: 'sale' | 'replace_exchange' | 'return_only';
  customer: SaleCustomer | null;
  
  cart: CartItem[];
  returnedItems: CartItem[];
  
  invoiceDiscountType: 'percentage' | 'fixed';
  invoiceDiscountValue: number;
  
  isScanMode: boolean;
  transactionId: string;
  linkedInvoiceId?: string;
  createdAt: number;
  updatedAt: number;
}

interface PosStore {
  activeTabId: string;
  saleTabs: SaleSession[];
  isWholesaleMode: boolean;
  transactions: Transaction[];
  lastInvoice: InvoiceDocument | null;
  
  // Tab Management Actions
  createSaleTab: () => void;
  closeSaleTab: (id: string) => void;
  switchSaleTab: (id: string) => void;
  clearAllSessions: () => void;
  
  // Settings
  setWholesaleMode: (isWholesale: boolean) => void;

  // Cart Actions (operates on active tab)
  setSessionMode: (mode: 'sale' | 'replace') => void;
  prepareReplaceExchange: () => void;
  addToCart: (product: DBInventory, isReturn?: boolean) => void;
  updateQuantity: (productId: string, quantity: number, isReturn?: boolean) => void;
  removeFromCart: (productId: string, isReturn?: boolean) => void;
  clearCart: () => void;
  loadInvoice: (invoice: any) => void;
  
  // Customer Action (operates on active tab)
  setCustomer: (customer: SaleCustomer | null) => void;

  // Global Discount Action
  setInvoiceDiscount: (discountType: 'percentage' | 'fixed', discountValue: number) => void;

  // Transaction Lifecycle
  completeTransaction: (paymentBreakdown: { method: string; amount: number }[], customer: { id: string; name: string } | null, idempotencyKey?: string) => Promise<any>;
  processCashReturn: () => Promise<any>;
  processInvoiceReturn: (skipOverflowCheck?: boolean, forceCashRefund?: boolean) => Promise<any>;
  setLastInvoice: (invoice: InvoiceDocument | null) => void;

  // Status Message
  lastActionMessage: string | null;
  setLastActionMessage: (msg: string | null) => void;

  // Return Overflow Modal State
  returnOverflowState: {
    isOpen: boolean;
    currentBalance: number;
    refundAmount: number;
    overflowAmount: number;
    shopCashBalance: number;
    onKeepCredit: () => void;
    onRefundCash: () => void;
    onCancel: () => void;
  } | null;
  setReturnOverflowState: (state: PosStore['returnOverflowState']) => void;

  // Selectors
  getActiveSession: () => SaleSession | undefined;
}

const createDefaultSession = (id: string, name: string): SaleSession => ({
  id,
  name,
  status: 'draft',
  mode: 'sale',
  transactionType: 'sale',
  cart: [],
  returnedItems: [],
  invoiceDiscountType: 'fixed',
  invoiceDiscountValue: 0,
  customer: {
    id: 'walk-in',
    name: 'Walk-In Customer'
  },
  isScanMode: false,
  transactionId: `TXN-${Date.now()}`,
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

export const usePosStore = create<PosStore>()(
  persist(
    (set, get) => ({
      activeTabId: 'sale-1',
      saleTabs: [
        createDefaultSession('sale-1', 'Sale #1'),
        createDefaultSession('sale-2', 'Sale #2'),
        createDefaultSession('sale-3', 'Sale #3')
      ],
      isWholesaleMode: false,
      transactions: [],
      lastInvoice: null,
      lastActionMessage: null,
      returnOverflowState: null,
      
      setLastActionMessage: (msg) => set({ lastActionMessage: msg }),
      setReturnOverflowState: (state) => set({ returnOverflowState: state }),

      createSaleTab: () => {
        const { saleTabs } = get();
        if (saleTabs.length >= 3) {
          toast.error("Maximum 3 tabs allowed");
          return;
        }
        
        const usedNumbers = saleTabs.map(t => parseInt(t.name.replace('Sale #', ''), 10));
        let nextNum = 1;
        while (usedNumbers.includes(nextNum)) {
          nextNum++;
        }
        
        const newId = `sale-${Date.now()}`;
        const newTab = createDefaultSession(newId, `Sale #${nextNum}`);
        
        set({
          saleTabs: [...saleTabs, newTab],
          activeTabId: newId,
        });
      },
      
      closeSaleTab: (id) => {
        const { saleTabs, activeTabId } = get();
        
        const tabToClose = saleTabs.find(t => t.id === id);
        if (tabToClose?.status === 'processing') {
          toast.error("Cannot close a tab that is currently processing.");
          return;
        }

        if (saleTabs.length <= 1) return; 
        
        const newTabs = saleTabs.filter(t => t.id !== id);
        let newActiveId = activeTabId;
        
        if (activeTabId === id) {
          newActiveId = newTabs[newTabs.length - 1].id;
        }
        
        set({
          saleTabs: newTabs,
          activeTabId: newActiveId,
        });
      },
      
      switchSaleTab: (id) => {
        set({ activeTabId: id });
      },

      clearAllSessions: () => {
        set({
          saleTabs: [
            createDefaultSession('sale-1', 'Sale #1'),
            createDefaultSession('sale-2', 'Sale #2'),
            createDefaultSession('sale-3', 'Sale #3')
          ],
          activeTabId: 'sale-1',
        });
      },

      setWholesaleMode: (isWholesale) => {
        set({ isWholesaleMode: isWholesale });
      },

      setSessionMode: (mode) => {
        const { saleTabs, activeTabId } = get();
        set({
          saleTabs: saleTabs.map(tab => {
            if (tab.id !== activeTabId) return tab;
            return {
              ...tab,
              mode,
              transactionType: mode === 'replace' ? 'replace_exchange' : 'sale'
            };
          })
        });
      },

      prepareReplaceExchange: () => {
        const { saleTabs, activeTabId } = get();
        set({
          saleTabs: saleTabs.map(tab => {
            if (tab.id !== activeTabId) return tab;
            
            // If in sale mode with items, move them to returns and bake in the discount
            if (tab.mode === 'sale' && tab.cart.length > 0) {
              const subtotal = tab.cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
              let discountAmt = 0;
              if (tab.invoiceDiscountType === 'percentage') {
                discountAmt = Math.max(0, subtotal) * ((tab.invoiceDiscountValue || 0) / 100);
              } else {
                discountAmt = tab.invoiceDiscountValue || 0;
              }

              const newReturnedItems = tab.cart.map(item => {
                const itemTotal = item.unitPrice * item.quantity;
                const proportion = subtotal > 0 ? (itemTotal / subtotal) : 0;
                const itemDiscount = discountAmt * proportion;
                const unitDiscount = item.quantity > 0 ? (itemDiscount / item.quantity) : 0;
                
                return {
                  ...item,
                  unitPrice: Math.max(0, item.unitPrice - unitDiscount)
                };
              });

              return {
                ...tab,
                mode: 'replace',
                transactionType: 'replace_exchange',
                returnedItems: [...tab.returnedItems, ...newReturnedItems],
                cart: [],
                invoiceDiscountValue: 0 // Reset for new items
              };
            }
            
            // Otherwise just toggle mode
            const newMode = tab.mode === 'sale' ? 'replace' : 'sale';
            return {
              ...tab,
              mode: newMode,
              transactionType: newMode === 'replace' ? 'replace_exchange' : 'sale'
            };
          })
        });
      },

      // -- Cart Logic --
      getActiveSession: () => {
        const { saleTabs, activeTabId } = get();
        return saleTabs.find(t => t.id === activeTabId);
      },

      addToCart: (product: DBInventory, isReturn = false) => {
        const { saleTabs, activeTabId } = get();
        
        set({
          saleTabs: saleTabs.map(tab => {
            if (tab.id !== activeTabId) return tab;

            const targetList = isReturn ? tab.returnedItems : tab.cart;
            const existingItem = targetList.find(item => item.productId === product.id);
            
            if (existingItem) {
              const newQty = existingItem.quantity + 1;
              if (!isReturn && newQty > existingItem.maxStock) {
                toast.error(`Only ${existingItem.maxStock} items in stock for ${existingItem.productName}`);
                return tab;
              }
              
              toast.success(`Increased ${existingItem.productName} quantity`);
              get().setLastActionMessage(`Increased ${existingItem.productName} quantity to ${newQty}`);
              const updatedList = targetList.map(item => {
                if (item.productId === product.id) {
                  return { ...item, quantity: newQty };
                }
                return item;
              });
              
              return isReturn ? { ...tab, returnedItems: updatedList } : { ...tab, cart: updatedList };
            }

            if (!isReturn && product.stock < 1) {
              toast.error(`${product.name} is out of stock`);
              return tab;
            }

            toast.success(`Added ${product.name} to ${isReturn ? 'returns' : 'cart'}`);
            get().setLastActionMessage(`Added ${product.name} to cart`);
            const newItem: CartItem = {
              productId: product.id,
              sku: product.sku,
              barcode: product.barcode,
              productName: product.name,
              unitPrice: product.salePrice,
              costPrice: product.costPrice,
              maxStock: product.stock,
              quantity: 1
            };
            
            return isReturn 
              ? { ...tab, returnedItems: [...tab.returnedItems, newItem] }
              : { ...tab, cart: [...tab.cart, newItem] };
          })
        });
      },

      updateQuantity: (productId: string, quantity: number, isReturn = false) => {
        const { saleTabs, activeTabId } = get();
        
        if (quantity < 1) return;

        set({
          saleTabs: saleTabs.map(tab => {
            if (tab.id !== activeTabId) return tab;

            const targetList = isReturn ? tab.returnedItems : tab.cart;
            const updatedList = targetList.map(item => {
              if (item.productId === productId) {
                if (!isReturn && quantity > item.maxStock) {
                  toast.error(`Only ${item.maxStock} items in stock`);
                  return item;
                }
                return { ...item, quantity };
              }
              return item;
            });
            
            return isReturn ? { ...tab, returnedItems: updatedList } : { ...tab, cart: updatedList };
          })
        });
      },

      removeFromCart: (productId: string, isReturn = false) => {
        const { saleTabs, activeTabId } = get();
        set({
          saleTabs: saleTabs.map(tab => {
            if (tab.id !== activeTabId) return tab;
            if (isReturn) {
              return { ...tab, returnedItems: tab.returnedItems.filter(item => item.productId !== productId) };
            }
            return { ...tab, cart: tab.cart.filter(item => item.productId !== productId) };
          })
        });
      },

      clearCart: () => {
        const { saleTabs, activeTabId } = get();
        set({
          saleTabs: saleTabs.map(tab => {
            if (tab.id !== activeTabId) return tab;
            return { 
              ...tab, 
              cart: [], 
              returnedItems: [],
              mode: 'sale',
              transactionType: 'sale',
              transactionId: `TXN-${Date.now()}`, // Reset TXN id for next sale
              linkedInvoiceId: undefined,
              invoiceDiscountType: 'fixed',
              invoiceDiscountValue: 0,
              customer: { id: 'walk-in', name: 'Walk-In Customer' }
            };
          })
        });
      },

      loadInvoice: (invoice: any) => {
        const { saleTabs, activeTabId } = get();
        
        set({
          saleTabs: saleTabs.map(tab => {
            if (tab.id !== activeTabId) return tab;
            
            const mappedItems: CartItem[] = (invoice.items || []).map((i: any) => ({
              productId: i.productId || i.product || i._id,
              sku: i.sku || '',
              barcode: i.barcode || '',
              productName: i.name || i.productName || 'Unknown Item',
              unitPrice: i.price || i.unitPrice || 0,
              maxStock: i.quantity || 1, // Restrict return to originally purchased quantity
              quantity: i.quantity || 1
            }));

            toast.success(`Invoice ${invoice.orderNumber || invoice._id} loaded`);
            
            const loadedCustomer = invoice.partyId || invoice.customer || invoice.customerId;
            let finalCustomer = tab.customer;
            
            if (loadedCustomer) {
              if (typeof loadedCustomer === 'object') {
                finalCustomer = { 
                  id: loadedCustomer._id || loadedCustomer.id, 
                  name: loadedCustomer.name || 'Unknown' 
                };
              } else if (typeof loadedCustomer === 'string' && loadedCustomer !== '000000000000000000000000') {
                finalCustomer = { id: loadedCustomer, name: 'Unknown' };
              }
            }
            
            return {
              ...tab,
              cart: mappedItems,
              linkedInvoiceId: invoice._id || invoice.orderNumber,
              customer: finalCustomer
            };
          })
        });
      },

      setCustomer: (customer) => {
        const { saleTabs, activeTabId } = get();
        set({
          saleTabs: saleTabs.map((tab) => {
            if (tab.id !== activeTabId) return tab;
            return {
              ...tab,
              customer: customer
                ? {
                    id: customer.id,
                    name: customer.name,
                    phone: customer.phone || customer.mobile,
                    mobile: customer.mobile || customer.phone,
                    currentBalance: customer.currentBalance ?? 0,
                    creditLimit: customer.creditLimit ?? 0,
                  }
                : { id: 'walk-in', name: 'Walk-In Customer' },
            };
          }),
        });
      },

      setInvoiceDiscount: (discountType, discountValue) => {
        const { saleTabs, activeTabId } = get();
        set({
          saleTabs: saleTabs.map(tab => {
            if (tab.id !== activeTabId) return tab;
            return { ...tab, invoiceDiscountType: discountType, invoiceDiscountValue: discountValue };
          })
        });
      },

      completeTransaction: async (paymentBreakdown, customer, idempotencyKey) => {
        const session = get().getActiveSession();
        if (!session) return;

        try {
          let method = 'cash';
          if (paymentBreakdown && paymentBreakdown.length > 0) {
            method = paymentBreakdown[0].method?.toLowerCase() || 'cash';
          } else if (customer && customer.id !== 'walk-in') {
            method = 'credit';
          }

          // Use the explicitly passed customer as the authoritative source.
          // Fall back to session.customer if no customer was passed.
          const effectiveCustomer = customer ?? session.customer;

          const payload = {
            items: [
              ...session.cart.map(item => ({
                productId: item.productId,
                quantity: item.quantity,
                price: item.unitPrice
              })),
              ...session.returnedItems.map(item => ({
                productId: item.productId,
                quantity: -Math.abs(item.quantity),
                price: item.unitPrice
              }))
            ],
            customerId: effectiveCustomer?.id === 'walk-in' ? undefined : effectiveCustomer?.id,
            paymentMethod: method,
            transactionType: session.transactionType,
            taxRate: 0,
            // T1 Contract Adaptation: calculated monetary discount
            discount: session.invoiceDiscountType === 'percentage'
              ? Math.round((session.cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)) * ((session.invoiceDiscountValue || 0) / 100))
              : (session.invoiceDiscountValue || 0),
            linkedInvoiceId: session.linkedInvoiceId || undefined,
            idempotencyKey,
          };

          let result;

          try {
            // ALWAYS prioritize the cloud API to ensure stock is reduced and sale is created centrally
            result = await salesApi.createOrder(payload);
          } catch (apiError: any) {
            const errorMessage = apiError.response?.data?.message || apiError.message || "Unknown API error";
            console.warn("Cloud API failed, checking for offline fallback...", errorMessage);
            toast.error("Backend Sync Failed: " + errorMessage);
            
            if (platformAdapter.isDesktop()) {
              console.log("Using Offline Fallback");
              // Calculate grandTotal for offline storage since it's not on the session object
              const subtotal = session.cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
              let discountAmt = 0;
              if (session.invoiceDiscountType === 'percentage') {
                discountAmt = subtotal * ((session.invoiceDiscountValue || 0) / 100);
              } else {
                discountAmt = session.invoiceDiscountValue || 0;
              }
              const offlineGrandTotal = subtotal - discountAmt;

              const saleId = `SALE-${Date.now()}`;
              const sqlitePayload = {
                id: saleId,
                customerId: payload.customerId || 'walk-in',
                total: offlineGrandTotal,
                status: 'completed',
                items: JSON.stringify(payload.items),
                paymentMethod: payload.paymentMethod,
                discount: payload.discount,
              };
              
              const mutateResult = await platformAdapter.saveOfflineOrder(sqlitePayload);
              if (mutateResult.success && mutateResult.order) {
                result = { success: true, order: mutateResult.order };
              } else {
                throw new Error("Failed to save to local offline queue. Order lost.");
              }
            } else {
              // If not desktop, we can't fall back. Throw the original API error.
              throw apiError;
            }
          }

          if (!result.success) {
            throw new Error(result.message || 'Transaction failed');
          }

          // Update local UI state
          set(state => ({
            transactions: [...state.transactions, result.order as any]
          }));
          get().clearCart();
          
          // Re-fetch inventory globally using decoupled event
          platformAdapter.emitEvent('inventory-updated');

          return result;
        } catch (error: any) {
          console.error("Transaction failed", error);
          toast.error(error.message || "Payment failed. Nothing was saved.");
          throw error;
        }
      },

      processCashReturn: async () => {
        const session = get().getActiveSession();
        if (!session) return;

        if (session.cart.length === 0 && !session.invoiceDiscountValue) {
          toast.error("Cart is empty and no adjustment value set.");
          return;
        }
        
        const isPureAdjustment = session.cart.length === 0;

        try {
          const idempotencyKey = `pos_txn_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
          const payload = {
            items: session.cart.map(item => ({
              productId: item.productId,
              // Send negative quantity to process as return and restock
              quantity: -Math.abs(item.quantity),
              price: item.unitPrice
            })),
            customerId: session.customer?.id === 'walk-in' ? undefined : session.customer?.id,
            paymentMethod: 'cash',
            transactionType: isPureAdjustment ? 'refund_adjustment' : 'sale',
            taxRate: 0,
            // Convert positive discount input into negative for the return order
            discount: -(session.invoiceDiscountValue || 0),
            linkedInvoiceId: session.linkedInvoiceId || undefined,
            idempotencyKey,
          };

          let result;
          try {
            result = await salesApi.createOrder(payload);
          } catch (apiError: any) {
            const errorMessage = apiError.response?.data?.message || apiError.message || "Unknown API error";
            toast.error("Return failed: " + errorMessage);
            throw apiError;
          }

          if (!result.success) throw new Error(result.message);

          set(state => ({
            transactions: [...state.transactions, result.order as any]
          }));
          get().clearCart();
          
          platformAdapter.emitEvent('inventory-updated');

          toast.success("Walk-in Return processed successfully. Cash reduced.");
          return result;
        } catch (error: any) {
          console.error("Cash Return failed", error);
          throw error;
        }
      },

      processInvoiceReturn: async (skipOverflowCheck = false, forceCashRefund = false) => {
        const session = get().getActiveSession();
        if (!session) return;

        if (!session.linkedInvoiceId) {
          toast.error("No invoice linked. Search for an invoice first.");
          return;
        }

        if (session.cart.length === 0) {
          toast.error("No items in cart to return.");
          return;
        }

        const returnTotal = session.cart.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
        const finalRefund = returnTotal - (session.invoiceDiscountValue || 0);

        // ─── Dual Action Overflow Check ──────────────────────────────────────
        if (!skipOverflowCheck && session.customer?.id && session.customer.id !== 'walk-in') {
          try {
            const customerRes = await customerApi.getCustomerDetail(session.customer.id);
            const currentBalance = customerRes.data?.stats?.outstanding || 0;

            if (finalRefund > currentBalance) {
              const overflowAmount = finalRefund - currentBalance;
              
              // Fetch Shop Cash Balance for validation
              const shopRes = await shopApi.getMyShop();
              const shopCashBalance = shopRes.data?.cashBalance || 0;

              // Trigger Modal State
              set({
                returnOverflowState: {
                  isOpen: true,
                  currentBalance,
                  refundAmount: finalRefund,
                  overflowAmount,
                  shopCashBalance,
                  onKeepCredit: async () => {
                    set({ returnOverflowState: null });
                    await get().processInvoiceReturn(true, false);
                  },
                  onRefundCash: async () => {
                    set({ returnOverflowState: null });
                    await get().processInvoiceReturn(true, true);
                  },
                  onCancel: () => {
                    set({ returnOverflowState: null });
                  }
                }
              });
              return; // Halt execution until modal callback
            }
          } catch (error) {
            console.error("Failed to check customer balance for overflow", error);
            toast.error("Failed to verify customer balance.");
            return;
          }
        }

        // ─── Proceed with Return Invoice ──────────────────────────────────────
        try {
          const idempotencyKey = `pos_txn_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
          // Send negative quantity for return
          const payload = {
            items: session.cart.map(item => ({
              productId: item.productId,
              quantity: -Math.abs(item.quantity),
              price: item.unitPrice
            })),
            customerId: session.customer?.id === 'walk-in' ? undefined : session.customer?.id,
            // Automatically credit if customer is known, otherwise cash
            paymentMethod: session.customer?.id && session.customer.id !== 'walk-in' ? 'credit' : 'cash',
            transactionType: 'invoice_return',
            taxRate: 0,
            discount: -(session.invoiceDiscountValue || 0),
            linkedInvoiceId: session.linkedInvoiceId,
            idempotencyKey,
          };

          let result;
          try {
            result = await salesApi.createOrder(payload);
          } catch (apiError: any) {
            const errorMessage = apiError.response?.data?.message || apiError.message || "Unknown API error";
            toast.error("Invoice Return failed: " + errorMessage);
            throw apiError;
          }

          if (!result.success) throw new Error(result.message);

          // ─── Dual Action: Refund Cash Payout if requested ───────────────────
          if (forceCashRefund && session.customer?.id && session.customer.id !== 'walk-in') {
             try {
                // Fetch latest balance to exactly determine the payout amount needed to bring it to 0
                // We assume it's the exact overflow amount calculated earlier.
                const overflowAmount = finalRefund - (get().returnOverflowState?.currentBalance || 0);
                
                await ledgerApi.recordPayout({
                  partyId: session.customer.id,
                  partyType: 'CUSTOMER',
                  amount: overflowAmount,
                  method: 'cash',
                  notes: `Cash Refund for Return Overflow on ${session.linkedInvoiceId}`
                });
                toast.success(`Refunded Rs ${overflowAmount} in Cash.`);
             } catch (payoutError: any) {
                const msg = payoutError.response?.data?.message || payoutError.message || "Cash Payout Failed";
                toast.error(`Return processed, but ${msg}. Balance left as Credit.`);
             }
          } else {
             toast.success("Invoice Return processed successfully.");
          }

          set(state => ({
            transactions: [...state.transactions, result.order as any]
          }));
          get().clearCart();
          
          platformAdapter.emitEvent('inventory-updated');

          return result;
        } catch (error: any) {
          console.error("Invoice Return failed", error);
          throw error;
        }
      },

      setLastInvoice: (invoice) => set({ lastInvoice: invoice })
    }),
    {
      name: 'tijaratpro-pos',
      partialize: (state) => ({
        isWholesaleMode: state.isWholesaleMode,
        // Ideally we only persist offline transactions or handle them with IndexedDB
        // We'll leave it out of localstorage for now, to keep it light.
      }),
    }
  )
);
