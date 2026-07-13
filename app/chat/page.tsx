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
import { createClient as createBrowserSupabase } from '@/utils/supabase/client';
import { CHAT_DELETE_URL, CHAT_MANUAL_TICKET_URL, CHAT_SEND_URL } from '@/lib/chatApi';
import ChatToastStack from '@/components/chat/ChatToastStack';
import ChatNotifyDiagBar from '@/components/chat/ChatNotifyDiagBar';
import { useChatLoader } from '@/lib/hooks/useChatLoader';
import { useChatNotifications } from '@/lib/hooks/useChatNotifications';
import { useChatRealtime } from '@/lib/hooks/useChatRealtime';
import { useChatWatchdog } from '@/lib/hooks/useChatWatchdog';
import { isBrowserNotificationSupported, showBrowserNotification } from '@/lib/chat/browserNotifications';
import {
  createClientNonce,
  logSendApiResponded,
  logSendClick,
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
import { CHAT_CLIENT_REV, CHAT_PAGE_SOURCE } from '@/lib/chat/chatClientRev';
import type { LostFoundMessageLink } from '@/lib/ops-events/lostFoundUi';
import type { LostFoundItemWithMatch } from '@/lib/ops-events/types';
import { isChatOpsConsoleEnabled } from '@/lib/ops-events/flags';
import ChatOpsConsoleHeader from '@/components/chat/ops-console/ChatOpsConsoleHeader';
import ChatOperationPanel from '@/components/chat/ops-console/ChatOperationPanel';
import ChatParticipantSidebar, {
  buildParticipantsFromMessages,
  buildRoomsFromMessages
} from '@/components/chat/ops-console/ChatParticipantSidebar';
import ChatRoomSidebar from '@/components/chat/ops-console/ChatRoomSidebar';
import { ChatPhotoLightboxProvider } from '@/components/chat/ChatPhotoLightbox';
import { useChatRooms } from '@/lib/hooks/useChatRooms';
import type { ChatRoomSummary } from '@/lib/types';
import {
  CHAT_SELECTED_ROOM_STORAGE_KEY,
  buildChatSearchWithRoom,
  isValidChatRoomSelection,
  readStoredSelectedRoomId,
  resolveInitialSelectedChatRoomId,
  shouldAcceptRealtimeRowForRoom,
  shouldApplySendResultForRoom
} from '@/lib/chat/chatRoomSelection';

function getDeviceSide(): SenderSide {
  if (typeof navigator === 'undefined') return 'pc';
  const ua = navigator.userAgent.toLowerCase();
  return /android|iphone|ipad|ipod|mobile/.test(ua) ? 'mobile' : 'pc';
}

function readMobileChatViewport(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(max-width: 767px)').matches;
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
  const listRef = useRef<HTMLDivElement | null>(null);
  const wasNearBottomRef = useRef(true);
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

  /** Phase 1.1: 실제 chat_rooms 기반 카카오톡형 왼쪽 목록. OFF면 기존 참여자/room_no 사이드바 유지. */
  const chatRoomLayoutV1 = process.env.NEXT_PUBLIC_CHAT_ROOM_LAYOUT_V1 === '1';
  /** Phase 1.2: 선택된 채팅방 UUID(chat_room_id). room_no(객실번호)와 절대 혼용 금지. */
  const [selectedChatRoomId, setSelectedChatRoomId] = useState<string | null>(null);

  // Phase 1.2.5 B: 방 목록을 page(controller)에서 소유(lift). flag OFF면 enabled=false → fetch 0.
  const {
    rooms: chatRooms,
    state: chatRoomsState,
    reload: reloadChatRooms,
    degraded: summaryDegraded
  } = useChatRooms(chatRoomLayoutV1);

  // Phase 1.2.6 8: 다중방인데 summary가 legacy(부정확)면 room mode를 활성화하지 않는다.
  //   잘못된 최근메시지 순서/preview를 정상처럼 보여주는 것보다, 기본방 1개 legacy는 정확하므로 허용.
  const summaryUntrustedMultiRoom = chatRooms.length > 1 && summaryDegraded;

  // Phase 1.2.5 B-1: room mode 활성 조건. 단순 flag가 아니라 "정상 방 목록 + 유효 선택"일 때만.
  //   이 조건이 아니면 legacy(글로벌) 경로로 fail-open — 보조 surface 실패가 전송을 죽이지 않는다.
  const roomModeActive =
    chatRoomLayoutV1 &&
    chatRoomsState === 'ready' &&
    chatRooms.length > 0 &&
    !summaryUntrustedMultiRoom &&
    isValidChatRoomSelection(selectedChatRoomId, chatRooms);
  // room 사이드바/헤더를 보여줄지(로딩·정상만). error/empty/다중방-degraded면 legacy UI로 fail-open.
  const roomSidebarVisible =
    chatRoomLayoutV1 && (chatRoomsState === 'loading' || chatRoomsState === 'ready') && !summaryUntrustedMultiRoom;
  // room API 로딩 실패(error) 또는 다중방 요약 부정확 — 비차단 안내 표시용.
  const roomLoadError = chatRoomLayoutV1 && chatRoomsState === 'error';

  // Phase 1.2.5 A-2/B: 전송이 귀속되는 "실효 방 컨텍스트"(room mode면 선택 방, 아니면 null=글로벌).
  //   비동기 응답 시점에 이 값이 바뀌었는지로 방 전환/모드 전환을 감지한다.
  const sendRoomContextRef = useRef<string | null>(null);
  sendRoomContextRef.current = roomModeActive ? selectedChatRoomId : null;

  const { messages, setMessages, loadFull: hookLoadFull, initialHydrationComplete } = useChatLoader({
    loadingRef: isLoadingRef,
    // flag OFF: undefined(기존 전역 동작). ON: room mode면 선택 방 필터, 아니면 null(글로벌 fail-open).
    //   항상 defined(null|uuid)로 넘겨 방 전환 effect의 undefined 예외를 피한다.
    chatRoomId: chatRoomLayoutV1 ? (roomModeActive ? selectedChatRoomId : null) : undefined
  });

  const loadFull = useCallback(
    async (source: string) => {
      lastLoadSourceRef.current = source;
      return await hookLoadFull(source);
    },
    [hookLoadFull]
  );

  // Phase 1.2: 방 목록 준비 시 초기 selectedChatRoomId 결정(URL query → localStorage → API 첫 방).
  //   유효하지 않은 후보는 무시하고 첫 방으로 폴백. 목록이 비면 null 유지.
  const selectionInitializedRef = useRef(false);
  useEffect(() => {
    if (!chatRoomLayoutV1) return;
    if (selectionInitializedRef.current) return;
    if (!chatRooms.length) return;
    let urlRoomId: string | null = null;
    let storedRoomId: string | null = null;
    try {
      urlRoomId = new URLSearchParams(window.location.search).get('chat_room_id');
    } catch {
      /* ignore */
    }
    try {
      storedRoomId = readStoredSelectedRoomId(window.localStorage.getItem(CHAT_SELECTED_ROOM_STORAGE_KEY));
    } catch {
      /* ignore */
    }
    const initial = resolveInitialSelectedChatRoomId({ urlRoomId, storedRoomId, rooms: chatRooms });
    selectionInitializedRef.current = true;
    if (initial) setSelectedChatRoomId(initial);
  }, [chatRoomLayoutV1, chatRooms]);

  // Phase 1.2: 선택 변경 시 URL(다른 query 보존)·localStorage 동기화(hard reload 없음).
  useEffect(() => {
    if (!chatRoomLayoutV1 || !selectedChatRoomId) return;
    try {
      window.localStorage.setItem(CHAT_SELECTED_ROOM_STORAGE_KEY, selectedChatRoomId);
    } catch {
      /* ignore */
    }
    try {
      const nextSearch = buildChatSearchWithRoom(window.location.search, selectedChatRoomId);
      if (nextSearch !== window.location.search) {
        router.replace(`${window.location.pathname}${nextSearch}`, { scroll: false });
      }
    } catch {
      /* ignore */
    }
  }, [chatRoomLayoutV1, selectedChatRoomId, router]);

  // Phase 1.2: 브라우저 back/forward 시 URL의 chat_room_id를 반영(목록에 존재할 때만).
  useEffect(() => {
    if (!chatRoomLayoutV1) return;
    const onPop = () => {
      try {
        const urlRoomId = new URLSearchParams(window.location.search).get('chat_room_id');
        if (isValidChatRoomSelection(urlRoomId, chatRooms)) setSelectedChatRoomId(urlRoomId);
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [chatRoomLayoutV1, chatRooms]);

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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  const [staffCounts, setStaffCounts] = useState<{ online: number; total: number }>({ online: 0, total: 0 });
  // Developer diagnostics are hidden in normal operation; shown only with ?debug=1
  // (or via 설정 > 고급 > 개발자 진단, which sets debugMode true).
  useEffect(() => {
    try {
      if (new URLSearchParams(window.location.search).get('debug') === '1') setDebugMode(true);
    } catch {
      /* ignore */
    }
  }, []);
  const [isMobileViewport, setIsMobileViewport] = useState(readMobileChatViewport);
  /** soft delete 진행 중 message id — 중복 요청 방지 */
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const buildTag = process.env.NEXT_PUBLIC_BUILD_TAG || 'dev-local';
  const lostFoundEnabled = process.env.NEXT_PUBLIC_OPS_LOST_FOUND_ENABLED === '1';
  /** LF-3B UX PoC: photo → ops-event entry (Preview; gated with lost-found flag) */
  const photoOpsUxEnabled = lostFoundEnabled;
  const [opsUxToast, setOpsUxToast] = useState<string | null>(null);
  /** 시설고장 등록 성공 시 증가 → Event Center 시설고장 탭 목록 재조회 트리거. */
  const [maintenanceRefreshKey, setMaintenanceRefreshKey] = useState(0);
  const opsConsoleEnabled = isChatOpsConsoleEnabled();
  const showOpsConsole = opsConsoleEnabled && !isMobileViewport;
  const [lostFoundByMessageId, setLostFoundByMessageId] = useState<Record<string, LostFoundMessageLink>>({});
  const [lostFoundItems, setLostFoundItems] = useState<LostFoundItemWithMatch[]>([]);
  const [consoleRoomNo, setConsoleRoomNo] = useState<string | null>(null);

  const loadLostFoundIndex = useCallback(async (): Promise<LostFoundItemWithMatch[]> => {
    if (!lostFoundEnabled) return [];
    const r = await fetchEnvelope<{ items: LostFoundItemWithMatch[] }>('/api/ops-events/lost-found', {
      cache: 'no-store',
      timeoutMs: TIMEOUT_MS_CHAT_AUX
    });
    if (!r.ok) return [];
    const items = r.data.items || [];
    setLostFoundItems(items);
    const next: Record<string, LostFoundMessageLink> = {};
    for (const item of items) {
      if (item.origin_message_id) {
        next[item.origin_message_id] = { id: item.id, event_no: item.event_no };
      }
    }
    setLostFoundByMessageId(next);
    return items;
  }, [lostFoundEnabled]);

  useEffect(() => {
    void loadLostFoundIndex();
  }, [loadLostFoundIndex]);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'degraded' | 'reconnecting'>('reconnecting');
  const [realtimeReconnectToken, setRealtimeReconnectToken] = useState(0);
  // 숙박일지(관리모드)에서 넘어온 경우의 복귀 URL. http(s) 절대 URL만 허용(스킴 인젝션 차단).
  const [returnToUrl, setReturnToUrl] = useState<string | null>(null);
  useEffect(() => {
    try {
      const raw = new URLSearchParams(window.location.search).get('returnTo');
      if (!raw) return;
      const decoded = decodeURIComponent(raw);
      if (/^https?:\/\//i.test(decoded)) setReturnToUrl(decoded);
    } catch {
      /* ignore */
    }
  }, []);

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

  const showChatTestNotification = useCallback(() => {
    void showBrowserNotification({
      title: 'AutoFlow 채팅',
      body: '알림이 정상적으로 작동합니다.',
      tag: 'chat-notify-test'
    });
  }, []);

  const showOpsUxToast = useCallback((message: string) => {
    setOpsUxToast(message);
    window.setTimeout(() => setOpsUxToast(null), 2600);
  }, []);

  /** Focus Event Center list — never navigate to /ops or open detail. */
  const focusLostFoundList = useCallback(() => {
    if (!lostFoundEnabled) return;
    if (!showOpsConsole) {
      showOpsUxToast('우측 분실물 목록에서 확인하세요.');
      return;
    }
    const el = document.getElementById('event-center-lost-found');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
      showOpsUxToast('우측 분실물 목록에서 확인하세요.');
    }
  }, [lostFoundEnabled, showOpsConsole, showOpsUxToast]);

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

  // hooks
  useChatRealtime({
    supabase,
    setMessages,
    messagesRef,
    realtimeConnectedRef,
    lastRealtimeActivityAtRef,
    lastRealtimeInsertPushAtRef,
    reconnectToken: realtimeReconnectToken,
    onConnectionStatus: setConnectionStatus,
    // Phase 1.2 §16 임시 방어: 다른 방 수신 행은 현재 타임라인에 반영하지 않음(null-permissive).
    //   room mode 활성 시에만 적용. 비활성(글로벌 fail-open)이면 모든 행 수용.
    //   subscription lifecycle은 변경하지 않고 hook 내부 ref로만 읽힘. 엄격 격리는 Phase 1.3.
    acceptRow: roomModeActive
      ? (row) => shouldAcceptRealtimeRowForRoom(row?.chat_room_id ?? null, selectedChatRoomId)
      : undefined
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
    // Initial load / retry / abort/reset are handled by `useChatLoader`.
    // Keep mount/unmount flag for non-loader effects.
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // render helpers
  // Phase 1.2.5 B-3: room mode가 확정되지 않으면(로딩/실패/빈목록) 전송을 막지 않는다(fail-open).
  //   room mode 활성 시엔 roomModeActive가 이미 유효 선택을 보장하므로 별도 방 게이트가 불필요.
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
    // Phase 1.2: 전송 시작 시점의 실효 방 컨텍스트를 캡처(전송 중 전환돼도 이 메시지는 캡처 방에 귀속).
    //   room mode면 선택 방 UUID, 아니면 null(글로벌 fail-open).
    const targetChatRoomId = sendRoomContextRef.current;
    // Phase 1.2.5 A-2: 응답 시점에 실효 방 컨텍스트가 그대로면 현재 타임라인/입력에 반영. 바뀌었으면 건드리지 않음.
    const targetRoomStillCurrent = () =>
      shouldApplySendResultForRoom(targetChatRoomId, sendRoomContextRef.current);
    const optimisticMessage: ChatMessage = {
      id: optimisticId,
      chat_room_id: targetChatRoomId,
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
      // Phase 1.2: 선택 방으로 저장(room_no와 별개 필드로 함께 전송). 개념 분리 유지.
      if (targetChatRoomId) fd.append('chat_room_id', targetChatRoomId);
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
        if (targetRoomStillCurrent()) alert('전송에 실패했습니다. 잠시 후 다시 시도해 주세요.');
        return;
      }

      const saved = unwrapChatSendEnvelopeData(sendResult.data);
      if (!saved) {
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        log.error('[CHAT_SEND_ABNORMAL_RESPONSE]', {
          data: sendResult.data,
          hint: 'data.message가 plain object가 아니거나 id 없음, 또는 평면 data에 user_id/id 없음 (본문 .message 문자열로 판별 안 함)'
        });
        if (targetRoomStillCurrent()) alert('채팅 응답이 비정상입니다.');
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
      // Phase 1.2.5 A-2: 전송 중 방이 바뀌었으면 현재 방 타임라인/입력/urgent를 건드리지 않는다.
      //   DB 저장은 성공(원래 방 재진입 시 재조회로 표시) — 실패로 처리하지 않는다.
      if (!targetRoomStillCurrent()) {
        log.info('[SEND_MERGE_SKIP_ROOM_SWITCHED]', {
          target_chat_room_id: targetChatRoomId,
          current_chat_room_id: sendRoomContextRef.current,
          message_id: String(saved.id)
        });
        return;
      }
      setMessages((prev) => prev.map((m) => (m.id === optimisticId ? ({ ...m, ...saved } as ChatMessage) : m)));
      clearInput();
      setUrgentMode(false);
    } catch (error: any) {
      log.error('[CHAT_SEND_CLIENT_ERROR]', {
        error: error?.message || String(error)
      });
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      if (targetRoomStillCurrent()) alert('채팅 전송 실패');
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

  async function registerLostFound(msg: ChatMessage) {
    if (!sessionUser || !msg?.id) return;
    if (!chatSendUserId) {
      alert(missingSendEnvMsg);
      return;
    }
    if (!msg.image_url && !msg.image_storage_path) {
      alert('사진 메시지만 분실물 등록할 수 있습니다.');
      return;
    }
    if (msg.ticket_id) {
      alert('이미 시설고장으로 등록된 사진입니다.');
      return;
    }

    const existingLink = lostFoundByMessageId[msg.id];
    if (existingLink) {
      focusLostFoundList();
      return;
    }

    const itemDescription =
      String(msg.message || '').trim() ||
      (msg.room_no ? `${msg.room_no}호 분실물` : '분실물');

    const result = await fetchEnvelope<{ item: LostFoundItemWithMatch }>(
      '/api/ops-events/lost-found',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin_message_id: msg.id,
          item_description: itemDescription,
          actor_id: chatSendUserId
        }),
        timeoutMs: TIMEOUT_MS_CHAT_AUX
      }
    );
    if (!result.ok) {
      if (result.status === 409 || result.error === 'CONFLICT') {
        await loadLostFoundIndex();
        focusLostFoundList();
        return;
      }
      log.error('[LOST_FOUND_REGISTER_CLIENT_ERROR]', result);
      alert(result.message || '분실물 등록에 실패했습니다.');
      return;
    }
    const item = result.data.item;
    setLostFoundByMessageId((prev) => ({
      ...prev,
      [msg.id]: { id: item.id, event_no: item.event_no }
    }));
    setLostFoundItems((prev) => [item, ...prev.filter((row) => row.id !== item.id)]);
    void loadLostFoundIndex();
    focusLostFoundList();
  }

  function handleLostFoundPhotoClick(msg: ChatMessage) {
    const existing = lostFoundByMessageId[msg.id];
    if (existing) {
      focusLostFoundList();
      return;
    }
    void registerLostFound(msg);
  }

  async function registerMaintenanceFromPhoto(msg: ChatMessage) {
    if (!sessionUser || !msg?.id || !msg.image_url) return;
    if (!chatSendUserId) {
      alert(missingSendEnvMsg);
      return;
    }
    if (msg.ticket_id) {
      alert('이미 시설고장으로 등록된 사진입니다.');
      return;
    }
    if (lostFoundByMessageId[msg.id]) {
      alert('이미 분실물로 등록된 사진입니다.');
      return;
    }

    const roomInput = msg.room_no || window.prompt('객실번호를 입력하세요 (예: 201)', msg.room_no || '');
    if (!roomInput) return;
    const roomNo = roomInput.replace(/[^\d]/g, '').slice(0, 4);
    if (!roomNo) return;
    const issueInput = window.prompt('이슈 유형 입력 (설비/청소/전기/가전/침구/기타)', '설비') || '설비';
    const issueType = (ISSUE_TYPES.includes(issueInput as IssueType) ? issueInput : '설비') as IssueType;
    const description = msg.message?.trim() || `${roomNo}호 시설고장`;

    const fd = new FormData();
    fd.append('room_no', roomNo);
    fd.append('issue_type', issueType);
    fd.append('description', description);
    fd.append('created_by', chatSendUserId);

    try {
      const imgRes = await fetch(msg.image_url);
      const blob = await imgRes.blob();
      fd.append('image', new File([blob], 'photo.jpg', { type: blob.type || 'image/jpeg' }));
    } catch (e) {
      log.error('[MAINTENANCE_PHOTO_FETCH_ERROR]', e);
    }

    const createdRes = await fetchEnvelope<{ ticket?: { id: string }; error?: string }>('/api/maintenance/create', {
      method: 'POST',
      body: fd,
      envelope: false,
      timeoutMs: TIMEOUT_MS_MAINTENANCE_CREATE
    });
    if (!createdRes.ok) {
      log.error('[MAINTENANCE_PHOTO_CREATE_CLIENT_ERROR]', createdRes);
      alert('전송에 실패했습니다. 잠시 후 다시 시도해 주세요.');
      return;
    }
    const createdData = createdRes.data;
    if (!createdData?.ticket?.id) {
      alert(typeof createdData?.error === 'string' ? createdData.error : '시설고장 등록 실패');
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
      log.error('[MAINTENANCE_PHOTO_LINK_CLIENT_ERROR]', linkResult);
      alert('전송에 실패했습니다. 잠시 후 다시 시도해 주세요.');
      return;
    }
    const linked = linkResult.data.message;
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
    // 등록(create + manual-ticket) 전체 성공 확정 후에만 Event Center 시설고장 목록을 갱신한다.
    setMaintenanceRefreshKey((v) => v + 1);
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

  const consoleParticipants = useMemo(() => buildParticipantsFromMessages(messages), [messages]);
  const consoleRooms = useMemo(() => buildRoomsFromMessages(messages), [messages]);
  /** Phase 1.2: 중앙 헤더용 선택 방 요약. */
  const selectedRoom = useMemo(
    () => chatRooms.find((r) => r.id === selectedChatRoomId) ?? null,
    [chatRooms, selectedChatRoomId]
  );
  const recentPhotoMessage = useMemo(() => {
    const list = messages.filter((m) => m.image_url && !m.is_deleted);
    const filtered = consoleRoomNo ? list.filter((m) => m.room_no === consoleRoomNo) : list;
    return filtered.length > 0 ? filtered[filtered.length - 1]! : null;
  }, [messages, consoleRoomNo]);

  const browserNotifyShortLabel =
    browserNotifyPermission === 'granted'
      ? '브라우저 알림 허용됨'
      : browserNotifyPermission === 'denied'
        ? '브라우저 알림 차단'
        : '브라우저 알림 미설정';

  const chatMessageList = (
    <section ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-3 space-y-3">
      <ChatMessages
        messages={messages}
        currentUserId={sessionUser ? chatSendUserId : null}
        isAdmin={Boolean(sessionUser)}
        deletingMessageId={deletingMessageId}
        onDeleteMessage={handleDeleteMessage}
        onCreateManualTicket={createManualTicket}
        lostFoundEnabled={lostFoundEnabled}
        lostFoundByMessageId={lostFoundByMessageId}
        onRegisterLostFound={lostFoundEnabled ? handleLostFoundPhotoClick : undefined}
        onRegisterMaintenanceFromPhoto={photoOpsUxEnabled ? registerMaintenanceFromPhoto : undefined}
        onPhotoOpsOther={photoOpsUxEnabled ? () => showOpsUxToast('준비 중입니다.') : undefined}
        photoOpsUxEnabled={photoOpsUxEnabled}
        stayOnChat={lostFoundEnabled || showOpsConsole || photoOpsUxEnabled}
        eventCenterEnabled={lostFoundEnabled && showOpsConsole}
        onFocusLostFoundList={lostFoundEnabled ? focusLostFoundList : undefined}
      />
    </section>
  );

  const maintenancePanel = showMaintenance ? (
    <div className="border-t border-gray-700 bg-gray-800 px-3 pt-3 pb-2">
      <div className="mb-2 text-xs font-bold text-gray-300">문제 유형</div>
      <div className="mb-3 grid grid-cols-5 gap-2">
        {ISSUE_TYPES.map((type) => (
          <button
            key={type}
            onClick={() => setIssueType(type)}
            className={`rounded-xl p-2 text-xs font-bold ${issueType === type ? ISSUE_UI[type].badge + ' ring-2 ring-yellow-400' : 'bg-gray-700 text-gray-300'}`}
          >
            <div>{ISSUE_UI[type].emoji}</div>
            <div>{type}</div>
          </button>
        ))}
      </div>
      <button
        type="button"
        disabled={submitting}
        onClick={() => void submitMaintenance()}
        className="w-full rounded-xl bg-[#FEE500] px-4 py-3 text-sm font-bold text-gray-900 disabled:opacity-50"
      >
        유지보수 등록
      </button>
    </div>
  ) : null;

  const chatComposer = (
    <div className="shrink-0 border-t border-gray-700 bg-gray-800 px-3 py-3">
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
        <button
          onClick={() => setKeypadOpen(true)}
          className={`rounded-full px-3 py-1.5 text-xs font-bold ${roomNo ? 'border border-yellow-400 bg-[#FEE500] text-gray-900' : 'border border-dashed border-gray-600 bg-gray-700 text-gray-400'}`}
        >
          {roomNo ? `🏠 ${roomNo}호` : '🏠 객실 선택'}
        </button>
        {roomNo && (
          <button onClick={() => setRoomNo('')} className="text-xs text-gray-400">
            초기화
          </button>
        )}
        {photo && (
          <span className="rounded-full bg-emerald-900/40 px-2 py-1 text-xs text-emerald-400">사진 선택됨</span>
        )}
        {!showMaintenance && (roomNo || photo) && (
          <button
            onClick={() => setShowMaintenance(true)}
            className="ml-auto rounded-full bg-[#FEE500] px-3 py-1.5 text-xs font-bold text-gray-900"
          >
            🔧 유지보수
          </button>
        )}
      </div>
      {preview && <img src={preview} alt="preview" className="mb-2 h-20 w-20 rounded-xl object-cover" />}
      <div className="flex items-end gap-2">
        <button type="button" onClick={() => fileRef.current?.click()} className="h-11 w-11 shrink-0 rounded-full bg-gray-700 text-xl">
          📷
        </button>
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
            urgentMode ? 'border-orange-400 bg-orange-500 text-white' : 'border-gray-600 bg-gray-800 text-gray-300'
          }`}
          aria-pressed={urgentMode}
          title="긴급 메시지"
        >
          긴급 {urgentMode ? 'ON' : 'OFF'}
        </button>
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
          className="max-h-24 min-h-[44px] flex-1 resize-none rounded-2xl border border-gray-600 bg-gray-700 px-4 py-3 text-sm text-white outline-none placeholder:text-gray-400 focus:border-yellow-400"
        />
        <button
          type="button"
          disabled={!canSend || submitting}
          onClick={() => clearInput()}
          className="h-11 shrink-0 rounded-lg border border-gray-600 px-2 text-xs text-gray-400 hover:bg-gray-700 disabled:pointer-events-none disabled:opacity-40"
        >
          취소
        </button>
        <button
          type="button"
          disabled={!canSend || submitting}
          onClick={() => {
            log.debug('[SEND_CLICK]', { canSend, submitting });
            void sendMessage();
          }}
          className="h-11 w-11 shrink-0 rounded-full bg-[#FEE500] text-lg font-bold text-gray-900 disabled:opacity-40"
        >
          {submitting ? '…' : '▶'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setPhoto(file);
            setPreview(URL.createObjectURL(file));
          }}
        />
      </div>
    </div>
  );

  const keypadOverlay = keypadOpen ? (
    <div className="absolute inset-0 flex items-end bg-black/40">
      <div className="w-full rounded-t-3xl bg-white p-4">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-gray-300" />
        <div className="mb-3 text-sm font-bold">객실 번호 입력</div>
        <div className="mb-3 rounded-2xl bg-gray-100 px-4 py-3 text-3xl font-extrabold text-gray-900">{keypadNum || '-'}</div>
        <div className="grid grid-cols-3 gap-3">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((n) => (
            <button
              key={n}
              onClick={() => setKeypadNum((p) => (p + n).slice(0, 4))}
              className="h-14 rounded-2xl bg-gray-100 text-2xl font-semibold"
            >
              {n}
            </button>
          ))}
          <button onClick={() => setKeypadOpen(false)} className="h-14 rounded-2xl text-sm font-semibold text-gray-500">
            닫기
          </button>
          <button
            onClick={() => setKeypadNum((p) => (p + '0').slice(0, 4))}
            className="h-14 rounded-2xl bg-gray-100 text-2xl font-semibold"
          >
            0
          </button>
          <button onClick={() => setKeypadNum((p) => p.slice(0, -1))} className="h-14 rounded-2xl text-xl">
            ⌫
          </button>
        </div>
        <button
          onClick={() => {
            setRoomNo(keypadNum);
            setKeypadOpen(false);
          }}
          className="mt-3 w-full rounded-2xl bg-[#FEE500] px-4 py-3 font-bold text-gray-900"
        >
          확인
        </button>
      </div>
    </div>
  ) : null;

  if (showOpsConsole) {
    return (
      <ChatPhotoLightboxProvider>
      <main className="relative flex h-screen flex-col bg-white">
        <ChatOpsConsoleHeader
          connectionStatus={connectionStatus}
          onlineCount={Math.max(consoleParticipants.filter((p) => p.online).length, 1)}
          browserNotifyLabel={browserNotifyShortLabel}
          onOpenSettings={() => setShowAdminPanel((o) => !o)}
          onLogout={() => {
            log.info('[LOGIN_REDIRECT]', { from: '/chat', to: '/login', reason: 'manual_logout' });
            logoutAndGoLogin(router);
          }}
        />
        <ChatToastStack toasts={toasts} onToastClick={onToastClick} onDismiss={removeToast} />
        {opsUxToast ? (
          <div className="pointer-events-none fixed bottom-24 left-1/2 z-[10000] -translate-x-1/2 rounded-lg bg-gray-900/90 px-4 py-2 text-sm font-medium text-white shadow-lg">
            {opsUxToast}
          </div>
        ) : null}
        <StaffChatAdminSection open={showAdminPanel} />
        <div className="flex min-h-0 flex-1">
          {roomSidebarVisible ? (
            <ChatRoomSidebar
              participants={consoleParticipants}
              rooms={chatRooms}
              status={chatRoomsState}
              selectedChatRoomId={selectedChatRoomId}
              onSelectRoom={setSelectedChatRoomId}
              onRetry={reloadChatRooms}
            />
          ) : (
            <ChatParticipantSidebar
              participants={consoleParticipants}
              rooms={consoleRooms}
              selectedRoomNo={consoleRoomNo}
              onSelectRoom={setConsoleRoomNo}
            />
          )}
          <div className="flex min-w-0 flex-1 flex-col bg-[#B2C7D9]">
            <div className="shrink-0 border-b border-gray-300/50 bg-[#B2C7D9] px-3 py-2 text-xs text-gray-700">
              {roomSidebarVisible ? (
                selectedRoom ? (
                  <>
                    <span className="font-bold">{selectedRoom.name}</span>
                    <span className="ml-2 text-gray-500">· 참여자 {selectedRoom.participant_count}명</span>
                  </>
                ) : (
                  <span className="font-bold text-gray-500">채팅방을 선택하세요.</span>
                )
              ) : (
                <>
                  <span className="font-bold">대화 타임라인</span>
                  {consoleRoomNo ? <span className="ml-2 text-gray-500">· {consoleRoomNo}호</span> : null}
                </>
              )}
            </div>
            {/* Phase 1.2.5 B-2 / 1.2.6 8: 비차단 안내(입력창/Event Center를 가리지 않는 얇은 바). 전송은 계속 가능. */}
            {roomLoadError || summaryUntrustedMultiRoom ? (
              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-amber-300 bg-amber-50 px-3 py-1.5 text-[11px] text-amber-800">
                <span>
                  {summaryUntrustedMultiRoom
                    ? '채팅방 요약이 정확하지 않아(RPC 미적용) 채팅방 모드를 비활성화했습니다. 기존 채팅 모드로 이용합니다.'
                    : '채팅방 목록을 불러오지 못했습니다. 기존 채팅 모드로 계속 이용합니다.'}
                </span>
                <button
                  type="button"
                  onClick={() => void reloadChatRooms()}
                  className="shrink-0 rounded border border-amber-400 bg-white px-2 py-0.5 font-semibold text-amber-800 hover:bg-amber-100"
                >
                  다시 시도
                </button>
              </div>
            ) : null}
            {chatMessageList}
            {maintenancePanel}
            {chatComposer}
          </div>
          <ChatOperationPanel
            selectedRoomNo={consoleRoomNo}
            recentPhotoMessage={recentPhotoMessage}
            lostFoundItems={lostFoundItems}
            lostFoundEnabled={lostFoundEnabled}
            actorId={chatSendUserId}
            onRegisterLostFound={lostFoundEnabled ? handleLostFoundPhotoClick : undefined}
            onSelectRoom={setConsoleRoomNo}
            onRefreshLostFoundList={() => void loadLostFoundIndex()}
            maintenanceRefreshKey={maintenanceRefreshKey}
          />
        </div>
        {keypadOverlay}
      </main>
      </ChatPhotoLightboxProvider>
    );
  }

  return (
    <ChatPhotoLightboxProvider>
    <main className="flex h-screen flex-col bg-[#B2C7D9]">

      {/* 헤더: 다크 그레이 테마 */}
      <header className="bg-gray-800 border-b border-gray-700 px-4 py-3 shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div>
            {returnToUrl ? (
              <button
                type="button"
                onClick={() => window.location.assign(returnToUrl)}
                className="mb-1.5 inline-flex items-center gap-1 rounded-lg border border-gray-500 bg-gray-700 px-2.5 py-1 text-xs font-bold text-gray-100 hover:bg-gray-600"
              >
                ← 관리모드
              </button>
            ) : null}
            <div className="font-bold text-white">AutoFlow 채팅</div>
            {!canSendToServer ? (
              <div className="mt-1 text-xs font-semibold text-red-400">
                전송/티켓 생성이 비활성화되었습니다. 관리자 설정이 필요합니다.
              </div>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <div className="flex flex-wrap items-center justify-end gap-2 text-xs text-gray-400">
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
              <span className="text-gray-400">
                브라우저 알림:{' '}
                {browserNotifyPermission === 'granted'
                  ? '허용됨'
                  : browserNotifyPermission === 'denied'
                    ? '차단됨'
                    : browserNotifyPermission === 'unsupported'
                      ? '미지원'
                      : '미설정'}
              </span>
              <span className="text-gray-400">
                연결 상태:{' '}
                {connectionStatus === 'connected'
                  ? 'connected'
                  : connectionStatus === 'degraded'
                    ? 'degraded'
                    : 'reconnecting'}
              </span>
              <span className="text-gray-400">온라인 {staffCounts.online}명</span>
              <button
                type="button"
                onClick={() => setSettingsOpen((open) => !open)}
                className="rounded-lg border border-gray-600 bg-gray-700 px-2 py-1 font-semibold text-gray-200 hover:bg-gray-600"
                aria-expanded={settingsOpen}
              >
                ⚙ 설정
              </button>
            </div>
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

      {/* 개발자 진단: ?debug=1 또는 설정 > 고급에서만 노출 (기본 운영 화면에서는 숨김) */}
      {debugMode ? (
        <div className="border-b border-amber-500/80 bg-amber-950/90">
          <div
            className="px-3 pt-2 font-mono text-sm font-bold text-lime-300"
            data-testid="chat-deploy-rev"
          >
            rev={CHAT_CLIENT_REV} · {CHAT_PAGE_SOURCE}
          </div>
          <ChatNotifyDiagBar variant="debug" onRequestPermission={handleNotificationClick} />
        </div>
      ) : null}

      {/* 운영 설정 시트 (⚙ 설정) — 알림음/테스트/업데이트/상태문구/로그아웃/고급 */}
      {settingsOpen ? (
        <section className="border-b border-gray-700 bg-gray-800 px-3 py-3 text-sm text-gray-200" aria-label="설정">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-bold text-white">설정</span>
            <button
              type="button"
              onClick={() => setSettingsOpen(false)}
              className="rounded-lg border border-gray-600 px-2 py-1 text-xs text-gray-300 hover:bg-gray-700"
            >
              닫기
            </button>
          </div>
          <ChatNotifyDiagBar variant="operator" onRequestPermission={handleNotificationClick} />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {browserNotifyPermission === 'granted' ? (
              <button
                type="button"
                onClick={handleTestNotificationClick}
                className="rounded-lg border border-gray-600 bg-gray-700 px-2.5 py-1 text-xs font-medium text-gray-200 hover:bg-gray-600"
              >
                테스트 알림
              </button>
            ) : (
              <button
                type="button"
                onClick={handleNotificationClick}
                className="rounded-lg border border-sky-500/70 bg-sky-950/50 px-2.5 py-1 text-xs font-semibold text-sky-100 hover:bg-sky-900/60"
              >
                브라우저 알림 권한 요청
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowAdminPanel((open) => !open)}
              className="rounded-lg border border-yellow-500/50 bg-gray-700 px-2.5 py-1 text-xs font-semibold text-yellow-300 hover:bg-gray-600"
            >
              {showAdminPanel ? '상태 문구 닫기' : '상태 문구 관리'}
            </button>
          </div>
          <div className="mt-2">
            <TauriUpdatePanel />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-700 pt-2">
            <button
              type="button"
              onClick={() => {
                log.info('[LOGIN_REDIRECT]', { from: '/chat', to: '/login', reason: 'manual_logout' });
                logoutAndGoLogin(router);
              }}
              className="rounded-lg border border-gray-600 px-2.5 py-1 text-xs text-gray-300 hover:bg-gray-700"
            >
              로그아웃
            </button>
            <button
              type="button"
              onClick={() => setDebugMode(true)}
              className="rounded-lg border border-gray-600 px-2.5 py-1 text-xs text-gray-400 hover:bg-gray-700"
            >
              고급: 개발자 진단 열기
            </button>
            {sessionUser ? (
              <span className="ml-auto text-xs text-gray-500">로그인: {sessionUser.name}</span>
            ) : null}
          </div>
        </section>
      ) : null}

      <ChatToastStack toasts={toasts} onToastClick={onToastClick} onDismiss={removeToast} />
      {opsUxToast ? (
        <div className="pointer-events-none fixed bottom-24 left-1/2 z-[10000] -translate-x-1/2 rounded-lg bg-gray-900/90 px-4 py-2 text-sm font-medium text-white shadow-lg">
          {opsUxToast}
        </div>
      ) : null}

      <StaffInvitePanel
        variant="chat"
        collapsible
        defaultOpen={false}
        messages={messages}
        onCountsChange={setStaffCounts}
      />

      <StaffChatAdminSection open={showAdminPanel} />

      {chatMessageList}

      {maintenancePanel}

      {chatComposer}

      {keypadOverlay}

      <div className="px-3 pb-1 text-right text-[10px] text-gray-500">build: {buildTag}</div>
      <Navigation active="chat" />
    </main>
    </ChatPhotoLightboxProvider>
  );
}
