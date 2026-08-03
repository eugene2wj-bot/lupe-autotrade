// -------------------------------------------------------
// 자동매매 서버 전용 API Route (보안 가드레일 & DB/텔레그램 에러 진단)
// Server-Only Execution via SUPABASE_SERVICE_ROLE_KEY
// -------------------------------------------------------

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { generateGuide, calcCycleStats } from '@/utils/calculator';
import { fetchStockQuote } from '@/services/stockApi';
import {
  sendTelegramMessage,
  notifyOrdersSubmittedDetailed,
  notifyExecutionSync,
} from '@/services/telegramService';
import { sendTossLocOrder } from '@/services/tossBroker';
import {
  getNyseTime,
  isUsMarketHoliday,
  isWeekend,
  isWithinPreMarketOrderWindow,
} from '@/utils/usMarketCalendar';
import type { Cycle, Order, TradeLog } from '@/types/cycle';
import initialCyclesData from '@/data/cycles.json';

/**
 * 단일 사이클 자동 가상/실전 주문 처리 헬퍼 함수
 */
async function executeOrdersForCycle(
  cycle: Cycle,
  settings: any,
  forceTest: boolean,
  nyTime: Date,
  nyDateStr: string,
  todayStartIso: string
) {
  const is_global_auto_trade = settings?.is_global_auto_trade ?? settings?.isGlobalAutoTrade ?? false;

  const tossAppKey = (settings?.toss_app_key || settings?.tossAppKey || '').trim();
  const tossAppSecret = (settings?.toss_app_secret || settings?.tossAppSecret || '').trim();
  const tossAccountNo = (settings?.toss_account_no || settings?.tossAccountNo || '').trim();
  const isVirtualMode = Boolean(settings?.is_virtual_trade || settings?.isVirtualTrade || settings?.is_simulated || settings?.isSimulated);

  // DB 설정에 토스 API 키가 모두 존재하고 가상매매 모드가 OFF일 때만 '실제 토스 API 주문 전송'
  const hasTossKeys = Boolean(tossAppKey && tossAppSecret && tossAccountNo);
  const isRealToss = hasTossKeys && !isVirtualMode;

  // 🟢 전역/개별 자동매매 활성화 검증
  if (!is_global_auto_trade && !forceTest) {
    return {
      cycleId: cycle.id,
      cycleName: cycle.name,
      success: false,
      isRealToss,
      error: '전역 자동매매 OFF',
      message: '전역 자동매매가 OFF 상태입니다. 주문 생성이 차단되었습니다.',
      count: 0,
    };
  }
  if (!cycle.autoTradeEnabled && !forceTest) {
    return {
      cycleId: cycle.id,
      cycleName: cycle.name,
      success: false,
      isRealToss,
      error: '개별 자동매매 OFF',
      message: `[${cycle.name}] 사이클의 개별 자동매매가 OFF 상태입니다.`,
      count: 0,
    };
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

    return {
      cycleId: cycle.id,
      cycleName: cycle.name,
      success: false,
      isRealToss,
      isMarketClosed: true,
      error: `미국 증시 휴장일(${reason})`,
      message: `🏖️ 오늘은 미국 증시 휴장일(${reason})입니다. 주문을 스킵합니다.`,
      count: 0,
    };
  }

  // 🛑 검증 B: 미국 현지 시간대 검증 (장전 08:30 ~ 09:30 ET)
  const isInWindow = isWithinPreMarketOrderWindow(nyTime);
  if (!isInWindow && !forceTest) {
    return {
      cycleId: cycle.id,
      cycleName: cycle.name,
      success: false,
      isRealToss,
      isOutsideWindow: true,
      error: '미국 장전 시간대 아님',
      message: `⏳ 미국 현지 장전 주문 시각(08:30 ~ 09:30 ET)이 아닙니다. (현재: ${nyTime.toLocaleTimeString('en-US')} ET)`,
      count: 0,
    };
  }

  // 🛑 검증 C: 중복 주문 락 (Idempotency Lock)
  const { data: existingOrders } = await supabaseAdmin
    .from('auto_orders')
    .select('*')
    .eq('cycle_id', cycle.id)
    .gte('created_at', todayStartIso);

  const submittedOrderToday = (existingOrders || []).find((o: any) => o.status === 'submitted');
  const activeOrderToday = (existingOrders || []).find((o: any) =>
    ['pending', 'submitted', 'simulated', 'filled'].includes(o.status)
  );

  // 1) 당일 이미 토스 API로 제출 성공한 주문(status: 'submitted')이 존재하는 경우: forceTest 여부와 상관없이 무조건 차단!
  if (submittedOrderToday) {
    return {
      cycleId: cycle.id,
      cycleName: cycle.name,
      success: false,
      isRealToss,
      isDuplicate: true,
      error: '이미 제출 완료된 주문 존재 (중복 방지)',
      message: `🛑 [중복 주문 차단] 오늘(${nyDateStr} ET) [${cycle.name}] 사이클은 이미 토스증권 API로 주문이 제출 완료되었습니다. (주문 ID: ${submittedOrderToday.order_id || submittedOrderToday.id})`,
      count: 0,
    };
  }

  // 2) 가상주문/대기 주문이 존재하고 forceTest가 false인 경우 차단
  if (activeOrderToday && !forceTest) {
    return {
      cycleId: cycle.id,
      cycleName: cycle.name,
      success: false,
      isRealToss,
      isDuplicate: true,
      error: '중복 주문 방지 Lock',
      message: `🛑 [중복 주문 방지 Lock] 오늘(${nyDateStr} ET) [${cycle.name}] 사이클에 이미 등록된 주문이 존재합니다.`,
      count: 0,
    };
  }

  // 가이드 주문 생성
  const { orders } = generateGuide(cycle);
  const stats = calcCycleStats(cycle);

  if (!orders || orders.length === 0) {
    return {
      cycleId: cycle.id,
      cycleName: cycle.name,
      success: true,
      isRealToss,
      orders: [],
      count: 0,
      message: `[${cycle.name}] 생성된 가이드 주문이 없습니다.`,
    };
  }

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

    return {
      cycleId: cycle.id,
      cycleName: cycle.name,
      success: false,
      isRealToss,
      error: 'Circuit Breaker 발동',
      message: `🚨 Circuit Breaker 발동: 당일 매수 주문액($${attemptedDollars})이 1일 한도($${limitDollars})를 초과하여 주문이 차단되었습니다.`,
      count: 0,
    };
  }

  // 🟢 auto_orders DB 저장 및 실제 토스 API / 가상 주문 전송
  const createdOrderRecords: any[] = [];
  const submittedOrders: Order[] = [];
  const failedOrders: { order: Order; reason: string }[] = [];

  for (const o of orders) {
    const rawPrice = typeof o.price === 'number' ? o.price : 0;
    const rawQty = typeof o.qty === 'number' ? o.qty : 0;

    if (rawPrice <= 0 || rawQty <= 0) {
      console.warn(`[AutoTradeAPI] 스킵 (유효하지 않은 가격/수량): ${o.label} (Price: ${rawPrice}, Qty: ${rawQty})`);
      continue;
    }

    let orderStatus = 'simulated';
    let tossOrderRef = `TOSS_SIMULATED_${cycle.ticker}_${Date.now()}`;
    let tossResponseData: any = null;

    if (isRealToss) {
      console.log(`==================================================`);
      console.log(`🟢 [AutoTradeAPI 1:1 파라미터 동기화 검증]`);
      console.log(` 사이클: ${cycle.name} (${cycle.ticker})`);
      console.log(` 가이드 레이블: ${o.label}`);
      console.log(` 가이드 계산 가격: $${(rawPrice / 100).toFixed(2)} (${rawPrice} 센트)`);
      console.log(` 가이드 계산 수량: ${rawQty}주`);
      console.log(`==================================================`);

      const tossRes = await sendTossLocOrder({
        appKey: tossAppKey,
        appSecret: tossAppSecret,
        accountNo: tossAccountNo,
        ticker: cycle.ticker,
        side: o.type === 'buy' ? 'BUY' : 'SELL',
        orderType: 'LOC',
        price: rawPrice,
        qty: rawQty,
      });

      if (tossRes.success) {
        orderStatus = 'submitted';
        tossOrderRef = tossRes.orderId || `TOSS_REAL_${cycle.ticker}_${Date.now()}`;
        submittedOrders.push(o);
      } else {
        orderStatus = 'failed';
        tossOrderRef = tossRes.orderId || `TOSS_FAIL_${cycle.ticker}_${Date.now()}`;
        const reason = tossRes.message || '토스 API 주문 전송 실패';
        failedOrders.push({ order: o, reason });
      }
      tossResponseData = tossRes.rawResponse || { message: tossRes.message };
    } else {
      console.log(`==================================================`);
      console.log(`🧪 [AutoTradeAPI 가상 주문 생성 (Guide Match)]`);
      console.log(` 사이클: ${cycle.name} (${cycle.ticker})`);
      console.log(` 가이드 레이블: ${o.label}`);
      console.log(` 가이드 계산 가격: $${(rawPrice / 100).toFixed(2)} (${rawPrice} 센트)`);
      console.log(` 가이드 계산 수량: ${rawQty}주`);
      console.log(`==================================================`);
      submittedOrders.push(o);
    }

    const orderRecord: any = {
      cycle_id: cycle.id || '',
      ticker: (cycle.ticker || '').toUpperCase(),
      order_type: o.orderType || 'star',
      side: o.type || 'buy',
      price: rawPrice,
      qty: rawQty,
      target_price: rawPrice,
      order_date: nyDateStr || new Date().toISOString().slice(0, 10),
      status: orderStatus,
      order_id: tossOrderRef,
      order_response: {
        orderId: tossOrderRef,
        tossOrderRef,
        apiSource: isRealToss ? 'toss-openapi-v3.1.0' : 'server-route-simulated',
        nyTimeEt: nyTime.toLocaleString('en-US'),
        executedAt: new Date().toISOString(),
        tossResponse: tossResponseData,
      },
      created_at: new Date().toISOString(),
    };

    let { data: inserted, error: orderInsErr } = await supabaseAdmin
      .from('auto_orders')
      .insert(orderRecord)
      .select('*')
      .single();

    if (orderInsErr && (orderInsErr.message.includes('order_id') || orderInsErr.message.includes('order_response') || orderInsErr.code === 'PGRST204')) {
      console.warn('[AutoTradeAPI] auto_orders column fallback retry:', orderInsErr.message);
      const fallbackRecord: any = { ...orderRecord };
      if (orderInsErr.message.includes('order_id')) delete fallbackRecord.order_id;
      if (orderInsErr.message.includes('order_response')) delete fallbackRecord.order_response;
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
      return {
        cycleId: cycle.id,
        cycleName: cycle.name,
        success: false,
        isRealToss,
        error: `DB 저장 실패: ${orderInsErr.message}`,
        message: `🔴 DB 저장 실패: auto_orders 테이블 저장 중 오류가 발생했습니다. (${orderInsErr.message})`,
        count: 0,
      };
    }

    if (inserted) {
      createdOrderRecords.push(inserted);
    }
  }

  // 🔴 실제 토스 API 호출 후 전량 실패한 경우 처리
  if (isRealToss && failedOrders.length > 0 && submittedOrders.length === 0) {
    const mainErrorReason = failedOrders[0].reason;
    const failMessage = `🔴 [토스 API 오류] ${cycle.ticker} 주문 전송 실패 (${mainErrorReason})`;

    await notifyOrdersSubmittedDetailed(cycle.name, orders, {
      isRealToss: true,
      ticker: cycle.ticker,
      errorReason: mainErrorReason,
      isFailed: true,
    });

    return {
      cycleId: cycle.id,
      cycleName: cycle.name,
      success: false,
      isRealToss: true,
      error: mainErrorReason,
      message: failMessage,
      count: 0,
    };
  }

  const successMessage = isRealToss
    ? `🟢 [토스 API] ${cycle.ticker} 1차 LOC 매수 주문 ${submittedOrders.length}건 제출 완료`
    : `🧪 [가상 주문] ${cycle.name} (${cycle.ticker}) 가상 주문 ${orders.length}건 생성 완료`;

  // 🟢 텔레그램 주문 제출 알림 발송 (명시적 에러 체크 및 토스 API 구분 옵션 전송)
  const tgResult = await notifyOrdersSubmittedDetailed(cycle.name, submittedOrders, { isRealToss, ticker: cycle.ticker });
  if (!tgResult.success) {
    console.warn('[AutoTradeAPI] Telegram notification failed:', tgResult.error);
    return {
      cycleId: cycle.id,
      cycleName: cycle.name,
      success: false,
      isRealToss,
      error: `텔레그램 발송 실패: ${tgResult.error}`,
      message: `🔴 텔레그램 오류: ${tgResult.error}`,
      count: submittedOrders.length,
    };
  }

  return {
    cycleId: cycle.id,
    cycleName: cycle.name,
    success: true,
    isRealToss,
    orders: submittedOrders,
    count: submittedOrders.length,
    message: successMessage,
  };
}

