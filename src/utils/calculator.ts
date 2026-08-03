// -------------------------------------------------------
// 루프 무한매수법 계산 엔진 (V2.2 / V3.0 / V4.0)
// 원본 알고리즘 역분석 기반 다중 버전 수식 엔진
// -------------------------------------------------------

import type {
  Cycle,
  CycleStats,
  Order,
  Phase,
  StockQuote,
  TradeLog,
  Version,
} from '@/types/cycle';

// ================================================================
// 1. 공통 수학 유틸 함수
// ================================================================

/**
 * 가중평균 단가(Moving Average Price) 계산
 * 매수: 누적 비용 / 누적 수량
 * 매도: 평단 차감 후 수량 감소
 */
export function calcMovingAvgPrice(logs: TradeLog[]): number {
  const sorted = [...logs].sort((a, b) => a.date.localeCompare(b.date));
  let cost = 0;
  let qty = 0;
  let avg = 0;

  for (const log of sorted) {
    if (log.type === 'buy') {
      cost += log.price * log.qty;
      qty += log.qty;
      avg = cost / qty;
    } else {
      cost -= avg * log.qty;
      qty -= log.qty;
      if (qty <= 0) {
        qty = 0;
        cost = 0;
        avg = 0;
      }
    }
  }
  return avg;
}

/**
 * T(회차) 계산 — 공통 기반
 */
function calcTFromAvg(avgPrice: number, holdingQty: number, unitAmount: number): number {
  if (unitAmount === 0) return 0;
  return Math.round((avgPrice * holdingQty) / unitAmount * 100) / 100;
}

/**
 * ☆ 퍼센트 계산 = maxPercent × (1 − 2T/N)
 */
export function calcStarPercent(maxPercent: number, splitCount: number, currentT: number): number {
  return maxPercent * (1 - (2 * currentT) / splitCount);
}

/**
 * ☆ 기준가 계산 = avgPrice × (1 + starPercent/100)
 */
export function calcStarPrice(avgPrice: number, starPercent: number): number {
  return avgPrice * (1 + starPercent / 100);
}

// ================================================================
// 2. 버전별 전략 객체
// ================================================================

interface VersionStrategy {
  calcPerBuyAmount(
    principal: number,
    splitCount: number,
    maxRealizedProfit: number,
    compoundMode: string | null
  ): number;
  calcT(logs: TradeLog[], cycle: Cycle): number;
  generateQuarterOrders(orders: Order[], stats: CycleStats, cycle: Cycle): void;
}

// V2.2 전략
const V22Strategy: VersionStrategy = {
  calcPerBuyAmount(principal, splitCount) {
    return principal / splitCount;
  },

  calcT(logs, cycle) {
    const avgPrice = calcMovingAvgPrice(logs);
    const buyQty = logs.filter((l) => l.type === 'buy').reduce((s, l) => s + l.qty, 0);
    const sellQty = logs.filter((l) => l.type === 'sell').reduce((s, l) => s + l.qty, 0);
    const holdingQty = buyQty - sellQty;
    const unitAmount = cycle.principal / cycle.splitCount;
    return calcTFromAvg(avgPrice, holdingQty, unitAmount);
  },

  generateQuarterOrders(orders, stats, cycle) {
    const { holdingQty, avgPrice, phase } = stats;
    const { maxPercent } = cycle;

    if (holdingQty <= 0) return;

    if (phase === 'quarter-sell') {
      const qty = Math.floor(holdingQty / 4);
      if (qty > 0) {
        orders.push({
          type: 'sell',
          orderType: 'moc',
          label: 'MOC 매도 1/4 (쿼터 진입)',
          price: 0,
          qty,
        });
      }
    } else {
      const unitAmount = cycle.principal / cycle.splitCount;
      const remainingCash = stats.remainingCash;
      const extraPool = Math.min(Math.max(remainingCash / 10, 0), unitAmount);
      const starBuyPrice = Math.round(avgPrice * (1 - maxPercent / 100)) - 1;

      if (extraPool > 0 && starBuyPrice > 0) {
        const qty = Math.max(1, Math.floor(extraPool / starBuyPrice));
        orders.push({
          type: 'buy',
          orderType: 'star',
          label: `-${maxPercent}% LOC 매수 (쿼터)`,
          price: Math.round(starBuyPrice),
          qty,
        });
      }

      const quarterSellPrice = Math.round(avgPrice * (1 - maxPercent / 100));
      const quarterSellQty = Math.floor(holdingQty / 4);
      if (quarterSellQty > 0) {
        orders.push({
          type: 'sell',
          orderType: 'quarter',
          label: `-${maxPercent}% LOC 매도 (쿼터 탈출)`,
          price: quarterSellPrice,
          qty: quarterSellQty,
        });
      }

      const limitPrice = Math.round(avgPrice * (1 + maxPercent / 100));
      const limitQty = holdingQty - quarterSellQty;
      if (limitQty > 0) {
        orders.push({
          type: 'sell',
          orderType: 'limit',
          label: `${maxPercent}% 지정가 매도`,
          price: limitPrice,
          qty: limitQty,
        });
      }
    }
  },
};

