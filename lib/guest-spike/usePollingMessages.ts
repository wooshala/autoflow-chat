'use client';

// Phase 1H.2/1H.5 — POLLING CONTROLLER. Owns the fetch-loop lifecycle only. Returns the
// current messages + the channel language (from the SAME full GET, so the open room needs
// no separate meta poll) + a manual reload. Unmounting clears the interval.

import { useCallback, useEffect, useState } from 'react';
import { fetchGuestMessages, type GuestMessagesResult, type GuestSpikeMsg } from './api';

const EMPTY: GuestMessagesResult = { messages: [], preferred_language: null, language_source: null };

export function usePollingMessages(channelKey: string, intervalMs = 2000) {
  const [state, setState] = useState<GuestMessagesResult>(EMPTY);

  const reload = useCallback(async () => {
    setState(await fetchGuestMessages(channelKey));
  }, [channelKey]);

  useEffect(() => {
    void reload();
    const t = setInterval(reload, intervalMs);
    return () => clearInterval(t);
  }, [reload, intervalMs]);

  return {
    messages: state.messages as GuestSpikeMsg[],
    preferred_language: state.preferred_language,
    language_source: state.language_source,
    reload,
  };
}
