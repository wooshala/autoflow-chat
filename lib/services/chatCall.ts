import { supabaseAdmin } from '@/lib/supabase';
import { IS_MOCK } from '@/lib/env';
import { getReadState } from '@/lib/services/chatReadState';
import { computeReadForMessage } from '@/lib/chat/readReceipts';
import type { ChatMessage } from '@/lib/types';

/** Same message cannot be re-called within this window (server-authoritative spam guard). */
export const CALL_COOLDOWN_MS = 30_000;

export type CallResult = {
  ok: boolean;
  status: 'called' | 'cooldown' | 'no_unread' | 'not_found';
  calledAt?: string | null;
  unreadCount?: number;
  unreadReaderIds?: string[];
  cooldownRemainingMs?: number;
};

/**
 * Record a 재호출 on a message and ring its still-unread readers.
 *  - 30s cooldown per message (cooldown → no mutation),
 *  - targets = roster − sender − readers − caller (unread=0 → no-op, nothing rings),
 *  - on success bumps last_called_at/by → existing chat_messages UPDATE realtime
 *    propagates the call; clients self-determine if they are an unread target.
 */
export async function recordCall(input: {
  messageId: string;
  callerReaderId: string;
  roomId: string | null;
}): Promise<CallResult> {
  if (IS_MOCK || !supabaseAdmin) {
    return { ok: true, status: 'no_unread', unreadCount: 0, unreadReaderIds: [] };
  }

  const { data: msg, error } = await supabaseAdmin
    .from('chat_messages')
    .select('id, user_id, token_id, created_at, last_called_at, is_deleted')
    .eq('id', input.messageId)
    .maybeSingle();
  if (error) throw error;
  if (!msg) return { ok: false, status: 'not_found' };

  const now = Date.now();
  if (msg.last_called_at) {
    const elapsed = now - new Date(msg.last_called_at).getTime();
    if (elapsed >= 0 && elapsed < CALL_COOLDOWN_MS) {
      return {
        ok: false,
        status: 'cooldown',
        calledAt: msg.last_called_at as string,
        cooldownRemainingMs: CALL_COOLDOWN_MS - elapsed
      };
    }
  }

  const { members } = await getReadState(input.roomId);
  const info = computeReadForMessage(msg as unknown as ChatMessage, members);
  const unreadReaderIds = info.unread
    .map((m) => m.reader_id)
    .filter((rid) => rid !== input.callerReaderId); // never ring the caller

  if (unreadReaderIds.length === 0) {
    return { ok: true, status: 'no_unread', unreadCount: 0, unreadReaderIds: [] };
  }

  const calledAt = new Date().toISOString();
  const { error: upErr } = await supabaseAdmin
    .from('chat_messages')
    .update({ last_called_at: calledAt, last_called_by: input.callerReaderId })
    .eq('id', input.messageId);
  if (upErr) throw upErr;

  return {
    ok: true,
    status: 'called',
    calledAt,
    unreadCount: unreadReaderIds.length,
    unreadReaderIds
  };
}
