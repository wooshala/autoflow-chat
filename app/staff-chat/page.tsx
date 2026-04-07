'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { type AutoflowUser, loadUser, logoutAndGoLogin, resolveChatSendUserId, runSessionMigration } from '@/lib/auth';
import { fetchEnvelope } from '@/lib/api/envelope';
import { CHAT_SEND_URL } from '@/lib/chatApi';
import { TIMEOUT_MS_CHAT_SEND } from '@/lib/api/timeouts';
import type { ChatMessage } from '@/lib/types';
import { unwrapChatSendEnvelopeData } from '@/lib/api/unwrapChatSendResponse';

type Step = 'room' | 'chat';
type Lang = 'ko' | 'vi' | 'ru';
type ActionColor = 'green' | 'blue' | 'red' | 'purple';

type StaffAction = {
  key: string;
  icon: string;
  color: ActionColor;
  label: Record<Lang, string>;
  msg: string;
};

const ACTIONS: StaffAction[] = [
  { key: 'clean_done', icon: '🧹', color: 'green', label: { ko: '청소 완료', vi: 'Dọn xong', ru: 'Убрано' }, msg: '청소 완료' },
  { key: 'clean_need', icon: '🔄', color: 'green', label: { ko: '청소 필요', vi: 'Cần dọn', ru: 'Нужно убрать' }, msg: '청소 필요' },
  { key: 'towel', icon: '🧺', color: 'blue', label: { ko: '수건', vi: 'Khăn', ru: 'Полотенце' }, msg: '수건 요청' },
  { key: 'water', icon: '💧', color: 'blue', label: { ko: '생수', vi: 'Nước', ru: 'Вода' }, msg: '생수 요청' },
  { key: 'smell', icon: '🚬', color: 'red', label: { ko: '냄새', vi: 'Mùi', ru: 'Запах' }, msg: '냄새 있음' },
  { key: 'broken', icon: '🔧', color: 'red', label: { ko: '고장', vi: 'Hỏng', ru: 'Поломка' }, msg: '고장 있음' },
  { key: 'check', icon: '⚠️', color: 'red', label: { ko: '점검', vi: 'Kiểm tra', ru: 'Проверка' }, msg: '점검 필요' },
  { key: 'photo', icon: '📸', color: 'purple', label: { ko: '사진', vi: 'Ảnh', ru: 'Фото' }, msg: '사진 보고' },
  { key: 'help', icon: '🆘', color: 'purple', label: { ko: '도움', vi: 'Giúp', ru: 'Помощь' }, msg: '도움 요청' }
];

const STORAGE_RECENT_ROOMS = 'autoflow_staff_recent_rooms';

const I18N: Record<Lang, Record<string, string>> = {
  ko: {
    title: '스태프 빠른 채팅',
    pickName: '이름 선택',
    pickRoom: '방 선택',
    recentRooms: '최근 방',
    change: '변경',
    back: '뒤로',
    sending: '전송 중…',
    quick: '빠른 버튼',
    directInput: '직접 입력',
    hideInput: '입력 닫기',
    messagePlaceholder: '필요한 내용을 짧게 입력…',
    send: '전송',
    room: '호'
  },
  vi: {
    title: 'Chat nhanh cho nhân viên',
    pickName: 'Chọn tên',
    pickRoom: 'Chọn phòng',
    recentRooms: 'Phòng gần đây',
    change: 'Đổi',
    back: 'Quay lại',
    sending: 'Đang gửi…',
    quick: 'Nút nhanh',
    directInput: 'Nhập tay',
    hideInput: 'Đóng nhập',
    messagePlaceholder: 'Nhập ngắn gọn…',
    send: 'Gửi',
    room: 'phòng'
  },
  ru: {
    title: 'Быстрый чат персонала',
    pickName: 'Выбор имени',
    pickRoom: 'Выбор номера',
    recentRooms: 'Недавние номера',
    change: 'Сменить',
    back: 'Назад',
    sending: 'Отправка…',
    quick: 'Быстрые кнопки',
    directInput: 'Ввод вручную',
    hideInput: 'Закрыть ввод',
    messagePlaceholder: 'Коротко напишите…',
    send: 'Отправить',
    room: 'номер'
  }
};

function t(lang: Lang, k: string) {
  return I18N[lang][k] || k;
}

function actionButtonClasses(color: ActionColor): string {
  switch (color) {
    case 'green':
      return 'border-emerald-700 bg-emerald-600 text-white shadow-md active:bg-emerald-700';
    case 'blue':
      return 'border-sky-700 bg-sky-600 text-white shadow-md active:bg-sky-700';
    case 'red':
      return 'border-rose-700 bg-rose-600 text-white shadow-md active:bg-rose-700';
    case 'purple':
      return 'border-violet-700 bg-violet-600 text-white shadow-md active:bg-violet-700';
    default:
      return 'border-gray-300 bg-gray-600 text-white';
  }
}