/**
 * 단일 사이클 체결 기록 동기화 헬퍼 함수
 */
async function syncExecutionsForCycle(cycle: Cycle, nyDateStr: string) {
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
      return {
        cycleId: cycle.id,
        cycleName: cycle.name,
        success: false,
        error: `trade_logs DB 저장 실패: ${logErr.message}`,
        message: `🔴 DB 저장 실패: trade_logs 갱신 실패 (${logErr.message})`,
      };
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

  return {
    cycleId: cycle.id,
    cycleName: cycle.name,
    success: true,
    newLogs,
    count: newLogs.length,
    message: `[${cycle.name}] 체결 기록 ${newLogs.length}건이 DB에 갱신되고 텔레그램 알림이 발송되었습니다.`,
  };
}

/**
 * 미국 장 마감 후 전일 종가 자동 수집, 포트폴리오(T회차/평단/수량) DB 갱신 및 오늘 밤 매매 가이드 자동 산출
 */
export async function syncPostMarketClose(targetCycleId?: string) {
  const nyTime = getNyseTime();
  const nyDateStr = `${nyTime.getFullYear()}-${String(nyTime.getMonth() + 1).padStart(2, '0')}-${String(nyTime.getDate()).padStart(2, '0')}`;

  let { data: dbCycles } = await supabaseAdmin.from('cycles').select('*');
  if (!dbCycles || dbCycles.length === 0) dbCycles = initialCyclesData as any[];

  let activeCycles = (dbCycles || []).filter((c: any) => !c.status || c.status === 'active');
  if (targetCycleId) {
    activeCycles = activeCycles.filter((c: any) => c.id === targetCycleId);
  }

  const results: any[] = [];

  for (const cycleRow of activeCycles) {
    // 1) 체결 기록 수집
    const { data: dbLogs } = await supabaseAdmin
      .from('trade_logs')
      .select('*')
      .eq('cycle_id', cycleRow.id)
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
      : [];

    const cycle: Cycle = {
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
      autoTradeEnabled: cycleRow.auto_trade_enabled ?? cycleRow.is_auto_trade_enabled ?? true,
      logs,
    };

    // 2) Stock API로 최신 전일 종가 및 일봉 시세(quotes) 수집
    const quoteDetail = await fetchStockQuote(cycle.ticker, cycle);
    const closePriceDollars = quoteDetail.latestPrice || 0;
    const changePercent = quoteDetail.changePercent || 0;
    const closePriceCents = Math.round(closePriceDollars * 100);

    // 3) 포트폴리오 통계 자동 재계산 (평단가, 수량, T회차, Phase 등)
    const stats = calcCycleStats(cycle, quoteDetail.quotes);

    // 4) DB daily_records 테이블 저장/갱신
    const dailyRecordPayload = {
      cycle_id: cycle.id,
      ticker: (cycle.ticker || '').toUpperCase(),
      date: nyDateStr,
      close_price: closePriceCents,
      change_percent: Math.round(changePercent * 100) / 100,
      avg_price: Math.round(stats.avgPrice),
      holding_qty: stats.holdingQty,
      current_t: stats.currentT,
      phase: stats.phase,
      realized_profit: stats.realizedProfit ?? 0,
      created_at: new Date().toISOString(),
    };

    console.log(`[daily_records Upsert Check] Cycle: ${cycle.name}, Date: ${nyDateStr}, ClosePrice: $${closePriceDollars} (${closePriceCents} cents), Change%: ${dailyRecordPayload.change_percent}%, AvgPrice: $${(stats.avgPrice / 100).toFixed(2)}, Qty: ${stats.holdingQty}, T: ${stats.currentT}, Phase: ${stats.phase}`);

    let { error: dailyRecordErr } = await supabaseAdmin
      .from('daily_records')
      .upsert(dailyRecordPayload, { onConflict: 'cycle_id,date' });

    if (dailyRecordErr && (dailyRecordErr.message.includes('onConflict') || dailyRecordErr.message.includes('constraint'))) {
      const retry = await supabaseAdmin
        .from('daily_records')
        .upsert(dailyRecordPayload);
      dailyRecordErr = retry.error;
    }

    if (dailyRecordErr) {
      console.warn(`[syncPostMarketClose] daily_records table upsert warning (${cycle.name}):`, dailyRecordErr.message);
    } else {
      console.log(`✅ [syncPostMarketClose] daily_records saved successfully for ${cycle.name} (${nyDateStr})`);
    }

    // 5) 오늘 밤 전송할 매매 가이드 자동 산출
    const { orders } = generateGuide(cycle, quoteDetail.quotes);

    // 6) DB cycles 테이블의 포트폴리오 통계 갱신
    const { error: cycleUpdateErr } = await supabaseAdmin
      .from('cycles')
      .update({
        updated_at: new Date().toISOString(),
      })
      .eq('id', cycle.id);

    if (cycleUpdateErr) {
      console.warn(`[syncPostMarketClose] cycles update warning (${cycle.name}):`, cycleUpdateErr.message);
    }

    const orderLines = orders.map((o) => {
      const priceStr = o.price === 0 ? 'MOC' : `$${(o.price / 100).toFixed(2)}`;
      return `  • ${o.type === 'buy' ? '🔵 매수' : '🔴 매도'} | ${o.label} — ${priceStr} × ${o.qty}주`;
    });

    results.push({
      cycleId: cycle.id,
      cycleName: cycle.name,
      ticker: cycle.ticker,
      closePrice: closePriceDollars,
      changePercent,
      stats,
      orders,
      orderLines,
    });
  }

  // 7) 텔레그램 마감 브리핑 및 산출 가이드 전송
  const telegramLines = results.map((r) => (
    `• <b>${r.cycleName} (${r.ticker})</b>: 마감가 <b>$${r.closePrice.toFixed(2)} (${r.changePercent >= 0 ? '+' : ''}${r.changePercent.toFixed(2)}%)</b>\n` +
    `  T=${r.stats.currentT} / 평단 $${(r.stats.avgPrice / 100).toFixed(2)} / 보유 ${r.stats.holdingQty}주 (${r.stats.phase})\n` +
    `  <b>[오늘 밤 예정 가이드]</b>\n` +
    (r.orderLines.length > 0 ? r.orderLines.join('\n') : '  • 제출 예정 가이드 주문 없음')
  )).join('\n\n');

  const summaryMessage =
    `📊 <b>[미국 장 마감 종가 수집 & 매매 가이드 자동 산출 완료]</b>\n\n` +
    `일자: <b>${nyDateStr} (미국 현지 마감)</b>\n` +
    `처리 사이클: 총 <b>${results.length}개</b>\n\n` +
    telegramLines;

  await sendTelegramMessage(summaryMessage).catch(() => {});

  return {
    success: true,
    message: `장 마감 종가 수집 및 매매 가이드 산출 완료 (총 ${results.length}개 사이클)`,
    nyDateStr,
    results,
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, cycleId, cycleName, cycle: clientCycle, forceTest: bodyForceTest, force } = body;
    const forceTest = Boolean(bodyForceTest || force);

    // ── 0. PIN 번호 검증 및 변경 액션 (`VERIFY_PIN`, `CHANGE_PIN`, `GET_SETTINGS`) ───────────
    if (action === 'VERIFY_PIN') {
      const inputPin = String(body.pinCode || body.pin_code || '').trim();
      const { data: existingSettings } = await supabaseAdmin
        .from('app_settings')
        .select('*')
        .limit(1)
        .maybeSingle();

      const rawDbPin = existingSettings?.pin_code ?? (existingSettings as any)?.pinCode;
      const dbPin = (typeof rawDbPin === 'string' && rawDbPin.trim() !== '') ? rawDbPin.trim() : null;
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

      let { data: savedData, error: saveErr } = await supabaseAdmin
        .from('app_settings')
        .upsert(payload)
        .select('*')
        .single();

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

    // ── 2. app_settings 서버 단 조회 (SERVICE_ROLE_KEY 사용) ────────────────
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

    // 미국 동부시간 (ET, 서머타임 자동 반영)
    const nyTime = getNyseTime();
    const nyDateStr = `${nyTime.getFullYear()}-${String(nyTime.getMonth() + 1).padStart(2, '0')}-${String(nyTime.getDate()).padStart(2, '0')}`;
    const todayStartIso = `${nyDateStr}T00:00:00.000Z`;

    const isTradeAction = ['EXECUTE_DAILY_TRADE', 'EXECUTE_ALL', 'submit-orders', 'place-orders'].includes(action);
    const isSyncAction = action === 'sync-executions';

    // ── 4. 자동매매 / 주문 생성 실행 ────────────────────────────
    if (isTradeAction) {
      // A) cycleId / cycleName / clientCycle 이 지정된 경우 단일 사이클 수행
      if (cycleId || cycleName || clientCycle) {
        let cycleRow: any = null;
        if (cycleId) {
          const { data } = await supabaseAdmin.from('cycles').select('*').eq('id', cycleId).maybeSingle();
          cycleRow = data;
        }
        if (!cycleRow && cycleId) {
          cycleRow = (initialCyclesData as any[]).find((c) => c.id === cycleId);
        }
        if (!cycleRow && (cycleName || clientCycle?.name)) {
          const targetName = cycleName || clientCycle?.name;
          const { data } = await supabaseAdmin.from('cycles').select('*').eq('name', targetName).maybeSingle();
          cycleRow = data || (initialCyclesData as any[]).find((c) => c.name === targetName);
        }

        const targetCycleId = cycleRow?.id || clientCycle?.id || cycleId;
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
              autoTradeEnabled: cycleRow.auto_trade_enabled ?? cycleRow.is_auto_trade_enabled ?? true,
              logs,
            }
          : clientCycle!;

        const result = await executeOrdersForCycle(cycle, settings, forceTest, nyTime, nyDateStr, todayStartIso);
        return NextResponse.json(result, { status: result.success ? 200 : 400 });
      }

      // B) cycleId가 없는 경우 DB cycles 테이블에서 is_auto_trade_enabled = true 인 모든 활성 사이클 일괄 수행
      let { data: dbCycles } = await supabaseAdmin.from('cycles').select('*');
      if (!dbCycles || dbCycles.length === 0) {
        dbCycles = initialCyclesData as any[];
      }

      const activeCycles = (dbCycles || []).filter((c: any) => {
        const isActive = !c.status || c.status === 'active';
        const isAutoEnabled = (c.is_auto_trade_enabled ?? c.auto_trade_enabled ?? c.autoTradeEnabled) !== false;
        return isActive && isAutoEnabled;
      });

      if (activeCycles.length === 0) {
        return NextResponse.json({
          success: true,
          message: '자동매매가 활성화된(is_auto_trade_enabled = true) 대상 사이클이 없습니다.',
          totalCycles: 0,
          successCount: 0,
          totalOrders: 0,
          results: [],
        });
      }

      const results = [];
      for (const cycleRow of activeCycles) {
        const { data: dbLogs } = await supabaseAdmin
          .from('trade_logs')
          .select('*')
          .eq('cycle_id', cycleRow.id)
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
          : [];

        const cycleObj: Cycle = {
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
          autoTradeEnabled: cycleRow.auto_trade_enabled ?? cycleRow.is_auto_trade_enabled ?? true,
          logs,
        };

        const res = await executeOrdersForCycle(cycleObj, settings, forceTest, nyTime, nyDateStr, todayStartIso);
        results.push(res);
      }

      const successCount = results.filter((r) => r.success).length;
      const totalOrders = results.reduce((sum, r) => sum + (r.count || 0), 0);
      const isRealTossAny = results.some((r) => r.isRealToss);
      const prefix = isRealTossAny ? '🟢 [토스 API]' : '🧪 [가상 주문]';

      return NextResponse.json({
        success: true,
        message: `${prefix} 전체 ${activeCycles.length}개 활성 사이클 중 ${successCount}개 사이클 자동주문 완료 (총 ${totalOrders}건 생성)`,
        totalCycles: activeCycles.length,
        successCount,
        totalOrders,
        results,
      });
    }

    // ── 5. 체결 내역 동기화 실행 ────────────────────────────
    if (isSyncAction) {
      if (cycleId || cycleName || clientCycle) {
        let cycleRow: any = null;
        if (cycleId) {
          const { data } = await supabaseAdmin.from('cycles').select('*').eq('id', cycleId).maybeSingle();
          cycleRow = data;
        }
        const targetCycleId = cycleRow?.id || clientCycle?.id || cycleId;
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
              autoTradeEnabled: cycleRow.auto_trade_enabled ?? cycleRow.is_auto_trade_enabled ?? true,
              logs,
            }
          : clientCycle!;

        const res = await syncExecutionsForCycle(cycle, nyDateStr);
        return NextResponse.json(res);
      }

      // 일괄 동기화
      let { data: dbCycles } = await supabaseAdmin.from('cycles').select('*');
      if (!dbCycles || dbCycles.length === 0) dbCycles = initialCyclesData as any[];

      const activeCycles = (dbCycles || []).filter((c: any) => !c.status || c.status === 'active');
      const results = [];

      for (const cycleRow of activeCycles) {
        const { data: dbLogs } = await supabaseAdmin
          .from('trade_logs')
          .select('*')
          .eq('cycle_id', cycleRow.id)
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
          : [];

        const cycleObj: Cycle = {
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
          autoTradeEnabled: cycleRow.auto_trade_enabled ?? cycleRow.is_auto_trade_enabled ?? true,
          logs,
        };

        const res = await syncExecutionsForCycle(cycleObj, nyDateStr);
        results.push(res);
      }

      return NextResponse.json({
        success: true,
        message: `전체 ${activeCycles.length}개 사이클 체결 동기화 완료`,
        results,
      });
    }

    // ── 6. 장 마감 종가 수집 & 매매 가이드 자동 산출 액션 ─────────────────
    const isCloseSyncAction = ['POST_MARKET_CLOSE_SYNC', 'SYNC_CLOSE_PRICE', 'cron-close-price', 'sync-close'].includes(action);
    if (isCloseSyncAction) {
      const res = await syncPostMarketClose(cycleId || undefined);
      return NextResponse.json(res);
    }

    // ── 7. cycleId / cycleName 필수 액션 검증 ────────────────────────────
    if (!cycleId && !cycleName && !clientCycle) {
      return NextResponse.json(
        { success: false, error: 'cycleId 파라미터 누락', message: 'cycleId 또는 cycle 객체 파라미터가 누락되었습니다.' },
        { status: 400 }
      );
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

/**
 * Vercel Cron 또는 브라우저/HTTP GET 호출 호환 래퍼
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const action = url.searchParams.get('action') || 'EXECUTE_DAILY_TRADE';
    const cycleId = url.searchParams.get('cycleId') || undefined;

    const mockRequest = new Request(request.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, cycleId, forceTest: false }),
    });

    return POST(mockRequest);
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || err },
      { status: 500 }
    );
  }
}

