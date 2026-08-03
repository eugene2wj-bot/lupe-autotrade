'use client';

import React, { useState, useCallback } from 'react';
import { ToggleGroup } from '@/components/ui/ToggleGroup';
import { NumberInput } from '@/components/ui/NumberInput';
import { CommissionRateInput } from '@/components/ui/CommissionRateInput';
import { TickerSelector } from '@/components/ui/TickerSelector';
import { VERSIONS, VERSION_TICKER_DEFAULTS, VERSION_DEFAULTS } from '@/constants/defaults';
import { QUICK_SELECT_TICKERS } from '@/constants/tickers';
import { toDollars, toCents, toLocalDateStr } from '@/utils/format';
import type { Cycle, NewCycleFormState, Version } from '@/types/cycle';
import { formStateToCycle } from '@/store/cycleStore';

// -------------------------------------------------------
// 기존 매매 기록 가져오기 — 매도 이력 아이템
// -------------------------------------------------------
interface SellRecord {
  id: string;
  date: string;
  price: number; // 원화 단위
  qty: number;
  profit: number; // 원화 단위
}

interface ImportSectionProps {
  startDate: string;
  onStartDateChange: (date: string) => void;
  avgPrice: number | undefined;
  onAvgPriceChange: (v: number | undefined) => void;
  holdingQty: number | undefined;
  onHoldingQtyChange: (v: number | undefined) => void;
  sellRecords: SellRecord[];
  onAddSellRecord: (record: SellRecord) => void;
  onRemoveSellRecord: (id: string) => void;
}

