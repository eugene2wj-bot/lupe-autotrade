'use client';

import React, { useMemo, useState, useRef, useEffect } from 'react';
import type { Cycle, TradeLog, OrderType, StockQuote } from '@/types/cycle';
import { formatDollars, toDollars, toCents } from '@/utils/format';
import { useCycleStore, getQuotesForCycle } from '@/store/cycleStore';
import { fetchStockQuote, type StockQuoteDetail } from '@/services/stockApi';

const ORDER_TYPE_OPTIONS: { value: OrderType; label: string }[] = [
  { value: 'star', label: '☆매수' },
  { value: 'avg', label: '평단' },
  { value: 'extra', label: '추가' },
  { value: 'init', label: '초기' },
  { value: 'moc', label: 'MOC' },
  { value: 'quarter', label: '쿼터' },
  { value: 'limit', label: '지정가' },
  { value: 'reverse', label: '리버스' },
];

const ORDER_TYPE_CONFIG: Record<
  OrderType,
  { label: string; bg: string; text: string }
> = {
  init: { label: '초기', bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-500 dark:text-gray-400' },
  star: { label: '☆매수', bg: 'bg-indigo-100 dark:bg-indigo-950', text: 'text-indigo-600 dark:text-indigo-400' },
  avg: { label: '평단', bg: 'bg-orange-100 dark:bg-orange-950', text: 'text-orange-600 dark:text-orange-400' },
  extra: { label: '추가', bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-500 dark:text-gray-400' },
  moc: { label: 'MOC', bg: 'bg-purple-100 dark:bg-purple-950', text: 'text-purple-600 dark:text-purple-400' },
  quarter: { label: '쿼터', bg: 'bg-rose-100 dark:bg-rose-950', text: 'text-rose-600 dark:text-rose-400' },
  limit: { label: '지정가', bg: 'bg-blue-100 dark:bg-blue-950', text: 'text-blue-600 dark:text-blue-400' },
  reverse: { label: '리버스', bg: 'bg-violet-100 dark:bg-violet-950', text: 'text-violet-600 dark:text-violet-400' },
};

/**
 * 일자별 종가 및 전일대비 등락율 Map 생성 헬퍼
 */
export function buildDailyQuoteMap(
  quotes: StockQuote[],
  logs: TradeLog[]
): Map<string, { close: number; changePercent: number }> {
  const map = new Map<string, { close: number; changePercent: number }>();
  const dateQuoteMap = new Map<string, number>();

  for (const q of quotes) {
    if (q.close > 0) {
      dateQuoteMap.set(q.date, q.close);
    }
  }

  const sortedLogs = [...logs].sort((a, b) => a.date.localeCompare(b.date));
  for (const log of sortedLogs) {
    if (log.price > 0 && !dateQuoteMap.has(log.date)) {
      dateQuoteMap.set(log.date, toDollars(log.price));
    }
  }

  const sortedDates = Array.from(dateQuoteMap.keys()).sort();

  for (let i = 0; i < sortedDates.length; i++) {
    const d = sortedDates[i];
    const close = dateQuoteMap.get(d)!;
    const prevClose = i > 0 ? dateQuoteMap.get(sortedDates[i - 1])! : close;
    const changePercent = prevClose > 0 ? ((close - prevClose) / prevClose) * 100 : 0;
    map.set(d, { close, changePercent });
  }

  return map;
}

interface DateTabProps {
  date: string;
  closePrice?: number;
  changePercent?: number;
  isSelected: boolean;
  onClick: () => void;
}

function DateTab({ date, closePrice, changePercent, isSelected, onClick }: DateTabProps) {
  const [month, day] = date.slice(5).split('-');

  const hasQuote = closePrice !== undefined && closePrice > 0;
  const isPositive = (changePercent ?? 0) >= 0;

  const changeColorClass = isSelected
    ? isPositive
      ? 'text-red-200'
      : 'text-blue-200'
    : isPositive
      ? 'text-red-500 dark:text-red-400'
      : 'text-blue-600 dark:text-blue-400';

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'flex flex-col items-center px-3 py-2 rounded-xl text-xs font-medium transition-all shrink-0 min-w-[72px]',
        isSelected
          ? 'bg-indigo-500 text-white shadow-sm ring-2 ring-indigo-500/30'
          : 'bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 shadow-xs border border-gray-100 dark:border-gray-800',
      ].join(' ')}
    >
      <span className={isSelected ? 'text-indigo-100 text-[10.5px] font-medium' : 'text-gray-400 dark:text-gray-500 text-[10.5px] font-medium'}>
        {month}-{day}
      </span>
      {hasQuote ? (
        <>
          <span className={`text-[13.5px] font-bold tabular-nums leading-tight mt-0.5 ${isSelected ? 'text-white' : 'text-gray-900 dark:text-gray-50'}`}>
            ${closePrice.toFixed(2)}
          </span>
          <span className={`text-[10.5px] font-extrabold tabular-nums mt-0.5 ${changeColorClass}`}>
            {isPositive ? '+' : ''}{(changePercent ?? 0).toFixed(2)}%
          </span>
        </>
      ) : (
        <span className="text-[13.5px] font-bold leading-tight mt-0.5">{day}일</span>
      )}
    </button>
  );
}

