import {
  tauriClient,
  Purchase,
  PurchaseLine,
  CompletePurchaseDto,
  PurchaseResultDto,
  PurchaseFilterDto,
  SaveDemandDto,
  SaveDemandResultDto,
  SupplierDemand,
  DemandFilterDto,
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

  // ── Demand CRUD ─────────────────────────────────────────────────────────────
  saveDemand: async (dto: SaveDemandDto): Promise<SaveDemandResultDto> => {
    return await tauriClient.demandSave(dto);
  },

  listDemands: async (filter?: DemandFilterDto): Promise<SupplierDemand[]> => {
    return await tauriClient.demandList(filter);
  },

  getDemand: async (id: string): Promise<SupplierDemand | null> => {
    return await tauriClient.demandGet(id);
  },

  updateDemandStatus: async (id: string, status: 'ORDERED' | 'CANCELLED'): Promise<SupplierDemand> => {
    return await tauriClient.demandUpdateStatus(id, status);
  },
};
