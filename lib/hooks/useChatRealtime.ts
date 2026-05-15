import { useEffect } from 'react';
import type { ChatMessage } from '@/lib/types';
import { log } from '@/lib/logger';

function sortMessagesAsc(items: ChatMessage[]): ChatMessage[] {
  return [...items].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
}

export function useChatRealtime({
  supabase,
  setMessages,
  messagesRef,
  realtimeConnectedRef,
  lastRealtimeActivityAtRef,
  lastRealtimeInsertPushAtRef,
  reconnectToken
}: {
  supabase: any;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  messagesRef: React.MutableRefObject<ChatMessage[]>;
  realtimeConnectedRef: React.MutableRefObject<boolean>;
  lastRealtimeActivityAtRef: React.MutableRefObject<number>;
  lastRealtimeInsertPushAtRef: React.MutableRefObject<number | null>;
  reconnectToken?: number;
}) {
  useEffect(() => {
    if (!supabase) return;

    const logUpsertDebug = (...args: unknown[]) => {
      if (process.env.NODE_ENV === 'development') {
        log.debug(...args);
      }
    };

    function upsertMessageRow(row: Partial<ChatMessage> & { id?: string }) {
      const id = row?.id != null ? String(row.id) : '';
      if (!id) {
        log.warn('[REALTIME_SKIP]', { reason: 'missing_row_id', row });
        return;
      }
      const hadInRef = messagesRef.current.some((m) => String(m?.id) === id);
      logUpsertDebug('[UPSERT_MESSAGE_ROW]', {
        id,
        had_existing_in_messagesRef: hadInRef,
        is_deleted: (row as any)?.is_deleted ?? null
      });
      setMessages((prev) => {
        const idx = prev.findIndex((m) => String(m?.id) === id);
        logUpsertDebug('[UPSERT_MESSAGE_ROW]', {
          id,
          had_existing_in_prev: idx !== -1,
          merge_index: idx === -1 ? null : idx
        });
        if (idx === -1) {
          const next = sortMessagesAsc([...prev, { ...row, id } as ChatMessage]);
          log.debug('[SET_MESSAGES_COUNT]', {
            source: 'realtime_upsert_insert',
            prev_count: prev.length,
            next_count: next.length
          });
          return next;
        }
        const next = [...prev];
        next[idx] = { ...next[idx], ...row, id } as ChatMessage;
        log.debug('[REALTIME_DEDUPE_HIT]', {
          message_id: id,
          index: idx
        });
        log.debug('[SET_MESSAGES_COUNT]', {
          source: 'realtime_upsert_update',
          prev_count: prev.length,
          next_count: next.length
        });
        return next;
      });
    }

    const PG_INSERT_FILTER = { event: 'INSERT' as const, schema: 'public', table: 'chat_messages' };
    const PG_UPDATE_FILTER = { event: 'UPDATE' as const, schema: 'public', table: 'chat_messages' };

    log.info('[CHAT_REALTIME_SUBSCRIBE_START]', {
      channel: 'chat_messages_realtime',
      postgres_changes: [PG_INSERT_FILTER, PG_UPDATE_FILTER],
      reconnectToken: reconnectToken ?? 0
    });

    const channel = supabase
      .channel('chat_messages_realtime')
      .on('postgres_changes', PG_INSERT_FILTER, (payload: any) => {
        const row = payload?.new as ChatMessage | undefined;
        if (!row?.id) return;
        lastRealtimeActivityAtRef.current = Date.now();
        lastRealtimeInsertPushAtRef.current = Date.now();
        log.info('[CHAT_REALTIME_EVENT]', { type: 'INSERT', messageId: row.id });
        upsertMessageRow(row);
      })
      .on('postgres_changes', PG_UPDATE_FILTER, (payload: any) => {
        const row = payload?.new as ChatMessage | undefined;
        if (!row?.id) return;
        lastRealtimeActivityAtRef.current = Date.now();
        log.info('[CHAT_REALTIME_EVENT]', { type: 'UPDATE', messageId: row.id });
        upsertMessageRow(row);
      })
      .subscribe((status: string) => {
        realtimeConnectedRef.current = status === 'SUBSCRIBED';
        log.info('[CHAT_REALTIME_STATUS]', { status, connected: realtimeConnectedRef.current });
        if (realtimeConnectedRef.current) {
          lastRealtimeActivityAtRef.current = Date.now();
        }
      });

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch {
        /* ignore */
      }
    };
  }, [
    supabase,
    setMessages,
    messagesRef,
    realtimeConnectedRef,
    lastRealtimeActivityAtRef,
    lastRealtimeInsertPushAtRef,
    reconnectToken
  ]);
}

