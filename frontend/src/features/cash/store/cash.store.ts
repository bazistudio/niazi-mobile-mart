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
import toast from 'react-hot-toast';

interface CashState {
  currentSession: CashSession | null;
  summary: DailyCashSummaryDto | null;
  movements: CashMovement[];
  historySessions: CashSession[];
  isLoading: boolean;
  isActionLoading: boolean;
  error: string | null;

  fetchCurrentState: () => Promise<void>;
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

  fetchCurrentState: async () => {
    try {
      set({ isLoading: true, error: null });
      const [currentSession, summary, movements, historySessions] = await Promise.all([
        cashApi.getCurrentSession(),
        cashApi.getDailySummary(),
        cashApi.getMovements({ limit: 50 }),
        cashApi.getSessionList(undefined, 20),
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
      await cashApi.openSession(dto);
      await get().fetchCurrentState();
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
      await get().fetchCurrentState();
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
      await cashApi.createAdjustment(dto);
      await get().fetchCurrentState();
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
