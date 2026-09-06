import {
  tauriClient,
  SalesReturn,
  SalesReturnDetailDto,
  SaleReturnableInfoDto,
  CreateSalesReturnDto,
  SalesReturnResultDto,
  SalesReturnFilterDto,
  PurchaseReturn,
  PurchaseReturnDetailDto,
  PurchaseReturnableInfoDto,
  CreatePurchaseReturnDto,
  PurchaseReturnResultDto,
  PurchaseReturnFilterDto,
} from '@/lib/tauri/tauriClient';

export const returnsApi = {
  // ── Sales Returns ──────────────────────────────────────────────────────────
  getSaleReturnableInfo: async (saleId: string): Promise<SaleReturnableInfoDto> => {
    return await tauriClient.salesReturnGetReturnable(saleId);
  },

  createSalesReturn: async (dto: CreateSalesReturnDto): Promise<SalesReturnResultDto> => {
    return await tauriClient.salesReturnCreate(dto);
  },

  getSalesReturnById: async (id: string): Promise<SalesReturnDetailDto> => {
    return await tauriClient.salesReturnGet(id);
  },

  listSalesReturns: async (filter?: SalesReturnFilterDto): Promise<SalesReturn[]> => {
    return await tauriClient.salesReturnList(filter);
  },

  getSalesReturnsBySale: async (saleId: string): Promise<SalesReturn[]> => {
    return await tauriClient.salesReturnGetBySale(saleId);
  },

  // ── Purchase Returns ───────────────────────────────────────────────────────
  getPurchaseReturnableInfo: async (purchaseId: string): Promise<PurchaseReturnableInfoDto> => {
    return await tauriClient.purchaseReturnGetReturnable(purchaseId);
  },

  createPurchaseReturn: async (dto: CreatePurchaseReturnDto): Promise<PurchaseReturnResultDto> => {
    return await tauriClient.purchaseReturnCreate(dto);
  },

  getPurchaseReturnById: async (id: string): Promise<PurchaseReturnDetailDto> => {
    return await tauriClient.purchaseReturnGet(id);
  },

  listPurchaseReturns: async (filter?: PurchaseReturnFilterDto): Promise<PurchaseReturn[]> => {
    return await tauriClient.purchaseReturnList(filter);
  },

  getPurchaseReturnsByPurchase: async (purchaseId: string): Promise<PurchaseReturn[]> => {
    return await tauriClient.purchaseReturnGetByPurchase(purchaseId);
  },
};
