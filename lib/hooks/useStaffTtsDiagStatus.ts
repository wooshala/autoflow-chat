'use client';

import { useEffect, useState } from 'react';
import { fetchEnvelope } from '@/lib/api/envelope';
import { STAFF_TTS_HEALTH_URL } from '@/lib/chatApi';
import { peekLastStaffTtsClientError } from '@/lib/chat/serverTtsClient';
import { isStaffChatDiagMode } from '@/lib/chat/staffChatDebugLog';

type HealthData = {
  serverTtsAvailable: boolean;
  hasOpenAiKey?: boolean;
};

export function useStaffTtsDiagStatus(): {
  diagMode: boolean;
  serverTtsAvailable: boolean | null;
  lastTtsError: string | null;
} {
  const [diagMode, setDiagMode] = useState(false);
  const [serverTtsAvailable, setServerTtsAvailable] = useState<boolean | null>(null);
  const [lastTtsError, setLastTtsError] = useState<string | null>(null);

  useEffect(() => {
    setDiagMode(isStaffChatDiagMode());
  }, []);

  useEffect(() => {
    if (!diagMode) return;

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

    const poll = window.setInterval(() => {
      setLastTtsError(peekLastStaffTtsClientError());
    }, 1500);

    return () => {
      cancelled = true;
      window.clearInterval(poll);
    };
  }, [diagMode]);

  return { diagMode, serverTtsAvailable, lastTtsError };
}
