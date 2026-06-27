import type { ChatMessage } from '@/lib/types';
import { senderReaderId } from '@/lib/chat/readerIdentity';

/** One roster participant + their watermark (last_read_at) for a room. */
export type ReadStateMember = {
  reader_id: string;
  name: string;
  role: string | null;
  last_read_at: string | null;
};

export type MessageReadInfo = {
  read: ReadStateMember[];
  unread: ReadStateMember[];
  readCount: number;
  unreadCount: number;
};

const EMPTY: MessageReadInfo = { read: [], unread: [], readCount: 0, unreadCount: 0 };

/**
 * Read/unread for a single message from the watermark roster.
 * A member has read the message when their last_read_at >= message.created_at.
 * The message's own sender is excluded from the roster.
 */
export function computeReadForMessage(msg: ChatMessage, roster: ReadStateMember[]): MessageReadInfo {
  if (!msg?.created_at || roster.length === 0) return EMPTY;
  const senderRid = senderReaderId(msg);
  const createdMs = new Date(msg.created_at).getTime();
  if (!Number.isFinite(createdMs)) return EMPTY;

  const read: ReadStateMember[] = [];
  const unread: ReadStateMember[] = [];
  for (const m of roster) {
    if (senderRid && m.reader_id === senderRid) continue; // exclude the sender
    const t = m.last_read_at ? new Date(m.last_read_at).getTime() : NaN;
    if (Number.isFinite(t) && t >= createdMs) read.push(m);
    else unread.push(m);
  }
  return { read, unread, readCount: read.length, unreadCount: unread.length };
}
