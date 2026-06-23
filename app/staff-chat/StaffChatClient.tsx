'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient as createBrowserSupabase } from '@/utils/supabase/client';
import {
  type AutoflowUser,
  loadUser,
  resolveStaffChatUserId,
  runSessionMigration,
  staffKeyLabel
} from '@/lib/auth';
import { fetchEnvelope } from '@/lib/api/envelope';
import { CHAT_SEND_URL } from '@/lib/chatApi';
import { TIMEOUT_MS_CHAT_SEND } from '@/lib/api/timeouts';
import type { ChatMessage } from '@/lib/types';
import { unwrapChatSendEnvelopeData } from '@/lib/api/unwrapChatSendResponse';
import { useChatLoader } from '@/lib/hooks/useChatLoader';
import { useChatRealtime } from '@/lib/hooks/useChatRealtime';
import { useChatWatchdog } from '@/lib/hooks/useChatWatchdog';
import { useChatRenderTrace } from '@/lib/hooks/useChatRenderTrace';
import {
  createClientNonce,
  logSendApiResponded,
  logSendClick,
  registerMessageIdForNonce
} from '@/lib/chat/sendTrace';
import {
  canShowBrowserNotification,
  ensureBrowserNotificationPermission,
  isBrowserNotificationSupported,
  showBrowserNotification
} from '@/lib/chat/browserNotifications';
import { playNotificationTone, unlockNotificationAudio } from '@/lib/chat/playNotificationTone';
import { getMessageDisplayParts } from '@/lib/chat/displayMessageText';
import type { ChatLang } from '@/lib/chat/translateMessageForChat';
import { isStaffTtsUnlocked, speakStaffRussian, unlockStaffTts } from '@/lib/chat/staffTts';
import { staffChatLog } from '@/lib/chat/staffChatLog';

type Lang = 'ko' | 'vi' | 'ru';

const STORAGE_CURRENT_ROOM = 'autoflow_staff_current_room_v1';
/** OS notification body cap (Browser Notification API, not Web Push). */
const OS_NOTIFY_BODY_MAX = 100;

/** 운영 객실만 */
const ROOM_OPTIONS = [
  '201', '202', '203', '205', '206', '207', '208', '209',
  '301', '302', '303', '305', '306', '307', '308', '309',
  '501', '502', '503', '505', '506', '507', '508',
  '601', '602', '603', '605', '606', '607', '608',
  '701', '702', '703', '705', '706', '707', '708',
  '801', '802'
] as const;

const VALID_ROOM_SET = new Set<string>(ROOM_OPTIONS);

function groupRoomOptions(): { floor: string; rooms: string[] }[] {
  const groups: { floor: string; rooms: string[] }[] = [];
  let floor = '';
  let rooms: string[] = [];
  for (const room of ROOM_OPTIONS) {
    const f = room.charAt(0);
    if (f !== floor) {
      if (rooms.length) groups.push({ floor, rooms });
      floor = f;
      rooms = [room];
    } else {
      rooms.push(room);
    }
  }
  if (rooms.length) groups.push({ floor, rooms });
  return groups;
}

const ROOM_GROUPS = groupRoomOptions();

function roomButtonClass(selected: boolean): string {
  return selected
    ? 'border-blue-600 bg-blue-50 text-blue-900 ring-2 ring-blue-200'
    : 'border-gray-200 bg-white text-gray-900';
}

function loadStoredRoom(): string {
  try {
    const r = String(localStorage.getItem(STORAGE_CURRENT_ROOM) || '').trim();
    return VALID_ROOM_SET.has(r) ? r : '';
  } catch {
    return '';
  }
}

function saveStoredRoom(roomNo: string) {
  try {
    localStorage.setItem(STORAGE_CURRENT_ROOM, roomNo);
  } catch {
    // ignore
  }
}

