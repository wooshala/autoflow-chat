// Single source of truth for "who is a reader" across PC and mobile, so read-state
// rows, watermark advances, and sender-exclusion all use the same identity strings.
//   PC /chat (manager)  → 'user:<users.id>'
//   mobile staff        → 'invite:<staff_invites.id>'  (== chat_messages.token_id)
import type { ChatMessage } from '@/lib/types';

/** Broadcast channel for live read-state refresh (NOT a realtime publication change). */
export const READ_BROADCAST_CHANNEL = 'autoflow-chat-read';
export const READ_BROADCAST_EVENT = 'read-advance';

/** Mirrors the default-room sentinel in the chat_read_advance rpc / unique index. */
export const DEFAULT_ROOM_SENTINEL = '00000000-0000-0000-0000-000000000000';

export function pcReaderId(userId: string): string {
  return `user:${userId}`;
}

export function inviteReaderId(inviteId: string): string {
  return `invite:${inviteId}`;
}

export function isReaderId(v: unknown): v is string {
  return typeof v === 'string' && /^(user|invite):.+/.test(v);
}

/**
 * The reader_id that authored a message — used to exclude the sender from a
 * message's read/unread roster. Canonical identity prefers user_id (every message
 * has one, and the roster is user-based); token_id/invite is only a fallback for
 * an unlinked invite message with no user_id.
 */
export function senderReaderId(msg: Pick<ChatMessage, 'token_id' | 'user_id'>): string | null {
  const userId = msg.user_id ? String(msg.user_id) : '';
  if (userId) return pcReaderId(userId);
  const tokenId = msg.token_id ? String(msg.token_id) : '';
  return tokenId ? inviteReaderId(tokenId) : null;
}
