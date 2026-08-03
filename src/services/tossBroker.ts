// -------------------------------------------------------
// 토스증권 API 서비스 브로커 (Toss Securities Broker)
// 토스증권 공식 OpenAPI 3.1.0 스펙 기반 브로커 엔진
// 🔒 보안 가드레일: 서버 전용 API Route (/api/auto-trade) 위임
// -------------------------------------------------------

import type { Cycle, Order, TradeLog } from '@/types/cycle';

export interface TossOrderResult {
  success: boolean;
  orderId?: string;
  errorCode?: string;
  message?: string;
  rawResponse?: any;
}

export interface TossOrderParams {
  appKey: string;
  appSecret: string;
  accountNo: string;
  ticker: string;
  side: 'BUY' | 'SELL';
  orderType?: string;
  price: number; // 원화 센트 단위 (x100)
  qty: number;
  clientOrderId?: string;
}

const TOSS_BASE_URL = 'https://openapi.tossinvest.com';

/**
 * Fixie Proxy (FIXIE_URL) 고정 IP 지원 HTTP Fetch 래퍼
 * - undici는 Node.js 전용 모듈로, 브라우저/SSR 페이지 렌더링 시 크래시 방지를 위해
 *   동적 import(lazy)로 호출 시점에만 로드합니다.
 * - ProxyAgent 생성 실패 시 기본 fetch로 안전 Fallback됩니다.
 */
async function tossFetch(url: string, options: RequestInit = {}): Promise<Response> {
  // 브라우저 환경에서는 프록시 없이 글로벌 fetch 사용
  if (typeof window !== 'undefined') {
    return fetch(url, options);
  }

  const fixieUrl = (
    process.env.FIXIE_URL ||
    process.env.FIXIE_URL_PROXY ||
    process.env.FIXIE_PROXY ||
    ''
  ).trim();

  if (fixieUrl) {
    console.log('🌐 [Fixie Proxy] 고정 IP 프록시를 통해 토스 API 호출 중...');
    try {
      // ⚠️ 동적 import: 모듈 최상단에서 로드하지 않아 클라이언트 크래시 방지
      const { ProxyAgent, fetch: undiciFetch } = await import('undici');
      const dispatcher = new ProxyAgent(fixieUrl);
      const res = await undiciFetch(url, {
        ...(options as any),
        dispatcher,
      });
      return res as unknown as Response;
    } catch (err: any) {
      console.error('⚠️ [Fixie Proxy Init Failed]', err?.message || err);
      console.warn('[Fixie Proxy] 기본 fetch로 Fallback 진행합니다.');
    }
  }

  return fetch(url, options);
}

/**
 * Vercel 백엔드 서버의 외향 Public IP (Outbound IP) 자동 조회
 */
export async function getOutboundServerIp(): Promise<string> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const res = await tossFetch('https://api.ipify.org?format=json', {
      signal: controller.signal,
      cache: 'no-store',
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data: any = await res.json();
      if (data.ip) return String(data.ip).trim();
    }
  } catch {
    try {
      const res2 = await tossFetch('https://ifconfig.me/ip', { cache: 'no-store' });
      if (res2.ok) {
        const text = await res2.text();
        if (text.trim()) return text.trim();
      }
    } catch {
      // ignore
    }
  }
  return '알 수 없음';
}

/**
 * 토스 API 오류 파싱 및 IP 차단(access_denied) 시 Vercel 서버 IP 포함 상세 메시지 생성
 */
async function formatTossError(rawCode?: string, rawMsg?: string): Promise<{ errorCode: string; message: string }> {
  const codeStr = String(rawCode || '').trim();
  const msgStr = String(rawMsg || '').trim();
  const combined = `${codeStr} ${msgStr}`.toLowerCase();

  const isIpBlocked =
    codeStr.includes('access_denied') ||
    combined.includes('ip address not allowed') ||
    combined.includes('not allowed ip') ||
    combined.includes('ip_not_allowed') ||
    combined.includes('ip차단') ||
    combined.includes('unauthorized ip');

  if (isIpBlocked) {
    const serverIp = await getOutboundServerIp();
    const formattedMsg = `🔴 [토스 API 오류] IP 차단됨! 토스증권 Open API 허용 IP 관리에 현재 Vercel 서버 IP (${serverIp})를 추가해 주세요. (원인: ${msgStr || codeStr})`;
    return {
      errorCode: codeStr || 'access_denied',
      message: formattedMsg,
    };
  }

  return {
    errorCode: codeStr || 'TOSS_API_ERROR',
    message: `${codeStr ? `${codeStr}: ` : ''}${msgStr || '토스 API 요청 실패'}`,
  };
}

