'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '@/lib/types';
import { fetchEnvelope } from '@/lib/api/envelope';
import { CHAT_READ_STATE_URL, CHAT_READ_URL } from '@/lib/chatApi';
import { READ_BROADCAST_CHANNEL, READ_BROADCAST_EVENT } from '@/lib/chat/readerIdentity';
import { computeReadForMessage, type MessageReadInfo, type ReadStateMember } from '@/lib/chat/readReceipts';

const ADVANCE_DEBOUNCE_MS = 1000;
const REFRESH_DEBOUNCE_MS = 500;

/**
 * Read-receipt state for a chat surface.
 *  - fetches the watermark roster (GET /api/chat/read-state) and refreshes on the
 *    `autoflow-chat-read` broadcast (no realtime publication change),
 *  - advances my own watermark when visible + near-bottom + (debounced 1s); the
 *    DB rpc guarantees no-retreat,
 *  - exposes computeRead(msg) → { read, unread, readCount, unreadCount }.
 */
export function useChatReadState({
  supabase,
  messages,
  myReaderId,
  roomId = null,
  enabled = true,
  nearBottomRef
}: {
  supabase: any;
  messages: ChatMessage[];
  myReaderId: string | null;
  roomId?: string | null;
  enabled?: boolean;
  nearBottomRef?: { current: boolean };
}) {
  const [members, setMembers] = useState<ReadStateMember[]>([]);

  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const channelRef = useRef<any>(null);
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSentReadAtRef = useRef<string>('');

  const refresh = useCallback(async () => {
    try {
      const url = roomId ? `${CHAT_READ_STATE_URL}?room_id=${encodeURIComponent(roomId)}` : CHAT_READ_STATE_URL;
      const res = await fetchEnvelope<{ members: ReadStateMember[] }>(url);
      if (res.ok && Array.isArray(res.data?.members)) setMembers(res.data.members);
    } catch {
      /* ignore */
    }
  }, [roomId]);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => void refresh(), REFRESH_DEBOUNCE_MS);
  }, [refresh]);

  // Initial load + reload when the room changes.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Live refresh on others' read-advance (broadcast only — no publication change).
  useEffect(() => {
    if (!supabase) return;
    const ch = supabase.channel(READ_BROADCAST_CHANNEL, { config: { broadcast: { ack: false } } });
    ch.on('broadcast', { event: READ_BROADCAST_EVENT }, () => scheduleRefresh());
    ch.subscribe();
    channelRef.current = ch;
    return () => {
      channelRef.current = null;
      try {
        supabase.removeChannel(ch);
      } catch {
        /* ignore */
      }
    };
  }, [supabase, scheduleRefresh]);

  const tryAdvance = useCallback(() => {
    if (!enabled || !myReaderId) return;
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    if (nearBottomRef && nearBottomRef.current === false) return;

    let latest: ChatMessage | null = null;
    for (const m of messagesRef.current) {
      const id = m?.id ? String(m.id) : '';
      if (!id || id.startsWith('tmp-')) continue;
      if (!latest || String(m.created_at) > String(latest.created_at)) latest = m;
    }
    if (!latest) return;

    const lastReadAt = String(latest.created_at);
    if (lastReadAt <= lastSentReadAtRef.current) return; // client-side monotonic guard
    lastSentReadAtRef.current = lastReadAt;

    void fetchEnvelope(CHAT_READ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reader_id: myReaderId,
        room_id: roomId,
        last_read_message_id: latest.id,
        last_read_at: lastReadAt
      })
    })
      .then((res) => {
        if (!res.ok) return;
        try {
          channelRef.current?.send?.({
            type: 'broadcast',
            event: READ_BROADCAST_EVENT,
            payload: { reader_id: myReaderId }
          });
        } catch {
          /* ignore */
        }
        scheduleRefresh(); // reflect my own advance locally
      })
      .catch(() => {});
  }, [enabled, myReaderId, roomId, nearBottomRef, scheduleRefresh]);

  const scheduleAdvance = useCallback(() => {
    if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    advanceTimerRef.current = setTimeout(() => tryAdvance(), ADVANCE_DEBOUNCE_MS);
  }, [tryAdvance]);

  // New messages → maybe advance.
  useEffect(() => {
    scheduleAdvance();
  }, [messages.length, scheduleAdvance]);

  // Tab becomes visible → maybe advance.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onVis = () => {
      if (document.visibilityState === 'visible') scheduleAdvance();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [scheduleAdvance]);

  useEffect(
    () => () => {
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    },
    []
  );

  /** Parent scroll handler calls this so scroll-to-bottom (no new message) also advances. */
  const pingActivity = useCallback(() => scheduleAdvance(), [scheduleAdvance]);

  const computeRead = useCallback(
    (msg: ChatMessage): MessageReadInfo => computeReadForMessage(msg, members),
    [members]
  );

  return { members, computeRead, refresh, pingActivity, myReaderId };
}
