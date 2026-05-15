'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '@/lib/types';
import { isSameRoomForNotify, messagePreview, normalizeRoomNo } from '@/lib/chat/chatNotifyPolicy';
import { classifyMessage, getCategoryLabel, type ClassificationFlags, type MainCategory } from '@/lib/chat/classifyMessageCategory';
import { getNotificationTone, type NotificationTone } from '@/lib/chat/notificationTone';
import { makeNotificationDedupeKey, shouldPlayNotificationSound } from '@/lib/chat/notificationDedupe';
import { playNotificationTone, unlockNotificationAudio } from '@/lib/chat/playNotificationTone';
import { shouldCreateQueueItem } from '@/lib/chat/chatOpsQueue';
import { canShowBrowserNotification, isBrowserNotificationSupported, showBrowserNotification } from '@/lib/chat/browserNotifications';
import { log } from '@/lib/logger';

const TAG = '[CHAT_NOTIFY]';
const TOAST_TTL_MS = 4_000;
const MAX_TOASTS = 3;
const DOC_TITLE_BASE = 'AutoFlow 채팅';
const DEBUG_NOTIFY = process.env.NEXT_PUBLIC_CHAT_NOTIFY_DEBUG === '1';
const DEBUG_VERBOSE = process.env.NEXT_PUBLIC_CHAT_DEBUG_VERBOSE === '1';

type NotifyChannelDecision = {
  showToast: boolean;
  showBrowserNotification: boolean;
  playInAppSound: boolean;
};

export type ChatToastItem = {
  key: string;
  messageId: string;
  category: MainCategory;
  flags: ClassificationFlags;
  tone: NotificationTone;
  roomNumber: string | null;
  body: string;
  roomNo: string;
};

type PermissionUi = NotificationPermission | 'unsupported';

function safeId(v: unknown): string {
  const s = String(v ?? '').trim();
  return s;
}

function myDeviceSide(): 'pc' | 'mobile' {
  if (typeof navigator === 'undefined') return 'pc';
  const ua = navigator.userAgent.toLowerCase();
  return /android|iphone|ipad|ipod|mobile/.test(ua) ? 'mobile' : 'pc';
}

