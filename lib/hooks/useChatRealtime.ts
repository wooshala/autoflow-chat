import { useEffect, useRef } from 'react';
import type { ChatMessage } from '@/lib/types';
import { log } from '@/lib/logger';
import { mergeChatMessageRow, normalizeChatMessageFields } from '@/lib/chat/normalizeChatMessage';
import { logRealtimeReceived } from '@/lib/chat/sendTrace';
import { latRealtimeReceived } from '@/lib/chat/latencyTrace';
// P0-B: no-ops unless the diag flag is on.
import {
  newClientInstanceId,
  recordDiagEvent,
  recordHookMount,
  recordHookUnmount,
  recordRealtimeTransition,
} from '@/lib/chat/pollDiag';

const HOOK_NAME = 'useChatRealtime';

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
  reconnectToken,
  onConnectionStatus,
  onRowEvent
}: {
  supabase: any;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  messagesRef: React.MutableRefObject<ChatMessage[]>;
  realtimeConnectedRef: React.MutableRefObject<boolean>;
  lastRealtimeActivityAtRef: React.MutableRefObject<number>;
  lastRealtimeInsertPushAtRef: React.MutableRefObject<number | null>;
  reconnectToken?: number;
  onConnectionStatus?: (s: 'connected' | 'degraded' | 'reconnecting') => void;
  /** Diagnostics: notified per realtime row event so callers can label INSERT vs UPDATE. */
  onRowEvent?: (e: { id: string; type: 'INSERT' | 'UPDATE' }) => void;
}) {
  const clientInstanceIdRef = useRef<string>('');
  if (!clientInstanceIdRef.current) clientInstanceIdRef.current = newClientInstanceId();
  const lastStatusRef = useRef<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    recordHookMount({
      clientInstanceId: clientInstanceIdRef.current,
      hookName: HOOK_NAME,
      componentName: HOOK_NAME,
    });

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
          const next = sortMessagesAsc([...prev, mergeChatMessageRow(undefined, { ...row, id })]);
          log.debug('[SET_MESSAGES_COUNT]', {
            source: 'realtime_upsert_insert',
            prev_count: prev.length,
            next_count: next.length
          });
          return next;
        }
        const next = [...prev];
        next[idx] = mergeChatMessageRow(next[idx], { ...row, id });
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
    if (reconnectToken && reconnectToken > 0) {
      log.info('[CHAT_REALTIME_RECONNECT]', { reconnectToken });
    }

    const channel = supabase
      .channel('chat_messages_realtime')
      .on('postgres_changes', PG_INSERT_FILTER, (payload: any) => {
        const row = payload?.new as ChatMessage | undefined;
        if (!row?.id) return;
        lastRealtimeActivityAtRef.current = Date.now();
        lastRealtimeInsertPushAtRef.current = Date.now();
        log.info('[CHAT_REALTIME_EVENT]', {
          type: 'INSERT',
          messageId: row.id,
          room: row.room_no ?? null,
          sender: row.sender_side ?? null,
          has_translated_ko: Boolean((row as any)?.translated_text?.ko),
          has_translated_ru: Boolean((row as any)?.translated_text?.ru)
        });
        logRealtimeReceived(String(row.id), row.room_no ?? null, row.sender_side ?? null);
        latRealtimeReceived({
          message_id: String(row.id),
          sender_side: row.sender_side ?? null,
          room: row.room_no ?? null,
          has_translation: Boolean((row as any)?.translated_text),
          created_at: (row as any)?.created_at ?? null
        });
        onRowEvent?.({ id: String(row.id), type: 'INSERT' });
        recordDiagEvent({
          reason: 'realtime_insert',
          hookName: HOOK_NAME,
          clientInstanceId: clientInstanceIdRef.current,
        });
        upsertMessageRow(normalizeChatMessageFields(row));
      })
      .on('postgres_changes', PG_UPDATE_FILTER, (payload: any) => {
        const row = payload?.new as ChatMessage | undefined;
        if (!row?.id) return;
        lastRealtimeActivityAtRef.current = Date.now();
        log.info('[CHAT_REALTIME_EVENT]', { type: 'UPDATE', messageId: row.id });
        onRowEvent?.({ id: String(row.id), type: 'UPDATE' });
        recordDiagEvent({
          reason: 'realtime_update',
          hookName: HOOK_NAME,
          clientInstanceId: clientInstanceIdRef.current,
        });
        upsertMessageRow(normalizeChatMessageFields(row));
      })
      .subscribe((status: string, err?: Error) => {
        if (err) {
          log.warn('[CHAT_REALTIME_ERROR]', {
            status,
            error: err.message,
            reconnectToken: reconnectToken ?? 0
          });
        }
        realtimeConnectedRef.current = status === 'SUBSCRIBED';
        log.info('[CHAT_REALTIME_STATUS]', { status, connected: realtimeConnectedRef.current });
        // Transitions only — a quiet channel repeating SUBSCRIBED must not produce log lines.
        recordRealtimeTransition({
          clientInstanceId: clientInstanceIdRef.current,
          channelName: 'chat-messages',
          previousStatus: lastStatusRef.current,
          nextStatus: status,
          resubscribeAttempt: reconnectToken ?? 0,
        });
        lastStatusRef.current = status;
        if (realtimeConnectedRef.current) {
          lastRealtimeActivityAtRef.current = Date.now();
          onConnectionStatus?.('connected');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          onConnectionStatus?.('reconnecting');
        }
      });

    return () => {
      recordHookUnmount({ clientInstanceId: clientInstanceIdRef.current, hookName: HOOK_NAME });
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
    reconnectToken,
    onConnectionStatus,
    onRowEvent
  ]);
}

