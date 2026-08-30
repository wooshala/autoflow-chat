// Phase 1H.3 — Supabase-backed persistence for the guest chat (replaces the Phase 1G.4
// in-memory store, which was per-serverless-instance and lost the mobile↔EXE round trip
// on Vercel). SERVER-ONLY: imports supabaseAdmin (service role) — never import from a
// client component (client uses api.ts). Same contract the route used before, now async
// and throwing on DB errors so the route can map them to 503/500.
//
// Table: guest_chat_messages (channel_key, sender, original_text, original_lang,
// translated_json, created_at). No auth yet (spike) — see route.ts note.
//
// TODO(canonical-namespace): guest-spike → guest-chat (later refactor step).

import { supabaseAdmin } from '@/lib/supabase';
import { isOneOpenConflict } from './sessionConflict';
import type { OpenSessionRow, SummaryMessageRow } from './guestChannelSummary';
import type { UnansweredMessageRow, UnansweredSessionRow } from './unansweredSummary';
import {
  createGuestAttachmentSignedUrl,
  guestAttachmentObjectExists,
} from './guestAttachmentStorage';
import { isGuestAttachmentStoragePathForSession } from './guestAttachmentValidation';
import { isPendingUploadExpired, GUEST_PENDING_UPLOAD_TTL_MS } from './guestPendingUploadTtl';
import { parseGuestAttachmentRpcError } from './guestAttachmentRpc';
import type { GuestSpikeAttachment, GuestSpikeMsg, NewGuestMsg } from './types';
import {
  decideGuestMessageDelete,
  type GuestDeleteActor,
  type GuestMessageDeleteRow,
} from './guestMessageDelete';

export type { GuestSpikeMsg, NewGuestMsg };

const TABLE = 'guest_chat_messages';
const PENDING_UPLOADS = 'guest_chat_pending_uploads';
const ATTACHMENTS = 'guest_chat_attachments';
const COLS =
  'id, sender, original_text, original_lang, translated_json, created_at, is_deleted, deleted_at, staff_user_id';

interface AttachmentRow {
  id: string;
  message_id: string;
  session_id: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  sort_order: number;
  created_at: string;
}

interface PendingUploadRow {
  id: string;
  session_id: string;
  channel_key: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
  consumed_at: string | null;
  message_id?: string | null;
}

async function attachmentRowsToClient(
  rows: AttachmentRow[],
  includeUrls: boolean,
): Promise<Map<string, GuestSpikeAttachment[]>> {
  const byMessage = new Map<string, GuestSpikeAttachment[]>();
  for (const r of rows) {
    const url = includeUrls ? (await createGuestAttachmentSignedUrl(r.storage_path)) ?? '' : '';
    const item: GuestSpikeAttachment = {
      id: r.id,
      mime_type: r.mime_type,
      size_bytes: r.size_bytes,
      sort_order: r.sort_order,
      url,
    };
    const arr = byMessage.get(r.message_id);
    if (arr) arr.push(item);
    else byMessage.set(r.message_id, [item]);
  }
  for (const arr of byMessage.values()) {
    arr.sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));
  }
  return byMessage;
}

async function loadAttachmentsForMessages(
  messageIds: string[],
  includeUrls: boolean,
): Promise<Map<string, GuestSpikeAttachment[]>> {
  if (messageIds.length === 0) return new Map();
  const { data, error } = await db()
    .from(ATTACHMENTS)
    .select('id, message_id, session_id, storage_path, mime_type, size_bytes, sort_order, created_at')
    .in('message_id', messageIds)
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true });
  if (error) throw new Error(`DB_ERROR: ${error.message}`);
  return attachmentRowsToClient((data as AttachmentRow[] | null) ?? [], includeUrls);
}

interface Row {
  id: string;
  sender: 'guest' | 'staff';
  original_text: string;
  original_lang: string;
  translated_json: Record<string, string> | null;
  created_at: string;
  is_deleted?: boolean | null;
  deleted_at?: string | null;
  staff_user_id?: string | null;
}

