'use client';

// Phase 1H.11 — ONE polling hook for the whole staff Room Navigation. Replaces useChannelLanguages'
// per-room meta fan-out (≈N requests/poll) with a single /channels/summary request. Returns a
// { channel_key → summary } map. On error it KEEPS the last good map (never clears the UI).

import { useEffect, useRef, useState } from 'react';

import { fetchGuestChannelSummaries } from './api';
import type { GuestChannelSummary } from './guestChannelSummary';

export type GuestChannelSummaryMap = Record<string, GuestChannelSummary>;

export function useGuestChannelSummaries(intervalMs = 5000): GuestChannelSummaryMap {
  const [map, setMap] = useState<GuestChannelSummaryMap>({});
  const inFlight = useRef(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (inFlight.current) return; // no overlapping requests
      inFlight.current = true;
      try {
        const channels = await fetchGuestChannelSummaries();
        if (!alive || channels === null) return; // error → keep last good map
        const next: GuestChannelSummaryMap = {};
        for (const c of channels) next[c.channel_key] = c;
        setMap(next);
      } finally {
        inFlight.current = false;
      }
    };

    void load();
    const t = setInterval(load, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load(); // instant refresh on tab return
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [intervalMs]);

  return map;
}
