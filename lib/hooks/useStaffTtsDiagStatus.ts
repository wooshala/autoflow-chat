'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchEnvelope } from '@/lib/api/envelope';
import { STAFF_TTS_HEALTH_URL } from '@/lib/chatApi';
import {
  isServerStaffTtsUnlocked,
  peekStaffTtsDiag,
  subscribeStaffTtsUnlockState
} from '@/lib/chat/serverTtsClient';
import type { StaffTtsStage } from '@/lib/chat/staffTtsDiagState';
import { isStaffChatDiagMode } from '@/lib/chat/staffChatDebugLog';

type HealthData = {
  serverTtsAvailable: boolean;
  hasOpenAiKey?: boolean;
};

function readDiagSnapshot() {
  const { lastTtsStage, lastTtsError } = peekStaffTtsDiag();
  return {
    serverTtsUnlocked: isServerStaffTtsUnlocked(),
    lastTtsStage,
    lastTtsError
  };
}

export function useStaffTtsDiagStatus(): {
  diagMode: boolean;
  serverTtsAvailable: boolean | null;
  serverTtsUnlocked: boolean;
  lastTtsStage: StaffTtsStage;
  lastTtsError: string;
  refreshUnlockSnapshot: () => void;
} {
  const [diagMode, setDiagMode] = useState(false);
  const [serverTtsAvailable, setServerTtsAvailable] = useState<boolean | null>(null);
  const [serverTtsUnlocked, setServerTtsUnlocked] = useState(false);
  const [lastTtsStage, setLastTtsStage] = useState<StaffTtsStage>('idle');
  const [lastTtsError, setLastTtsError] = useState('none');

  const refreshUnlockSnapshot = useCallback(() => {
    const snap = readDiagSnapshot();
    setServerTtsUnlocked(snap.serverTtsUnlocked);
    setLastTtsStage(snap.lastTtsStage);
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
      }
    })();

    const poll = window.setInterval(refreshUnlockSnapshot, 2000);

    return () => {
      cancelled = true;
      unsubUnlock();
      window.clearInterval(poll);
    };
  }, [diagMode, refreshUnlockSnapshot]);

  return {
    diagMode,
    serverTtsAvailable,
    serverTtsUnlocked,
    lastTtsStage,
    lastTtsError,
    refreshUnlockSnapshot
  };
}