function rowToMsg(r: Row, attachments: GuestSpikeAttachment[] = []): GuestSpikeMsg {
  return {
    id: r.id,
    sender: r.sender,
    original: r.original_text,
    original_lang: r.original_lang,
    translated: r.translated_json ?? {},
    created_at: r.created_at,
    is_deleted: Boolean(r.is_deleted),
    deleted_at: r.deleted_at ?? null,
    staff_user_id: r.staff_user_id ?? null,
    attachments,
  };
}

/** Server admin client, or throw DB_UNAVAILABLE (missing SUPABASE_PRIMARY_URL / key). */
function db() {
  if (!supabaseAdmin) throw new Error('DB_UNAVAILABLE');
  return supabaseAdmin;
}

/** Messages of ONE session (Phase 1H.7), created_at ASC, id ASC tiebreak. */
export async function listMessagesBySession(
  sessionId: string,
  opts?: { includeAttachmentUrls?: boolean; skipDeletedAttachments?: boolean },
): Promise<GuestSpikeMsg[]> {
  const { data, error } = await db()
    .from(TABLE)
    .select(COLS)
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });
  if (error) throw new Error(`DB_ERROR: ${error.message}`);
  const rows = (data as Row[] | null) ?? [];
  const aliveIds = rows.filter((r) => !opts?.skipDeletedAttachments || !r.is_deleted).map((r) => r.id);
  const attachMap = await loadAttachmentsForMessages(
    aliveIds,
    opts?.includeAttachmentUrls !== false,
  );
  return rows.map((r) => {
    const deleted = Boolean(r.is_deleted);
    const attachments =
      deleted && opts?.skipDeletedAttachments ? [] : attachMap.get(r.id) ?? [];
    return rowToMsg(r, attachments);
  });
}

/** Single INSERT into a session (original + translated together). DB assigns id + created_at. */
export async function appendMessage(
  input: NewGuestMsg & { channelKey: string; sessionId: string },
): Promise<GuestSpikeMsg> {
  const { data, error } = await db()
    .from(TABLE)
    .insert({
      channel_key: input.channelKey,
      session_id: input.sessionId,
      sender: input.sender,
      original_text: input.original,
      original_lang: input.original_lang,
      translated_json: input.translated,
      staff_user_id: input.sender === 'staff' ? input.staff_user_id ?? null : null,
    })
    .select(COLS)
    .single();
  if (error) throw new Error(`DB_ERROR: ${error.message}`);
  return rowToMsg(data as Row);
}

export async function insertPendingGuestUpload(input: {
  sessionId: string;
  channelKey: string;
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
}): Promise<{ uploadToken: string }> {
  const { data, error } = await db()
    .from(PENDING_UPLOADS)
    .insert({
      session_id: input.sessionId,
      channel_key: input.channelKey,
      storage_path: input.storagePath,
      mime_type: input.mimeType,
      size_bytes: input.sizeBytes,
    })
    .select('id')
    .single();
  if (error) throw new Error(`DB_ERROR: ${error.message}`);
  return { uploadToken: String((data as { id: string }).id) };
}

export type ValidatePendingUploadsResult =
  | {
      ok: true;
      pending: PendingUploadRow[];
    }
  | { ok: false; error: 'INVALID_TOKEN' | 'ALREADY_USED' | 'CROSS_SESSION' | 'MISSING_OBJECT' | 'FORGED_PATH' | 'EXPIRED' };

