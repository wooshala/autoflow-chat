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
import { CHAT_SEND_URL, STAFF_INVITES_URL } from '@/lib/chatApi';
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
  isBrowserNotificationSupported,
  showBrowserNotification
} from '@/lib/chat/browserNotifications';
import { playNotificationTone, unlockNotificationAudio } from '@/lib/chat/playNotificationTone';
import { getMessageDisplayParts } from '@/lib/chat/displayMessageText';
import { isUrgentMessage } from '@/lib/chat/messagePriority';
import type { ChatLang } from '@/lib/chat/translateMessageForChat';
import { speakStaffTts, unlockStaffTts } from '@/lib/chat/staffTts';
import {
  isServerStaffTtsUnlocked,
  resetServerStaffTtsUnlock,
  unlockServerStaffTts
} from '@/lib/chat/serverTtsClient';
import { playStaffTts } from '@/lib/chat/staffTtsPlayback';
import { noteStaffTtsMessageReceived } from '@/lib/chat/staffTtsDiagState';
import { logStaffTtsTriggerCheck } from '@/lib/chat/staffTtsTriggerCheck';
import { normalizeTranslatedText } from '@/lib/chat/normalizeChatMessage';
import { useStaffRuVoiceAvailability } from '@/lib/hooks/useStaffRuVoiceAvailability';
import { useStaffTtsDiagStatus } from '@/lib/hooks/useStaffTtsDiagStatus';
import { staffChatLog } from '@/lib/chat/staffChatLog';
import {
  isStaffChatSelfMessage,
  resolveStaffChatSessionIdentity
} from '@/lib/chat/staffChatSelfMessage';
import QuickPhraseBar from '@/components/staff-chat/QuickPhraseBar';
import MobileQuickPhraseEditor from '@/components/staff-chat/MobileQuickPhraseEditor';
import PhotoConfirmPanel from '@/components/staff-chat/PhotoConfirmPanel';
import RoomSelectorBar from '@/components/staff-chat/RoomSelectorBar';
import StaffPwaInstallBanner from '@/components/staff-chat/StaffPwaInstallBanner';
import StaffChatTtsDiagLine from '@/components/staff-chat/StaffChatTtsDiagLine';
import { STAFF_CHAT_CLIENT_REV } from '@/lib/chat/staffChatClientRev';
import {
  inviteToSession,
  loadStoredInviteToken,
  readDeprecatedUserParamFromUrl,
  readInviteTokenFromUrl,
  saveStoredInviteToken,
  type StaffInviteSession
} from '@/lib/auth/staffInviteSession';
import { useI18n } from '@/lib/i18n/useI18n';
import type { StaffLocale } from '@/lib/i18n/messages';
import {
  loadStaffStoredRoom,
  saveStaffStoredRoom,
  STAFF_VALID_ROOM_SET
} from '@/lib/chat/staffRoomOptions';

const STORAGE_SOUND_ENABLED = 'autoflow_staff_sound_enabled_v1';
/** OS notification body cap (Browser Notification API, not Web Push). */
const OS_NOTIFY_BODY_MAX = 100;

function loadSoundEnabled(): boolean {
  try {
    const v = localStorage.getItem(STORAGE_SOUND_ENABLED);
    return v === '1' || v === 'true';
  } catch {
    return false;
  }
}

function saveSoundEnabled(enabled: boolean) {
  try {
    localStorage.setItem(STORAGE_SOUND_ENABLED, enabled ? '1' : '0');
  } catch {
    // ignore
  }
}


type ListPhase = 'loading' | 'ready' | 'error';
type SessionSource = 'localStorage' | 'query_param' | 'invite_token' | 'none';
type InvitePhase = 'loading' | 'ready' | 'invalid';