function loadRecentRooms(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_RECENT_ROOMS);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((x) => String(x || '').trim()).filter(Boolean).slice(0, 6);
  } catch {
    return [];
  }
}

function saveRecentRoom(roomNo: string) {
  const r = String(roomNo || '').trim();
  if (!r) return;
  try {
    const cur = loadRecentRooms();
    const next = [r, ...cur.filter((x) => x !== r)].slice(0, 6);
    localStorage.setItem(STORAGE_RECENT_ROOMS, JSON.stringify(next));
  } catch {
    // ignore
  }
}

export default function StaffChatPage() {
  const router = useRouter();
  const [lang, setLang] = useState<Lang>('ko');
  const [step, setStep] = useState<Step>('room');
  const [sessionUser, setSessionUser] = useState<AutoflowUser | null>(null);
  const [roomNo, setRoomNo] = useState('');
  const [recentRooms, setRecentRooms] = useState<string[]>([]);

  const [showInput, setShowInput] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<{ kind: 'ok' | 'error'; msg: string } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const floors = useMemo(() => [2, 3, 4, 5, 6, 7, 8], []);
  const nums = useMemo(() => Array.from({ length: 20 }, (_, i) => i + 1), []);

  useEffect(() => {
    setRecentRooms(loadRecentRooms());
    runSessionMigration();
    const u = loadUser();
    if (!u) {
      router.replace('/login');
      return;
    }
    setSessionUser(u);
    setStep('room');
  }, [router]);

  useEffect(() => {
    if (!toast) return;
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2500);
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    };
  }, [toast]);

  function selectRoom(next: string) {
    const r = String(next || '').trim();
    if (!r) return;
    setRoomNo(r);
    saveRecentRoom(r);
    setRecentRooms(loadRecentRooms());
    setStep('chat');
  }

  async function send(body: string) {
    const u = loadUser();
    if (!u) {
      router.replace('/login');
      return;
    }
    const userId = resolveChatSendUserId();
    if (!userId) {
      setToast({ kind: 'error', msg: '전송에 실패했습니다. 관리자 설정이 필요합니다.' });
      return;
    }
    const msg = String(body || '').trim();
    if (!msg) return;
    const r = String(roomNo || '').trim();
    if (!r) return;

    setSending(true);
    setToast(null);
    try {
      const fd = new FormData();
      fd.append('user_id', userId);
      fd.append('actor_name', u.name);
      fd.append('message', msg);
      fd.append('sender_side', 'mobile');
      fd.append('room_no', r);
      fd.append('client_request_id', (globalThis.crypto?.randomUUID?.() || `${Date.now()}`).toString());
      fd.append('client_device_id', 'staff-chat');

      const res = await fetchEnvelope<{ message: ChatMessage }>(CHAT_SEND_URL, {
        method: 'POST',
        body: fd,
        timeoutMs: TIMEOUT_MS_CHAT_SEND
      });
      if (!res.ok) {
        setToast({ kind: 'error', msg: '전송에 실패했습니다. 잠시 후 다시 시도해 주세요.' });
        return;
      }
      const saved = unwrapChatSendEnvelopeData(res.data);
      if (!saved?.id) {
        setToast({ kind: 'error', msg: '전송에 실패했습니다. 잠시 후 다시 시도해 주세요.' });
        return;
      }
      setText('');
      setToast({ kind: 'ok', msg: '✅ 전송 완료' });
    } catch {
      setToast({ kind: 'error', msg: '전송에 실패했습니다. 잠시 후 다시 시도해 주세요.' });
    } finally {
      setSending(false);
    }
  }

  function sendAction(action: StaffAction) {
    const r = String(roomNo || '').trim();
    if (!r) return;
    const textToSend = `${r}호 ${action.msg}`;
    void send(textToSend);
  }

  function sendCustom() {
    const r = String(roomNo || '').trim();
    const extra = String(text || '').trim();
    if (!r || !extra) return;
    void send(`${r}호 ${extra}`);
  }

  const langButtons: { code: Lang; flag: string }[] = [
    { code: 'ko', flag: '🇰🇷' },
    { code: 'vi', flag: '🇻🇳' },
    { code: 'ru', flag: '🇷🇺' }
  ];

  if (!sessionUser) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-100">
        <p className="text-sm text-gray-500">불러오는 중…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-100">
      <div className="mx-auto max-w-md px-4 pb-10 pt-6">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-xl font-extrabold tracking-tight text-gray-900">{t(lang, 'title')}</div>
            <div className="text-xs text-gray-500">/staff-chat</div>
          </div>
          <div className="flex gap-2">
            {langButtons.map((b) => (
              <button
                key={b.code}
                type="button"
                onClick={() => setLang(b.code)}
                className={`min-h-[48px] min-w-[52px] rounded-2xl border-2 text-2xl shadow-sm transition ${
                  lang === b.code ? 'border-blue-600 bg-white ring-2 ring-blue-200' : 'border-gray-200 bg-white opacity-90'
                }`}
                aria-pressed={lang === b.code}
                aria-label={b.code}
              >
                {b.flag}
              </button>
            ))}
          </div>
        </div>

        {toast && (
          <div
            className={`mb-3 rounded-2xl border-2 px-4 py-3 text-center text-base font-bold ${
              toast.kind === 'ok' ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-rose-300 bg-rose-50 text-rose-900'
            }`}
          >
            {toast.msg}
          </div>
        )}

        {step === 'room' && sessionUser && (
          <section className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-bold text-gray-600">{t(lang, 'pickRoom')}</div>
                <div className="mt-1 truncate text-base font-semibold text-gray-900">
                  {sessionUser.name}
                  <button
                    type="button"
                    onClick={() => logoutAndGoLogin(router)}
                    className="ml-2 text-sm text-blue-600 underline"
                  >
                    {t(lang, 'change')}
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={() => router.push('/chat')}
                className="shrink-0 rounded-xl border-2 border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700"
              >
                {t(lang, 'back')}
              </button>
            </div>

            {recentRooms.length > 0 && (
              <div className="rounded-2xl border-2 border-gray-200 bg-white p-4 shadow-sm">
                <div className="mb-2 text-sm font-bold text-gray-600">{t(lang, 'recentRooms')}</div>
                <div className="flex flex-wrap gap-2">
                  {recentRooms.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => selectRoom(r)}
                      className="min-h-[52px] min-w-[72px] rounded-xl border-2 border-gray-200 bg-gray-50 px-4 text-lg font-extrabold text-gray-900 active:scale-[0.99]"
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-2xl border-2 border-gray-200 bg-white p-4 shadow-sm">
              <div className="mb-2 text-sm font-bold text-gray-600">201+</div>
              <div className="max-h-[50vh] overflow-y-auto pr-1">
                <div className="space-y-4">
                  {floors.map((f) => (
                    <div key={f}>
                      <div className="mb-2 text-sm font-semibold text-gray-500">{f}</div>
                      <div className="grid grid-cols-5 gap-2">
                        {nums.map((n) => {
                          const nn = String(n).padStart(2, '0');
                          const r = `${f}${nn}`;
                          return (
                            <button
                              key={r}
                              type="button"
                              onClick={() => selectRoom(r)}
                              className="h-14 rounded-xl border-2 border-gray-200 bg-gray-50 text-base font-extrabold text-gray-900 active:scale-[0.99]"
                            >
                              {r}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {step === 'chat' && sessionUser && (
          <section className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-lg font-extrabold text-gray-900">
                  {roomNo}
                  {t(lang, 'room')}
                </div>
                <div className="text-sm text-gray-600">{sessionUser.name}</div>
                <div className="mt-1 text-xs text-gray-500">{t(lang, 'quick')}</div>
              </div>
              <button
                type="button"
                onClick={() => setStep('room')}
                className="shrink-0 rounded-xl border-2 border-gray-200 bg-white px-4 py-3 text-sm font-bold text-gray-800"
              >
                {t(lang, 'change')}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {ACTIONS.map((a) => (
                <button
                  key={a.key}
                  type="button"
                  disabled={sending}
                  onClick={() => sendAction(a)}
                  className={`flex min-h-[88px] flex-col items-center justify-center gap-1 rounded-2xl border-2 px-2 py-3 text-center font-extrabold active:scale-[0.99] disabled:opacity-50 ${actionButtonClasses(a.color)}`}
                >
                  <span className="text-3xl leading-none">{a.icon}</span>
                  <span className="text-sm leading-tight">{a.label[lang]}</span>
                </button>
              ))}
            </div>

            <div className="rounded-2xl border-2 border-gray-200 bg-white p-4 shadow-sm">
              {!showInput ? (
                <button
                  type="button"
                  onClick={() => setShowInput(true)}
                  className="h-14 w-full rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 text-base font-bold text-gray-700"
                >
                  {t(lang, 'directInput')}
                </button>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-gray-600">{t(lang, 'directInput')}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setShowInput(false);
                        setText('');
                      }}
                      className="text-sm font-semibold text-gray-500 underline"
                    >
                      {t(lang, 'hideInput')}
                    </button>
                  </div>
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder={t(lang, 'messagePlaceholder')}
                    rows={3}
                    className="w-full rounded-xl border-2 border-gray-200 bg-white px-3 py-3 text-lg outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                  <button
                    type="button"
                    disabled={sending || !text.trim()}
                    onClick={() => void sendCustom()}
                    className="h-14 w-full rounded-xl bg-gray-900 text-lg font-extrabold text-white disabled:opacity-50"
                  >
                    {sending ? t(lang, 'sending') : t(lang, 'send')}
                  </button>
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