/**
 * 1. OAuth2 토큰 발급 API (POST /oauth2/token)
 */
export async function getTossAccessToken(appKey: string, appSecret: string): Promise<{
  success: boolean;
  accessToken?: string;
  error?: string;
  rawResponse?: any;
}> {
  try {
    const url = `${TOSS_BASE_URL}/oauth2/token`;
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', appKey.trim());
    params.append('client_secret', appSecret.trim());

    const res = await tossFetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const data: any = await res.json().catch(() => ({}));
    if (res.ok && (data.access_token || data.result?.access_token)) {
      const token = data.access_token || data.result?.access_token;
      return {
        success: true,
        accessToken: token,
        rawResponse: data,
      };
    } else {
      const errCode = data.error?.code || data.error || `HTTP_${res.status}`;
      const errMsg = data.error?.message || data.error_description || data.message || `토스 OAuth2 토큰 발급 실패 (${res.status})`;
      const formatted = await formatTossError(errCode, errMsg);
      return {
        success: false,
        error: formatted.message,
        rawResponse: data,
      };
    }
  } catch (err: any) {
    return {
      success: false,
      error: `토스 OAuth2 토큰 발급 통신 예외: ${err?.message || err}`,
    };
  }
}

/**
 * 2. 계좌 식별자(accountSeq) 자동 조회 API (GET /api/v1/accounts)
 */
export async function getTossAccountSeq(accessToken: string, targetAccountNo?: string): Promise<{
  success: boolean;
  accountSeq?: string | number;
  error?: string;
  rawResponse?: any;
}> {
  try {
    const url = `${TOSS_BASE_URL}/api/v1/accounts`;
    const res = await tossFetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      const errCode = data.error?.code || `HTTP_${res.status}`;
      const errMsg = data.error?.message || data.message || `계좌 목록 조회 실패 (${res.status})`;
      const formatted = await formatTossError(errCode, errMsg);
      return {
        success: false,
        error: formatted.message,
        rawResponse: data,
      };
    }

    const accountsList = Array.isArray(data.result) ? data.result : (Array.isArray(data.accounts) ? data.accounts : (Array.isArray(data) ? data : []));
    if (!accountsList || accountsList.length === 0) {
      return {
        success: false,
        error: '등록된 토스증권 계좌(accountSeq)를 찾을 수 없습니다.',
        rawResponse: data,
      };
    }

    let matched = accountsList[0];
    if (targetAccountNo) {
      const targetClean = targetAccountNo.replace(/-/g, '');
      const found = accountsList.find((a: any) => {
        const noClean = String(a.accountNo || a.account_no || a.accountNumber || '').replace(/-/g, '');
        return noClean && noClean.includes(targetClean);
      });
      if (found) matched = found;
    }

    const accountSeq = matched.accountSeq ?? matched.account_seq ?? matched.seq;
    if (accountSeq === undefined || accountSeq === null) {
      return {
        success: false,
        error: '계좌 응답에서 accountSeq 필드를 찾을 수 없습니다.',
        rawResponse: data,
      };
    }

    return {
      success: true,
      accountSeq,
      rawResponse: data,
    };
  } catch (err: any) {
    return {
      success: false,
      error: `계좌 목록 조회 통신 예외: ${err?.message || err}`,
    };
  }
}

/**
 * 3. 미국 주식 LOC 매수/매도 주문 전송 API (POST /api/v1/orders)
 */
