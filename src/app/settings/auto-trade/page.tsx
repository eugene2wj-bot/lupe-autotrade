'use client';

import React, { useState, useEffect, Component, type ReactNode } from 'react';
import Link from 'next/link';
import { useCycleStore } from '@/store/cycleStore';
import { NewCycleModal } from '@/components/modals/NewCycleModal';
import { notifyAutoTradeStatus, sendTelegramMessage } from '@/services/telegramService';
import { submitSimulatedOrders, syncExecutions } from '@/services/tossBroker';
import type { AppSettings, Cycle } from '@/types/cycle';

// ── 안전 기본값 ──────────────────────────────────────────────
const DEFAULT_SETTINGS: AppSettings = {
  is_global_auto_trade: false,
  toss_app_key: '',
  toss_app_secret: '',
  toss_account_no: '',
  telegram_bot_token: '',
  telegram_chat_id: '',
  auto_trade_time: '22:30',
};

/** 데이터를 AppSettings 안전값으로 정규화 */
function normalizeSettings(raw: any): AppSettings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS };
  return {
    is_global_auto_trade: raw.is_global_auto_trade ?? raw.isGlobalAutoTrade ?? false,
    toss_app_key: raw.toss_app_key ?? raw.tossAppKey ?? '',
    toss_app_secret: raw.toss_app_secret ?? raw.tossAppSecret ?? '',
    toss_account_no: raw.toss_account_no ?? raw.tossAccountNo ?? '',
    telegram_bot_token: raw.telegram_bot_token ?? raw.telegramBotToken ?? '',
    telegram_chat_id: raw.telegram_chat_id ?? raw.telegramChatId ?? '',
    auto_trade_time: raw.auto_trade_time ?? raw.autoTradeTime ?? '22:30',
  };
}

// ── React Error Boundary ──────────────────────────────────────
class SettingsErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; errorMsg: string }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMsg: '' };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, errorMsg: String(error?.message || error) };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="max-w-4xl mx-auto p-8 text-center space-y-4">
          <div className="text-4xl">⚠️</div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-50">
            설정 페이지를 불러오는 중 오류가 발생했습니다
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 font-mono bg-gray-50 dark:bg-gray-900 rounded-xl p-3">
            {this.state.errorMsg}
          </p>
          <div className="flex justify-center gap-3">
            <button
              onClick={() => this.setState({ hasError: false, errorMsg: '' })}
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700"
            >
              다시 시도
            </button>
            <Link href="/" className="px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 text-sm font-bold rounded-xl">
              메인으로
            </Link>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function AutoTradeSettingsPage() {
  return (
    <SettingsErrorBoundary>
      <AutoTradeSettingsInner />
    </SettingsErrorBoundary>
  );
}

