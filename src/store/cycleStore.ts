'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Cycle, NewCycleFormState, StockQuote } from '@/types/cycle';
import { fetchCycles, saveCycle as saveCycleDb, deleteCycleFromDb as deleteCycleDb } from '@/services/dbService';

// -------------------------------------------------------
export { getStaticQuotes, getQuotesForCycle } from '@/utils/stockQuoteUtils';

// -------------------------------------------------------
// 스토어 타입
// -------------------------------------------------------
interface CycleStore {
  cycles: Cycle[];
  selectedCycleId: string | null;

  // ── 사이클 CRUD ──────────────────────────────────────
  setCycles: (cycles: Cycle[]) => void;
  loadFromDb: () => Promise<void>;
  addCycle: (cycle: Cycle) => Promise<void>;
  updateCycle: (id: string, updates: Partial<Cycle>) => Promise<void>;
  deleteCycle: (id: string) => Promise<void>;

  // ── 선택 ─────────────────────────────────────────────
  selectCycle: (id: string | null) => void;

  // ── 모달 상태 ─────────────────────────────────────────
  isNewCycleModalOpen: boolean;
  editingCycleId: string | null;
  openNewCycleModal: () => void;
  openEditCycleModal: (id: string) => void;
  closeModal: () => void;
}

// -------------------------------------------------------
// 기본 초기 사이클 데이터 (my_cycles.json)
// -------------------------------------------------------
let initialCycles: Cycle[] = [];
try {
  // Next.js App Router: 서버 사이드에서 JSON import
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const rawData = require('@/data/cycles.json');
  initialCycles = Array.isArray(rawData) ? rawData : [];
} catch {
  initialCycles = [];
}

// -------------------------------------------------------
// Zustand 스토어 (localStorage & Supabase DB 영속화)
// -------------------------------------------------------
export const useCycleStore = create<CycleStore>()(
  persist(
    (set, get) => ({
      cycles: initialCycles,
      selectedCycleId: null,
      isNewCycleModalOpen: false,
      editingCycleId: null,

      setCycles: (cycles) => set({ cycles }),

      loadFromDb: async () => {
        const fetched = await fetchCycles();
        if (fetched && fetched.length > 0) {
          set({ cycles: fetched });
        }
      },

      addCycle: async (cycle) => {
        set((state) => ({ cycles: [cycle, ...state.cycles] }));
        await saveCycleDb(cycle);
      },

      updateCycle: async (id, updates) => {
        const currentCycles = get().cycles;
        const target = currentCycles.find((c) => c.id === id);
        if (!target) return;

        const updatedTarget = { ...target, ...updates };
        set((state) => ({
          cycles: state.cycles.map((c) => (c.id === id ? updatedTarget : c)),
        }));

        await saveCycleDb(updatedTarget);
      },

      deleteCycle: async (id) => {
        set((state) => ({
          cycles: state.cycles.filter((c) => c.id !== id),
          selectedCycleId: state.selectedCycleId === id ? null : state.selectedCycleId,
        }));
        await deleteCycleDb(id);
      },

      selectCycle: (id) => set({ selectedCycleId: id }),

      openNewCycleModal: () =>
        set({ isNewCycleModalOpen: true, editingCycleId: null }),

      openEditCycleModal: (id) =>
        set({ isNewCycleModalOpen: true, editingCycleId: id }),

      closeModal: () =>
        set({ isNewCycleModalOpen: false, editingCycleId: null }),
    }),
    {
      name: 'lupe-cycles-storage',
      // logs는 JSON 직렬화 가능하므로 전체 persist
    }
  )
);

// -------------------------------------------------------
// 셀렉터 헬퍼
// -------------------------------------------------------
export const selectCycleById = (cycles: Cycle[], id: string | null): Cycle | undefined =>
  id ? cycles.find((c) => c.id === id) : undefined;

export const selectActiveCycles = (cycles: Cycle[]): Cycle[] =>
  cycles.filter((c) => c.status === 'active');

// -------------------------------------------------------
// 새 사이클 ID 생성
// -------------------------------------------------------
export function generateCycleId(): string {
  return crypto.randomUUID();
}

// -------------------------------------------------------
// 폼 상태 → Cycle 객체 변환
// -------------------------------------------------------
export function formStateToCycle(
  form: NewCycleFormState,
  startDate: string
): Cycle {
  return {
    id: generateCycleId(),
    name: form.name,
    ticker: form.ticker.toUpperCase(),
    version: form.version,
    splitCount: form.splitCount,
    maxPercent: form.maxPercent,
    principal: form.principal ?? 0,
    compoundMode: form.version === 'V3.0' ? form.compoundMode : null,
    status: 'active',
    startDate,
    commissionRate: form.commissionRate,
    logs: [],
  };
}
