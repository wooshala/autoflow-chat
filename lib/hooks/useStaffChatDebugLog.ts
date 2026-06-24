'use client';

import { useEffect, useState } from 'react';
import {
  installStaffChatDebugConsoleHook,
  isStaffChatDebugEnabled,
  subscribeStaffChatDebugLog,
  type StaffChatDebugEntry
} from '@/lib/chat/staffChatDebugLog';

export function useStaffChatDebugLog(): {
  debugEnabled: boolean;
  debugBroken: boolean;
  logs: StaffChatDebugEntry[];
} {
  const [debugEnabled, setDebugEnabled] = useState(false);
  const [debugBroken, setDebugBroken] = useState(false);
  const [logs, setLogs] = useState<StaffChatDebugEntry[]>([]);

  useEffect(() => {
    try {
      setDebugEnabled(isStaffChatDebugEnabled());
    } catch {
      setDebugBroken(true);
    }
  }, []);

  useEffect(() => {
    if (!debugEnabled || debugBroken) return;

    let unsub: (() => void) | undefined;
    const tid = window.setTimeout(() => {
      try {
        installStaffChatDebugConsoleHook(true);
        unsub = subscribeStaffChatDebugLog(setLogs);
      } catch (e) {
        console.warn('[STAFF_CHAT_DEBUG_INIT_FAILED]', e);
        setDebugBroken(true);
        installStaffChatDebugConsoleHook(false);
      }
    }, 0);

    return () => {
      window.clearTimeout(tid);
      unsub?.();
      installStaffChatDebugConsoleHook(false);
    };
  }, [debugEnabled, debugBroken]);

  return { debugEnabled: debugEnabled && !debugBroken, debugBroken, logs };
}
