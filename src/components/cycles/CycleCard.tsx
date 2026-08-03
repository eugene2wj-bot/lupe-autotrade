'use client';

import React from 'react';
import Link from 'next/link';
import type { Cycle } from '@/types/cycle';
import { calcCycleStats, getProgressBarStyle } from '@/utils/calculator';
import { formatDollars, toDollars } from '@/utils/format';
import { getQuotesForCycle } from '@/store/cycleStore';

interface ProgressBarProps {
  currentT: number;
  splitCount: number;
  phase: string;
}

function ProgressBar({ currentT, splitCount, phase }: ProgressBarProps) {
  const percent = splitCount > 0 ? Math.min((currentT / splitCount) * 100, 100) : 0;
  const style = getProgressBarStyle(percent, phase as Parameters<typeof getProgressBarStyle>[1]);

  return (
    <div className="relative flex-1 min-w-0" style={{ height: 8 }}>
      <div
        className="absolute left-0 right-0 rounded-full dark:hidden"
        style={{ top: 0, height: 8, background: style.light }}
      />
      <div
        className="absolute left-0 right-0 rounded-full hidden dark:block"
        style={{ top: 0, height: 8, background: style.dark }}
      />
      <div
        className="absolute w-[2px] rounded bg-white dark:bg-gray-900 shadow-[0_0_0_0.5px_rgba(0,0,0,0.08)] dark:shadow-[0_0_0_0.5px_rgba(255,255,255,0.12)]"
        style={{ left: '50%', top: -2, height: 12, transform: 'translateX(-50%)' }}
      />
      <div
        className={`absolute w-[3.5px] rounded-full ${style.marker} ring-[1.5px] ring-white dark:ring-gray-900 shadow-sm z-20`}
        style={{
          left: `clamp(2px, ${percent}%, calc(100% - 2px))`,
          top: -2,
          height: 12,
          transform: 'translateX(-50%)',
        }}
      />
    </div>
  );
}

interface ProfitDisplayProps {
  realizedProfit: number;
  holdingQty: number;
  avgPrice: number;
  principal: number;
  cycle: Cycle;
}

function ProfitDisplay({ realizedProfit, holdingQty, avgPrice, principal, cycle }: ProfitDisplayProps) {
  const quotes = getQuotesForCycle(cycle);
  const latestPriceDollars = quotes.length > 0 ? quotes[quotes.length - 1].close : toDollars(avgPrice);

  const unrealizedProfitCents = holdingQty > 0 && latestPriceDollars > 0
    ? Math.round((latestPriceDollars * 100 - avgPrice) * holdingQty)
    : 0;

  const totalProfitCents = realizedProfit + unrealizedProfitCents;
  const totalProfitDollars = toDollars(totalProfitCents);

  if (totalProfitCents === 0) {
    return (
      <div className="text-right shrink-0">
        <p className="text-[15px] font-semibold tabular-nums leading-none text-gray-400 dark:text-gray-500">
          —
        </p>
      </div>
    );
  }

  const isPositive = totalProfitCents >= 0;
  const colorClass = isPositive
    ? 'text-red-600 dark:text-red-400'
    : 'text-blue-600 dark:text-blue-400';

  return (
    <div className="text-right whitespace-nowrap shrink-0">
      <p className={`text-[15px] font-semibold tabular-nums leading-none ${colorClass}`}>
        {isPositive ? '+' : '-'}${Math.abs(totalProfitDollars).toFixed(2)}
      </p>
      <p className={`text-[10.5px] mt-0.5 tabular-nums ${colorClass} opacity-80`}>
        {isPositive ? '+' : ''}
        {(principal > 0 ? (totalProfitCents / principal) * 100 : 0).toFixed(2)}%
      </p>
    </div>
  );
}

interface CycleCardProps {
  cycle: Cycle;
}

export function CycleCard({ cycle }: CycleCardProps) {
  const quotes = getQuotesForCycle(cycle);
  const stats = calcCycleStats(cycle, quotes);

  return (
    <Link href={`/cycle/${cycle.id}`} className="block">
      <div className="bg-white dark:bg-gray-900 rounded-2xl px-4 py-3.5 transition-all duration-200 hover:-translate-y-0.5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_2px_8px_rgba(0,0,0,0.06)] hover:shadow-[0_2px_4px_rgba(0,0,0,0.06),0_4px_12px_rgba(0,0,0,0.08)]">
        <div className="flex items-center justify-between gap-3 mb-2.5">
          <div className="min-w-0">
            <div className="flex items-baseline gap-1.5">
              <h3 className="font-semibold text-[15px] text-gray-900 dark:text-gray-50 truncate">
                {cycle.name}
              </h3>
              <span className="text-[11px] text-gray-500 dark:text-gray-400 shrink-0">
                {cycle.ticker} · {cycle.version}
              </span>
            </div>
          </div>
          <ProfitDisplay
            realizedProfit={stats.realizedProfit}
            holdingQty={stats.holdingQty}
            avgPrice={stats.avgPrice}
            principal={cycle.principal}
            cycle={cycle}
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[13.5px] font-bold text-gray-900 dark:text-gray-100 tabular-nums shrink-0 leading-none">
            T{stats.currentT.toFixed(2)}
            <span className="text-[11px] font-medium text-gray-400 dark:text-gray-500">
              {' '}/ {cycle.splitCount}
            </span>
          </span>
          <ProgressBar
            currentT={stats.currentT}
            splitCount={cycle.splitCount}
            phase={stats.phase}
          />
        </div>

        <div className="flex items-center justify-between mt-2.5 gap-2">
          <div className="flex items-baseline gap-3 tabular-nums">
            <div className="flex items-baseline gap-1">
              <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">
                보유
              </span>
              <span className="text-[15px] font-bold text-gray-900 dark:text-gray-50 leading-none">
                {stats.holdingQty}
                <span className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 ml-px">
                  주
                </span>
              </span>
            </div>
            <span
              className="w-px self-center bg-gray-200 dark:bg-gray-700"
              style={{ height: 12 }}
            />
            <div className="flex items-baseline gap-1">
              <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">
                평단
              </span>
              <span className="text-[15px] font-bold text-gray-900 dark:text-gray-50 leading-none">
                ${formatDollars(stats.avgPrice)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
