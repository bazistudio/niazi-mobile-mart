import {
  tauriClient,
  CashSession,
  OpenCashSessionDto,
  CloseCashSessionDto,
  CashMovement,
  CreateCashAdjustmentDto,
  CashMovementFilterDto,
  DailyCashSummaryDto,
  OrgCashSummaryDto,
} from '@/lib/tauri/tauriClient';

export const cashApi = {
  openSession: async (dto: OpenCashSessionDto): Promise<CashSession> => {
    return await tauriClient.cashSessionOpen(dto);
  },

  closeSession: async (dto: CloseCashSessionDto): Promise<CashSession> => {
    return await tauriClient.cashSessionClose(dto);
  },

  getCurrentSession: async (branchId?: string): Promise<CashSession | null> => {
    return await tauriClient.cashSessionGetCurrent(branchId);
  },

  getSessionById: async (id: string): Promise<CashSession | null> => {
    return await tauriClient.cashSessionGetById(id);
  },

  getSessionList: async (branchId?: string, limit?: number, offset?: number): Promise<CashSession[]> => {
    return await tauriClient.cashSessionList(branchId, limit, offset);
  },

  createAdjustment: async (dto: CreateCashAdjustmentDto): Promise<CashMovement> => {
    return await tauriClient.cashAdjustmentCreate(dto);
  },

  getMovements: async (filter?: CashMovementFilterDto): Promise<CashMovement[]> => {
    return await tauriClient.cashMovementList(filter);
  },

  getDailySummary: async (branchId?: string, businessDate?: string): Promise<DailyCashSummaryDto> => {
    return await tauriClient.cashDailySummary(branchId, businessDate);
  },

  // CMA-3: Organization Admin only — all-branch cash session status and daily totals.
  getOrganizationSummary: async (): Promise<OrgCashSummaryDto> => {
    return await tauriClient.cashOrganizationSummary();
  },
};
