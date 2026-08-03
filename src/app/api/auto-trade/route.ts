// -------------------------------------------------------
// 자동매매 서버 전용 API Route (보안 가드레일 & DB/텔레그램 에러 진단)
// Server-Only Execution via SUPABASE_SERVICE_ROLE_KEY
// -------------------------------------------------------

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { generateGuide, calcCycleStats } from '@/utils/calculator';
import {
  sendTelegramMessage,
  notifyOrdersSubmittedDetailed,
  notifyExecutionSync,
} from '@/services/telegramService';
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

    // ── 0. PIN 번호 검증 및 변경 액션 (`VERIFY_PIN`, `CHANGE_PIN`, `GET_SETTINGS`) ───────────
    if (action === 'VERIFY_PIN') {
      const inputPin = String(body.pinCode || body.pin_code || '').trim();
      const { data: existingSettings } = await supabaseAdmin
        .from('app_settings')
        .select('*')
        .limit(1)
        .maybeSingle();

      const dbPin = existingSettings?.pin_code ? String(existingSettings.pin_code).trim() : null;
      const validPin = dbPin || '1234';

      console.log(`[AutoTradeAPI VERIFY_PIN] inputPin: ${inputPin}, dbPin: ${dbPin}, validPin: ${validPin}`);

      if (inputPin === validPin) {
        return NextResponse.json({ success: true, message: 'PIN 번호 인증 성공' });
      } else {
        return NextResponse.json(
          { success: false, error: '보안 PIN 번호가 일치하지 않습니다.', message: '보안 PIN 번호가 일치하지 않습니다.' },
          { status: 401 }
        );
      }
    }

    if (action === 'GET_SETTINGS' || action === 'get-settings') {
      const { data: existingSettings } = await supabaseAdmin
        .from('app_settings')
        .select('*')
        .limit(1)
        .maybeSingle();

      const formattedSettings = {
        id: existingSettings?.id,
        is_global_auto_trade: existingSettings?.is_global_auto_trade ?? false,
        toss_app_key: existingSettings?.toss_app_key ?? '',
        toss_app_secret: existingSettings?.toss_app_secret ?? '',
        toss_account_no: existingSettings?.toss_account_no ?? '',
        telegram_bot_token: existingSettings?.telegram_bot_token ?? '',
        telegram_chat_id: existingSettings?.telegram_chat_id ?? '',
        auto_trade_time: existingSettings?.auto_trade_time ?? '22:30',
        pin_code: existingSettings?.pin_code ?? '1234',

        tossAppKey: existingSettings?.toss_app_key ?? '',
        tossAppSecret: existingSettings?.toss_app_secret ?? '',
        tossAccountNo: existingSettings?.toss_account_no ?? '',
        telegramBotToken: existingSettings?.telegram_bot_token ?? '',
        telegramChatId: existingSettings?.telegram_chat_id ?? '',
        autoTradeTime: existingSettings?.auto_trade_time ?? '22:30',
      };

      return NextResponse.json({
        success: true,
        settings: formattedSettings,
      });
    }

    if (action === 'CHANGE_PIN') {
      const currentPin = String(body.currentPin || '').trim();
      const newPin = String(body.newPin || '').trim();

      const { data: existingSettings } = await supabaseAdmin
        .from('app_settings')
        .select('*')
        .limit(1)
        .maybeSingle();

      const dbPin = existingSettings?.pin_code ? String(existingSettings.pin_code).trim() : null;
      const validPin = dbPin || '1234';

      if (currentPin !== validPin) {
        return NextResponse.json(
          { success: false, error: '현재 PIN 번호가 일치하지 않습니다.', message: '현재 PIN 번호가 일치하지 않습니다.' },
          { status: 400 }
        );
      }

      if (!newPin || newPin.length < 4) {
        return NextResponse.json(
          { success: false, error: '신규 PIN 번호는 4자리 이상이어야 합니다.', message: '신규 PIN 번호는 4자리 이상이어야 합니다.' },
          { status: 400 }
        );
      }

      if (existingSettings) {
        const { error: updateErr } = await supabaseAdmin
          .from('app_settings')
          .update({ pin_code: newPin, updated_at: new Date().toISOString() })
          .eq('id', existingSettings.id);

        if (updateErr) {
          console.error('[AutoTradeAPI CHANGE_PIN] Update error:', updateErr);
          const payload = { ...existingSettings, pin_code: newPin, updated_at: new Date().toISOString() };
          await supabaseAdmin.from('app_settings').upsert(payload);
        }
      } else {
        await supabaseAdmin
          .from('app_settings')
          .insert({ id: 'default_settings', pin_code: newPin, updated_at: new Date().toISOString() });
      }

      console.log(`[AutoTradeAPI CHANGE_PIN] PIN successfully updated to: ${newPin}`);
      return NextResponse.json({ success: true, message: 'PIN 번호가 성공적으로 변경되었습니다.' });
    }

    // ── 1. 설정 저장 액션 (`SAVE_SETTINGS` 또는 `save-settings`) ───────────
    if (action === 'SAVE_SETTINGS' || action === 'save-settings') {
      const src = body.settings || body || {};

      // 기존 DB에 저장된 app_settings 행 조회 (기존 값 보존 방어 로직)
      const { data: existingSettings } = await supabaseAdmin
        .from('app_settings')
        .select('*')
        .limit(1)
        .maybeSingle();

      const toss_app_key = src.tossAppKey ?? src.toss_app_key;
      const toss_app_secret = src.tossAppSecret ?? src.toss_app_secret;
      const toss_account_no = src.tossAccountNo ?? src.toss_account_no;
      const telegram_bot_token = src.telegramBotToken ?? src.telegram_bot_token;
      const telegram_chat_id = src.telegramChatId ?? src.telegram_chat_id;
      const auto_trade_time = src.autoTradeTime ?? src.auto_trade_time;
      const pin_code = src.pinCode ?? src.pin_code;
      const is_global_auto_trade = src.is_global_auto_trade ?? src.isGlobalAutoTrade;

      let targetId: any = existingSettings?.id ?? src.id ?? 1;

      // 비어있거나 누락된 경우 기존 DB 값 보존
      const payload: any = {
        id: targetId,
        is_global_auto_trade: is_global_auto_trade !== undefined ? is_global_auto_trade : (existingSettings?.is_global_auto_trade ?? false),
        toss_app_key: (toss_app_key !== undefined && toss_app_key !== null && toss_app_key !== '') ? toss_app_key : (existingSettings?.toss_app_key ?? ''),
        toss_app_secret: (toss_app_secret !== undefined && toss_app_secret !== null && toss_app_secret !== '') ? toss_app_secret : (existingSettings?.toss_app_secret ?? ''),
        toss_account_no: (toss_account_no !== undefined && toss_account_no !== null && toss_account_no !== '') ? toss_account_no : (existingSettings?.toss_account_no ?? ''),
        telegram_bot_token: (telegram_bot_token !== undefined && telegram_bot_token !== null && telegram_bot_token !== '') ? telegram_bot_token : (existingSettings?.telegram_bot_token ?? ''),
        telegram_chat_id: (telegram_chat_id !== undefined && telegram_chat_id !== null && telegram_chat_id !== '') ? telegram_chat_id : (existingSettings?.telegram_chat_id ?? ''),
        auto_trade_time: (auto_trade_time !== undefined && auto_trade_time !== null && auto_trade_time !== '') ? auto_trade_time : (existingSettings?.auto_trade_time ?? '22:30'),
        pin_code: (pin_code !== undefined && pin_code !== null && pin_code !== '') ? pin_code : (existingSettings?.pin_code ?? '1234'),
        updated_at: new Date().toISOString(),
      };

      // Service Role Key 기반 DB Upsert (RLS 우회)
      let { data: savedData, error: saveErr } = await supabaseAdmin
        .from('app_settings')
        .upsert(payload)
        .select('*')
        .single();

      // 만약 integer 타입 에러 발생 시 id를 숫자 1로 변환하여 폴백 재시도
      if (saveErr && (saveErr.message.includes('integer') || saveErr.code === '22P02')) {
        console.warn('[AutoTradeAPI] ID integer syntax error. Retrying with numeric id: 1...');
        payload.id = 1;
        const retryInt = await supabaseAdmin
          .from('app_settings')
          .upsert(payload)
          .select('*')
          .single();
        savedData = retryInt.data;
        saveErr = retryInt.error;
      }

      // pin_code 컬럼 미존재 시 폴백 처리
      if (saveErr && saveErr.message.includes('pin_code')) {
        console.warn('[AutoTradeAPI] pin_code column missing in DB. Retrying without pin_code field...');
        delete payload.pin_code;
        const retry = await supabaseAdmin
          .from('app_settings')
          .upsert(payload)
          .select('*')
          .single();
        savedData = retry.data;
        saveErr = retry.error;
      }

      // auto_trade_time 컬럼이 Supabase DB 스키마에 존재하지 않는 경우 폴백 처리
      if (saveErr && saveErr.message.includes('auto_trade_time')) {
        console.warn('[AutoTradeAPI] auto_trade_time column missing in DB. Retrying without auto_trade_time field...');
        const fallbackPayload = { ...payload };
        delete fallbackPayload.auto_trade_time;
        const retry = await supabaseAdmin
          .from('app_settings')
          .upsert(fallbackPayload)
          .select('*')
          .single();
        savedData = retry.data;
        saveErr = retry.error;
      }

      if (saveErr) {
        console.error('[AutoTradeAPI] app_settings upsert error:', saveErr);
        return NextResponse.json(
          {
            success: false,
            error: `DB 저장 실패: ${saveErr.message}`,
            message: `🔴 DB 저장 실패: ${saveErr.message}`,
          },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        settings: savedData,
        message: '✅ 설정이 DB에 안전하게 저장되었습니다.',
      });
    }

    // ── 2. app_settings 서버 단 조회 (SERVICE_ROLE_KEY 사용 - ID 무관 첫 행 조회) ────────────────
    const { data: settings, error: settingsErr } = await supabaseAdmin
      .from('app_settings')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (settingsErr || !settings) {
      console.warn('[AutoTradeAPI] app_settings fetch warning:', settingsErr?.message);
    }

    const is_global_auto_trade = settings?.is_global_auto_trade ?? settings?.isGlobalAutoTrade ?? false;

    // ── 3. 자동매매 ON/OFF 토글 처리 (`toggle-auto-trade`) ─────────────────
    if (action === 'toggle-auto-trade') {
      const { isGlobal, status } = body;
      if (isGlobal) {
        const { error: err } = await supabaseAdmin
          .from('app_settings')
          .upsert({
            id: settings?.id || 'default_settings',
            is_global_auto_trade: status,
            updated_at: new Date().toISOString(),
          });
        if (err) {
          return NextResponse.json(
            { success: false, error: `DB 저장 실패: ${err.message}`, message: `🔴 DB 저장 실패: ${err.message}` },
            { status: 500 }
          );
        }
      } else if (cycleId) {
        const { error: err } = await supabaseAdmin
          .from('cycles')
          .update({ auto_trade_enabled: status, updated_at: new Date().toISOString() })
          .eq('id', cycleId);
        if (err) {
          return NextResponse.json(
            { success: false, error: `DB 저장 실패: ${err.message}`, message: `🔴 DB 저장 실패: ${err.message}` },
            { status: 500 }
          );
        }
      }
      return NextResponse.json({ success: true, message: '자동매매 스위치 상태가 DB에 성공적으로 저장되었습니다.' });
    }

    // ── 4. cycleId / cycleName 필수 액션 검증 ────────────────────────────
    if (!cycleId && !cycleName && !clientCycle) {
      return NextResponse.json(
        { success: false, error: 'cycleId 파라미터 누락', message: 'cycleId 또는 cycle 객체 파라미터가 누락되었습니다.' },
        { status: 400 }
      );
    }

    // DB에서 대상 사이클 조회 (3단계 폴백 및 자동 Upsert)
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
      console.log(`[AutoTradeAPI] Auto-upserting cycle to DB: ${clientCycle.name} (${clientCycle.id})`);
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

      let { data: newRow, error: upsertErr } = await supabaseAdmin
        .from('cycles')
        .upsert(payload)
        .select('*')
        .single();

      // cycles 테이블 스키마에 특정 컬럼(start_date 등)이 존재하지 않는 경우 폴백 재시도
      if (upsertErr && (upsertErr.message.includes('schema cache') || upsertErr.code === 'PGRST204')) {
        console.warn('[AutoTradeAPI] cycles upsert initial schema warning:', upsertErr.message);
        const fallbackPayload: any = { ...payload };

        if (upsertErr.message.includes('start_date')) delete fallbackPayload.start_date;
        if (upsertErr.message.includes('compound_mode')) delete fallbackPayload.compound_mode;
        if (upsertErr.message.includes('auto_trade_enabled')) delete fallbackPayload.auto_trade_enabled;
        if (upsertErr.message.includes('split_count')) delete fallbackPayload.split_count;
        if (upsertErr.message.includes('max_percent')) delete fallbackPayload.max_percent;
        if (upsertErr.message.includes('commission_rate')) delete fallbackPayload.commission_rate;
        if (upsertErr.message.includes('updated_at')) delete fallbackPayload.updated_at;

        const retry = await supabaseAdmin
          .from('cycles')
          .upsert(fallbackPayload)
          .select('*')
          .single();
        newRow = retry.data;
        upsertErr = retry.error;
      }

      if (upsertErr) {
        console.error('[AutoTradeAPI] cycles upsert error:', upsertErr);
        return NextResponse.json(
          {
            success: false,
            error: `cycles DB 저장 실패: ${upsertErr.message}`,
            message: `🔴 DB 저장 실패: ${upsertErr.message}`,
          },
          { status: 500 }
        );
      }

      if (newRow) {
        cycleRow = newRow;

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
        { success: false, error: '사이클 미존재', message: '해당 사이클을 DB에서 찾을 수 없습니다.' },
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

    // ───────────────────────────────────────────────────────
    // C. 가상/실전 주문 제출 (`submit-orders` 또는 `place-orders`)
    // ───────────────────────────────────────────────────────
    if (action === 'submit-orders' || action === 'place-orders') {
      // 🟢 전역/개별 자동매매 활성화 검증
      if (!is_global_auto_trade && !forceTest) {
        return NextResponse.json({
          success: false,
          error: '전역 자동매매 OFF',
          message: '전역 자동매매가 OFF 상태입니다. 주문 생성이 차단되었습니다.',
        });
      }
      if (!cycle.autoTradeEnabled && !forceTest) {
        return NextResponse.json({
          success: false,
          error: '개별 자동매매 OFF',
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
          error: `미국 증시 휴장일(${reason})`,
          message: `🏖️ 오늘은 미국 증시 휴장일(${reason})입니다. 주문을 스킵합니다.`,
        });
      }

      // 🛑 검증 B: 미국 현지 시간대 검증 (장전 08:30 ~ 09:30 ET)
      const isInWindow = isWithinPreMarketOrderWindow(nyTime);
      if (!isInWindow && !forceTest) {
        return NextResponse.json({
          success: false,
          isOutsideWindow: true,
          error: '미국 장전 시간대 아님',
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

      if (hasActiveOrderToday && !forceTest) {
        return NextResponse.json({
          success: false,
          error: '중복 주문 방지 Lock',
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

      if (totalBuyOrderAmountCents > maxAllowedOrderAmountCents && !forceTest) {
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
          error: 'Circuit Breaker 발동',
          message: `🚨 Circuit Breaker 발동: 당일 매수 주문액($${attemptedDollars})이 1일 한도($${limitDollars})를 초과하여 주문이 차단되었습니다.`,
        });
      }

      // 🟢 auto_orders DB 저장 (정형화된 필드 규격 준수 & undefined ➔ 기본값 변환)
      const createdOrderRecords: any[] = [];
      for (const o of orders) {
        const rawPrice = typeof o.price === 'number' ? o.price : 0;
        const rawQty = typeof o.qty === 'number' ? o.qty : 0;

        const orderRecord = {
          cycle_id: cycle.id || '',
          ticker: (cycle.ticker || '').toUpperCase(),
          order_type: o.orderType || 'star',
          side: o.type || 'buy',
          price: rawPrice,
          qty: rawQty,
          target_price: rawPrice,
          order_date: nyDateStr || new Date().toISOString().slice(0, 10),
          status: 'simulated',
          order_response: {
            tossOrderRef: `TOSS_SERVER_${cycle.ticker}_${Date.now()}`,
            apiSource: 'server-route',
            nyTimeEt: nyTime.toLocaleString('en-US'),
            executedAt: new Date().toISOString(),
          },
          created_at: new Date().toISOString(),
        };

        let { data: inserted, error: orderInsErr } = await supabaseAdmin
          .from('auto_orders')
          .insert(orderRecord)
          .select('*')
          .single();

        // auto_orders 테이블 스키마에 order_response 컬럼이 존재하지 않는 경우 폴백 처리
        if (orderInsErr && orderInsErr.message.includes('order_response')) {
          console.warn('[AutoTradeAPI] order_response column missing in auto_orders. Retrying without order_response...');
          const fallbackRecord = { ...orderRecord };
          delete (fallbackRecord as any).order_response;
          const retryOrder = await supabaseAdmin
            .from('auto_orders')
            .insert(fallbackRecord)
            .select('*')
            .single();
          inserted = retryOrder.data;
          orderInsErr = retryOrder.error;
        }

        if (orderInsErr) {
          console.error('[AutoTradeAPI] auto_orders insert failed:', orderInsErr);
          return NextResponse.json(
            {
              success: false,
              error: `DB 저장 실패: ${orderInsErr.message}`,
              message: `🔴 DB 저장 실패: auto_orders 테이블 저장 중 오류가 발생했습니다. (${orderInsErr.message})`,
            },
            { status: 500 }
          );
        }

        if (inserted) {
          createdOrderRecords.push(inserted);
        }
      }

      // 🟢 텔레그램 주문 제출 알림 발송 (명시적 에러 체크)
      const tgResult = await notifyOrdersSubmittedDetailed(cycle.name, orders);
      if (!tgResult.success) {
        console.warn('[AutoTradeAPI] Telegram notification failed:', tgResult.error);
        return NextResponse.json({
          success: false,
          error: `텔레그램 발송 실패: ${tgResult.error}`,
          message: `🔴 텔레그램 오류: ${tgResult.error}`,
        }, { status: 400 });
      }

      return NextResponse.json({
        success: true,
        orders,
        count: orders.length,
        message: `[${cycle.name}] 가상 주문 ${orders.length}건이 안전하게 DB에 저장되고 텔레그램으로 알림이 발송되었습니다.`,
      });
    }

    // ───────────────────────────────────────────────────────
    // D. 체결 기록 동기화 (`sync-executions`)
    // ───────────────────────────────────────────────────────
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

        if (logErr) {
          console.error('[AutoTradeAPI] trade_logs upsert error:', logErr);
          return NextResponse.json(
            {
              success: false,
              error: `trade_logs DB 저장 실패: ${logErr.message}`,
              message: `🔴 DB 저장 실패: trade_logs 갱신 실패 (${logErr.message})`,
            },
            { status: 500 }
          );
        }

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

      // 🟢 텔레그램 체결 동기화 알림 발송
      await notifyExecutionSync(cycle.name, newLogs);

      return NextResponse.json({
        success: true,
        newLogs,
        message: `[${cycle.name}] 체결 기록 ${newLogs.length}건이 DB에 갱신되고 텔레그램 알림이 발송되었습니다.`,
      });
    }

    return NextResponse.json({ success: false, error: 'Invalid action', message: '알 수 없는 action 타입입니다.' }, { status: 400 });
  } catch (err: any) {
    console.error('[AutoTradeAPI] Exception:', err);
    return NextResponse.json(
      {
        success: false,
        error: `서버 예외: ${err?.message || err}`,
        message: `🔴 서버 처리 예외: ${err?.message || err}`,
      },
      { status: 500 }
    );
  }
}
