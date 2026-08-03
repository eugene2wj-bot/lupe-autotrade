'use client';

import React, { useState, useEffect } from 'react';
import type { Cycle, Order } from '@/types/cycle';
import { generateGuide, getPhaseLabel, getPhaseColor, getProgressBarStyle } from '@/utils/calculator';
import { formatDollars, toDollars } from '@/utils/format';
import { fetchStockQuote, type StockQuoteDetail } from '@/services/stockApi';
import { getQuotesForCycle } from '@/store/cycleStore';

function getOrderBadgeClass(order: Order): { bg: string; text: string } {
  if (order.type === 'sell') {
    if (order.orderType === 'moc') return { bg: 'bg-purple-100 dark:bg-purple-950', text: 'text-purple-700 dark:text-purple-300' };
    if (order.orderType === 'quarter') return { bg: 'bg-rose-100 dark:bg-rose-950', text: 'text-rose-700 dark:text-rose-300' };
    return { bg: 'bg-blue-100 dark:bg-blue-950', text: 'text-blue-700 dark:text-blue-300' };
  }
  if (order.orderType === 'star') return { bg: 'bg-indigo-100 dark:bg-indigo-950', text: 'text-indigo-700 dark:text-indigo-300' };
  if (order.orderType === 'avg') return { bg: 'bg-orange-100 dark:bg-orange-950', text: 'text-orange-700 dark:text-orange-300' };
  return { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-600 dark:text-gray-400' };
}

function OrderRow({ order }: { order: Order }) {
  const { bg, text } = getOrderBadgeClass(order);
  const isBuy = order.type === 'buy';
  const priceDisplay = order.price === 0 ? 'MOC' : `$${formatDollars(order.price)}`;
  const totalCost = order.price > 0 ? order.price * order.qty : 0;

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-gray-100 dark:border-gray-800 last:border-0">
      <div
        className={`w-1 h-7 rounded-full shrink-0 ${
          isBuy ? 'bg-indigo-500 dark:bg-indigo-400' : 'bg-rose-500 dark:bg-rose-400'
        }`}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${bg} ${text}`}>
            {isBuy ? '매수' : '매도'}
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
            {order.label}
          </span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-bold text-gray-900 dark:text-gray-50 tabular-nums">
            {priceDisplay}
          </span>
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 tabular-nums">
            × {order.qty}주
          </span>
          {totalCost > 0 && (
            <span className="text-[11px] text-gray-400 dark:text-gray-500 tabular-nums">
              ≈ ${toDollars(totalCost).toFixed(0)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-gray-100 dark:border-gray-800 last:border-0">
      <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">{label}</span>
      <span className="text-sm font-semibold text-gray-900 dark:text-gray-50 tabular-nums">
        {value}
      </span>
    </div>
  );
}

interface GuidePanelProps {
  cycle: Cycle;
}

export function GuidePanel({ cycle }: GuidePanelProps) {
  const [stockDetail, setStockDetail] = useState<StockQuoteDetail | null>(null);

  useEffect(() => {
    fetchStockQuote(cycle.ticker, cycle).then((detail) => setStockDetail(detail));
  }, [cycle]);

  const quotes = stockDetail?.quotes ?? getQuotesForCycle(cycle);
  const { stats, orders } = generateGuide(cycle, quotes);

  // 실시간 / 가장 최근 종가 (달러 단위)
  const latestPriceDollars = stockDetail?.latestPrice ?? (quotes.length > 0 ? quotes[quotes.length - 1].close : toDollars(stats.avgPrice));

  // 평가 손익 (센트 단위) = (현재 종가(달러) * 100 - 평단가(센트)) * 보유 수량
  const unrealizedProfitCents = stats.holdingQty > 0 && latestPriceDollars > 0
    ? Math.round((latestPriceDollars * 100 - stats.avgPrice) * stats.holdingQty)
    : 0;

  // 총 순익 = 실현 손익 + 평가 손익
  const totalNetProfitCents = stats.realizedProfit + unrealizedProfitCents;
  const totalNetProfitDollars = toDollars(totalNetProfitCents);

  // 누적 손익 퍼센테이지 = (총 순익 / 원금) * 100
  const returnRatePercent = cycle.principal > 0
    ? (totalNetProfitCents / cycle.principal) * 100
    : 0;

  const isNetProfitPositive = totalNetProfitDollars >= 0;
  const profitColorClass = isNetProfitPositive
    ? 'text-red-500 dark:text-red-400'
    : 'text-blue-600 dark:text-blue-400';

  // 수수료 (누적 매매 수수료 추정 - 원본 표시용)
  const totalCommissionDollars = toDollars(
    Math.round(stats.totalBuyAmount * (cycle.commissionRate / 100))
  );

  const phaseLabel = getPhaseLabel(stats.phase);
  const phaseColor = getPhaseColor(stats.phase);

  const buyOrders = orders.filter((o) => o.type === 'buy');
  const sellOrders = orders.filter((o) => o.type === 'sell');

  // 메인 프로그레스 바 스타일
  const progressPercent = cycle.splitCount > 0 ? Math.min((stats.currentT / cycle.splitCount) * 100, 100) : 0;
  const barStyle = getProgressBarStyle(progressPercent, stats.phase);

  return (
    <div className="space-y-4">
      {/* ── 1. 스크린샷 1:1 완벽 구현 대형 회차/순익/프로그레스 바 헤더 UI ── */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 shadow-xs">
        {/* 상단 텍스트 행 */}
        <div className="flex items-end justify-between gap-2">
          {/* 좌측: 회차, T21.00/40, 매수금/원금 */}
          <div className="min-w-0">
            <div className="text-[10px] text-gray-400 dark:text-gray-500 mb-0.5 flex items-center gap-1.5">
              회차
              <span className={`text-[9px] font-bold px-1.5 py-px rounded-full whitespace-nowrap bg-orange-500/10 ${phaseColor}`}>
                {phaseLabel}
              </span>
            </div>
            <p className="text-3xl font-bold tracking-tight tabular-nums leading-none text-gray-900 dark:text-gray-50 whitespace-nowrap">
              T{stats.currentT.toFixed(2)}
              <span className="text-lg font-semibold text-gray-300 dark:text-gray-600">
                {' '}/ {cycle.splitCount}
              </span>
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5 tabular-nums">
              매수금 ${toDollars(stats.totalBuyAmount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · 원금 ${toDollars(cycle.principal).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>

          {/* 우측: 순익, -$4,051.78, -10.13%, 수수료 & 최근 종가 */}
          <div className="text-right whitespace-nowrap shrink-0">
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-0.5">순익</p>
            <p className={`text-xl font-extrabold tabular-nums leading-none ${profitColorClass}`}>
              {isNetProfitPositive ? '+' : '-'}${Math.abs(totalNetProfitDollars).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className={`text-[11px] font-bold mt-1 tabular-nums ${profitColorClass}`}>
              {isNetProfitPositive ? '+' : ''}{returnRatePercent.toFixed(2)}%
            </p>
            <div className="flex items-center justify-end gap-1.5 mt-1 text-[10px] text-gray-400 dark:text-gray-500 tabular-nums">
              <span>수수료 -${totalCommissionDollars.toFixed(2)}</span>
              <span>·</span>
              <span className="font-semibold text-gray-700 dark:text-gray-300">
                최근 종가 ${latestPriceDollars.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* 하단: 58px 높이 전반전/후반전 스펙트럼 프로그레스 트랙 */}
        <div className="mt-3">
          <div className="relative" style={{ height: '58px' }}>
            <span
              className="absolute top-0 text-[9px] font-semibold whitespace-nowrap text-gray-300 dark:text-gray-600"
              style={{ left: '25%', transform: 'translateX(-50%)' }}
            >
              전반전
            </span>
            <span
              className="absolute top-0 text-[9px] font-semibold whitespace-nowrap text-indigo-400 dark:text-indigo-400"
              style={{ left: '75%', transform: 'translateX(-50%)' }}
            >
              후반전
            </span>

            {/* 라이트 모드 그라디언트 트랙 */}
            <div
              className="absolute left-0 right-0 rounded-full dark:hidden"
              style={{ top: '14px', height: '12px', background: barStyle.light }}
            />
            {/* 다크 모드 그라디언트 트랙 */}
            <div
              className="absolute left-0 right-0 rounded-full hidden dark:block"
              style={{ top: '14px', height: '12px', background: barStyle.dark }}
            />

            {/* 중앙 고정 T20 세로 핀 */}
            <div
              className="absolute w-[3px] rounded-2 bg-white dark:bg-gray-950 shadow-[0_0_0_0.5px_rgba(0,0,0,0.08)] dark:shadow-[0_0_0_0.5px_rgba(255,255,255,0.12)] z-[5]"
              style={{ left: '50%', top: '12px', height: '16px', transform: 'translateX(-50%)' }}
            />

            {/* 진행 마커 링 핀 */}
            <div
              className={`absolute w-[5px] rounded-full ${barStyle.marker} ring-[1.5px] ring-white dark:ring-gray-950 shadow-sm z-20`}
              style={{
                left: `clamp(4px, ${progressPercent}%, calc(100% - 4px))`,
                top: '10px',
                height: '20px',
                transform: 'translateX(-50%)',
              }}
            />

            {/* 하단 핀 라벨: T20 후반 진입 */}
            <div
              className="absolute flex flex-col items-center gap-0.5 z-10"
              style={{ left: '50%', top: '32px', transform: 'translateX(-50%)' }}
            >
              <div className="w-px h-[5px] bg-gray-300 dark:bg-gray-600" />
              <span className="text-[9.5px] font-semibold text-gray-400 dark:text-gray-500 whitespace-nowrap leading-none">
                후반 진입
              </span>
              <span className="text-[10.5px] font-bold text-gray-600 dark:text-gray-300 whitespace-nowrap leading-tight">
                T{Math.floor(cycle.splitCount / 2)}
              </span>
            </div>

            {/* 하단 핀 라벨: T40 완료 */}
            <div
              className="absolute right-0 flex flex-col items-end gap-0.5 z-10"
              style={{ top: '32px' }}
            >
              <div className="w-px h-[5px] bg-gray-300 dark:bg-gray-600 mr-px" />
              <span className="text-[9.5px] font-semibold text-gray-400 dark:text-gray-500 whitespace-nowrap leading-none">
                완료
              </span>
              <span className="text-[10.5px] font-bold text-gray-600 dark:text-gray-300 whitespace-nowrap leading-tight">
                T{cycle.splitCount}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── 2. 현재 포지션 카드 ── */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl px-5 py-4 shadow-xs">
        <div className="flex items-center justify-between mb-3 border-b border-gray-100 dark:border-gray-800 pb-2">
          <h2 className="text-sm font-bold text-gray-900 dark:text-gray-50">현재 포지션</h2>
          <span className={`text-xs font-bold ${phaseColor}`}>{phaseLabel}</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-1">
          <StatRow
            label="회차 (T)"
            value={`${stats.currentT.toFixed(2)} / ${cycle.splitCount}`}
          />
          <StatRow
            label="☆ %"
            value={`${stats.starPercent.toFixed(1)}%`}
          />
          <StatRow
            label="보유 수량"
            value={`${stats.holdingQty}주`}
          />
          <StatRow
            label="평균 단가"
            value={`$${formatDollars(stats.avgPrice)}`}
          />
          <StatRow
            label="☆ 기준가"
            value={stats.starPrice > 0 ? `$${formatDollars(stats.starPrice)}` : '—'}
          />
          <StatRow
            label="잔여 현금"
            value={`$${toDollars(stats.remainingCash).toFixed(2)}`}
          />
          <StatRow
            label="회당 매수금"
            value={`$${toDollars(stats.perBuyAmount).toFixed(2)}`}
          />
          <StatRow
            label="실현 손익"
            value={
              <span
                className={
                  stats.realizedProfit >= 0
                    ? 'text-red-500 dark:text-red-400'
                    : 'text-blue-500 dark:text-blue-400'
                }
              >
                {stats.realizedProfit >= 0 ? '+' : '−'}$
                {Math.abs(toDollars(stats.realizedProfit)).toFixed(2)}
              </span>
            }
          />
        </div>
      </div>

      {/* ── 3. 매수 주문 & 매도 주문 2열 병렬 배치 ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 좌측: 매수 주문 카드 */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl px-5 py-4 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-800 mb-2">
              <h3 className="text-sm font-bold text-gray-900 dark:text-gray-50 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-indigo-500" />
                매수 주문 <span className="text-xs font-normal text-gray-400">({cycle.version})</span>
              </h3>
              <span className="text-xs font-semibold text-indigo-500 bg-indigo-50 dark:bg-indigo-950 px-2 py-0.5 rounded-full">
                {buyOrders.length}건
              </span>
            </div>

            {buyOrders.length > 0 ? (
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {buyOrders.map((order, i) => (
                  <OrderRow key={i} order={order} />
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-xs text-gray-400 dark:text-gray-500">
                매수 주문이 없습니다
              </div>
            )}
          </div>
        </div>

        {/* 우측: 매도 주문 카드 */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl px-5 py-4 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-800 mb-2">
              <h3 className="text-sm font-bold text-gray-900 dark:text-gray-50 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                매도 주문
              </h3>
              <span className="text-xs font-semibold text-rose-500 bg-rose-50 dark:bg-rose-950 px-2 py-0.5 rounded-full">
                {sellOrders.length}건
              </span>
            </div>

            {sellOrders.length > 0 ? (
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {sellOrders.map((order, i) => (
                  <OrderRow key={i} order={order} />
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-xs text-gray-400 dark:text-gray-500">
                매도 주문이 없습니다
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
