// -------------------------------------------------------
// 텔레그램 알림 서비스 (Telegram Bot Integration)
// 🔒 보안 가드레일 & 상세 에러 진단 반환 지원
// -------------------------------------------------------

import { getAppSettings } from '@/services/dbService';
import { supabaseAdmin } from '@/lib/supabase';
import type { Order, TradeLog } from '@/types/cycle';

export interface TelegramSendResult {
  success: boolean;
  statusCode?: number;
  error?: string;
}

/**
 * 텔레그램 메세지 전송 공통 함수 (상세 에러 진단 반환 & ID 유연 조회)
 */
export async function sendTelegramMessageDetailed(
  message: string,
  botToken?: string,
  chatId?: string
): Promise<TelegramSendResult> {
  try {
    const settings = await getAppSettings();

    let dbToken = settings.telegram_bot_token || process.env.TELEGRAM_BOT_TOKEN;
    let authorizedChatId = settings.telegram_chat_id || process.env.TELEGRAM_CHAT_ID;

    // 만약 dbToken이 미검색되었다면 ID와 무관하게 app_settings DB 첫 행 수집 (service role 사용)
    if (!dbToken || !authorizedChatId) {
      const { data: rawAdminRow } = await supabaseAdmin
        .from('app_settings')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (rawAdminRow) {
        dbToken = dbToken || rawAdminRow.telegram_bot_token || rawAdminRow.telegramBotToken;
        authorizedChatId = authorizedChatId || rawAdminRow.telegram_chat_id || rawAdminRow.telegramChatId;
      }
    }

    const token = botToken || dbToken;
    const targetChatId = chatId || authorizedChatId;

    if (!token) {
      return { success: false, error: '텔레그램 Bot Token이 설정되지 않았습니다 (app_settings DB 확인 필요).' };
    }
    if (!targetChatId) {
      return { success: false, error: '텔레그램 Chat ID가 설정되지 않았습니다 (app_settings DB 확인 필요).' };
    }

    // 🔒 보안 가드레일: 텔레그램 Chat ID 100% 본인 검증
    if (authorizedChatId && targetChatId !== authorizedChatId) {
      const err = `[보안 차단] 미인가 Telegram Chat ID 시도: ${targetChatId} (등록된 허용 ID: ${authorizedChatId})`;
      console.warn(err);
      return { success: false, error: err };
    }

    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: targetChatId,
        text: message,
        parse_mode: 'HTML',
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      const errorMsg = `텔레그램 API HTTP ${res.status}: ${errText}`;
      console.warn('[TelegramService] Message send failed:', errorMsg);
      return {
        success: false,
        statusCode: res.status,
        error: errorMsg,
      };
    }

    return { success: true };
  } catch (err: any) {
    const msg = `텔레그램 통신 예외: ${err?.message || err}`;
    console.warn('[TelegramService] Exception:', msg);
    return { success: false, error: msg };
  }
}

/**
 * 텔레그램 메세지 전송 기본 불리언 함수
 */
export async function sendTelegramMessage(
  message: string,
  botToken?: string,
  chatId?: string
): Promise<boolean> {
  const result = await sendTelegramMessageDetailed(message, botToken, chatId);
  return result.success;
}

/**
 * 1. 자동매매 On/Off 상태 변경 알림
 */
export async function notifyAutoTradeStatus(
  cycleName: string,
  status: boolean,
  isGlobal = false
): Promise<boolean> {
  const targetText = isGlobal ? '전역 자동매매 설정' : `사이클 [${cycleName}]`;
  const statusText = status ? '🟢 [ON / 활성화]' : '🔴 [OFF / 중지]';
  const message =
    `🤖 <b>[루프 자동매매 알림]</b>\n\n` +
    `대상: <b>${targetText}</b>\n` +
    `상태: <b>${statusText}</b>\n` +
    `변경 시각: ${new Date().toLocaleString('ko-KR')}`;

  return sendTelegramMessage(message);
}

/**
 * 2. 장전 자동주문 제출 알림 (상세 결과 반환)
 */
export async function notifyOrdersSubmittedDetailed(
  cycleName: string,
  orders: Order[]
): Promise<TelegramSendResult> {
  if (orders.length === 0) {
    const msg = `📋 <b>[장전 자동주문 알림]</b>\n\n사이클: <b>${cycleName}</b>\n제출 예정 주문이 없습니다.`;
    return sendTelegramMessageDetailed(msg);
  }

  const orderLines = orders
    .map((o) => {
      const side = o.type === 'buy' ? '🔵 매수' : '🔴 매도';
      const priceStr = o.price === 0 ? 'MOC' : `$${(o.price / 100).toFixed(2)}`;
      return `• ${side} | ${o.label} — <b>${priceStr}</b> × ${o.qty}주`;
    })
    .join('\n');

  const message =
    `📋 <b>[장전 자동주문 제출 완료]</b>\n\n` +
    `사이클: <b>${cycleName}</b>\n` +
    `제출 시각: ${new Date().toLocaleTimeString('ko-KR')}\n` +
    `총 주문 건수: <b>${orders.length}건</b>\n\n` +
    `<b>[주문 목록]</b>\n` +
    orderLines;

  return sendTelegramMessageDetailed(message);
}

export async function notifyOrdersSubmitted(
  cycleName: string,
  orders: Order[]
): Promise<boolean> {
  const res = await notifyOrdersSubmittedDetailed(cycleName, orders);
  return res.success;
}

/**
 * 3. 장 마감 후 체결 갱신(동기화) 알림
 */
export async function notifyExecutionSync(
  cycleName: string,
  logs: TradeLog[]
): Promise<boolean> {
  const logCount = logs.length;
  const logLines = logs
    .slice(0, 5)
    .map((l) => {
      const side = l.type === 'buy' ? '매수' : '매도';
      const priceStr = `$${(l.price / 100).toFixed(2)}`;
      return `• ${l.date} | ${side}(${l.orderType}) <b>${priceStr}</b> × ${l.qty}주`;
    })
    .join('\n');

  const message =
    `🔄 <b>[장마감 체결 동기화 완료]</b>\n\n` +
    `사이클: <b>${cycleName}</b>\n` +
    `신규 체결 갱신: <b>${logCount}건</b>\n` +
    `동기화 시각: ${new Date().toLocaleTimeString('ko-KR')}\n\n` +
    `<b>[최근 체결 내역]</b>\n` +
    (logLines || '• 갱신된 신규 체결 건이 없습니다.');

  return sendTelegramMessage(message);
}
