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
  logs: StaffChatDebugEntry[];
} {
  const [debugEnabled] = useState(() => isStaffChatDebugEnabled());
  const [logs, setLogs] = useState<StaffChatDebugEntry[]>([]);

  useEffect(() => {
    if (!debugEnabled) return;
    installStaffChatDebugConsoleHook(true);
    const unsub = subscribeStaffChatDebugLog(setLogs);
    return () => {
      unsub();
      installStaffChatDebugConsoleHook(false);
    };
  }, [debugEnabled]);

  return { debugEnabled, logs };
}