export async function validatePendingGuestUploads(input: {
  sessionId: string;
  channelKey: string;
  uploadTokens: string[];
}): Promise<ValidatePendingUploadsResult> {
  const unique = [...new Set(input.uploadTokens)];
  if (unique.length !== input.uploadTokens.length) {
    return { ok: false, error: 'INVALID_TOKEN' };
  }
  const { data, error } = await db()
    .from(PENDING_UPLOADS)
    .select('id, session_id, channel_key, storage_path, mime_type, size_bytes, created_at, consumed_at, message_id')
    .in('id', unique);
  if (error) throw new Error(`DB_ERROR: ${error.message}`);
  const rows = (data as PendingUploadRow[] | null) ?? [];
  if (rows.length !== unique.length) return { ok: false, error: 'INVALID_TOKEN' };
  for (const row of rows) {
    if (row.consumed_at) return { ok: false, error: 'ALREADY_USED' };
    if (isPendingUploadExpired(row.created_at)) return { ok: false, error: 'EXPIRED' };
    if (row.session_id !== input.sessionId || row.channel_key !== input.channelKey) {
      return { ok: false, error: 'CROSS_SESSION' };
    }
    if (!isGuestAttachmentStoragePathForSession(row.storage_path, input.sessionId)) {
      return { ok: false, error: 'FORGED_PATH' };
    }
    const exists = await guestAttachmentObjectExists(row.storage_path);
    if (!exists) return { ok: false, error: 'MISSING_OBJECT' };
  }
  rows.sort(
    (a, b) => unique.indexOf(a.id) - unique.indexOf(b.id),
  );
  return { ok: true, pending: rows };
}

interface GuestMessageRpcResult {
  message: {
    id: string;
    sender: 'guest' | 'staff';
    original_text: string;
    original_lang: string;
    translated_json: Record<string, string> | null;
    created_at: string;
    is_deleted?: boolean | null;
    deleted_at?: string | null;
    staff_user_id?: string | null;
  };
  attachments: Array<{
    id: string;
    mime_type: string;
    size_bytes: number;
    sort_order: number;
    storage_path: string;
  }>;
}

export async function appendGuestMessageWithAttachments(
  input: NewGuestMsg & {
    channelKey: string;
    sessionId: string;
    pending: PendingUploadRow[];
  },
): Promise<GuestSpikeMsg> {
  const tokenIds = input.pending.map((p) => p.id);
  const ttlMinutes = Math.floor(GUEST_PENDING_UPLOAD_TTL_MS / 60_000);

  const { data, error } = await db().rpc('create_guest_message_with_attachments', {
    p_channel_key: input.channelKey,
    p_session_id: input.sessionId,
    p_sender: input.sender,
    p_original_text: input.original,
    p_original_lang: input.original_lang,
    p_translated_json: input.translated,
    p_staff_user_id: input.sender === 'staff' ? input.staff_user_id ?? null : null,
    p_upload_token_ids: tokenIds,
    p_ttl_minutes: ttlMinutes,
  });

  if (error) {
    const code = parseGuestAttachmentRpcError(error);
    if (code === 'ALREADY_USED') throw new Error('PENDING_ALREADY_USED');
    if (code) throw new Error(`PENDING_${code}`);
    throw new Error(`DB_ERROR: ${error.message}`);
  }

  const payload = data as GuestMessageRpcResult | null;
  if (!payload?.message?.id) throw new Error('DB_ERROR: empty RPC result');

  const attachRows: AttachmentRow[] = (payload.attachments ?? []).map((a) => ({
    id: a.id,
    message_id: payload.message.id,
    session_id: input.sessionId,
    storage_path: a.storage_path,
    mime_type: a.mime_type,
    size_bytes: a.size_bytes,
    sort_order: a.sort_order,
    created_at: payload.message.created_at,
  }));

  const attachMap = await attachmentRowsToClient(attachRows, true);
  return rowToMsg(
    {
      id: payload.message.id,
      sender: payload.message.sender,
      original_text: payload.message.original_text,
      original_lang: payload.message.original_lang,
      translated_json: payload.message.translated_json,
      created_at: payload.message.created_at,
      is_deleted: payload.message.is_deleted,
      deleted_at: payload.message.deleted_at,
      staff_user_id: payload.message.staff_user_id,
    },
    attachMap.get(payload.message.id) ?? [],
  );
}