function StaffChatPageInner() {
  const { t, locale, setLocale, hydrated: i18nHydrated } = useI18n('ru');
  const ruVoiceReady = useStaffRuVoiceAvailability();
  const { diagMode, serverTtsAvailable, serverTtsUnlocked, lastTtsStage, lastTtsError, lastTtsSkipReason, refreshUnlockSnapshot } =
    useStaffTtsDiagStatus();
  const [userParam, setUserParam] = useState<string | null>(() =>
    typeof window !== 'undefined' ? readDeprecatedUserParamFromUrl() : null
  );
  const [invitePhase, setInvitePhase] = useState<InvitePhase>('loading');
  const [inviteSession, setInviteSession] = useState<StaffInviteSession | null>(null);
  const [deprecatedWarned, setDeprecatedWarned] = useState(false);
  const [listPhase, setListPhase] = useState<ListPhase>('loading');
  const [listError, setListError] = useState<string | null>(null);
  const [pendingPhraseKey, setPendingPhraseKey] = useState<string | null>(null);
  const [pendingPhoto, setPendingPhoto] = useState<{ file: File; previewUrl: string } | null>(null);
  const [photoRoom, setPhotoRoom] = useState('');
  const [photoStatusText, setPhotoStatusText] = useState('');
  const [photoPhraseKey, setPhotoPhraseKey] = useState<string | null>(null);
  const [showPhraseEditor, setShowPhraseEditor] = useState(false);
  const [phraseRefreshToken, setPhraseRefreshToken] = useState(0);

  function runStaffTts(
    text: string,
    ttsLocale: 'ru' | 'ko' = 'ru',
    showNoVoiceToast = false,
    fromUserGesture = false
  ) {
    void playStaffTts(text, ttsLocale, ruVoiceReady, { fromUserGesture }).then((result) => {
      if (result === 'server_not_unlocked' && !fromUserGesture) {
        setToast({ kind: 'error', msg: t('ttsTapSoundOn') });
        return;
      }
      const failed =
        result === 'no_voice' || result === 'server_failed' || result === 'blocked';
      if (failed && ttsLocale === 'ru' && showNoVoiceToast) {
        setToast({ kind: 'error', msg: t('ttsNoRussianVoice') });
      }
    });
  }

  useEffect(() => {
    staffChatLog('STAFF_CHAT_LANG_SELECTED', {
      locale: locale,
      viewerLang: locale === 'ru' ? 'ru' : 'ko'
    });
  }, [locale]);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [sessionUser, setSessionUser] = useState<AutoflowUser | null>(null);
  const [sessionSource, setSessionSource] = useState<SessionSource>('none');
  const [roomNo, setRoomNo] = useState('');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [composerHeight, setComposerHeight] = useState(72);
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const [toast, setToast] = useState<{ kind: 'ok' | 'error'; msg: string; urgent?: boolean } | null>(null);
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
  const duplicateTtsDiagLoggedRef = useRef<Set<string>>(new Set());
  const notifySeededRef = useRef(false);
  const roomBootstrappedRef = useRef(false);

  const legacyResolved = useMemo(() => resolveStaffChatUserId(userParam), [userParam]);
  const staffSession = useMemo(
    () => resolveStaffChatSessionIdentity(inviteSession, legacyResolved, sessionUser?.name ?? null),
    [inviteSession, legacyResolved, sessionUser?.name]
  );
  const chatSendUserId = staffSession.currentUserId;
  const staffKey = legacyResolved.key;
  const actorName = staffSession.currentSenderName || staffKeyLabel(staffKey);

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
    async function bootstrapInvite() {
      const urlToken = readInviteTokenFromUrl();
      const storedToken = loadStoredInviteToken();
      const token = urlToken || storedToken;

      if (token) {
        if (urlToken) saveStoredInviteToken(urlToken);
        try {
          const res = await fetch(`${STAFF_INVITES_URL}?token=${encodeURIComponent(token)}`);
          const json = await res.json();
          if (json?.ok && json?.data?.invite) {
            setInviteSession(inviteToSession(json.data.invite, json.data.userId ?? null));
            setInvitePhase('ready');
            setSessionSource('invite_token');
            return;
          }
        } catch {
          /* fall through */
        }
        setInvitePhase('invalid');
        return;
      }

      if (readDeprecatedUserParamFromUrl()) {
        setDeprecatedWarned(true);
      }
      setInvitePhase('ready');
    }
    void bootstrapInvite();
  }, []);

  useEffect(() => {
    const param = readDeprecatedUserParamFromUrl();
    staffChatLog('STAFF_CHAT_INIT', {
      href: typeof window !== 'undefined' ? window.location.href : null,
      userParam: param
    });
    setUserParam(param);
  }, []);

  useEffect(() => {
    staffChatLog('STAFF_CHAT_USER_RESOLVED', {
      staffKey,
      id: staffSession.currentUserId,
      userId: staffSession.currentUserId,
      tokenId: staffSession.currentTokenId,
      senderName: staffSession.currentSenderName,
      hasUserId: Boolean(staffSession.currentUserId),
      userParam,
      inviteToken: inviteSession?.token || null
    });
  }, [staffKey, staffSession, userParam, inviteSession?.token]);

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
    if (inviteSession?.displayName) {
      const synthetic: AutoflowUser = {
        name: inviteSession.displayName,
        created_at: new Date().toISOString()
      };
      setSessionUser(synthetic);
      setSessionSource('invite_token');
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
    const saved = loadStaffStoredRoom();
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
    const stored = loadSoundEnabled();
    setSoundEnabled(stored);
    console.log('[STAFF_CHAT_SOUND_TOGGLE]', {
      event: 'hydrate_from_storage',
      soundEnabled: stored,
      serverTtsUnlocked: isServerStaffTtsUnlocked()
    });
  }, []);

  useEffect(() => {
    if (!isBrowserNotificationSupported()) {
      setBrowserNotifyPermission('unsupported');
      return;
    }
    setBrowserNotifyPermission(Notification.permission);
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
    if (!initialHydrationComplete) return;
    if (invitePhase === 'loading') return;
    if (!staffSession.currentUserId && !staffSession.currentTokenId) return;

    const serverUnlocked = isServerStaffTtsUnlocked();

    if (!notifySeededRef.current) {
      for (const m of messages) {
        const id = m?.id != null ? String(m.id) : '';
        if (id && !id.startsWith('tmp-')) knownNotifyIdsRef.current.add(id);
      }
      notifySeededRef.current = true;
      logStaffTtsTriggerCheck({
        messageId: null,
        text: '',
        translatedRu: '',
        originalLang: '',
        isSelfMessage: false,
        soundEnabled,
        serverTtsAvailable,
        serverTtsUnlocked: serverUnlocked,
        localRuVoice: ruVoiceReady,
        shouldUseServerTts: false,
        skipReason: 'skip_notify_seeding'
      });
      return;
    }

    for (const m of messages) {
      const id = m?.id != null ? String(m.id) : '';
      if (!id || id.startsWith('tmp-')) continue;
      if (knownNotifyIdsRef.current.has(id)) {
        const lateRu = normalizeTranslatedText(m.translated_text)?.ru?.trim() || '';
        if (lateRu && !duplicateTtsDiagLoggedRef.current.has(id)) {
          duplicateTtsDiagLoggedRef.current.add(id);
          logStaffTtsTriggerCheck({
            messageId: id,
            text: String(m.message || '').trim().slice(0, 120),
            translatedRu: lateRu.slice(0, 120),
            originalLang: String(m.original_lang || '').trim(),
            isSelfMessage: isStaffChatSelfMessage(m, staffSession),
            soundEnabled,
            serverTtsAvailable,
            serverTtsUnlocked: isServerStaffTtsUnlocked(),
            localRuVoice: ruVoiceReady,
            shouldUseServerTts: false,
            skipReason: 'skip_duplicate_message'
          });
        }
        continue;
      }

      knownNotifyIdsRef.current.add(id);
      const isSelf = isStaffChatSelfMessage(m, staffSession);
      const viewerLang: ChatLang = locale === 'ru' ? 'ru' : 'ko';
      const translated = normalizeTranslatedText(m.translated_text);
      const translatedRu = translated?.ru?.trim() || '';
      const originalLang = String(m.original_lang || '').trim();
      const { primary, ttsText } = getMessageDisplayParts(m, viewerLang, {
        logContext: 'staff',
        selectedLang: locale
      });
      const urgent = isUrgentMessage(m);
      const preview = String(primary || m.message || '').trim();
      const toSpeak = ttsText || (viewerLang === 'ru' ? primary : null);
      const willCallPlayStaffTts = Boolean(soundEnabled && toSpeak);
      const shouldUseServerTts =
        willCallPlayStaffTts && ruVoiceReady !== true;
      const willCallPlayServerStaffTts =
        shouldUseServerTts && (ruVoiceReady === false || ruVoiceReady === null);

      const triggerBase = {
        messageId: id,
        text: preview.slice(0, 120),
        translatedRu: translatedRu.slice(0, 120),
        originalLang,
        isSelfMessage: isSelf,
        soundEnabled,
        serverTtsAvailable,
        serverTtsUnlocked: serverUnlocked,
        localRuVoice: ruVoiceReady,
        viewerLang,
        ttsText,
        toSpeak: toSpeak ? String(toSpeak).slice(0, 120) : null,
        shouldUseServerTts,
        willCallPlayStaffTts,
        willCallPlayServerStaffTts
      };

      if (isSelf) {
        console.log('[CHAT_SOUND_SKIPPED_SELF]', {
          messageId: id,
          messageSenderId: m.user_id ?? null,
          messageTokenId: m.token_id ?? null,
          currentUserId: staffSession.currentUserId,
          currentTokenId: staffSession.currentTokenId
        });
        logStaffTtsTriggerCheck({
          ...triggerBase,
          shouldUseServerTts: false,
          skipReason: 'skip_self_message'
        });
        continue;
      }

      if (!soundEnabled) {
        logStaffTtsTriggerCheck({
          ...triggerBase,
          shouldUseServerTts: false,
          willCallPlayStaffTts: false,
          willCallPlayServerStaffTts: false,
          skipReason: 'skip_sound_disabled'
        });
      } else {
        console.log('[STAFF_CHAT_SOUND_PLAY]', { messageId: id, soundEnabled: true, urgent });
        void playNotificationTone(urgent ? 'urgent' : 'info');

        if (!toSpeak) {
          logStaffTtsTriggerCheck({
            ...triggerBase,
            skipReason:
              viewerLang !== 'ru' ? 'skip_viewer_lang_not_ru' : 'skip_no_ru_text'
          });
        } else {
          logStaffTtsTriggerCheck({
            ...triggerBase,
            skipReason: 'triggered'
          });
          noteStaffTtsMessageReceived();
          runStaffTts(toSpeak, 'ru');
        }
      }

      setToast({
        kind: 'ok',
        urgent,
        msg: urgent ? `🚨 ${t('urgentToast')}\n${preview.slice(0, 80)}` : `📩 ${preview.slice(0, 40)}`
      });

      // staff-chat OS alerts: Browser Notification API while tab/session is alive (not Web Push).
      // Mobile browsers may suppress notifications when the screen is off or the tab is suspended.
      const { primary: ruPrimary } = getMessageDisplayParts(m, 'ru', {
        logContext: 'staff',
        selectedLang: locale
      });
      const isBackgroundLike =
        typeof document !== 'undefined' &&
        (document.hidden ||
          (typeof document.hasFocus === 'function' && !document.hasFocus()));
      if (isBackgroundLike && canShowBrowserNotification()) {
        const body = String(ruPrimary || m.message || '').trim().slice(0, OS_NOTIFY_BODY_MAX);
        if (body) {
          void showBrowserNotification({
            title: urgent ? `🚨 ${t('urgentToast')}` : staffKeyLabel(staffKey) || 'AutoFlow Chat',
            body,
            tag: id,
            requireInteraction: urgent
          });
        }
      }
    }
  }, [
    messages,
    initialHydrationComplete,
    staffSession,
    invitePhase,
    locale,
    staffKey,
    soundEnabled,
    serverTtsAvailable,
    ruVoiceReady,
    t
  ]);

  const scrollListToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const el = listRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior });
    });
  }, []);

  useEffect(() => {
    scrollListToBottom('smooth');
  }, [messages.length, scrollListToBottom]);

  const measureComposerHeight = useCallback(() => {
    const el = composerRef.current;
    if (!el) return;
    const next = Math.ceil(el.getBoundingClientRect().height);
    setComposerHeight((prev) => (prev === next ? prev : next));
  }, []);

  useEffect(() => {
    const el = composerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => measureComposerHeight());
    ro.observe(el);
    measureComposerHeight();
    return () => ro.disconnect();
  }, [measureComposerHeight, pendingPhoto, i18nHydrated, invitePhase]);

  useEffect(() => {
    scrollListToBottom(keyboardOffset > 0 ? 'smooth' : 'auto');
  }, [composerHeight, keyboardOffset, pendingPhoto, scrollListToBottom]);

  const canSendMessages = Boolean(chatSendUserId);
  const canComposerSend = Boolean(canSendMessages && text.trim() && !sending);
  const listBottomPad = composerHeight + 16;

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
    async (
      body: string,
      image?: File | null,
      opts?: { roomNo?: string; phraseKey?: string | null }
    ): Promise<boolean> => {
      const msg = String(body || '').trim();
      const r = String(opts?.roomNo ?? roomNo ?? '').trim();
      const phraseKey = opts?.phraseKey !== undefined ? opts.phraseKey : pendingPhraseKey;

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
        setToast({ kind: 'error', msg: t('noUserId') });
        return false;
      }
      if (!msg && !image) {
        staffChatLog('STAFF_CHAT_SEND_BLOCKED', { reason: 'empty_message' });
        return false;
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
        fd.append('sender_name', actorName);
        if (inviteSession?.inviteId) fd.append('token_id', inviteSession.inviteId);
        if (phraseKey) fd.append('phrase_key', phraseKey);
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
          setToast({ kind: 'error', msg: t('sendFailed') });
          return false;
        }
        const saved = unwrapChatSendEnvelopeData(res.data);
        if (!saved?.id) {
          staffChatLog('STAFF_CHAT_SEND_API_ERROR', { reason: 'missing_message_id' });
          setToast({ kind: 'error', msg: t('sendFailed') });
          return false;
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
        setPendingPhraseKey(null);
        setToast({ kind: 'ok', msg: `✅ ${t('sendSuccess')}` });
        return true;
      } catch (e: unknown) {
        staffChatLog('STAFF_CHAT_SEND_API_ERROR', {
          error: e instanceof Error ? e.message : String(e)
        });
        setToast({ kind: 'error', msg: t('sendFailed') });
        return false;
      } finally {
        setSending(false);
      }
    },
    [actorName, chatSendUserId, locale, roomNo, sessionSource, setMessages, staffKey, inviteSession?.inviteId, pendingPhraseKey, t]
  );

  function clearPendingPhoto() {
    if (pendingPhoto?.previewUrl) {
      try {
        URL.revokeObjectURL(pendingPhoto.previewUrl);
      } catch {
        /* ignore */
      }
    }
    setPendingPhoto(null);
    setPhotoRoom('');
    setPhotoStatusText('');
    setPhotoPhraseKey(null);
  }

  function buildPhotoCaption(room: string, statusText: string): string {
    const r = room.trim();
    const status = statusText.trim();
    if (!r) return status;
    if (!status) return locale === 'ko' ? `${r}호` : r;
    return locale === 'ko' ? `${r}호 ${status}` : `${r} ${status}`;
  }

  function handlePhotoStatusSelect(payload: { phrase_key: string; text: string }) {
    setPhotoStatusText(payload.text);
    setPhotoPhraseKey(payload.phrase_key);
  }

  async function handlePhotoSend() {
    if (!pendingPhoto || sending) return;
    if (!photoRoom.trim()) {
      setToast({ kind: 'error', msg: t('selectRoomRequired') });
      return;
    }
    const caption = buildPhotoCaption(photoRoom, photoStatusText);
    const ok = await send(caption, pendingPhoto.file, {
      roomNo: photoRoom.trim(),
      phraseKey: photoPhraseKey
    });
    if (ok) clearPendingPhoto();
  }

  function handleRoomSelect(next: string) {
    const r = String(next || '').trim();
    if (!r || !STAFF_VALID_ROOM_SET.has(r)) return;
    setRoomNo(r);
    saveStaffStoredRoom(r);
  }

  function toggleSound() {
    if (soundEnabled && !isServerStaffTtsUnlocked()) {
      unlockNotificationAudio();
      unlockStaffTts();
      void unlockServerStaffTts().then(() => refreshUnlockSnapshot());
      console.log('[STAFF_CHAT_SOUND_TOGGLE]', {
        event: 're_unlock_while_on',
        soundEnabled: true
      });
      return;
    }

    const next = !soundEnabled;
    saveSoundEnabled(next);
    setSoundEnabled(next);
    console.log('[STAFF_CHAT_SOUND_TOGGLE]', {
      prev: soundEnabled,
      next,
      stored: loadSoundEnabled()
    });
    if (next) {
      unlockNotificationAudio();
      unlockStaffTts();
      void unlockServerStaffTts().then(() => refreshUnlockSnapshot());
    } else {
      resetServerStaffTtsUnlock();
      refreshUnlockSnapshot();
    }
  }

  function showStaffTestNotification() {
    void showBrowserNotification({
      title: staffKeyLabel(staffKey) || 'AutoFlow Chat',
      body: t('notifyTestBody'),
      tag: 'staff-chat-notify-test'
    });
  }

  function handleNotificationEnableClick() {
    const supported = isBrowserNotificationSupported();
    const permissionNow = supported ? Notification.permission : 'unsupported';
    console.log('[STAFF_CHAT_NOTIFICATION_CLICK]', {
      supported,
      permission: permissionNow,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : ''
    });

    if (!supported) {
      setBrowserNotifyPermission('unsupported');
      return;
    }

    if (Notification.permission === 'denied') {
      setBrowserNotifyPermission('denied');
      window.alert(t('notifyDeniedHelp'));
      return;
    }

    if (Notification.permission === 'granted') {
      setBrowserNotifyPermission('granted');
      showStaffTestNotification();
      return;
    }

    Notification.requestPermission().then((p) => {
      setBrowserNotifyPermission(p);
      if (p === 'granted') {
        showStaffTestNotification();
      }
    });
  }

  function handleQuickPhraseInsert(payload: { phrase_key: string; text: string }) {
    const r = roomNo.trim();
    const next = r ? `${r} ${payload.text}` : payload.text;
    setPendingPhraseKey(payload.phrase_key);
    setText(next);
    window.setTimeout(() => inputRef.current?.focus(), 0);
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
      scrollListToBottom('smooth');
    }, 320);
  }

  function handlePhotoClick() {
    photoInputRef.current?.click();
  }

  function handlePhotoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPhotoRoom('');
    setPhotoStatusText('');
    setPhotoPhraseKey(null);
    const previewUrl = URL.createObjectURL(file);
    setPendingPhoto({ file, previewUrl });
  }

  function handleVoiceClick() {
    setToast({ kind: 'ok', msg: t('voiceSoon') });
  }

  const localeButtons: { code: StaffLocale; flag: string }[] = [
    { code: 'ko', flag: '🇰🇷' },
    { code: 'ru', flag: '🇷🇺' }
  ];

  const recentMessages = useMemo(() => messages.filter((m) => !m.is_deleted).slice(-80), [messages]);

  if (invitePhase === 'loading' || !i18nHydrated) {
    return (
      <main className="flex h-[100dvh] items-center justify-center bg-[#eceff1]">
        <p className="text-sm text-gray-500">{t('loading')}</p>
      </main>
    );
  }

  if (invitePhase === 'invalid') {
    return (
      <main className="flex h-[100dvh] flex-col items-center justify-center gap-3 bg-[#eceff1] px-6 text-center">
        <p className="text-lg font-bold text-rose-700">{t('invalidInvite')}</p>
        <p className="text-sm text-gray-600">{t('invalidInviteHelp')}</p>
      </main>
    );
  }

  return (
    <main
      className="flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden bg-[#eceff1]"
      style={{ ['--staff-composer-height' as string]: `${composerHeight}px` }}
    >
      {/* 상단: 언어 · 소리 · 알림 */}
      <header className="shrink-0 border-b border-gray-200 bg-white px-3 py-1.5 shadow-sm">
        <div className="mx-auto flex max-w-md items-center justify-end gap-1.5">
          <div className="flex gap-0.5">
            {localeButtons.map((b) => (
              <button
                key={b.code}
                type="button"
                onClick={() => setLocale(b.code)}
                className={`flex h-8 w-9 items-center justify-center rounded-lg border text-base ${
                  locale === b.code ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-gray-50'
                }`}
                aria-label={b.code}
              >
                {b.flag}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={toggleSound}
              className={`rounded-lg border px-2 py-1 text-[11px] font-bold ${
                soundEnabled
                  ? 'border-blue-300 bg-blue-50 text-blue-800'
                  : 'border-gray-300 bg-gray-50 text-gray-600'
              }`}
            >
              🔊 {soundEnabled ? t('soundOn') : t('soundOff')}
            </button>
            {ruVoiceReady === false ? (
              <span className="max-w-[4.5rem] text-[10px] font-bold leading-tight text-amber-700">
                {t('ttsVoiceUnavailable')}
              </span>
            ) : null}
          </div>
          {browserNotifyPermission === 'unsupported' ? (
            <button
              type="button"
              onClick={() => window.alert(t('notifyUnsupportedHelp'))}
              className="rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-800"
              title={t('notifyUnsupportedHelp')}
            >
              🔔 {t('notifyUnsupported')}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleNotificationEnableClick}
              className={`rounded-lg border px-2 py-1 text-[11px] font-bold ${
                browserNotifyPermission === 'granted'
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                  : browserNotifyPermission === 'denied'
                    ? 'border-rose-300 bg-rose-50 text-rose-800'
                    : 'border-gray-300 bg-gray-50 text-gray-700'
              }`}
            >
              🔔{' '}
              {browserNotifyPermission === 'default'
                ? t('notifyEnable')
                : browserNotifyPermission === 'granted'
                  ? t('notifyGranted')
                  : t('notifyDenied')}
            </button>
          )}
        </div>
        {diagMode ? (
          <StaffChatTtsDiagLine
            clientRev={STAFF_CHAT_CLIENT_REV}
            serverTtsAvailable={serverTtsAvailable}
            serverTtsUnlocked={serverTtsUnlocked}
            soundEnabled={soundEnabled}
            lastTtsStage={lastTtsStage}
            lastTtsError={lastTtsError}
            lastTtsSkipReason={lastTtsSkipReason}
            ruVoiceReady={ruVoiceReady}
          />
        ) : null}
      </header>

      <StaffPwaInstallBanner lang={locale} />

      {ruVoiceReady === false ? (
        <div
          className="mx-3 mt-2 shrink-0 rounded-xl border-2 border-amber-400 bg-amber-50 px-3 py-2.5 text-center text-xs font-semibold leading-snug text-amber-950"
          role="status"
        >
          {t('ttsNoRussianVoiceBanner')}
        </div>
      ) : null}

      {toast && (
        <div
          className={`mx-4 mt-2 shrink-0 rounded-xl border px-3 py-2 text-center text-sm font-bold whitespace-pre-line ${
            toast.urgent
              ? 'border-orange-400 bg-orange-50 text-orange-950 ring-2 ring-orange-200'
              : toast.kind === 'ok'
                ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                : 'border-rose-300 bg-rose-50 text-rose-900'
          }`}
        >
          {toast.msg}
        </div>
      )}

      {deprecatedWarned ? (
        <div className="mx-4 mt-2 shrink-0 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-center text-xs font-semibold text-amber-900">
          {t('deprecatedUserParam')}
        </div>
      ) : null}

      {inviteSession?.displayName ? (
        <div className="mx-4 mt-1 shrink-0 text-center text-[11px] font-semibold text-gray-500">
          {t('signedInAs')}: {inviteSession.displayName}
        </div>
      ) : null}

      {!canSendMessages && (
        <div className="mx-4 mt-2 shrink-0 rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {t('noUserId')}
        </div>
      )}

      {/* 채팅 내역 — 화면 대부분 */}
      <div
        ref={listRef}
        className="mx-auto min-h-0 w-full max-w-md flex-1 overflow-y-auto overscroll-contain px-3 py-2"
        style={{ paddingBottom: listBottomPad }}
      >
        {listPhase === 'loading' && !initialHydrationComplete ? (
          <p className="py-8 text-center text-sm text-gray-400">{t('loading')}</p>
        ) : listPhase === 'error' ? (
          <div className="py-8 text-center">
            <p className="text-sm font-semibold text-rose-700">{listError}</p>
            <button
              type="button"
              onClick={() => void retryListLoad()}
              className="mt-3 rounded-lg bg-rose-600 px-4 py-2 text-sm font-bold text-white"
            >
              {t('retry')}
            </button>
          </div>
        ) : recentMessages.length === 0 ? (
          <p className="py-12 text-center text-sm text-gray-400">{t('noMessages')}</p>
        ) : (
          <div className="space-y-2 pb-2">
            {recentMessages.map((m) => {
              const mine = isStaffChatSelfMessage(m, staffSession);
              const urgent = isUrgentMessage(m);
              const viewerLang: ChatLang = locale === 'ru' ? 'ru' : 'ko';
              const { primary, secondary, ttsText } = getMessageDisplayParts(m, viewerLang, {
                logContext: 'staff',
                selectedLang: locale
              });
              return (
                <div key={String(m.id)} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[88%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                      urgent && !mine
                        ? 'border-2 border-orange-400 bg-orange-50 text-gray-900'
                        : mine
                          ? 'bg-blue-600 text-white'
                          : 'bg-white text-gray-900'
                    }`}
                  >
                    {urgent && !mine ? (
                      <div className="mb-1 inline-block rounded bg-orange-500 px-2 py-0.5 text-[10px] font-extrabold tracking-wide text-white">
                        {t('urgentBadge')}
                      </div>
                    ) : null}
                    <div
                      className={`flex items-center justify-between gap-2 text-[10px] ${
                        urgent && !mine ? 'text-orange-700' : mine ? 'text-blue-100' : 'text-gray-400'
                      }`}
                    >
                      <span>
                        {m.sender_name ||
                          (m.room_no ? `${m.room_no}${t('roomSuffix')}` : '—')}{' '}
                        · {m.sender_side || '?'}
                      </span>
                      {!mine && ttsText && soundEnabled ? (
                        <button
                          type="button"
                          onClick={() => {
                            void unlockServerStaffTts();
                            runStaffTts(ttsText, 'ru', true, true);
                          }}
                          className="rounded px-1.5 py-0.5 text-[10px] font-bold text-blue-700"
                        >
                          🔊 {t('readAloud')}
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
                      <div
                        className={`mt-0.5 ${
                          urgent && !mine ? 'text-base font-bold' : 'font-medium'
                        } ${mine ? '' : urgent ? '' : 'text-base'}`}
                      >
                        {primary}
                      </div>
                    ) : null}
                    {secondary ? (
                      <div
                        className={`mt-1 text-[11px] ${
                          urgent && !mine
                            ? 'font-semibold text-orange-800/80'
                            : mine
                              ? 'text-blue-100/80'
                              : 'text-gray-500'
                        }`}
                      >
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
        className="fixed inset-x-0 z-50 max-h-[min(52dvh,28rem)] overflow-y-auto overscroll-contain border-t border-gray-200 bg-white shadow-[0_-4px_20px_rgba(0,0,0,0.1)]"
        style={{
          bottom: keyboardOffset,
          paddingBottom: 'max(env(safe-area-inset-bottom), 0px)'
        }}
      >
        {pendingPhoto ? (
          <PhotoConfirmPanel
            previewUrl={pendingPhoto.previewUrl}
            photoRoom={photoRoom}
            selectedStatusText={photoStatusText}
            locale={locale}
            roomLabel={t('room')}
            statusLabel={t('quickPhrase')}
            cancelLabel={t('cancel')}
            sendLabel={t('send')}
            sending={sending}
            onRoomSelect={setPhotoRoom}
            onStatusSelect={handlePhotoStatusSelect}
            onCancel={clearPendingPhoto}
            onSend={handlePhotoSend}
          />
        ) : (
          <>
        <RoomSelectorBar
          selectedRoom={roomNo}
          onSelect={handleRoomSelect}
          disabled={sending || !canSendMessages}
          sectionLabel={t('room')}
          large
          compactMobile
        />
        <QuickPhraseBar
          locale={locale}
          sectionLabel={t('quickPhrase')}
          onInsert={handleQuickPhraseInsert}
          disabled={sending || !canSendMessages}
          large
          compactMobile
          refreshToken={phraseRefreshToken}
          editLabel={t('phraseEdit')}
          onEditClick={() => setShowPhraseEditor(true)}
        />
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
            placeholder={t('messagePlaceholder')}
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
            {sending ? '…' : t('send')}
          </button>
        </div>
          </>
        )}
      </div>

      <MobileQuickPhraseEditor
        open={showPhraseEditor}
        locale={locale}
        t={t}
        onClose={() => setShowPhraseEditor(false)}
        onSaved={() => setPhraseRefreshToken((n) => n + 1)}
      />

    </main>
  );
}

export default function StaffChatPage() {
  return <StaffChatPageInner />;
}
