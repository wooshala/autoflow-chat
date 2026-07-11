import { SEEDED_DEFAULT_CHAT_ROOM_ID } from '@/lib/chat/chatRoomDefaults';

/**
 * True only when the DB/schema layer reports chat_room_id column is absent.
 *
 * Runtime safety (Phase 1A.5):
 * - FK/permission/network errors must NOT match (insert must fail, not strip).
 * - PGRST204 can mean (a) pre-migration column missing, or (b) PostgREST schema-cache
 *   lag after migration while the column already exists in Postgres.
 * - For (b), createChatMessage fallback omits chat_room_id from the payload; migration sets
 *   `chat_room_id DEFAULT SEEDED_DEFAULT_CHAT_ROOM_ID` so omitted inserts still get the
 *   default room — not NULL.
 */
export function isMissingChatRoomIdColumnError(error: unknown): boolean {
  const code = String((error as { code?: string })?.code ?? '');
  const message = String((error as { message?: string })?.message ?? '');
  const details = String((error as { details?: string })?.details ?? '');
  const haystack = `${message} ${details}`;

  if (code === '42703') {
    return /\bchat_room_id\b/i.test(haystack) && /does not exist/i.test(haystack);
  }
  if (code === 'PGRST204') {
    return /Could not find the '?chat_room_id'? column/i.test(message);
  }
  if (/column "?chat_room_id"? .*does not exist/i.test(message)) return true;
  if (/Could not find the '?chat_room_id'? column of '?chat_messages'?/i.test(message)) return true;

  return false;
}

/** Matches migration column DEFAULT; omitted inserts use this when fallback strips chat_room_id. */
export const CHAT_ROOM_ID_DB_COLUMN_DEFAULT = SEEDED_DEFAULT_CHAT_ROOM_ID;
