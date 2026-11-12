import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import toast from 'react-hot-toast';
import { DBInventory } from '@/types/db.types';
import { salesApi } from '@/services/sales.api';
import { customerApi } from '@/services/customer.api';
import { shopApi } from '@/services/shop.api';
import { ledgerApi } from '@/services/ledger.api';
import { platformAdapter } from '@/lib/platformAdapter';
import { InvoiceDocument, DocumentService } from '../services/document/document.service';
import type { ExchangeResultDto, SaleReturnableLineDto } from '@/lib/tauri/tauriClient';
import { getQueryClient } from '@/components/providers/ReactQueryProvider';
import { queryKeys } from '@/lib/react-query/queryKeys';
import {
  createCashReturnForInvoice,
  createReturnForInvoice,
  createUnifiedReturnForInvoice,
  allocateReturnLines,
  WALK_IN_RETURN_BLOCKED_MESSAGE,
  EXCHANGE_BLOCKED_MESSAGE,
  INVOICE_LOADED_CHECKOUT_BLOCKED_MESSAGE,
} from '../services/posReturn.service';
import { returnsApi } from '@/services/returns.api';
import { useCashStore } from '@/features/cash';
import { useOrganizationStore } from '@/store/useOrganizationStore';
import { useAuthStore } from '@/lib/auth/core/auth.store';
import { usePrinterStore } from '@/features/settings/printer/store/printer.store';

// Migrate legacy POS storage key if present
if (typeof window !== 'undefined' && !localStorage.getItem('niazi-pos')) {
  const legacyPos = localStorage.getItem('tijaratpro-pos');
  if (legacyPos) {
    localStorage.setItem('niazi-pos', legacyPos);
  }
}

export interface CartItem {
  productId: string;
  sku: string;
  barcode: string;
  productName: string;
  unitPrice: number;
  costPrice: number;
  maxStock: number;
  quantity: number;
  specs?: string;
}

// Phase 1B/F: Per-line return metadata populated by getSaleReturnableInfo().
// Stored alongside the cart so CartTable can render returnable limits and
// selection checkboxes without additional API calls.
export interface ReturnLineItem {
  saleLineId: string;          // Backend sale_line_id — required by CreateSalesReturnLineDto
  productId: string;
  productName: string;
  sku: string;
  originalUnitPrice: number;   // original_unit_price from the backend
  originalSoldQty: number;     // original_quantity — the full quantity sold on the invoice
  alreadyReturnedQty: number;  // already_returned_quantity — from prior return transactions
  returnableQty: number;       // returnable_quantity = originalSoldQty - alreadyReturnedQty
  selectedForReturn: boolean;  // operator checkbox — false means this line is excluded
  returnQty: number;           // quantity the operator wants to return (bounded [1..returnableQty])
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
  // P0 fix: idempotency key for the current checkout attempt.
  // Generated on first executeTransaction() call and reused on retries.
  // Cleared by clearCart() when the user starts a new sale.
  checkoutIdempotencyKey?: string | null;
  linkedInvoiceId?: string;
  // Phase 1B: two-stage Cash Return state machine.
  // State A: isReturnMode === false (normal POS).
  // State B: isReturnMode === true  (return prepared, prices shown negative/red, no submit yet).
  // State C: second click on Cash Return button — real API call, then reset.
  isReturnMode: boolean;
  // Phase 1B/F: Return-line metadata fetched from getSaleReturnableInfo().
  // Populated inside loadInvoice() when a linkedInvoiceId is set.
  // Cleared by clearCart().
  returnLines: ReturnLineItem[];
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
  updateUnitPrice: (productId: string, unitPrice: number, isReturn?: boolean) => void;
  removeFromCart: (productId: string, isReturn?: boolean) => void;
  clearCart: () => void;
  loadInvoice: (invoice: any) => void;
  // Phase 1B/F: Per-line return selection/quantity controls
  toggleReturnLine: (saleLineId: string) => void;
  setReturnLineQty: (saleLineId: string, qty: number) => void;
  
  // Customer Action (operates on active tab)
  setCustomer: (customer: SaleCustomer | null) => void;

  // Global Discount Action
  setInvoiceDiscount: (discountType: 'percentage' | 'fixed', discountValue: number) => void;

