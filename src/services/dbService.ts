// -------------------------------------------------------
// Supabase DB 서비스 (CRUD & 초기 데이터 마이그레이션)
// -------------------------------------------------------

import { supabase } from '@/lib/supabase';
import type { AppSettings, AutoOrder, Cycle, DailyRecord, TradeLog } from '@/types/cycle';
import initialCyclesData from '@/data/cycles.json';

const DEFAULT_SETTINGS: AppSettings = {
  is_global_auto_trade: false,
  toss_app_key: '',
  toss_app_secret: '',
  toss_account_no: '',
  telegram_bot_token: '',
  telegram_chat_id: '',
  auto_trade_time: '22:30',
};

/**
 * DB 데이터 초기 이식 (Seeding)
 * 테이블에 데이터가 없는 경우 src/data/cycles.json 데이터를 Supabase로 이식합니다.
 */
export async function seedInitialDataIfEmpty(): Promise<void> {
  try {
    // 1. cycles 테이블 존재/데이터 여부 확인
    const { data: existingCycles, error: checkErr } = await supabase
      .from('cycles')
      .select('id')
      .limit(1);

    if (!checkErr && existingCycles && existingCycles.length === 0) {
      console.log('[DB Seeding] Initializing DB with initial data...');
      const cyclesToInsert = (initialCyclesData as Cycle[]).map((c) => ({
        id: c.id,
        name: c.name,
        ticker: c.ticker,
        version: c.version,
        split_count: c.splitCount,
        max_percent: c.maxPercent,
        principal: c.principal,
        compound_mode: c.compoundMode,
        status: c.status,
        start_date: c.startDate,
        commission_rate: c.commissionRate,
        auto_trade_enabled: true,
      }));

      const { error: insertCycleErr } = await supabase.from('cycles').insert(cyclesToInsert);
      if (insertCycleErr) {
        console.warn('[DB Seeding] Failed to insert cycles:', insertCycleErr.message);
      }

      // trade_logs 수집 및 이식
      const allLogs: any[] = [];
      (initialCyclesData as Cycle[]).forEach((c) => {
        c.logs.forEach((l) => {
          allLogs.push({
            id: l.id,
            cycle_id: c.id,
            date: l.date,
            type: l.type,
            order_type: l.orderType,
            price: l.price,
            qty: l.qty,
            memo: l.memo,
            profit: l.profit,
            commission_rate: l.commissionRate,
            batch_id: l.batchId,
          });
        });
      });

      if (allLogs.length > 0) {
        const { error: insertLogsErr } = await supabase.from('trade_logs').insert(allLogs);
        if (insertLogsErr) {
          console.warn('[DB Seeding] Failed to insert trade_logs:', insertLogsErr.message);
        }
      }
    }

    // 2. app_settings 데이터 여부 확인
    const { data: settingsData } = await supabase.from('app_settings').select('id').limit(1);
    if (settingsData && settingsData.length === 0) {
      await supabase.from('app_settings').insert([{
        id: 'default_settings',
        ...DEFAULT_SETTINGS,
      }]);
    }
  } catch (err) {
    console.warn('[DB Seeding] Skipped or failed seeding:', err);
  }
}

/**
 * DB에서 전체 사이클 및 체결 내역 조회 (프론트엔드 Cycle[] 형식 변환)
 */
export async function fetchCycles(): Promise<Cycle[]> {
  try {
    await seedInitialDataIfEmpty();

    const { data: dbCycles, error: cycleErr } = await supabase
      .from('cycles')
      .select('*')
      .order('created_at', { ascending: false });

    if (cycleErr) {
      console.error('[DBService] Fetch cycles DB query failed:', cycleErr.message);
      return [];
    }

    if (!dbCycles || dbCycles.length === 0) {
      return [];
    }

    const { data: dbLogs } = await supabase
      .from('trade_logs')
      .select('*')
      .order('date', { ascending: true });

    const logsMap = new Map<string, TradeLog[]>();
    (dbLogs || []).forEach((row: any) => {
      const log: TradeLog = {
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
      };
      const existing = logsMap.get(row.cycle_id) || [];
      existing.push(log);
      logsMap.set(row.cycle_id, existing);
    });

    return dbCycles.map((row: any) => ({
      id: row.id,
      uid: row.uid,
      name: row.name,
      ticker: row.ticker,
      version: row.version,
      splitCount: row.split_count ?? 40,
      maxPercent: row.max_percent ?? 20,
      principal: row.principal ?? 0,
      compoundMode: row.compound_mode ?? null,
      status: row.status ?? 'active',
      startDate: row.start_date,
      commissionRate: row.commission_rate ?? 0.1,
      autoTradeEnabled: row.auto_trade_enabled ?? true,
      logs: logsMap.get(row.id) || [],
    }));
  } catch (err: any) {
    console.error('[DBService] Fetch cycles exception:', err?.message || err);
    return [];
  }
}