// V3.0 전략
const V30Strategy: VersionStrategy = {
  calcPerBuyAmount(principal, splitCount, maxRealizedProfit, compoundMode) {
    const base = principal / splitCount;
    if (maxRealizedProfit <= 0) return base;
    return base + maxRealizedProfit / (compoundMode === 'full' ? splitCount : 2 * splitCount);
  },

  calcT(logs, cycle) {
    const avgPrice = calcMovingAvgPrice(logs);
    const buyQty = logs.filter((l) => l.type === 'buy').reduce((s, l) => s + l.qty, 0);
    const sellQty = logs.filter((l) => l.type === 'sell').reduce((s, l) => s + l.qty, 0);
    const holdingQty = buyQty - sellQty;
    const unitAmount = cycle.principal / cycle.splitCount;
    return calcTFromAvg(avgPrice, holdingQty, unitAmount);
  },

  generateQuarterOrders(orders, stats, cycle) {
    const { holdingQty, avgPrice, starPercent, currentT, perBuyAmount, phase } = stats;
    const { maxPercent, splitCount } = cycle;

    if (holdingQty <= 0) return;

    if (phase === 'quarter-sell') {
      const mocQty = Math.floor(holdingQty / 4);
      if (mocQty > 0) {
        orders.push({
          type: 'sell',
          orderType: 'moc',
          label: 'MOC 매도 1/4 (V3 쿼터)',
          price: 0,
          qty: mocQty,
        });
      }

      const limitPrice = Math.round(avgPrice * (1 + maxPercent / 100));
      const limitQty = holdingQty - mocQty;
      if (limitQty > 0) {
        orders.push({
          type: 'sell',
          orderType: 'limit',
          label: `${maxPercent}% 지정가 매도`,
          price: limitPrice,
          qty: limitQty,
        });
      }
    } else {
      const remainingRounds = Math.max(0, Math.floor(splitCount + 5 - currentT));
      const starPriceVal = avgPrice > 0 ? calcStarPrice(avgPrice, starPercent) : 0;
      const quarterSellQty = Math.floor(holdingQty / 4);

      if (quarterSellQty > 0 && starPriceVal > 0) {
        orders.push({
          type: 'sell',
          orderType: 'quarter',
          label: `☆${starPercent.toFixed(1)}% LOC 매도 (탈출)`,
          price: Math.round(starPriceVal),
          qty: quarterSellQty,
        });
      }

      const limitPrice = Math.round(avgPrice * (1 + maxPercent / 100));
      const limitQty = holdingQty - quarterSellQty;
      if (limitQty > 0) {
        orders.push({
          type: 'sell',
          orderType: 'limit',
          label: `${maxPercent}% 지정가 매도`,
          price: limitPrice,
          qty: limitQty,
        });
      }

      if (remainingRounds > 0 && starPriceVal > 0) {
        const buyPrice = Math.round(starPriceVal - 1);
        const qty = Math.max(1, Math.floor(perBuyAmount / buyPrice));
        orders.push({
          type: 'buy',
          orderType: 'star',
          label: `☆${starPercent.toFixed(1)}% LOC 매수 (쿼터 추가)`,
          price: buyPrice,
          qty,
        });
      }
    }
  },
};

