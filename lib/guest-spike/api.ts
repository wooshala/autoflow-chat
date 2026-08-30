// Phase 1H.2/1H.3 — API ADAPTER for the guest chat. The ONLY module that talks to
// /api/guest/[channel]/messages. Client-safe (imports the message TYPE only, no server/DB
// code). Reads swallow errors (polling shows empty); sends THROW on non-2xx so the caller
// can preserve the draft (message never silently lost).
//
// IMAGE-CHAT-01A-SIMPLIFY — text-only JSON send; image via single multipart POST.

import type { GuestSpikeMsg } from './types';
import type { GuestChannelSummary } from './guestChannelSummary';
import { staffSessionAuthHeaders } from '@/lib/auth/staffAccountSession';
import {
  CLOSE_SESSION_FAILED_USER_MESSAGE,
  parseCloseSessionHttpResult,
} from './closeSessionResponse';

export type { GuestSpikeMsg };
export type { GuestChannelSummary };
export { CLOSE_SESSION_FAILED_USER_MESSAGE };

const endpoint = (channelKey: string) => `/api/guest/${encodeURIComponent(channelKey)}/messages`;
const sessionEndpoint = (channelKey: string) => `/api/guest/${encodeURIComponent(channelKey)}/session`;
const withStaff = (u: string, asStaff?: boolean) => (asStaff ? `${u}?as=staff` : u);
const staffHeaders = (asStaff?: boolean): Record<string, string> => (asStaff ? staffSessionAuthHeaders() : {});

export type GuestSessionStatus = 'open' | 'closed' | 'occupied';

export interface GuestSessionResult {
  status: GuestSessionStatus;
  language_code: string | null;
  language_source: string | null;
}

export async function fetchGuestSession(channelKey: string): Promise<GuestSessionResult> {
  try {
    const r = await fetch(sessionEndpoint(channelKey), { cache: 'no-store' });
    const j = await r.json();
    const status: GuestSessionStatus = j?.status === 'closed' ? 'closed' : j?.status === 'occupied' ? 'occupied' : 'open';
    return { status, language_code: j?.language_code ?? null, language_source: j?.language_source ?? null };
  } catch {
    return { status: 'open', language_code: null, language_source: null };
  }
}

export async function closeGuestSession(
  channelKey: string,
): Promise<{ closed: boolean; closed_count: number; closed_session_ids: string[] }> {
  const res = await fetch(sessionEndpoint(channelKey), { method: 'DELETE', headers: staffSessionAuthHeaders() });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    try {
      await res.text();
    } catch {
      /* ignore */
    }
  }
  return parseCloseSessionHttpResult(res.status, body);
}

export type GuestSessionState = 'open' | 'none' | null;

export interface GuestMessagesResult {
  messages: GuestSpikeMsg[];
  preferred_language: string | null;
  language_source: string | null;
  session_status: GuestSessionState;
}

export async function fetchGuestMessages(channelKey: string, asStaff?: boolean): Promise<GuestMessagesResult> {
  let r: Response;
  try {
    r = await fetch(withStaff(endpoint(channelKey), asStaff), { cache: 'no-store', headers: staffHeaders(asStaff) });
  } catch (e: any) {
    const err: any = new Error(e?.message || 'network error');
    err.status = 0;
    throw err;
  }

  let j: any = null;
  try {
    j = await r.json();
  } catch {
    j = null;
  }

  if (!r.ok) {
    const bodyHint = typeof j?.message === 'string'
      ? j.message
      : typeof j?.error === 'string'
        ? j.error
        : '';
    const err: any = new Error(bodyHint || `GUEST_MESSAGES_HTTP_${r.status}`);
    err.status = r.status;
    throw err;
  }

  if (!j?.ok) {
    const msg = String(j?.message || j?.error || 'GUEST_MESSAGES_NOT_OK');
    const err: any = new Error(msg);
    err.status = r.status;
    if (/pgrst003|timeout|522|500|502|503|504|upstream/i.test(msg)) {
      throw err;
    }
    return { messages: [], preferred_language: null, language_source: null, session_status: null };
  }

  return {
    messages: (j.messages ?? []).map(normalizeGuestMessage),
    preferred_language: j.preferred_language ?? null,
    language_source: j.language_source ?? null,
    session_status: j.session_status ?? null,
  };
}

function normalizeGuestMessage(m: GuestSpikeMsg): GuestSpikeMsg {
  return { ...m, attachments: m.attachments ?? [] };
}

export async function sendGuestMessage(
  channelKey: string,
  input: { text: string; sender: 'guest' | 'staff'; image?: File },
  asStaff?: boolean,
): Promise<void> {
  if (input.image) {
    const form = new FormData();
    form.append('text', input.text);
    form.append('image', input.image);
    const res = await fetch(withStaff(endpoint(channelKey), asStaff), {
      method: 'POST',
      headers: staffHeaders(asStaff),
      body: form,
    });
    if (!res.ok) throw new Error(`SEND_FAILED_${res.status}`);
    return;
  }

  const res = await fetch(withStaff(endpoint(channelKey), asStaff), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...staffHeaders(asStaff) },
    body: JSON.stringify({ text: input.text, sender: input.sender }),
  });
  if (!res.ok) throw new Error(`SEND_FAILED_${res.status}`);
}

export async function deleteGuestMessage(
  channelKey: string,
  messageId: string,
  asStaff?: boolean,
): Promise<GuestSpikeMsg> {
  const url = withStaff(
    `${endpoint(channelKey)}/${encodeURIComponent(messageId)}/delete`,
    asStaff,
  );
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...staffHeaders(asStaff) },
    body: '{}',
  });
  const j = await res.json().catch(() => null);
  if (!res.ok || !j?.ok || !j.message) {
    const err = new Error(`DELETE_FAILED_${res.status}`) as Error & { status?: number; code?: string };
    err.status = res.status;
    err.code = j?.error ?? undefined;
    throw err;
  }
  return j.message as GuestSpikeMsg;
}

export interface ChannelMeta {
  preferred_language: string | null;
  language_source: string | null;
  session_status: GuestSessionState;
}

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

export async function fetchGuestChannelSummaries(): Promise<GuestChannelSummary[] | null> {
  try {
    const r = await fetch('/api/guest/channels/summary', { cache: 'no-store', headers: staffSessionAuthHeaders() });
    const j = await r.json();
    if (!r.ok || !j?.ok || !Array.isArray(j.channels)) return null;
    return j.channels as GuestChannelSummary[];
  } catch {
    return null;
  }
}

export async function setGuestLanguage(channelKey: string, preferred_language: string): Promise<void> {
  const res = await fetch(endpoint(channelKey), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ preferred_language }),
  });
  if (!res.ok) throw new Error(`LANGUAGE_SAVE_FAILED_${res.status}`);
}
