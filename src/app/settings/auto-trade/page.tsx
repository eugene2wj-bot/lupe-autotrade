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

  // 🔒 보안 PIN 번호 인증 및 마스킹 상태
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [isPinVerifying, setIsPinVerifying] = useState(false);

  // PIN 번호 변경 모달 상태
  const [showChangePinModal, setShowChangePinModal] = useState(false);
  const [currentPinInput, setCurrentPinInput] = useState('');
  const [newPinInput, setNewPinInput] = useState('');
  const [confirmPinInput, setConfirmPinInput] = useState('');
  const [changePinError, setChangePinError] = useState('');
  const [isChangingPin, setIsChangingPin] = useState(false);

  // 입력 필드 마스킹 (숨기기/보이기) 상태
  const [showTossAppKey, setShowTossAppKey] = useState(false);
  const [showTossAppSecret, setShowTossAppSecret] = useState(false);
  const [showTossAccountNo, setShowTossAccountNo] = useState(false);
  const [showTelegramBotToken, setShowTelegramBotToken] = useState(false);
  const [showTelegramChatId, setShowTelegramChatId] = useState(false);

  // 보안 인증(PIN) 성공 후 DB 데이터 자동 불러오기 (GET_SETTINGS 서버 수집)
  useEffect(() => {
    if (isUnlocked) {
      async function loadData() {
        setIsLoading(true);
        try {
          const res = await fetch('/api/auto-trade', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'GET_SETTINGS' }),
          });

          const data = await res.json();
          if (res.ok && data.success && data.settings) {
            setSettings(data.settings);
          } else {
            const fetchedSettings = await getAppSettings();
            setSettings(fetchedSettings);
          }

          if (cycles.length > 0) {
            setSelectedCycleId(cycles[0].id);
          }
        } catch {
          const fetchedSettings = await getAppSettings();
          setSettings(fetchedSettings);
        } finally {
          setIsLoading(false);
        }
      }
      loadData();
    }
  }, [isUnlocked, cycles]);

  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString('ko-KR');
    setTestLog((prev) => [`[${time}] ${msg}`, ...prev.slice(0, 30)]);
  };

  // 🔒 PIN 번호 인증 처리
  const handleVerifyPin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!pinInput.trim()) {
      setPinError('PIN 번호를 입력해주세요.');
      return;
    }

    setIsPinVerifying(true);
    setPinError('');

    try {
      const res = await fetch('/api/auto-trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'VERIFY_PIN',
          pinCode: pinInput.trim(),
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setIsUnlocked(true);
        setPinError('');
      } else {
        setPinError(data.message || data.error || '보안 PIN 번호가 일치하지 않습니다. (기본값: 1234)');
      }
    } catch {
      setPinError('PIN 인증 중 네트워크 오류가 발생했습니다.');
    } finally {
      setIsPinVerifying(false);
    }
  };

  // 🔑 PIN 번호 변경 처리
  const handleChangePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setChangePinError('');

    if (!currentPinInput.trim()) {
      setChangePinError('현재 PIN 번호를 입력하세요.');
      return;
    }
    if (!newPinInput.trim() || newPinInput.length < 4) {
      setChangePinError('새 PIN 번호는 4자리 이상 입력해야 합니다.');
      return;
    }
    if (newPinInput !== confirmPinInput) {
      setChangePinError('새 PIN 번호와 확인 번호가 일치하지 않습니다.');
      return;
    }

    setIsChangingPin(true);
    try {
      const res = await fetch('/api/auto-trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'CHANGE_PIN',
          currentPin: currentPinInput.trim(),
          newPin: newPinInput.trim(),
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        alert('✅ 보안 PIN 번호가 성공적으로 변경되었습니다.');
        setShowChangePinModal(false);
        setCurrentPinInput('');
        setNewPinInput('');
        setConfirmPinInput('');
      } else {
        setChangePinError(data.message || data.error || 'PIN 번호 변경 실패');
      }
    } catch {
      setChangePinError('PIN 변경 처리 중 오류가 발생했습니다.');
    } finally {
      setIsChangingPin(false);
    }
  };

  // 전역 자동매매 토글
  const handleGlobalToggle = async () => {
    const nextVal = !settings.is_global_auto_trade;
    const updated = { ...settings, is_global_auto_trade: nextVal };
    setSettings(updated);

    await updateAppSettings({ is_global_auto_trade: nextVal });
    addLog(`전역 자동매매 상태 변경: ${nextVal ? 'ON 🟢' : 'OFF 🔴'}`);
    await notifyAutoTradeStatus('전역 설정', nextVal, true);
  };

  // 개별 사이클 자동매매 토글
  const handleCycleToggle = async (cycle: Cycle) => {
    const nextVal = !(cycle.autoTradeEnabled ?? true);
    updateCycle(cycle.id, { autoTradeEnabled: nextVal });

    await saveCycle({ ...cycle, autoTradeEnabled: nextVal });
    addLog(`사이클 [${cycle.name}] 자동매매: ${nextVal ? 'ON 🟢' : 'OFF 🔴'}`);
    await notifyAutoTradeStatus(cycle.name, nextVal, false);
  };

  // 설정 저장 폼 제출
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      addLog('💾 /api/auto-trade 라우트로 app_settings DB 저장 요청 중...');

      const settingsPayload = {
        toss_app_key: settings.toss_app_key,
        toss_app_secret: settings.toss_app_secret,
        toss_account_no: settings.toss_account_no,
        telegram_bot_token: settings.telegram_bot_token,
        telegram_chat_id: settings.telegram_chat_id,
        auto_trade_time: settings.auto_trade_time,
        is_global_auto_trade: settings.is_global_auto_trade,

        tossAppKey: settings.toss_app_key,
        tossAppSecret: settings.toss_app_secret,
        tossAccountNo: settings.toss_account_no,
        telegramBotToken: settings.telegram_bot_token,
        telegramChatId: settings.telegram_chat_id,
        autoTradeTime: settings.auto_trade_time,
      };

      const res = await fetch('/api/auto-trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'SAVE_SETTINGS',
          settings: settingsPayload,
          ...settingsPayload,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        if (data.settings) {
          setSettings(data.settings);
        }
        addLog('✅ 설정이 DB에 안전하게 저장되었습니다');
        alert('✅ 설정이 DB에 안전하게 저장되었습니다.');

        if (settings.telegram_bot_token && settings.telegram_chat_id) {
          await sendTelegramMessage(
            `⚙️ <b>[루프 설정 저장 알림]</b>\n\n토스증권 및 텔레그램 설정이 성공적으로 DB에 저장되었습니다.`
          );
        }
      } else {
        const errorDetail = data.error || data.message || '알 수 없는 서버 에러';
        addLog(`🔴 DB 저장 실패: ${errorDetail}`);
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

    addLog(`🧪 사이클 [${targetCycle.name}] 토스 API 가상 주문 테스트 시작...`);
    const res = await submitSimulatedOrders(targetCycle);

    if (res.success) {
      addLog(`✅ 가상 주문 ${res.count}건 생성 및 auto_orders DB 저장 완료!`);
      addLog(`📱 텔레그램 주문 제출보고서 발송 완료`);
      alert(`[${targetCycle.name}] 가상 주문 ${res.count}건이 제출되었으며 텔레그램으로 알림이 발송되었습니다.`);
    } else {
      const errorMsg = res.message || '가상 주문 처리 실패';
      addLog(`🔴 DB/텔레그램 오류: ${errorMsg}`);
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
      alert(errorMsg);
    }
  };

  // ── 🔒 PIN 미인증 시 화면 전체 가림 모달 ──
  if (!isUnlocked) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/80 backdrop-blur-md p-4">
        <div className="w-full max-w-sm bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-3xl p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in duration-200">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 text-2xl mb-1">
              🔒
            </div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-50">보안 PIN 번호 인증</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
              자동매매 설정 및 API 인증키 조회를 위해<br />
              <strong className="text-indigo-600 dark:text-indigo-400">설정하신 보안 PIN 번호</strong>를 입력하세요.
            </p>
          </div>

          <form onSubmit={handleVerifyPin} className="space-y-4">
            <div>
              <input
                type="password"
                maxLength={8}
                autoFocus
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                placeholder="PIN 번호 입력"
                className="w-full px-4 py-3 text-center text-lg font-bold tracking-widest bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
              />
              {pinError && (
                <p className="mt-2 text-xs font-semibold text-rose-500 text-center animate-shake">
                  ⚠️ {pinError}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={isPinVerifying}
              className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white font-bold text-sm rounded-2xl shadow-lg shadow-indigo-500/25 transition-all flex items-center justify-center gap-2"
            >
              {isPinVerifying ? (
                <span>인증 확인 중...</span>
              ) : (
                <>
                  <span>🔓</span>
                  <span>인증 및 설정 진입</span>
                </>
              )}
            </button>
          </form>

          <div className="text-center pt-2">
            <Link href="/" className="text-xs font-semibold text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
              ← 메인 대시보드로 돌아가기
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* ── 헤더 타이틀 및 메인으로 이동 ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-50 flex items-center gap-2">
            <span>⚙️</span> 자동매매 & 토스증권 API 설정
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            미국 증시 개장 시간에 맞춘 자동 주문 생성 및 텔레그램 알림을 설정합니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowChangePinModal(true)}
            className="px-3.5 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 font-semibold text-xs rounded-xl transition-colors flex items-center gap-1.5"
          >
            <span>🔑</span> PIN 번호 변경
          </button>
          <Link
            href="/"
            className="px-3.5 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 font-semibold text-xs rounded-xl transition-colors"
          >
            ← 메인으로
          </Link>
        </div>
      </div>

      {/* ── 1. 전역 및 개별 사이클 자동매매 스위치 ── */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 shadow-xs space-y-4 border border-gray-100 dark:border-gray-800">
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3">
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-gray-50 flex items-center gap-1.5">
              <span>🤖</span> 전역 자동매매 마스터 스위치
            </h2>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              OFF 설정 시 지정 시각이 되더라도 주문 생성이 차단됩니다.
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

        {/* 개별 사이클 자동매매 목록 */}
        <div className="space-y-2">
          <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            개별 사이클 자동매매 제어
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

      {/* ── 2. 토스증권 API & 텔레그램 연동 폼 (마스킹 및 보이기/숨기기 지원) ── */}
      <form onSubmit={handleSaveSettings} className="bg-white dark:bg-gray-900 rounded-2xl p-5 shadow-xs space-y-4 border border-gray-100 dark:border-gray-800">
        <h2 className="text-base font-bold text-gray-900 dark:text-gray-50 flex items-center gap-1.5 border-b border-gray-100 dark:border-gray-800 pb-3">
          <span>🔑</span> 토스증권 API & 텔레그램 인증키 설정
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* 토스증권 App Key */}
          <div>
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
              토스증권 App Key
            </label>
            <div className="relative flex items-center">
              <input
                type={showTossAppKey ? 'text' : 'password'}
                value={settings.toss_app_key}
                onChange={(e) => setSettings({ ...settings, toss_app_key: e.target.value })}
                placeholder="App Key 입력"
                className="w-full pr-10 px-3 py-2 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:border-indigo-500 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowTossAppKey(!showTossAppKey)}
                className="absolute right-2.5 text-sm opacity-60 hover:opacity-100 transition-opacity"
                title={showTossAppKey ? '숨기기' : '보이기'}
              >
                {showTossAppKey ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          {/* 토스증권 App Secret */}
          <div>
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
              토스증권 App Secret
            </label>
            <div className="relative flex items-center">
              <input
                type={showTossAppSecret ? 'text' : 'password'}
                value={settings.toss_app_secret}
                onChange={(e) => setSettings({ ...settings, toss_app_secret: e.target.value })}
                placeholder="App Secret 입력"
                className="w-full pr-10 px-3 py-2 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:border-indigo-500 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowTossAppSecret(!showTossAppSecret)}
                className="absolute right-2.5 text-sm opacity-60 hover:opacity-100 transition-opacity"
                title={showTossAppSecret ? '숨기기' : '보이기'}
              >
                {showTossAppSecret ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          {/* 토스증권 계좌번호 */}
          <div>
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
              토스증권 계좌번호
            </label>
            <div className="relative flex items-center">
              <input
                type={showTossAccountNo ? 'text' : 'password'}
                value={settings.toss_account_no}
                onChange={(e) => setSettings({ ...settings, toss_account_no: e.target.value })}
                placeholder="예: 12345678-01"
                className="w-full pr-10 px-3 py-2 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:border-indigo-500 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowTossAccountNo(!showTossAccountNo)}
                className="absolute right-2.5 text-sm opacity-60 hover:opacity-100 transition-opacity"
                title={showTossAccountNo ? '숨기기' : '보이기'}
              >
                {showTossAccountNo ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          {/* 자동주문 실행 시각 */}
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

          {/* 텔레그램 Bot Token */}
          <div>
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
              텔레그램 Bot Token
            </label>
            <div className="relative flex items-center">
              <input
                type={showTelegramBotToken ? 'text' : 'password'}
                value={settings.telegram_bot_token}
                onChange={(e) => setSettings({ ...settings, telegram_bot_token: e.target.value })}
                placeholder="123456789:ABCdefGHI..."
                className="w-full pr-10 px-3 py-2 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:border-indigo-500 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowTelegramBotToken(!showTelegramBotToken)}
                className="absolute right-2.5 text-sm opacity-60 hover:opacity-100 transition-opacity"
                title={showTelegramBotToken ? '숨기기' : '보이기'}
              >
                {showTelegramBotToken ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          {/* 텔레그램 Chat ID */}
          <div>
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
              텔레그램 Chat ID
            </label>
            <div className="relative flex items-center">
              <input
                type={showTelegramChatId ? 'text' : 'password'}
                value={settings.telegram_chat_id}
                onChange={(e) => setSettings({ ...settings, telegram_chat_id: e.target.value })}
                placeholder="예: 987654321"
                className="w-full pr-10 px-3 py-2 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:border-indigo-500 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowTelegramChatId(!showTelegramChatId)}
                className="absolute right-2.5 text-sm opacity-60 hover:opacity-100 transition-opacity"
                title={showTelegramChatId ? '숨기기' : '보이기'}
              >
                {showTelegramChatId ? '🙈' : '👁️'}
              </button>
            </div>
          </div>
        </div>

        <div className="pt-2 flex justify-end">
          <button
            type="submit"
            disabled={isSaving}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5"
          >
            {isSaving ? 'DB 저장 중...' : '💾 DB 설정 저장 완료'}
          </button>
        </div>
      </form>

      {/* ── 3. 테스트 컨트롤 ── */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 shadow-xs space-y-4 border border-gray-100 dark:border-gray-800">
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
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow-xs transition-all"
          >
            🧪 토스 API 가상 주문 테스트
          </button>

          <button
            type="button"
            onClick={handleTestExecutionSync}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow-xs transition-all"
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

      {/* 🔑 PIN 번호 변경 모달 팝업 */}
      {showChangePinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-3xl p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3">
              <h3 className="text-base font-bold text-gray-900 dark:text-gray-50 flex items-center gap-1.5">
                <span>🔑</span> 보안 PIN 번호 변경
              </h3>
              <button
                type="button"
                onClick={() => setShowChangePinModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleChangePinSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                  현재 PIN 번호
                </label>
                <input
                  type="password"
                  maxLength={8}
                  value={currentPinInput}
                  onChange={(e) => setCurrentPinInput(e.target.value)}
                  placeholder="현재 PIN 입력"
                  className="w-full px-3 py-2 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                  새 PIN 번호 (4자리 이상)
                </label>
                <input
                  type="password"
                  maxLength={8}
                  value={newPinInput}
                  onChange={(e) => setNewPinInput(e.target.value)}
                  placeholder="새 PIN 입력"
                  className="w-full px-3 py-2 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                  새 PIN 번호 확인
                </label>
                <input
                  type="password"
                  maxLength={8}
                  value={confirmPinInput}
                  onChange={(e) => setConfirmPinInput(e.target.value)}
                  placeholder="새 PIN 재입력"
                  className="w-full px-3 py-2 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:border-indigo-500"
                />
              </div>

              {changePinError && (
                <p className="text-xs font-semibold text-rose-500 pt-1">
                  ⚠️ {changePinError}
                </p>
              )}

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowChangePinModal(false)}
                  className="px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-semibold text-xs rounded-xl"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={isChangingPin}
                  className="px-4 py-2 bg-indigo-600 text-white font-bold text-xs rounded-xl hover:bg-indigo-700"
                >
                  {isChangingPin ? '변경 중...' : 'PIN 번호 변경 저장'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