// V4.0 전략 (날짜별 배치 순회)
const V40Strategy: VersionStrategy = {
  calcPerBuyAmount(principal, splitCount) {
    return principal / splitCount;
  },

  calcT(logs, cycle) {
    const { splitCount } = cycle;
    const sorted = [...logs].sort((a, b) => a.date.localeCompare(b.date));

    const byDate = new Map<string, TradeLog[]>();
    for (const log of sorted) {
      const existing = byDate.get(log.date);
      if (existing) existing.push(log);
      else byDate.set(log.date, [log]);
    }

    let T = 0;
    const halfN = splitCount / 2;

    for (const [, dayLogs] of byDate) {
      for (const log of dayLogs) {
        if (log.type === 'sell') {
          if (log.orderType === 'quarter') T *= 0.75;
          else if (log.orderType === 'moc' || log.orderType === 'reverse') T *= 1 - 1 / halfN;
          else if (log.orderType === 'limit') T *= 0.25;
        }
      }

      const buyLogs = dayLogs.filter((l) => l.type === 'buy');
      if (buyLogs.length === 0) continue;

      if (buyLogs.some((l) => l.orderType === 'reverse')) {
        T += (splitCount - T) * 0.25;
        continue;
      }

      const initLog = buyLogs.find((l) => l.orderType === 'init');
      const starLogs = buyLogs.filter((l) => l.orderType === 'star');
      const avgLogs = buyLogs.filter((l) => l.orderType === 'avg');

      if (T === 0 && initLog) {
        const unitAmount = cycle.principal / cycle.splitCount;
        T += initLog.price * initLog.qty < unitAmount / 2 ? 0.5 : 1;
      }

      const starQueue = [...starLogs];
      const avgQueue = [...avgLogs];

      while (starQueue.length > 0 || avgQueue.length > 0) {
        if (T < halfN) {
          if (starQueue.length > 0 && avgQueue.length > 0) {
            starQueue.shift();
            avgQueue.shift();
            T += 1;
          } else {
            (starQueue.length > 0 ? starQueue : avgQueue).shift();
            T += 0.5;
          }
        } else if (starQueue.length > 0) {
          starQueue.shift();
          T += 1;
        } else {
          break;
        }
      }
    }

    return T;
  },

  generateQuarterOrders(orders, stats, cycle) {
    const { holdingQty, avgPrice, starPrice, phase, remainingCash } = stats;
    const { splitCount, maxPercent } = cycle;

    if (holdingQty <= 0) return;

    const halfN = splitCount / 2;

    if (phase === 'reverse-sell') {
      const qty = Math.floor(holdingQty / halfN);
      if (qty > 0) {
        orders.push({
          type: 'sell',
          orderType: 'moc',
          label: 'MOC 매도 (리버스 진입)',
          price: 0,
          qty,
        });
      }
    } else if (phase === 'reverse-buy') {
      const reverseSellQty = Math.floor(holdingQty / halfN);
      if (reverseSellQty > 0 && starPrice > 0) {
        orders.push({
          type: 'sell',
          orderType: 'reverse',
          label: '리버스 LOC 매도',
          price: Math.round(starPrice),
          qty: reverseSellQty,
        });
      }

      if (remainingCash > 0 && starPrice > 0) {
        const pool = remainingCash / 4;
        const buyPrice = Math.round(starPrice - 1);
        const qty = Math.max(1, Math.floor(pool / buyPrice));
        orders.push({
          type: 'buy',
          orderType: 'reverse',
          label: '리버스 쿼터매수',
          price: buyPrice,
          qty,
        });
      }

      const limitPrice = Math.round(avgPrice * (1 + maxPercent / 100));
      const limitQty = holdingQty - reverseSellQty;
      if (limitQty > 0) {
        orders.push({
          type: 'sell',
          orderType: 'limit',
          label: `${maxPercent}% 지정가 매도`,
          price: limitPrice,
          qty: limitQty,
        });
      }
    }
  },
};

