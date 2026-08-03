'use client';

import React from 'react';

interface ToggleGroupOption<T extends string> {
  value: T;
  label?: string;
}

interface ToggleGroupProps<T extends string> {
  options: T[] | ToggleGroupOption<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  disabledOptions?: T[];
}

/**
 * Segmented Control (Toggle Group)
 * 원본: ae2a204e5d45755a.js Line 11789~11814 (module 763979)
 */
export function ToggleGroup<T extends string>({
  options,
  value,
  onChange,
  disabled = false,
  disabledOptions = [],
}: ToggleGroupProps<T>) {
  return (
    <div
      className={`flex bg-[#e5e5ea] dark:bg-gray-800 rounded-lg p-[2px] ${disabled ? 'opacity-45' : ''}`}
    >
      {options.map((opt) => {
        const optValue = typeof opt === 'string' ? opt : opt.value;
        const optLabel = typeof opt === 'string' ? opt : (opt.label ?? opt.value);
        const isSelected = value === optValue;
        const isDisabled = disabled || disabledOptions.includes(optValue);

        return (
          <button
            key={optValue}
            type="button"
            disabled={isDisabled}
            onClick={() => {
              if (!isDisabled) onChange(optValue);
            }}
            className={[
              'flex-1 py-1.5 px-3 rounded-md text-[13px] font-medium whitespace-nowrap transition-all',
              isSelected
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-50 shadow-sm'
                : 'text-gray-400 dark:text-gray-500',
              isDisabled ? 'cursor-not-allowed' : 'cursor-pointer',
            ].join(' ')}
          >
            {optLabel}
          </button>
        );
      })}
    </div>
  );
}
