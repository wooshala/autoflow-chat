'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient as createBrowserSupabase } from '@/utils/supabase/client';
import {
  type AutoflowUser,
  loadUser,
  resolveStaffChatUserId,
  runSessionMigration,
  staffKeyLabel
} from '@/lib/auth';
import { fetchEnvelope } from '@/lib/api/envelope';
import { CHAT_SEND_URL, STAFF_INVITES_URL, STAFF_LOGIN_ROSTER_URL, STAFF_LOGIN_URL, STAFF_LOGOUT_URL, STAFF_SESSION_URL } from '@/lib/chatApi';
import { TIMEOUT_MS_CHAT_LIST, TIMEOUT_MS_CHAT_SEND } from '@/lib/api/timeouts';
import type { ChatMessage, StaffInvite } from '@/lib/types';
import { formatKSTShort } from '@/lib/formatKST';
import type { StaffAccountPublic } from '@/lib/services/staffAccounts';
import { unwrapChatSendEnvelopeData } from '@/lib/api/unwrapChatSendResponse';
import { useChatLoader } from '@/lib/hooks/useChatLoader';
import { useChatRealtime } from '@/lib/hooks/useChatRealtime';
import { useChatRefetchFallback } from '@/lib/hooks/useChatRefetchFallback';
import { useChatVisibleTrace } from '@/lib/hooks/useChatVisibleTrace';
import { registerChatSyncProbe, latestMessageMeta } from '@/lib/chat/syncTrace';
import { useChatWatchdog } from '@/lib/hooks/useChatWatchdog';
import { useChatRenderTrace } from '@/lib/hooks/useChatRenderTrace';
import {
  createClientNonce,
  logSendApiResponded,
  logSendClick,
  registerMessageIdForNonce
} from '@/lib/chat/sendTrace';
import { latApiResponded, latApiStart, latSendClick, setLatencySelf } from '@/lib/chat/latencyTrace';
import {
  STAFF_WORK_STATUS_OPTIONS,
  STAFF_STATUS_STORAGE_KEY,
  STAFF_STATUS_CHANNEL,
  STAFF_STATUS_EVENT,
  normalizeStaffWorkStatus,
  staffWorkStatusMeta,
  type StaffWorkStatus
} from '@/lib/chat/staffStatus';
import {
  canShowBrowserNotification,
  isBrowserNotificationSupported,
  showBrowserNotification
} from '@/lib/chat/browserNotifications';
import { unlockNotificationAudio, unlockStaffSound, playStaffSound } from '@/lib/chat/playNotificationTone';
import { getMessageDisplayParts } from '@/lib/chat/displayMessageText';
import { normalizeNotifyBody } from '@/lib/chat/normalizeNotifyBody';
import { isUrgentMessage } from '@/lib/chat/messagePriority';
import type { ChatLang } from '@/lib/chat/translateMessageForChat';
import { speakStaffTts, unlockStaffTts } from '@/lib/chat/staffTts';
import {
  armServerStaffTtsUnlock,
  hydrateServerStaffTtsUnlockFromStorage,
  isServerStaffTtsUnlocked,
  resetServerStaffTtsUnlock,
  unlockServerStaffTts
} from '@/lib/chat/serverTtsClient';
import { playStaffTts, type StaffTtsPlaybackResult } from '@/lib/chat/staffTtsPlayback';
import { logStaffTtsUserActivation } from '@/lib/chat/staffTtsUserActivationDiag';
import {
  isServerTtsLangSupported,
  resolveAutoStaffTtsSkipReason,
  resolveAutoStaffTtsText,
  resolveManualStaffTtsText,
  resolveStaffTtsLangFromSession,
  type StaffTtsLang
} from '@/lib/chat/staffTtsLang';
import { isVoiceAvailableForLocale } from '@/lib/chat/staffTts';
import { noteStaffTtsMessageReceived } from '@/lib/chat/staffTtsDiagState';
import { logStaffTtsTriggerCheck } from '@/lib/chat/staffTtsTriggerCheck';
import { useStaffRuVoiceAvailability } from '@/lib/hooks/useStaffRuVoiceAvailability';
import { useStaffNotice } from '@/lib/hooks/useStaffNotice';
import { useStaffWebSpeech } from '@/lib/hooks/useStaffWebSpeech';
import { useStaffTtsDiagStatus } from '@/lib/hooks/useStaffTtsDiagStatus';
import { useNotificationAudioUnlock } from '@/lib/hooks/useNotificationAudioUnlock';
import { staffChatLog } from '@/lib/chat/staffChatLog';
import {
  isStaffChatSelfMessage,
  resolveStaffChatSessionIdentity
} from '@/lib/chat/staffChatSelfMessage';
import QuickPhraseBar from '@/components/staff-chat/QuickPhraseBar';
import StaffNativeSoundPicker from '@/components/staff-chat/StaffNativeSoundPicker';
import StaffNoticeBanner from '@/components/staff-chat/StaffNoticeBanner';
import MobileQuickPhraseEditor from '@/components/staff-chat/MobileQuickPhraseEditor';
import PhotoConfirmPanel from '@/components/staff-chat/PhotoConfirmPanel';
import RoomSelectorBar from '@/components/staff-chat/RoomSelectorBar';
import StaffPwaInstallBanner from '@/components/staff-chat/StaffPwaInstallBanner';
import StaffChatTtsDiagLine from '@/components/staff-chat/StaffChatTtsDiagLine';
import { STAFF_CHAT_CLIENT_REV } from '@/lib/chat/staffChatClientRev';
import { STAFF_CHAT_DELTA_LIMIT, STAFF_CHAT_LIST_LIMIT } from '@/lib/chat/staffChatList';
import { buildStaffChatRenderTimeline, logStaffChatVisibleMessages } from '@/lib/chat/staffChatTimeline';
import { useChatReadState } from '@/lib/hooks/useChatReadState';
import { inviteReaderId, pcReaderId } from '@/lib/chat/readerIdentity';
import {
  accountPublicToInviteSession,
  clearLegacyInviteStorageOnce,
  clearStaffSession,
  loadStoredSessionToken,
  saveStaffSession,
  staffSessionAuthHeaders
} from '@/lib/auth/staffAccountSession';
import {
  clearStoredInviteToken,
  inviteToSession,
  loadStoredInviteToken,
  readDeprecatedUserParamFromUrl,
  saveStoredInviteToken,
  type StaffInviteSession
} from '@/lib/auth/staffInviteSession';
import { getOrCreateStaffDeviceKey } from '@/lib/auth/staffDeviceKey';
import { useI18n } from '@/lib/i18n/useI18n';
import type { StaffLocale } from '@/lib/i18n/messages';
import {
  loadStaffStoredRoom,
  saveStaffStoredRoom,
  STAFF_VALID_ROOM_SET
} from '@/lib/chat/staffRoomOptions';

import {
  loadStaffAlertsEnabled,
  loadStaffAutoTtsEnabled,
  loadStaffAlertVolume,
  loadStaffSoundKey,
  saveStaffAlertsEnabled,
  saveStaffAutoTtsEnabled,
  saveStaffAlertVolume,
  saveStaffSoundKey,
  staffSoundSrc,
  type StaffSoundKey
} from '@/lib/chat/staffAlertPrefs';
import { isInAppForegroundVisible, isOsBackgroundLike } from '@/lib/chat/notifyForeground';

/** OS notification body cap (Browser Notification API, not Web Push). */
const OS_NOTIFY_BODY_MAX = 100;

type ListPhase = 'loading' | 'ready' | 'error';
type SessionSource = 'localStorage' | 'query_param' | 'invite_token' | 'account_session' | 'none';
type InvitePhase = 'loading' | 'ready' | 'invalid' | 'revoked' | 'join' | 'login' | 'deactivated';

