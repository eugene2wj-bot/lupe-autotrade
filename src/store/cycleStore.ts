'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Cycle, NewCycleFormState, StockQuote } from '@/types/cycle';
import soxlQuotesRaw from '@/data/soxl_quotes.json';
import { fetchCycles, saveCycle as saveCycleDb, deleteCycleFromDb as deleteCycleDb } from '@/services/dbService';

// -------------------------------------------------------
// 정적 주가 데이터 (soxl_quotes.json 기반)
// soxl_quotes.json 구조: { prices: [{date, open, close, high, low}, ...] }
// -------------------------------------------------------
const soxlPrices = (soxlQuotesRaw as { prices: { date: string; open: number; close: number; high: number; low: number }[] }).prices;
const soxlQuotes: StockQuote[] = soxlPrices.map((p) => ({ date: p.date, close: p.close }));

const staticQuotes: Record<string, StockQuote[]> = {
  SOXL: soxlQuotes,
};


export function getStaticQuotes(ticker: string): StockQuote[] {
  return staticQuotes[ticker] ?? [];
}

/**
 * 사이클의 주가 데이터(히스토리) 추출 함수 (범용)
 * 1. staticQuotes에 티커가 존재하면 해당 정적 데이터 반환
 * 2. 없는 경우 cycle.logs 거래 내역의 일자별 가격(센트->달러)을 시계열로 자동 추출하여 반환
 */
export function getQuotesForCycle(cycle: Cycle): StockQuote[] {
  const staticList = getStaticQuotes(cycle.ticker);
  if (staticList && staticList.length > 0) {
    return staticList;
  }
  if (!cycle || !cycle.logs || cycle.logs.length === 0) {
    return [];
  }
  const dateMap = new Map<string, number>();
  const sorted = [...cycle.logs].sort((a, b) => a.date.localeCompare(b.date));
  for (const log of sorted) {
    if (log.price > 0) {
      dateMap.set(log.date, Math.round((log.price / 100) * 100) / 100);
    }
  }
  const derivedQuotes: StockQuote[] = [];
  for (const [date, close] of dateMap.entries()) {
    derivedQuotes.push({ date, close });
  }
  return derivedQuotes;
}

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
        set((state) => {
          const updatedList = state.cycles.map((c) =>
            c.id === id ? { ...c, ...updates } : c
          );
          const target = updatedList.find((c) => c.id === id);
          if (target) {
            saveCycleDb(target);
          }
          return { cycles: updatedList };
        });
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
