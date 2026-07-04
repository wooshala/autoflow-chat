'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import EmojiPicker, { type EmojiClickData } from 'emoji-picker-react';
import Navigation from '@/components/Navigation';
import { ChatMessage, ISSUE_TYPES, ISSUE_UI, IssueType, SenderSide } from '@/lib/types';
import { type AutoflowUser, loadUser, logoutAndGoLogin, resolveChatSendUserId, runSessionMigration } from '@/lib/auth';
import ChatMessages from '@/components/ChatMessages';
import StaffChatAdminSection from '@/components/chat/StaffChatAdminSection';
import StaffInvitePanel from '@/components/chat/StaffInvitePanel';
import TauriUpdatePanel from '@/components/chat/TauriUpdatePanel';
import StaffInviteQrCard from '@/components/chat/StaffInviteQrCard';
import { createClient as createBrowserSupabase } from '@/utils/supabase/client';
import { CHAT_CALL_URL, CHAT_DELETE_URL, CHAT_MANUAL_TICKET_URL, CHAT_SEND_URL } from '@/lib/chatApi';
import ChatToastStack from '@/components/chat/ChatToastStack';
import ChatNotifyDiagBar from '@/components/chat/ChatNotifyDiagBar';
import ChatTraceDiagButton from '@/components/chat/ChatTraceDiagButton';
import StaffNoticeAdminCard from '@/components/chat/StaffNoticeAdminCard';
import StaffAccountAdminCard from '@/components/chat/StaffAccountAdminCard';
import { useChatLoader } from '@/lib/hooks/useChatLoader';
import { useChatNotifications } from '@/lib/hooks/useChatNotifications';
import { useChatReadState } from '@/lib/hooks/useChatReadState';
import { pcReaderId } from '@/lib/chat/readerIdentity';
import { useChatRealtime } from '@/lib/hooks/useChatRealtime';
import { useChatRefetchFallback } from '@/lib/hooks/useChatRefetchFallback';
import { useChatVisibleTrace } from '@/lib/hooks/useChatVisibleTrace';
import { registerChatSyncProbe, latestMessageMeta } from '@/lib/chat/syncTrace';
import { useChatWatchdog } from '@/lib/hooks/useChatWatchdog';
import { isBrowserNotificationSupported, showBrowserNotification } from '@/lib/chat/browserNotifications';
import {
  createClientNonce,
  logSendApiResponded,
  logSendClick,
  lookupClientNonceForMessage,
  registerMessageIdForNonce
} from '@/lib/chat/sendTrace';
import { latApiResponded, latApiStart, latSendClick, setLatencySelf } from '@/lib/chat/latencyTrace';
import { unlockNotificationAudio } from '@/lib/chat/playNotificationTone';
import { useNotificationAudioUnlock } from '@/lib/hooks/useNotificationAudioUnlock';
import { useChatRenderTrace } from '@/lib/hooks/useChatRenderTrace';
import { fetchEnvelope } from '@/lib/api/envelope';
import { unwrapChatSendEnvelopeData } from '@/lib/api/unwrapChatSendResponse';
import {
  TIMEOUT_MS_CHAT_AUX,
  TIMEOUT_MS_CHAT_SEND,
  TIMEOUT_MS_MAINTENANCE_CREATE
} from '@/lib/api/timeouts';
import { log } from '@/lib/logger';
import { chatTrace, setChatTraceContext } from '@/lib/chat/chatTrace';
import { CHAT_CLIENT_REV, CHAT_PAGE_SOURCE } from '@/lib/chat/chatClientRev';

function getDeviceSide(): SenderSide {
  if (typeof navigator === 'undefined') return 'pc';
  const ua = navigator.userAgent.toLowerCase();
  return /android|iphone|ipad|ipod|mobile/.test(ua) ? 'mobile' : 'pc';
}

function readMobileChatViewport(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(max-width: 767px)').matches;
}

const MANAGER_MODE_STORAGE_KEY = 'autoflow_chat_manager_mode';