/** URL query only — never reads invite localStorage. */
function readBootstrapUrlParam(
  searchParams: URLSearchParams,
  key: string
): string | null {
  const fromHook = searchParams.get(key)?.trim();
  if (fromHook) return fromHook;
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get(key)?.trim() || null;
}

function logBootstrapPhase1(payload: Record<string, unknown>) {
  if (typeof console !== 'undefined') {
    console.info('[STAFF_BOOTSTRAP_PHASE1]', payload);
  }
}

function StaffChatPageInner() {
  const searchParams = useSearchParams();
  const { t, locale, setLocale, hydrated: i18nHydrated } = useI18n('ru');
  const ruVoiceReady = useStaffRuVoiceAvailability();
  const { notice: staffNotice } = useStaffNotice();
  const {
    diagMode,
    serverTtsAvailable,
    serverTtsUnlocked,
    lastTtsStage,
    lastTtsError,
    lastTtsSkipReason,
    ttsLang: diagTtsLang,
    ttsLangSource,
    translatedTtsExists,
    ttsTextLength,
    ttsTextOrigin,
    refreshUnlockSnapshot
  } = useStaffTtsDiagStatus();
  const notificationAudioUnlocked = useNotificationAudioUnlock();
  const [userParam, setUserParam] = useState<string | null>(() =>
    typeof window !== 'undefined' ? readDeprecatedUserParamFromUrl() : null
  );
  const [invitePhase, setInvitePhase] = useState<InvitePhase>('loading');
  const [inviteSession, setInviteSession] = useState<StaffInviteSession | null>(null);
  const [entryJoinToken, setEntryJoinToken] = useState<string | null>(null);
  const [joinName, setJoinName] = useState('');
  const [joinLang, setJoinLang] = useState<StaffLocale>('ru');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinSubmitting, setJoinSubmitting] = useState(false);
  const [loginCode, setLoginCode] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [loginRoster, setLoginRoster] = useState<Array<{ accountId: string; displayName: string }>>([]);
  const [loginRosterLoading, setLoginRosterLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginSubmitting, setLoginSubmitting] = useState(false);
  const [logoutSubmitting, setLogoutSubmitting] = useState(false);
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
    ttsLang: StaffTtsLang,
    showNoVoiceToast = false,
    fromUserGesture = false,
    onResult?: (result: StaffTtsPlaybackResult) => void
  ) {
    console.log('[NOTIFY_SOUND_TTS]', { ttsLang, len: text.length, fromUserGesture });
    void playStaffTts(text, ttsLang, { fromUserGesture }).then((result) => {
      onResult?.(result);
      if (result === 'server_not_unlocked' && !fromUserGesture) {
        console.log('[STAFF_AUTO_TTS_SKIPPED]', { reason: 'not_unlocked', severity: 'P2' });
        return;
      }
      if (result === 'lang_unsupported' && showNoVoiceToast) {
        setToast({ kind: 'error', msg: t('ttsVoiceUnavailable') });
        return;
      }
      const failed = result === 'server_failed' || result === 'blocked';
      if (failed && showNoVoiceToast) {
        setToast({ kind: 'error', msg: t('ttsVoiceUnavailable') });
      }
    });
  }

  useEffect(() => {
    staffChatLog('STAFF_CHAT_LANG_SELECTED', {
      locale: locale,
      viewerLang: locale === 'ru' ? 'ru' : 'ko'
    });
  }, [locale]);
  const [soundEnabled, setSoundEnabled] = useState(() =>
    typeof window !== 'undefined' ? loadStaffAlertsEnabled() : true
  );
  const [alertVolume, setAlertVolume] = useState(() =>
    typeof window !== 'undefined' ? loadStaffAlertVolume() : 0.6
  );
  const alertVolumeRef = useRef(alertVolume);
  const [alertSoundKey, setAlertSoundKey] = useState<StaffSoundKey>(() =>
    typeof window !== 'undefined' ? loadStaffSoundKey() : 'default'
  );
  const alertSoundSrcRef = useRef(staffSoundSrc(alertSoundKey));
  const [autoTtsEnabled, setAutoTtsEnabled] = useState(() =>
    typeof window !== 'undefined' ? loadStaffAutoTtsEnabled() : false
  );
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
  const notifyHandledIdsRef = useRef<Set<string>>(new Set());
  const ttsCompletedIdsRef = useRef<Set<string>>(new Set());
  const ttsFailedIdsRef = useRef<Set<string>>(new Set());
  const notifySeededRef = useRef(false);
  const roomBootstrappedRef = useRef(false);
  // Diagnostics: last realtime event type seen per message id (INSERT/UPDATE). Absent ⇒ local/reload.
  const eventTypeByIdRef = useRef<Map<string, 'INSERT' | 'UPDATE'>>(new Map());

  const legacyResolved = useMemo(() => resolveStaffChatUserId(userParam), [userParam]);
  const staffSession = useMemo(
    () => resolveStaffChatSessionIdentity(inviteSession, legacyResolved, sessionUser?.name ?? null),
    [inviteSession, legacyResolved, sessionUser?.name]
  );
  const chatSendUserId = staffSession.currentUserId;
  const staffKey = legacyResolved.key;
  const actorName = staffSession.currentSenderName || staffKeyLabel(staffKey);
  const phraseRequestHeaders = useMemo(() => staffSessionAuthHeaders(), [inviteSession?.inviteId, invitePhase]);
  const webSpeech = useStaffWebSpeech(staffSession.spokenLang);

  const supabase = useMemo(() => createBrowserSupabase(), []);
  const realtimeConnectedRef = useRef(false);
  const isMountedRef = useRef(false);
  const isLoadingRef = useRef(false);
  const lastRealtimeActivityAtRef = useRef(Date.now());
  const lastRealtimeInsertPushAtRef = useRef<number | null>(null);
  const safeSinceRef = useRef<string | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const staffRoomFilterRef = useRef<string | null>(null);
  const [realtimeReconnectToken, setRealtimeReconnectToken] = useState(0);

  // Per-staff "🔔 테스트" ping from the admin participant panel. Only the targeted
  // device (matching inviteId) plays sound + TTS. Channel/event match
  // STAFF_TEST_CHANNEL/STAFF_TEST_EVENT in components/chat/StaffInvitePanel.tsx.
  useEffect(() => {
    if (!supabase) return;
    const myInviteId = inviteSession?.inviteId ? String(inviteSession.inviteId) : null;
    if (!myInviteId) return;
    const ch = supabase.channel('autoflow-staff-test', { config: { broadcast: {} } });
    ch.on('broadcast', { event: 'staff-test' }, (msg: { payload?: Record<string, unknown> }) => {
      const p = msg?.payload;
      if (!p || String(p.target_invite_id ?? '') !== myInviteId) return;
      const text = typeof p.text === 'string' && p.text.trim() ? p.text : '테스트입니다.';
      console.log('[STAFF_TEST_PING_RECEIVED]', { invite_id: myInviteId });
      if (soundEnabled) void playStaffSound(alertSoundSrcRef.current, alertVolumeRef.current);
      const { ttsLang } = resolveStaffTtsLangFromSession({
        spokenLang: staffSession.spokenLang,
        role: staffSession.role,
        uiLocale: locale
      });
      runStaffTts(text, ttsLang, false, false);
      setToast({ kind: 'ok', msg: '🔔 테스트 알림이 도착했습니다.' });
    });
    ch.subscribe();
    return () => {
      try {
        supabase.removeChannel(ch);
      } catch {
        /* ignore */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, inviteSession?.inviteId, soundEnabled, staffSession.spokenLang, staffSession.role, locale]);

  // ── Staff work status (현재 상태) ──────────────────────────────
  const [currentStatus, setCurrentStatus] = useState<StaffWorkStatus>('available');
  useEffect(() => {
    try {
      const v = window.localStorage.getItem(STAFF_STATUS_STORAGE_KEY);
      if (v) setCurrentStatus(normalizeStaffWorkStatus(v));
    } catch {
      /* ignore */
    }
  }, []);
  const statusChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  useEffect(() => {
    const ch = supabase.channel(STAFF_STATUS_CHANNEL, { config: { broadcast: { ack: false } } });
    ch.subscribe();
    statusChannelRef.current = ch;
    return () => {
      try {
        supabase.removeChannel(ch);
      } catch {
        /* ignore */
      }
    };
  }, [supabase]);
  const changeStatus = useCallback(
    async (next: StaffWorkStatus) => {
      setCurrentStatus(next);
      try {
        window.localStorage.setItem(STAFF_STATUS_STORAGE_KEY, next);
      } catch {
        /* ignore */
      }
      const id = inviteSession?.inviteId ? String(inviteSession.inviteId) : null;
      if (id) {
        try {
          await fetch(STAFF_INVITES_URL, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, action: 'set_status', status: next })
          });
          try {
            statusChannelRef.current?.send({
              type: 'broadcast',
              event: STAFF_STATUS_EVENT,
              payload: { id }
            });
          } catch {
            /* ignore */
          }
        } catch {
          /* ignore — local state already updated */
        }
      }
      const meta = staffWorkStatusMeta(next);
      setToast({ kind: 'ok', msg: `${meta.icon} ${meta.label}` });
    },
    [inviteSession?.inviteId, supabase]
  );

  const { messages, setMessages, loadFull, initialHydrationComplete, initialLoadStatus } = useChatLoader({
    loadingRef: isLoadingRef,
    listTimeoutMs: TIMEOUT_MS_CHAT_LIST,
    initialListLimit: STAFF_CHAT_LIST_LIMIT,
    deltaListLimit: STAFF_CHAT_DELTA_LIMIT,
    staffTimelineMode: true,
    syncClient: 'staff',
    messagesRef,
    roomFilterRef: staffRoomFilterRef
  });

  // Read receipts (Phase 2A): advance my own watermark + show "읽음 N" on my own
  // messages only (no roster list on mobile). Canonical reader prefers user:<id>
  // (matches the user-based roster in both env-users and invite modes); invite id
  // is only a fallback when there is no linked user.
  const myReaderId = staffSession.currentUserId
    ? pcReaderId(String(staffSession.currentUserId))
    : staffSession.currentTokenId
      ? inviteReaderId(String(staffSession.currentTokenId))
      : null;
  const { computeRead: computeReadInfo } = useChatReadState({
    supabase,
    messages,
    myReaderId,
    roomId: null,
    enabled: Boolean(myReaderId)
  });

  // Phase 2B Call receive (app-open / in-app only; OS push = Phase 4). Watches
  // chat_messages UPDATE (last_called_at) and rings me when I'm an unread target
  // and not the sender/caller. Reuses existing TTS for the sound.
  const seenCallRef = useRef<Map<string, string>>(new Map());
  const callInitRef = useRef(false);
  const [callBanner, setCallBanner] = useState<{ msgId: string; at: string; text: string } | null>(null);

  useEffect(() => {
    if (!myReaderId) return;
    const firstRun = !callInitRef.current;
    for (const m of messages) {
      const id = String(m.id);
      const lc = m.last_called_at ? String(m.last_called_at) : '';
      const prev = seenCallRef.current.get(id);
      seenCallRef.current.set(id, lc);
      if (firstRun) continue; // seed existing calls on first load — never ring for history
      if (!lc || lc === prev) continue; // no call / unchanged
      if (Date.now() - new Date(lc).getTime() > 60_000) continue; // stale (reconnect backfill)
      if (m.last_called_by && m.last_called_by === myReaderId) continue; // I'm the caller
      if (m.is_deleted) continue;
      if (!computeReadInfo(m).unread.some((x) => x.reader_id === myReaderId)) continue; // I already read it
      const { ttsLang } = resolveStaffTtsLangFromSession({
        spokenLang: staffSession.spokenLang,
        role: staffSession.role,
        uiLocale: locale
      });
      const viewerLang: ChatLang = locale === 'ru' ? 'ru' : 'ko';
      const preview = getMessageDisplayParts(m, viewerLang, { logContext: 'staff' }).primary || m.message || '';
      setCallBanner({ msgId: id, at: lc, text: preview });
      const spoken = resolveManualStaffTtsText(m, ttsLang, viewerLang).text;
      if (soundEnabled && spoken) {
        void unlockServerStaffTts();
        runStaffTts(spoken, ttsLang, true, true);
      }
    }
    if (firstRun) callInitRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, myReaderId, computeReadInfo]);

  // Auto-dismiss the call banner.
  useEffect(() => {
    if (!callBanner) return;
    const t = setTimeout(() => setCallBanner(null), 12_000);
    return () => clearTimeout(t);
  }, [callBanner]);

  const setStaffMessages = useCallback<typeof setMessages>(
    (action) => {
      setMessages((prev) => {
        const next = typeof action === 'function' ? action(prev) : action;
        if (next !== prev) {
          console.log('[STAFF_CHAT_SET_MESSAGES]', {
            source: 'client_patch',
            mode: 'patch',
            count: next.length,
            before_count: prev.length,
            user_filter: 'none'
          });
        }
        return next;
      });
    },
    [setMessages]
  );

  function applyStaffAccountPublic(account: StaffAccountPublic) {
    setInviteSession(accountPublicToInviteSession(account));
    setInvitePhase('ready');
    setSessionSource('account_session');
  }

  async function handleStaffLogin() {
    const code = loginCode.trim();
    const accountId = selectedAccountId.trim();
    if (!accountId) {
      setLoginError(t('staffLoginSelectPlaceholder'));
      return;
    }
    if (!/^\d{4}$/.test(code)) {
      setLoginError(t('staffLoginInvalidCode'));
      return;
    }
    setLoginSubmitting(true);
    setLoginError(null);
    try {
      const res = await fetchEnvelope<{ sessionToken: string; account: StaffAccountPublic }>(
        STAFF_LOGIN_URL,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            account_id: accountId,
            login_code: code,
            device_key: getOrCreateStaffDeviceKey()
          })
        }
      );
      if (!res.ok) {
        if (res.error === 'ACCOUNT_DEACTIVATED') {
          clearStaffSession();
          setInviteSession(null);
          setInvitePhase('deactivated');
          return;
        }
        setLoginError(t('staffLoginInvalidCode'));
        return;
      }
      const { sessionToken, account } = res.data;
      if (!account.userId) {
        setLoginError(t('staffLoginInvalidCode'));
        return;
      }
      saveStaffSession(sessionToken, { accountId: account.accountId, userId: account.userId });
      applyStaffAccountPublic(account);
      staffChatLog('STAFF_CHAT_INVITE_VALIDATE_OK', {
        tokenSource: 'account_session',
        displayName: account.displayName,
        inviteId: account.inviteId
      });
    } catch {
      setLoginError(t('staffLoginInvalidCode'));
    } finally {
      setLoginSubmitting(false);
    }
  }

  useEffect(() => {
    if (invitePhase !== 'login') return;
    let cancelled = false;
    setLoginRosterLoading(true);
    void fetchEnvelope<{ roster: Array<{ accountId: string; displayName: string }> }>(STAFF_LOGIN_ROSTER_URL)
      .then((res) => {
        if (cancelled) return;
        if (res.ok && Array.isArray(res.data?.roster)) {
          setLoginRoster(res.data.roster);
          if (!selectedAccountId && res.data.roster.length === 1) {
            setSelectedAccountId(res.data.roster[0].accountId);
          }
        }
      })
      .finally(() => {
        if (!cancelled) setLoginRosterLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invitePhase]);

  async function handleStaffLogout() {
    if (logoutSubmitting) return;
    setLogoutSubmitting(true);
    try {
      const headers = staffSessionAuthHeaders();
      if (headers.Authorization) {
        await fetchEnvelope(STAFF_LOGOUT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify({ device_key: getOrCreateStaffDeviceKey() })
        });
      }
    } catch {
      /* still clear local session */
    } finally {
      clearStaffSession();
      clearStoredInviteToken();
      setInviteSession(null);
      setSessionUser(null);
      setInvitePhase('login');
      setSelectedAccountId('');
      setLoginCode('');
      setLogoutSubmitting(false);
    }
  }

  useEffect(() => {
    async function bootstrapStaffAuth() {
      clearLegacyInviteStorageOnce();

      const href = typeof window !== 'undefined' ? window.location.href : '';
      const search = typeof window !== 'undefined' ? window.location.search : '';
      const urlInviteToken =
        readBootstrapUrlParam(searchParams, 't') || readBootstrapUrlParam(searchParams, 'token');
      const joinToken = readBootstrapUrlParam(searchParams, 'join');
      const legacyUser =
        readBootstrapUrlParam(searchParams, 'user') || readDeprecatedUserParamFromUrl();
      const deviceKey = getOrCreateStaffDeviceKey();
      const hasStaffSession = Boolean(loadStoredSessionToken());
      const hasLegacyInviteToken = Boolean(loadStoredInviteToken());
      const hasUrlToken = Boolean(urlInviteToken);
      const hasJoinToken = Boolean(joinToken);

      let nextPhase: InvitePhase = 'login';

      const sessionToken = loadStoredSessionToken();
      if (sessionToken) {
        try {
          const result = await fetchEnvelope<{ account: StaffAccountPublic }>(STAFF_SESSION_URL, {
            headers: { Authorization: `Bearer ${sessionToken}` }
          });
          if (result.ok) {
            applyStaffAccountPublic(result.data.account);
            logBootstrapPhase1({
              href,
              search,
              hasUrlToken,
              hasJoinToken,
              hasLegacyInviteToken,
              hasStaffSession,
              nextPhase: 'ready',
              path: 'session_valid'
            });
            return;
          }
          if (result.error === 'ACCOUNT_DEACTIVATED') {
            clearStaffSession();
            setInviteSession(null);
            nextPhase = 'deactivated';
            setInvitePhase(nextPhase);
            logBootstrapPhase1({
              href,
              search,
              hasUrlToken,
              hasJoinToken,
              hasLegacyInviteToken,
              hasStaffSession,
              nextPhase,
              path: 'session_deactivated'
            });
            return;
          }
          clearStaffSession();
        } catch {
          clearStaffSession();
        }
      }

      if (legacyUser && !urlInviteToken && !joinToken) {
        setInviteSession(null);
        setDeprecatedWarned(true);
        nextPhase = 'ready';
        setInvitePhase(nextPhase);
        logBootstrapPhase1({
          href,
          search,
          hasUrlToken,
          hasJoinToken,
          hasLegacyInviteToken,
          hasStaffSession,
          nextPhase,
          path: 'legacy_user'
        });
        return;
      }

      if (joinToken) setEntryJoinToken(joinToken);

      if (urlInviteToken) {
        try {
          const qs = new URLSearchParams({
            token: urlInviteToken,
            check: 'any',
            device_key: deviceKey
          });
          const result = await fetchEnvelope<{ invite: StaffInvite; userId: string | null }>(
            `${STAFF_INVITES_URL}?${qs.toString()}`
          );
          if (!result.ok) {
            staffChatLog('STAFF_CHAT_INVITE_VALIDATE_FAIL', {
              tokenSource: 'url',
              tokenPrefix: urlInviteToken.slice(0, 8),
              httpStatus: result.status,
              error: result.error,
              message: result.message,
              urlHadT: true
            });
            if (result.error === 'INVITE_REVOKED') {
              setInviteSession(null);
              nextPhase = 'revoked';
              setInvitePhase(nextPhase);
              logBootstrapPhase1({
                href,
                search,
                hasUrlToken,
                hasJoinToken,
                hasLegacyInviteToken,
                hasStaffSession,
                nextPhase,
                path: 'url_invite_revoked'
              });
              return;
            }
            if (legacyUser) {
              setInviteSession(null);
              setDeprecatedWarned(true);
              nextPhase = 'ready';
              setInvitePhase(nextPhase);
              logBootstrapPhase1({
                href,
                search,
                hasUrlToken,
                hasJoinToken,
                hasLegacyInviteToken,
                hasStaffSession,
                nextPhase,
                path: 'url_invite_fail_legacy_fallback'
              });
              return;
            }
            if (joinToken) {
              nextPhase = 'join';
              setInvitePhase(nextPhase);
              logBootstrapPhase1({
                href,
                search,
                hasUrlToken,
                hasJoinToken,
                hasLegacyInviteToken,
                hasStaffSession,
                nextPhase,
                path: 'url_invite_fail_join_fallback'
              });
              return;
            }
            nextPhase = 'invalid';
            setInvitePhase(nextPhase);
            logBootstrapPhase1({
              href,
              search,
              hasUrlToken,
              hasJoinToken,
              hasLegacyInviteToken,
              hasStaffSession,
              nextPhase,
              path: 'url_invite_invalid'
            });
            return;
          }

          setInviteSession(inviteToSession(result.data.invite, result.data.userId ?? null));
          nextPhase = 'ready';
          setInvitePhase(nextPhase);
          setSessionSource('invite_token');
          staffChatLog('STAFF_CHAT_INVITE_VALIDATE_OK', {
            tokenSource: 'url',
            displayName: result.data.invite.display_name,
            inviteId: result.data.invite.id
          });
          logBootstrapPhase1({
            href,
            search,
            hasUrlToken,
            hasJoinToken,
            hasLegacyInviteToken,
            hasStaffSession,
            nextPhase,
            path: 'url_invite_ok'
          });
          return;
        } catch (e: unknown) {
          staffChatLog('STAFF_CHAT_INVITE_VALIDATE_FAIL', {
            tokenSource: 'url',
            tokenPrefix: urlInviteToken.slice(0, 8),
            error: 'EXCEPTION',
            message: e instanceof Error ? e.message : String(e),
            urlHadT: true
          });
          if (legacyUser) {
            setInviteSession(null);
            setDeprecatedWarned(true);
            nextPhase = 'ready';
            setInvitePhase(nextPhase);
            logBootstrapPhase1({
              href,
              search,
              hasUrlToken,
              hasJoinToken,
              hasLegacyInviteToken,
              hasStaffSession,
              nextPhase,
              path: 'url_invite_exception_legacy_fallback'
            });
            return;
          }
          if (joinToken) {
            nextPhase = 'join';
            setInvitePhase(nextPhase);
            logBootstrapPhase1({
              href,
              search,
              hasUrlToken,
              hasJoinToken,
              hasLegacyInviteToken,
              hasStaffSession,
              nextPhase,
              path: 'url_invite_exception_join_fallback'
            });
            return;
          }
          nextPhase = 'invalid';
          setInvitePhase(nextPhase);
          logBootstrapPhase1({
            href,
            search,
            hasUrlToken,
            hasJoinToken,
            hasLegacyInviteToken,
            hasStaffSession,
            nextPhase,
            path: 'url_invite_exception_invalid'
          });
          return;
        }
      }

      if (joinToken) {
        nextPhase = 'join';
        setInvitePhase(nextPhase);
        logBootstrapPhase1({
          href,
          search,
          hasUrlToken,
          hasJoinToken,
          hasLegacyInviteToken,
          hasStaffSession,
          nextPhase,
          path: 'join_only'
        });
        return;
      }

      if (legacyUser) {
        setDeprecatedWarned(true);
      }
      nextPhase = 'login';
      setInvitePhase(nextPhase);
      logBootstrapPhase1({
        href,
        search,
        hasUrlToken,
        hasJoinToken,
        hasLegacyInviteToken,
        hasStaffSession,
        nextPhase,
        path: 'default_login'
      });
    }
    void bootstrapStaffAuth();
  }, [searchParams]);

  useEffect(() => {
    if (invitePhase !== 'ready') return;

    const sessionToken = loadStoredSessionToken();
    const inviteToken = inviteSession?.token?.trim() || '';

    async function revalidateSession() {
      if (sessionToken) {
        try {
          const result = await fetchEnvelope<{ account: StaffAccountPublic }>(STAFF_SESSION_URL, {
            headers: { Authorization: `Bearer ${sessionToken}` }
          });
          if (!result.ok) {
            if (result.error === 'ACCOUNT_DEACTIVATED') {
              clearStaffSession();
              setInviteSession(null);
              setInvitePhase('deactivated');
            } else {
              clearStaffSession();
              setInviteSession(null);
              setInvitePhase('login');
            }
          }
        } catch {
          /* ignore transient network errors */
        }
        return;
      }

      if (!inviteToken) return;

      try {
        const qs = new URLSearchParams({ token: inviteToken, check: 'any' });
        const result = await fetchEnvelope<{ invite: StaffInvite; userId: string | null }>(
          `${STAFF_INVITES_URL}?${qs.toString()}`
        );
        if (!result.ok && (result.error === 'INVITE_REVOKED' || result.status === 403)) {
          setInviteSession(null);
          setInvitePhase('revoked');
        }
      } catch {
        /* ignore transient network errors */
      }
    }

    const intervalId = window.setInterval(() => void revalidateSession(), 60_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void revalidateSession();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [invitePhase, inviteSession?.token]);

  async function handleEntryJoin() {
    const name = joinName.trim();
    if (!name || !entryJoinToken) return;
    setJoinSubmitting(true);
    setJoinError(null);
    try {
      const res = await fetch(STAFF_INVITES_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'join',
          entry_token: entryJoinToken,
          display_name: name,
          spoken_lang: joinLang,
          device_key: getOrCreateStaffDeviceKey()
        })
      });
      const json = await res.json();
      if (json?.error === 'DEVICE_REVOKED') {
        setJoinError(t('joinDeviceBlocked'));
        return;
      }
      if (json?.error === 'INVALID_ENTRY_TOKEN') {
        setJoinError(t('joinInvalidQr'));
        return;
      }
      if (json?.ok && json?.data?.invite) {
        saveStoredInviteToken(json.data.invite.token);
        setInviteSession(inviteToSession(json.data.invite, json.data.userId ?? null));
        setInvitePhase('ready');
        setSessionSource('invite_token');
        if (typeof window !== 'undefined') {
          window.history.replaceState({}, '', '/staff-chat');
        }
        return;
      }
      setJoinError(t('joinInvalidQr'));
    } catch {
      setJoinError(t('sendFailed'));
    } finally {
      setJoinSubmitting(false);
    }
  }

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
    const visible = messages.filter((m) => !m.is_deleted);
    const mobileCount = visible.filter((m) => m.sender_side === 'mobile').length;
    const pcCount = visible.filter((m) => m.sender_side === 'pc').length;
    staffChatLog('STAFF_CHAT_TIMELINE_LOADED', {
      message_count: visible.length,
      mobile_count: mobileCount,
      pc_count: pcCount,
      list_limit: STAFF_CHAT_LIST_LIMIT,
      user_filter: 'none',
      userParam: userParam || null,
      staffKey
    });
    setListPhase('ready');
    staffChatLog('STAFF_CHAT_READY', {
      staffKey,
      message_count: messages.length,
      hasSession: Boolean(sessionUser)
    });
  }, [initialHydrationComplete, initialLoadStatus, messages, listPhase, staffKey, sessionUser, userParam]);

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
    setLatencySelf('mobile', 'staff');
  }, []);

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
    if (typeof window === 'undefined') return;
    const onFirst = () => {
      void unlockNotificationAudio();
      void unlockStaffSound(alertSoundSrcRef.current);
      window.removeEventListener('pointerdown', onFirst, true);
      window.removeEventListener('keydown', onFirst, true);
    };
    window.addEventListener('pointerdown', onFirst, true);
    window.addEventListener('keydown', onFirst, true);
    return () => {
      window.removeEventListener('pointerdown', onFirst, true);
      window.removeEventListener('keydown', onFirst, true);
    };
  }, []);

  useEffect(() => {
    const stored = loadStaffAlertsEnabled();
    setSoundEnabled(stored);
    setAutoTtsEnabled(loadStaffAutoTtsEnabled());
    if (stored) {
      hydrateServerStaffTtsUnlockFromStorage();
    }
    refreshUnlockSnapshot();
    console.log('[STAFF_CHAT_SOUND_TOGGLE]', {
      event: 'hydrate_from_storage',
      soundEnabled: stored,
      serverTtsUnlocked: isServerStaffTtsUnlocked()
    });
  }, [refreshUnlockSnapshot]);

  useEffect(() => {
    if (!isBrowserNotificationSupported()) {
      setBrowserNotifyPermission('unsupported');
      return;
    }
    setBrowserNotifyPermission(Notification.permission);
  }, []);

  const { handleRealtimeStatus, requestRefetch } = useChatRefetchFallback({
    loadFull,
    isLoadingRef,
    isMountedRef,
    reconnectToken: realtimeReconnectToken,
    listLimit: STAFF_CHAT_LIST_LIMIT,
    enableIntervalPolling: true,
    pollIntervalMs: 15000,
    lastRealtimeActivityAtRef,
    syncClient: 'staff'
  });

  useChatVisibleTrace({
    client: 'staff',
    messages,
    roomFilter: roomNo || null,
    userFilter: null
  });

  useChatRealtime({
    supabase,
    setMessages: setStaffMessages,
    messagesRef,
    realtimeConnectedRef,
    lastRealtimeActivityAtRef,
    lastRealtimeInsertPushAtRef,
    reconnectToken: realtimeReconnectToken,
    onConnectionStatus: setConnectionStatus,
    onRealtimeStatus: handleRealtimeStatus,
    syncClient: 'staff',
    currentUserId: chatSendUserId,
    onRowEvent: (e) => {
      eventTypeByIdRef.current.set(e.id, e.type);
    }
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
    return registerChatSyncProbe('staff', {
      dumpState: () => ({
        client: 'staff',
        message_count: messagesRef.current.length,
        latest_message_id: latestMessageMeta(messagesRef.current).id,
        latest_created_at: latestMessageMeta(messagesRef.current).created_at,
        realtime_status: realtimeConnectedRef.current ? 'SUBSCRIBED' : 'DISCONNECTED',
        realtime_connected: realtimeConnectedRef.current,
        reconnect_token: realtimeReconnectToken,
        selected_room_filter: roomNo || null,
        user_filter: null,
        current_user_id: chatSendUserId,
        current_token_id: inviteSession?.inviteId ?? null,
        last_fetch_reason: null,
        last_fetch_at: null
      }),
      refetch: (reason) => requestRefetch(reason)
    });
  }, [chatSendUserId, inviteSession?.inviteId, realtimeReconnectToken, requestRefetch, roomNo]);

  // Native FCM → foreground timeline refetch.
  // Android MainActivity.dispatchFcmMessageToWebView() calls this via evaluateJavascript
  // ONLY when the app is in the foreground. Background stays on the notification-tap →
  // loadUrl → mount loadFull path. No realtime/loader/merge changes here.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handle = {
      forceRefetchFromNative(reason = 'native_fcm') {
        console.log('[STAFF_FCM_REFETCH_REQUEST]', JSON.stringify({ reason, ts: Date.now() }));
        return Promise.resolve(loadFull(reason))
          .then((result) => {
            console.log('[STAFF_FCM_REFETCH_DONE]', JSON.stringify({ reason, ok: true }));
            return result;
          })
          .catch((error) => {
            console.log(
              '[STAFF_FCM_REFETCH_DONE]',
              JSON.stringify({ reason, ok: false, error: String((error as any)?.message ?? error) })
            );
          });
      }
    };
    (window as any).__autoFlowStaffChat = handle;
    return () => {
      if ((window as any).__autoFlowStaffChat === handle) {
        delete (window as any).__autoFlowStaffChat;
      }
    };
  }, [loadFull]);

  useEffect(() => {
    if (!initialHydrationComplete) return;
    if (invitePhase === 'loading') return;
    if (!staffSession.currentUserId && !staffSession.currentTokenId) return;

    const serverUnlocked = isServerStaffTtsUnlocked();
    const { ttsLang, ttsLangSource } = resolveStaffTtsLangFromSession({
      spokenLang: staffSession.spokenLang,
      role: staffSession.role,
      uiLocale: locale
    });

    if (!notifySeededRef.current) {
      for (const m of messages) {
        const id = m?.id != null ? String(m.id) : '';
        if (id && !id.startsWith('tmp-')) {
          notifyHandledIdsRef.current.add(id);
          ttsCompletedIdsRef.current.add(id);
        }
      }
      notifySeededRef.current = true;
      logStaffTtsTriggerCheck({
        messageId: null,
        text: '',
        ttsLang,
        ttsLangSource,
        translatedTts: '',
        translatedTtsExists: false,
        ttsTextLength: 0,
        ttsTextOrigin: 'insert',
        originalLang: '',
        isSelfMessage: false,
        soundEnabled,
        autoTtsEnabled,
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

      const isSelf = isStaffChatSelfMessage(m, staffSession);
      const ttsTextOrigin = notifyHandledIdsRef.current.has(id) ? 'update' : 'insert';
      const viewerLang: ChatLang = locale === 'ru' ? 'ru' : 'ko';
      const autoResolved = resolveAutoStaffTtsText(m, ttsLang);
      const toSpeak = autoResolved.text;
      const originalLang = String(m.original_lang || '').trim();
      const { primary } = getMessageDisplayParts(m, viewerLang, {
        logContext: 'staff',
        selectedLang: locale
      });
      const urgent = isUrgentMessage(m);
      const preview = String(primary || m.message || '').trim();
      const localVoiceForLang =
        ttsLang === 'ru' && ruVoiceReady !== null
          ? ruVoiceReady
          : isVoiceAvailableForLocale(ttsLang);
      const willCallPlayStaffTts = Boolean(
        autoTtsEnabled && toSpeak && !ttsCompletedIdsRef.current.has(id)
      );
      const shouldUseServerTts =
        willCallPlayStaffTts &&
        isServerTtsLangSupported(ttsLang) &&
        !localVoiceForLang;

      const triggerBase = {
        messageId: id,
        text: preview.slice(0, 120),
        ttsLang,
        ttsLangSource,
        translatedTts: (autoResolved.source === 'translation' ? toSpeak : '')?.slice(0, 120) ?? '',
        translatedTtsExists: autoResolved.translatedTtsExists,
        ttsTextLength: autoResolved.ttsTextLength,
        ttsTextOrigin,
        originalLang,
        isSelfMessage: isSelf,
        soundEnabled,
        autoTtsEnabled,
        serverTtsAvailable,
        serverTtsUnlocked: serverUnlocked,
        localRuVoice: ruVoiceReady,
        viewerLang,
        ttsText: toSpeak ? String(toSpeak).slice(0, 120) : null,
        ttsTextSource: autoResolved.source,
        toSpeak: toSpeak ? String(toSpeak).slice(0, 120) : null,
        shouldUseServerTts,
        willCallPlayStaffTts,
        willCallPlayServerStaffTts: shouldUseServerTts
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
        ttsCompletedIdsRef.current.add(id);
        continue;
      }

      if (!notifyHandledIdsRef.current.has(id)) {
        notifyHandledIdsRef.current.add(id);

        // Diagnostic: dump the exact gate values immediately before any sound/TTS/toast fires.
        // Reaching here means isSelf was computed false — log the raw identity fields so we can
        // see WHY (sender vs my id, alias mapping) and whether the same id re-fires per event.
        console.log('[STAFF_SOUND_FIRE]', {
          messageId: id,
          eventType: eventTypeByIdRef.current.get(id) ?? 'local_or_reload',
          senderUserId: m.user_id ?? null,
          senderSide: m.sender_side ?? null,
          senderName: (m as any).sender_name ?? null,
          myUserId: staffSession.currentUserId,
          currentUserAlias: staffKey,
          userParam: userParam ?? null,
          currentTokenId: staffSession.currentTokenId,
          isSelf,
          soundEnabled,
          autoTtsEnabled,
          translatedRuExists: Boolean((m as any).translated_text?.ru),
          createdAt: m.created_at ?? null,
          updatedAt: (m as any).updated_at ?? null
        });

        const notifyBody = String(preview || m.message || '').trim();
        const foregroundVisible = isInAppForegroundVisible();
        const backgroundLike = isOsBackgroundLike();

        if (foregroundVisible) {
          setToast({
            kind: 'ok',
            urgent,
            msg: urgent ? `🚨 ${t('urgentToast')}\n${preview.slice(0, 80)}` : `📩 ${preview.slice(0, 40)}`
          });

          if (soundEnabled) {
            console.log('[STAFF_CHAT_SOUND_PLAY]', {
              messageId: id,
              soundEnabled: true,
              urgent,
              foregroundVisible: true,
              volume: alertVolumeRef.current
            });
            void playStaffSound(alertSoundSrcRef.current, alertVolumeRef.current);
          }
        }

        if (backgroundLike) {
          const permission =
            typeof window !== 'undefined' && 'Notification' in window
              ? Notification.permission
              : 'unsupported';
          console.log('[STAFF_BROWSER_NOTIFY_DECISION]', {
            messageId: id,
            permission,
            backgroundLike,
            visibilityState: typeof document !== 'undefined' ? document.visibilityState : null
          });

          if (canShowBrowserNotification()) {
            const body = normalizeNotifyBody(m.room_no, notifyBody).slice(0, OS_NOTIFY_BODY_MAX);
            if (body) {
              void showBrowserNotification({
                title: urgent ? `🚨 ${t('urgentToast')}` : staffKeyLabel(staffKey) || 'AutoFlow Chat',
                body,
                tag: id,
                requireInteraction: urgent,
                silent: true // OS popup visual-only; AutoFlow plays the single sound
              }).then((ok) => {
                console.log('[STAFF_BROWSER_NOTIFY_RESULT]', { messageId: id, ok, permission });
              });
            }
          } else {
            console.log('[STAFF_BROWSER_NOTIFY_SKIPPED]', {
              messageId: id,
              permission,
              reason:
                permission === 'denied'
                  ? 'permission_denied'
                  : permission === 'default'
                    ? 'permission_default'
                    : 'unsupported',
              hint: 'mobile_screen_off_requires_native_fcm'
            });
          }

          if (soundEnabled) {
            void playStaffSound(alertSoundSrcRef.current, alertVolumeRef.current);
          }
        }
      }

      if (!autoTtsEnabled) {
        if (ttsTextOrigin === 'insert') {
          logStaffTtsTriggerCheck({
            ...triggerBase,
            shouldUseServerTts: false,
            willCallPlayStaffTts: false,
            willCallPlayServerStaffTts: false,
            skipReason: 'skip_auto_tts_disabled'
          });
        }
        continue;
      }

      if (ttsCompletedIdsRef.current.has(id) || ttsFailedIdsRef.current.has(id)) {
        continue;
      }

      if (!toSpeak) {
        logStaffTtsTriggerCheck({
          ...triggerBase,
          skipReason: resolveAutoStaffTtsSkipReason(autoResolved) ?? 'skip_tts_text_missing_initial'
        });
        continue;
      }

      const skipReason =
        ttsTextOrigin === 'update' ? 'retry_on_translation_ready' : 'triggered';
      logStaffTtsTriggerCheck({
        ...triggerBase,
        skipReason
      });
      noteStaffTtsMessageReceived();
      logStaffTtsUserActivation('realtime_effect_before_runStaffTts', {
        messageId: id,
        ttsTextOrigin,
        fromUserGesture: false
      });
      runStaffTts(toSpeak, ttsLang, false, false, (result) => {
        if (result === 'spoken' || result === 'server_spoken') {
          ttsCompletedIdsRef.current.add(id);
        } else {
          ttsFailedIdsRef.current.add(id);
        }
      });
    }
  }, [
    messages,
    initialHydrationComplete,
    staffSession,
    invitePhase,
    locale,
    staffKey,
    soundEnabled,
    autoTtsEnabled,
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
      const clientPerfStart = typeof performance !== 'undefined' ? performance.now() : Date.now();
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

      const nonce = createClientNonce('staff');
      const clientSendTs = Date.now();
      logSendClick(nonce);
      latSendClick({ client_nonce: nonce, sender_side: 'mobile', room: r || null, source: 'staff' });
      setSending(true);
      setToast(null);
      staffChatLog('STAFF_CHAT_SEND_API_START', {
        userId: chatSendUserId,
        actorName,
        roomNo: r,
        client_nonce: nonce
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
        fd.append('client_send_ts', String(clientSendTs));
        fd.append('client_request_id', nonce);
        fd.append('client_device_id', `staff-chat-${staffKey}`);
        if (image) fd.append('image', image);

        latApiStart(nonce);
        const res = await fetchEnvelope<{ message: ChatMessage; client_nonce?: string }>(CHAT_SEND_URL, {
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
          if (res.error === 'INVITE_REVOKED') {
            clearStaffSession();
            clearStoredInviteToken();
            setInviteSession(null);
            setInvitePhase('revoked');
            return false;
          }
          setToast({ kind: 'error', msg: t('sendFailed') });
          return false;
        }
        const saved = unwrapChatSendEnvelopeData(res.data);
        if (!saved?.id) {
          staffChatLog('STAFF_CHAT_SEND_API_ERROR', { reason: 'missing_message_id' });
          setToast({ kind: 'error', msg: t('sendFailed') });
          return false;
        }
        const clientPerfEnd = typeof performance !== 'undefined' ? performance.now() : Date.now();
        staffChatLog('STAFF_CHAT_SEND_API_SUCCESS', {
          client_nonce: nonce,
          echoed_client_nonce: res.data?.client_nonce ?? null,
          messageId: saved.id,
          roomNo: saved.room_no ?? r,
          client_total_ms: Math.round(clientPerfEnd - clientPerfStart),
          hasImage: Boolean(image),
          image_size: image?.size ?? null
        });
        registerMessageIdForNonce(nonce, String(saved.id));
        logSendApiResponded(nonce, String(saved.id), saved.created_at);
        latApiResponded(nonce, String(saved.id), Boolean((saved as any)?.translated_text));
        setStaffMessages((prev) => {
          if (prev.some((m) => String(m.id) === String(saved.id))) return prev;
          return [...prev, saved].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
        });
        void requestRefetch('send_ack');
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
    [actorName, chatSendUserId, locale, roomNo, sessionSource, setStaffMessages, staffKey, inviteSession?.inviteId, pendingPhraseKey, t, requestRefetch]
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
      void unlockNotificationAudio();
      void unlockStaffSound(alertSoundSrcRef.current);
      unlockStaffTts();
      armServerStaffTtsUnlock();
      refreshUnlockSnapshot();
      void unlockServerStaffTts();
      console.log('[STAFF_CHAT_SOUND_TOGGLE]', {
        event: 're_unlock_while_on',
        soundEnabled: true
      });
      return;
    }

    const next = !soundEnabled;
    saveStaffAlertsEnabled(next);
    setSoundEnabled(next);
    console.log('[STAFF_CHAT_SOUND_TOGGLE]', {
      prev: soundEnabled,
      next,
      stored: loadStaffAlertsEnabled()
    });
    if (next) {
      void unlockNotificationAudio();
      void unlockStaffSound(alertSoundSrcRef.current);
      unlockStaffTts();
      armServerStaffTtsUnlock();
      refreshUnlockSnapshot();
      void unlockServerStaffTts();
    } else {
      resetServerStaffTtsUnlock();
      refreshUnlockSnapshot();
    }
  }

  function handleAlertVolumeChange(v: number) {
    const clamped = Math.min(1, Math.max(0, v));
    setAlertVolume(clamped);
    alertVolumeRef.current = clamped;
    saveStaffAlertVolume(clamped);
  }

  function handleAlertSoundKeyChange(key: StaffSoundKey) {
    setAlertSoundKey(key);
    const src = staffSoundSrc(key);
    alertSoundSrcRef.current = src;
    saveStaffSoundKey(key);
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
    console.log('[STAFF_CHAT_PHOTO_SELECTED]', {
      file_size: file.size,
      mime_type: file.type,
      last_modified: file.lastModified,
      has_preview: true
    });
    setPhotoRoom('');
    setPhotoStatusText('');
    setPhotoPhraseKey(null);
    const previewUrl = URL.createObjectURL(file);
    setPendingPhoto({ file, previewUrl });
  }

  function handleVoiceClick() {
    if (!webSpeech.supported) {
      setToast({ kind: 'error', msg: t('sttUnsupported') });
      return;
    }
    if (webSpeech.listening) {
      webSpeech.stop();
      return;
    }
    webSpeech.start(
      (transcript) => {
        if (!transcript) return;
        setText((prev) => (prev.trim() ? `${prev.trim()} ${transcript}` : transcript));
        window.setTimeout(() => inputRef.current?.focus(), 0);
      },
      () => setToast({ kind: 'error', msg: t('sttError') })
    );
    setToast({ kind: 'ok', msg: t('sttListening') });
  }

  const localeButtons: { code: StaffLocale; flag: string }[] = [
    { code: 'ko', flag: '🇰🇷' },
    { code: 'ru', flag: '🇷🇺' }
  ];

  const timelineMessages = useMemo(() => {
    // Diagnostics keep the original "deleted excluded" semantics…
    logStaffChatVisibleMessages(messages, { staffKey, userParam: userParam || null });
    // …but render keeps soft-deleted rows so they show "삭제된 메시지입니다" (PC parity).
    return buildStaffChatRenderTimeline(messages);
  }, [messages, staffKey, userParam]);

  if (invitePhase === 'loading' || !i18nHydrated) {
    return (
      <main className="flex h-[100dvh] items-center justify-center bg-[#eceff1]">
        <p className="text-sm text-gray-500">{t('loading')}</p>
      </main>
    );
  }

  if (invitePhase === 'revoked') {
    return (
      <main className="flex h-[100dvh] flex-col items-center justify-center gap-3 bg-[#eceff1] px-6 text-center">
        <p className="text-lg font-bold text-rose-700">{t('revokedInvite')}</p>
        <p className="text-sm text-gray-600">{t('revokedInviteHelp')}</p>
      </main>
    );
  }

  if (invitePhase === 'deactivated') {
    return (
      <main className="flex h-[100dvh] flex-col items-center justify-center gap-3 bg-[#eceff1] px-6 text-center">
        <p className="text-lg font-bold text-rose-700">{t('staffAccountDeactivated')}</p>
      </main>
    );
  }

  if (invitePhase === 'login') {
    return (
      <main className="flex h-[100dvh] flex-col items-center justify-center gap-4 bg-[#eceff1] px-6">
        <h1 className="text-lg font-bold text-gray-900">{t('staffLoginTitle')}</h1>
        <select
          value={selectedAccountId}
          onChange={(e) => {
            setSelectedAccountId(e.target.value);
            setLoginError(null);
          }}
          disabled={loginRosterLoading || loginSubmitting}
          className="w-full max-w-xs rounded-lg border border-gray-300 bg-white px-3 py-3 text-sm font-semibold text-gray-900"
        >
          <option value="">{loginRosterLoading ? t('loading') : t('staffLoginSelectPlaceholder')}</option>
          {loginRoster.map((row) => (
            <option key={row.accountId} value={row.accountId}>
              {row.displayName}
            </option>
          ))}
        </select>
        <input
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={4}
          autoComplete="off"
          value={loginCode}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, '').slice(0, 4);
            setLoginCode(digits);
            setLoginError(null);
          }}
          placeholder={t('staffLoginCodePlaceholder')}
          className="w-full max-w-xs rounded-lg border border-gray-300 bg-white px-3 py-3 text-center text-2xl tracking-[0.4em]"
        />
        {loginError ? <p className="text-sm text-rose-600">{loginError}</p> : null}
        <button
          type="button"
          disabled={!selectedAccountId || loginCode.length !== 4 || loginSubmitting}
          onClick={() => void handleStaffLogin()}
          className="rounded-lg bg-[#FEE500] px-8 py-3 text-sm font-bold text-gray-900 disabled:opacity-50"
        >
          {loginSubmitting ? t('sending') : t('staffLoginSubmit')}
        </button>
      </main>
    );
  }

  if (invitePhase === 'join') {
    return (
      <main className="flex h-[100dvh] flex-col items-center justify-center gap-4 bg-[#eceff1] px-6">
        <h1 className="text-lg font-bold text-gray-900">{t('joinTitle')}</h1>
        <input
          value={joinName}
          onChange={(e) => setJoinName(e.target.value)}
          placeholder={t('joinNamePlaceholder')}
          className="w-full max-w-xs rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
        />
        <div className="flex gap-2">
          {(['ko', 'ru'] as const).map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => setJoinLang(code)}
              className={`rounded-lg border px-4 py-2 text-sm font-semibold ${
                joinLang === code ? 'border-blue-500 bg-blue-50 text-blue-800' : 'border-gray-300 bg-white'
              }`}
            >
              {code === 'ko' ? t('langKo') : t('langRu')}
            </button>
          ))}
        </div>
        {joinError ? <p className="text-sm text-rose-600">{joinError}</p> : null}
        <button
          type="button"
          disabled={!joinName.trim() || joinSubmitting}
          onClick={() => void handleEntryJoin()}
          className="rounded-lg bg-[#FEE500] px-6 py-2 text-sm font-bold text-gray-900 disabled:opacity-50"
        >
          {joinSubmitting ? t('sending') : t('joinSubmit')}
        </button>
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
        <div className="mx-auto mb-1 flex max-w-md items-center gap-2">
          <span className="shrink-0 text-[11px] font-semibold text-gray-500">현재 상태</span>
          <select
            value={currentStatus}
            onChange={(e) => void changeStatus(e.target.value as StaffWorkStatus)}
            className="flex-1 rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm font-bold text-gray-800"
            aria-label="현재 상태 선택"
          >
            {STAFF_WORK_STATUS_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.icon} {o.label}
              </option>
            ))}
          </select>
        </div>
        <StaffNativeSoundPicker
          soundKey={alertSoundKey}
          volume={alertVolume}
          onSoundKeyChange={handleAlertSoundKeyChange}
          onVolumeChange={handleAlertVolumeChange}
        />
        {!notificationAudioUnlocked && soundEnabled ? (
          <div className="mx-auto mb-1 max-w-md">
            <button
              type="button"
              onClick={() => void unlockNotificationAudio()}
              className="w-full rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-center text-[11px] font-semibold text-amber-900"
            >
              🔊 {t('soundOn')} — tap to enable alert beep
            </button>
          </div>
        ) : null}
        <div className="mx-auto flex max-w-md items-center justify-end gap-1.5">
          <button
            type="button"
            disabled={logoutSubmitting}
            onClick={() => void handleStaffLogout()}
            className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-[11px] font-semibold text-gray-700"
          >
            {t('staffLogout')}
          </button>
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
          {browserNotifyPermission !== 'unsupported' ? (
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
          ) : null}
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
            ttsLang={diagTtsLang}
            ttsLangSource={String(ttsLangSource)}
            translatedTtsExists={translatedTtsExists}
            ttsTextLength={ttsTextLength}
            ttsTextOrigin={ttsTextOrigin}
            ruVoiceReady={ruVoiceReady}
          />
        ) : null}
      </header>

      {staffNotice ? <StaffNoticeBanner notice={staffNotice} /> : null}

      <StaffPwaInstallBanner lang={locale} />

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
        ) : timelineMessages.length === 0 ? (
          <p className="py-12 text-center text-sm text-gray-400">{t('noMessages')}</p>
        ) : (
          <div className="space-y-2 pb-2">
            {timelineMessages.map((m) => {
              const mine = isStaffChatSelfMessage(m, staffSession);
              if (m.is_deleted) {
                // Soft-deleted: show the same placeholder as PC, aligned like a normal bubble.
                return (
                  <div key={String(m.id)} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                    <div className="max-w-[88%] rounded-2xl bg-gray-100 px-3 py-2 text-[11px] italic text-gray-400">
                      삭제된 메시지입니다
                    </div>
                  </div>
                );
              }
              const urgent = isUrgentMessage(m);
              const viewerLang: ChatLang = locale === 'ru' ? 'ru' : 'ko';
              const { ttsLang } = resolveStaffTtsLangFromSession({
                spokenLang: staffSession.spokenLang,
                role: staffSession.role,
                uiLocale: locale
              });
              const ttsResolved = resolveManualStaffTtsText(m, ttsLang, viewerLang);
              const speakText = ttsResolved.text;
              const { primary, secondary } = getMessageDisplayParts(m, viewerLang, {
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
                      {!mine && speakText && soundEnabled ? (
                        <button
                          type="button"
                          onClick={() => {
                            void unlockServerStaffTts();
                            runStaffTts(speakText, ttsLang, true, true);
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
                    {/* 본인 메시지에만 읽음 수(명단 없음). */}
                    {mine ? (
                      <div className="mt-0.5 text-right text-[10px] text-blue-100/80">
                        읽음 {computeReadInfo(m).readCount}
                      </div>
                    ) : null}
                    {/* 시간 — 월/일 시간 (연도 제외) */}
                    <div className={`mt-0.5 text-[10px] ${mine ? 'text-right text-blue-100/70' : 'text-gray-400'}`}>
                      {formatKSTShort(m.created_at)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Phase 2B Call: 호출 수신 배너 (앱 오픈 상태). 탭하면 닫힘. */}
      {callBanner ? (
        <button
          type="button"
          onClick={() => setCallBanner(null)}
          className="fixed left-1/2 top-3 z-[60] -translate-x-1/2 rounded-xl border-2 border-orange-400 bg-orange-500 px-4 py-2 text-sm font-bold text-white shadow-2xl"
          role="alert"
        >
          🔔 호출되었습니다{callBanner.text ? ` — ${callBanner.text.slice(0, 30)}` : ''}
        </button>
      ) : null}

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
          requestHeaders={phraseRequestHeaders}
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
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-2xl active:bg-gray-200 disabled:opacity-40 ${
              webSpeech.listening ? 'bg-red-100 ring-2 ring-red-400' : 'bg-gray-100'
            }`}
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

export default StaffChatPageInner;