const I18N: Record<Lang, Record<string, string>> = {
  ko: {
    title: '청소팀 보고',
    currentRoom: '현재 객실',
    changeRoom: '객실 변경',
    pickRoom: '객실 선택',
    pickRoomTitle: '객실 선택',
    close: '닫기',
    noRoom: '객실을 선택하세요',
    sending: '전송 중…',
    messagePlaceholder: '짧게 입력…',
    send: '전송',
    room: '호',
    connection: '연결',
    noUserId: 'user_id 미설정 — .env.local에 STAFF_USER UUID 필요',
    photoSoon: '사진 전송은 v0.3에서 연결됩니다',
    voiceSoon: '음성(워키토키)은 v0.3 예정입니다',
    soundOn: '소리 켜기',
    readAloud: '읽기',
    notifyEnable: '알림 켜기',
    notifyGranted: '알림 허용됨',
    notifyDenied: '알림 차단됨',
    notifyUnsupported: '알림 미지원'
  },
  vi: {
    title: 'Báo cáo dọn phòng',
    currentRoom: 'Phòng hiện tại',
    changeRoom: 'Đổi phòng',
    pickRoom: 'Chọn phòng',
    pickRoomTitle: 'Chọn phòng',
    close: 'Đóng',
    noRoom: 'Chọn phòng',
    sending: 'Đang gửi…',
    messagePlaceholder: 'Nhập ngắn…',
    send: 'Gửi',
    room: 'phòng',
    connection: 'Kết nối',
    noUserId: 'Thiếu user_id',
    photoSoon: 'Ảnh sẽ có ở v0.3',
    voiceSoon: 'Giọng nói sẽ có ở v0.3',
    notifyEnable: 'Bật thông báo',
    notifyGranted: 'Thông báo đã bật',
    notifyDenied: 'Thông báo bị chặn',
    notifyUnsupported: 'Không hỗ trợ thông báo'
  },
  ru: {
    title: 'Отчёт уборки',
    currentRoom: 'Текущий номер',
    changeRoom: 'Сменить',
    pickRoom: 'Выбор номера',
    pickRoomTitle: 'Выбор номера',
    close: 'Закрыть',
    noRoom: 'Выберите номер',
    sending: 'Отправка…',
    messagePlaceholder: 'Коротко…',
    send: 'Отправить',
    room: 'номер',
    connection: 'Связь',
    noUserId: 'Нет user_id',
    photoSoon: 'Фото в v0.3',
    voiceSoon: 'Голос в v0.3',
    notifyEnable: 'Включить уведомления',
    notifyGranted: 'Уведомления разрешены',
    notifyDenied: 'Уведомления заблокированы',
    notifyUnsupported: 'Уведомления недоступны'
  }
};

function t(lang: Lang, k: string) {
  return I18N[lang][k] || k;
}

type ListPhase = 'loading' | 'ready' | 'error';
type SessionSource = 'localStorage' | 'query_param' | 'none';

function readUserParamFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return new URLSearchParams(window.location.search).get('user');
  } catch {
    return null;
  }
}