export function useChatNotifications({
  messages,
  initialHydrationComplete,
  currentUserId,
  roomNo,
  setRoomNo,
  router
}: {
  messages: ChatMessage[];
  initialHydrationComplete: boolean;
  currentUserId: string | null;
  roomNo: string;
  setRoomNo: (v: string) => void;
  router: { push: (href: string) => void };
}) {
  const knownIdsRef = useRef<Set<string>>(new Set());
  const notifiedIdsRef = useRef<Set<string>>(new Set());
  const notifiedBrowserIdsRef = useRef<Set<string>>(new Set());
  const seededRef = useRef(false);

  const roomNoRef = useRef(roomNo);
  const userIdRef = useRef(currentUserId);
  roomNoRef.current = roomNo;
  userIdRef.current = currentUserId;

  const [toasts, setToasts] = useState<ChatToastItem[]>([]);
  const [permission, setPermission] = useState<PermissionUi>('default');
  const unreadTitleRef = useRef(0);
  const toastTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const deviceSideRef = useRef<'pc' | 'mobile'>('pc');
  const hasFocusRef = useRef(true);

  // Autoplay-safe: unlock once after first real user interaction.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onFirst = () => {
      unlockNotificationAudio();
      window.removeEventListener('pointerdown', onFirst, true);
      window.removeEventListener('keydown', onFirst, true);
      window.removeEventListener('click', onFirst, true);
    };
    window.addEventListener('pointerdown', onFirst, true);
    window.addEventListener('keydown', onFirst, true);
    window.addEventListener('click', onFirst, true);
    return () => {
      window.removeEventListener('pointerdown', onFirst, true);
      window.removeEventListener('keydown', onFirst, true);
      window.removeEventListener('click', onFirst, true);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (typeof document === 'undefined') return;
    // Initialize once (best-effort)
    try {
      hasFocusRef.current = typeof document.hasFocus === 'function' ? document.hasFocus() : true;
    } catch {
      hasFocusRef.current = true;
    }
    const onFocus = () => {
      hasFocusRef.current = true;
    };
    const onBlur = () => {
      hasFocusRef.current = false;
    };
    window.addEventListener('focus', onFocus, true);
    window.addEventListener('blur', onBlur, true);
    return () => {
      window.removeEventListener('focus', onFocus, true);
      window.removeEventListener('blur', onBlur, true);
    };
  }, []);

  const decideNotifyChannels = useCallback(
    (p: {
      isBackgroundLike: boolean;
      tone: NotificationTone;
      senderSide: 'pc' | 'mobile' | '' | null;
    }): NotifyChannelDecision => {
      const senderSide = p.senderSide || '';
      // background-like (hidden OR not focused): Browser/OS notification is primary channel.
      if (p.isBackgroundLike) {
        return {
          showToast: false,
          showBrowserNotification: true,
          playInAppSound: false
        };
      }
      // foreground-active (visible + focused)
      return {
        showToast: true,
        // visible에서도 urgent/mobile은 OS 알림 허용 (운영 이벤트 성격)
        showBrowserNotification: p.tone === 'urgent' || senderSide === 'mobile',
        playInAppSound: true
      };
    },
    []
  );

  const applyTitle = useCallback(() => {
    if (typeof document === 'undefined') return;
    const n = unreadTitleRef.current;
    document.title = n > 0 ? `(${n}) ${DOC_TITLE_BASE}` : DOC_TITLE_BASE;
  }, []);

  const removeToast = useCallback((key: string) => {
    setToasts((prev) => prev.filter((t) => t.key !== key));
    const t = toastTimersRef.current.get(key);
    if (t) {
      clearTimeout(t);
      toastTimersRef.current.delete(key);
    }
  }, []);

  const focusChatAndApplyRoom = useCallback(
    (msgRoom: string) => {
      try {
        window.focus();
      } catch {
        /* ignore */
      }
      router.push('/chat');
      const r = normalizeRoomNo(msgRoom);
      if (r) setRoomNo(r);
    },
    [router, setRoomNo]
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    deviceSideRef.current = myDeviceSide();
    if (!('Notification' in window)) {
      setPermission('unsupported');
      return;
    }
    setPermission(Notification.permission);
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        unreadTitleRef.current = 0;
        document.title = DOC_TITLE_BASE;
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  const requestBrowserPermission = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    try {
      const p = await Notification.requestPermission();
      setPermission(p);
    } catch (e) {
      log.warn(TAG, { event: 'permission_request_failed', error: String(e) });
    }
  }, []);

  const buildBrowserTitleBody = useCallback(
    (input: {
      roomNumber: string | null;
      category: MainCategory;
      flags: ClassificationFlags;
      textPreview: string;
    }) => {
      const roomPrefix = input.roomNumber ? `${input.roomNumber}호 ` : '';
      const urgent = input.flags.urgent;
      const request = input.flags.request;
      const status = input.flags.status;

      let title = '새 채팅 메시지';
      if (urgent && input.category === 'repair') title = '긴급 수리 알림';
      else if (urgent && input.category === 'environment') title = '긴급 환경 알림';
      else if (urgent) title = `긴급 ${getCategoryLabel(input.category)} 알림`;
      else if (input.category === 'environment') title = '환경 이슈';
      else if (input.category === 'turnover') title = '객실 전환';
      else if (input.category === 'repair') title = '수리 알림';
      else if (input.category === 'cleaning' && request) title = '청소/비품 요청';
      else if (input.category !== 'general') title = `${getCategoryLabel(input.category)} 알림`;
      else if (status) title = '객실 상태';

      const body = `${roomPrefix}${input.textPreview}`.trim();
      return { title, body };
    },
    []
  );

  const pushToast = useCallback(
    (item: Omit<ChatToastItem, 'key'> & { key?: string }) => {
      const key = item.key || `${item.messageId}-${Date.now()}`;
      const entry: ChatToastItem = {
        key,
        messageId: item.messageId,
        category: item.category,
        flags: item.flags,
        tone: item.tone,
        roomNumber: item.roomNumber,
        body: item.body,
        roomNo: item.roomNo
      };
      setToasts((prev) => {
        const next = [...prev, entry];
        return next.slice(-MAX_TOASTS);
      });
      if (DEBUG_NOTIFY) log.info('[CHAT_NOTIFY_TOAST_PUSH]', { messageId: entry.messageId, key });
      const tid = setTimeout(() => removeToast(key), TOAST_TTL_MS);
      toastTimersRef.current.set(key, tid);
    },
    [removeToast]
  );

  useEffect(() => {
    return () => {
      toastTimersRef.current.forEach((t) => clearTimeout(t));
      toastTimersRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!initialHydrationComplete) return;

    if (!seededRef.current) {
      const s = new Set<string>();
      for (const m of messages) {
        const id = safeId(m?.id);
        if (id) s.add(id);
      }
      knownIdsRef.current = s;
      seededRef.current = true;
      log.debug(TAG, { event: 'seed_known_ids', count: s.size });
      return;
    }

    const known = knownIdsRef.current;
    const notified = notifiedIdsRef.current;
    const uid = userIdRef.current;
    const viewRoom = roomNoRef.current;

    let fired = 0;
    const candidates: any[] = [];
    const emitted: any[] = [];

    // Single pass: O(n). O(1) membership checks via Set.
    for (const msg of messages) {
      const id = safeId(msg?.id);
      if (!id) {
        if (DEBUG_VERBOSE) {
          log.debug('[CHAT_NOTIFY_SKIPPED]', {
            id: null,
            reason: 'missing_id',
            text: String((msg as any)?.message ?? '').slice(0, 40),
            created_at: (msg as any)?.created_at ?? null
          });
        }
        continue;
      }
      if (id.startsWith('tmp-')) {
        if (DEBUG_NOTIFY) log.info('[CHAT_NOTIFY_SKIP]', { id, reason: 'tmp_optimistic' });
        if (DEBUG_VERBOSE) {
          log.debug('[CHAT_NOTIFY_SKIPPED]', {
            id,
            reason: 'tmp_optimistic',
            text: String((msg as any)?.message ?? '').slice(0, 40),
            created_at: (msg as any)?.created_at ?? null
          });
        }
        continue;
      }

      // Always advance known ids without triggering renders.
      const isNew = !known.has(id);
      if (isNew) known.add(id);
      if (!isNew) continue;

      if (DEBUG_VERBOSE) {
        candidates.push({
          id,
          created_at: (msg as any)?.created_at ?? null,
          text: String((msg as any)?.message ?? '').slice(0, 40)
        });
      }

      if (notified.has(id)) {
        if (DEBUG_NOTIFY) log.info('[CHAT_NOTIFY_SKIP]', { id, reason: 'already_notified' });
        if (DEBUG_VERBOSE) {
          log.debug('[CHAT_NOTIFY_SKIPPED]', {
            id,
            reason: 'already_notified',
            text: String((msg as any)?.message ?? '').slice(0, 40),
            created_at: (msg as any)?.created_at ?? null
          });
        }
        continue;
      }

      // Exclusions
      if ((msg as any)?.is_deleted) {
        notified.add(id);
        if (DEBUG_NOTIFY) {
          log.info('[CHAT_NOTIFY_SKIP]', {
            id,
            reason: 'deleted',
            msgUserId: safeId((msg as any)?.user_id),
            currentUserId: safeId(uid),
            actorName: safeId((msg as any)?.actor_name),
            senderSide: safeId((msg as any)?.sender_side),
            isDeleted: true
          });
        }
        if (DEBUG_VERBOSE) {
          log.debug('[CHAT_NOTIFY_SKIPPED]', {
            id,
            reason: 'deleted',
            text: String((msg as any)?.message ?? '').slice(0, 40),
            created_at: (msg as any)?.created_at ?? null
          });
        }
        continue;
      }
      const msgSide = safeId((msg as any)?.sender_side) as 'pc' | 'mobile' | '';
      const msgUserId = safeId((msg as any)?.user_id);
      const mySide = deviceSideRef.current;
      if (DEBUG_VERBOSE && !msgSide) {
        log.debug('[CHAT_NOTIFY_SENDER_SIDE_UNKNOWN]', { id, sender_side: null, msgUserId, currentUserId: safeId(uid) });
      }
      const isOwnUser = Boolean(uid) && msgUserId && String(msgUserId) === String(uid);
      const shouldTreatAsOwnMessageSkip = isOwnUser && msgSide !== 'mobile';
      if (shouldTreatAsOwnMessageSkip) {
        notified.add(id);
        if (DEBUG_NOTIFY) {
          log.info('[CHAT_NOTIFY_SKIP]', {
            id,
            reason: 'own_message_non_mobile',
            msgUserId,
            currentUserId: safeId(uid),
            senderSide: msgSide || null
          });
        }
        if (DEBUG_VERBOSE) {
          log.debug('[CHAT_NOTIFY_SKIPPED]', {
            id,
            reason: 'own_message_non_mobile',
            sender_side: msgSide || null,
            text: String((msg as any)?.message ?? '').slice(0, 40),
            created_at: (msg as any)?.created_at ?? null
          });
        }
        continue;
      }

      // If we don't have a current user id, skip notifications (avoid false positives).
      if (!uid) {
        notified.add(id);
        if (DEBUG_NOTIFY) {
          log.info('[CHAT_NOTIFY_SKIP]', {
            id,
            reason: 'missing_current_user_id',
            msgUserId: safeId((msg as any)?.user_id),
            actorName: safeId((msg as any)?.actor_name),
            senderSide: safeId((msg as any)?.sender_side),
            isDeleted: Boolean((msg as any)?.is_deleted)
          });
        }
        if (DEBUG_VERBOSE) {
          log.debug('[CHAT_NOTIFY_SKIPPED]', {
            id,
            reason: 'missing_current_user_id',
            text: String((msg as any)?.message ?? '').slice(0, 40),
            created_at: (msg as any)?.created_at ?? null
          });
        }
        continue;
      }

      const visible = typeof document !== 'undefined' && document.visibilityState === 'visible';
      const hidden = typeof document !== 'undefined' && (document.hidden || document.visibilityState !== 'visible');
      const hasFocus =
        typeof document !== 'undefined' && typeof document.hasFocus === 'function'
          ? document.hasFocus()
          : hasFocusRef.current;
      const isBackgroundLike = hidden || !hasFocus;
      const sameRoom = isSameRoomForNotify(viewRoom, msg);

      // Mark first to guarantee de-dupe even if toast/sound fails.
      notified.add(id);

      const preview = messagePreview(msg);
      const roomLabel = normalizeRoomNo(msg.room_no);
      const toastBody = roomLabel ? `${roomLabel}호 · ${preview}` : preview;
      const classification = classifyMessage(preview);
      const category = classification.mainCategory;
      const categoryLabel = getCategoryLabel(classification.mainCategory);
      const tone = getNotificationTone(classification);
      const dedupeKey = makeNotificationDedupeKey({
        roomNumber: classification.roomNumber,
        mainCategory: classification.mainCategory,
        urgent: classification.flags.urgent,
        fallbackText: preview
      });
      const shouldPlay = shouldPlayNotificationSound(dedupeKey, tone);
      const channels = decideNotifyChannels({ isBackgroundLike, tone, senderSide: msgSide || null });
      if (DEBUG_VERBOSE) {
        log.info('[CHAT_NOTIFY_CHANNEL_DECISION]', {
          id,
          visibilityState: typeof document !== 'undefined' ? document.visibilityState : null,
          hasFocus,
          isBackgroundLike,
          tone,
          sender_side: msgSide || null,
          isOwnUser,
          showToast: channels.showToast,
          showBrowserNotification: channels.showBrowserNotification,
          playInAppSound: channels.playInAppSound
        });
      }
      if (DEBUG_VERBOSE && tone === 'silent') {
        log.debug('[CHAT_NOTIFY_SKIPPED]', {
          id,
          reason: 'classification_silent',
          tone,
          category,
          text: preview.slice(0, 40),
          created_at: (msg as any)?.created_at ?? null
        });
      }

      if (DEBUG_NOTIFY) {
        log.debug(TAG, {
          event: 'notification_classified',
          message_id: id,
          classification,
          tone,
          dedupeKey,
          played: shouldPlay,
          preview: preview.slice(0, 80)
        });
      }

      if (DEBUG_NOTIFY) {
        log.info('[CHAT_NOTIFY_FIRE]', {
          message_id: id,
          sender_side: msgSide || null,
          my_side: mySide,
          msgUserId: safeId((msg as any)?.user_id),
          currentUserId: safeId(uid)
        });
      }
      if (channels.showToast) {
        pushToast({
          messageId: id,
          body: toastBody,
          roomNo: roomLabel,
          category: classification.mainCategory,
          flags: classification.flags,
          tone,
          roomNumber: classification.roomNumber
        });
      }
      if (DEBUG_VERBOSE) {
        emitted.push({
          id,
          created_at: (msg as any)?.created_at ?? null,
          text: preview.slice(0, 40),
          category,
          tone
        });
      }
      const willPlaySound = channels.playInAppSound && shouldPlay;
      if (DEBUG_VERBOSE) {
        log.info('[CHAT_SOUND_DECISION]', {
          id,
          tone,
          visibilityState: typeof document !== 'undefined' ? document.visibilityState : null,
          hasFocus,
          isBackgroundLike,
          willPlaySound
        });
      }
      if (willPlaySound) {
        void playNotificationTone(tone).then((ok) => {
          if (DEBUG_VERBOSE) log.info('[CHAT_SOUND_RESULT]', { id, ok, tone });
        });
      } else if (DEBUG_VERBOSE) {
        let reason: string = 'unknown';
        if (tone === 'silent') reason = 'silent_tone';
        else if (isBackgroundLike) reason = 'background_like';
        else if (!shouldPlay) reason = 'duplicate';
        log.debug('[CHAT_SOUND_SKIPPED]', { id, reason, tone });
      }

      // Browser OS notification: for hidden tab OR urgent OR mobile-sent messages.
      const browserDedupeHit = notifiedBrowserIdsRef.current.has(id);
      const isImportant = tone === 'urgent' || msgSide === 'mobile';
      const supported = isBrowserNotificationSupported();
      const permission =
        supported && typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported';
      const shouldAttemptBrowser = channels.showBrowserNotification && canShowBrowserNotification();
      const willBrowserNotify = shouldAttemptBrowser && !browserDedupeHit;

      if (DEBUG_VERBOSE) {
        log.info('[CHAT_BROWSER_NOTIFY_DECISION]', {
          id,
          visibilityState: typeof document !== 'undefined' ? document.visibilityState : null,
          hasFocus,
          isBackgroundLike,
          supported,
          permission,
          isOwnMessage: isOwnUser,
          sender_side: msgSide || null,
          tone,
          willBrowserNotify
        });
      }

      if (willBrowserNotify) {
        const { title, body } = buildBrowserTitleBody({
          roomNumber: classification.roomNumber,
          category: classification.mainCategory,
          flags: classification.flags,
          textPreview: preview.slice(0, 80)
        });
        void showBrowserNotification({
          title,
          body,
          tag: id,
          requireInteraction: tone === 'urgent',
          silent: false
        }).then((ok) => {
          if (ok) {
            notifiedBrowserIdsRef.current.add(id);
          }
          if (DEBUG_VERBOSE) {
            log.info('[CHAT_BROWSER_NOTIFY_RESULT]', { id, ok, title });
          }
        });
      } else if (DEBUG_VERBOSE) {
        let reason: string = 'unknown';
        if (browserDedupeHit) reason = 'duplicate';
        else if (!channels.showBrowserNotification) reason = 'not_important_while_visible';
        else if (!supported) reason = 'unsupported';
        else if (permission === 'denied') reason = 'permission_denied';
        else if (permission === 'default') reason = 'permission_default_not_requested';
        else if (!canShowBrowserNotification()) reason = `permission_${permission}`;
        log.debug('[CHAT_BROWSER_NOTIFY_SKIPPED]', { id, reason });
      }

      // /chat must not render ops UI; we only enqueue server-side if needed.
      const shouldQueue = shouldCreateQueueItem({
        mainCategory: classification.mainCategory,
        flags: classification.flags,
        tone,
        text: preview
      });
      if (shouldQueue) {
        try {
          void fetch('/api/chat/ops-queue/upsert', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              messageId: id,
              createdAt: (msg as any)?.created_at || new Date().toISOString(),
              text: preview,
              roomNumber: classification.roomNumber,
              mainCategory: classification.mainCategory,
              flags: classification.flags,
              tone,
              summary: toastBody,
              debug: DEBUG_NOTIFY
                ? { matchedKeywords: classification.matchedKeywords, reasons: classification.reasons }
                : undefined
            })
          }).catch(() => {});
        } catch {
          // ignore
        }
      }

      unreadTitleRef.current += 1;
      applyTitle();

      // Visible tab: toast/sound are primary; browser notification is separate.
      if (visible && sameRoom) {
        // no-op: toast already shown; OS path uses hidden/importance gating.
      }

      fired += 1;
    }

    if (fired === 0) {
      // keep skip logs minimal; enable if needed later
    }
    if (DEBUG_VERBOSE) {
      log.info('[CHAT_NOTIFY_CANDIDATES]', {
        total_messages: messages.length,
        candidate_count: candidates.length,
        candidate_last5: candidates.slice(-5)
      });
      log.info('[CHAT_NOTIFY_EMIT]', {
        emit_count: emitted.length,
        emitted: emitted.slice(-20)
      });
    }
  }, [messages, initialHydrationComplete, pushToast, applyTitle, focusChatAndApplyRoom]);

  const onToastClick = useCallback(
    (t: ChatToastItem) => {
      removeToast(t.key);
      focusChatAndApplyRoom(t.roomNo);
    },
    [focusChatAndApplyRoom, removeToast]
  );

  return {
    toasts,
    onToastClick,
    removeToast,
    permission,
    requestBrowserPermission
  };
}
