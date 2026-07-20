'use client';

// Phase 1H.2 — POLLING CONTROLLER. Owns the fetch-loop lifecycle only; no rendering,
// no display logic. Returns the current messages + a manual reload (used after a send).
// Unmounting (e.g. switching rooms in /chat) clears the interval automatically.
//
// TODO(canonical-namespace): guest-spike → guest-chat (later refactor step).

import { useCallback, useEffect, useState } from 'react';
import { fetchGuestMessages, type GuestSpikeMsg } from './api';

export function usePollingMessages(channelKey: string, intervalMs = 2000) {
  const [messages, setMessages] = useState<GuestSpikeMsg[]>([]);

  const reload = useCallback(async () => {
    setMessages(await fetchGuestMessages(channelKey));
  }, [channelKey]);

  useEffect(() => {
    void reload();
    const t = setInterval(reload, intervalMs);
    return () => clearInterval(t);
  }, [reload, intervalMs]);

  return { messages, reload };
}