const strategies: Record<Version, VersionStrategy> = {
  'V2.2': V22Strategy,
  'V3.0': V30Strategy,
  'V4.0': V40Strategy,
};

export function getStrategy(version: Version): VersionStrategy {
  const s = strategies[version];
  if (!s) throw new Error(`Unknown version: ${version}`);
  return s;
}

function detectLegacyQuarterPhase(logs: TradeLog[], version: Version): Phase {
  for (let i = logs.length - 1; i >= 0; i--) {
    const log = logs[i];
    if (log.type === 'sell' && log.price === 0) {
      const buyCountAfter = logs.slice(i + 1).filter((l) => l.type === 'buy').length;
      if (version === 'V2.2') {
        return buyCountAfter >= 10 ? 'quarter-sell' : 'quarter-buy';
      }
      return 'quarter-buy';
    }
  }
  return 'quarter-sell';
}

function detectReversePhase(logs: TradeLog[]): Phase {
  let lastReverseSellDate: string | null = null;
  for (let i = logs.length - 1; i >= 0; i--) {
    const log = logs[i];
    if (log.type === 'sell' && (log.orderType === 'moc' || log.orderType === 'reverse')) {
      lastReverseSellDate = log.date;
      break;
    }
  }

  if (!lastReverseSellDate) return 'reverse-sell';

  const hasActivityAfter = logs.some(
    (l) => l.date > lastReverseSellDate! && !(l.type === 'buy' && l.orderType === 'reverse')
  );

  return hasActivityAfter ? 'reverse-sell' : 'reverse-buy';
}

export function hasReverseSell(logs: TradeLog[]): boolean {
  return logs.some((l) => l.type === 'sell' && (l.orderType === 'moc' || l.orderType === 'reverse'));
}

export function isReversePhase(phase: Phase): boolean {
  return phase === 'reverse-sell' || phase === 'reverse-buy';
}

function calcRealizedProfit(logs: TradeLog[]): { realized: number; maxRealized: number } {
  let realized = 0;
  let maxRealized = 0;
  for (const log of logs) {
    if (log.type === 'sell' && log.profit !== null && log.profit !== undefined) {
      realized += log.profit;
      if (realized > maxRealized) maxRealized = realized;
    }
  }
  return { realized, maxRealized };
}

