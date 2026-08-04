'use client';

// Phase 1H.11 — channel summary poll with P0 single-flight, backoff, visibility.

import { useEffect, useRef, useState } from 'react';

import { fetchGuestChannelSummaries } from './api';
import type { GuestChannelSummary } from './guestChannelSummary';
import {
  GUEST_SUMMARY_HIDDEN_INTERVAL_MS,
  GUEST_SUMMARY_VISIBLE_INTERVAL_MS,
  isBackoffFailure,
  logChatPollEvent,
  nextBackoffMs,
} from '@/lib/chat/pollResilience';

export type GuestChannelSummaryMap = Record<string, GuestChannelSummary>;

export function useGuestChannelSummaries(
  intervalMs = GUEST_SUMMARY_VISIBLE_INTERVAL_MS,
): GuestChannelSummaryMap {
  const [map, setMap] = useState<GuestChannelSummaryMap>({});
  const inFlight = useRef(false);
  const pending = useRef(false);
  const failureCount = useRef(0);
  const nextAllowedAt = useRef(0);
  const intervalId = useRef<ReturnType<typeof setInterval> | null>(null);
  const backoffTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;

    const clearTimers = () => {
      if (intervalId.current) {
        clearInterval(intervalId.current);
        intervalId.current = null;
      }
      if (backoffTimer.current) {
        clearTimeout(backoffTimer.current);
        backoffTimer.current = null;
      }
    };

    const armInterval = () => {
      if (intervalId.current) {
        clearInterval(intervalId.current);
        intervalId.current = null;
      }
      if (!alive) return;
      if (Date.now() < nextAllowedAt.current) return;
      const hidden = typeof document !== 'undefined' && document.hidden;
      const ms = hidden ? GUEST_SUMMARY_HIDDEN_INTERVAL_MS : intervalMs;
      intervalId.current = setInterval(() => {
        void load(hidden ? 'hidden_poll' : 'interval');
      }, ms);
    };

    const load = async (reason: string) => {
      if (!alive) return;
      if (inFlight.current) {
        pending.current = true;
        logChatPollEvent('CHAT_POLL_SKIPPED_IN_FLIGHT', {
          endpointKey: 'guest-summary',
          reason,
          inFlight: true,
          visibilityState: typeof document !== 'undefined' ? document.visibilityState : null,
        });
        return;
      }
      const now = Date.now();
      if (now < nextAllowedAt.current && reason !== 'visibility_restore') {
        logChatPollEvent('CHAT_POLL_BACKOFF', {
          endpointKey: 'guest-summary',
          reason: 'wait_next_allowed',
          attempt: failureCount.current,
          delayMs: nextAllowedAt.current - now,
        });
        return;
      }

      inFlight.current = true;
      logChatPollEvent('CHAT_POLL_STARTED', {
        endpointKey: 'guest-summary',
        reason,
        attempt: failureCount.current,
        visibilityState: typeof document !== 'undefined' ? document.visibilityState : null,
      });

      let failedWithBackoff = false;
      try {
        const channels = await fetchGuestChannelSummaries();
        if (!alive) return;
        if (channels === null) {
          failedWithBackoff = true;
          failureCount.current += 1;
          const delayMs = nextBackoffMs(failureCount.current - 1);
          nextAllowedAt.current = Date.now() + delayMs;
          logChatPollEvent('CHAT_POLL_BACKOFF', {
            endpointKey: 'guest-summary',
            reason: 'summary_null',
            attempt: failureCount.current,
            delayMs,
          });
          if (intervalId.current) {
            clearInterval(intervalId.current);
            intervalId.current = null;
          }
          if (backoffTimer.current) clearTimeout(backoffTimer.current);
          backoffTimer.current = setTimeout(() => {
            backoffTimer.current = null;
            if (alive) void load('backoff_retry');
          }, delayMs);
          return;
        }
        if (failureCount.current > 0) {
          logChatPollEvent('CHAT_POLL_RECOVERED', {
            endpointKey: 'guest-summary',
            reason,
            attempt: failureCount.current,
          });
        }
        failureCount.current = 0;
        nextAllowedAt.current = 0;
        const next: GuestChannelSummaryMap = {};
        for (const c of channels) next[c.channel_key] = c;
        setMap(next);
        armInterval();
      } catch (e: any) {
        const msg = e?.message || String(e);
        if (isBackoffFailure({ errorMessage: msg })) {
          failedWithBackoff = true;
          failureCount.current += 1;
          const delayMs = nextBackoffMs(failureCount.current - 1);
          nextAllowedAt.current = Date.now() + delayMs;
          logChatPollEvent('CHAT_POLL_BACKOFF', {
            endpointKey: 'guest-summary',
            reason: msg,
            attempt: failureCount.current,
            delayMs,
          });
          if (intervalId.current) {
            clearInterval(intervalId.current);
            intervalId.current = null;
          }
          if (backoffTimer.current) clearTimeout(backoffTimer.current);
          backoffTimer.current = setTimeout(() => {
            backoffTimer.current = null;
            if (alive) void load('backoff_retry');
          }, delayMs);
        }
      } finally {
        inFlight.current = false;
        if (pending.current && alive) {
          if (failedWithBackoff || Date.now() < nextAllowedAt.current) {
            return;
          }
          pending.current = false;
          void load('coalesced_followup');
        }
      }
    };

    void load('initial');
    armInterval();

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        armInterval();
        void load('visibility_restore');
      } else {
        armInterval();
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      alive = false;
      clearTimers();
      pending.current = false;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [intervalMs]);

  return map;
}
