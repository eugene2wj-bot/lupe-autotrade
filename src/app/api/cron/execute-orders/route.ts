// -------------------------------------------------------
// Vercel Cron: 장전 자동주문 전송 (EXECUTE_DAILY_TRADE)
// Execution Schedule: 매일 13:30 UTC (한국시간 22:30 PM / 09:30 ET)
// -------------------------------------------------------

import { NextResponse } from 'next/server';
import { POST as autoTradePost } from '@/app/api/auto-trade/route';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const cycleId = url.searchParams.get('cycleId') || undefined;

    console.log('[Cron execute-orders] Running pre-market trade execution...');
    const mockReq = new Request(request.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'EXECUTE_DAILY_TRADE',
        cycleId,
        forceTest: false,
      }),
    });

    return autoTradePost(mockReq);
  } catch (err: any) {
    console.error('[Cron execute-orders] Failed:', err);
    return NextResponse.json(
      { success: false, error: err?.message || err },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  return GET(request);
}
