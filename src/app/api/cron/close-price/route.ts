// -------------------------------------------------------
// Vercel Cron: 미국 장 마감 후 종가 수집 & 매매 가이드 산출
// Execution Schedule: 매일 22:00 UTC (한국시간 07:00 AM)
// -------------------------------------------------------

import { NextResponse } from 'next/server';
import { syncPostMarketClose } from '@/app/api/auto-trade/route';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const cycleId = url.searchParams.get('cycleId') || undefined;

    console.log('[Cron close-price] Running post-market close sync...');
    const result = await syncPostMarketClose(cycleId);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error('[Cron close-price] Failed:', err);
    return NextResponse.json(
      { success: false, error: err?.message || err },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  return GET(request);
}
