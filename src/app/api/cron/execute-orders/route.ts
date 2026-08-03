// -------------------------------------------------------
// Vercel Cron: 장전 자동주문 전송 (EXECUTE_DAILY_TRADE)
// Execution Schedule: 매일 13:30 UTC (한국시간 22:30 PM / 09:30 ET)
// -------------------------------------------------------

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { POST as autoTradePost } from '@/app/api/auto-trade/route';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const cycleId = url.searchParams.get('cycleId') || undefined;

    // 🔒 [마스터 안전 가드레일] DB에서 is_global_auto_trade 검증
    const { data: settings } = await supabaseAdmin
      .from('app_settings')
      .select('is_global_auto_trade')
      .limit(1)
      .maybeSingle();

    const isGlobalAutoTrade = settings?.is_global_auto_trade ?? false;
    if (!isGlobalAutoTrade) {
      console.log('⛔ [Cron execute-orders] Master Guardrail: is_global_auto_trade is OFF. Aborting cron trade execution.');
      return NextResponse.json({
        success: false,
        message: '⛔ 전체 자동매매가 비활성화(OFF) 상태입니다. 크론 장전 자동주문 조회가 100% 차단되었습니다.',
      });
    }

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
