'use client';

import React, { useState } from 'react';
import { CycleCard } from '@/components/cycles/CycleCard';
import { NewCycleModal } from '@/components/modals/NewCycleModal';
import { useCycleStore } from '@/store/cycleStore';
import type { Cycle } from '@/types/cycle';

export default function HomePage() {
  const { cycles, addCycle, isNewCycleModalOpen, openNewCycleModal, closeModal, loadFromDb } = useCycleStore();
  const [isSubmitting, setIsSubmitting] = useState(false);

  React.useEffect(() => {
    loadFromDb();
  }, [loadFromDb]);

  const activeCycles = cycles.filter((c) => c.status === 'active');
  const completedCycles = cycles.filter((c) => c.status === 'completed');

  const handleCreateCycle = async (
    settings: Omit<Cycle, 'id' | 'logs'>,
    importLogs?: Array<{
      date: string; type: 'buy' | 'sell'; orderType: string;
      price: number; qty: number; memo?: string; commissionRate: number;
    }>
  ) => {
    setIsSubmitting(true);
    try {
      const newCycle: Cycle = {
        ...settings,
        id: crypto.randomUUID(),
        logs: (importLogs ?? []).map((l) => ({
          id: crypto.randomUUID(),
          cycleId: '',
          date: l.date,
          type: l.type,
          orderType: l.orderType as Cycle['logs'][number]['orderType'],
          price: l.price,
          qty: l.qty,
          memo: l.memo ?? null,
          profit: null,
          commissionRate: l.commissionRate,
          batchId: crypto.randomUUID(),
        })),
      };
      newCycle.logs = newCycle.logs.map((l) => ({ ...l, cycleId: newCycle.id }));
      addCycle(newCycle);
      closeModal();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-50">내 사이클</h1>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            {activeCycles.length}개 진행 중
          </p>
        </div>
        <button
          type="button"
          onClick={openNewCycleModal}
          id="new-cycle-btn"
          className="flex items-center gap-1.5 px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-semibold rounded-full shadow-sm transition-colors"
        >
          <svg viewBox="0 0 16 16" className="w-4 h-4" fill="currentColor">
            <path d="M8 2a.75.75 0 0 1 .75.75v4.5h4.5a.75.75 0 0 1 0 1.5h-4.5v4.5a.75.75 0 0 1-1.5 0v-4.5h-4.5a.75.75 0 0 1 0-1.5h4.5v-4.5A.75.75 0 0 1 8 2Z" />
          </svg>
          새 사이클
        </button>
      </div>

      {/* 활성 사이클 목록 */}
      {activeCycles.length > 0 ? (
        <div className="space-y-3">
          {activeCycles.map((cycle) => (
            <CycleCard key={cycle.id} cycle={cycle} />
          ))}
        </div>
      ) : (
        <div className="text-center py-16">
          <div className="w-16 h-16 bg-indigo-50 dark:bg-indigo-950 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg viewBox="0 0 24 24" className="w-8 h-8 text-indigo-400" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </div>
          <h2 className="text-base font-semibold text-gray-700 dark:text-gray-300 mb-2">
            첫 사이클을 만들어보세요
          </h2>
          <p className="text-sm text-gray-400 dark:text-gray-500 mb-6">
            무한매수법 V2.2, V3.0, V4.0을 지원합니다
          </p>
          <button
            type="button"
            onClick={openNewCycleModal}
            className="px-6 py-2.5 bg-indigo-500 text-white text-sm font-semibold rounded-full shadow-sm hover:bg-indigo-600 transition-colors"
          >
            + 새 사이클
          </button>
        </div>
      )}

      {/* 완료된 사이클 */}
      {completedCycles.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-gray-400 dark:text-gray-500 mb-3 uppercase tracking-wide">
            완료된 사이클
          </h2>
          <div className="space-y-3">
            {completedCycles.map((cycle) => (
              <CycleCard key={cycle.id} cycle={cycle} />
            ))}
          </div>
        </div>
      )}

      {/* 새 사이클 모달 */}
      {isNewCycleModalOpen && (
        <NewCycleModal
          onSubmit={handleCreateCycle}
          onCancel={closeModal}
          isSubmitting={isSubmitting}
        />
      )}
    </>
  );
}
