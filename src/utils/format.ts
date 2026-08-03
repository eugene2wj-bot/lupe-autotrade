// -------------------------------------------------------
// 포맷 유틸
// 원본: 531718 모듈 기반 (ae2a204e5d45755a.js)
// -------------------------------------------------------

/**
 * 원화 단위(정수) → 달러 단위(소수)
 * 예: 21755 → 217.55
 */
export function toDollars(cents: number): number {
  return cents / 100;
}

/**
 * 달러 단위(소수) → 원화 단위(정수)
 * 예: 217.55 → 21755
 */
export function toCents(dollars: number): number {
  return Math.round(dollars * 100);
}

/**
 * 원화 단위 → 달러 문자열 (소수점 2자리)
 * 예: 21755 → "217.55"
 */
export function formatDollars(cents: number, decimalPlaces = 2): string {
  return toDollars(cents).toFixed(decimalPlaces);
}

/**
 * 날짜 문자열 YYYY-MM-DD → MM/DD 형식
 */
export function formatDateShort(date: string): string {
  return date.slice(5).replace('-', '/');
}

/**
 * YYYY-MM-DD 형식으로 Date 객체를 변환
 */
export function toLocalDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 숫자를 천단위 콤마 포맷으로 표시
 */
export function formatNumber(value: number, decimals = 0): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * 손익 부호 포함 달러 문자열
 * 양수: "+$1.23", 음수: "-$1.23"
 */
export function formatProfitDollars(cents: number): string {
  const abs = Math.abs(toDollars(cents));
  const sign = cents >= 0 ? '+' : '-';
  return `${sign}$${abs.toFixed(2)}`;
}
