'use client';

// Phase 1H.2/1H.5 — POLLING CONTROLLER with P0 single-flight + backoff + visibility.

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchGuestMessages, type GuestMessagesResult, type GuestSpikeMsg } from './api';
import {
  GUEST_MESSAGES_HIDDEN_INTERVAL_MS,
  GUEST_MESSAGES_VISIBLE_INTERVAL_MS,
  isBackoffFailure,
  logChatPollEvent,
  nextBackoffMs,
} from '@/lib/chat/pollResilience';

const EMPTY: GuestMessagesResult = {
  messages: [],
  preferred_language: null,
  language_source: null,
  session_status: null,
};

export function usePollingMessages(
  channelKey: string,
  asStaff?: boolean,
  /** Override visible-interval; default ≥10s (2s fixed polling removed). */
  intervalMs: number = GUEST_MESSAGES_VISIBLE_INTERVAL_MS,
) {
  const [state, setState] = useState<GuestMessagesResult>(EMPTY);
  const inFlightRef = useRef(false);
  const pendingRefreshRef = useRef(false);
  const mountedRef = useRef(true);
  const failureCountRef = useRef(0);
  const nextAllowedAtRef = useRef(0);
  const intervalIdRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const backoffTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channelKeyRef = useRef(channelKey);
  channelKeyRef.current = channelKey;
  const asStaffRef = useRef(asStaff);
  asStaffRef.current = asStaff;
  const intervalMsRef = useRef(intervalMs);
  intervalMsRef.current = intervalMs;
  const armIntervalRef = useRef<() => void>(() => {});

  const clearIntervalOnly = () => {
    if (intervalIdRef.current) {
      clearInterval(intervalIdRef.current);
      intervalIdRef.current = null;
    }
  };

  const clearAllTimers = () => {
    clearIntervalOnly();
    if (backoffTimerRef.current) {
      clearTimeout(backoffTimerRef.current);
      backoffTimerRef.current = null;
    }
  };

  const reload = useCallback(async (reason = 'manual') => {
    if (!mountedRef.current) return;
    if (!channelKeyRef.current) return;

    if (inFlightRef.current) {
      pendingRefreshRef.current = true;
      logChatPollEvent('CHAT_POLL_SKIPPED_IN_FLIGHT', {
        endpointKey: `guest-messages:${channelKeyRef.current}`,
        reason,
        inFlight: true,
        visibilityState: typeof document !== 'undefined' ? document.visibilityState : null,
      });
      return;
    }

    const now = Date.now();
    if (now < nextAllowedAtRef.current && reason !== 'post_send' && reason !== 'manual') {
      logChatPollEvent('CHAT_POLL_BACKOFF', {
        endpointKey: `guest-messages:${channelKeyRef.current}`,
        reason: 'wait_next_allowed',
        attempt: failureCountRef.current,
        delayMs: nextAllowedAtRef.current - now,
        visibilityState: typeof document !== 'undefined' ? document.visibilityState : null,
      });
      return;
    }

    inFlightRef.current = true;
    logChatPollEvent('CHAT_POLL_STARTED', {
      endpointKey: `guest-messages:${channelKeyRef.current}`,
      reason,
      attempt: failureCountRef.current,
      inFlight: true,
      visibilityState: typeof document !== 'undefined' ? document.visibilityState : null,
    });

    let failedWithBackoff = false;
    const requestedChannel = channelKeyRef.current;
    const requestedAsStaff = asStaffRef.current;
    try {
      const next = await fetchGuestMessages(requestedChannel, requestedAsStaff);
      if (!mountedRef.current) return;
      // Drop stale responses after channel switch.
      if (channelKeyRef.current !== requestedChannel || asStaffRef.current !== requestedAsStaff) {
        return;
      }
      setState(next);
      if (failureCountRef.current > 0) {
        logChatPollEvent('CHAT_POLL_RECOVERED', {
          endpointKey: `guest-messages:${channelKeyRef.current}`,
          reason,
          attempt: failureCountRef.current,
        });
      }
      failureCountRef.current = 0;
      nextAllowedAtRef.current = 0;
      // Resume normal interval after recovery (interval was paused during backoff).
      armIntervalRef.current();
    } catch (e: any) {
      const msg = e?.message || String(e);
      const status = typeof e?.status === 'number' ? e.status : null;
      if (isBackoffFailure({ errorMessage: msg, httpStatus: status })) {
        failedWithBackoff = true;
        failureCountRef.current += 1;
        const delayMs = nextBackoffMs(failureCountRef.current - 1);
        nextAllowedAtRef.current = Date.now() + delayMs;
        logChatPollEvent('CHAT_POLL_BACKOFF', {
          endpointKey: `guest-messages:${channelKeyRef.current}`,
          reason: msg,
          attempt: failureCountRef.current,
          delayMs,
          resultStatus: status,
          visibilityState: typeof document !== 'undefined' ? document.visibilityState : null,
        });
        // Pause interval while backoff timer owns retries (C5: no dual timers).
        clearIntervalOnly();
        if (backoffTimerRef.current) clearTimeout(backoffTimerRef.current);
        backoffTimerRef.current = setTimeout(() => {
          backoffTimerRef.current = null;
          if (mountedRef.current) void reload('backoff_retry');
        }, delayMs);
      }
    } finally {
      inFlightRef.current = false;
      if (!mountedRef.current) return;
      if (pendingRefreshRef.current) {
        if (failedWithBackoff || Date.now() < nextAllowedAtRef.current) {
          // Keep pending; backoff_retry will pick up.
          return;
        }
        pendingRefreshRef.current = false;
        void reload('coalesced_followup');
      }
    }
  }, []);

  const publicReload = useCallback(async () => {
    // Allow immediate refresh after send even during backoff window.
    nextAllowedAtRef.current = 0;
    await reload('post_send');
  }, [reload]);

  useEffect(() => {
    mountedRef.current = true;
    failureCountRef.current = 0;
    nextAllowedAtRef.current = 0;
    pendingRefreshRef.current = false;

    const armInterval = () => {
      clearIntervalOnly();
      if (!mountedRef.current) return;
      // Do not arm interval while backing off — backoff timer owns retries.
      if (Date.now() < nextAllowedAtRef.current) return;
      const hidden = typeof document !== 'undefined' && document.hidden;
      const ms = hidden ? GUEST_MESSAGES_HIDDEN_INTERVAL_MS : intervalMsRef.current;
      intervalIdRef.current = setInterval(() => {
        void reload(hidden ? 'hidden_poll' : 'interval');
      }, ms);
    };
    armIntervalRef.current = armInterval;

    void reload('initial');
    armInterval();

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        armInterval();
        void reload('visibility_restore');
      } else {
        armInterval();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      mountedRef.current = false;
      clearAllTimers();
      pendingRefreshRef.current = false;
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [channelKey, asStaff, intervalMs, reload]);

  return {
    messages: state.messages as GuestSpikeMsg[],
    preferred_language: state.preferred_language,
    language_source: state.language_source,
    session_status: state.session_status,
    reload: publicReload,
  };
}
