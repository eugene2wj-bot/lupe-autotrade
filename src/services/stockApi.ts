// -------------------------------------------------------
// 다중 주가 연동 체계 (Multi-Provider Stock Price Engine)
// -------------------------------------------------------

import { getStaticQuotes, getQuotesForCycle } from '@/store/cycleStore';
import type { Cycle, StockQuote } from '@/types/cycle';

export interface StockQuoteDetail {
  ticker: string;
  latestPrice: number;
  change: number;
  changePercent: number;
  date: string;
  quotes: StockQuote[];
  provider: 'yahoo-primary' | 'yahoo-secondary' | 'finnhub' | 'local-logs';
}

// ── 인메모리 캐시 (60초 TTL) ──────────────────────────────
interface CacheEntry {
  data: StockQuoteDetail;
  timestamp: number;
}
const quoteCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 1000;

/**
 * 1차 프로바이더: Yahoo Finance Primary (Query1)
 */
async function fetchFromYahooQuery1(ticker: string): Promise<StockQuoteDetail | null> {
  const res = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1mo`,
    { cache: 'no-store' }
  );
  if (!res.ok) return null;
  const data = await res.json();
  const result = data?.chart?.result?.[0];
  if (!result || !result.meta?.regularMarketPrice) return null;

  const meta = result.meta;
  const latestPrice = meta.regularMarketPrice;
  const prevClose = meta.chartPreviousClose ?? latestPrice;
  const change = latestPrice - prevClose;
  const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;

  const timestamps: number[] = result.timestamp ?? [];
  const closes: number[] = result.indicators?.quote?.[0]?.close ?? [];
  const fetchedQuotes: StockQuote[] = [];

  timestamps.forEach((ts, idx) => {
    if (closes[idx] !== null && closes[idx] !== undefined) {
      const dateStr = new Date(ts * 1000).toISOString().slice(0, 10);
      fetchedQuotes.push({ date: dateStr, close: Math.round(closes[idx] * 100) / 100 });
    }
  });

  return {
    ticker,
    latestPrice,
    change,
    changePercent,
    date: new Date().toISOString().slice(0, 10),
    quotes: fetchedQuotes,
    provider: 'yahoo-primary',
  };
}

/**
 * 2차 프로바이더: Yahoo Finance Secondary (Query2 Mirror)
 */
async function fetchFromYahooQuery2(ticker: string): Promise<StockQuoteDetail | null> {
  const res = await fetch(
    `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1mo`,
    { cache: 'no-store' }
  );
  if (!res.ok) return null;
  const data = await res.json();
  const result = data?.chart?.result?.[0];
  if (!result || !result.meta?.regularMarketPrice) return null;

  const meta = result.meta;
  const latestPrice = meta.regularMarketPrice;
  const prevClose = meta.chartPreviousClose ?? latestPrice;
  const change = latestPrice - prevClose;
  const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;

  const timestamps: number[] = result.timestamp ?? [];
  const closes: number[] = result.indicators?.quote?.[0]?.close ?? [];
  const fetchedQuotes: StockQuote[] = [];

  timestamps.forEach((ts, idx) => {
    if (closes[idx] !== null && closes[idx] !== undefined) {
      const dateStr = new Date(ts * 1000).toISOString().slice(0, 10);
      fetchedQuotes.push({ date: dateStr, close: Math.round(closes[idx] * 100) / 100 });
    }
  });

  return {
    ticker,
    latestPrice,
    change,
    changePercent,
    date: new Date().toISOString().slice(0, 10),
    quotes: fetchedQuotes,
    provider: 'yahoo-secondary',
  };
}

/**
 * 3차 프로바이더: Finnhub API (환경변수 키 설정 시 연동)
 */
async function fetchFromFinnhub(ticker: string): Promise<StockQuoteDetail | null> {
  const apiKey = process.env.NEXT_PUBLIC_FINNHUB_API_KEY;
  if (!apiKey) return null;

  const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(ticker)}&token=${apiKey}`, {
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data || typeof data.c !== 'number' || data.c === 0) return null;

  const latestPrice = data.c;
  const prevClose = data.pc ?? latestPrice;
  const change = data.d ?? (latestPrice - prevClose);
  const changePercent = data.dp ?? (prevClose > 0 ? (change / prevClose) * 100 : 0);

  return {
    ticker,
    latestPrice,
    change,
    changePercent,
    date: new Date().toISOString().slice(0, 10),
    quotes: [{ date: new Date().toISOString().slice(0, 10), close: latestPrice }],
    provider: 'finnhub',
  };
}

/**
 * 4차 프로바이더: 로컬 정적 데이터 & 사이클 매매 기록 추정 엔진
 */
function fetchFromLocal(ticker: string, cycle?: Cycle): StockQuoteDetail {
  const localQuotes = cycle ? getQuotesForCycle(cycle) : getStaticQuotes(ticker);
  const fallbackLatest = localQuotes.length > 0
    ? localQuotes[localQuotes.length - 1].close
    : 0;
  const fallbackPrev = localQuotes.length > 1
    ? localQuotes[localQuotes.length - 2].close
    : fallbackLatest;
  const fallbackDate = localQuotes.length > 0
    ? localQuotes[localQuotes.length - 1].date
    : new Date().toISOString().slice(0, 10);

  const change = fallbackLatest - fallbackPrev;
  const changePercent = fallbackPrev > 0 ? (change / fallbackPrev) * 100 : 0;

  return {
    ticker,
    latestPrice: fallbackLatest,
    change,
    changePercent,
    date: fallbackDate,
    quotes: localQuotes,
    provider: 'local-logs',
  };
}

/**
 * 메인 범용 주가 조회 함수 (다중 프로바이더 체인 & 캐싱)
 */
export async function fetchStockQuote(ticker: string, cycle?: Cycle): Promise<StockQuoteDetail> {
  const now = Date.now();
  const cached = quoteCache.get(ticker);
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  // 1. Yahoo Primary Query
  try {
    const q1 = await fetchFromYahooQuery1(ticker);
    if (q1) {
      quoteCache.set(ticker, { data: q1, timestamp: now });
      return q1;
    }
  } catch (err) {
    console.warn(`[StockAPI] Provider 1 (Yahoo Query1) failed for ${ticker}:`, err);
  }

  // 2. Yahoo Secondary Query (Mirror)
  try {
    const q2 = await fetchFromYahooQuery2(ticker);
    if (q2) {
      quoteCache.set(ticker, { data: q2, timestamp: now });
      return q2;
    }
  } catch (err) {
    console.warn(`[StockAPI] Provider 2 (Yahoo Query2) failed for ${ticker}:`, err);
  }

  // 3. Finnhub (NEXT_PUBLIC_FINNHUB_API_KEY 설정 시)
  try {
    const finnhub = await fetchFromFinnhub(ticker);
    if (finnhub) {
      quoteCache.set(ticker, { data: finnhub, timestamp: now });
      return finnhub;
    }
  } catch (err) {
    console.warn(`[StockAPI] Provider 3 (Finnhub) failed for ${ticker}:`, err);
  }

  // 4. Local / Trade Log Fallback
  const local = fetchFromLocal(ticker, cycle);
  return local;
}