  // Transaction Lifecycle
  completeTransaction: (paymentBreakdown: { method: string; amount: number }[], customer: { id: string; name: string } | null, idempotencyKey?: string) => Promise<any>;
  setCheckoutIdempotencyKey: (key: string | null) => void;
  processCashReturn: () => Promise<any>;
  processInvoiceReturn: (skipOverflowCheck?: boolean, forceCashRefund?: boolean) => Promise<any>;
  processReturn: () => Promise<any>;
  processExchange: (options?: {
    refundMethod?: 'CASH' | 'CREDIT';
    paymentBreakdown?: { method: string; amount: number }[];
  }) => Promise<any>;
  setLastInvoice: (invoice: InvoiceDocument | null) => void;

  // Phase 1B: Cash Return state machine actions
  enterCashReturnMode: () => void;
  exitCashReturnMode: () => void;

  // Transient exchange result — set after processExchange() succeeds,
  // cleared when operator dismisses the summary or starts a new session.
  lastExchangeResult: ExchangeResultDto | null;
  clearLastExchangeResult: () => void;

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
  returnLines: [],
  invoiceDiscountType: 'fixed',
  invoiceDiscountValue: 0,
  customer: {
    id: 'walk-in',
    name: 'Walk-In Customer'
  },
  isScanMode: false,
  transactionId: `TXN-${Date.now()}`,
  isReturnMode: false,
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
      lastExchangeResult: null,
      
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
              quantity: 1,
              specs: product.specs || undefined,
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

