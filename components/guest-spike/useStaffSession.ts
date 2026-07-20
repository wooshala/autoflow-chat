'use client';

// Phase 1H.7 — thin client hook over the EXISTING staff account session (same storage as
// /staff-chat). Only checks token PRESENCE; the server validates it on every request
// (validateSessionToken). No guest-chat-specific token store.

import { useCallback, useEffect, useState } from 'react';
import { loadStoredSessionToken } from '@/lib/auth/staffAccountSession';

export function useStaffSession() {
  const [hasSession, setHasSession] = useState(false);
  const refresh = useCallback(() => setHasSession(Boolean(loadStoredSessionToken())), []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  return { hasSession, refresh };
}
