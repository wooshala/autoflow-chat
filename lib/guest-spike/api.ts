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

/** Establish/check the guest session (sets the HttpOnly cookie server-side). */
export async function fetchGuestSession(channelKey: string): Promise<GuestSessionStatus> {
  try {
    const r = await fetch(sessionEndpoint(channelKey), { cache: 'no-store' });
    const j = await r.json();
    if (j?.status === 'closed') return 'closed';
    if (j?.status === 'occupied') return 'occupied';
    return 'open';
  } catch {
    return 'open';
  }
}

/** Staff "대화 종료" — close the channel's active session (requires a staff session). */
export async function closeGuestSession(channelKey: string): Promise<void> {
  await fetch(sessionEndpoint(channelKey), { method: 'DELETE', headers: staffSessionAuthHeaders() });
}

export interface GuestMessagesResult {
  messages: GuestSpikeMsg[];
  preferred_language: string | null;
  language_source: string | null;
}

/** Full messages GET — also carries the channel language, so the OPEN room reuses this
 *  single poll for both (no separate meta poll). Read swallows errors → empty/null. */
export async function fetchGuestMessages(channelKey: string, asStaff?: boolean): Promise<GuestMessagesResult> {
  try {
    const r = await fetch(withStaff(endpoint(channelKey), asStaff), { cache: 'no-store', headers: staffHeaders(asStaff) });
    const j = await r.json();
    if (!j?.ok) return { messages: [], preferred_language: null, language_source: null };
    return {
      messages: j.messages ?? [],
      preferred_language: j.preferred_language ?? null,
      language_source: j.language_source ?? null,
    };
  } catch {
    return { messages: [], preferred_language: null, language_source: null };
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
}

/** Lightweight channel language read (?meta=1) — no message array. Read swallows errors. */
export async function fetchChannelMeta(channelKey: string): Promise<ChannelMeta> {
  try {
    const r = await fetch(`${endpoint(channelKey)}?meta=1`, { cache: 'no-store' });
    const j = await r.json();
    return j?.ok ? { preferred_language: j.preferred_language ?? null, language_source: j.language_source ?? null } : { preferred_language: null, language_source: null };
  } catch {
    return { preferred_language: null, language_source: null };
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