function StaffChatPageInner() {
  const [userParam, setUserParam] = useState<string | null>(() =>
    typeof window !== 'undefined' ? readUserParamFromUrl() : null
  );
  const [listPhase, setListPhase] = useState<ListPhase>('loading');
  const [listError, setListError] = useState<string | null>(null);

  const [lang, setLang] = useState<Lang>('ru');

  useEffect(() => {
    staffChatLog('STAFF_CHAT_LANG_SELECTED', {
      lang,
      viewerLang: lang === 'ru' ? 'ru' : 'ko'
    });
  }, [lang]);
  const [ttsReady, setTtsReady] = useState(false);
  const [sessionUser, setSessionUser] = useState<AutoflowUser | null>(null);
  const [sessionSource, setSessionSource] = useState<SessionSource>('none');
  const [roomNo, setRoomNo] = useState('');
  const [roomPickerOpen, setRoomPickerOpen] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [composerHeight, setComposerHeight] = useState(72);
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const [toast, setToast] = useState<{ kind: 'ok' | 'error'; msg: string } | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'degraded' | 'reconnecting'>('reconnecting');
  const [browserNotifyPermission, setBrowserNotifyPermission] = useState<
    NotificationPermission | 'unsupported'
  >('default');
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const knownNotifyIdsRef = useRef<Set<string>>(new Set());
  const notifySeededRef = useRef(false);
  const roomBootstrappedRef = useRef(false);

  const { key: staffKey, userId: chatSendUserId } = useMemo(
    () => resolveStaffChatUserId(userParam),
    [userParam]
  );

  const supabase = useMemo(() => createBrowserSupabase(), []);
  const realtimeConnectedRef = useRef(false);
  const isMountedRef = useRef(false);
  const isLoadingRef = useRef(false);
  const lastRealtimeActivityAtRef = useRef(Date.now());
  const lastRealtimeInsertPushAtRef = useRef<number | null>(null);
  const safeSinceRef = useRef<string | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const [realtimeReconnectToken, setRealtimeReconnectToken] = useState(0);

  const { messages, setMessages, loadFull, initialHydrationComplete, initialLoadStatus } = useChatLoader({
    loadingRef: isLoadingRef,
    listTimeoutMs: 10_000
  });

  useEffect(() => {
    const param = readUserParamFromUrl();
    staffChatLog('STAFF_CHAT_INIT', {
      href: typeof window !== 'undefined' ? window.location.href : null,
      userParam: param
    });
    staffChatLog('STAFF_CHAT_USER_PARAM', { user: param });
    setUserParam(param);
  }, []);

  useEffect(() => {
    staffChatLog('STAFF_CHAT_USER_RESOLVED', {
      staffKey,
      id: chatSendUserId,
      userId: chatSendUserId,
      hasUserId: Boolean(chatSendUserId),
      userParam
    });
  }, [staffKey, chatSendUserId, userParam]);

  useEffect(() => {
    runSessionMigration();
    const stored = loadUser();
    if (stored) {
      setSessionUser(stored);
      setSessionSource('localStorage');
      staffChatLog('STAFF_CHAT_SESSION_READY', {
        source: 'localStorage',
        name: stored.name,
        staffKey,
        id: chatSendUserId
      });
      return;
    }
    if (userParam && chatSendUserId) {
      const synthetic: AutoflowUser = {
        name: staffKeyLabel(staffKey),
        created_at: new Date().toISOString()
      };
      setSessionUser(synthetic);
      setSessionSource('query_param');
      staffChatLog('STAFF_CHAT_SESSION_READY', {
        source: 'query_param',
        name: synthetic.name,
        staffKey,
        id: chatSendUserId
      });
      return;
    }
    setSessionUser(null);
    setSessionSource('none');
  }, [userParam, chatSendUserId, staffKey]);

  useEffect(() => {
    if (roomBootstrappedRef.current) return;
    roomBootstrappedRef.current = true;
    const saved = loadStoredRoom();
    if (saved) {
      setRoomNo(saved);
    }
  }, []);

  useEffect(() => {
    staffChatLog('STAFF_CHAT_LIST_START', { source: 'useChatLoader_initial' });
    setListPhase('loading');
    setListError(null);
  }, []);

  useEffect(() => {
    if (!initialHydrationComplete) return;
    if (initialLoadStatus === 'error') {
      staffChatLog('STAFF_CHAT_LIST_ERROR', { error: 'initial_load_failed', message_count: messages.length });
      setListError('메시지 목록을 불러오지 못했습니다.');
      setListPhase('error');
      staffChatLog('STAFF_CHAT_READY', {
        staffKey,
        mode: 'error',
        message_count: messages.length,
        hasSession: Boolean(sessionUser)
      });
      return;
    }
    if (listPhase === 'error') return;
    staffChatLog('STAFF_CHAT_LIST_SUCCESS', { message_count: messages.length });
    setListPhase('ready');
    staffChatLog('STAFF_CHAT_READY', {
      staffKey,
      message_count: messages.length,
      hasSession: Boolean(sessionUser)
    });
  }, [initialHydrationComplete, initialLoadStatus, messages.length, listPhase, staffKey, sessionUser]);

  const retryListLoad = useCallback(async () => {
    staffChatLog('STAFF_CHAT_LIST_START', { source: 'manual_retry' });
    setListPhase('loading');
    setListError(null);
    try {
      const result = await loadFull('staff_chat_manual_retry');
      if (result?.ok) {
        staffChatLog('STAFF_CHAT_LIST_SUCCESS', { message_count: result.count, source: 'manual_retry' });
        setListPhase('ready');
      } else {
        throw new Error('list_failed');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      staffChatLog('STAFF_CHAT_LIST_ERROR', { error: msg, source: 'manual_retry' });
      setListError('메시지 목록을 불러오지 못했습니다.');
      setListPhase('error');
    }
  }, [loadFull]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (listPhase !== 'loading') return;
      if (initialHydrationComplete) return;
      staffChatLog('STAFF_CHAT_LIST_ERROR', { error: 'timeout_5s', initialHydrationComplete });
      setListError('메시지 목록 로드 시간이 초과되었습니다.');
      setListPhase('error');
      staffChatLog('STAFF_CHAT_READY', { staffKey, mode: 'timeout_error', hasSession: Boolean(sessionUser) });
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [listPhase, initialHydrationComplete, staffKey, sessionUser]);

  useChatRenderTrace(messages, initialHydrationComplete);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!isBrowserNotificationSupported()) {
      setBrowserNotifyPermission('unsupported');
      return;
    }
    setBrowserNotifyPermission(Notification.permission);
  }, []);

  useEffect(() => {
    const onFirst = () => {
      unlockNotificationAudio();
      unlockStaffTts();
      setTtsReady(true);
    };
    window.addEventListener('pointerdown', onFirst, true);
    return () => window.removeEventListener('pointerdown', onFirst, true);
  }, []);

  useChatRealtime({
    supabase,
    setMessages,
    messagesRef,
    realtimeConnectedRef,
    lastRealtimeActivityAtRef,
    lastRealtimeInsertPushAtRef,
    reconnectToken: realtimeReconnectToken,
    onConnectionStatus: setConnectionStatus
  });

  useChatWatchdog({
    supabase,
    loadFull,
    messagesRef,
    realtimeConnectedRef,
    lastRealtimeActivityAtRef,
    lastRealtimeInsertPushAtRef,
    safeSinceRef,
    isMountedRef,
    isLoadingRef,
    onConnectionStatus: setConnectionStatus,
    onRequestResubscribe: () => {
      setConnectionStatus('reconnecting');
      setRealtimeReconnectToken((x) => x + 1);
      return true;
    }
  });

  useEffect(() => {
    if (!initialHydrationComplete || !chatSendUserId) return;
    if (!notifySeededRef.current) {
      for (const m of messages) {
        const id = m?.id != null ? String(m.id) : '';
        if (id && !id.startsWith('tmp-')) knownNotifyIdsRef.current.add(id);
      }
      notifySeededRef.current = true;
      return;
    }
    for (const m of messages) {
      const id = m?.id != null ? String(m.id) : '';
      if (!id || id.startsWith('tmp-') || knownNotifyIdsRef.current.has(id)) continue;
      knownNotifyIdsRef.current.add(id);
      const isOwn = String(m.user_id) === String(chatSendUserId);
      if (!isOwn) {
        void playNotificationTone('info');
        const viewerLang: ChatLang = lang === 'ru' ? 'ru' : 'ko';
        const { primary, ttsText } = getMessageDisplayParts(m, viewerLang, {
          logContext: 'staff',
          selectedLang: lang
        });
        const toSpeak = ttsText || (viewerLang === 'ru' ? primary : null);
        if (toSpeak) speakStaffRussian(toSpeak);
        setToast({ kind: 'ok', msg: `📩 ${String(primary || m.message || '').slice(0, 40)}` });

        // staff-chat OS alerts: Browser Notification API while tab/session is alive (not Web Push).
        // Mobile browsers may suppress notifications when the screen is off or the tab is suspended.
        const { primary: ruPrimary } = getMessageDisplayParts(m, 'ru', {
          logContext: 'staff',
          selectedLang: lang
        });
        const isBackgroundLike =
          typeof document !== 'undefined' &&
          (document.hidden ||
            (typeof document.hasFocus === 'function' && !document.hasFocus()));
        if (isBackgroundLike && canShowBrowserNotification()) {
          const body = String(ruPrimary || m.message || '').trim().slice(0, OS_NOTIFY_BODY_MAX);
          if (body) {
            void showBrowserNotification({
              title: staffKeyLabel(staffKey) || 'AutoFlow Chat',
              body,
              tag: id
            });
          }
        }
      }
    }
  }, [messages, initialHydrationComplete, chatSendUserId, lang, staffKey]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const actorName = useMemo(
    () => sessionUser?.name || staffKeyLabel(staffKey),
    [sessionUser, staffKey]
  );

  const canSendMessages = Boolean(chatSendUserId);
  const canComposerSend = Boolean(canSendMessages && text.trim() && !sending);

  useEffect(() => {
    const el = composerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setComposerHeight(el.offsetHeight));
    ro.observe(el);
    setComposerHeight(el.offsetHeight);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      setKeyboardOffset(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
    };
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    update();
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2500);
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    };
  }, [toast]);

  const send = useCallback(
    async (body: string, image?: File | null) => {
      const msg = String(body || '').trim();
      const r = String(roomNo || '').trim();

      staffChatLog('STAFF_CHAT_SEND_CLICK', {
        staffKey,
        roomNo: r || null,
        messagePreview: msg.slice(0, 60),
        hasImage: Boolean(image),
        sessionSource,
        hasUserId: Boolean(chatSendUserId),
        source: 'send_fn'
      });

      if (!chatSendUserId) {
        staffChatLog('STAFF_CHAT_SEND_BLOCKED', { reason: 'no_resolved_staff_user_id' });
        setToast({ kind: 'error', msg: t(lang, 'noUserId') });
        return;
      }
      if (!msg && !image) {
        staffChatLog('STAFF_CHAT_SEND_BLOCKED', { reason: 'empty_message' });
        return;
      }

      const nonce = createClientNonce();
      logSendClick(nonce);
      setSending(true);
      setToast(null);
      staffChatLog('STAFF_CHAT_SEND_API_START', {
        userId: chatSendUserId,
        actorName,
        roomNo: r,
        nonce
      });

      try {
        const fd = new FormData();
        fd.append('user_id', chatSendUserId);
        fd.append('actor_name', actorName);
        fd.append('message', msg || (image ? (r ? `${r}호 사진` : '사진') : ''));
        fd.append('sender_side', 'mobile');
        if (r) fd.append('room_no', r);
        fd.append('client_nonce', nonce);
        fd.append('client_request_id', nonce);
        fd.append('client_device_id', `staff-chat-${staffKey}`);
        if (image) fd.append('image', image);

        const res = await fetchEnvelope<{ message: ChatMessage }>(CHAT_SEND_URL, {
          method: 'POST',
          body: fd,
          timeoutMs: TIMEOUT_MS_CHAT_SEND
        });
        if (!res.ok) {
          staffChatLog('STAFF_CHAT_SEND_API_ERROR', {
            status: res.status,
            error: res.error ?? null,
            message: res.message ?? null
          });
          setToast({ kind: 'error', msg: '전송에 실패했습니다. 잠시 후 다시 시도해 주세요.' });
          return;
        }
        const saved = unwrapChatSendEnvelopeData(res.data);
        if (!saved?.id) {
          staffChatLog('STAFF_CHAT_SEND_API_ERROR', { reason: 'missing_message_id' });
          setToast({ kind: 'error', msg: '전송에 실패했습니다. 잠시 후 다시 시도해 주세요.' });
          return;
        }
        staffChatLog('STAFF_CHAT_SEND_API_SUCCESS', {
          messageId: saved.id,
          roomNo: saved.room_no ?? r
        });
        registerMessageIdForNonce(nonce, String(saved.id));
        logSendApiResponded(nonce, String(saved.id), saved.created_at);
        setMessages((prev) => {
          if (prev.some((m) => String(m.id) === String(saved.id))) return prev;
          return [...prev, saved].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
        });
        setText('');
        setToast({ kind: 'ok', msg: '✅ 전송 완료' });
      } catch (e: unknown) {
        staffChatLog('STAFF_CHAT_SEND_API_ERROR', {
          error: e instanceof Error ? e.message : String(e)
        });
        setToast({ kind: 'error', msg: '전송에 실패했습니다. 잠시 후 다시 시도해 주세요.' });
      } finally {
        setSending(false);
      }
    },
    [actorName, chatSendUserId, lang, roomNo, sessionSource, setMessages, staffKey]
  );

  function selectRoom(next: string) {
    const r = String(next || '').trim();
    if (!r || !VALID_ROOM_SET.has(r)) return;
    setRoomNo(r);
    saveStoredRoom(r);
    setRoomPickerOpen(false);
  }

  function handleComposerSend() {
    staffChatLog('STAFF_CHAT_SEND_CLICK', {
      canComposerSend,
      roomNo: roomNo.trim() || null,
      textLen: text.trim().length,
      sending,
      hasUserId: Boolean(chatSendUserId)
    });
    if (!canComposerSend) {
      const reason = !chatSendUserId
        ? 'no_resolved_staff_user_id'
        : !text.trim()
          ? 'empty_message'
          : sending
            ? 'already_sending'
            : 'unknown';
      staffChatLog('STAFF_CHAT_SEND_BLOCKED', { reason });
      return;
    }
    void send(text.trim());
  }

  function handleComposerFocus() {
    window.setTimeout(() => {
      inputRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, 320);
  }

  function handlePhotoClick() {
    photoInputRef.current?.click();
  }

  function handlePhotoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const r = roomNo.trim();
    const caption = text.trim();
    void send(caption || (r ? `${r}호 사진` : '사진'), file);
  }

  function handleVoiceClick() {
    setToast({ kind: 'ok', msg: t(lang, 'voiceSoon') });
  }

  const langButtons: { code: Lang; flag: string }[] = [
    { code: 'ko', flag: '🇰🇷' },
    { code: 'vi', flag: '🇻🇳' },
    { code: 'ru', flag: '🇷🇺' }
  ];

  const recentMessages = useMemo(() => messages.filter((m) => !m.is_deleted).slice(-80), [messages]);

  return (
    <main className="flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden bg-[#eceff1]">
      {/* 상단 헤더 */}
      <header className="shrink-0 border-b border-gray-200 bg-white px-4 py-2.5 shadow-sm">
        <div className="mx-auto flex max-w-md items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-base font-extrabold text-gray-900">{t(lang, 'title')}</div>
            <div className="text-[11px] text-gray-500">
              {staffKeyLabel(staffKey)} · {connectionStatus}
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <div className="flex flex-wrap items-center justify-end gap-1.5 text-[10px] text-gray-500">
              {browserNotifyPermission === 'unsupported' ? (
                <span>{t(lang, 'notifyUnsupported')}</span>
              ) : browserNotifyPermission === 'default' ? (
                <button
                  type="button"
                  onClick={() => {
                    void ensureBrowserNotificationPermission().then((p) => setBrowserNotifyPermission(p));
                  }}
                  className="rounded-lg border border-gray-300 bg-gray-50 px-2 py-0.5 font-semibold text-gray-700"
                >
                  {t(lang, 'notifyEnable')}
                </button>
              ) : (
                <span>
                  {browserNotifyPermission === 'granted'
                    ? t(lang, 'notifyGranted')
                    : t(lang, 'notifyDenied')}
                </span>
              )}
            </div>
            {!ttsReady && !isStaffTtsUnlocked() ? (
              <button
                type="button"
                onClick={() => {
                  unlockStaffTts();
                  setTtsReady(true);
                }}
                className="rounded-lg border border-blue-300 bg-blue-50 px-2 py-1 text-[11px] font-bold text-blue-800"
              >
                🔊 {t(lang, 'soundOn')}
              </button>
            ) : null}
            <div className="flex gap-1">
            {langButtons.map((b) => (
              <button
                key={b.code}
                type="button"
                onClick={() => setLang(b.code)}
                className={`h-9 w-10 rounded-lg border text-lg ${
                  lang === b.code ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-gray-50'
                }`}
              >
                {b.flag}
              </button>
            ))}
            </div>
          </div>
        </div>
      </header>

      {/* 현재 객실 바 */}
      <div className="shrink-0 border-b border-gray-200 bg-white px-4 py-2.5">
        <div className="mx-auto flex max-w-md items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              {t(lang, 'currentRoom')}
            </div>
            <div className="text-xl font-extrabold text-gray-900">
              {roomNo ? `${roomNo}${t(lang, 'room')}` : t(lang, 'noRoom')}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setRoomPickerOpen(true)}
            className="shrink-0 rounded-xl border-2 border-blue-600 bg-blue-50 px-4 py-2.5 text-sm font-bold text-blue-800 active:bg-blue-100"
          >
            {t(lang, 'changeRoom')}
          </button>
        </div>
      </div>

      {toast && (
        <div
          className={`mx-4 mt-2 shrink-0 rounded-xl border px-3 py-2 text-center text-sm font-bold ${
            toast.kind === 'ok'
              ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
              : 'border-rose-300 bg-rose-50 text-rose-900'
          }`}
        >
          {toast.msg}
        </div>
      )}

      {!canSendMessages && (
        <div className="mx-4 mt-2 shrink-0 rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {t(lang, 'noUserId')}
        </div>
      )}

      {/* 채팅 내역 — 화면 대부분 */}
      <div
        ref={listRef}
        className="mx-auto min-h-0 w-full max-w-md flex-1 overflow-y-auto overscroll-contain px-3 py-2"
        style={{ paddingBottom: composerHeight + 12 }}
      >
        {listPhase === 'loading' && !initialHydrationComplete ? (
          <p className="py-8 text-center text-sm text-gray-400">불러오는 중…</p>
        ) : listPhase === 'error' ? (
          <div className="py-8 text-center">
            <p className="text-sm font-semibold text-rose-700">{listError}</p>
            <button
              type="button"
              onClick={() => void retryListLoad()}
              className="mt-3 rounded-lg bg-rose-600 px-4 py-2 text-sm font-bold text-white"
            >
              재시도
            </button>
          </div>
        ) : recentMessages.length === 0 ? (
          <p className="py-12 text-center text-sm text-gray-400">메시지가 없습니다</p>
        ) : (
          <div className="space-y-2 pb-2">
            {recentMessages.map((m) => {
              const mine = chatSendUserId && String(m.user_id) === String(chatSendUserId);
              const viewerLang: ChatLang = lang === 'ru' ? 'ru' : 'ko';
              const { primary, secondary, ttsText } = getMessageDisplayParts(m, viewerLang, {
                logContext: 'staff',
                selectedLang: lang
              });
              return (
                <div key={String(m.id)} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[88%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                      mine ? 'bg-blue-600 text-white' : 'bg-white text-gray-900'
                    }`}
                  >
                    <div className={`flex items-center justify-between gap-2 text-[10px] ${mine ? 'text-blue-100' : 'text-gray-400'}`}>
                      <span>
                        {m.room_no ? `${m.room_no}호` : '—'} · {m.sender_side || '?'}
                      </span>
                      {!mine && ttsText ? (
                        <button
                          type="button"
                          onClick={() => speakStaffRussian(ttsText)}
                          className="rounded px-1.5 py-0.5 text-[10px] font-bold text-blue-700"
                        >
                          🔊 {t(lang, 'readAloud')}
                        </button>
                      ) : null}
                    </div>
                    {m.image_url ? (
                      <img
                        src={m.image_url}
                        alt=""
                        className="mt-1 max-h-40 rounded-lg object-cover"
                      />
                    ) : null}
                    {primary ? (
                      <div className={`mt-0.5 font-medium ${mine ? '' : 'text-base'}`}>{primary}</div>
                    ) : null}
                    {secondary ? (
                      <div className={`mt-1 text-[11px] ${mine ? 'text-blue-100/80' : 'text-gray-500'}`}>
                        {secondary}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 하단 composer: 📷 🎤 입력 전송 */}
      <div
        ref={composerRef}
        className="fixed inset-x-0 z-50 border-t border-gray-200 bg-white shadow-[0_-4px_20px_rgba(0,0,0,0.1)]"
        style={{
          bottom: keyboardOffset,
          paddingBottom: 'max(env(safe-area-inset-bottom), 0px)'
        }}
      >
        <div className="mx-auto flex max-w-md items-center gap-1.5 px-2 py-2">
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handlePhotoSelected}
          />
          <button
            type="button"
            onClick={handlePhotoClick}
            disabled={sending}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-2xl active:bg-gray-200 disabled:opacity-40"
            aria-label="사진"
          >
            📷
          </button>
          <button
            type="button"
            onClick={handleVoiceClick}
            disabled={sending}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-2xl active:bg-gray-200 disabled:opacity-40"
            aria-label="음성"
          >
            🎤
          </button>
          <input
            ref={inputRef}
            type="text"
            enterKeyHint="send"
            autoComplete="off"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onFocus={handleComposerFocus}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              if (e.key === 'Enter') {
                e.preventDefault();
                handleComposerSend();
              }
            }}
            placeholder={t(lang, 'messagePlaceholder')}
            className="min-h-[48px] min-w-0 flex-1 rounded-xl border-2 border-gray-200 bg-gray-50 px-3 text-base outline-none focus:border-blue-500"
          />
          <button
            type="button"
            aria-disabled={!canComposerSend}
            onClick={handleComposerSend}
            className={`flex h-12 min-w-[64px] shrink-0 items-center justify-center rounded-xl text-sm font-extrabold text-white ${
              canComposerSend ? 'bg-gray-900' : 'bg-gray-400'
            }`}
          >
            {sending ? '…' : t(lang, 'send')}
          </button>
        </div>
      </div>

      {/* 객실 선택 전체 화면 */}
      {roomPickerOpen ? (
        <div className="fixed inset-0 z-[60] flex flex-col bg-white">
          <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3">
            <h2 className="text-lg font-extrabold text-gray-900">{t(lang, 'pickRoomTitle')}</h2>
            <button
              type="button"
              onClick={() => setRoomPickerOpen(false)}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-semibold text-gray-700"
            >
              {t(lang, 'close')}
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            <div className="mx-auto max-w-md space-y-3">
              {ROOM_GROUPS.map((g) => (
                <div key={g.floor} className="grid grid-cols-4 gap-2">
                  {g.rooms.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => selectRoom(r)}
                      className={`h-12 rounded-xl border-2 text-base font-extrabold active:scale-[0.98] ${roomButtonClass(roomNo === r)}`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

export default function StaffChatPage() {
  return <StaffChatPageInner />;
}
