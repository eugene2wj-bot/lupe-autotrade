// -------------------------------------------------------
// 루프 (Lupe) — 무한매수법 핵심 타입 정의
// -------------------------------------------------------

export type Version = 'V2.2' | 'V3.0' | 'V4.0';

export type CompoundMode = 'full' | 'half' | null;

export type Phase =
  | 'first-half'
  | 'second-half'
  | 'quarter-sell'
  | 'quarter-buy'
  | 'reverse-sell'
  | 'reverse-buy';

export type OrderType =
  | 'init'
  | 'star'
  | 'avg'
  | 'extra'
  | 'moc'
  | 'quarter'
  | 'limit'
  | 'reverse';

export interface TradeLog {
  id: string;
  cycleId: string;
  date: string; // YYYY-MM-DD
  type: 'buy' | 'sell';
  orderType: OrderType;
  price: number; // 원화 센트 단위 (x100)
  qty: number;
  memo: string | null;
  profit: number | null;
  commissionRate: number;
  batchId: string;
}

export interface Cycle {
  id: string;
  uid?: string;
  name: string;
  ticker: string;
  version: Version;
  splitCount: number;
  maxPercent: number;
  principal: number;
  compoundMode: CompoundMode;
  status: 'active' | 'completed';
  startDate: string;
  finalDate?: string | null;
  finalProfit?: number | null;
  createdAt?: string;
  updatedAt?: string;
  commissionRate: number;
  sortOrder?: number;
  orderCheck?: { date: string } | null;
  autoTradeEnabled?: boolean;
  logs: TradeLog[];
}

export interface AppSettings {
  id?: string;
  is_global_auto_trade: boolean;
  toss_app_key: string;
  toss_app_secret: string;
  toss_account_no: string;
  telegram_bot_token: string;
  telegram_chat_id: string;
  auto_trade_time: string;
  pin_code?: string;
  updated_at?: string;
}

export interface AutoOrder {
  id?: string;
  cycle_id: string;
  ticker: string;
  order_type: string;
  side: 'buy' | 'sell';
  price: number;
  qty: number;
  target_price?: number;
  order_date?: string;
  status: 'pending' | 'submitted' | 'failed' | 'simulated';
  order_response?: any;
  created_at?: string;
}

export interface CycleStats {
  totalBuyAmount: number;
  totalBuyQty: number;
  totalSellQty: number;
  holdingQty: number;
  avgPrice: number;
  currentT: number;
  perBuyAmount: number;
  starPercent: number;
  starPrice: number;
  phase: Phase;
  holdingCost: number;
  realizedProfit: number;
  maxRealizedProfit: number;
  remainingCash: number;
}

export interface Order {
  type: 'buy' | 'sell';
  orderType: OrderType;
  label: string;
  price: number;
  qty: number;
}

export interface StockQuote {
  date: string;
  close: number;
}

export interface NewCycleFormState {
  name: string;
  ticker: string;
  version: Version;
  splitCount: number;
  maxPercent: number;
  principal: number | undefined;
  compoundMode: CompoundMode;
  commissionRate: number;
}

export interface DailyRecord {
  id?: string;
  cycle_id: string;
  ticker: string;
  date: string; // YYYY-MM-DD
  close_price: number; // 센트 단위 정수
  change_percent: number;
  avg_price?: number;
  holding_qty?: number;
  current_t?: number;
  phase?: string;
  realized_profit?: number;
  created_at?: string;
}