export function calcCycleStats(cycle: Cycle, quotes?: StockQuote[]): CycleStats {
  const { logs, principal, splitCount, maxPercent, version, compoundMode } = cycle;

  const totalBuyAmount = logs
    .filter((l) => l.type === 'buy')
    .reduce((s, l) => s + l.price * l.qty, 0);
  const totalBuyQty = logs.filter((l) => l.type === 'buy').reduce((s, l) => s + l.qty, 0);
  const totalSellQty = logs.filter((l) => l.type === 'sell').reduce((s, l) => s + l.qty, 0);
  const holdingQty = totalBuyQty - totalSellQty;

  const avgPrice = calcMovingAvgPrice(logs);
  const holdingCost = avgPrice * holdingQty;

  const { realized: realizedProfit, maxRealized: maxRealizedProfit } = calcRealizedProfit(logs);

  const totalSellAmount = logs
    .filter((l) => l.type === 'sell')
    .reduce((s, l) => s + l.price * l.qty, 0);
  const remainingCash = principal - totalBuyAmount + totalSellAmount;

  const strategy = getStrategy(version);

  let perBuyAmount = strategy.calcPerBuyAmount(
    principal,
    splitCount,
    maxRealizedProfit,
    compoundMode
  );

  const currentT = strategy.calcT(logs, cycle);

  if (version === 'V4.0' && currentT < splitCount) {
    perBuyAmount = remainingCash / (splitCount - currentT);
  }

  const starPercent = calcStarPercent(maxPercent, splitCount, currentT);
  let starPrice = avgPrice > 0 ? calcStarPrice(avgPrice, starPercent) : 0;

  let phase: Phase = 'first-half';

  if (version === 'V4.0') {
    const reverseExists = hasReverseSell(logs);
    if (currentT > splitCount - 1) {
      phase = detectReversePhase(logs);
    } else if (reverseExists) {
      const lastClose = quotes?.length ? quotes[quotes.length - 1].close : 0;
      const threshold = avgPrice * (1 - maxPercent / 100);
      if (quotes?.length && lastClose > threshold) {
        phase = currentT >= splitCount / 2 ? 'second-half' : 'first-half';
      } else {
        phase = detectReversePhase(logs);
      }
    } else {
      phase = currentT >= splitCount / 2 ? 'second-half' : 'first-half';
    }
  } else {
    if (currentT > splitCount - 1) {
      phase = detectLegacyQuarterPhase(logs, version);
    } else if (currentT >= splitCount / 2) {
      phase = 'second-half';
    }
  }

  if (isReversePhase(phase) && quotes && quotes.length > 0) {
    const last5 = quotes.slice(-5);
    starPrice = Math.round(last5.reduce((s, q) => s + q.close, 0) / last5.length);
  }

  return {
    totalBuyAmount,
    totalBuyQty,
    totalSellQty,
    holdingQty,
    avgPrice,
    currentT,
    perBuyAmount,
    starPercent,
    starPrice,
    phase,
    holdingCost,
    realizedProfit,
    maxRealizedProfit,
    remainingCash,
  };
}

export function generateGuide(
  cycle: Cycle,
  quotes?: StockQuote[],
  maxPercentDown = 30
): { stats: CycleStats; orders: Order[] } {
  const stats = calcCycleStats(cycle, quotes);
  const orders: Order[] = [];

  const { avgPrice, starPercent, starPrice, perBuyAmount, holdingQty, phase } = stats;
  const { version, maxPercent } = cycle;

  if (
    avgPrice <= 0 ||
    holdingQty < 0 ||
    (phase === 'reverse-buy' && (!quotes || quotes.length === 0))
  ) {
    return { stats, orders };
  }

  if (phase === 'quarter-sell' || phase === 'quarter-buy' || isReversePhase(phase)) {
    getStrategy(version).generateQuarterOrders(orders, stats, cycle);
    return { stats, orders };
  }

  const starBuyPrice = starPrice - 1;

  if (phase === 'first-half') {
    const starQty = Math.max(1, Math.floor(perBuyAmount / 2 / starBuyPrice));
    orders.push({
      type: 'buy',
      orderType: 'star',
      label: `☆${starPercent.toFixed(1)}% LOC 매수`,
      price: Math.round(starBuyPrice),
      qty: starQty,
    });

    const avgQty = Math.max(1, Math.floor(perBuyAmount / avgPrice) - starQty);
    orders.push({
      type: 'buy',
      orderType: 'avg',
      label: '평단 LOC 매수',
      price: Math.round(avgPrice),
      qty: avgQty,
    });
  } else {
    const starQty = Math.max(1, Math.floor(perBuyAmount / starBuyPrice));
    orders.push({
      type: 'buy',
      orderType: 'star',
      label: `☆${starPercent.toFixed(1)}% LOC 매수`,
      price: Math.round(starBuyPrice),
      qty: starQty,
    });
  }

  const buyOrders = orders.filter((o) => o.type === 'buy');
  const totalBuyQty = buyOrders.reduce((s, o) => s + o.qty, 0);
  const minBuyPrice = Math.min(...buyOrders.map((o) => o.price));
  const loopFloor = Math.round(minBuyPrice * (1 - maxPercentDown / 100));

  if (perBuyAmount > 0 && minBuyPrice > 0) {
    let prev = Infinity;
    let extraCount = 0;
    const maxExtraCount = 3; // 추가 매수 주문 최대 3건으로 축소 (총 매수 주문 3~4건)

    for (let i = 1; ; i++) {
      if (extraCount >= maxExtraCount) break;
      const price = Math.round(perBuyAmount / (totalBuyQty + i));
      if (price < loopFloor || price >= prev) break;
      prev = price;
      if (price >= minBuyPrice) continue;
      orders.push({
        type: 'buy',
        orderType: 'extra',
        label: '추가 LOC 매수',
        price,
        qty: 1,
      });
      extraCount++;
    }
  }

  if (holdingQty > 0) {
    const quarterSellQty = Math.floor(holdingQty / 4);
    if (quarterSellQty > 0) {
      orders.push({
        type: 'sell',
        orderType: 'quarter',
        label: `☆${starPercent.toFixed(1)}% LOC 매도`,
        price: Math.round(starPrice),
        qty: quarterSellQty,
      });
    }

    const limitPrice = Math.round(avgPrice * (1 + maxPercent / 100));
    const limitQty = holdingQty - quarterSellQty;
    if (limitQty > 0) {
      orders.push({
        type: 'sell',
        orderType: 'limit',
        label: `${maxPercent}% 지정가 매도`,
        price: limitPrice,
        qty: limitQty,
      });
    }
  }

  return { stats, orders };
}

