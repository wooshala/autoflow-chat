// IMAGE-CHAT-01A — orphan / abandoned state detection (pure, for maintenance queries).

/** Pending: never claimed. */
export function isPendingUploadUnused(row: {
  consumed_at: string | null;
  message_id?: string | null;
}): boolean {
  return row.consumed_at == null;
}

/** Normal consume: linked to a message (RPC sets both atomically). */
export function isPendingUploadConsumed(row: {
  consumed_at: string | null;
  message_id?: string | null;
}): boolean {
  return row.consumed_at != null && row.message_id != null;
}

/** Abandoned: consumed_at set without message_id (pre-RPC crash or manual corruption). */
export function isPendingUploadAbandoned(row: {
  consumed_at: string | null;
  message_id?: string | null;
}): boolean {
  return row.consumed_at != null && (row.message_id == null || row.message_id === '');
}

/**
 * Image-only message with zero attachments — orphan candidate after failed/crashed create.
 * Does NOT match normal text messages (original !== '').
 */
export function isOrphanImageOnlyMessage(input: {
  sender: string;
  original: string;
  attachmentCount: number;
}): boolean {
  return input.sender === 'guest' && input.original === '' && input.attachmentCount === 0;
}

/** SQL for ops/maintenance (document only — run via Supabase SQL editor). */
export const ORPHAN_IMAGE_ONLY_MESSAGES_SQL = `
select m.id, m.session_id, m.channel_key, m.created_at
from public.guest_chat_messages m
left join public.guest_chat_attachments a on a.message_id = m.id
where m.sender = 'guest'
  and m.original_text = ''
  and m.is_deleted = false
  and a.id is null;
`.trim();

export const ABANDONED_PENDING_UPLOADS_SQL = `
select id, session_id, channel_key, storage_path, consumed_at
from public.guest_chat_pending_uploads
where consumed_at is not null
  and message_id is null;
`.trim();
