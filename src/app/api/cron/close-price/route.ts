// -------------------------------------------------------
// Vercel Cron: 미국 장 마감 후 종가 수집 & 매매 가이드 산출
// Execution Schedule: 매일 22:00 UTC (한국시간 07:00 AM)
// -------------------------------------------------------

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { syncPostMarketClose } from '@/app/api/auto-trade/route';

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
      console.log('⛔ [Cron close-price] Master Guardrail: is_global_auto_trade is OFF. Aborting cron execution.');
      return NextResponse.json({
        success: false,
        message: '⛔ 전체 자동매매가 비활성화(OFF) 상태입니다. 장 마감 크론 처리가 차단되었습니다.',
      });
    }

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