/** Count attachments per message id (for summary preview). */
export async function countAttachmentsByMessageIds(
  messageIds: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (messageIds.length === 0) return out;
  const { data, error } = await db()
    .from(ATTACHMENTS)
    .select('message_id')
    .in('message_id', messageIds);
  if (error) throw new Error(`DB_ERROR: ${error.message}`);
  for (const row of (data as { message_id: string }[] | null) ?? []) {
    out.set(row.message_id, (out.get(row.message_id) ?? 0) + 1);
  }
  return out;
}

// ── guest sessions (Phase 1H.7) ──────────────────────────────────────────────────
const SESSIONS = 'guest_chat_sessions';
// Phase 1H.7 — language_code/language_source live on the SESSION (per-guest), not the channel.
const S_COLS = 'id, channel_key, status, started_at, closed_at, language_code, language_source';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface GuestSession {
  id: string;
  channel_key: string;
  status: 'open' | 'closed';
  started_at: string;
  closed_at: string | null;
  /** The CURRENT guest's language (NULL until they select). NOT inherited across sessions. */
  language_code: string | null;
  language_source: string | null;
}

function rowToSession(r: Record<string, unknown>): GuestSession {
  return {
    id: String(r.id),
    channel_key: String(r.channel_key),
    status: r.status === 'closed' ? 'closed' : 'open',
    started_at: String(r.started_at),
    closed_at: (r.closed_at as string | null) ?? null,
    language_code: (r.language_code as string | null) ?? null,
    language_source: (r.language_source as string | null) ?? null,
  };
}

/** The channel's current OPEN session, or null. */
export async function getActiveSession(channelKey: string): Promise<GuestSession | null> {
  const { data, error } = await db()
    .from(SESSIONS)
    .select(S_COLS)
    .eq('channel_key', channelKey)
    .eq('status', 'open')
    .maybeSingle();
  if (error) throw new Error(`DB_ERROR: ${error.message}`);
  return data ? rowToSession(data as Record<string, unknown>) : null;
}

/** Load a session by id (from the guest cookie). Malformed id → null (no DB hit). */
export async function getSessionById(id: string): Promise<GuestSession | null> {
  if (!UUID_RE.test(id)) return null;
  const { data, error } = await db().from(SESSIONS).select(S_COLS).eq('id', id).maybeSingle();
  if (error) throw new Error(`DB_ERROR: ${error.message}`);
  return data ? rowToSession(data as Record<string, unknown>) : null;
}

export type CreateSessionResult = { created: GuestSession } | { conflict: true };

// isOneOpenConflict lives in ./sessionConflict (pure, import-free) so the race→occupied
// conversion is unit-testable under `node --test` without resolving the `@/` alias.
export { isOneOpenConflict };

/**
 * Create a new OPEN session for the channel.
 *  - success                          → { created }  (caller issues the cookie)
 *  - one-open-per-channel race (23505) → { conflict } (caller returns occupied, NO cookie,
 *                                         and MUST NOT hand the existing session to this guest)
 *  - any other DB error               → throw (→ 500)
 */
export async function createSession(channelKey: string): Promise<CreateSessionResult> {
  const { data, error } = await db()
    .from(SESSIONS)
    .insert({ channel_key: channelKey, status: 'open' })
    .select(S_COLS)
    .single();
  if (error) {
    if (isOneOpenConflict(error)) return { conflict: true };
    throw new Error(`DB_ERROR: ${error.message}`);
  }
  return { created: rowToSession(data as Record<string, unknown>) };
}

/**
 * Set the language on ONE guest session (the guest's own, resolved by the caller). Updates
 * ONLY an OPEN session — a closed session (or wrong id) matches no row and returns null, so
 * the caller can 409. Never touches the channel or other sessions.
 */
export async function setGuestSessionLanguage(
  sessionId: string,
  languageCode: string,
  languageSource: 'user_selected' | 'staff_selected' | 'system_default' = 'user_selected',
): Promise<GuestSession | null> {
  if (!UUID_RE.test(sessionId)) return null;
  const { data, error } = await db()
    .from(SESSIONS)
    .update({ language_code: languageCode, language_source: languageSource, updated_at: new Date().toISOString() })
    .eq('id', sessionId)
    .eq('status', 'open')
    .select(S_COLS)
    .maybeSingle();
  if (error) throw new Error(`DB_ERROR: ${error.message}`);
  return data ? rowToSession(data as Record<string, unknown>) : null;
}

