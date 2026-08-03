'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useCycleStore } from '@/store/cycleStore';
import { getAppSettings, updateAppSettings, saveCycle } from '@/services/dbService';
import { notifyAutoTradeStatus, sendTelegramMessage } from '@/services/telegramService';
import { submitSimulatedOrders, syncExecutions } from '@/services/tossBroker';
import type { AppSettings, Cycle } from '@/types/cycle';

export default function AutoTradeSettingsPage() {
  const { cycles, updateCycle } = useCycleStore();
  const [settings, setSettings] = useState<AppSettings>({
    is_global_auto_trade: false,
    toss_app_key: '',
    toss_app_secret: '',
    toss_account_no: '',
    telegram_bot_token: '',
    telegram_chat_id: '',
    auto_trade_time: '22:30',
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [testLog, setTestLog] = useState<string[]>([]);
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      try {
        const fetchedSettings = await getAppSettings();
        setSettings(fetchedSettings);
        if (cycles.length > 0) {
          setSelectedCycleId(cycles[0].id);
        }
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, [cycles]);

  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString('ko-KR');
    setTestLog((prev) => [`[${time}] ${msg}`, ...prev.slice(0, 30)]);
  };

  // 전역 자동매매 토글
  const handleGlobalToggle = async () => {
    const nextVal = !settings.is_global_auto_trade;
    const updated = { ...settings, is_global_auto_trade: nextVal };
    setSettings(updated);

    await updateAppSettings({ is_global_auto_trade: nextVal });
    addLog(`전역 자동매매 상태 변경: ${nextVal ? 'ON 🟢' : 'OFF 🔴'}`);

    // 텔레그램 알림
    await notifyAutoTradeStatus('전역 설정', nextVal, true);
  };

  // 개별 사이클 자동매매 토글
  const handleCycleToggle = async (cycle: Cycle) => {
    const nextVal = !(cycle.autoTradeEnabled ?? true);
    updateCycle(cycle.id, { autoTradeEnabled: nextVal });

    await saveCycle({ ...cycle, autoTradeEnabled: nextVal });
    addLog(`사이클 [${cycle.name}] 자동매매: ${nextVal ? 'ON 🟢' : 'OFF 🔴'}`);

    // 텔레그램 알림
    await notifyAutoTradeStatus(cycle.name, nextVal, false);
  };

  // 설정 저장 폼 제출 (서버 API 라우트로 이관)
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      addLog('💾 /api/auto-trade 라우트로 app_settings DB 저장 요청 중...');
      const res = await fetch('/api/auto-trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save-settings',
          settings,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        if (data.settings) {
          setSettings(data.settings);
        }
        addLog('✅ 설정이 DB에 안전하게 저장되었습니다');
        console.log('[AutoTradeSettings] Save success:', data.settings);
        alert('✅ 설정이 DB에 안전하게 저장되었습니다.');

        // 텔레그램 연동 확인 테스트 메세지
        if (settings.telegram_bot_token && settings.telegram_chat_id) {
          await sendTelegramMessage(
            `⚙️ <b>[루프 설정 저장 알림]</b>\n\n토스증권 및 텔레그램 설정이 성공적으로 DB에 저장되었습니다.`
          );
        }
      } else {
        const errorDetail = data.error || data.message || '알 수 없는 서버 에러';
        addLog(`🔴 DB 저장 실패: ${errorDetail}`);
        console.error('[AutoTradeSettings] Save error:', errorDetail);
        alert(errorDetail);
      }
    } catch (err: any) {
      const errStr = err?.message || '네트워크 오류';
      addLog(`🔴 DB 저장 예외: ${errStr}`);
      alert(`🔴 DB 저장 처리 중 오류가 발생했습니다: ${errStr}`);
    } finally {
      setIsSaving(false);
    }
  };

  // 🧪 [토스 API 가상 주문 테스트]
  const handleTestOrderSubmit = async () => {
    const targetCycle = cycles.find((c) => c.id === selectedCycleId) || cycles[0];
    if (!targetCycle) {
      alert('테스트할 사이클이 없습니다.');
      return;
    }

    addLog(`🧪 사이클 [${targetCycle.name}] 토스 API 가상 주문 테스트 시작 (서버보안검증)...`);
    const res = await submitSimulatedOrders(targetCycle);

    if (res.success) {
      addLog(`✅ 가상 주문 ${res.count}건 생성 및 auto_orders DB 저장 완료!`);
      addLog(`📱 텔레그램 주문 제출보고서 발송 완료`);
      alert(`[${targetCycle.name}] 가상 주문 ${res.count}건이 제출되었으며 텔레그램으로 알림이 발송되었습니다.`);
    } else {
      const errorMsg = res.message || '가상 주문 처리 실패';
      addLog(`🔴 DB/텔레그램 오류: ${errorMsg}`);
      console.error('[TestOrderSubmit] Error:', errorMsg);
      alert(errorMsg);
    }
  };

  // 🔄 [체결 기록 동기화 테스트]
  const handleTestExecutionSync = async () => {
    const targetCycle = cycles.find((c) => c.id === selectedCycleId) || cycles[0];
    if (!targetCycle) {
      alert('테스트할 사이클이 없습니다.');
      return;
    }

    addLog(`🔄 사이클 [${targetCycle.name}] 체결 기록 동기화 테스트 시작...`);
    const res = await syncExecutions(targetCycle);

    if (res.success) {
      addLog(`✅ 체결 내역 ${res.newLogs.length}건 수집 및 trade_logs DB 갱신 완료!`);
      addLog(`📱 텔레그램 체결 동기화보고서 발송 완료`);
      alert(`[${targetCycle.name}] 체결 내역 ${res.newLogs.length}건이 DB에 갱신되고 텔레그램 알림이 발송되었습니다.`);
    } else {
      const errorMsg = res.message || '체결 동기화 실패';
      addLog(`🔴 DB/텔레그램 오류: ${errorMsg}`);
      console.error('[TestExecutionSync] Error:', errorMsg);
      alert(errorMsg);
    }
  };

  if (isLoading) {
    return (
      <div className="text-center py-20">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-gray-500 dark:text-gray-400">설정을 불러오는 중입니다...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-center justify-between gap-3 pb-4 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="flex items-center justify-center w-8 h-8 rounded-full bg-white dark:bg-gray-900 shadow-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          >
            <svg viewBox="0 0 16 16" className="w-4 h-4" fill="currentColor">
              <path fillRule="evenodd" d="M9.78 4.22a.75.75 0 0 1 0 1.06L7.06 8l2.72 2.72a.75.75 0 1 1-1.06 1.06l-3.25-3.25a.75.75 0 0 1 0-1.06l3.25-3.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
            </svg>
          </Link>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-50 flex items-center gap-2">
              <span>🤖</span> 자동매매 & DB / 텔레그램 연동
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Supabase DB, 토스증권 API 자동주문 및 텔레그램 실시간 알림 모듈 설정
            </p>
          </div>
        </div>
      </div>

      {/* ── 1. 자동매매 스위치 컨트롤 ── */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3">
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-gray-50 flex items-center gap-1.5">
              <span>⚡</span> 전역 자동매매 실행 스위치
            </h2>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              전체 시스템의 장전 자동 주문 제출 기능을 켜거나 끕니다.
            </p>
          </div>
          <button
            type="button"
            onClick={handleGlobalToggle}
            className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
              settings.is_global_auto_trade ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-700'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                settings.is_global_auto_trade ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* 사이클별 개별 스위치 */}
        <div>
          <h3 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">
            사이클별 자동매매 개별 제어
          </h3>
          <div className="divide-y divide-gray-100 dark:divide-gray-800 border border-gray-100 dark:border-gray-800 rounded-xl overflow-hidden">
            {cycles.map((cycle) => {
              const isEnabled = cycle.autoTradeEnabled ?? true;
              return (
                <div key={cycle.id} className="flex items-center justify-between px-4 py-3 bg-white dark:bg-gray-900">
                  <div>
                    <span className="text-sm font-bold text-gray-900 dark:text-gray-50">
                      {cycle.name}
                    </span>
                    <span className="text-xs text-gray-400 dark:text-gray-500 ml-2">
                      {cycle.ticker} · {cycle.version}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold ${isEnabled ? 'text-indigo-500' : 'text-gray-400'}`}>
                      {isEnabled ? '자동매매 ON' : '중지됨'}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCycleToggle(cycle)}
                      className={`relative inline-flex h-6 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                        isEnabled ? 'bg-indigo-500' : 'bg-gray-300 dark:bg-gray-700'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                          isEnabled ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── 2. 토스증권 API & 텔레그램 연동 폼 ── */}
      <form onSubmit={handleSaveSettings} className="bg-white dark:bg-gray-900 rounded-2xl p-5 shadow-xs space-y-4">
        <h2 className="text-base font-bold text-gray-900 dark:text-gray-50 flex items-center gap-1.5 border-b border-gray-100 dark:border-gray-800 pb-3">
          <span>🔑</span> 토스증권 API & 텔레그램 인증키 설정
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
              토스증권 App Key
            </label>
            <input
              type="text"
              value={settings.toss_app_key}
              onChange={(e) => setSettings({ ...settings, toss_app_key: e.target.value })}
              placeholder="App Key 입력"
              className="w-full px-3 py-2 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
              토스증권 App Secret
            </label>
            <input
              type="password"
              value={settings.toss_app_secret}
              onChange={(e) => setSettings({ ...settings, toss_app_secret: e.target.value })}
              placeholder="App Secret 입력"
              className="w-full px-3 py-2 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
              토스증권 계좌번호
            </label>
            <input
              type="text"
              value={settings.toss_account_no}
              onChange={(e) => setSettings({ ...settings, toss_account_no: e.target.value })}
              placeholder="예: 12345678-01"
              className="w-full px-3 py-2 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
              자동주문 실행 시각 (한국시간)
            </label>
            <input
              type="text"
              value={settings.auto_trade_time}
              onChange={(e) => setSettings({ ...settings, auto_trade_time: e.target.value })}
              placeholder="22:30"
              className="w-full px-3 py-2 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
              텔레그램 Bot Token
            </label>
            <input
              type="password"
              value={settings.telegram_bot_token}
              onChange={(e) => setSettings({ ...settings, telegram_bot_token: e.target.value })}
              placeholder="123456789:ABCdefGHI..."
              className="w-full px-3 py-2 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
              텔레그램 Chat ID
            </label>
            <input
              type="text"
              value={settings.telegram_chat_id}
              onChange={(e) => setSettings({ ...settings, telegram_chat_id: e.target.value })}
              placeholder="예: 987654321"
              className="w-full px-3 py-2 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        <div className="pt-2 flex justify-end">
          <button
            type="submit"
            disabled={isSaving}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
          >
            {isSaving ? 'DB 저장 중...' : '💾 DB 설정 저장 완료'}
          </button>
        </div>
      </form>

      {/* ── 3. 테스트 컨트롤 ── */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 shadow-xs space-y-4">
        <h2 className="text-base font-bold text-gray-900 dark:text-gray-50 flex items-center gap-1.5 border-b border-gray-100 dark:border-gray-800 pb-3">
          <span>🧪</span> 토스 API & 텔레그램 연동 테스트
        </h2>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">테스트 대상:</span>
            <select
              value={selectedCycleId || ''}
              onChange={(e) => setSelectedCycleId(e.target.value)}
              className="px-3 py-1.5 text-xs font-bold bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none"
            >
              {cycles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.ticker})
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={handleTestOrderSubmit}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors"
          >
            🧪 토스 API 가상 주문 테스트
          </button>

          <button
            type="button"
            onClick={handleTestExecutionSync}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors"
          >
            🔄 체결 기록 동기화 테스트
          </button>
        </div>

        {/* 테스트 로그 터미널 모니터 */}
        {testLog.length > 0 && (
          <div className="mt-3 p-3 bg-gray-950 text-emerald-400 font-mono text-[11px] rounded-xl space-y-1 max-h-48 overflow-y-auto border border-gray-800">
            {testLog.map((line, idx) => (
              <div key={idx}>{line}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
