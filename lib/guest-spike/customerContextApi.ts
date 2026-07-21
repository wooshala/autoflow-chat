'use client';

// Phase 2A — client adapter + hook for the session-scoped Customer Information panel. One GET per
// channel (room switches abort the in-flight request so a slow response never overwrites a newer
// room's panel), plus a PUT to save the memo. A failure NEVER throws into render (chat keeps
// working) — reads surface as 'error', saves as a typed SaveResult.

import { useEffect, useState } from 'react';

import { staffSessionAuthHeaders } from '@/lib/auth/staffAccountSession';
import type { GuestCustomerContext } from './customerContextTypes';
import type { CleanContextInput } from './customerContextValidate';

export async function fetchCustomerContext(
  channelKey: string,
  signal?: AbortSignal,
): Promise<GuestCustomerContext | null> {
  const r = await fetch(`/api/guest/${encodeURIComponent(channelKey)}/customer-context`, {
    cache: 'no-store',
    headers: staffSessionAuthHeaders(),
    signal,
  });
  const j = await r.json();
  if (!r.ok || !j?.ok) return null;
  return j.context as GuestCustomerContext;
}

export type SaveResult =
  | { ok: true; context: GuestCustomerContext }
  | { ok: false; error: 'no_session' | 'invalid' | 'failed' };

export async function saveCustomerContext(
  channelKey: string,
  input: CleanContextInput,
): Promise<SaveResult> {
  let r: Response;
  try {
    r = await fetch(`/api/guest/${encodeURIComponent(channelKey)}/customer-context`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', ...staffSessionAuthHeaders() },
      body: JSON.stringify(input),
    });
  } catch {
    return { ok: false, error: 'failed' };
  }
  const j = await r.json().catch(() => null);
  if (r.ok && j?.ok) return { ok: true, context: j.context as GuestCustomerContext };
  if (r.status === 409) return { ok: false, error: 'no_session' };
  if (r.status === 422) return { ok: false, error: 'invalid' };
  return { ok: false, error: 'failed' };
}

export type CustomerContextState =
  | { status: 'loading' }
  | { status: 'success'; context: GuestCustomerContext }
  | { status: 'error' };

export function useCustomerContext(channelKey: string, reloadKey: string | number = 0): CustomerContextState {
  const [state, setState] = useState<CustomerContextState>({ status: 'loading' });

  useEffect(() => {
    const ac = new AbortController();
    setState({ status: 'loading' });
    (async () => {
      try {
        const context = await fetchCustomerContext(channelKey, ac.signal);
        if (ac.signal.aborted) return; // room switched → don't overwrite the newer panel
        setState(context ? { status: 'success', context } : { status: 'error' });
      } catch (e) {
        if (ac.signal.aborted || (e as Error)?.name === 'AbortError') return;
        setState({ status: 'error' });
      }
    })();
    return () => ac.abort();
  }, [channelKey, reloadKey]);

  return state;
}
