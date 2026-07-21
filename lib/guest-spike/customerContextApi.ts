'use client';

// Phase 1I.1-B — client adapter + hook for the Customer Information panel. Single request per
// channel; room switches abort the in-flight request so a slow response never overwrites a newer
// room's panel. A failure NEVER throws into render (chat keeps working) — it surfaces as 'error'.

import { useEffect, useState } from 'react';

import { staffSessionAuthHeaders } from '@/lib/auth/staffAccountSession';
import type { GuestCustomerContext } from './customerContextTypes';

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

export type CustomerContextState =
  | { status: 'loading' }
  | { status: 'success'; context: GuestCustomerContext }
  | { status: 'error' };

export function useCustomerContext(channelKey: string, reloadKey = 0): CustomerContextState {
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
