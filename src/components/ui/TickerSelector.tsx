'use client';

import React, { useState } from 'react';
import { QUICK_SELECT_TICKERS, TICKERS } from '@/constants/tickers';

interface TickerSelectorProps {
  value: string;
  onChange: (ticker: string) => void;
  disabled?: boolean;
  /** V4.0 에서 true: TQQQ/SOXL만 허용 */
  restrictedToDefault?: boolean;
}

function chipClass(isSelected: boolean): string {
  return `flex-1 py-1.5 px-3 rounded-md text-[13px] font-medium transition-all ${
    isSelected
      ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-50 shadow-sm'
      : 'text-gray-400 dark:text-gray-500'
  }`;
}

/**
 * 종목 선택 컴포넌트
 * 원본: ae2a204e5d45755a.js Line 11709~11784 (module 582262)
 * - TQQQ / SOXL 퀵 칩
 * - [+ 검색] 팝오버 (종목명/심볼 검색)
 */
export function TickerSelector({
  value,
  onChange,
  disabled = false,
  restrictedToDefault = false,
}: TickerSelectorProps) {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [query, setQuery] = useState('');

  // 현재 선택된 티커가 퀵셀렉트 목록에 없으면 커스텀 티커
  const isCustomTicker = !QUICK_SELECT_TICKERS.includes(value as typeof QUICK_SELECT_TICKERS[number]);
  const customTicker = isCustomTicker ? value : null;

  const filteredTickers = (
    query
      ? TICKERS.filter(
          (t) =>
            t.symbol.toLowerCase().includes(query.toLowerCase()) ||
            t.name.toLowerCase().includes(query.toLowerCase())
        )
      : TICKERS
  ).slice(0, 8);

  const handleSelect = (ticker: string) => {
    onChange(ticker);
    setIsSearchOpen(false);
    setQuery('');
  };

  return (
    <div className={`relative flex bg-[#e5e5ea] dark:bg-gray-800 rounded-lg p-[2px] ${disabled ? 'opacity-45' : ''}`}>
      {/* TQQQ / SOXL 칩 */}
      {QUICK_SELECT_TICKERS.map((ticker) => (
        <button
          key={ticker}
          type="button"
          disabled={disabled}
          onClick={() => onChange(ticker)}
          className={`${chipClass(value === ticker)} ${disabled ? 'cursor-not-allowed' : ''}`}
        >
          {ticker}
        </button>
      ))}

      {/* [+ 검색] 버튼 (V4.0에서 제한) */}
      {!restrictedToDefault && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => setIsSearchOpen((prev) => !prev)}
          className={`${chipClass(!!customTicker)} ${disabled ? 'cursor-not-allowed' : ''}`}
        >
          {customTicker ?? '+ 검색'}
        </button>
      )}

      {/* 검색 팝오버 */}
      {isSearchOpen && (
        <>
          {/* 오버레이 */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => {
              setIsSearchOpen(false);
              setQuery('');
            }}
          />
          <div className="absolute right-0 top-full mt-2 z-50 w-72 bg-white dark:bg-gray-900 rounded-lg shadow-md ring-1 ring-gray-900/10 dark:ring-gray-50/10 p-3">
            <input
              type="text"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="종목명 또는 심볼"
              aria-label="종목 검색"
              className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:border-indigo-400 dark:focus:border-indigo-500 mb-2 bg-transparent dark:text-gray-50 dark:placeholder:text-gray-500"
            />
            <ul
              role="listbox"
              aria-label="종목 검색 결과"
              className="max-h-72 overflow-y-auto"
            >
              {filteredTickers.map((t) => {
                const isSelected = value === t.symbol;
                return (
                  <li
                    key={t.symbol}
                    role="option"
                    aria-selected={isSelected}
                    tabIndex={0}
                    onClick={() => handleSelect(t.symbol)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleSelect(t.symbol);
                      }
                    }}
                    className={`px-3 py-2 rounded cursor-pointer focus:outline-none ${
                      isSelected
                        ? 'bg-indigo-50 dark:bg-indigo-950'
                        : 'hover:bg-gray-100 dark:hover:bg-gray-800 focus:bg-gray-100 dark:focus:bg-gray-800'
                    }`}
                  >
                    <div
                      className={`text-sm font-semibold ${
                        isSelected
                          ? 'text-indigo-600 dark:text-indigo-400'
                          : 'text-gray-900 dark:text-gray-50'
                      }`}
                    >
                      {t.symbol}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                      {t.name}
                    </div>
                  </li>
                );
              })}
              {filteredTickers.length === 0 && (
                <li role="status" className="px-3 py-2 text-sm text-gray-400 dark:text-gray-500">
                  검색 결과가 없습니다
                </li>
              )}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
