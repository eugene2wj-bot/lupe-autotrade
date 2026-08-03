'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useCycleStore, getQuotesForCycle } from '@/store/cycleStore';
import { GuidePanel } from '@/components/cycles/GuidePanel';
import { TradingHistory } from '@/components/trading/TradingHistory';
import { NewCycleModal } from '@/components/modals/NewCycleModal';
import { getPhaseLabel, getPhaseColor, calcCycleStats } from '@/utils/calculator';
import type { Cycle } from '@/types/cycle';

type Tab = 'guide' | 'history';

interface CycleDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function CycleDetailPage({ params }: CycleDetailPageProps) {
  const [resolvedId, setResolvedId] = useState<string | null>(null);

  React.useEffect(() => {
    params.then((p) => setResolvedId(p.id));
  }, [params]);

  const { cycles, updateCycle, deleteCycle, isNewCycleModalOpen, openEditCycleModal, closeModal } =
    useCycleStore();

  const [activeTab, setActiveTab] = useState<Tab>('guide');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const cycle = cycles.find((c) => c.id === resolvedId);

  if (resolvedId && !cycle) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-400 dark:text-gray-500">사이클을 찾을 수 없습니다</p>
        <Link href="/" className="text-indigo-500 dark:text-indigo-400 text-sm mt-2 inline-block">
          홈으로
        </Link>
      </div>
    );
  }

  if (!cycle) {
    return (
      <div className="text-center py-16">
        <div className="w-8 h-8 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin mx-auto" />
      </div>
    );
  }

  const quotes = getQuotesForCycle(cycle);
  const stats = calcCycleStats(cycle, quotes);

  const handleSave = async (settings: Omit<Cycle, 'id' | 'logs'>) => {
    setIsSubmitting(true);
    try {
      updateCycle(cycle.id, settings);
      closeModal();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = () => {
    if (confirm(`"${cycle.name}" 사이클을 삭제하시겠습니까?`)) {
      deleteCycle(cycle.id);
      window.location.href = '/';
    }
  };

  return (
    <>
      {/* 상단 헤더 */}
      <div className="flex items-center gap-3 mb-5">
        <Link
          href="/"
          className="flex items-center justify-center w-8 h-8 rounded-full bg-white dark:bg-gray-900 shadow-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
        >
          <svg viewBox="0 0 16 16" className="w-4 h-4" fill="currentColor">
            <path fillRule="evenodd" d="M9.78 4.22a.75.75 0 0 1 0 1.06L7.06 8l2.72 2.72a.75.75 0 1 1-1.06 1.06l-3.25-3.25a.75.75 0 0 1 0-1.06l3.25-3.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
          </svg>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5">
            <h1 className="text-lg font-bold text-gray-900 dark:text-gray-50 truncate">
              {cycle.name}
            </h1>
            <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">
              {cycle.ticker} · {cycle.version}
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className={`text-xs font-semibold ${getPhaseColor(stats.phase)}`}>
              {getPhaseLabel(stats.phase)}
            </span>
            <span className="text-xs text-gray-400 dark:text-gray-500">
              T{stats.currentT.toFixed(2)} / {cycle.splitCount}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => openEditCycleModal(cycle.id)}
          className="flex items-center justify-center w-8 h-8 rounded-full bg-white dark:bg-gray-900 shadow-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          aria-label="사이클 설정"
        >
          <svg viewBox="0 0 16 16" className="w-4 h-4" fill="currentColor">
            <path d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" />
            <path fillRule="evenodd" d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0Zm0 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      {/* 탭 */}
      <div className="flex bg-white dark:bg-gray-900 rounded-xl p-1 mb-4 shadow-sm">
        {(['guide', 'history'] as Tab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            id={`tab-${tab}`}
            className={[
              'flex-1 py-2 text-sm font-semibold rounded-lg transition-all',
              activeTab === tab
                ? 'bg-indigo-500 text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200',
            ].join(' ')}
          >
            {tab === 'guide' ? '매매 가이드' : '매매 기록'}
          </button>
        ))}
      </div>

      {/* 탭 내용 */}
      {activeTab === 'guide' ? (
        <GuidePanel cycle={cycle} />
      ) : (
        <TradingHistory cycle={cycle} />
      )}

      {/* 편집 모달 */}
      {isNewCycleModalOpen && (
        <NewCycleModal
          cycle={cycle}
          onSubmit={handleSave}
          onCancel={closeModal}
          onDelete={handleDelete}
          isSubmitting={isSubmitting}
        />
      )}
    </>
  );
}
