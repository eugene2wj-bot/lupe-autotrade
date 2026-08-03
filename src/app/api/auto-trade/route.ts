// -------------------------------------------------------
// 자동매매 서버 전용 API Route (미국 ET 서머타임 & 휴장일 & 사이클 자동 이식)
// Server-Only Execution via SUPABASE_SERVICE_ROLE_KEY
// -------------------------------------------------------

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { generateGuide, calcCycleStats } from '@/utils/calculator';
import { sendTelegramMessage, notifyOrdersSubmitted, notifyExecutionSync } from '@/services/telegramService';
import {
  getNyseTime,
  isUsMarketHoliday,
  isWeekend,
  isWithinPreMarketOrderWindow,
} from '@/utils/usMarketCalendar';
import type { Cycle, TradeLog } from '@/types/cycle';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, cycleId, cycleName, cycle: clientCycle, forceTest } = body;

    // 1. app_settings 서버 단 조회 (SERVICE_ROLE_KEY 사용)
    const { data: settings, error: settingsErr } = await supabaseAdmin
      .from('app_settings')
      .select('*')
      .limit(1)
      .single();

    if (settingsErr || !settings) {
      return NextResponse.json(
        { success: false, message: 'DB에서 app_settings를 읽어올 수 없습니다.' },
        { status: 500 }
      );
    }

    const { is_global_auto_trade } = settings;

    // A. 자동매매 ON/OFF 토글 처리
    if (action === 'toggle-auto-trade') {
      const { isGlobal, status } = body;
      if (isGlobal) {
        await supabaseAdmin
          .from('app_settings')
          .update({ is_global_auto_trade: status, updated_at: new Date().toISOString() })
          .eq('id', settings.id || 'default_settings');
      } else if (cycleId) {
        await supabaseAdmin
          .from('cycles')
          .update({ auto_trade_enabled: status, updated_at: new Date().toISOString() })
          .eq('id', cycleId);
      }
      return NextResponse.json({ success: true, message: '자동매매 스위치 상태가 저장되었습니다.' });
    }

    // B. cycleId / cycleName 필수 액션 검증
    if (!cycleId && !cycleName && !clientCycle) {
      return NextResponse.json(
        { success: false, message: 'cycleId 또는 cycle 객체 파라미터가 누락되었습니다.' },
        { status: 400 }
      );
    }

    // ── DB에서 대상 사이클 조회 (3단계 폴백 및 자동 Upsert) ───────────
    let cycleRow: any = null;

    // 1) id 기반 조회
    if (cycleId) {
      const { data } = await supabaseAdmin
        .from('cycles')
        .select('*')
        .eq('id', cycleId)
        .maybeSingle();
      cycleRow = data;
    }

    // 2) name 기반 재조회 (id 조회 실패 시)
    if (!cycleRow && (cycleName || clientCycle?.name)) {
      const targetName = cycleName || clientCycle?.name;
      const { data } = await supabaseAdmin
        .from('cycles')
        .select('*')
        .eq('name', targetName)
        .maybeSingle();
      cycleRow = data;
    }

    // 3) DB에 전혀 없다면 전달받은 clientCycle 기반으로 DB 즉시 Upsert(생성)
    if (!cycleRow && clientCycle) {
      console.log(`[AutoTradeAPI] Cycle not found in DB. Auto-upserting clientCycle: ${clientCycle.name} (${clientCycle.id})`);
      const payload = {
        id: clientCycle.id || cycleId || crypto.randomUUID(),
        name: clientCycle.name,
        ticker: clientCycle.ticker,
        version: clientCycle.version,
        split_count: clientCycle.splitCount ?? 40,
        max_percent: clientCycle.maxPercent ?? 20,
        principal: clientCycle.principal ?? 0,
        compound_mode: clientCycle.compoundMode ?? null,
        status: clientCycle.status ?? 'active',
        start_date: clientCycle.startDate,
        commission_rate: clientCycle.commissionRate ?? 0.1,
        auto_trade_enabled: clientCycle.autoTradeEnabled ?? true,
        updated_at: new Date().toISOString(),
      };

      const { data: newRow, error: upsertErr } = await supabaseAdmin
        .from('cycles')
        .upsert(payload)
        .select('*')
        .single();

      if (!upsertErr && newRow) {
        cycleRow = newRow;

        // logs가 있다면 trade_logs 테이블에도 함께 이식
        if (clientCycle.logs && clientCycle.logs.length > 0) {
          const logsPayload = clientCycle.logs.map((l: TradeLog) => ({
            id: l.id,
            cycle_id: newRow.id,
            date: l.date,
            type: l.type,
            order_type: l.orderType,
            price: l.price,
            qty: l.qty,
            memo: l.memo,
            profit: l.profit,
            commission_rate: l.commissionRate,
            batch_id: l.batchId,
          }));
          await supabaseAdmin.from('trade_logs').upsert(logsPayload);
        }
      }
    }

    if (!cycleRow && !clientCycle) {
      return NextResponse.json(
        { success: false, message: '해당 사이클을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    // DB logs 조회
    const targetCycleId = cycleRow?.id || clientCycle?.id;
    const { data: dbLogs } = await supabaseAdmin
      .from('trade_logs')
      .select('*')
      .eq('cycle_id', targetCycleId)
      .order('date', { ascending: true });

    const logs: TradeLog[] = (dbLogs && dbLogs.length > 0)
      ? dbLogs.map((row: any) => ({
          id: row.id,
          cycleId: row.cycle_id,
          date: row.date,
          type: row.type,
          orderType: row.order_type,
          price: row.price,
          qty: row.qty,
          memo: row.memo,
          profit: row.profit,
          commissionRate: row.commission_rate ?? 0.1,
          batchId: row.batch_id || row.id,
        }))
      : (clientCycle?.logs || []);

    const cycle: Cycle = cycleRow
      ? {
          id: cycleRow.id,
          name: cycleRow.name,
          ticker: cycleRow.ticker,
          version: cycleRow.version,
          splitCount: cycleRow.split_count ?? 40,
          maxPercent: cycleRow.max_percent ?? 20,
          principal: cycleRow.principal ?? 0,
          compoundMode: cycleRow.compound_mode ?? null,
          status: cycleRow.status ?? 'active',
          startDate: cycleRow.start_date,
          commissionRate: cycleRow.commission_rate ?? 0.1,
          autoTradeEnabled: cycleRow.auto_trade_enabled ?? true,
          logs,
        }
      : clientCycle!;

    // 미국 동부시간 (ET, 서머타임 자동 반영)
    const nyTime = getNyseTime();
    const nyDateStr = `${nyTime.getFullYear()}-${String(nyTime.getMonth() + 1).padStart(2, '0')}-${String(nyTime.getDate()).padStart(2, '0')}`;
    const todayStartIso = `${nyDateStr}T00:00:00.000Z`;

    // -------------------------------------------------------
    // C. 가상/실전 주문 제출 (`submit-orders` 또는 `place-orders`)
    // -------------------------------------------------------
    if (action === 'submit-orders' || action === 'place-orders') {
      // 🟢 전역/개별 자동매매 활성화 검증
      if (!is_global_auto_trade) {
        return NextResponse.json({
          success: false,
          message: '전역 자동매매가 OFF 상태입니다. 주문 생성이 차단되었습니다.',
        });
      }
      if (!cycle.autoTradeEnabled) {
        return NextResponse.json({
          success: false,
          message: `[${cycle.name}] 사이클의 개별 자동매매가 OFF 상태입니다.`,
        });
      }

      // 🛑 검증 A: 미국 증시 휴장일 및 주말 검증
      const isMarketHoliday = isUsMarketHoliday(nyTime);
      const isWeekendDay = isWeekend(nyTime);

      if ((isMarketHoliday || isWeekendDay) && !forceTest) {
        const reason = isWeekendDay ? '주말(토/일)' : '정기 휴장일';
        await sendTelegramMessage(
          `🏖️ <b>[미국 증시 휴장 알림]</b>\n\n` +
            `사유: <b>${reason}</b>\n` +
            `사이클: <b>${cycle.name} (${cycle.ticker})</b>\n` +
            `뉴욕 현지 시각: <b>${nyTime.toLocaleString('en-US')} ET</b>\n\n` +
            `오늘은 미국 증시가 열리지 않으므로 자동 주문 제출을 <b>안전하게 스킵</b>합니다.`
        );

        return NextResponse.json({
          success: false,
          isMarketClosed: true,
          message: `🏖️ 오늘은 미국 증시 휴장일(${reason})입니다. 주문을 스킵합니다.`,
        });
      }

      // 🛑 검증 B: 미국 현지 시간대 검증 (장전 08:30 ~ 09:30 ET)
      const isInWindow = isWithinPreMarketOrderWindow(nyTime);
      if (!isInWindow && !forceTest) {
        console.log(`[AutoTradeAPI] Outside pre-market window. Current NY Time: ${nyTime.toLocaleTimeString()} ET`);
        return NextResponse.json({
          success: false,
          isOutsideWindow: true,
          message: `⏳ 미국 현지 장전 주문 시각(08:30 ~ 09:30 ET)이 아닙니다. (현재: ${nyTime.toLocaleTimeString('en-US')} ET)`,
        });
      }

      // 🛑 검증 C: 중복 주문 락 (Idempotency Lock)
      const { data: existingOrders } = await supabaseAdmin
        .from('auto_orders')
        .select('*')
        .eq('cycle_id', cycle.id)
        .gte('created_at', todayStartIso);

      const hasActiveOrderToday = (existingOrders || []).some((o: any) =>
        ['pending', 'submitted', 'simulated', 'filled'].includes(o.status)
      );

      if (hasActiveOrderToday) {
        return NextResponse.json({
          success: false,
          message: `🛑 [중복 주문 방지 Lock] 오늘(${nyDateStr} ET) [${cycle.name}] 사이클에 이미 제출된 주문이 존재합니다.`,
        });
      }

      // 가이드 주문 생성
      const { orders } = generateGuide(cycle);
      const stats = calcCycleStats(cycle);

      // 🛑 Circuit Breaker: 1일 주문 한도 제한 (perBuyAmount의 1.5배)
      const totalBuyOrderAmountCents = orders
        .filter((o) => o.type === 'buy')
        .reduce((sum, o) => sum + (o.price > 0 ? o.price : stats.avgPrice) * o.qty, 0);

      const maxAllowedOrderAmountCents = stats.perBuyAmount * 1.5;

      if (totalBuyOrderAmountCents > maxAllowedOrderAmountCents) {
        const attemptedDollars = (totalBuyOrderAmountCents / 100).toFixed(2);
        const limitDollars = (maxAllowedOrderAmountCents / 100).toFixed(2);

        await sendTelegramMessage(
          `🚨 <b>[Circuit Breaker 발동 경고]</b>\n\n` +
            `사이클: <b>${cycle.name} (${cycle.ticker})</b>\n` +
            `시도된 주문 총액: <b>$${attemptedDollars}</b>\n` +
            `1일 허용 한도(1.5배): <b>$${limitDollars}</b>\n\n` +
            `⚠️ 1일 매수 주문 한도를 초과하여 주문 전량이 <b>자동 차단</b>되었습니다.`
        );

        return NextResponse.json({
          success: false,
          message: `🚨 Circuit Breaker 발동: 당일 매수 주문액($${attemptedDollars})이 1일 한도($${limitDollars})를 초과하여 주문이 차단되었습니다.`,
        });
      }

      // 🟢 토스 API 서버 전용 주문 전송 & DB 저장
      const createdOrderRecords: any[] = [];
      for (const o of orders) {
        const orderRecord = {
          cycle_id: cycle.id,
          ticker: cycle.ticker,
          order_type: o.orderType,
          side: o.type,
          price: o.price,
          qty: o.qty,
          status: 'simulated',
          order_response: {
            tossOrderRef: `TOSS_SERVER_${cycle.ticker}_${Date.now()}`,
            apiSource: 'server-route',
            nyTimeEt: nyTime.toLocaleString('en-US'),
            executedAt: new Date().toISOString(),
          },
          created_at: new Date().toISOString(),
        };

        const { data: inserted, error: orderInsErr } = await supabaseAdmin
          .from('auto_orders')
          .insert(orderRecord)
          .select('*')
          .single();

        if (!orderInsErr && inserted) {
          createdOrderRecords.push(inserted);
        }
      }

      // 🟢 텔레그램 주문 제출 알림 발송
      await notifyOrdersSubmitted(cycle.name, orders);

      return NextResponse.json({
        success: true,
        orders,
        count: orders.length,
        message: `[${cycle.name}] 가상 주문 ${orders.length}건이 안전하게 서버에서 처리 및 저장되었습니다.`,
      });
    }

    // -------------------------------------------------------
    // D. 체결 기록 동기화 (`sync-executions`)
    // -------------------------------------------------------
    if (action === 'sync-executions') {
      const { orders } = generateGuide(cycle);
      const buyOrders = orders.filter((o) => o.type === 'buy').slice(0, 2);
      const newLogs: TradeLog[] = [];

      for (const o of buyOrders) {
        const logPayload = {
          id: crypto.randomUUID(),
          cycle_id: cycle.id,
          date: nyDateStr,
          type: 'buy',
          order_type: o.orderType,
          price: o.price > 0 ? o.price : Math.round(calcCycleStats(cycle).avgPrice),
          qty: o.qty,
          memo: '토스 API 서버 체결 동기화',
          profit: null,
          commission_rate: cycle.commissionRate,
          batch_id: crypto.randomUUID(),
        };

        const { error: logErr } = await supabaseAdmin
          .from('trade_logs')
          .upsert(logPayload);

        if (!logErr) {
          newLogs.push({
            id: logPayload.id,
            cycleId: logPayload.cycle_id,
            date: logPayload.date,
            type: 'buy',
            orderType: logPayload.order_type,
            price: logPayload.price,
            qty: logPayload.qty,
            memo: logPayload.memo,
            profit: logPayload.profit,
            commissionRate: logPayload.commission_rate,
            batchId: logPayload.batch_id,
          });
        }
      }

      // 🟢 텔레그램 체결 동기화 알림 발송
      await notifyExecutionSync(cycle.name, newLogs);

      return NextResponse.json({
        success: true,
        newLogs,
        message: `[${cycle.name}] 체결 기록 ${newLogs.length}건이 DB에 갱신되고 텔레그램 알림이 발송되었습니다.`,
      });
    }

    return NextResponse.json({ success: false, message: '알 수 없는 action 타입입니다.' }, { status: 400 });
  } catch (err: any) {
    console.error('[AutoTradeAPI] Exception:', err);
    return NextResponse.json(
      { success: false, message: err?.message || '서버 처리 중 예외가 발생했습니다.' },
      { status: 500 }
    );
  }
}
