'use client';

import React, { useRef, useState, useCallback, useEffect } from 'react';

interface NumberInputProps {
  value: number | undefined;
  onValueChange: (value: number | undefined) => void;
  decimal?: number;
  max?: number;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  autoFocus?: boolean;
  'aria-label'?: string;
}

/**
 * 커스텀 숫자 입력 컴포넌트
 * 원본: ae2a204e5d45755a.js Line 11821~11908 (module 974783)
 * - 포맷된 표시 (커서 숨김, 커스텀 caret)
 * - 숫자/소수점만 허용
 */
export function NumberInput({
  value,
  onValueChange,
  decimal = 0,
  max,
  placeholder,
  disabled = false,
  className = '',
  autoFocus,
  'aria-label': ariaLabel,
}: NumberInputProps) {
  const [status, setStatus] = useState<{ status: 'idle' } | { status: 'editing'; raw: string }>({
    status: 'idle',
  });
  const inputRef = useRef<HTMLInputElement>(null);

  const isEditing = status.status === 'editing';
  const rawVal = isEditing ? (status as { status: 'editing'; raw: string }).raw : undefined;

  const displayRaw =
    rawVal !== undefined
      ? rawVal
      : value !== undefined
      ? decimal > 0
        ? value.toFixed(decimal)
        : String(value)
      : '';

  const moveCursorToEnd = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      const len = el.value.length;
      el.setSelectionRange(len, len);
    });
  }, []);

  useEffect(() => {
    if (isEditing) moveCursorToEnd();
  }, [isEditing, moveCursorToEnd]);

  // 천단위 콤마 포맷
  const formatted = (() => {
    if (!displayRaw) return '';
    const [int, dec] = displayRaw.split('.');
    const intFormatted = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return dec !== undefined ? `${intFormatted}.${dec}` : intFormatted;
  })();

  const showPlaceholder = !isEditing && !displayRaw && placeholder;

  return (
    <span
      className={`relative inline-flex items-center cursor-text [text-decoration:inherit] ${
        disabled ? 'pointer-events-none opacity-45' : ''
      } ${className}`}
      onClick={() => inputRef.current?.focus()}
    >
      <input
        ref={inputRef}
        type="text"
        inputMode={decimal > 0 ? 'decimal' : 'numeric'}
        value={displayRaw}
        autoFocus={autoFocus}
        disabled={disabled}
        aria-label={ariaLabel}
        autoComplete="off"
        onChange={(e) => {
          let raw = e.target.value.replace(/[^0-9.]/g, '');
          // 소수점 하나만 허용
          const dotIdx = raw.indexOf('.');
          if (dotIdx !== -1) {
            raw = raw.slice(0, dotIdx + 1) + raw.slice(dotIdx + 1).replace(/\./g, '');
          }
          // 정수 모드에서는 소수점 제거
          if (decimal === 0) raw = raw.replace(/\./g, '');
          // 소수점 이하 자리수 제한
          if (decimal > 0 && dotIdx !== -1) {
            const [intPart, decPart] = raw.split('.');
            raw = intPart + '.' + (decPart ?? '').slice(0, decimal);
          }
          // 선행 0 제거 (0. 제외)
          if (raw.length > 1 && raw[0] === '0' && raw[1] !== '.') {
            raw = raw.replace(/^0+/, '') || '';
            if (raw.startsWith('.')) raw = '0' + raw;
          }

          const parsed = raw === '' ? undefined : parseFloat(raw);
          const numVal = parsed === undefined || isNaN(parsed) ? undefined : parsed;

          if (numVal !== undefined && max !== undefined && numVal > max) return;

          setStatus({ status: 'editing', raw });
          onValueChange(numVal);
          moveCursorToEnd();
        }}
        onKeyDown={(e) => {
          ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key) &&
            e.preventDefault();
          if (e.key === 'Enter') inputRef.current?.blur();
        }}
        onSelect={moveCursorToEnd}
        onFocus={() => {
          setStatus({
            status: 'editing',
            raw: value !== undefined ? String(value) : '',
          });
          moveCursorToEnd();
        }}
        onBlur={() => setStatus({ status: 'idle' })}
        className="absolute inset-0 w-full h-full text-transparent caret-transparent bg-transparent border-none outline-none"
      />
      <span className="relative select-none pointer-events-none">
        {showPlaceholder ? (
          <span className="text-gray-300 dark:text-gray-600">{placeholder}</span>
        ) : (
          <span>{formatted || '\u200B'}</span>
        )}
        {isEditing && (
          <span className="absolute top-1/2 -translate-y-1/2 w-[2px] h-[1.1em] bg-indigo-500 dark:bg-indigo-400 animate-pulse" />
        )}
      </span>
    </span>
  );
}
