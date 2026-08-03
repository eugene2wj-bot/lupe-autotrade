// -------------------------------------------------------
// 버전별 기본값 및 증권사 수수료율 상수
// 원본: e5fc4151c71a6854.js Line 521~565
// -------------------------------------------------------

import type { Version } from '@/types/cycle';

/** 버전 × 티커별 기본 splitCount / maxPercent */
export const VERSION_TICKER_DEFAULTS: Record<Version, Record<string, { splitCount: number; maxPercent: number }>> = {
  'V2.2': {
    TQQQ: { splitCount: 20, maxPercent: 10 },
    SOXL: { splitCount: 20, maxPercent: 10 },
  },
  'V3.0': {
    TQQQ: { splitCount: 20, maxPercent: 15 },
    SOXL: { splitCount: 20, maxPercent: 20 },
  },
  'V4.0': {
    TQQQ: { splitCount: 20, maxPercent: 15 },
    SOXL: { splitCount: 20, maxPercent: 20 },
  },
};

/** 버전별 기본값 (티커 없을 때) */
export const VERSION_DEFAULTS: Record<Version, { splitCount: number; maxPercent: number }> = {
  'V2.2': { splitCount: 20, maxPercent: 10 },
  'V3.0': { splitCount: 20, maxPercent: 20 },
  'V4.0': { splitCount: 20, maxPercent: 20 },
};

/** 지원 버전 배열 */
export const VERSIONS: Version[] = ['V2.2', 'V3.0', 'V4.0'];

// -------------------------------------------------------
// 증권사 수수료율
// 원본: ae2a204e5d45755a.js Line 11914~11932
// -------------------------------------------------------
export interface BrokerCommission {
  name: string;
  rate: number;
}

export const BROKER_COMMISSIONS: BrokerCommission[] = [
  { name: '메리츠', rate: 0.07 },
  { name: '토스', rate: 0.1 },
  { name: '카카오페이', rate: 0.1 },
  { name: '키움', rate: 0.25 },
  { name: '한투', rate: 0.25 },
  { name: '삼성', rate: 0.25 },
];

/** Extra 매수 루프 최대 하락 허용 % (기본 50%) */
export const DEFAULT_MAX_PERCENT_50 = 50;
