'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchEnvelope } from '@/lib/api/envelope';
import { STAFF_TTS_HEALTH_URL } from '@/lib/chatApi';
import {
  isServerStaffTtsUnlocked,
  peekLastStaffTtsClientError,
  subscribeStaffTtsUnlockState
} from '@/lib/chat/serverTtsClient';
import { isStaffChatDiagMode } from '@/lib/chat/staffChatDebugLog';

type HealthData = {
  serverTtsAvailable: boolean;
  hasOpenAiKey?: boolean;
};

function readUnlockSnapshot() {
  return {
    serverTtsUnlocked: isServerStaffTtsUnlocked(),
    lastTtsError: peekLastStaffTtsClientError()
  };
}

export function useStaffTtsDiagStatus(): {
  diagMode: boolean;
  serverTtsAvailable: boolean | null;
  serverTtsUnlocked: boolean;
  lastTtsError: string | null;
  refreshUnlockSnapshot: () => void;
} {
  const [diagMode, setDiagMode] = useState(false);
  const [serverTtsAvailable, setServerTtsAvailable] = useState<boolean | null>(null);
  const [serverTtsUnlocked, setServerTtsUnlocked] = useState(false);
  const [lastTtsError, setLastTtsError] = useState<string | null>(null);

  const refreshUnlockSnapshot = useCallback(() => {
    const snap = readUnlockSnapshot();
    setServerTtsUnlocked(snap.serverTtsUnlocked);
    setLastTtsError(snap.lastTtsError);
  }, []);

  useEffect(() => {
    setDiagMode(isStaffChatDiagMode());
  }, []);

  useEffect(() => {
    if (!diagMode) return;

    refreshUnlockSnapshot();
    const unsubUnlock = subscribeStaffTtsUnlockState(refreshUnlockSnapshot);

    let cancelled = false;
    void (async () => {
      const res = await fetchEnvelope<HealthData>(STAFF_TTS_HEALTH_URL, { timeoutMs: 8000 });
      if (cancelled) return;
      if (res.ok) {
        setServerTtsAvailable(Boolean(res.data.serverTtsAvailable));
      } else {
        setServerTtsAvailable(false);
        setLastTtsError(res.message || res.error);
      }
    })();

    const poll = window.setInterval(refreshUnlockSnapshot, 2000);

    return () => {
      cancelled = true;
      unsubUnlock();
      window.clearInterval(poll);
    };
  }, [diagMode, refreshUnlockSnapshot]);

  return { diagMode, serverTtsAvailable, serverTtsUnlocked, lastTtsError, refreshUnlockSnapshot };
}
