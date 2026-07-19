export const STAFF_SESSION_TOKEN_STORAGE_KEY = 'autoflow_staff_session_token_v1';
export const STAFF_SESSION_META_STORAGE_KEY = 'autoflow_staff_session_meta_v1';

export type StaffSessionMeta = { accountId: string; userId: string };

function hasWindow(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function saveStaffSession(sessionToken: string, meta: StaffSessionMeta): void {
  if (!hasWindow()) return;
  const token = String(sessionToken || '').trim();
  if (!token) return;
  try {
    window.localStorage.setItem(STAFF_SESSION_TOKEN_STORAGE_KEY, token);
    window.localStorage.setItem(STAFF_SESSION_META_STORAGE_KEY, JSON.stringify(meta));
  } catch {
    /* storage unavailable — non-fatal */
  }
}

export function loadStoredSessionToken(): string | null {
  if (!hasWindow()) return null;
  try {
    const t = window.localStorage.getItem(STAFF_SESSION_TOKEN_STORAGE_KEY);
    return t && t.trim() ? t.trim() : null;
  } catch {
    return null;
  }
}

export function loadStoredSessionMeta(): StaffSessionMeta | null {
  if (!hasWindow()) return null;
  try {
    const raw = window.localStorage.getItem(STAFF_SESSION_META_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StaffSessionMeta>;
    if (parsed && typeof parsed.accountId === 'string' && typeof parsed.userId === 'string') {
      return { accountId: parsed.accountId, userId: parsed.userId };
    }
    return null;
  } catch {
    return null;
  }
}

export function clearStaffSession(): void {
  if (!hasWindow()) return;
  try {
    window.localStorage.removeItem(STAFF_SESSION_TOKEN_STORAGE_KEY);
    window.localStorage.removeItem(STAFF_SESSION_META_STORAGE_KEY);
  } catch {
    /* non-fatal */
  }
}

export function staffSessionAuthHeaders(): Record<string, string> {
  const token = loadStoredSessionToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function clearLegacyInviteStorageOnce(): void {
  /* no-op until Phase 5 */
}
