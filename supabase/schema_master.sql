-- ====================================================================
-- 루프 (Lupe) 자동매매 시스템 통합 DB 스키마 마이그레이션 SQL
-- File: supabase/schema_master.sql
-- Description: cycles, trade_logs, daily_records, auto_orders, app_settings
--              테이블 및 제약조건/인덱스 전수 생성 및 정비 스크립트
-- ====================================================================

-- 1. 확장 기능 활성화 (UUID 생성 등)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- --------------------------------------------------------------------
-- 2. cycles 테이블 (무한매수법 사이클 정보)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cycles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    uid UUID,
    name TEXT NOT NULL,
    ticker TEXT NOT NULL,
    version TEXT NOT NULL DEFAULT 'V4.0',
    split_count INTEGER NOT NULL DEFAULT 40,
    max_percent NUMERIC NOT NULL DEFAULT 20.0,
    principal BIGINT NOT NULL DEFAULT 0,
    compound_mode TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    start_date TEXT NOT NULL,
    final_date TEXT,
    final_profit BIGINT,
    commission_rate NUMERIC NOT NULL DEFAULT 0.1,
    auto_trade_enabled BOOLEAN NOT NULL DEFAULT true,
    is_active BOOLEAN NOT NULL DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 컬럼 보완 (기존 테이블 존재 시)
ALTER TABLE public.cycles ADD COLUMN IF NOT EXISTS auto_trade_enabled BOOLEAN DEFAULT true;
ALTER TABLE public.cycles ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE public.cycles ADD COLUMN IF NOT EXISTS commission_rate NUMERIC DEFAULT 0.1;
ALTER TABLE public.cycles ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
ALTER TABLE public.cycles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- --------------------------------------------------------------------
-- 3. trade_logs 테이블 (실제 체결 및 매매 기록)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.trade_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cycle_id UUID NOT NULL REFERENCES public.cycles(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    type TEXT NOT NULL,
    order_type TEXT NOT NULL,
    price BIGINT NOT NULL DEFAULT 0,
    qty INTEGER NOT NULL DEFAULT 0,
    memo TEXT,
    profit BIGINT,
    commission_rate NUMERIC DEFAULT 0.1,
    batch_id UUID DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_trade_logs_cycle_id ON public.trade_logs(cycle_id);
CREATE INDEX IF NOT EXISTS idx_trade_logs_date ON public.trade_logs(date);

-- --------------------------------------------------------------------
-- 4. daily_records 테이블 (장 마감 일별 시세 및 포트폴리오 스냅샷)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.daily_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cycle_id UUID NOT NULL REFERENCES public.cycles(id) ON DELETE CASCADE,
    ticker TEXT NOT NULL,
    date TEXT NOT NULL,
    close_price BIGINT NOT NULL DEFAULT 0,
    change_percent NUMERIC NOT NULL DEFAULT 0,
    avg_price BIGINT DEFAULT 0,
    holding_qty INTEGER DEFAULT 0,
    current_t NUMERIC DEFAULT 0,
    phase TEXT,
    realized_profit BIGINT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT daily_records_cycle_date_key UNIQUE (cycle_id, date)
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_daily_records_cycle_date ON public.daily_records(cycle_id, date);

-- --------------------------------------------------------------------
-- 5. auto_orders 테이블 (장전 자동 주문 제출 내역)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.auto_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cycle_id UUID NOT NULL REFERENCES public.cycles(id) ON DELETE CASCADE,
    ticker TEXT NOT NULL,
    order_type TEXT NOT NULL,
    side TEXT NOT NULL,
    price BIGINT NOT NULL DEFAULT 0,
    qty INTEGER NOT NULL DEFAULT 0,
    target_price BIGINT DEFAULT 0,
    order_date TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    order_id TEXT,
    order_response JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_auto_orders_cycle_date ON public.auto_orders(cycle_id, order_date);

-- --------------------------------------------------------------------
-- 6. app_settings 테이블 (앱 전역 자동매매, 토스 API, 텔레그램 설정)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_settings (
    id TEXT PRIMARY KEY DEFAULT 'default_settings',
    is_global_auto_trade BOOLEAN NOT NULL DEFAULT false,
    toss_app_key TEXT DEFAULT '',
    toss_app_secret TEXT DEFAULT '',
    toss_account_no TEXT DEFAULT '',
    telegram_bot_token TEXT DEFAULT '',
    telegram_chat_id TEXT DEFAULT '',
    auto_trade_time TEXT DEFAULT '22:30',
    pin_code TEXT DEFAULT '1234',
    is_virtual_trade BOOLEAN DEFAULT false,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 기본 설정 행 삽입 (없는 경우)
INSERT INTO public.app_settings (id, is_global_auto_trade, pin_code, auto_trade_time)
VALUES ('default_settings', false, '1234', '22:30')
ON CONFLICT (id) DO NOTHING;
