import type { StaffAccountPublic } from '@/lib/services/staffAccounts';
import { parseInviteSpokenLang, type StaffInviteSession } from '@/lib/auth/staffInviteSession';

/**
 * Phase 1 — client-side session-token helpers for account login.
 * Created so later phases (StaffChatClient wiring) compile; NOT used by the
 * current invite-only StaffChatClient. Type-only imports keep server code
 * (staffAccounts.ts) out of the client bundle.
 *
 * Regression gate: this module NEVER removes/alters the invite token storage.
 * Invite auth stays the operational fallback until account login is device-verified.
 */

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

/** Authorization header for account-session-authenticated requests (empty when logged out). */
export function staffSessionAuthHeaders(): Record<string, string> {
  const token = loadStoredSessionToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Phase 1: intentional no-op.
 * Removing legacy invite storage is deferred to Phase 5 (invite decommission),
 * per the regression gate that keeps invite auth 100% working as fallback.
 */
export function clearLegacyInviteStorageOnce(): void {
  /* no-op until Phase 5 */
}

/**
 * Map an account-login identity onto the chat's StaffInviteSession shape so the
 * existing chat identity/render path can consume account sessions (Phase 2).
 * `token` is empty (no invite token); `inviteId` falls back to accountId.
 */
export function accountPublicToInviteSession(account: StaffAccountPublic): StaffInviteSession {
  return {
    inviteId: account.inviteId ?? account.accountId,
    token: '',
    displayName: account.displayName,
    role: account.role,
    userId: account.userId,
    spokenLang: parseInviteSpokenLang(account.spokenLang),
    siteId: account.siteId
  };
}
