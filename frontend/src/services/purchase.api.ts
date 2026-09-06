import {
  tauriClient,
  Purchase,
  PurchaseLine,
  CompletePurchaseDto,
  PurchaseResultDto,
  PurchaseFilterDto,
} from '@/lib/tauri/tauriClient';

export const purchaseApi = {
  completePurchase: async (dto: CompletePurchaseDto): Promise<PurchaseResultDto> => {
    return await tauriClient.purchaseComplete(dto);
  },

  getPurchases: async (filter?: PurchaseFilterDto): Promise<Purchase[]> => {
    return await tauriClient.purchaseList(filter);
  },

  getPurchaseById: async (id: string): Promise<Purchase | null> => {
    return await tauriClient.purchaseGetById(id);
  },

  getPurchaseByNumber: async (purchaseNumber: string): Promise<Purchase | null> => {
    return await tauriClient.purchaseGetByNumber(purchaseNumber);
  },

  getPurchaseLines: async (purchaseId: string): Promise<PurchaseLine[]> => {
    return await tauriClient.purchaseGetLines(purchaseId);
  },
};
