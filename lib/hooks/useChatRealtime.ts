import { useEffect, useRef } from 'react';
import type { ChatMessage } from '@/lib/types';
import { log } from '@/lib/logger';
import { mergeChatMessageRow, normalizeChatMessageFields } from '@/lib/chat/normalizeChatMessage';
import { logRealtimeReceived } from '@/lib/chat/sendTrace';
import { latRealtimeReceived } from '@/lib/chat/latencyTrace';
import { logChatRealtimeLag } from '@/lib/chat/chatRefetchLog';
import { logChatRealtimeTrace, type SyncClient } from '@/lib/chat/syncTrace';
import { lookupClientNonceForMessage } from '@/lib/chat/sendTrace';
import { recordRealtimeEvent } from '@/lib/chat/networkTrace';
import { chatTrace } from '@/lib/chat/chatTrace';

function sortMessagesAsc(items: ChatMessage[]): ChatMessage[] {
  return [...items].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
}

type RealtimePatchResult = 'added' | 'updated' | 'duplicate' | 'ignored';

export function useChatRealtime({
  supabase,
  setMessages,
  messagesRef,
  realtimeConnectedRef,
  lastRealtimeActivityAtRef,
  lastRealtimeInsertPushAtRef,
  reconnectToken,
  onConnectionStatus,
  onRowEvent,
  onRealtimeStatus,
  syncClient = 'pc',
  currentUserId = null
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
  /** SUBSCRIBED / CLOSED / CHANNEL_ERROR / TIMED_OUT — drives refetch fallback. */
  onRealtimeStatus?: (status: string) => void;
  syncClient?: SyncClient;
  currentUserId?: string | null;
}) {
  const mountIdRef = useRef(`rt-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!supabase) return;

    const logUpsertDebug = (...args: unknown[]) => {
      if (process.env.NODE_ENV === 'development') {
        log.debug(...args);
      }
    };

    function upsertMessageRow(
      row: Partial<ChatMessage> & { id?: string },
      event: 'INSERT' | 'UPDATE'
    ): RealtimePatchResult {
      const id = row?.id != null ? String(row.id) : '';
      if (!id) {
        log.warn('[REALTIME_SKIP]', { reason: 'missing_row_id', row });
        logChatRealtimeTrace({
          client: syncClient,
          event,
          message_id: null,
          will_patch: false,
          patch_result: 'ignored',
          ignore_reason: 'missing_row_id'
        });
        return 'ignored';
      }
      const hadInRef = messagesRef.current.some((m) => String(m?.id) === id);
      let patchResult: RealtimePatchResult = hadInRef ? 'updated' : 'added';
      logUpsertDebug('[UPSERT_MESSAGE_ROW]', {
        id,
        had_existing_in_messagesRef: hadInRef,
        is_deleted: (row as any)?.is_deleted ?? null
      });
      chatTrace('set_messages', {
        id,
        client_nonce: lookupClientNonceForMessage(id),
        room: (row as any)?.room_no ?? null,
        source: `realtime_upsert_${event.toLowerCase()}`,
        messages: messagesRef.current.length,
        extra: { had_existing_in_messagesRef: hadInRef }
      });
      setMessages((prev) => {
        const idx = prev.findIndex((m) => String(m?.id) === id);
        logUpsertDebug('[UPSERT_MESSAGE_ROW]', {
          id,
          had_existing_in_prev: idx !== -1,
          merge_index: idx === -1 ? null : idx
        });
        if (idx === -1) {
          patchResult = 'added';
          const next = sortMessagesAsc([...prev, mergeChatMessageRow(undefined, { ...row, id })]);
          log.debug('[SET_MESSAGES_COUNT]', {
            source: 'realtime_upsert_insert',
            prev_count: prev.length,
            next_count: next.length
          });
          return next;
        }
        patchResult = 'updated';
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
      return patchResult;
    }

    const PG_INSERT_FILTER = { event: 'INSERT' as const, schema: 'public', table: 'chat_messages' };
    const PG_UPDATE_FILTER = { event: 'UPDATE' as const, schema: 'public', table: 'chat_messages' };

    const channelName = `chat_messages_realtime_${mountIdRef.current}_${reconnectToken ?? 0}`;
    if (channelRef.current) {
      chatTrace('realtime_unsubscribe', {
        id: 'pre_subscribe_cleanup',
        source: 'pre_subscribe_cleanup',
        messages: messagesRef.current.length,
        extra: { channel: channelName, reconnectToken: reconnectToken ?? 0, reason: 'replacing_existing_channel' }
      });
      try {
        supabase.removeChannel(channelRef.current);
      } catch {
        /* ignore */
      }
      channelRef.current = null;
    }

    chatTrace('realtime_subscribe_start', {
      id: null,
      source: 'effect_run',
      messages: messagesRef.current.length,
      extra: {
        channel: channelName,
        reconnectToken: reconnectToken ?? 0,
        mountId: mountIdRef.current,
        reason: reconnectToken && reconnectToken > 0 ? 'reconnect_token' : 'mount_or_dep_change'
      }
    });
    log.info('[CHAT_REALTIME_SUBSCRIBE_START]', {
      channel: channelName,
      postgres_changes: [PG_INSERT_FILTER, PG_UPDATE_FILTER],
      reconnectToken: reconnectToken ?? 0,
      mountId: mountIdRef.current
    });
    if (reconnectToken && reconnectToken > 0) {
      log.info('[CHAT_REALTIME_RECONNECT]', { reconnectToken, channel: channelName });
    }

    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', PG_INSERT_FILTER, (payload: any) => {
        const row = payload?.new as ChatMessage | undefined;
        if (!row?.id) return;
        lastRealtimeActivityAtRef.current = Date.now();
        lastRealtimeInsertPushAtRef.current = Date.now();
        recordRealtimeEvent(); // measurement-only: feeds [STAFF_WEB_NETWORK_TRACE] ms_since_last_realtime
        log.info('[CHAT_REALTIME_EVENT]', {
          type: 'INSERT',
          messageId: row.id,
          room: row.room_no ?? null,
          sender: row.sender_side ?? null,
          has_translated_ko: Boolean((row as any)?.translated_text?.ko),
          has_translated_ru: Boolean((row as any)?.translated_text?.ru)
        });
        const receivedAt = Date.now();
        const createdAt = (row as any)?.created_at ?? null;
        const createdMs = createdAt ? Date.parse(String(createdAt)) : NaN;
        const lagMs = Number.isFinite(createdMs) ? receivedAt - createdMs : null;
        logChatRealtimeLag({
          message_id: String(row.id),
          created_at: createdAt ? String(createdAt) : null,
          received_at: receivedAt,
          lag_ms: lagMs
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
        const patchResult = upsertMessageRow(normalizeChatMessageFields(row), 'INSERT');
        const senderUid = (row as any)?.user_id ? String((row as any).user_id) : null;
        logChatRealtimeTrace({
          client: syncClient,
          event: 'INSERT',
          message_id: String(row.id),
          client_nonce: lookupClientNonceForMessage(String(row.id)),
          created_at: createdAt ? String(createdAt) : null,
          received_at: receivedAt,
          lag_ms: lagMs,
          sender_user_id: senderUid,
          current_user_id: currentUserId,
          is_self: Boolean(currentUserId && senderUid && currentUserId === senderUid),
          room_no: row.room_no ?? null,
          will_patch: true,
          patch_result: patchResult,
          ignore_reason: patchResult === 'ignored' ? 'upsert_failed' : null
        });
      })
      .on('postgres_changes', PG_UPDATE_FILTER, (payload: any) => {
        const row = payload?.new as ChatMessage | undefined;
        if (!row?.id) return;
        lastRealtimeActivityAtRef.current = Date.now();
        recordRealtimeEvent(); // measurement-only: feeds [STAFF_WEB_NETWORK_TRACE] ms_since_last_realtime
        log.info('[CHAT_REALTIME_EVENT]', { type: 'UPDATE', messageId: row.id });
        onRowEvent?.({ id: String(row.id), type: 'UPDATE' });
        const receivedAt = Date.now();
        const createdAt = (row as any)?.created_at ?? null;
        const patchResult = upsertMessageRow(normalizeChatMessageFields(row), 'UPDATE');
        const senderUid = (row as any)?.user_id ? String((row as any).user_id) : null;
        logChatRealtimeTrace({
          client: syncClient,
          event: 'UPDATE',
          message_id: String(row.id),
          client_nonce: lookupClientNonceForMessage(String(row.id)),
          created_at: createdAt ? String(createdAt) : null,
          received_at: receivedAt,
          lag_ms: null,
          sender_user_id: senderUid,
          current_user_id: currentUserId,
          is_self: Boolean(currentUserId && senderUid && currentUserId === senderUid),
          room_no: row.room_no ?? null,
          will_patch: true,
          patch_result: patchResult,
          ignore_reason: null
        });
      })
      .subscribe((status: string, err?: Error) => {
        chatTrace('realtime_subscribe_status', {
          id: status,
          source: status,
          messages: messagesRef.current.length,
          extra: {
            status,
            channel: channelName,
            reconnectToken: reconnectToken ?? 0,
            reason: err ? `error:${err.message}` : 'status_change'
          }
        });
        onRealtimeStatus?.(status);
        if (err) {
          log.warn('[CHAT_REALTIME_ERROR]', {
            status,
            error: err.message,
            reconnectToken: reconnectToken ?? 0
          });
        }
        realtimeConnectedRef.current = status === 'SUBSCRIBED';
        log.info('[CHAT_REALTIME_STATUS]', { status, connected: realtimeConnectedRef.current });
        if (realtimeConnectedRef.current) {
          lastRealtimeActivityAtRef.current = Date.now();
          onConnectionStatus?.('connected');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          onConnectionStatus?.('reconnecting');
        }
      });

    channelRef.current = channel;

    return () => {
      chatTrace('realtime_unsubscribe', {
        id: 'effect_cleanup',
        source: 'effect_cleanup',
        messages: messagesRef.current.length,
        extra: { channel: channelName, reconnectToken: reconnectToken ?? 0, reason: 'effect_cleanup' }
      });
      try {
        supabase.removeChannel(channel);
      } catch {
        /* ignore */
      }
      if (channelRef.current === channel) {
        channelRef.current = null;
      }
      log.info('[CHAT_REALTIME_UNSUBSCRIBE]', { channel: channelName, reconnectToken: reconnectToken ?? 0 });
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
    onRowEvent,
    onRealtimeStatus,
    syncClient,
    currentUserId
  ]);
}

