import { create } from 'zustand';

interface InventoryUIState {
  isAddProductOpen: boolean;
  setAddProductOpen: (isOpen: boolean) => void;
}

export const useInventoryUIStore = create<InventoryUIState>((set) => ({
  isAddProductOpen: false,
  setAddProductOpen: (isOpen) => set({ isAddProductOpen: isOpen }),
}));
