// -------------------------------------------------------
// 범용 정적/추정 주가 유틸리티 (Server & Client 공용)
// -------------------------------------------------------

import type { Cycle, StockQuote } from '@/types/cycle';
import soxlQuotesRaw from '@/data/soxl_quotes.json';

const soxlPrices = (
  soxlQuotesRaw as { prices: { date: string; open: number; close: number; high: number; low: number }[] }
).prices;
const soxlQuotes: StockQuote[] = soxlPrices.map((p) => ({ date: p.date, close: p.close }));

const staticQuotes: Record<string, StockQuote[]> = {
  SOXL: soxlQuotes,
};

export function getStaticQuotes(ticker: string): StockQuote[] {
  return staticQuotes[ticker] ?? [];
}

/**
 * 사이클의 주가 데이터(히스토리) 추출 함수 (범용)
 * 1. staticQuotes에 티커가 존재하면 해당 정적 데이터 반환
 * 2. 없는 경우 cycle.logs 거래 내역의 일자별 가격(센트->달러)을 시계열로 자동 추출하여 반환
 */
export function getQuotesForCycle(cycle: Cycle): StockQuote[] {
  if (!cycle) return [];
  const staticList = getStaticQuotes(cycle.ticker);
  if (staticList && staticList.length > 0) {
    return staticList;
  }
  if (!cycle.logs || cycle.logs.length === 0) {
    return [];
  }
  const dateMap = new Map<string, number>();
  const sorted = [...cycle.logs].sort((a, b) => a.date.localeCompare(b.date));
  for (const log of sorted) {
    if (log.price > 0) {
      dateMap.set(log.date, Math.round((log.price / 100) * 100) / 100);
    }
  }
  const derivedQuotes: StockQuote[] = [];
  for (const [date, close] of dateMap.entries()) {
    derivedQuotes.push({ date, close });
  }
  return derivedQuotes;
}