export function getPhaseLabel(phase: Phase): string {
  switch (phase) {
    case 'first-half': return '전반전';
    case 'second-half': return '후반전';
    case 'reverse-sell':
    case 'reverse-buy': return '리버스';
    default: return '쿼터모드';
  }
}

export function getPhaseColor(phase: Phase): string {
  switch (phase) {
    case 'first-half': return 'text-green-600 dark:text-green-400';
    case 'second-half': return 'text-orange-600 dark:text-orange-400';
    case 'reverse-sell':
    case 'reverse-buy': return 'text-purple-600 dark:text-purple-400';
    default: return 'text-red-600 dark:text-red-400';
  }
}

export function getProgressBarStyle(percent: number, phase: Phase) {
  const p = Math.min(percent, 100);
  const end = Math.min(p + 15, 100);

  switch (phase) {
    case 'reverse-sell':
    case 'reverse-buy':
      return {
        light: `linear-gradient(to right, #c084fc 0%, #a855f7 ${p}%, #f3e8ff ${end}%, #faf5ff 100%)`,
        dark: `linear-gradient(to right, #9333ea 0%, #7e22ce ${p}%, rgba(147,51,234,0.25) ${end}%, rgba(147,51,234,0.12) 100%)`,
        marker: 'bg-purple-500 dark:bg-purple-400',
      };
    case 'quarter-sell':
    case 'quarter-buy':
      return {
        light: `linear-gradient(to right, #fda4af 0%, #fb7185 ${p}%, #ffe4e6 ${end}%, #fff1f2 100%)`,
        dark: `linear-gradient(to right, #be123c 0%, #e11d48 ${p}%, rgba(225,29,72,0.25) ${end}%, rgba(225,29,72,0.12) 100%)`,
        marker: 'bg-rose-500 dark:bg-rose-400',
      };
    case 'second-half':
      return {
        light: `linear-gradient(to right, #fdba74 0%, #f97316 ${p}%, #ffedd5 ${end}%, #fff7ed 100%)`,
        dark: `linear-gradient(to right, #ea580c 0%, #c2410c ${p}%, rgba(234,88,12,0.25) ${end}%, rgba(234,88,12,0.12) 100%)`,
        marker: 'bg-orange-500 dark:bg-orange-400',
      };
    default:
      return {
        light: `linear-gradient(to right, #818cf8 0%, #6366f1 ${p}%, #e0e7ff ${end}%, #eef2ff 100%)`,
        dark: `linear-gradient(to right, #6366f1 0%, #4f46e5 ${p}%, rgba(99,102,241,0.25) ${end}%, rgba(99,102,241,0.12) 100%)`,
        marker: 'bg-indigo-500 dark:bg-indigo-400',
      };
  }
}