function AutoTradeSettingsInner() {
  const {
    cycles,
    addCycle,
    updateCycle,
    deleteCycle,
    isNewCycleModalOpen,
    editingCycleId,
    openNewCycleModal,
    openEditCycleModal,
    closeModal,
    loadFromDb,
  } = useCycleStore();

  const [settings, setSettings] = useState<AppSettings>({ ...DEFAULT_SETTINGS });
  const [loadError, setLoadError] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isModalSubmitting, setIsModalSubmitting] = useState(false);
  const [testLog, setTestLog] = useState<string[]>([]);
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null);

  // ➕ TQQQ 1차 빠른 추가
  const handleAddTqqqCycle = async () => {
    const newCycle: Cycle = {
      id: crypto.randomUUID(),
      name: 'TQQQ 1차',
      ticker: 'TQQQ',
      version: 'V4.0',
      splitCount: 40,
      maxPercent: 20,
      principal: 1000000,
      compoundMode: 'full',
      status: 'active',
      startDate: new Date().toISOString().slice(0, 10),
      commissionRate: 0.1,
      autoTradeEnabled: true,
      logs: [],
    };
    addLog(`➕ [TQQQ 1차] 사이클 Supabase DB 저장 요청...`);
    await addCycle(newCycle);
    addLog(`✅ [TQQQ 1차] 사이클 Supabase DB(cycles) 저장 완료!`);
    alert(`✅ [TQQQ 1차] 사이클이 Supabase DB(cycles)에 정상 등록되었습니다.`);
  };

  // ➕ SOXL 1차 빠른 추가
  const handleAddSoxlCycle = async () => {
    const newCycle: Cycle = {
      id: crypto.randomUUID(),
      name: 'SOXL 1차',
      ticker: 'SOXL',
      version: 'V4.0',
      splitCount: 40,
      maxPercent: 20,
      principal: 1000000,
      compoundMode: 'full',
      status: 'active',
      startDate: new Date().toISOString().slice(0, 10),
      commissionRate: 0.1,
      autoTradeEnabled: true,
      logs: [],
    };
    addLog(`➕ [SOXL 1차] 사이클 Supabase DB 저장 요청...`);
    await addCycle(newCycle);
    addLog(`✅ [SOXL 1차] 사이클 Supabase DB(cycles) 저장 완료!`);
    alert(`✅ [SOXL 1차] 사이클이 Supabase DB(cycles)에 정상 등록되었습니다.`);
  };

  // 🗑️ 사이클 삭제
  const handleDeleteCycle = async (cycle: Cycle) => {
    if (confirm(`정말 "${cycle.name}" (${cycle.ticker}) 사이클을 DB에서 삭제하시겠습니까?\n\n(연관된 체결 기록 및 일별 시세도 함께 삭제됩니다)`)) {
      addLog(`🗑️ 사이클 [${cycle.name}] Supabase DB 삭제 진행 중...`);
      await deleteCycle(cycle.id);
      addLog(`✅ 사이클 [${cycle.name}] Supabase DB 삭제 완료`);
      alert(`✅ "${cycle.name}" 사이클이 DB에서 삭제되었습니다.`);
    }
  };

  // 💾 모달 폼 제출 (생성/수정)
  const handleCycleModalSubmit = async (
    settingsObj: Omit<Cycle, 'id' | 'logs'>,
    importLogs?: Array<{
      date: string; type: 'buy' | 'sell'; orderType: string;
      price: number; qty: number; memo?: string; commissionRate: number;
    }>
  ) => {
    setIsModalSubmitting(true);
    try {
      if (editingCycleId) {
        await updateCycle(editingCycleId, settingsObj);
        addLog(`✅ 사이클 [${settingsObj.name}] 수정사항 DB 저장 완료`);
        alert(`✅ 사이클 [${settingsObj.name}] 수정이 성공적으로 DB에 저장되었습니다.`);
      } else {
        const newCycle: Cycle = {
          ...settingsObj,
          id: crypto.randomUUID(),
          logs: (importLogs ?? []).map((l) => ({
            id: crypto.randomUUID(),
            cycleId: '',
            date: l.date,
            type: l.type,
            orderType: l.orderType as Cycle['logs'][number]['orderType'],
            price: l.price,
            qty: l.qty,
            memo: l.memo ?? null,
            profit: null,
            commissionRate: l.commissionRate,
            batchId: crypto.randomUUID(),
          })),
        };
        newCycle.logs = newCycle.logs.map((l) => ({ ...l, cycleId: newCycle.id }));
        await addCycle(newCycle);
        addLog(`✅ 신규 사이클 [${newCycle.name}] (${newCycle.ticker}) DB 저장 완료`);
        alert(`✅ 신규 사이클 [${newCycle.name}]이 DB에 등록되었습니다.`);
      }
      closeModal();
    } catch (err: any) {
      alert(`🔴 사이클 저장 오류: ${err?.message || err}`);
    } finally {
      setIsModalSubmitting(false);
    }
  };

  const handleModalDelete = async () => {
    if (editingCycleId) {
      const target = cycles.find((c) => c.id === editingCycleId);
      if (target) {
        await handleDeleteCycle(target);
        closeModal();
      }
    }
  };

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

  // 보안 인증(PIN) 성공 후 DB 데이터 자동 불러오기
  useEffect(() => {
    if (!isUnlocked) return;

    let cancelled = false;
    async function loadData() {
      setIsLoading(true);
      setLoadError(null);
      try {
        const res = await fetch('/api/auto-trade', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'GET_SETTINGS' }),
        });

        if (!cancelled) {
          if (res.ok) {
            const data = await res.json().catch(() => ({}));
            const rawSettings = data?.settings ?? data ?? null;
            setSettings(normalizeSettings(rawSettings));
          } else {
            // API 실패 시 기본값 유지, 에러 배너만 표시
            setLoadError('설정 불러오기 실패 — 기본 설정 표시 중입니다.');
            setSettings({ ...DEFAULT_SETTINGS });
          }
        }
      } catch (err: any) {
        if (!cancelled) {
          setLoadError(`설정 불러오기 오류: ${err?.message || '네트워크 오류'} — 기본 설정 표시 중입니다.`);
          setSettings({ ...DEFAULT_SETTINGS });
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }

      // 사이클 초기 선택
      if (!cancelled && Array.isArray(cycles) && cycles.length > 0 && !selectedCycleId) {
        setSelectedCycleId(cycles[0]?.id ?? null);
      }
    }

    loadData();
    return () => { cancelled = true; };
  }, [isUnlocked]); // eslint-disable-line react-hooks/exhaustive-deps

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
    const nextVal = !(settings?.is_global_auto_trade ?? false);
    setSettings((prev) => ({ ...DEFAULT_SETTINGS, ...prev, is_global_auto_trade: nextVal }));
    addLog(`전역 자동매매 상태 변경: ${nextVal ? 'ON 🟢' : 'OFF 🔴'}`);
    try {
      await fetch('/api/auto-trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle-auto-trade', isGlobal: true, status: nextVal }),
      });
      await notifyAutoTradeStatus('전역 설정', nextVal, true).catch(() => {});
    } catch (err: any) {
      addLog(`🔴 전역 토글 오류: ${err?.message || err}`);
    }
  };

  // 개별 사이클 자동매매 토글
  const handleCycleToggle = async (cycle: Cycle) => {
    const nextVal = !(cycle?.autoTradeEnabled ?? true);
    try {
      updateCycle(cycle.id, { autoTradeEnabled: nextVal });
    } catch { /* store 오류 무시 */ }
    addLog(`사이클 [${cycle?.name ?? '?'}] 자동매매: ${nextVal ? 'ON 🟢' : 'OFF 🔴'}`);
    try {
      await fetch('/api/auto-trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle-auto-trade', isGlobal: false, cycleId: cycle.id, status: nextVal }),
      });
      await notifyAutoTradeStatus(cycle?.name ?? '사이클', nextVal, false).catch(() => {});
    } catch (err: any) {
      addLog(`🔴 사이클 토글 오류: ${err?.message || err}`);
    }
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

      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        if (data.settings) {
          setSettings(normalizeSettings(data.settings));
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
      {/* ── 로딩 중 스켈레톤 ── */}
      {isLoading && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-xs border border-gray-100 dark:border-gray-800 animate-pulse space-y-3">
          <div className="h-4 w-48 bg-gray-200 dark:bg-gray-700 rounded-lg" />
          <div className="h-3 w-full bg-gray-100 dark:bg-gray-800 rounded-lg" />
          <div className="h-3 w-3/4 bg-gray-100 dark:bg-gray-800 rounded-lg" />
          <p className="text-xs text-gray-400 dark:text-gray-500 pt-1">설정 정보를 불러오는 중...</p>
        </div>
      )}

      {/* ── 설정 불러오기 에러 배너 (페이지 튕김 없이 인라인 표시) ── */}
      {!isLoading && loadError && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 flex items-start gap-3">
          <span className="text-lg flex-shrink-0">⚠️</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">{loadError}</p>
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
              설정을 저장하거나 수동으로 입력한 후 저장 버튼을 눌러주세요.
            </p>
          </div>
          <button
            onClick={() => setLoadError(null)}
            className="text-amber-400 hover:text-amber-600 text-sm font-bold flex-shrink-0"
          >
            ✕
          </button>
        </div>
      )}

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

      {/* ── 1. 전역 및 개별 사이클 자동매매 스위치 & DB 청소 ── */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 shadow-xs space-y-4 border border-gray-100 dark:border-gray-800">
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3">
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-gray-50 flex items-center gap-1.5">
              <span>🛡️</span> 전역 자동매매 마스터 안전 스위치
            </h2>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              OFF 설정 시 크론 및 모든 장전 자동 주문 처리가 절대 실행되지 않고 완전 차단됩니다.
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

        {/* 🔒 안전 상태 배너 */}
        {settings.is_global_auto_trade ? (
          <div className="p-3 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-base">✅</span>
              <div>
                <span className="text-xs font-bold text-indigo-700 dark:text-indigo-300">
                  전체 자동매매 활성화(ON) 상태
                </span>
                <p className="text-[11px] text-indigo-600 dark:text-indigo-400">
                  지정 시각({settings.auto_trade_time})에 활성 사이클의 장전 자동 매매 주문이 실행됩니다.
                </p>
              </div>
            </div>
            <span className="px-2.5 py-1 text-[11px] font-bold text-indigo-700 bg-indigo-100 dark:bg-indigo-900 rounded-lg shrink-0">
              자동매매 ON
            </span>
          </div>
        ) : (
          <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-base">⛔</span>
              <div>
                <span className="text-xs font-bold text-rose-700 dark:text-rose-300">
                  전체 자동매매 완전 차단(OFF) 상태
                </span>
                <p className="text-[11px] text-rose-600 dark:text-rose-400">
                  모든 장전 자동주문 생성, 토스 API 전송 및 크론 실행이 절대 돌지 않고 100% 안전하게 차단 중입니다.
                </p>
              </div>
            </div>
            <span className="px-2.5 py-1 text-[11px] font-bold text-rose-700 bg-rose-100 dark:bg-rose-900 rounded-lg shrink-0">
              안전 차단 중
            </span>
          </div>
        )}

        {/* 개별 사이클 자동매매 및 C.R.U.D 관리 */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              개별 사이클 C.R.U.D & DB 실시간 연동 관리
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleAddTqqqCycle}
                className="px-2.5 py-1 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 text-indigo-600 dark:text-indigo-400 font-bold text-xs rounded-lg transition-colors border border-indigo-200 dark:border-indigo-800 flex items-center gap-1"
              >
                <span>➕</span> [TQQQ 1차] DB 등록
              </button>
              <button
                type="button"
                onClick={handleAddSoxlCycle}
                className="px-2.5 py-1 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 text-blue-600 dark:text-blue-400 font-bold text-xs rounded-lg transition-colors border border-blue-200 dark:border-blue-800 flex items-center gap-1"
              >
                <span>➕</span> [SOXL 1차] DB 등록
              </button>
              <button
                type="button"
                onClick={openNewCycleModal}
                className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg transition-colors shadow-xs flex items-center gap-1"
              >
                <span>➕</span> 새 사이클 직접 등록
              </button>
            </div>
          </div>

          <div className="divide-y divide-gray-100 dark:divide-gray-800 border border-gray-100 dark:border-gray-800 rounded-xl overflow-hidden">
            {cycles.length > 0 ? (
              cycles.map((cycle) => {
                const isEnabled = cycle.autoTradeEnabled ?? true;
                const principalDollars = cycle.principal ? (cycle.principal / 100).toLocaleString() : '0';
                return (
                  <div key={cycle.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-white dark:bg-gray-900">
                    <div className="flex items-center gap-3">
                      <span className={`text-xs px-2 py-0.5 rounded-md font-bold ${cycle.ticker === 'TQQQ' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300' : 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'}`}>
                        {cycle.ticker}
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-gray-900 dark:text-gray-50">
                            {cycle.name}
                          </span>
                          <span className="text-xs text-gray-400 dark:text-gray-500">
                            {cycle.version} · {cycle.splitCount}분할 · ${principalDollars}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {/* 편집 버튼 */}
                      <button
                        type="button"
                        onClick={() => openEditCycleModal(cycle.id)}
                        className="px-2.5 py-1 text-xs font-semibold text-gray-600 hover:text-indigo-600 dark:text-gray-400 dark:hover:text-indigo-400 bg-gray-100 dark:bg-gray-800 rounded-lg transition-colors"
                      >
                        ✏️ 수정
                      </button>

                      {/* 삭제 버튼 */}
                      <button
                        type="button"
                        onClick={() => handleDeleteCycle(cycle)}
                        className="px-2.5 py-1 text-xs font-semibold text-rose-600 hover:text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 rounded-lg transition-colors"
                      >
                        🗑️ 삭제
                      </button>

                      {/* 자동매매 ON/OFF 토글 */}
                      <div className="flex items-center gap-1.5 pl-2 border-l border-gray-100 dark:border-gray-800">
                        <span className={`text-xs font-bold ${isEnabled ? 'text-indigo-500' : 'text-gray-400'}`}>
                          {isEnabled ? 'ON' : 'OFF'}
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
                  </div>
                );
              })
            ) : (
              <div className="p-8 text-center bg-white dark:bg-gray-900">
                <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">등록된 사이클이 없습니다.</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">위의 [➕ [TQQQ 1차] DB 등록] 버튼을 눌러 첫 사이클을 등록해보세요.</p>
              </div>
            )}
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
      {/* 사이클 생성 / 편집 모달 */}
      {isNewCycleModalOpen && (
        <NewCycleModal
          cycle={editingCycleId ? cycles.find((c) => c.id === editingCycleId) : undefined}
          onSubmit={handleCycleModalSubmit}
          onDelete={editingCycleId ? handleModalDelete : undefined}
          onCancel={closeModal}
          isSubmitting={isModalSubmitting}
        />
      )}
    </div>
  );
}
