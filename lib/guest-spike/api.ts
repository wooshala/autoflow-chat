// Phase 1H.2/1H.3 — API ADAPTER for the guest chat. The ONLY module that talks to
// /api/guest/[channel]/messages. Client-safe (imports the message TYPE only, no server/DB
// code). Reads swallow errors (polling shows empty); sends THROW on non-2xx so the caller
// can preserve the draft (message never silently lost).
//
// TODO(canonical-namespace): guest-spike → guest-chat (later refactor step).

import type { GuestSpikeMsg } from './types';

export type { GuestSpikeMsg };

const endpoint = (channelKey: string) => `/api/guest/${encodeURIComponent(channelKey)}/messages`;

export async function fetchGuestMessages(channelKey: string): Promise<GuestSpikeMsg[]> {
  try {
    const r = await fetch(endpoint(channelKey), { cache: 'no-store' });
    const j = await r.json();
    return j?.ok ? (j.messages ?? []) : [];
  } catch {
    return [];
  }
}

export async function sendGuestMessage(
  channelKey: string,
  input: { text: string; sender: 'guest' | 'staff'; lang?: string },
): Promise<void> {
  const res = await fetch(endpoint(channelKey), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`SEND_FAILED_${res.status}`); // caller keeps the draft
}