function readInitialManagerMode(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (new URLSearchParams(window.location.search).get('manager') === '1') return true;
    return sessionStorage.getItem(MANAGER_MODE_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export default function ChatPage() {
  // auth
  const router = useRouter();

  // chat state (supabase client + refs + state)
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const realtimeConnectedRef = useRef(false);
  const isMountedRef = useRef(false);
  const isLoadingRef = useRef(false);
  const lastLoadSourceRef = useRef<string | null>(null);
  const lastRealtimeActivityAtRef = useRef(Date.now());
  /** full_table 성공 후에만 갱신되는 안전 since (stale since/delta-only 방지) */
  const safeSinceRef = useRef<string | null>(null);
  /** INSERT postgres_changes만 기록 — SUBSCRIBED/UPDATE와 구분해 push 실패 확정용 */
  const lastRealtimeInsertPushAtRef = useRef<number | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  // [CHAT_RENDER_DUPLICATE_TRACE] source attribution (logging-only; no behavior change).
  const sendResponseIdsRef = useRef<Set<string>>(new Set());
  const realtimeSeenIdsRef = useRef<Set<string>>(new Set());
  const roomFilterRef = useRef<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const wasNearBottomRef = useRef(true);
  /** Stable handle so the once-mounted scroll effect can ping read-state advance. */
  const pingReadActivityRef = useRef<() => void>(() => {});
  const [sessionUser, setSessionUser] = useState<AutoflowUser | null>(null);
  const chatSendUserId = useMemo(() => resolveChatSendUserId(), []);

  useEffect(() => {
    console.log('[CHAT_PAGE_MOUNT]', {
      rev: CHAT_CLIENT_REV,
      page_source: CHAT_PAGE_SOURCE,
      href: typeof window !== 'undefined' ? window.location.href : null
    });
  }, []);

  useEffect(() => {
    console.log('[CHAT_SEND_USER_RESOLVED]', {
      userId: chatSendUserId,
      hasUserId: Boolean(chatSendUserId)
    });
  }, [chatSendUserId]);
  const { messages, setMessages, loadFull: hookLoadFull, initialHydrationComplete } = useChatLoader({
    loadingRef: isLoadingRef,
    syncClient: 'pc',
    messagesRef,
    roomFilterRef,
    initialListLimit: 500
  });

  const loadFull = useCallback(
    async (source: string) => {
      lastLoadSourceRef.current = source;
      const flBefore = messagesRef.current.length;
      const result = await hookLoadFull(source);
      // Loader applies via setMessages; messages_after here reads messagesRef which the
      // loader syncs on merge. Authoritative post-apply count is [CHAT_MESSAGES_AFTER_APPLY].
      console.log(
        '[CHAT_APPEND_FULLLOAD]',
        JSON.stringify({
          message_id: null,
          client_nonce: null,
          body: null,
          messages_before: flBefore,
          messages_after: messagesRef.current.length,
          mode: source
        })
      );
      return result;
    },
    [hookLoadFull]
  );

  const [text, setText] = useState('');
  const [roomNo, setRoomNo] = useState('');
  const [keypadOpen, setKeypadOpen] = useState(false);
  const [keypadNum, setKeypadNum] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [showMaintenance, setShowMaintenance] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [issueType, setIssueType] = useState<IssueType>('설비');
  const [submitting, setSubmitting] = useState(false);
  const [urgentMode, setUrgentMode] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [showOpsPanel, setShowOpsPanel] = useState(false);
  const [isManagerMode, setIsManagerMode] = useState(readInitialManagerMode);
  const [isMobileViewport, setIsMobileViewport] = useState(readMobileChatViewport);
  /** soft delete 진행 중 message id — 중복 요청 방지 */
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const buildTag = process.env.NEXT_PUBLIC_BUILD_TAG || 'dev-local';
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'degraded' | 'reconnecting'>('reconnecting');
  const [realtimeReconnectToken, setRealtimeReconnectToken] = useState(0);

  function getOrCreateDeviceId(): string {
    try {
      const key = 'autoflow_device_id';
      const existing = localStorage.getItem(key);
      if (existing) return existing;
      const generated = `dev-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      localStorage.setItem(key, generated);
      return generated;
    } catch {
      return 'dev-fallback';
    }
  }

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const syncMobile = () => {
      const mobile = mq.matches;
      setIsMobileViewport(mobile);
      if (mobile) setShowAdminPanel(false);
    };
    syncMobile();
    mq.addEventListener('change', syncMobile);
    return () => mq.removeEventListener('change', syncMobile);
  }, []);

  useEffect(() => {
    const r = new URLSearchParams(window.location.search).get('room');
    if (r) setRoomNo(r);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (new URLSearchParams(window.location.search).get('manager') === '1') {
      try {
        sessionStorage.setItem(MANAGER_MODE_STORAGE_KEY, '1');
      } catch {
        /* ignore */
      }
    }
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.ctrlKey || !e.shiftKey || (e.key !== 'D' && e.key !== 'd')) return;
      e.preventDefault();
      setIsManagerMode((prev) => {
        const next = !prev;
        try {
          if (next) sessionStorage.setItem(MANAGER_MODE_STORAGE_KEY, '1');
          else sessionStorage.removeItem(MANAGER_MODE_STORAGE_KEY);
        } catch {
          /* ignore */
        }
        if (!next) {
          setShowOpsPanel(false);
          setShowAdminPanel(false);
        }
        return next;
      });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    runSessionMigration();
    const u = loadUser();
    if (!u) {
      log.info('[LOGIN_REDIRECT]', {
        from: '/chat',
        to: '/login',
        reason: 'missing_autoflow_user_v1',
        has_mounted: isMountedRef.current,
        last_load_source: lastLoadSourceRef.current
      });
      router.replace('/login');
      return;
    }
    setSessionUser(u);
  }, [router]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Log-only: expose reconnectToken to loadFull traces (loader scope can't see it).
  useEffect(() => {
    setChatTraceContext({ reconnectToken: realtimeReconnectToken });
    chatTrace('reconnect_token_change', {
      id: null,
      source: 'reconnect_token_change',
      messages: messagesRef.current.length,
      extra: { reconnectToken: realtimeReconnectToken }
    });
  }, [realtimeReconnectToken]);

  const showChatTestNotification = useCallback(() => {
    void showBrowserNotification({
      title: 'AutoFlow 채팅',
      body: '알림이 정상적으로 작동합니다.',
      tag: 'chat-notify-test'
    });
  }, []);

  const { toasts, onToastClick, removeToast, permission: browserNotifyPermission, requestBrowserPermission } =
    useChatNotifications({
      messages,
      initialHydrationComplete,
      currentUserId: sessionUser && chatSendUserId ? chatSendUserId : null,
      roomNo,
      setRoomNo,
      router
    });
  const notificationAudioUnlocked = useNotificationAudioUnlock();

  // Read receipts (Phase 2A): /chat is the manager console → reader = user:<managerId>.
  const myReaderId = sessionUser && chatSendUserId ? pcReaderId(chatSendUserId) : null;
  const { computeRead: computeReadInfo, pingActivity: pingReadActivity } = useChatReadState({
    supabase,
    messages,
    myReaderId,
    roomId: null,
    enabled: Boolean(sessionUser),
    nearBottomRef: wasNearBottomRef
  });
  pingReadActivityRef.current = pingReadActivity;

  // Phase 2B Call: 재호출 a message's unread readers. Server enforces the 30s
  // cooldown + unread computation; realtime UPDATE propagates "호출됨".
  const handleCallMessage = useCallback(
    async (msg: ChatMessage) => {
      if (!myReaderId) return;
      const res = await fetchEnvelope<{ calledAt: string | null; unreadCount: number }>(CHAT_CALL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message_id: msg.id, caller_reader_id: myReaderId, room_id: null }),
        timeoutMs: TIMEOUT_MS_CHAT_AUX
      });
      if (!res.ok) {
        if (res.status === 429) return; // cooldown — button already reflects it
        log.warn('[CHAT_CALL_CLIENT_ERROR]', { status: res.status, error: res.error });
        return;
      }
      if (!res.data?.unreadCount) return; // everyone already read — nothing to call
      // Optimistic cooldown until realtime UPDATE echoes last_called_at.
      if (res.data.calledAt) {
        const calledAt = res.data.calledAt;
        setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, last_called_at: calledAt } : m)));
      }
    },
    [myReaderId, setMessages]
  );

  // PC: 객실 칩 필터 제거 — 전체 타임라인 표시
  const visibleMessages = messages;

  // [CHAT_MESSAGES_AFTER_APPLY] — logging-only. Fires once per applied messages change.
  // Duplicate arrays computed over the FULL array; raw id/nonce/body dumped as last-15 tail
  // to bound log size. No behavior change.
  useEffect(() => {
    const arr = messages;
    const ids = arr.map((m) => String(m?.id));
    const nonces = ids.map((id) => lookupClientNonceForMessage(id));
    const bodies = arr.map((m) => String((m as any)?.message ?? '').slice(0, 40));
    const dupOf = (list: (string | null)[]) => {
      const counts = new Map<string, number>();
      for (const v of list) {
        if (v == null || v === '') continue;
        counts.set(v, (counts.get(v) ?? 0) + 1);
      }
      return Array.from(counts.entries())
        .filter(([, c]) => c > 1)
        .map(([value, count]) => ({ value, count }));
    };
    console.log(
      '[CHAT_MESSAGES_AFTER_APPLY]',
      JSON.stringify({
        count: arr.length,
        ids_tail: ids.slice(-15),
        client_nonce_tail: nonces.slice(-15),
        body_tail: bodies.slice(-15),
        duplicate_ids: dupOf(ids),
        duplicate_client_nonce: dupOf(nonces),
        duplicate_body: dupOf(bodies)
      })
    );
  }, [messages]);

  // [CHAT_RENDER_DUPLICATE_TRACE] / [CHAT_RENDER_ARRAY_TRACE] — logging-only.
  // Only emits when the render array actually contains a duplicate candidate (same text or
  // same id appearing 2+ times). Attributes each entry to its source. No behavior change.
  useEffect(() => {
    const arr = visibleMessages;
    if (!arr || arr.length === 0) return;

    const isTmp = (id: string) => id.startsWith('tmp-') || id.startsWith('tmp_');
    const sourceHint = (id: string): string => {
      if (isTmp(id)) return 'optimistic';
      if (sendResponseIdsRef.current.has(id)) return 'send_response_or_realtime';
      if (realtimeSeenIdsRef.current.has(id)) return 'realtime_seen';
      return 'list_fetch_seen';
    };

    const ids = arr.map((m) => String(m?.id));
    const idCounts = new Map<string, number>();
    for (const id of ids) idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
    const duplicateIdCount = Array.from(idCounts.values()).filter((c) => c > 1).length;

    const groups = new Map<string, ChatMessage[]>();
    for (const m of arr) {
      const key = String((m as any)?.message ?? '').trim().slice(0, 40);
      if (!key) continue;
      const g = groups.get(key) ?? [];
      g.push(m);
      groups.set(key, g);
    }
    const dupGroups = Array.from(groups.entries()).filter(([, g]) => g.length > 1);

    if (dupGroups.length === 0 && duplicateIdCount === 0) return;

    for (const [prefix, g] of dupGroups) {
      console.log(
        '[CHAT_RENDER_DUPLICATE_TRACE]',
        JSON.stringify({
          text_prefix: prefix,
          count: g.length,
          entries: g.map((m) => {
            const id = String(m?.id);
            return {
              id,
              is_tmp_id: isTmp(id),
              client_nonce: lookupClientNonceForMessage(id),
              created_at: (m as any)?.created_at ?? null,
              sender_side: (m as any)?.sender_side ?? null,
              room_no: (m as any)?.room_no ?? null,
              source_hint: sourceHint(id),
              has_translated_ko: Boolean((m as any)?.translated_text?.ko),
              has_translated_ru: Boolean((m as any)?.translated_text?.ru)
            };
          })
        })
      );
    }

    console.log(
      '[CHAT_RENDER_ARRAY_TRACE]',
      JSON.stringify({
        total_count: arr.length,
        unique_id_count: new Set(ids).size,
        duplicate_id_count: duplicateIdCount,
        tmp_count: ids.filter(isTmp).length,
        latest_ids: ids.slice(-10)
      })
    );
  }, [visibleMessages]);

  useChatVisibleTrace({
    client: 'pc',
    messages,
    roomFilter: roomFilterRef.current,
    userFilter: null
  });

  const handleNotificationClick = useCallback(() => {
    const supported = isBrowserNotificationSupported();
    const permissionNow = supported ? Notification.permission : 'unsupported';
    console.log('[CHAT_NOTIFICATION_CLICK]', {
      supported,
      permission: permissionNow,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      pathname: typeof window !== 'undefined' ? window.location.pathname : ''
    });

    if (!supported) {
      return;
    }

    if (Notification.permission === 'denied') {
      window.alert(
        '브라우저에서 알림이 차단되어 있습니다. 주소창 왼쪽 자물쇠 아이콘에서 알림을 허용해 주세요.'
      );
      return;
    }

    if (Notification.permission === 'granted') {
      showChatTestNotification();
      return;
    }

    void requestBrowserPermission().then(() => {
      if (Notification.permission === 'granted') {
        showChatTestNotification();
      }
    });
  }, [requestBrowserPermission, showChatTestNotification]);

  const handleTestNotificationClick = useCallback(() => {
    console.log('[CHAT_NOTIFICATION_TEST]', {
      permission: typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported',
      pathname: typeof window !== 'undefined' ? window.location.pathname : ''
    });
    showChatTestNotification();
  }, [showChatTestNotification]);

  const handleEnableAlertSound = useCallback(() => {
    void unlockNotificationAudio();
  }, []);

  useChatRenderTrace(messages, initialHydrationComplete);
  useEffect(() => {
    setLatencySelf(getDeviceSide(), 'pc');
  }, []);

  const isNearBottom = () => {
    const el = listRef.current;
    if (!el) return false;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 100;
  };

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const onScroll = () => {
      wasNearBottomRef.current = isNearBottom();
      // Scroll-to-bottom (no new message) should also advance the read watermark.
      pingReadActivityRef.current?.();
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    // initialize once
    onScroll();
    return () => {
      el.removeEventListener('scroll', onScroll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (!wasNearBottomRef.current) return;
    // allow layout to settle after render
    requestAnimationFrame(() => {
      const node = listRef.current;
      if (!node) return;
      node.scrollTop = node.scrollHeight;
    });
  }, [messages.length]);

  // Stable realtime row-event handler: keeps useChatRealtime's subscribe effect from
  // re-running every render (which caused unsubscribe→subscribe churn → refetch storm).
  // Body reads only refs (messagesRef, realtimeSeenIdsRef) + module fns, so deps = [].
  const handleRowEvent = useCallback((e: { id: string; type: 'INSERT' | 'UPDATE' }) => {
    realtimeSeenIdsRef.current.add(String(e.id));
    const rtBefore = messagesRef.current.length;
    const existing = messagesRef.current.find((m) => String(m?.id) === String(e.id));
    chatTrace('realtime_enter', {
      id: String(e.id),
      client_nonce: lookupClientNonceForMessage(String(e.id)),
      room: (existing as any)?.room_no ?? null,
      source: `realtime_${e.type}`,
      messages: rtBefore
    });
    console.log(
      '[CHAT_APPEND_REALTIME]',
      JSON.stringify({
        message_id: e.id,
        type: e.type,
        client_nonce: lookupClientNonceForMessage(String(e.id)),
        body: existing ? String((existing as any)?.message ?? '').slice(0, 40) : null,
        messages_before: rtBefore,
        messages_after: e.type === 'INSERT' && !existing ? rtBefore + 1 : rtBefore
      })
    );
  }, []);

  // hooks
  const { handleRealtimeStatus, requestRefetch } = useChatRefetchFallback({
    loadFull: hookLoadFull,
    isLoadingRef,
    isMountedRef,
    reconnectToken: realtimeReconnectToken,
    listLimit: 500,
    lastRealtimeActivityAtRef,
    // B perf: realtime-quiet watchdog is the single fallback poller now; the blunt
    // 20s interval was redundant with realtime_quiet_watchdog_full. Event-driven
    // refetches (focus/visible/subscribed/reconnect/send_ack) stay active.
    enableIntervalPolling: false,
    pollIntervalMs: 20000,
    syncClient: 'pc'
  });

  useChatRealtime({
    supabase,
    setMessages,
    messagesRef,
    realtimeConnectedRef,
    lastRealtimeActivityAtRef,
    lastRealtimeInsertPushAtRef,
    reconnectToken: realtimeReconnectToken,
    onConnectionStatus: setConnectionStatus,
    onRealtimeStatus: handleRealtimeStatus,
    // Logging-only: record ids seen via realtime + trace the realtime append path.
    // Stable ref (useCallback []) so the subscribe effect does not churn per render.
    onRowEvent: handleRowEvent,
    syncClient: 'pc',
    currentUserId: chatSendUserId
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
    isMountedRef.current = true;
    return registerChatSyncProbe('pc', {
      dumpState: () => ({
        client: 'pc',
        message_count: messagesRef.current.length,
        latest_message_id: latestMessageMeta(messagesRef.current).id,
        latest_created_at: latestMessageMeta(messagesRef.current).created_at,
        realtime_status: realtimeConnectedRef.current ? 'SUBSCRIBED' : 'DISCONNECTED',
        realtime_connected: realtimeConnectedRef.current,
        reconnect_token: realtimeReconnectToken,
        selected_room_filter: roomFilterRef.current,
        user_filter: null,
        current_user_id: chatSendUserId,
        current_token_id: null,
        last_fetch_reason: null,
        last_fetch_at: null
      }),
      refetch: (reason) => requestRefetch(reason)
    });
  }, [chatSendUserId, realtimeReconnectToken, requestRefetch]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // render helpers
  const canSend = useMemo(() => Boolean(text.trim() || photo), [text, photo]);
  const canSendToServer = Boolean(sessionUser && chatSendUserId);
  const missingSendEnvMsg = '전송에 실패했습니다. 관리자 설정이 필요합니다.';

  async function sendMessage() {
    log.debug('[SEND_SUBMIT_START]', { hasUser: Boolean(sessionUser), canSend, submitting });
    if (submitting) {
      log.debug('[SEND_SUBMIT_BLOCKED_ALREADY_SUBMITTING]');
      return;
    }
    if (!sessionUser || !canSend) return;
    if (!chatSendUserId) {
      alert(missingSendEnvMsg);
      return;
    }
    const clientNonce = createClientNonce('pc');
    setSubmitting(true);
    const optimisticId = `tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const clientSendTs = Date.now();
    logSendClick(clientNonce);
    latSendClick({ client_nonce: clientNonce, sender_side: getDeviceSide(), room: roomNo || null, source: 'pc' });
    const optimisticMessage: ChatMessage = {
      id: optimisticId,
      user_id: chatSendUserId,
      message: text.trim(),
      message_type: photo ? 'image' : 'text',
      sender_side: getDeviceSide(),
      priority: urgentMode ? 'urgent' : 'normal',
      room_no: roomNo || null,
      image_url: photo ? preview || null : null,
      image_storage_path: null,
      original_lang: '',
      translated_text: null,
      back_translated_text: null,
      ticket_id: null,
      duplicate_ticket_id: null,
      ai_action: null,
      created_at: new Date().toISOString()
    };
    {
      const optBefore = messagesRef.current.length;
      console.log(
        '[CHAT_APPEND_OPTIMISTIC]',
        JSON.stringify({
          message_id: optimisticId,
          client_nonce: clientNonce,
          body: String(optimisticMessage.message ?? '').slice(0, 40),
          messages_before: optBefore,
          messages_after: optBefore + 1
        })
      );
      chatTrace('optimistic_append', {
        id: optimisticId,
        client_nonce: clientNonce,
        room: roomNo || null,
        source: 'pc_send',
        messages: optBefore + 1
      });
    }
    chatTrace('set_messages', {
      id: optimisticId,
      client_nonce: clientNonce,
      room: roomNo || null,
      source: 'optimistic_set',
      messages: messagesRef.current.length + 1
    });
    setMessages((prev) => [...prev, optimisticMessage]);
    try {
      const clientRequestId = clientNonce;
      const deviceId = getOrCreateDeviceId();
      const fd = new FormData();
      fd.append('user_id', chatSendUserId);
      fd.append('actor_name', sessionUser.name);
      fd.append('message', text.trim());
      fd.append('client_request_id', clientRequestId);
      fd.append('client_nonce', clientNonce);
      fd.append('client_send_ts', String(clientSendTs));
      fd.append('client_device_id', deviceId);
      fd.append('sender_side', getDeviceSide());
      fd.append('priority', urgentMode ? 'urgent' : 'normal');
      if (roomNo) fd.append('room_no', roomNo);
      if (photo) {
        log.debug('[CHAT_FILE_APPEND]', {
          name: photo.name,
          size: photo.size,
          type: photo.type
        });
        fd.append('image', photo);
      }

      latApiStart(clientNonce);
      const sendResult = await fetchEnvelope<{ message: ChatMessage; client_nonce?: string }>(CHAT_SEND_URL, {
        method: 'POST',
        body: fd,
        timeoutMs: TIMEOUT_MS_CHAT_SEND
      });

      console.log('[CHAT_AUTO_TICKET_RESPONSE]', sendResult);
      log.debug('[CHAT_SEND_CLIENT_ENVELOPE]', {
        ok: sendResult.ok,
        status: sendResult.status,
        ...(sendResult.ok
          ? {
              dataKeys:
                sendResult.data && typeof sendResult.data === 'object' ? Object.keys(sendResult.data as object) : [],
              unwrappedId: unwrapChatSendEnvelopeData(sendResult.data)?.id ?? null
            }
          : { error: sendResult.error, message: sendResult.message })
      });

      if (!sendResult.ok) {
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        log.error('[CHAT_SEND_CLIENT_ERROR]', sendResult);
        alert('전송에 실패했습니다. 잠시 후 다시 시도해 주세요.');
        return;
      }

      const saved = unwrapChatSendEnvelopeData(sendResult.data);
      if (!saved) {
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        log.error('[CHAT_SEND_ABNORMAL_RESPONSE]', {
          data: sendResult.data,
          hint: 'data.message가 plain object가 아니거나 id 없음, 또는 평면 data에 user_id/id 없음 (본문 .message 문자열로 판별 안 함)'
        });
        alert('채팅 응답이 비정상입니다.');
        return;
      }

      log.info('[SEND_RESPONSE_OK]', {
        client_nonce: clientNonce,
        echoed_client_nonce:
          sendResult.data && typeof sendResult.data === 'object'
            ? (sendResult.data as { client_nonce?: string }).client_nonce ?? null
            : null,
        message_id: saved.id,
        ai_action: saved.ai_action || null,
        ticket_id: saved.ticket_id || null
      });
      registerMessageIdForNonce(clientNonce, String(saved.id));
      logSendApiResponded(clientNonce, String(saved.id), saved.created_at);
      latApiResponded(clientNonce, String(saved.id), Boolean((saved as any)?.translated_text));
      sendResponseIdsRef.current.add(String(saved.id)); // logging-only: render trace source attribution
      chatTrace('send_success', {
        id: String(saved.id),
        client_nonce: clientNonce,
        room: roomNo || null,
        source: 'send_response',
        messages: messagesRef.current.length
      });
      // Reconcile (send-success path only): guarantee the optimistic tmp is removed AND the
      // saved message appears exactly once. WebView2 can deliver the realtime INSERT for
      // saved.id as a separate entry before this response returns; the old in-place map left
      // the tmp behind (tmp + real coexisting). Filter the tmp, then merge into the real row
      // if it already exists, otherwise append the saved row. No loader/realtime/global-dedupe change.
      chatTrace('set_messages', {
        id: String(saved.id),
        client_nonce: clientNonce,
        room: roomNo || null,
        source: 'reconcile_send_success',
        messages: messagesRef.current.length
      });
      setMessages((prev) => {
        const withoutTmp = prev.filter((m) => m.id !== optimisticId);
        const idx = withoutTmp.findIndex((m) => String(m.id) === String(saved.id));
        if (idx === -1) {
          return [...withoutTmp, { ...optimisticMessage, ...saved } as ChatMessage];
        }
        const next = [...withoutTmp];
        next[idx] = { ...next[idx], ...saved } as ChatMessage;
        return next;
      });
      void requestRefetch('send_ack');
      clearInput();
      setUrgentMode(false);
    } catch (error: any) {
      log.error('[CHAT_SEND_CLIENT_ERROR]', {
        error: error?.message || String(error)
      });
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      alert('채팅 전송 실패');
    } finally {
      setSubmitting(false);
    }
  }

  async function submitMaintenance() {
    if (submitting) {
      log.debug('[MAINTENANCE_SUBMIT_BLOCKED]', { reason: 'already_submitting' });
      return;
    }
    if (!sessionUser || !roomNo) return;
    if (!chatSendUserId) {
      alert(missingSendEnvMsg);
      return;
    }
    setSubmitting(true);
    try {
      const desc = text.trim() || `${issueType} 문제 발생`;

      const fd = new FormData();
      fd.append('room_no', roomNo);
      fd.append('issue_type', issueType);
      fd.append('description', desc);
      fd.append('created_by', chatSendUserId);
      if (photo) fd.append('image', photo);

      const mRes = await fetchEnvelope<{ ticket: unknown; chat_message: unknown }>('/api/maintenance/create', {
        method: 'POST',
        body: fd,
        envelope: false,
        timeoutMs: TIMEOUT_MS_MAINTENANCE_CREATE
      });

      if (!mRes.ok) {
        log.error('[MAINTENANCE_CREATE_CLIENT_ERROR]', mRes);
        alert('전송에 실패했습니다. 잠시 후 다시 시도해 주세요.');
        return;
      }

      const data = mRes.data;
      if (data?.chat_message) await loadFull('maintenance_success');

      setShowMaintenance(false);
      resetComposer();
    } finally {
      setSubmitting(false);
    }
  }

  async function createManualTicket(msg: ChatMessage) {
    if (!sessionUser || !msg?.id) return;
    if (!chatSendUserId) {
      alert(missingSendEnvMsg);
      return;
    }
    const roomInput = window.prompt('객실번호를 입력하세요 (예: 607)', msg.room_no || '');
    if (!roomInput) return;
    const roomNo = roomInput.replace(/[^\d]/g, '').slice(0, 4);
    if (!roomNo) return;
    const issueInput = window.prompt('이슈 유형 입력 (설비/청소/전기/가전/침구/기타)', '설비') || '설비';
    const issueType = (ISSUE_TYPES.includes(issueInput as IssueType) ? issueInput : '설비') as IssueType;

    const fd = new FormData();
    fd.append('room_no', roomNo);
    fd.append('issue_type', issueType);
    fd.append('description', msg.message || `${roomNo}호 수동 티켓 생성`);
    fd.append('created_by', chatSendUserId);
    const createdRes = await fetchEnvelope<{ ticket?: { id: string }; error?: string }>('/api/maintenance/create', {
      method: 'POST',
      body: fd,
      envelope: false,
      timeoutMs: TIMEOUT_MS_MAINTENANCE_CREATE
    });
    if (!createdRes.ok) {
      log.error('[MANUAL_TICKET_CREATE_CLIENT_ERROR]', createdRes);
      alert('전송에 실패했습니다. 잠시 후 다시 시도해 주세요.');
      return;
    }
    const createdData = createdRes.data;
    if (!createdData?.ticket?.id) {
      log.error('[MANUAL_TICKET_CREATE_CLIENT_ERROR]', createdData);
      alert(typeof createdData?.error === 'string' ? createdData.error : '수동 티켓 생성 실패');
      return;
    }

    const newTicketId = createdData.ticket.id;

    const linkResult = await fetchEnvelope<{
      message: { id: string; ticket_id: string; room_no: string | null; ai_action: string };
    }>(CHAT_MANUAL_TICKET_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message_id: msg.id,
        ticket_id: newTicketId,
        room_no: roomNo
      }),
      timeoutMs: TIMEOUT_MS_CHAT_AUX
    });
    if (!linkResult.ok) {
      log.error('[MANUAL_TICKET_LINK_CLIENT_ERROR]', linkResult);
      alert('전송에 실패했습니다. 잠시 후 다시 시도해 주세요.');
      return;
    }
    const linked = linkResult.data.message;
    log.debug('[SET_MESSAGES_COUNT]', {
      source: 'manual_ticket_link',
      message_id: msg.id
    });
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msg.id
          ? ({
              ...m,
              ticket_id: newTicketId,
              room_no: roomNo,
              ai_action: (linked?.ai_action || 'ticket_created_manual') as ChatMessage['ai_action']
            } as ChatMessage)
          : m
      )
    );
  }

  function clearInput() {
    setText('');
    setUrgentMode(false);
    try {
      if (preview) URL.revokeObjectURL(preview);
    } catch {}
    setPhoto(null);
    setPreview(null);
  }

  function resetComposer() {
    setText('');
    setPhoto(null);
    setPreview(null);
    setRoomNo('');
    setKeypadNum('');
    setShowMaintenance(false);
  }

  const logDeleteClientDebug = (...args: unknown[]) => {
    if (process.env.NODE_ENV === 'development') {
      log.debug(...args);
    }
  };

  async function handleDeleteMessage(msg: ChatMessage) {
    if (!sessionUser || !msg?.id) return;
    if (!chatSendUserId) {
      alert(missingSendEnvMsg);
      return;
    }
    if (msg.is_deleted) return;
    if (deletingMessageId) return;
    setDeletingMessageId(String(msg.id));
    try {
      const delResult = await fetchEnvelope<{ message: ChatMessage }>(CHAT_DELETE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message_id: msg.id, user_id: chatSendUserId }),
        timeoutMs: TIMEOUT_MS_CHAT_AUX
      });
      // [DEBUG] 추후 제거 가능
      logDeleteClientDebug('[CHAT_DELETE_CLIENT]', 'envelope', delResult);
      if (!delResult.ok) {
        alert('전송에 실패했습니다. 잠시 후 다시 시도해 주세요.');
        return;
      }
      const updated = delResult.data.message;
      logDeleteClientDebug('[CHAT_DELETE_CLIENT]', 'message.is_deleted', updated?.is_deleted ?? null);
      if (updated?.id) {
        setMessages((prev) => prev.map((m) => (String(m.id) === String(updated.id) ? { ...m, ...updated } : m)));
      } else {
        setMessages((prev) =>
          prev.map((m) =>
            String(m.id) === String(msg.id)
              ? { ...m, is_deleted: true, deleted_at: new Date().toISOString() }
              : m
          )
        );
      }
    } catch (e: any) {
      log.error('[CHAT_DELETE_CLIENT_ERROR]', e);
      alert(e?.message ? `메시지 삭제에 실패했습니다.\n${e.message}` : '메시지 삭제에 실패했습니다.');
    } finally {
      setDeletingMessageId(null);
    }
  }

  return (
    // 채팅 배경: 카카오 연파랑
    <main className="flex h-screen flex-col bg-[#B2C7D9]">

      {/* 헤더: 운영 모드 — 채팅 공간 우선 */}
      <header className="bg-gray-800 border-b border-gray-700 px-3 py-2 shrink-0">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="font-bold text-white">AutoFlow 채팅</div>
            {sessionUser ? (
              <div className="text-xs font-semibold text-gray-400">로그인: {sessionUser.name}</div>
            ) : null}
            {!canSendToServer ? (
              <div className="mt-0.5 text-xs font-semibold text-red-400">
                전송/티켓 생성이 비활성화되었습니다. 관리자 설정이 필요합니다.
              </div>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden text-[11px] text-gray-400 sm:inline">
              연결:{' '}
              {connectionStatus === 'connected'
                ? 'connected'
                : connectionStatus === 'degraded'
                  ? 'degraded'
                  : 'reconnecting'}
            </span>
            <button
              type="button"
              onClick={() => {
                if (!isManagerMode) {
                  setIsManagerMode(true);
                  try {
                    sessionStorage.setItem(MANAGER_MODE_STORAGE_KEY, '1');
                  } catch {
                    /* ignore */
                  }
                  setShowOpsPanel(true);
                  return;
                }
                setShowOpsPanel((open) => !open);
              }}
              className="rounded-lg border border-gray-600 bg-gray-700 px-2 py-1 text-xs font-semibold text-gray-200 hover:bg-gray-600"
            >
              {isManagerMode && showOpsPanel ? '관리 닫기' : '관리'}
            </button>
            <button
              onClick={() => {
                log.info('[LOGIN_REDIRECT]', { from: '/chat', to: '/login', reason: 'manual_logout' });
                logoutAndGoLogin(router);
              }}
              className="rounded-lg border border-gray-600 px-2 py-1 text-xs text-gray-400 hover:bg-gray-700"
            >
              로그아웃
            </button>
          </div>
        </div>
      </header>

      {isManagerMode && showOpsPanel ? (
        <div className="shrink-0 border-b border-gray-300 bg-gray-100 px-3 py-2 space-y-2">
          <div
            className="rounded border border-lime-400/80 bg-lime-950/80 px-2 py-1 font-mono text-xs font-bold text-lime-300"
            data-testid="chat-deploy-rev"
          >
            rev={CHAT_CLIENT_REV} · {CHAT_PAGE_SOURCE} · build: {buildTag}
          </div>
          <div className="flex flex-wrap items-start gap-3">
            <TauriUpdatePanel />
            <StaffInviteQrCard />
          </div>
          <ChatNotifyDiagBar onRequestPermission={handleNotificationClick} />
          <div className="flex flex-wrap items-center gap-2">
            <ChatTraceDiagButton />
          </div>
          <StaffNoticeAdminCard />
          <StaffAccountAdminCard />
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {!notificationAudioUnlocked ? (
              <button
                type="button"
                onClick={handleEnableAlertSound}
                className="rounded-lg border border-amber-500/60 bg-amber-950/40 px-2 py-1 font-semibold text-amber-200 hover:bg-amber-900/50"
              >
                🔊 알림음 켜기
              </button>
            ) : null}
            {browserNotifyPermission !== 'unsupported' && browserNotifyPermission !== 'granted' ? (
              <button
                type="button"
                onClick={handleNotificationClick}
                className="rounded-lg border border-sky-500/70 bg-sky-950/50 px-2 py-1 font-semibold text-sky-100 hover:bg-sky-900/60"
              >
                {browserNotifyPermission === 'denied'
                  ? '탭 밖 OS 알림 차단됨'
                  : '탭 밖 OS 알림 허용 (필수)'}
              </button>
            ) : null}
            {browserNotifyPermission === 'granted' ? (
              <button
                type="button"
                onClick={handleTestNotificationClick}
                className="rounded-lg border border-gray-600 bg-gray-700 px-2 py-1 font-medium text-gray-300 hover:bg-gray-600"
              >
                테스트 알림
              </button>
            ) : null}
            <span className="text-gray-600">
              브라우저 알림:{' '}
              {browserNotifyPermission === 'granted'
                ? '허용됨'
                : browserNotifyPermission === 'denied'
                  ? '차단됨'
                  : browserNotifyPermission === 'unsupported'
                    ? '미지원'
                    : '미설정'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowAdminPanel((open) => !open)}
            className="rounded-lg border border-yellow-500/50 bg-white px-3 py-1.5 text-xs font-semibold text-yellow-800 hover:bg-yellow-50"
          >
            {showAdminPanel ? '상태 문구 닫기' : '상태 문구 관리'}
          </button>
          <StaffInvitePanel variant="chat" collapsible defaultOpen={false} messages={messages} />
        </div>
      ) : null}

      <StaffInvitePanel summaryOnly messages={messages} />

      <ChatToastStack toasts={toasts} onToastClick={onToastClick} onDismiss={removeToast} />

      <StaffChatAdminSection open={showAdminPanel} />

      {/* 메시지 목록 — 배경 main에서 상속 */}
      <section ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-3 space-y-3">
        <ChatMessages
          messages={visibleMessages}
          currentUserId={sessionUser ? chatSendUserId : null}
          /* /chat is always the manager/admin console (resolveChatPageUserId →
             manager UUID); the server re-verifies role before deleting. */
          isAdmin={Boolean(sessionUser)}
          getReadInfo={computeReadInfo}
          onCallMessage={handleCallMessage}
          deletingMessageId={deletingMessageId}
          onDeleteMessage={handleDeleteMessage}
          onCreateManualTicket={createManualTicket}
        />
      </section>

      {/* 유지보수 패널: 다크 테마 */}
      {showMaintenance && (
        <div className="border-t border-gray-700 bg-gray-800 px-3 pt-3 pb-2">
          <div className="mb-2 text-xs font-bold text-gray-300">문제 유형</div>
          <div className="grid grid-cols-5 gap-2 mb-3">
            {ISSUE_TYPES.map((type) => (
              <button key={type} onClick={() => setIssueType(type)} className={`rounded-xl p-2 text-xs font-bold ${issueType === type ? ISSUE_UI[type].badge + ' ring-2 ring-yellow-400' : 'bg-gray-700 text-gray-300'}`}>
                <div>{ISSUE_UI[type].emoji}</div>
                <div>{type}</div>
              </button>
            ))}
          </div>
          {/* 유지보수 등록: 카카오 노랑 버튼 */}
          <button type="button" disabled={submitting} onClick={() => void submitMaintenance()} className="w-full rounded-xl bg-[#FEE500] text-gray-900 px-4 py-3 text-sm font-bold disabled:opacity-50">유지보수 등록</button>
        </div>
      )}

      {/* 입력 영역: 다크 테마 */}
      <div className="bg-gray-800 border-t border-gray-700 px-3 py-3 shrink-0">
        {/* 이모지 피커 팝업 */}
        {showEmojiPicker && (
          <div className="absolute bottom-36 left-2 z-50">
            <EmojiPicker
              onEmojiClick={(e: EmojiClickData) => {
                setText((prev) => prev + e.emoji);
                setShowEmojiPicker(false);
              }}
              height={380}
              width={320}
            />
          </div>
        )}
        <div className="mb-2 flex items-center gap-2">
          {/* 객실 선택: 선택 시 노랑 강조 */}
          <button onClick={() => setKeypadOpen(true)} className={`rounded-full px-3 py-1.5 text-xs font-bold ${roomNo ? 'bg-[#FEE500] text-gray-900 border border-yellow-400' : 'bg-gray-700 text-gray-400 border border-dashed border-gray-600'}`}>
            {roomNo ? `🏠 ${roomNo}호` : '🏠 객실 선택'}
          </button>
          {roomNo && <button onClick={() => setRoomNo('')} className="text-xs text-gray-400">초기화</button>}
          {photo && <span className="text-xs rounded-full bg-emerald-900/40 px-2 py-1 text-emerald-400">사진 선택됨</span>}
          {!showMaintenance && (roomNo || photo) && <button onClick={() => setShowMaintenance(true)} className="ml-auto rounded-full bg-[#FEE500] text-gray-900 px-3 py-1.5 text-xs font-bold">🔧 유지보수</button>}
        </div>
        {preview && <img src={preview} alt="preview" className="mb-2 h-20 w-20 rounded-xl object-cover" />}
        <div className="flex items-end gap-2">
          {/* 카메라 버튼 */}
          <button type="button" onClick={() => fileRef.current?.click()} className="h-11 w-11 shrink-0 rounded-full bg-gray-700 text-xl">
            📷
          </button>
          {/* 이모지 버튼 */}
          <button
            type="button"
            onClick={() => setShowEmojiPicker((v) => !v)}
            className={`h-11 w-11 shrink-0 rounded-full text-xl ${showEmojiPicker ? 'bg-yellow-400' : 'bg-gray-700'}`}
          >
            😊
          </button>
          <button
            type="button"
            onClick={() => setUrgentMode((v) => !v)}
            className={`h-11 shrink-0 rounded-lg border px-2 text-xs font-bold ${
              urgentMode
                ? 'border-orange-400 bg-orange-500 text-white'
                : 'border-gray-600 bg-gray-800 text-gray-300'
            }`}
            aria-pressed={urgentMode}
            title="긴급 메시지"
          >
            긴급 {urgentMode ? 'ON' : 'OFF'}
          </button>
          {/* 입력창: 다크 스타일 */}
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void sendMessage();
              }
            }}
            enterKeyHint="send"
            placeholder="메시지를 입력하세요 (Enter 전송 · Shift+Enter 줄바꿈)"
            rows={1}
            className="min-h-[44px] max-h-24 flex-1 resize-none rounded-2xl border border-gray-600 bg-gray-700 text-white placeholder-gray-400 px-4 py-3 outline-none focus:border-yellow-400 text-sm"
          />
          <button
            type="button"
            disabled={!canSend || submitting}
            onClick={() => clearInput()}
            className="h-11 shrink-0 rounded-lg border border-gray-600 px-2 text-xs text-gray-400 disabled:opacity-40 disabled:pointer-events-none hover:bg-gray-700"
          >
            취소
          </button>
          {/* 전송 버튼: 카카오 노랑 */}
          <button
            type="button"
            disabled={!canSend || submitting}
            onClick={() => {
              log.debug('[SEND_CLICK]', { canSend, submitting });
              void sendMessage();
            }}
            className="h-11 w-11 shrink-0 rounded-full bg-[#FEE500] text-gray-900 font-bold text-lg disabled:opacity-40"
          >
            {submitting ? '…' : '▶'}
          </button>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setPhoto(file);
            setPreview(URL.createObjectURL(file));
          }} />
        </div>
      </div>

      {/* 객실 키패드 오버레이 — 흰색 유지 (모달이라 독립적) */}
      {keypadOpen && (
        <div className="absolute inset-0 bg-black/40 flex items-end">
          <div className="w-full rounded-t-3xl bg-white p-4">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-gray-300" />
            <div className="mb-3 text-sm font-bold">객실 번호 입력</div>
            <div className="mb-3 rounded-2xl bg-gray-100 px-4 py-3 text-3xl font-extrabold text-gray-900">{keypadNum || '-'}</div>
            <div className="grid grid-cols-3 gap-3">
              {['1','2','3','4','5','6','7','8','9'].map((n) => <button key={n} onClick={() => setKeypadNum((p) => (p + n).slice(0, 4))} className="h-14 rounded-2xl bg-gray-100 text-2xl font-semibold">{n}</button>)}
              <button onClick={() => setKeypadOpen(false)} className="h-14 rounded-2xl text-sm font-semibold text-gray-500">닫기</button>
              <button onClick={() => setKeypadNum((p) => (p + '0').slice(0, 4))} className="h-14 rounded-2xl bg-gray-100 text-2xl font-semibold">0</button>
              <button onClick={() => setKeypadNum((p) => p.slice(0, -1))} className="h-14 rounded-2xl text-xl">⌫</button>
            </div>
            {/* 확인: 카카오 노랑 */}
            <button onClick={() => { setRoomNo(keypadNum); setKeypadOpen(false); }} className="mt-3 w-full rounded-2xl bg-[#FEE500] text-gray-900 px-4 py-3 font-bold">확인</button>
          </div>
        </div>
      )}

      <Navigation active="chat" />
    </main>
  );
}
