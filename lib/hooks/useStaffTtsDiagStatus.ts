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
import type { StaffTtsLangSource } from '@/lib/chat/staffTtsLang';
import { peekStaffTtsTriggerCheck } from '@/lib/chat/staffTtsTriggerCheck';
import { isStaffChatDiagMode } from '@/lib/chat/staffChatDebugLog';

type HealthData = {
  serverTtsAvailable: boolean;
  hasOpenAiKey?: boolean;
};

function readDiagSnapshot() {
  const { lastTtsStage, lastTtsError, lastTtsSkipReason } = peekStaffTtsDiag();
  const trigger = peekStaffTtsTriggerCheck();
  return {
    serverTtsUnlocked: isServerStaffTtsUnlocked(),
    lastTtsStage,
    lastTtsError,
    lastTtsSkipReason,
    ttsLang: trigger?.ttsLang ?? '—',
    ttsLangSource: trigger?.ttsLangSource ?? '—',
    translatedTtsExists: trigger?.translatedTtsExists ?? false,
    ttsTextLength: trigger?.ttsTextLength ?? 0,
    ttsTextOrigin: trigger?.ttsTextOrigin ?? '—'
  };
}

export function useStaffTtsDiagStatus(): {
  diagMode: boolean;
  serverTtsAvailable: boolean | null;
  serverTtsUnlocked: boolean;
  lastTtsStage: StaffTtsStage;
  lastTtsError: string;
  lastTtsSkipReason: string;
  ttsLang: string;
  ttsLangSource: StaffTtsLangSource | string;
  translatedTtsExists: boolean;
  ttsTextLength: number;
  ttsTextOrigin: string;
  refreshUnlockSnapshot: () => void;
} {
  const [diagMode, setDiagMode] = useState(false);
  const [serverTtsAvailable, setServerTtsAvailable] = useState<boolean | null>(null);
  const [serverTtsUnlocked, setServerTtsUnlocked] = useState(false);
  const [lastTtsStage, setLastTtsStage] = useState<StaffTtsStage>('idle');
  const [lastTtsError, setLastTtsError] = useState('none');
  const [lastTtsSkipReason, setLastTtsSkipReason] = useState('none');
  const [ttsLang, setTtsLang] = useState('—');
  const [ttsLangSource, setTtsLangSource] = useState<StaffTtsLangSource | string>('—');
  const [translatedTtsExists, setTranslatedTtsExists] = useState(false);
  const [ttsTextLength, setTtsTextLength] = useState(0);
  const [ttsTextOrigin, setTtsTextOrigin] = useState('—');

  const refreshUnlockSnapshot = useCallback(() => {
    const snap = readDiagSnapshot();
    setServerTtsUnlocked(snap.serverTtsUnlocked);
    setLastTtsStage(snap.lastTtsStage);
    setLastTtsError(snap.lastTtsError);
    setLastTtsSkipReason(snap.lastTtsSkipReason);
    setTtsLang(String(snap.ttsLang));
    setTtsLangSource(snap.ttsLangSource);
    setTranslatedTtsExists(snap.translatedTtsExists);
    setTtsTextLength(snap.ttsTextLength);
    setTtsTextOrigin(String(snap.ttsTextOrigin));
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
    lastTtsSkipReason,
    ttsLang,
    ttsLangSource,
    translatedTtsExists,
    ttsTextLength,
    ttsTextOrigin,
    refreshUnlockSnapshot
  };
}
