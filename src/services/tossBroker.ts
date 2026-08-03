// -------------------------------------------------------
// 토스증권 API 서비스 브로커 (Toss Securities Broker)
// 🔒 보안 가드레일: 서버 전용 API Route (/api/auto-trade) 위임
// -------------------------------------------------------

import type { Cycle, Order, TradeLog } from '@/types/cycle';

export interface TossOrderResult {
  success: boolean;
  orderId?: string;
  message?: string;
  rawResponse?: any;
}

export interface TossOrderParams {
  appKey: string;
  appSecret: string;
  accountNo: string;
  ticker: string;
  side: 'BUY' | 'SELL';
  orderType: string;
  price: number; // 원화 센트 단위 (x100)
  qty: number;
}

/**
 * 토스증권 해외주식 LOC 매수/매도 API 직접 호출 헬퍼
 */
export async function sendTossLocOrder(params: TossOrderParams): Promise<TossOrderResult> {
  try {
    const url = 'https://openapi.tossinvest.com/v1/trading/orders/overseas';
    const dollarsPrice = params.price > 0 ? (params.price / 100).toFixed(2) : undefined;

    const bodyPayload = {
      accountNo: params.accountNo,
      ticker: params.ticker.toUpperCase(),
      side: params.side,
      orderType: params.orderType || 'LOC',
      price: dollarsPrice,
      qty: params.qty,
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-toss-app-key': params.appKey,
        'x-toss-app-secret': params.appSecret,
        'x-toss-account-no': params.accountNo,
      },
      body: JSON.stringify(bodyPayload),
    });

    const resData = await res.json().catch(() => ({}));
    if (res.ok && (resData.success !== false && !resData.error)) {
      return {
        success: true,
        orderId: resData.orderId || resData.orderRef || `TOSS_REAL_${params.ticker}_${Date.now()}`,
        message: resData.message || '토스 API LOC 주문 성공',
        rawResponse: resData,
      };
    } else {
      return {
        success: false,
        orderId: `TOSS_REAL_FALLBACK_${params.ticker}_${Date.now()}`,
        message: resData.message || resData.error || `HTTP ${res.status} 토스 API 응답`,
        rawResponse: resData,
      };
    }
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || '토스 API 통신 오류',
    };
  }
}

/**
 * 1. [🧪 토스 API 가상 주문 테스트] 전송 컨트롤러
 * - 보안 가드레일에 따라 서버 전용 API Route (/api/auto-trade)로 안전 위임
 * - Idempotency Lock (중복 주문 방지) 및 Circuit Breaker (1일 한도 1.5배) 서버 검증
 */
export async function submitSimulatedOrders(cycle: Cycle): Promise<{
  success: boolean;
  orders: Order[];
  count: number;
  message?: string;
}> {
  try {
    const res = await fetch('/api/auto-trade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'submit-orders',
        cycleId: cycle.id,
        cycleName: cycle.name,
        cycle: cycle, // 사이클 전체 객체 전달
        forceTest: true,
      }),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      return {
        success: false,
        orders: [],
        count: 0,
        message: data.message || '가상 주문 제출 중 서버 오류가 발생했습니다.',
      };
    }

    return {
      success: true,
      orders: data.orders || [],
      count: data.count || 0,
      message: data.message,
    };
  } catch (err: any) {
    return {
      success: false,
      orders: [],
      count: 0,
      message: err?.message || '네트워크 통신 중 오류가 발생했습니다.',
    };
  }
}

/**
 * 2. [🔄 체결 기록 동기화 테스트] 컨트롤러
 * - 서버 API Route (/api/auto-trade)를 통한 체결 동기화 및 텔레그램 리포팅
 */
export async function syncExecutions(cycle: Cycle): Promise<{
  success: boolean;
  newLogs: TradeLog[];
  message?: string;
}> {
  try {
    const res = await fetch('/api/auto-trade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'sync-executions',
        cycleId: cycle.id,
        cycleName: cycle.name,
        cycle: cycle, // 사이클 전체 객체 전달
      }),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      return {
        success: false,
        newLogs: [],
        message: data.message || '체결 동기화 중 서버 오류가 발생했습니다.',
      };
    }

    return {
      success: true,
      newLogs: data.newLogs || [],
      message: data.message,
    };
  } catch (err: any) {
    return {
      success: false,
      newLogs: [],
      message: err?.message || '네트워크 통신 중 오류가 발생했습니다.',
    };
  }
}