interface DayLogBadgeProps {
  logs: TradeLog[];
  onManualMode: () => void;
}

function DayLogBadge({ logs, onManualMode }: DayLogBadgeProps) {
  const buyLogs = logs.filter((l) => l.type === 'buy');
  const sellLogs = logs.filter((l) => l.type === 'sell');

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl p-4 space-y-3 shadow-xs">
      {buyLogs.length > 0 && (
        <div className="space-y-2">
          <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wide">
            매수 내역
          </span>
          {buyLogs.map((log) => {
            const cfg = ORDER_TYPE_CONFIG[log.orderType] ?? ORDER_TYPE_CONFIG.extra;
            return (
              <div key={log.id} className="flex items-center justify-between gap-2 py-0.5">
                <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${cfg.bg} ${cfg.text}`}>
                  {cfg.label}
                </span>
                <span className="text-sm font-bold text-gray-900 dark:text-gray-50 tabular-nums">
                  ${formatDollars(log.price)} × {log.qty}주
                </span>
              </div>
            );
          })}
        </div>
      )}

      {sellLogs.length > 0 && (
        <div className="space-y-2">
          <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wide">
            매도 내역
          </span>
          {sellLogs.map((log) => {
            const cfg = ORDER_TYPE_CONFIG[log.orderType] ?? ORDER_TYPE_CONFIG.limit;
            return (
              <div key={log.id} className="flex items-center justify-between gap-2 py-0.5">
                <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${cfg.bg} ${cfg.text}`}>
                  {cfg.label}
                </span>
                <div className="flex items-center gap-2 text-sm font-bold text-gray-900 dark:text-gray-50 tabular-nums">
                  <span>${log.price === 0 ? 'MOC' : formatDollars(log.price)}</span>
                  <span className="text-gray-400 dark:text-gray-500">× {log.qty}주</span>
                  {log.profit !== null && log.profit !== undefined && (
                    <span
                      className={`text-xs ${
                        log.profit >= 0
                          ? 'text-red-500 dark:text-red-400'
                          : 'text-blue-500 dark:text-blue-400'
                      }`}
                    >
                      {log.profit >= 0 ? '+' : '−'}${Math.abs(toDollars(log.profit)).toFixed(2)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="pt-2 border-t border-gray-100 dark:border-gray-800 flex justify-end">
        <button
          type="button"
          onClick={onManualMode}
          className="text-xs font-semibold text-indigo-500 hover:text-indigo-600 dark:text-indigo-400 transition-colors"
        >
          ✏️ 수동 수정 모드로 전환
        </button>
      </div>
    </div>
  );
}

/**
 * 수동 모드 수정 폼: 매수가, 수량, 매수/매도 및 주문성격을 사용자가 직접 수정 가능
 */
function ManualModeForm({
  cycleId,
  logs,
  onBack,
}: {
  cycleId: string;
  logs: TradeLog[];
  onBack: () => void;
}) {
  const { updateCycle } = useCycleStore();
  const [editableLogs, setEditableLogs] = useState<TradeLog[]>(logs);

  const handleLogChange = (id: string, field: keyof TradeLog, value: any) => {
    setEditableLogs((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  const handleSave = () => {
    const store = useCycleStore.getState();
    const cycle = store.cycles.find((c) => c.id === cycleId);
    if (!cycle) return;

    // 수정된 logs로 교체
    const updatedLogs = cycle.logs.map((original) => {
      const match = editableLogs.find((e) => e.id === original.id);
      return match ? match : original;
    });

    updateCycle(cycleId, { logs: updatedLogs });
    alert('체결 기록이 수정되었습니다.');
    onBack();
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl p-4 space-y-3 shadow-xs border border-indigo-100 dark:border-indigo-950">
      <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-gray-800">
        <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
          ✏️ 매매 기록 수동 수정
        </span>
        <button
          type="button"
          onClick={onBack}
          className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
        >
          취소 / 자동 모드로
        </button>
      </div>

      <div className="space-y-3">
        {editableLogs.map((log) => (
          <div
            key={log.id}
            className="flex flex-wrap items-center gap-2 p-2.5 bg-gray-50 dark:bg-gray-800/60 rounded-xl"
          >
            {/* 매수 / 매도 토글 */}
            <button
              type="button"
              onClick={() => handleLogChange(log.id, 'type', log.type === 'buy' ? 'sell' : 'buy')}
              className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-colors ${
                log.type === 'buy'
                  ? 'bg-red-500 text-white'
                  : 'bg-blue-500 text-white'
              }`}
            >
              {log.type === 'buy' ? '매수' : '매도'}
            </button>

            {/* 주문 성격 (orderType) 선택 */}
            <select
              value={log.orderType}
              onChange={(e) => handleLogChange(log.id, 'orderType', e.target.value as OrderType)}
              className="text-xs font-semibold px-2 py-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg outline-none"
            >
              {ORDER_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            {/* 매수가 (단가) 입력 */}
            <div className="flex items-center gap-1">
              <span className="text-xs text-gray-400">$</span>
              <input
                type="number"
                step="0.01"
                value={toDollars(log.price)}
                onChange={(e) => handleLogChange(log.id, 'price', toCents(parseFloat(e.target.value) || 0))}
                placeholder="단가"
                className="w-20 px-2 py-1 text-xs font-bold text-right bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg outline-none focus:border-indigo-500"
              />
            </div>

            {/* 수량 (주수) 입력 */}
            <div className="flex items-center gap-1">
              <span className="text-xs text-gray-400">×</span>
              <input
                type="number"
                value={log.qty}
                onChange={(e) => handleLogChange(log.id, 'qty', parseInt(e.target.value, 10) || 0)}
                placeholder="수량"
                className="w-14 px-2 py-1 text-xs font-bold text-right bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg outline-none focus:border-indigo-500"
              />
              <span className="text-xs text-gray-400">주</span>
            </div>
          </div>
        ))}
      </div>

      <div className="pt-2 flex gap-2 justify-end">
        <button
          type="button"
          onClick={handleSave}
          className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold rounded-xl shadow-xs transition-colors"
        >
          저장 완료
        </button>
      </div>
    </div>
  );
}

interface TradingHistoryProps {
  cycle: Cycle;
}

export function TradingHistory({ cycle }: TradingHistoryProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [stockDetail, setStockDetail] = useState<StockQuoteDetail | null>(null);

  useEffect(() => {
    fetchStockQuote(cycle.ticker, cycle).then((detail) => setStockDetail(detail));
  }, [cycle]);

  const quotes = stockDetail?.quotes ?? getQuotesForCycle(cycle);

  const dailyQuoteMap = useMemo(() => {
    return buildDailyQuoteMap(quotes, cycle.logs);
  }, [quotes, cycle.logs]);

  const tradingDates = useMemo(() => {
    const dates = [...new Set(cycle.logs.map((l) => l.date))].sort();
    return dates;
  }, [cycle.logs]);

  const [selectedDate, setSelectedDate] = useState<string | null>(
    tradingDates.length > 0 ? tradingDates[tradingDates.length - 1] : null
  );

  const [manualModeDates, setManualModeDates] = useState<Set<string>>(new Set());

  const selectedLogs = useMemo(() => {
    if (!selectedDate) return [];
    return cycle.logs.filter((l) => l.date === selectedDate);
  }, [cycle.logs, selectedDate]);

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.deltaY !== 0 && scrollRef.current) {
      scrollRef.current.scrollLeft += e.deltaY;
    }
  };

  if (tradingDates.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-gray-400 dark:text-gray-500">아직 매매 기록이 없습니다</p>
      </div>
    );
  }

  const toggleManualMode = (date: string) => {
    setManualModeDates((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  };

  return (
    <div>
      {/* ── 날짜 탭 (종가 및 전일대비 등락율 표시) ── */}
      <div className="relative pb-2">
        <div
          ref={scrollRef}
          onWheel={handleWheel}
          className="flex gap-2 overflow-x-auto pb-2.5 pt-1 px-0.5 cursor-grab active:cursor-grabbing scrollbar-thin scrollbar-thumb-indigo-200 dark:scrollbar-thumb-indigo-900 scrollbar-track-transparent"
        >
          {tradingDates.map((date) => {
            const quoteInfo = dailyQuoteMap.get(date);
            return (
              <DateTab
                key={date}
                date={date}
                closePrice={quoteInfo?.close}
                changePercent={quoteInfo?.changePercent}
                isSelected={selectedDate === date}
                onClick={() => setSelectedDate(date)}
              />
            );
          })}
        </div>
        <p className="text-[10px] text-gray-300 dark:text-gray-600 text-center mt-1">
          ← 마우스 휠/터치 스크롤로 거래 날짜 이동 가능
        </p>
      </div>

      {selectedDate && selectedLogs.length > 0 && (
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              {selectedDate}
            </span>
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {selectedLogs.length}건
            </span>
          </div>

          {manualModeDates.has(selectedDate) ? (
            <ManualModeForm
              cycleId={cycle.id}
              logs={selectedLogs}
              onBack={() => toggleManualMode(selectedDate)}
            />
          ) : (
            <DayLogBadge
              logs={selectedLogs}
              onManualMode={() => toggleManualMode(selectedDate)}
            />
          )}
        </div>
      )}

      {selectedDate && selectedLogs.length === 0 && (
        <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
          해당 날짜 기록 없음
        </p>
      )}
    </div>
  );
}
