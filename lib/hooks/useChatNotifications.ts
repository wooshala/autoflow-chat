'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '@/lib/types';
import { isSameRoomForNotify, messagePreview, normalizeRoomNo } from '@/lib/chat/chatNotifyPolicy';
import { log } from '@/lib/logger';

const TAG = '[CHAT_NOTIFY]';
const TOAST_TTL_MS = 4_000;
const MAX_TOASTS = 3;
const DOC_TITLE_BASE = 'AutoFlow 채팅';

export type ChatToastItem = {
  key: string;
  messageId: string;
  body: string;
  roomNo: string;
};

type PermissionUi = NotificationPermission | 'unsupported';

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
  const seededRef = useRef(false);

  const roomNoRef = useRef(roomNo);
  const userIdRef = useRef(currentUserId);
  roomNoRef.current = roomNo;
  userIdRef.current = currentUserId;

  const [toasts, setToasts] = useState<ChatToastItem[]>([]);
  const [permission, setPermission] = useState<PermissionUi>('default');
  const unreadTitleRef = useRef(0);
  const toastTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

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

  const pushToast = useCallback(
    (item: Omit<ChatToastItem, 'key'> & { key?: string }) => {
      const key = item.key || `${item.messageId}-${Date.now()}`;
      const entry: ChatToastItem = {
        key,
        messageId: item.messageId,
        body: item.body,
        roomNo: item.roomNo
      };
      setToasts((prev) => {
        const next = [...prev, entry];
        return next.slice(-MAX_TOASTS);
      });
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
        const id = String(m?.id || '');
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

    const newMessages: ChatMessage[] = [];
    for (const m of messages) {
      const id = String(m?.id || '');
      if (!id || id.startsWith('tmp-')) continue;
      if (!known.has(id)) {
        newMessages.push(m);
      }
    }

    for (const m of messages) {
      const id = String(m?.id || '');
      if (id) known.add(id);
    }

    if (newMessages.length === 0) return;

    newMessages.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));

    for (const msg of newMessages) {
      const id = String(msg.id);
      if (notified.has(id)) continue;

      if (uid && String(msg.user_id || '') === String(uid)) {
        notified.add(id);
        continue;
      }

      if (!uid) {
        notified.add(id);
        continue;
      }

      const visible = typeof document !== 'undefined' && document.visibilityState === 'visible';
      const sameRoom = isSameRoomForNotify(viewRoom, msg);

      if (visible && sameRoom) {
        notified.add(id);
        log.debug(TAG, { event: 'suppress_same_room_active', message_id: id });
        continue;
      }

      notified.add(id);

      const preview = messagePreview(msg);
      const roomLabel = normalizeRoomNo(msg.room_no);
      const toastBody = roomLabel ? `${roomLabel}호 · ${preview}` : preview;

      pushToast({
        messageId: id,
        body: toastBody,
        roomNo: roomLabel
      });

      unreadTitleRef.current += 1;
      applyTitle();

      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        try {
          const n = new Notification('새 메시지', {
            body: toastBody,
            tag: id,
            requireInteraction: false
          });
          n.onclick = () => {
            n.close();
            focusChatAndApplyRoom(msg.room_no || '');
          };
        } catch (e) {
          log.warn(TAG, { event: 'notification_show_failed', error: String(e) });
        }
      }
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
