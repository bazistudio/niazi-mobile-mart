import { create } from 'zustand';
import { InventoryProduct } from '@/features/inventory/types';

export interface DemandItem {
  product: InventoryProduct;
  demandQty: number;
  unitCost: number;
  customerName?: string;
}

interface DemandState {
  selectedLowStockIds: string[];
  demandItems: DemandItem[];
  selectedSupplierId: string;
  selectedCustomerId: string;
  demandNotes: string;

  toggleSelectLowStock: (productId: string) => void;
  selectAllLowStock: (productIds: string[]) => void;
  clearSelectedLowStock: () => void;

  moveToDemand: (products: InventoryProduct[]) => void;
  addDirectDemandItem: (product: InventoryProduct, qty?: number) => void;
  updateDemandItemQty: (productId: string, qty: number) => void;
  updateDemandItemCost: (productId: string, cost: number) => void;
  removeDemandItem: (productId: string) => void;
  clearDemandQueue: () => void;

  setSelectedSupplierId: (id: string) => void;
  setSelectedCustomerId: (id: string) => void;
  setDemandNotes: (notes: string) => void;
}

export const useDemandStore = create<DemandState>((set) => ({
  selectedLowStockIds: [],
  demandItems: [],
  selectedSupplierId: '',
  selectedCustomerId: '',
  demandNotes: '',

  toggleSelectLowStock: (productId) =>
    set((state) => ({
      selectedLowStockIds: state.selectedLowStockIds.includes(productId)
        ? state.selectedLowStockIds.filter((id) => id !== productId)
        : [...state.selectedLowStockIds, productId],
    })),

  selectAllLowStock: (productIds) =>
    set({ selectedLowStockIds: [...new Set(productIds)] }),

  clearSelectedLowStock: () => set({ selectedLowStockIds: [] }),

  moveToDemand: (products) =>
    set((state) => {
      const existingMap = new Map(state.demandItems.map((item) => [item.product.id, item]));
      products.forEach((p) => {
        if (!existingMap.has(p.id)) {
          existingMap.set(p.id, {
            product: p,
            demandQty: 1,
            unitCost: p.purchasePrice || p.averageCost || 0,
          });
        }
      });
      return {
        demandItems: Array.from(existingMap.values()),
        selectedLowStockIds: [],
      };
    }),

  addDirectDemandItem: (product, qty = 1) =>
    set((state) => {
      const exists = state.demandItems.find((i) => i.product.id === product.id);
      if (exists) {
        return {
          demandItems: state.demandItems.map((i) =>
            i.product.id === product.id ? { ...i, demandQty: i.demandQty + qty } : i
          ),
        };
      }
      return {
        demandItems: [
          ...state.demandItems,
          {
            product,
            demandQty: qty,
            unitCost: product.purchasePrice || product.averageCost || 0,
          },
        ],
      };
    }),

  updateDemandItemQty: (productId, qty) =>
    set((state) => ({
      demandItems: state.demandItems.map((item) =>
        item.product.id === productId ? { ...item, demandQty: Math.max(1, qty) } : item
      ),
    })),

  updateDemandItemCost: (productId, cost) =>
    set((state) => ({
      demandItems: state.demandItems.map((item) =>
        item.product.id === productId ? { ...item, unitCost: Math.max(0, cost) } : item
      ),
    })),

  removeDemandItem: (productId) =>
    set((state) => ({
      demandItems: state.demandItems.filter((item) => item.product.id !== productId),
    })),

  clearDemandQueue: () =>
    set({
      demandItems: [],
      selectedSupplierId: '',
      selectedCustomerId: '',
      demandNotes: '',
    }),

  setSelectedSupplierId: (id) => set({ selectedSupplierId: id }),
  setSelectedCustomerId: (id) => set({ selectedCustomerId: id }),
  setDemandNotes: (notes) => set({ demandNotes: notes }),
}));
