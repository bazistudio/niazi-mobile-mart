import { create } from 'zustand';
import {
  CashSession,
  DailyCashSummaryDto,
  CashMovement,
  OpenCashSessionDto,
  CloseCashSessionDto,
  CreateCashAdjustmentDto,
} from '../types/cash.types';
import { cashApi } from '@/services/cash.api';
import { useOrganizationStore } from '@/store/useOrganizationStore';
import toast from 'react-hot-toast';

interface CashState {
  currentSession: CashSession | null;
  summary: DailyCashSummaryDto | null;
  movements: CashMovement[];
  historySessions: CashSession[];
  isLoading: boolean;
  isActionLoading: boolean;
  error: string | null;

  fetchCurrentState: (explicitBranchId?: string) => Promise<void>;
  openSession: (dto: OpenCashSessionDto) => Promise<void>;
  closeSession: (dto: CloseCashSessionDto) => Promise<void>;
  createAdjustment: (dto: CreateCashAdjustmentDto) => Promise<void>;
}

export const useCashStore = create<CashState>((set, get) => ({
  currentSession: null,
  summary: null,
  movements: [],
  historySessions: [],
  isLoading: false,
  isActionLoading: false,
  error: null,

  fetchCurrentState: async (explicitBranchId?: string) => {
    try {
      set({ isLoading: true, error: null });
      const branchId =
        explicitBranchId ||
        useOrganizationStore.getState().activeShopId ||
        useOrganizationStore.getState().activeShop?._id ||
        undefined;

      const [currentSession, summary, movements, historySessions] = await Promise.all([
        cashApi.getCurrentSession(branchId).catch(() => null),
        cashApi.getDailySummary(branchId).catch(() => null),
        cashApi.getMovements({ branch_id: branchId, limit: 50 }).catch(() => []),
        cashApi.getSessionList(branchId, 20).catch(() => []),
      ]);

      set({
        currentSession,
        summary,
        movements,
        historySessions,
        isLoading: false,
      });
    } catch (err: any) {
      console.error('Failed to fetch cash state:', err);
      set({
        error: err.message || 'Failed to load cash management data',
        isLoading: false,
      });
    }
  },

  openSession: async (dto) => {
    try {
      set({ isActionLoading: true, error: null });
      const activeShopId =
        dto.branch_id ||
        useOrganizationStore.getState().activeShopId ||
        useOrganizationStore.getState().activeShop?._id ||
        undefined;
      await cashApi.openSession({ ...dto, branch_id: activeShopId });
      await get().fetchCurrentState(activeShopId);
      set({ isActionLoading: false });
      toast.success('Cash session opened successfully');
    } catch (err: any) {
      const msg = err.message || 'Failed to open cash session';
      set({ isActionLoading: false, error: msg });
      toast.error(msg);
      throw err;
    }
  },

  closeSession: async (dto) => {
    try {
      set({ isActionLoading: true, error: null });
      await cashApi.closeSession(dto);
      const activeShopId =
        useOrganizationStore.getState().activeShopId ||
        useOrganizationStore.getState().activeShop?._id ||
        undefined;
      await get().fetchCurrentState(activeShopId);
      set({ isActionLoading: false });
      toast.success('Daily cash session closed successfully');
    } catch (err: any) {
      const msg = err.message || 'Failed to close cash session';
      set({ isActionLoading: false, error: msg });
      toast.error(msg);
      throw err;
    }
  },

  createAdjustment: async (dto) => {
    try {
      set({ isActionLoading: true, error: null });
      const activeShopId =
        dto.branch_id ||
        useOrganizationStore.getState().activeShopId ||
        useOrganizationStore.getState().activeShop?._id ||
        undefined;
      await cashApi.createAdjustment({ ...dto, branch_id: activeShopId });
      await get().fetchCurrentState(activeShopId);
      set({ isActionLoading: false });
      toast.success(`Cash ${dto.direction} adjustment recorded`);
    } catch (err: any) {
      const msg = err.message || 'Failed to record cash adjustment';
      set({ isActionLoading: false, error: msg });
      toast.error(msg);
      throw err;
    }
  },
}));
