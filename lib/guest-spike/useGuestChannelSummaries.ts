'use client';

// Phase 1H.11 — ONE polling hook for the whole staff Room Navigation. Replaces useChannelLanguages'
// per-room meta fan-out (≈N requests/poll) with a single /channels/summary request.
// Phase GC-Notification — same interval also loads unanswered-summary (ledger-identical counts).
// No second timer. On error each feed KEEPS its last good map (never clears the UI).

import { useEffect, useRef, useState } from 'react';

import { fetchGuestChannelSummaries, fetchGuestChatUnansweredSummary } from './api';
import type { GuestChannelSummary } from './guestChannelSummary';
import type { ChannelUnansweredBadgeMap } from './unansweredBadge';

export type GuestChannelSummaryMap = Record<string, GuestChannelSummary>;

export type GuestNavPollState = {
  summaries: GuestChannelSummaryMap;
  unansweredByChannel: ChannelUnansweredBadgeMap;
};

export function useGuestChannelSummaries(intervalMs = 5000): GuestNavPollState {
  const [summaries, setSummaries] = useState<GuestChannelSummaryMap>({});
  const [unansweredByChannel, setUnansweredByChannel] = useState<ChannelUnansweredBadgeMap>({});
  const inFlight = useRef(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (inFlight.current) return; // no overlapping requests
      inFlight.current = true;
      try {
        const [channels, unanswered] = await Promise.all([
          fetchGuestChannelSummaries(),
          fetchGuestChatUnansweredSummary(),
        ]);
        if (!alive) return;
        if (channels !== null) {
          const next: GuestChannelSummaryMap = {};
          for (const c of channels) next[c.channel_key] = c;
          setSummaries(next);
        }
        if (unanswered !== null) {
          const next: ChannelUnansweredBadgeMap = {};
          for (const room of unanswered.rooms) {
            if (!room.channelKey || !(room.guestMessageCount > 0)) continue;
            next[room.channelKey] = {
              guestMessageCount: room.guestMessageCount,
              firstUnansweredAt: room.firstUnansweredAt,
            };
          }
          setUnansweredByChannel(next);
        }
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

  return { summaries, unansweredByChannel };
}