/**
 * Phase 1H.11 — data for the staff channel summary in TWO aggregate reads (no N+1, no bodies):
 *   1) every OPEN session (channel_key + language),
 *   2) the minimal message rows of those sessions (id/sender/created_at only).
 * The pure buildChannelSummaries() folds these into per-channel latest/latest-guest info.
 */
export async function listOpenChannelSummaryData(): Promise<{
  sessions: OpenSessionRow[];
  messages: SummaryMessageRow[];
}> {
  const { data: sessions, error } = await db()
    .from(SESSIONS)
    .select('id, channel_key, language_code, language_source')
    .eq('status', 'open');
  if (error) throw new Error(`DB_ERROR: ${error.message}`);
  const rows = (sessions ?? []) as OpenSessionRow[];
  const ids = rows.map((s) => s.id);
  if (ids.length === 0) return { sessions: rows, messages: [] };
  const { data: messages, error: mErr } = await db()
    .from(TABLE)
    // Phase 2D — include text so the summary carries the latest GUEST message preview for the staff
    // Windows notification (buildChannelSummaries exposes only the latest guest message).
    // Soft-deleted rows are still fetched then excluded in buildChannelSummaries (recalculate latest*).
    .select('id, session_id, sender, created_at, original_text, translated_json, is_deleted')
    .in('session_id', ids);
  if (mErr) throw new Error(`DB_ERROR: ${mErr.message}`);
  const rawMessages = (messages ?? []) as SummaryMessageRow[];
  const attachCounts = await countAttachmentsByMessageIds(rawMessages.map((m) => m.id));
  const enriched = rawMessages.map((m) => ({
    ...m,
    has_attachments: (attachCounts.get(m.id) ?? 0) > 0,
  }));
  return { sessions: rows, messages: enriched };
}

export type SoftDeleteGuestMessageResult =
  | { ok: true; message: GuestSpikeMsg }
  | { ok: false; error: 'NOT_FOUND' | 'CHANNEL_MISMATCH' | 'FORBIDDEN' | 'NO_SESSION' };

/**
 * Soft-delete a guest_chat_messages row. Does NOT call ops-chat softDeleteChatMessage.
 * Semantics: is_deleted=true, deleted_at=now(), keep original_text; idempotent when already deleted.
 */
export async function softDeleteGuestChatMessage(input: {
  messageId: string;
  channelKey: string;
  actor: GuestDeleteActor;
}): Promise<SoftDeleteGuestMessageResult> {
  const { messageId, channelKey, actor } = input;
  if (!messageId || !channelKey) return { ok: false, error: 'NOT_FOUND' };

  const { data: existing, error: fetchErr } = await db()
    .from(TABLE)
    .select('id, channel_key, session_id, sender, is_deleted, staff_user_id')
    .eq('id', messageId)
    .maybeSingle();
  if (fetchErr) throw new Error(`DB_ERROR: ${fetchErr.message}`);

  const row = existing as GuestMessageDeleteRow | null;
  const decision = decideGuestMessageDelete({ message: row, channelKey, actor });
  if (!decision.ok) return { ok: false, error: decision.error };

  if (decision.alreadyDeleted) {
    const { data: full, error: fullErr } = await db().from(TABLE).select(COLS).eq('id', messageId).single();
    if (fullErr) throw new Error(`DB_ERROR: ${fullErr.message}`);
    return { ok: true, message: rowToMsg(full as Row) };
  }

  const deletedAt = new Date().toISOString();
  const deletedBy =
    actor.kind === 'guest' ? `guest:${actor.sessionId}` : `staff:${actor.userId}`;

  const { data, error } = await db()
    .from(TABLE)
    .update({
      is_deleted: true,
      deleted_at: deletedAt,
      deleted_by: deletedBy,
      deleted_reason: decision.reason,
    })
    .eq('id', messageId)
    .select(COLS)
    .single();
  if (error) throw new Error(`DB_ERROR: ${error.message}`);
  return { ok: true, message: rowToMsg(data as Row) };
}

