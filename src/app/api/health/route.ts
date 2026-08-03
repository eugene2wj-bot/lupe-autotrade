// -------------------------------------------------------
// 시스템 파이프라인 헬스체크 및 DB 연결 진단 API
// GET /api/health
// -------------------------------------------------------

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET() {
  const startTime = Date.now();
  const results: Record<string, any> = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    proxy: {
      fixieConfigured: Boolean(process.env.FIXIE_URL),
      fixieUrlMasked: process.env.FIXIE_URL
        ? process.env.FIXIE_URL.replace(/:\/\/.*@/, '://***:***@')
        : null,
    },
    database: {
      connected: false,
      tables: {},
      error: null,
    },
    tossCredentials: {
      configured: false,
      accountConfigured: false,
    },
    telegram: {
      configured: false,
    },
  };

  try {
    // 1. Supabase DB 주요 테이블 연결 및 행 수 검증
    const tableChecks = ['cycles', 'daily_records', 'auto_orders', 'trade_logs', 'app_settings'];
    let allTablesOk = true;

    for (const table of tableChecks) {
      const { count, error } = await supabaseAdmin
        .from(table)
        .select('*', { count: 'exact', head: true });

      if (error) {
        allTablesOk = false;
        results.database.tables[table] = { status: 'error', error: error.message };
      } else {
        results.database.tables[table] = { status: 'ok', count: count ?? 0 };
      }
    }

    results.database.connected = allTablesOk;
    if (!allTablesOk) {
      results.status = 'degraded';
    }

    // 2. app_settings 설정 점검
    const { data: settings } = await supabaseAdmin
      .from('app_settings')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (settings) {
      const hasAppKey = Boolean((settings.toss_app_key || settings.tossAppKey || '').trim());
      const hasSecret = Boolean((settings.toss_app_secret || settings.tossAppSecret || '').trim());
      const hasAccount = Boolean((settings.toss_account_no || settings.tossAccountNo || '').trim());
      const hasBotToken = Boolean((settings.telegram_bot_token || settings.telegramBotToken || '').trim());
      const hasChatId = Boolean((settings.telegram_chat_id || settings.telegramChatId || '').trim());

      results.tossCredentials = {
        configured: hasAppKey && hasSecret,
        accountConfigured: hasAccount,
      };

      results.telegram = {
        configured: hasBotToken && hasChatId,
      };

      results.settings = {
        is_global_auto_trade: settings.is_global_auto_trade ?? false,
        auto_trade_time: settings.auto_trade_time ?? '22:30',
        is_virtual_trade: settings.is_virtual_trade ?? false,
      };
    }
  } catch (err: any) {
    results.status = 'error';
    results.database.error = err?.message || String(err);
  }

  results.responseTimeMs = Date.now() - startTime;
  return NextResponse.json(results, { status: results.status === 'error' ? 500 : 200 });
}