/**
 * 사이클 생성 및 수정 저장
 */
export async function saveCycle(cycle: Cycle): Promise<boolean> {
  try {
    const payload = {
      id: cycle.id,
      name: cycle.name,
      ticker: (cycle.ticker || '').toUpperCase(),
      version: cycle.version,
      split_count: cycle.splitCount,
      max_percent: cycle.maxPercent,
      principal: cycle.principal,
      compound_mode: cycle.compoundMode,
      status: cycle.status || 'active',
      start_date: cycle.startDate || new Date().toISOString().slice(0, 10),
      commission_rate: cycle.commissionRate ?? 0.1,
      auto_trade_enabled: cycle.autoTradeEnabled ?? true,
      is_active: cycle.status === 'active',
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from('cycles').upsert(payload);
    if (error) {
      console.error('[DBService] saveCycle error:', error.message);
      return false;
    }

    if (cycle.logs && cycle.logs.length > 0) {
      const logsPayload = cycle.logs.map((l) => ({
        id: l.id,
        cycle_id: cycle.id,
        date: l.date,
        type: l.type,
        order_type: l.orderType,
        price: l.price,
        qty: l.qty,
        memo: l.memo ?? null,
        profit: l.profit ?? null,
        commission_rate: l.commissionRate ?? cycle.commissionRate,
        batch_id: l.batchId || l.id,
      }));
      const { error: logsErr } = await supabase.from('trade_logs').upsert(logsPayload);
      if (logsErr) {
        console.warn('[DBService] trade_logs upsert warning:', logsErr.message);
      }
    }

    console.log(`✅ [DBService] saveCycle succeeded for ${cycle.name} (${cycle.ticker})`);
    return true;
  } catch (err: any) {
    console.error('[DBService] saveCycle exception:', err?.message || err);
    return false;
  }
}

/**
 * 체결 내역(TradeLog) 신규 생성 및 수정
 */
export async function addTradeLog(log: TradeLog): Promise<boolean> {
  try {
    const payload = {
      id: log.id,
      cycle_id: log.cycleId,
      date: log.date,
      type: log.type,
      order_type: log.orderType,
      price: log.price,
      qty: log.qty,
      memo: log.memo,
      profit: log.profit,
      commission_rate: log.commissionRate,
      batch_id: log.batchId,
    };

    const { error } = await supabase.from('trade_logs').upsert(payload);
    if (error) {
      console.warn('[DBService] addTradeLog error:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[DBService] addTradeLog failed:', err);
    return false;
  }
}

/**
 * 사이클 삭제
 */
export async function deleteCycleFromDb(id: string): Promise<boolean> {
  try {
    await supabase.from('daily_records').delete().eq('cycle_id', id);
    await supabase.from('auto_orders').delete().eq('cycle_id', id);
    await supabase.from('trade_logs').delete().eq('cycle_id', id);
    const { error } = await supabase.from('cycles').delete().eq('id', id);
    if (error) {
      console.error('[DBService] deleteCycleFromDb error:', error.message);
      return false;
    }
    console.log(`✅ [DBService] deleteCycleFromDb succeeded for cycle id: ${id}`);
    return true;
  } catch (err: any) {
    console.error('[DBService] deleteCycleFromDb exception:', err?.message || err);
    return false;
  }
}

/**
 * 앱 전역 자동매매 & 토스/텔레그램 설정 조회 (ID 무관 첫 행 유연 조회)
 */
export async function getAppSettings(): Promise<AppSettings> {
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      return DEFAULT_SETTINGS;
    }

    return {
      id: data.id,
      is_global_auto_trade: data.is_global_auto_trade ?? data.isGlobalAutoTrade ?? false,
      toss_app_key: data.toss_app_key ?? data.tossAppKey ?? '',
      toss_app_secret: data.toss_app_secret ?? data.tossAppSecret ?? '',
      toss_account_no: data.toss_account_no ?? data.tossAccountNo ?? '',
      telegram_bot_token: data.telegram_bot_token ?? data.telegramBotToken ?? '',
      telegram_chat_id: data.telegram_chat_id ?? data.telegramChatId ?? '',
      auto_trade_time: data.auto_trade_time ?? data.autoTradeTime ?? '22:30',
      pin_code: data.pin_code ?? data.pinCode ?? '1234',
      updated_at: data.updated_at,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/**
 * 앱 전역 자동매매 & 토스/텔레그램 설정 저장
 */
export async function updateAppSettings(settings: Partial<AppSettings>): Promise<AppSettings> {
  try {
    const current = await getAppSettings();
    const payload = {
      id: current.id || 'default_settings',
      ...current,
      ...settings,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('app_settings')
      .upsert(payload)
      .select('*')
      .single();

    if (error || !data) {
      return { ...current, ...settings };
    }

    return {
      id: data.id,
      is_global_auto_trade: data.is_global_auto_trade ?? false,
      toss_app_key: data.toss_app_key ?? '',
      toss_app_secret: data.toss_app_secret ?? '',
      toss_account_no: data.toss_account_no ?? '',
      telegram_bot_token: data.telegram_bot_token ?? '',
      telegram_chat_id: data.telegram_chat_id ?? '',
      auto_trade_time: data.auto_trade_time ?? '22:30',
      updated_at: data.updated_at,
    };
  } catch (err) {
    console.warn('[DBService] updateAppSettings failed:', err);
    return { ...DEFAULT_SETTINGS, ...settings };
  }
}

/**
 * 자동 주문 내역 DB 저장 (`auto_orders` 테이블)
 */
export async function saveAutoOrder(order: AutoOrder): Promise<boolean> {
  try {
    const payload = {
      cycle_id: order.cycle_id,
      ticker: order.ticker,
      order_type: order.order_type,
      side: order.side,
      price: order.price,
      qty: order.qty,
      status: order.status,
      order_response: order.order_response ?? null,
      created_at: new Date().toISOString(),
    };

    const { error } = await supabase.from('auto_orders').insert(payload);
    if (error) {
      console.warn('[DBService] saveAutoOrder error:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[DBService] saveAutoOrder failed:', err);
    return false;
  }
}

/**
 * 일별 장 마감 시세 기록 DB 저장 (`daily_records` 테이블)
 */
export async function saveDailyRecord(record: DailyRecord): Promise<boolean> {
  try {
    const payload = {
      cycle_id: record.cycle_id,
      ticker: record.ticker,
      date: record.date,
      close_price: record.close_price,
      change_percent: record.change_percent,
      avg_price: record.avg_price,
      holding_qty: record.holding_qty,
      current_t: record.current_t,
      phase: record.phase,
      realized_profit: record.realized_profit,
      created_at: new Date().toISOString(),
    };

    const { error } = await supabase.from('daily_records').upsert(payload, { onConflict: 'cycle_id,date' });
    if (error) {
      // 테이블이 아직 없는 경우 경고 로그만 남기고 차단되지 않도록 처리
      console.warn('[DBService] saveDailyRecord warning/fallback:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[DBService] saveDailyRecord exception:', err);
    return false;
  }
}

/**
 * 일별 장 마감 시세 기록 DB 조회 (`daily_records` 테이블)
 */
export async function fetchDailyRecords(cycleId?: string): Promise<DailyRecord[]> {
  try {
    let query = supabase.from('daily_records').select('*').order('date', { ascending: true });
    if (cycleId) {
      query = query.eq('cycle_id', cycleId);
    }
    const { data, error } = await query;
    if (error || !data) return [];

    return data.map((row: any) => ({
      id: row.id,
      cycle_id: row.cycle_id,
      ticker: row.ticker,
      date: row.date,
      close_price: row.close_price,
      change_percent: row.change_percent,
      avg_price: row.avg_price,
      holding_qty: row.holding_qty,
      current_t: row.current_t,
      phase: row.phase,
      realized_profit: row.realized_profit,
      created_at: row.created_at,
    }));
  } catch {
    return [];
  }
}
