'use client';

import React from 'react';
import { NumberInput } from './NumberInput';
import { BROKER_COMMISSIONS } from '@/constants/defaults';

interface CommissionRateInputProps {
  value: number;
  onChange: (rate: number) => void;
  autoFocus?: boolean;
}

/**
 * 수수료율 입력 컴포넌트
 * 원본: ae2a204e5d45755a.js Line 11934~11971 (module 712745)
 * - 직접 입력 (소수점 3자리)
 * - 증권사 퀵 선택 칩 버튼 6개
 */
export function CommissionRateInput({ value, onChange, autoFocus }: CommissionRateInputProps) {
  return (
    <div>
      {/* 수수료율 직접 입력 */}
      <div className="flex justify-between items-center mb-2.5">
        <span className="text-sm text-gray-900 dark:text-gray-50">수수료율 (%)</span>
        <NumberInput
          value={value}
          onValueChange={(v) => onChange(v ?? 0)}
          decimal={3}
          placeholder="0"
          autoFocus={autoFocus}
          aria-label="수수료율"
          className="w-20 justify-end text-sm font-semibold text-indigo-500 dark:text-indigo-400"
        />
      </div>

      {/* 증권사 퀵 선택 칩 */}
      <div className="flex flex-wrap gap-1.5">
        {BROKER_COMMISSIONS.map(({ name, rate }) => {
          const isSelected = value === rate;
          return (
            <button
              key={name}
              type="button"
              onClick={() => onChange(rate)}
              className={[
                'text-[11px] px-2.5 py-1.5 rounded-full transition-colors font-medium',
                isSelected
                  ? 'bg-indigo-500 dark:bg-indigo-400 text-white'
                  : 'bg-[#f2f2f7] dark:bg-gray-800 text-gray-400 dark:text-gray-500 hover:bg-indigo-50 dark:hover:bg-indigo-950 hover:text-indigo-500 dark:hover:text-indigo-400',
              ].join(' ')}
            >
              {name} {rate}
            </button>
          );
        })}
      </div>

      {/* 안내 문구 */}
      <p className="text-[10px] text-gray-300 dark:text-gray-600 mt-2">
        이벤트/등급에 따라 다를 수 있습니다
      </p>
    </div>
  );
}