function ImportSection({
  startDate,
  onStartDateChange,
  avgPrice,
  onAvgPriceChange,
  holdingQty,
  onHoldingQtyChange,
  sellRecords,
  onAddSellRecord,
  onRemoveSellRecord,
}: ImportSectionProps) {
  const [sellDate, setSellDate] = useState('');
  const [sellPrice, setSellPrice] = useState<number | undefined>();
  const [sellQty, setSellQty] = useState<number | undefined>();
  const [sellProfit, setSellProfit] = useState<number | undefined>();
  const [profitSign, setProfitSign] = useState<'+' | '-'>('+');

  const canAddSell =
    !!sellDate &&
    sellPrice !== undefined &&
    sellPrice > 0 &&
    sellQty !== undefined &&
    sellQty > 0;

  const handleAddSell = () => {
    if (!canAddSell) return;
    const absProfit = Math.abs(sellProfit ?? 0);
    onAddSellRecord({
      id: crypto.randomUUID(),
      date: sellDate,
      price: toCents(sellPrice!),
      qty: sellQty!,
      profit: toCents(profitSign === '-' ? -absProfit : absProfit),
    });
    setSellDate('');
    setSellPrice(undefined);
    setSellQty(undefined);
    setSellProfit(undefined);
  };

  return (
    <div className="space-y-2.5">
      {/* 시작 날짜 + 평단가/수량 */}
      <div className="bg-white dark:bg-gray-900 rounded-xl overflow-hidden">
        <div className="flex justify-between items-center py-2.5 px-4 border-b border-gray-200/50 dark:border-gray-700/50">
          <span className="text-sm text-gray-900 dark:text-gray-50 shrink-0">시작 날짜</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => onStartDateChange(e.target.value)}
            className="text-sm font-medium text-indigo-500 dark:text-indigo-400 bg-transparent border-none outline-none text-right"
          />
        </div>
        <div className="p-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="flex justify-between items-center px-3 py-2 bg-[#f2f2f7] dark:bg-gray-800 rounded-xl cursor-text">
              <span className="text-xs text-gray-400 dark:text-gray-500">평단가</span>
              <div className="flex items-baseline gap-0.5">
                <span className="text-xs text-gray-400 dark:text-gray-500">$</span>
                <NumberInput
                  value={avgPrice}
                  onValueChange={onAvgPriceChange}
                  decimal={2}
                  placeholder="0"
                  aria-label="평단가"
                  className="w-14 justify-end text-sm font-semibold text-gray-900 dark:text-gray-50"
                />
              </div>
            </label>
            <label className="flex justify-between items-center px-3 py-2 bg-[#f2f2f7] dark:bg-gray-800 rounded-xl cursor-text">
              <span className="text-xs text-gray-400 dark:text-gray-500">수량</span>
              <div className="flex items-baseline gap-0.5">
                <NumberInput
                  value={holdingQty}
                  onValueChange={onHoldingQtyChange}
                  placeholder="0"
                  aria-label="보유 수량"
                  className="w-12 justify-end text-sm font-semibold text-gray-900 dark:text-gray-50"
                />
                <span className="text-xs text-gray-400 dark:text-gray-500">주</span>
              </div>
            </label>
          </div>
        </div>
      </div>

      {/* 매도 이력 */}
      <div className="bg-white dark:bg-gray-900 rounded-xl overflow-hidden">
        <div className="py-2 px-4 border-b border-gray-200/50 dark:border-gray-700/50">
          <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">매도 이력</span>
        </div>

        {sellRecords.map((rec) => (
          <div
            key={rec.id}
            className="flex items-center gap-2 py-2 px-4 border-b border-gray-200/50 dark:border-gray-700/50"
          >
            <div
              className={`w-1 h-6 rounded shrink-0 ${
                (rec.profit || 0) >= 0 ? 'bg-red-500' : 'bg-blue-500'
              }`}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium text-gray-900 dark:text-gray-50">
                  ${toDollars(rec.price).toFixed(2)}
                </span>
                <span className="text-xs text-gray-400 dark:text-gray-500">× {rec.qty}주</span>
              </div>
              <span className="text-[11px] text-gray-400 dark:text-gray-500">
                {rec.date.slice(5)}
              </span>
            </div>
            <span
              className={`text-xs font-semibold ${
                (rec.profit || 0) >= 0
                  ? 'text-red-500 dark:text-red-400'
                  : 'text-blue-500 dark:text-blue-400'
              }`}
            >
              {(rec.profit || 0) >= 0 ? '+' : '−'}${Math.abs(toDollars(rec.profit)).toFixed(2)}
            </span>
            <button
              type="button"
              onClick={() => onRemoveSellRecord(rec.id)}
              className="text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 text-sm ml-1"
            >
              ✕
            </button>
          </div>
        ))}

        {/* 매도 이력 추가 폼 */}
        <div className="p-3 space-y-2">
          <label className="flex justify-between items-center px-3 py-2 bg-[#f2f2f7] dark:bg-gray-800 rounded-xl cursor-text">
            <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">날짜</span>
            <input
              type="date"
              value={sellDate}
              onChange={(e) => setSellDate(e.target.value)}
              className="text-sm font-semibold text-gray-900 dark:text-gray-50 bg-transparent border-none outline-none text-right"
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="flex justify-between items-center px-3 py-2 bg-[#f2f2f7] dark:bg-gray-800 rounded-xl cursor-text">
              <span className="text-xs text-gray-400 dark:text-gray-500">매도가</span>
              <div className="flex items-baseline gap-0.5">
                <span className="text-xs text-gray-400 dark:text-gray-500">$</span>
                <NumberInput
                  value={sellPrice}
                  onValueChange={setSellPrice}
                  decimal={2}
                  placeholder="0"
                  aria-label="매도가"
                  className="w-14 justify-end text-sm font-semibold text-gray-900 dark:text-gray-50"
                />
              </div>
            </label>
            <label className="flex justify-between items-center px-3 py-2 bg-[#f2f2f7] dark:bg-gray-800 rounded-xl cursor-text">
              <span className="text-xs text-gray-400 dark:text-gray-500">수량</span>
              <div className="flex items-baseline gap-0.5">
                <NumberInput
                  value={sellQty}
                  onValueChange={setSellQty}
                  placeholder="0"
                  aria-label="매도 수량"
                  className="w-12 justify-end text-sm font-semibold text-gray-900 dark:text-gray-50"
                />
                <span className="text-xs text-gray-400 dark:text-gray-500">주</span>
              </div>
            </label>
          </div>

          <div className="flex items-center gap-2">
            {/* +/- 토글 */}
            <button
              type="button"
              onClick={() => setProfitSign(profitSign === '+' ? '-' : '+')}
              className="relative flex items-center w-[48px] h-[36px] rounded-xl bg-[#e5e5ea] dark:bg-gray-800 p-[2px] shrink-0"
              aria-label="손익 부호 전환"
            >
              <div
                className={`absolute top-[2px] w-[22px] h-[32px] rounded-lg shadow-sm transition-all duration-200 ${
                  profitSign === '+' ? 'left-[2px] bg-red-500' : 'left-[24px] bg-blue-500'
                }`}
              />
              <span
                className={`flex-1 text-center text-xs font-bold z-10 transition-colors ${
                  profitSign === '+' ? 'text-white' : 'text-gray-400 dark:text-gray-500'
                }`}
              >
                +
              </span>
              <span
                className={`flex-1 text-center text-xs font-bold z-10 transition-colors ${
                  profitSign === '-' ? 'text-white' : 'text-gray-400 dark:text-gray-500'
                }`}
              >
                −
              </span>
            </button>

            <label className="flex-1 flex justify-between items-center px-3 py-2 bg-[#f2f2f7] dark:bg-gray-800 rounded-xl cursor-text">
              <span className="text-xs text-gray-400 dark:text-gray-500">손익</span>
              <div className="flex items-baseline gap-0.5">
                <span className="text-xs text-gray-400 dark:text-gray-500">$</span>
                <NumberInput
                  value={sellProfit}
                  onValueChange={setSellProfit}
                  decimal={2}
                  placeholder="0"
                  aria-label="손익"
                  className="w-14 justify-end text-sm font-semibold text-gray-900 dark:text-gray-50"
                />
              </div>
            </label>

            <button
              type="button"
              onClick={handleAddSell}
              disabled={!canAddSell}
              className="px-3.5 py-2 bg-indigo-500 text-white rounded-xl text-xs font-medium hover:bg-indigo-600 disabled:opacity-40 shrink-0"
            >
              추가
            </button>
          </div>

          {sellRecords.length === 0 && (
            <p className="text-xs text-gray-300 dark:text-gray-600 text-center py-2.5">
              매도 이력이 없으면 비워두세요
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ================================================================
// 새 사이클 / 사이클 설정 모달
// 원본: e5fc4151c71a6854.js Line 1388~1551 (함수 S)
// ================================================================
interface NewCycleModalProps {
  /** 편집 모드일 때 기존 사이클 */
  cycle?: Cycle;
  onSubmit: (settings: Omit<Cycle, 'id' | 'logs'>, importLogs?: Array<{
    date: string; type: 'buy' | 'sell'; orderType: string;
    price: number; qty: number; memo?: string; commissionRate: number;
  }>) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => void;
  isSubmitting?: boolean;
}

export function NewCycleModal({
  cycle,
  onSubmit,
  onCancel,
  onDelete,
  isSubmitting = false,
}: NewCycleModalProps) {
  const isEdit = !!cycle;

  // 탭: 'new' | 'import'
  const [importMode, setImportMode] = useState<'new' | 'import'>('new');

  // 폼 상태
  const [form, setForm] = useState<NewCycleFormState>({
    name: cycle?.name ?? '',
    ticker: cycle?.ticker ?? 'TQQQ',
    version: cycle?.version ?? 'V2.2',
    splitCount: cycle?.splitCount ?? 20,
    maxPercent: cycle?.maxPercent ?? 10,
    principal: cycle?.principal,
    compoundMode: cycle?.compoundMode ?? 'half',
    commissionRate: cycle?.commissionRate ?? 0,
  });

  // 가져오기 상태
  const [startDate, setStartDate] = useState(toLocalDateStr(new Date()));
  const [importAvgPrice, setImportAvgPrice] = useState<number | undefined>();
  const [importHoldingQty, setImportHoldingQty] = useState<number | undefined>();
  const [sellRecords, setSellRecords] = useState<SellRecord[]>([]);

  /** V4.0이 아닐 때만 가져오기 허용 */
  const canImport = form.version !== 'V4.0';

  // 버전/티커 변경 시 기본값 자동 적용
  const updateForm = useCallback(
    (updates: Partial<NewCycleFormState>) => {
      setForm((prev) => {
        const next = { ...prev, ...updates };

        // V4.0이면 티커를 퀵셀렉트로 제한
        if (updates.version === 'V4.0' && !QUICK_SELECT_TICKERS.includes(next.ticker as typeof QUICK_SELECT_TICKERS[number])) {
          next.ticker = 'TQQQ';
        }

        // 버전 또는 티커 변경 시 기본값 적용
        if (updates.version || updates.ticker) {
          const versionDefaults =
            VERSION_TICKER_DEFAULTS[next.version]?.[next.ticker] ?? VERSION_DEFAULTS[next.version];
          if (versionDefaults) {
            next.splitCount = versionDefaults.splitCount;
            next.maxPercent = versionDefaults.maxPercent;
          }
        }

        return next;
      });
    },
    []
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.name.trim()) return alert('사이클명을 입력해주세요');
    if (!form.splitCount || form.splitCount < 2) return alert('분할 수를 2 이상 입력해주세요');
    if (form.maxPercent === undefined || form.maxPercent < 1) return alert('max%를 1 이상 입력해주세요');
    if (!form.principal || form.principal < 1) return alert('원금을 입력해주세요');

    const settings: Omit<Cycle, 'id' | 'logs'> = {
      name: form.name,
      ticker: form.ticker.toUpperCase(),
      version: form.version,
      splitCount: form.splitCount,
      maxPercent: form.maxPercent,
      principal: form.principal,
      compoundMode: form.version === 'V3.0' ? form.compoundMode : null,
      status: cycle?.status ?? 'active',
      startDate:
        importMode === 'import' ? startDate : cycle?.startDate ?? toLocalDateStr(new Date()),
      commissionRate: form.commissionRate,
    };

    if (importMode === 'import') {
      if (!importAvgPrice || importAvgPrice <= 0) return alert('평단가를 입력해주세요');
      if (!importHoldingQty || importHoldingQty <= 0) return alert('보유 수량을 입력해주세요');

      for (const rec of sellRecords) {
        if (rec.date < startDate) return alert('매도 날짜가 시작 날짜보다 이전입니다');
        if (rec.qty <= 0) return alert('매도 수량은 0보다 커야 합니다');
        if (rec.price <= 0) return alert('매도가는 0보다 커야 합니다');
      }

      const totalSellQty = sellRecords.reduce((s, r) => s + r.qty, 0);
      const importLogs: Array<{
        date: string; type: 'buy' | 'sell'; orderType: string;
        price: number; qty: number; memo?: string; commissionRate: number;
      }> = [];

      importLogs.push({
        date: startDate,
        type: 'buy',
        orderType: 'init',
        price: toCents(importAvgPrice),
        qty: importHoldingQty + totalSellQty,
        memo: '가져오기 (합성 매수)',
        commissionRate: form.commissionRate,
      });

      for (const rec of [...sellRecords].sort((a, b) => a.date.localeCompare(b.date))) {
        importLogs.push({
          date: rec.date,
          type: 'sell',
          orderType: 'limit',
          price: rec.price,
          qty: rec.qty,
          memo: '가져오기',
          commissionRate: form.commissionRate,
        });
      }

      await onSubmit(settings, importLogs);
    } else {
      await onSubmit(settings);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* 배경 오버레이 */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* 모달 패널 */}
      <form
        onSubmit={handleSubmit}
        className="relative w-full sm:max-w-md bg-[#f2f2f7] dark:bg-gray-950 rounded-t-2xl sm:rounded-2xl flex flex-col max-h-[85vh] shadow-2xl"
      >
        {/* 헤더 */}
        <div className="flex justify-between items-center px-5 py-4 shrink-0">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="text-indigo-500 dark:text-indigo-400 text-[15px] disabled:opacity-40"
          >
            취소
          </button>
          <h3 className="font-semibold text-base text-gray-900 dark:text-gray-50">
            {isEdit ? '사이클 설정' : '새 사이클'}
          </h3>
          <button
            type="submit"
            disabled={isSubmitting}
            className="text-indigo-500 dark:text-indigo-400 text-[15px] font-semibold disabled:opacity-40"
          >
            {isSubmitting
              ? isEdit ? '저장 중...' : '생성 중...'
              : isEdit ? '저장' : '생성'}
          </button>
        </div>

        {/* 스크롤 영역 */}
        <div className="px-4 pb-4 space-y-2.5 overflow-y-auto flex-1 min-h-0">

          {/* ── 사이클명 / 종목 / 버전 ── */}
          <div className="bg-white dark:bg-gray-900 rounded-xl overflow-hidden">
            {/* 사이클명 */}
            <label className="flex justify-between items-center py-3 px-4 border-b border-gray-200/50 dark:border-gray-700/50 cursor-text">
              <span className="text-sm text-gray-900 dark:text-gray-50">사이클명</span>
              <input
                type="text"
                value={form.name}
                onChange={(e) => updateForm({ name: e.target.value })}
                placeholder="TQQQ 1차"
                required
                className="text-sm text-right bg-transparent border-none outline-none w-36 placeholder:text-gray-400 dark:placeholder:text-gray-500 dark:text-gray-50"
              />
            </label>

            {/* 종목 */}
            <div
              className={`flex justify-between items-center py-3 px-4 border-b border-gray-200/50 dark:border-gray-700/50 ${
                isEdit ? 'opacity-45' : ''
              }`}
            >
              <span className="text-sm text-gray-900 dark:text-gray-50">종목</span>
              <TickerSelector
                value={form.ticker}
                onChange={(ticker) => updateForm({ ticker })}
                disabled={isEdit}
                restrictedToDefault={form.version === 'V4.0'}
              />
            </div>

            {/* 버전 */}
            <div
              className={`flex justify-between items-center py-3 px-4 ${
                isEdit ? 'opacity-45' : ''
              }`}
            >
              <span className="text-sm text-gray-900 dark:text-gray-50">버전</span>
              <ToggleGroup
                options={VERSIONS}
                value={form.version}
                onChange={(version: Version) => updateForm({ version })}
                disabled={isEdit}
              />
            </div>
          </div>

          {/* ── 분할수 / max% / 원금 ── */}
          <div className="bg-white dark:bg-gray-900 rounded-xl p-3">
            <div className="grid grid-cols-2 gap-2 mb-2">
              <label className="flex justify-between items-center px-3 py-2 bg-[#f2f2f7] dark:bg-gray-800 rounded-xl cursor-text">
                <span className="text-xs text-gray-400 dark:text-gray-500">분할</span>
                <NumberInput
                  value={form.splitCount}
                  onValueChange={(v) => updateForm({ splitCount: v })}
                  placeholder="0"
                  aria-label="분할"
                  className="w-12 justify-end text-sm font-semibold text-gray-900 dark:text-gray-50"
                />
              </label>
              <label className="flex justify-between items-center px-3 py-2 bg-[#f2f2f7] dark:bg-gray-800 rounded-xl cursor-text">
                <span className="text-xs text-gray-400 dark:text-gray-500">max%</span>
                <NumberInput
                  value={form.maxPercent}
                  onValueChange={(v) => updateForm({ maxPercent: v })}
                  placeholder="0"
                  aria-label="max%"
                  className="w-12 justify-end text-sm font-semibold text-gray-900 dark:text-gray-50"
                />
              </label>
            </div>

            <label className="flex justify-between items-center px-3 py-2 bg-[#f2f2f7] dark:bg-gray-800 rounded-xl cursor-text">
              <span className="text-xs text-gray-400 dark:text-gray-500">총 원금</span>
              <div className="flex items-baseline gap-0.5">
                <span className="text-xs text-gray-400 dark:text-gray-500">$</span>
                <NumberInput
                  value={form.principal !== undefined ? toDollars(form.principal) : undefined}
                  onValueChange={(v) => updateForm({ principal: v !== undefined ? toCents(v) : undefined })}
                  decimal={2}
                  placeholder="0"
                  aria-label="총 원금"
                  className="w-20 justify-end text-sm font-semibold text-gray-900 dark:text-gray-50"
                />
              </div>
            </label>
          </div>

          {/* ── 수수료율 ── */}
          <div className="bg-white dark:bg-gray-900 rounded-xl p-3">
            <CommissionRateInput
              value={form.commissionRate}
              onChange={(rate) => updateForm({ commissionRate: rate })}
            />
          </div>

          {/* ── 기존 매매 기록 가져오기 (신규 + V2.2/V3.0만) ── */}
          {!isEdit && canImport && (
            <>
              <div className="bg-white dark:bg-gray-900 rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setImportMode(importMode === 'import' ? 'new' : 'import')}
                  className="w-full flex justify-between items-center py-3 px-4"
                >
                  <span
                    className={`text-sm font-semibold ${
                      importMode === 'import'
                        ? 'text-indigo-500 dark:text-indigo-400'
                        : 'text-gray-900 dark:text-gray-50'
                    }`}
                  >
                    기존 매매 기록 가져오기
                  </span>
                  <span
                    className={`text-gray-300 dark:text-gray-600 text-xl font-light transition-transform duration-200 ${
                      importMode === 'import' ? 'rotate-90' : ''
                    }`}
                  >
                    ›
                  </span>
                </button>
              </div>

              {importMode === 'import' && (
                <ImportSection
                  startDate={startDate}
                  onStartDateChange={setStartDate}
                  avgPrice={importAvgPrice}
                  onAvgPriceChange={setImportAvgPrice}
                  holdingQty={importHoldingQty}
                  onHoldingQtyChange={setImportHoldingQty}
                  sellRecords={sellRecords}
                  onAddSellRecord={(rec) =>
                    setSellRecords((prev) =>
                      [...prev, rec].sort((a, b) => a.date.localeCompare(b.date))
                    )
                  }
                  onRemoveSellRecord={(id) =>
                    setSellRecords((prev) => prev.filter((r) => r.id !== id))
                  }
                />
              )}
            </>
          )}

          {/* ── 사이클 삭제 (편집 모드) ── */}
          {isEdit && onDelete && (
            <div className="bg-white dark:bg-gray-900 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={onDelete}
                className="w-full py-3 px-4 text-[15px] text-red-500 dark:text-red-400 text-center"
              >
                사이클 삭제
              </button>
            </div>
          )}
        </div>
      </form>
    </div>
  );
}