export type CloseActiveSessionResult = {
  closed_count: number;
  closed_session_ids: string[];
};

/** Close the channel's active session (staff "대화 종료"). Idempotent when already idle. */
export async function closeActiveSession(channelKey: string): Promise<CloseActiveSessionResult> {
  const { data, error } = await db()
    .from(SESSIONS)
    .update({ status: 'closed', closed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('channel_key', channelKey)
    .eq('status', 'open')
    .select('id');
  if (error) throw new Error(`DB_ERROR: ${error.message}`);
  const rows = (data as { id: string }[] | null) ?? [];
  return {
    closed_count: rows.length,
    closed_session_ids: rows.map((r) => String(r.id)),
  };
}

// ── channel preferred language (Phase 1H.5; guest-selected, NOT room-number hardcoded) ──

const CHANNELS_TABLE = 'guest_chat_channels';

export type ChannelLanguage = {
  preferred_language: string | null;
  language_source: string | null;
};

/** Read a channel's preferred language, or {null,null} when unset. */
export async function getChannelLanguage(channelKey: string): Promise<ChannelLanguage> {
  const { data, error } = await db()
    .from(CHANNELS_TABLE)
    .select('preferred_language, language_source')
    .eq('channel_key', channelKey)
    .maybeSingle();
  if (error) throw new Error(`DB_ERROR: ${error.message}`);
  const row = data as { preferred_language?: string; language_source?: string } | null;
  return {
    preferred_language: row?.preferred_language ?? null,
    language_source: row?.language_source ?? null,
  };
}

/** Upsert a channel's preferred language. */
export async function setChannelLanguage(
  channelKey: string,
  preferred_language: string,
  language_source: 'user_selected' | 'staff_selected' | 'system_default' = 'user_selected',
): Promise<ChannelLanguage> {
  const { data, error } = await db()
    .from(CHANNELS_TABLE)
    .upsert(
      { channel_key: channelKey, preferred_language, language_source, updated_at: new Date().toISOString() },
      { onConflict: 'channel_key' },
    )
    .select('preferred_language, language_source')
    .single();
  if (error) throw new Error(`DB_ERROR: ${error.message}`);
  const row = data as { preferred_language: string; language_source: string };
  return { preferred_language: row.preferred_language, language_source: row.language_source };
}

/**
 * Phase 2D+4A — data for the internal UNANSWERED summary (ledger banner).
 *
 * Loads original_text / translated_json only to build `latestGuestMessagePreview` on the
 * server. Those columns must never appear on the HTTP response (whitelist in the builder).
 * Two queries (open sessions, then their messages by session_id) — no per-room N+1.
 */
export async function listUnansweredSummaryData(): Promise<{
  sessions: UnansweredSessionRow[];
  messages: UnansweredMessageRow[];
}> {
  const { data: sessions, error } = await db()
    .from(SESSIONS)
    .select('id, channel_key, started_at')
    .eq('status', 'open');
  if (error) throw new Error(`DB_ERROR: ${error.message}`);
  const rows = (sessions ?? []) as UnansweredSessionRow[];
  const ids = rows.map((s) => s.id);
  if (ids.length === 0) return { sessions: rows, messages: [] };
  const { data: messages, error: mErr } = await db()
    .from(TABLE)
    .select('id, session_id, sender, created_at, original_text, translated_json, is_deleted')
    .in('session_id', ids);
  if (mErr) throw new Error(`DB_ERROR: ${mErr.message}`);
  const rawMessages = (messages ?? []) as UnansweredMessageRow[];
  const attachCounts = await countAttachmentsByMessageIds(rawMessages.map((m) => m.id));
  const enriched = rawMessages.map((m) => ({
    ...m,
    has_attachments: (attachCounts.get(m.id) ?? 0) > 0,
  }));
  return { sessions: rows, messages: enriched };
}
