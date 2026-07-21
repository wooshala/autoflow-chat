// Phase 1H.2/1H.3 — API ADAPTER for the guest chat. The ONLY module that talks to
// /api/guest/[channel]/messages. Client-safe (imports the message TYPE only, no server/DB
// code). Reads swallow errors (polling shows empty); sends THROW on non-2xx so the caller
// can preserve the draft (message never silently lost).
//
// TODO(canonical-namespace): guest-spike → guest-chat (later refactor step).

import type { GuestSpikeMsg } from './types';
import { staffSessionAuthHeaders } from '@/lib/auth/staffAccountSession';

export type { GuestSpikeMsg };

const endpoint = (channelKey: string) => `/api/guest/${encodeURIComponent(channelKey)}/messages`;
const sessionEndpoint = (channelKey: string) => `/api/guest/${encodeURIComponent(channelKey)}/session`;
const withStaff = (u: string, asStaff?: boolean) => (asStaff ? `${u}?as=staff` : u);
// Staff requests carry the REAL staff session (Authorization: Bearer). Guest requests carry
// nothing but their per-channel HttpOnly cookie (sent automatically).
const staffHeaders = (asStaff?: boolean): Record<string, string> => (asStaff ? staffSessionAuthHeaders() : {});

export type GuestSessionStatus = 'open' | 'closed' | 'occupied';

export interface GuestSessionResult {
  status: GuestSessionStatus;
  /** THIS session's language (Phase 1H.7). NULL on a fresh session → guest must select. */
  language_code: string | null;
  language_source: string | null;
}

/**
 * Establish/check the guest session (sets the HttpOnly cookie server-side) AND return this
 * session's language, so the entry screen is decided from ONE response — never a stale channel
 * value. A fresh session returns language_code=null → selection screen.
 */
export async function fetchGuestSession(channelKey: string): Promise<GuestSessionResult> {
  try {
    const r = await fetch(sessionEndpoint(channelKey), { cache: 'no-store' });
    const j = await r.json();
    const status: GuestSessionStatus = j?.status === 'closed' ? 'closed' : j?.status === 'occupied' ? 'occupied' : 'open';
    return { status, language_code: j?.language_code ?? null, language_source: j?.language_source ?? null };
  } catch {
    // Network error → treat as a fresh open session with no language (guest selects).
    return { status: 'open', language_code: null, language_source: null };
  }
}

/** Staff "대화 종료" — close the channel's active session (requires a staff session). */
export async function closeGuestSession(channelKey: string): Promise<void> {
  await fetch(sessionEndpoint(channelKey), { method: 'DELETE', headers: staffSessionAuthHeaders() });
}

/** Phase 1H.7 — staff responses carry the active-session state so the UI distinguishes
 *  "guest present, no language" (open) from "no active guest" (none). null on guest reads /
 *  errors / pre-auth (field absent). */
export type GuestSessionState = 'open' | 'none' | null;

export interface GuestMessagesResult {
  messages: GuestSpikeMsg[];
  preferred_language: string | null;
  language_source: string | null;
  session_status: GuestSessionState;
}

/** Full messages GET — also carries the session language + session_status (staff), so the OPEN
 *  room reuses this single poll (no separate meta poll). Read swallows errors → empty/null. */
export async function fetchGuestMessages(channelKey: string, asStaff?: boolean): Promise<GuestMessagesResult> {
  try {
    const r = await fetch(withStaff(endpoint(channelKey), asStaff), { cache: 'no-store', headers: staffHeaders(asStaff) });
    const j = await r.json();
    if (!j?.ok) return { messages: [], preferred_language: null, language_source: null, session_status: null };
    return {
      messages: j.messages ?? [],
      preferred_language: j.preferred_language ?? null,
      language_source: j.language_source ?? null,
      session_status: j.session_status ?? null,
    };
  } catch {
    return { messages: [], preferred_language: null, language_source: null, session_status: null };
  }
}

export async function sendGuestMessage(
  channelKey: string,
  input: { text: string; sender: 'guest' | 'staff' },
  asStaff?: boolean,
): Promise<void> {
  const res = await fetch(withStaff(endpoint(channelKey), asStaff), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...staffHeaders(asStaff) },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`SEND_FAILED_${res.status}`); // caller keeps the draft (incl. 401/409)
}

export interface ChannelMeta {
  preferred_language: string | null;
  language_source: string | null;
  session_status: GuestSessionState;
}

/**
 * Lightweight language read (?meta=1) — no message array. Phase 1H.7: language is session-owned,
 * so the STAFF room-list poll passes asStaff to resolve each room's ACTIVE session (a plain guest
 * read has no session context). Read swallows errors → null. */
export async function fetchChannelMeta(channelKey: string, asStaff?: boolean): Promise<ChannelMeta> {
  try {
    const url = `${endpoint(channelKey)}?meta=1${asStaff ? '&as=staff' : ''}`;
    const r = await fetch(url, { cache: 'no-store', headers: staffHeaders(asStaff) });
    const j = await r.json();
    return j?.ok
      ? { preferred_language: j.preferred_language ?? null, language_source: j.language_source ?? null, session_status: j.session_status ?? null }
      : { preferred_language: null, language_source: null, session_status: null };
  } catch {
    return { preferred_language: null, language_source: null, session_status: null };
  }
}

/** Set the channel language (PUT). Throws on failure so the caller does NOT enter chat. */
export async function setGuestLanguage(channelKey: string, preferred_language: string): Promise<void> {
  const res = await fetch(endpoint(channelKey), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ preferred_language }),
  });
  if (!res.ok) throw new Error(`LANGUAGE_SAVE_FAILED_${res.status}`);
}
