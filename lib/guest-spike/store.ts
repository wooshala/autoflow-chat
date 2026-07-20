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
import type { GuestSpikeMsg, NewGuestMsg } from './types';

export type { GuestSpikeMsg, NewGuestMsg };

const TABLE = 'guest_chat_messages';
const COLS = 'id, sender, original_text, original_lang, translated_json, created_at';

interface Row {
  id: string;
  sender: 'guest' | 'staff';
  original_text: string;
  original_lang: string;
  translated_json: Record<string, string> | null;
  created_at: string;
}

function rowToMsg(r: Row): GuestSpikeMsg {
  return {
    id: r.id,
    sender: r.sender,
    original: r.original_text,
    original_lang: r.original_lang,
    translated: r.translated_json ?? {},
    created_at: r.created_at,
  };
}

/** Server admin client, or throw DB_UNAVAILABLE (missing SUPABASE_PRIMARY_URL / key). */
function db() {
  if (!supabaseAdmin) throw new Error('DB_UNAVAILABLE');
  return supabaseAdmin;
}

/** Messages of ONE session (Phase 1H.7), created_at ASC, id ASC tiebreak. */
export async function listMessagesBySession(sessionId: string): Promise<GuestSpikeMsg[]> {
  const { data, error } = await db()
    .from(TABLE)
    .select(COLS)
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });
  if (error) throw new Error(`DB_ERROR: ${error.message}`);
  return ((data as Row[] | null) ?? []).map(rowToMsg);
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
    })
    .select(COLS)
    .single();
  if (error) throw new Error(`DB_ERROR: ${error.message}`);
  return rowToMsg(data as Row);
}

// ── guest sessions (Phase 1H.7) ──────────────────────────────────────────────────
const SESSIONS = 'guest_chat_sessions';
const S_COLS = 'id, channel_key, status, started_at, closed_at';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface GuestSession {
  id: string;
  channel_key: string;
  status: 'open' | 'closed';
  started_at: string;
  closed_at: string | null;
}

function rowToSession(r: Record<string, unknown>): GuestSession {
  return {
    id: String(r.id),
    channel_key: String(r.channel_key),
    status: r.status === 'closed' ? 'closed' : 'open',
    started_at: String(r.started_at),
    closed_at: (r.closed_at as string | null) ?? null,
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

/** Close the channel's active session (staff "대화 종료"). Idempotent. */
export async function closeActiveSession(channelKey: string): Promise<void> {
  const { error } = await db()
    .from(SESSIONS)
    .update({ status: 'closed', closed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('channel_key', channelKey)
    .eq('status', 'open');
  if (error) throw new Error(`DB_ERROR: ${error.message}`);
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