export async function sendTossLocOrder(params: TossOrderParams): Promise<TossOrderResult> {
  try {
    // 1) OAuth2 토큰 발급
    const tokenRes = await getTossAccessToken(params.appKey, params.appSecret);
    if (!tokenRes.success || !tokenRes.accessToken) {
      return {
        success: false,
        errorCode: 'OAUTH2_TOKEN_FAILED',
        message: tokenRes.error || 'OAuth2 토큰 발급 실패',
        rawResponse: tokenRes.rawResponse,
      };
    }
    const accessToken = tokenRes.accessToken;

    // 2) 계좌 식별자(accountSeq) 조회
    const accountRes = await getTossAccountSeq(accessToken, params.accountNo);
    if (!accountRes.success || accountRes.accountSeq === undefined) {
      return {
        success: false,
        errorCode: 'ACCOUNT_SEQ_FAILED',
        message: accountRes.error || '계좌 식별자(accountSeq) 조회 실패',
        rawResponse: accountRes.rawResponse,
      };
    }
    const accountSeq = String(accountRes.accountSeq);

    // 3) 미국 주식 LOC 매수/매도 주문 전송
    if (params.price <= 0 || params.qty <= 0) {
      console.warn(`[tossBroker] 유효하지 않은 주문 파라미터 (Price: ${params.price}, Qty: ${params.qty})`);
      return {
        success: false,
        errorCode: 'INVALID_ORDER_PARAMS',
        message: `유효하지 않은 주문 파라미터입니다. (Price: $${(params.price / 100).toFixed(2)}, Qty: ${params.qty}주)`,
      };
    }

    const url = `${TOSS_BASE_URL}/api/v1/orders`;
    const dollarsPrice = (params.price / 100).toFixed(2);
    const clientOrderId = params.clientOrderId || `LUPE_${params.ticker.toUpperCase()}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    const bodyPayload = {
      symbol: params.ticker.toUpperCase(),
      side: params.side, // "BUY" | "SELL"
      orderType: 'LIMIT',
      timeInForce: 'CLS', // 미국 주식 종가 지정가(LOC) 필수 값
      quantity: String(params.qty),
      price: dollarsPrice,
      clientOrderId: clientOrderId,
    };

    console.log(`==================================================`);
    console.log(`🟢 [토스 API 전송 Payload 1:1 동기화 검증]`);
    console.log(` Symbol: ${bodyPayload.symbol}, Side: ${bodyPayload.side}`);
    console.log(` Calculated Price: $${dollarsPrice} (${params.price} 센트)`);
    console.log(` Calculated Quantity: ${params.qty}주`);
    console.log(` Toss Request Body:`, JSON.stringify(bodyPayload, null, 2));
    console.log(`==================================================`);

    const res = await tossFetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'X-Tossinvest-Account': accountSeq,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(bodyPayload),
    });

    const resData: any = await res.json().catch(() => ({}));

    // 4) 결과 검증: 200 OK & { result: { orderId: "..." } }
    if (res.ok && (resData.result?.orderId || resData.orderId)) {
      const orderId = resData.result?.orderId || resData.orderId;
      return {
        success: true,
        orderId: String(orderId),
        message: `토스 OpenAPI 3.1.0 주문 성공 (Order ID: ${orderId})`,
        rawResponse: resData,
      };
    } else {
      const errCode = resData.error?.code || resData.code || `HTTP_${res.status}`;
      const errMsg = resData.error?.message || resData.message || `토스 API 주문 실패 (${res.status})`;
      const formatted = await formatTossError(errCode, errMsg);

      return {
        success: false,
        errorCode: formatted.errorCode,
        orderId: `TOSS_FAIL_${params.ticker}_${Date.now()}`,
        message: formatted.message,
        rawResponse: resData,
      };
    }
  } catch (err: any) {
    return {
      success: false,
      errorCode: 'EXCEPTION',
      message: `토스 API 통신 예외: ${err?.message || err}`,
    };
  }
}

/**
 * 4. [🧪 토스 API 가상 주문 테스트] 전송 컨트롤러
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
 * 5. [🔄 체결 기록 동기화 테스트] 컨트롤러
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