      updateUnitPrice: (productId: string, unitPrice: number, isReturn = false) => {
        const { saleTabs, activeTabId } = get();
        if (unitPrice < 0) return;

        set({
          saleTabs: saleTabs.map(tab => {
            if (tab.id !== activeTabId) return tab;

            const targetList = isReturn ? tab.returnedItems : tab.cart;
            const updatedList = targetList.map(item => {
              if (item.productId === productId) {
                return { ...item, unitPrice };
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
              returnLines: [], // Phase 1B/F: clear return metadata on cart reset
              mode: 'sale',
              transactionType: 'sale',
              transactionId: `TXN-${Date.now()}`, // Reset TXN id for next sale
              // P0 fix: reset idempotency key so the next sale gets a fresh one
              checkoutIdempotencyKey: null,
              linkedInvoiceId: undefined,
              isReturnMode: false,
              invoiceDiscountType: 'fixed',
              invoiceDiscountValue: 0,
              customer: { id: 'walk-in', name: 'Walk-In Customer' }
            };
          })
        });
      },

      // Phase 1B: Activate Cash Return preparation mode (State A -> State B).
      // Prices will be displayed as negative/red in the UI; no API call yet.
      enterCashReturnMode: () => {
        const { saleTabs, activeTabId } = get();
        set({
          saleTabs: saleTabs.map(tab =>
            tab.id !== activeTabId ? tab : { ...tab, isReturnMode: true }
          ),
        });
      },

      // Phase 1B: Cancel Cash Return preparation and return to normal POS (State B -> State A).
      exitCashReturnMode: () => {
        const { saleTabs, activeTabId } = get();
        set({
          saleTabs: saleTabs.map(tab =>
            tab.id !== activeTabId ? tab : { ...tab, isReturnMode: false }
          ),
        });
      },

      loadInvoice: (invoice: any) => {
        const { saleTabs, activeTabId } = get();
        
        // Phase 1B/F fix (Defect A1-A4): Map invoice items into cart AND
        // asynchronously fetch getSaleReturnableInfo() to populate returnLines
        // with saleLineId, originalSoldQty, alreadyReturnedQty, returnableQty.
        // This async call does NOT block the synchronous cart population.
        const saleId: string = invoice._id || invoice.orderNumber || '';

        const mappedItems: CartItem[] = (invoice.items || []).map((i: any) => ({
          productId: i.productId || i.product || i._id,
          sku: i.sku || '',
          barcode: i.barcode || '',
          productName: i.name || i.productName || 'Unknown Item',
          unitPrice: i.price || i.unitPrice || 0,
          costPrice: i.costPrice || 0,
          maxStock: i.quantity || 1,
          quantity: i.quantity || 1,
        }));

        // Resolve customer from invoice using supported candidate fields
        let extractedCustomerId: string | null = null;
        let extractedCustomerName: string = 'Walk-In Customer';

        const rawCustomer = invoice.customerId || invoice.customer || invoice.partyId;
        if (rawCustomer) {
          if (typeof rawCustomer === 'object') {
            extractedCustomerId = rawCustomer.id || rawCustomer._id || null;
            extractedCustomerName = rawCustomer.name || invoice.customerName || 'Customer';
          } else if (typeof rawCustomer === 'string') {
            const trimmed = rawCustomer.trim();
            if (trimmed && trimmed !== '000000000000000000000000' && trimmed.toLowerCase() !== 'walk-in') {
              extractedCustomerId = trimmed;
              extractedCustomerName = invoice.customerName || (typeof invoice.customer === 'object' ? invoice.customer?.name : null) || 'Customer';
            }
          }
        }

        // Clean walk-in reset: if invoice has no registered customer, explicitly reset to Walk-In
        let initialCustomer: SaleSession['customer'] = null;
        if (extractedCustomerId) {
          initialCustomer = {
            id: extractedCustomerId,
            name: extractedCustomerName,
            phone: undefined,
            mobile: undefined,
            currentBalance: undefined,
            creditLimit: undefined,
          };
        } else {
          initialCustomer = {
            id: 'walk-in',
            name: 'Walk-In Customer',
          };
        }

        const targetTabId = activeTabId;

        // Synchronous cart update (immediate UI response)
        set({
          saleTabs: saleTabs.map(tab => {
            if (tab.id !== targetTabId) return tab;
            return {
              ...tab,
              cart: mappedItems,
              returnLines: [], // will be populated asynchronously below
              linkedInvoiceId: saleId,
              customer: initialCustomer,
            };
          }),
        });

        toast.success(`Invoice ${invoice.orderNumber || invoice._id} loaded`);

        // Asynchronous: enrich customer details and live balance from customerApi
        if (extractedCustomerId) {
          const enrichCustId = extractedCustomerId;
          customerApi.getCustomerDetail(enrichCustId).then((customerRes) => {
            if (customerRes.success && customerRes.data) {
              const custData = customerRes.data.customer;
              const statsData = customerRes.data.stats;
              const liveOutstanding = typeof statsData?.outstanding === 'number'
                ? statsData.outstanding
                : (custData.currentBalance ?? 0);

              set((state) => ({
                saleTabs: state.saleTabs.map((tab) => {
                  // Guard against stale async update: verify tab still active and still represents the same customer
                  if (tab.id !== targetTabId || tab.customer?.id !== enrichCustId) {
                    return tab;
                  }
                  return {
                    ...tab,
                    customer: {
                      id: enrichCustId,
                      name: custData.name || tab.customer.name,
                      phone: custData.phone || custData.mobile,
                      mobile: custData.mobile || custData.phone,
                      currentBalance: liveOutstanding,
                      creditLimit: custData.creditLimit ?? 0,
                    },
                  };
                }),
              }));
            }
          }).catch((err) => {
            console.warn('[loadInvoice] getCustomerDetail enrichment failed:', err);
          });
        }

        // Asynchronous: fetch returnable info and populate returnLines
        if (saleId) {
          returnsApi.getSaleReturnableInfo(saleId).then((info) => {
            const returnLines: ReturnLineItem[] = info.lines.map((line: SaleReturnableLineDto) => {
              const returnableQty = Number(line.returnable_quantity ?? line.remaining_quantity ?? 0);
              const alreadyReturnedQty = Number(line.already_returned_quantity ?? line.returned_quantity ?? 0);
              const unitPrice = Number(line.unit_price ?? line.original_unit_price ?? 0);
              return {
                saleLineId: line.sale_line_id,
                productId: line.product_id,
                productName: line.product_name,
                sku: line.sku,
                originalUnitPrice: unitPrice,
                originalSoldQty: Number(line.original_quantity ?? 0),
                alreadyReturnedQty: alreadyReturnedQty,
                returnableQty: returnableQty,
                selectedForReturn: returnableQty > 0, // auto-select returnable lines
                returnQty: returnableQty > 0 ? 1 : 0,
              };
            });

            set((state) => ({
              saleTabs: state.saleTabs.map((tab) =>
                tab.id !== activeTabId ? tab : { ...tab, returnLines }
              ),
            }));
          }).catch((err) => {
            console.warn('[loadInvoice] getSaleReturnableInfo failed:', err);
            // Non-fatal: returnLines stays [] — cart still loaded, return mode
            // will fall back to cart items without per-line returnable metadata.
          });
        }
      },

      toggleReturnLine: (saleLineId: string) => {
        const { saleTabs, activeTabId } = get();
        set({
          saleTabs: saleTabs.map((tab) => {
            if (tab.id !== activeTabId) return tab;
            return {
              ...tab,
              returnLines: tab.returnLines.map((line) =>
                line.saleLineId !== saleLineId
                  ? line
                  : { ...line, selectedForReturn: !line.selectedForReturn }
              ),
            };
          }),
        });
      },

      setReturnLineQty: (saleLineId: string, qty: number) => {
        const { saleTabs, activeTabId } = get();
        set({
          saleTabs: saleTabs.map((tab) => {
            if (tab.id !== activeTabId) return tab;
            return {
              ...tab,
              returnLines: tab.returnLines.map((line) => {
                if (line.saleLineId !== saleLineId) return line;
                // Clamp to [1 .. returnableQty]
                const clamped = Math.min(Math.max(1, qty), line.returnableQty);
                return { ...line, returnQty: clamped };
              }),
            };
          }),
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

      setCheckoutIdempotencyKey: (key) => {
        const { saleTabs, activeTabId } = get();
        set({
          saleTabs: saleTabs.map(tab =>
            tab.id !== activeTabId ? tab : { ...tab, checkoutIdempotencyKey: key }
          ),
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

        // F-07 containment: returned items must never be sent to the sale path
        // (they were previously recorded as a sale of 1 unit each).
        if (session.returnedItems.length > 0) {
          toast.error(EXCHANGE_BLOCKED_MESSAGE, { duration: 6000 });
          throw new Error(EXCHANGE_BLOCKED_MESSAGE);
        }
        if (session.linkedInvoiceId) {
          toast.error(INVOICE_LOADED_CHECKOUT_BLOCKED_MESSAGE, { duration: 6000 });
          throw new Error(INVOICE_LOADED_CHECKOUT_BLOCKED_MESSAGE);
        }

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

          const activeShopId = useOrganizationStore.getState().activeShopId || useOrganizationStore.getState().activeShop?._id;
          if (!activeShopId) {
            toast.error("No active branch selected. Please select a shop before completing a sale.");
            throw new Error("No active branch selected");
          }

          const payload = {
            branchId: activeShopId,
            items: [
              ...session.cart.map(item => ({
                productId: item.productId,
                quantity: item.quantity,
                price: item.unitPrice,
                specs: item.specs,
              })),
              ...session.returnedItems.map(item => ({
                productId: item.productId,
                quantity: -Math.abs(item.quantity),
                price: item.unitPrice,
                specs: item.specs,
              }))
            ],
            customerId: effectiveCustomer?.id === 'walk-in' ? undefined : effectiveCustomer?.id,
            paymentMethod: method,
            paidAmount: paymentBreakdown && paymentBreakdown.length > 0
              ? paymentBreakdown.reduce((sum, p) => sum + p.amount, 0)
              : (effectiveCustomer?.id && effectiveCustomer.id !== 'walk-in' ? 0 : undefined),
            payments: paymentBreakdown && paymentBreakdown.length > 0
              ? paymentBreakdown.map((p) => ({ method: p.method, amount: p.amount }))
              : undefined,
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
            // Send order creation to API
            result = await salesApi.createOrder(payload);
          } catch (apiError: any) {
            const errorMessage =
              apiError.response?.data?.error ||
              apiError.response?.data?.message ||
              apiError.message ||
              "Unknown API error";
            console.warn("Cloud API failed:", errorMessage);
            toast.error("Checkout Failed: " + errorMessage);
            throw apiError;
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

          // DEF-SALE-11 fix: invalidate all genuinely affected query caches after a completed sale.
          // Previously only dashboard/sales/products were cleared; customer balances and cash
          // sessions were stale until a hard reload.
          try {
            const qc = getQueryClient();
            qc.invalidateQueries({ queryKey: queryKeys.dashboard.all });
            qc.invalidateQueries({ queryKey: ['sales'] });
            qc.invalidateQueries({ queryKey: ['products'] });
            // Customer balance and ledger entries change on credit/partial sales
            qc.invalidateQueries({ queryKey: queryKeys.customers.all });
            // Cash session running total changes on every CASH payment
            qc.invalidateQueries({ queryKey: ['cash'] });
          } catch (qcErr) {
            console.warn('Query cache invalidation failed:', qcErr);
          }

          return result;
        } catch (error: any) {
          console.error("Transaction failed", error);
          toast.error(error.message || "Payment failed. Nothing was saved.");
          throw error;
        }
      },

      // ── Phase 2: Unified Return (canonical implementation) ──────────────────
      //
      // Replaces the two disconnected return functions with one intelligent action.
      // Auto-detects the correct refund method from customer type and invoice state.
      // Uses the existing ReturnOverflowModal for cashier allocation decisions when
      // return amount > outstanding receivable (partially paid / fully paid invoices).
      //
      // Routing logic:
      //   Walk-in customer           → CASH always
      //   Registered + credit sale   → CREDIT (reverses receivable, no cash out)
      //   Registered + return > outstanding → ReturnOverflowModal (advance or cash)
      //   Registered + fully paid    → ReturnOverflowModal (advance or cash)
      processReturn: async () => {
        const session = get().getActiveSession();
        if (!session) return;

        if (!session.linkedInvoiceId) {
          toast.error(WALK_IN_RETURN_BLOCKED_MESSAGE, { duration: 6000 });
          return;
        }

        if (session.cart.length === 0) {
          toast.error('No items in cart to return.');
          return;
        }

        // ── State A -> State B: first click prepares, shows negative totals ────
        if (!session.isReturnMode) {
          get().enterCashReturnMode();
          toast('Return prepared. Review the amount, then click Return again to confirm.', {
            icon: '↩️',
            duration: 5000,
          });
          return;
        }

        // ── State B -> State C: second click — resolve method then submit ──────
        const returnLines = session.returnLines ?? [];
        const selectedLines = returnLines.filter((l) => l.selectedForReturn && l.returnableQty > 0);
        const cartPayload = selectedLines.length > 0
          ? selectedLines.map((l) => ({
              productId: l.productId,
              productName: l.productName,
              quantity: l.returnQty,
            }))
          : session.cart.map((item) => ({
              productId: item.productId,
              productName: item.productName,
              quantity: item.quantity,
            }));

        if (cartPayload.length === 0) {
          toast.error('No lines selected for return.');
          return;
        }

        const customerId = session.customer?.id;
        const isWalkIn = !customerId || customerId === 'walk-in';

        // ── Inner helper: submit the return once refund method is resolved ──────
        const submitReturn = async (method: 'CASH' | 'CREDIT') => {
          const activeSession = get().getActiveSession();
          if (!activeSession?.linkedInvoiceId) return;
          try {
            const result = await createUnifiedReturnForInvoice(
              activeSession.linkedInvoiceId,
              cartPayload,
              method,
              'POS Return',
            );

            // Auto-trigger 80mm return invoice print
            try {
              const activeShop = useOrganizationStore.getState().activeShop;
              const printerStore = usePrinterStore.getState();
              const shopHeader = printerStore.shopHeader;
              const realShopProfile = {
                name: shopHeader?.name || activeShop?.name || 'Niazi Mobile Mart',
                address: shopHeader?.address || (activeShop as any)?.address || 'Main Branch',
                phone1: shopHeader?.phone || (activeShop as any)?.phone || '',
              };
              const authUser = useAuthStore.getState().user;
              const returnedAmount = result?.sales_return?.total_amount ?? cartPayload.reduce((sum, item: any) => sum + (item.unitPrice || 0) * (item.quantity || 1), 0);
              const customerBalAfter = result?.customer_balance_after ?? null;
              let prevBal: number | undefined = undefined;
              let currBal: number | undefined = undefined;
              if (customerBalAfter !== null) {
                currBal = Number(customerBalAfter);
                prevBal = method === 'CREDIT' ? currBal + returnedAmount : currBal;
              } else if (activeSession.customer && typeof (activeSession.customer as any).currentBalance === 'number') {
                prevBal = Number((activeSession.customer as any).currentBalance);
                currBal = method === 'CREDIT' ? prevBal - returnedAmount : prevBal;
              }

              const returnTransaction = {
                transactionId: result?.sales_return?.return_number || `RET-${Date.now().toString().slice(-6)}`,
                items: (result?.lines || cartPayload).map((line: any) => ({
                  productId: line.product_id || line.productId,
                  id: line.id || line.product_id || line.productId,
                  productName: line.product_name_snapshot || line.productName || 'Returned Item',
                  quantity: line.quantity,
                  unitPrice: line.unit_price || line.unitPrice || 0,
                  discount: 0,
                  subtotal: (line.unit_price || line.unitPrice || 0) * (line.quantity || 1),
                })),
                subtotal: returnedAmount,
                discountTotal: 0,
                grandTotal: returnedAmount,
                totalPaid: method === 'CASH' ? returnedAmount : 0,
                remainingDue: method === 'CREDIT' ? returnedAmount : 0,
                changeReturned: 0,
                paymentBreakdown: [{ method: method === 'CASH' ? 'Cash Refund' : 'Customer Credit', amount: returnedAmount }],
                createdAt: Date.now(),
              };

              const invoiceExtras = {
                customer: activeSession.customer ?? null,
                cashier: authUser ? (authUser.role ? `${authUser.name} (${authUser.role})` : authUser.name) : null,
                previousBalance: prevBal,
                currentBalance: currBal,
              };

              const invoice = DocumentService.buildInvoice(returnTransaction as any, realShopProfile as any, invoiceExtras);
              get().setLastInvoice(invoice);
              DocumentService.logPrint(invoice.invoiceId, 'PRINT').catch(() => {});
            } catch (printErr) {
              console.warn('[processReturn] auto return receipt generation non-fatal error:', printErr);
            }

            get().clearCart(); // also clears isReturnMode
            platformAdapter.emitEvent('inventory-updated');
            try {
              const qc = getQueryClient();
              qc.invalidateQueries({ queryKey: queryKeys.dashboard.all });
              qc.invalidateQueries({ queryKey: ['sales'] });
              qc.invalidateQueries({ queryKey: ['products'] });
              qc.invalidateQueries({ queryKey: queryKeys.customers.all });
              qc.invalidateQueries({ queryKey: ['cash'] });
              qc.invalidateQueries({ queryKey: ['returns'] });
            } catch (qcErr) {
              console.warn('[processReturn] cache invalidation failed (non-fatal):', qcErr);
            }
            try {
              await useCashStore.getState().fetchCurrentState();
            } catch (cashErr) {
              console.warn('[processReturn] fetchCurrentState failed (non-fatal):', cashErr);
            }
            if (method === 'CASH') {
              toast.success('Return recorded. Cash refunded from the drawer.');
            } else {
              toast.success('Return recorded. Customer credit updated.');
            }
            return result;
          } catch (error: any) {
            get().exitCashReturnMode();
            const message = error?.message || error?.toString() || 'Unknown error';
            console.error('[processReturn] submit failed', error);
            toast.error('Return failed: ' + message);
            throw error;
          }
        };

        // Walk-in: always cash, no customer balance check needed
        if (isWalkIn) {
          return submitReturn('CASH');
        }

        // Registered customer: check balance to decide credit vs overflow modal
        const returnTotal = session.cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
        const finalRefund = returnTotal - (session.invoiceDiscountValue || 0);

        try {
          const customerRes = await customerApi.getCustomerDetail(customerId);
          const currentBalance = customerRes.data?.stats?.outstanding || 0;
          // currentBalance = SUM(debit) - SUM(credit) → positive means customer owes shop

          if (finalRefund <= currentBalance) {
            // Return amount fully offset by outstanding receivable → pure CREDIT
            return submitReturn('CREDIT');
          }

          // Excess: return amount > outstanding receivable → need cashier decision
          const overflowAmount = finalRefund - currentBalance;
          const shopRes = await shopApi.getMyShop();
          const shopCashBalance = shopRes.data?.cashBalance || 0;

          set({
            returnOverflowState: {
              isOpen: true,
              currentBalance,
              refundAmount: finalRefund,
              overflowAmount,
              shopCashBalance,
              // Option 1: Keep excess as customer account advance (CREDIT — balance goes negative)
              onKeepCredit: async () => {
                set({ returnOverflowState: null });
                get().exitCashReturnMode();
                return submitReturn('CREDIT');
              },
              // Option 2: Pay out excess in cash (CASH — full refund from drawer)
              onRefundCash: async () => {
                set({ returnOverflowState: null });
                get().exitCashReturnMode();
                return submitReturn('CASH');
              },
              onCancel: () => {
                set({ returnOverflowState: null });
              },
            },
          });
        } catch (error: any) {
          console.error('[processReturn] customer balance check failed', error);
          toast.error('Failed to verify customer balance. Please try again.');
          get().exitCashReturnMode();
        }
      },

      // ── processCashReturn: shim → processReturn() ─────────────────────────────
      // Retained so any remaining call sites continue to work. Routes through
      // the unified canonical action.
      processCashReturn: async () => {
        return get().processReturn();
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
          // Determine refund method: credit for known customers, cash for walk-in
          // If forceCashRefund is set (overflow modal chose cash payout), use CASH.
          const isWalkIn = !session.customer?.id || session.customer.id === 'walk-in';
          const refundMethod: 'CASH' | 'CREDIT' =
            forceCashRefund || isWalkIn ? 'CASH' : 'CREDIT';

          // Use dedicated returns endpoint (F-02 fix).
          // createReturnForInvoice fetches returnable info, allocates quantities to
          // original sale lines, and POSTs to POST /api/returns — the correct domain.
          let result: Awaited<ReturnType<typeof createReturnForInvoice>>;
          try {
            result = await createReturnForInvoice(
              session.linkedInvoiceId,
              session.cart.map(item => ({
                productId: item.productId,
                productName: item.productName,
                quantity: item.quantity,
              })),
              refundMethod,
              'POS Invoice Return',
            );
          } catch (apiError: any) {
            const errorMessage = apiError.message || "Unknown API error";
            toast.error("Invoice Return failed: " + errorMessage);
            throw apiError;
          }

          // ─── F-01 fix: cash-out is fully handled inside createSalesReturn (CASH refund_method).
          // The backend atomically inserts a cash_movements RETURN_REFUND/OUT row covering the
          // complete refund amount. The previous ledgerApi.recordPayout() call was removed because
          // (a) the cash movement is already recorded by the backend, and (b) recordPayout() is
          // an alias that hardcodes partyType:'SUPPLIER', making it semantically wrong for a
          // customer cash refund. No duplicate accounting call is needed here.
          if (forceCashRefund) {
            toast.success("Cash refund recorded. Drawer balance updated.");
          } else {
            toast.success("Invoice Return processed successfully.");
          }

          // Auto-trigger 80mm return invoice print
          try {
            const activeShop = useOrganizationStore.getState().activeShop;
            const printerStore = usePrinterStore.getState();
            const shopHeader = printerStore.shopHeader;
            const realShopProfile = {
              name: shopHeader?.name || activeShop?.name || 'Niazi Mobile Mart',
              address: shopHeader?.address || (activeShop as any)?.address || 'Main Branch',
              phone1: shopHeader?.phone || (activeShop as any)?.phone || '',
            };
            const authUser = useAuthStore.getState().user;
            const returnedAmount = result?.sales_return?.total_amount ?? session.cart.reduce((sum, item: any) => sum + (item.unitPrice || 0) * (item.quantity || 1), 0);
            const customerBalAfter = result?.customer_balance_after ?? null;
            let prevBal: number | undefined = undefined;
            let currBal: number | undefined = undefined;
            if (customerBalAfter !== null) {
              currBal = Number(customerBalAfter);
              prevBal = refundMethod === 'CREDIT' ? currBal + returnedAmount : currBal;
            } else if (session.customer && typeof (session.customer as any).currentBalance === 'number') {
              prevBal = Number((session.customer as any).currentBalance);
              currBal = refundMethod === 'CREDIT' ? prevBal - returnedAmount : prevBal;
            }

            const returnTransaction = {
              transactionId: result?.sales_return?.return_number || `RET-${Date.now().toString().slice(-6)}`,
              items: (result?.lines || session.cart).map((line: any) => ({
                productId: line.product_id || line.productId,
                id: line.id || line.product_id || line.productId,
                productName: line.product_name_snapshot || line.productName || 'Returned Item',
                quantity: line.quantity,
                unitPrice: line.unit_price || line.unitPrice || 0,
                discount: 0,
                subtotal: (line.unit_price || line.unitPrice || 0) * (line.quantity || 1),
              })),
              subtotal: returnedAmount,
              discountTotal: 0,
              grandTotal: returnedAmount,
              totalPaid: refundMethod === 'CASH' ? returnedAmount : 0,
              remainingDue: refundMethod === 'CREDIT' ? returnedAmount : 0,
              changeReturned: 0,
              paymentBreakdown: [{ method: refundMethod === 'CASH' ? 'Cash Refund' : 'Customer Credit', amount: returnedAmount }],
              createdAt: Date.now(),
            };

            const invoiceExtras = {
              customer: session.customer ?? null,
              cashier: authUser ? (authUser.role ? `${authUser.name} (${authUser.role})` : authUser.name) : null,
              previousBalance: prevBal,
              currentBalance: currBal,
            };

            const invoice = DocumentService.buildInvoice(returnTransaction as any, realShopProfile as any, invoiceExtras);
            get().setLastInvoice(invoice);
            DocumentService.logPrint(invoice.invoiceId, 'PRINT').catch(() => {});
          } catch (printErr) {
            console.warn('[processInvoiceReturn] auto return receipt generation non-fatal error:', printErr);
          }

          get().clearCart();
          platformAdapter.emitEvent('inventory-updated');

          // Invalidate caches so return history and inventory reflect the change
          try {
            const qc = getQueryClient();
            qc.invalidateQueries({ queryKey: queryKeys.dashboard.all });
            qc.invalidateQueries({ queryKey: ['sales'] });
            qc.invalidateQueries({ queryKey: ['products'] });
            qc.invalidateQueries({ queryKey: queryKeys.customers.all });
            qc.invalidateQueries({ queryKey: ['cash'] });
            qc.invalidateQueries({ queryKey: ['returns'] });
          } catch (qcErr) {
            console.warn('Query cache invalidation failed (invoice return):', qcErr);
          }

          return result;
        } catch (error: any) {
          console.error("Invoice Return failed", error);
          throw error;
        }
      },

      processExchange: async (options) => {
        const session = get().getActiveSession();
        if (!session) return;

        if (!session.linkedInvoiceId) {
          toast.error("Original invoice is required for an exchange. Please select an invoice first.");
          return;
        }

        const returnedItems = session.returnedItems ?? [];
        if (returnedItems.length === 0) {
          toast.error("No returned items found for this exchange.");
          return;
        }

        if (session.cart.length === 0) {
          toast.error("No replacement items in cart for this exchange.");
          return;
        }

        // Fetch authoritative returnable lines for the original sale
        let returnLinesPayload: { saleLineId: string; quantity: number }[] = [];
        try {
          const info = await returnsApi.getSaleReturnableInfo(session.linkedInvoiceId);
          const allocated = allocateReturnLines(
            returnedItems.map((item) => ({
              productId: item.productId,
              productName: item.productName,
              quantity: item.quantity,
            })),
            info.lines
          );
          returnLinesPayload = allocated.map((l: { sale_line_id: string; quantity: number }) => ({
            saleLineId: l.sale_line_id,
            quantity: l.quantity,
          }));
        } catch (allocErr: any) {
          const msg = allocErr?.message || "Failed to validate returnable items";
          toast.error(msg);
          throw allocErr;
        }

        // Reuse existing checkout idempotency key or generate durable one
        let idempotencyKey = session.checkoutIdempotencyKey;
        if (!idempotencyKey) {
          idempotencyKey = `pos_exchange_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
          get().setCheckoutIdempotencyKey(idempotencyKey);
        }

        try {
          const res = await salesApi.processExchange({
            originalSaleId: session.linkedInvoiceId,
            returnLines: returnLinesPayload,
            replacementItems: session.cart.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              discount: 0,
            })),
            replacementDiscount: session.invoiceDiscountValue || 0,
            refundMethod: options?.refundMethod ?? null,
            payments: options?.paymentBreakdown?.map((p) => ({
              method: p.method,
              amount: p.amount,
            })),
            idempotencyKey,
            notes: `POS Exchange against original sale ${session.linkedInvoiceId}`,
          });

          if (!res.success) {
            throw new Error(res.message || 'Exchange failed');
          }

          // Store server-authoritative exchange result for operator display (F-04 fix)
          set((state) => ({
            transactions: [...state.transactions, res.order as any],
            lastExchangeResult: res.exchangeResult ?? null,
          }));

          // Clear cart and reset idempotency key on success
          get().clearCart();
          platformAdapter.emitEvent('inventory-updated');

          // Invalidate React Query caches so affected views refresh
          // without requiring a full application reload (F-01 fix)
          try {
            const qc = getQueryClient();
            qc.invalidateQueries({ queryKey: queryKeys.dashboard.all });
            qc.invalidateQueries({ queryKey: ['sales'] });
            qc.invalidateQueries({ queryKey: ['products'] });
            qc.invalidateQueries({ queryKey: queryKeys.customers.all });
            qc.invalidateQueries({ queryKey: ['cash'] });
            qc.invalidateQueries({ queryKey: ['returns'] });
            // F-03 fix: invalidate customer ledger queries so the ledger view reflects
            // the exchange settlement immediately. Actual key prefix is ['ledger'] per
            // queryKeys.ledger factory — the authorization doc said ['customer-ledger']
            // but that prefix does not exist in this codebase.
            qc.invalidateQueries({ queryKey: ['ledger'] });
          } catch (qcErr) {
            console.warn('Query cache invalidation failed (exchange):', qcErr);
          }

          return res;
        } catch (error: any) {
          console.error("Exchange execution failed:", error);
          throw error;
        }
      },

      setLastInvoice: (invoice) => set({ lastInvoice: invoice }),
      clearLastExchangeResult: () => set({ lastExchangeResult: null })
    }),
    {
      name: 'niazi-pos',
      partialize: (state) => ({
        isWholesaleMode: state.isWholesaleMode,
        // Ideally we only persist offline transactions or handle them with IndexedDB
        // We'll leave it out of localstorage for now, to keep it light.
      }),
    }
  )
);
