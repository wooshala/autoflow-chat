import type { StaffInvite } from '@/lib/types';
import { isStaffTtsLang, type StaffTtsLang } from '@/lib/chat/staffTtsLang';

export const STAFF_INVITE_TOKEN_STORAGE_KEY = 'autoflow_staff_invite_token_v1';

export type StaffInviteSession = {
  inviteId: string;
  token: string;
  displayName: string;
  role: string;
  userId: string | null;
  spokenLang: StaffTtsLang | null;
  siteId: string;
};

export function parseInviteSpokenLang(raw: string | null | undefined): StaffTtsLang | null {
  const v = String(raw || '').trim();
  return isStaffTtsLang(v) ? v : null;
}

export function loadStoredInviteToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const t = localStorage.getItem(STAFF_INVITE_TOKEN_STORAGE_KEY);
    return t?.trim() || null;
  } catch {
    return null;
  }
}

export function saveStoredInviteToken(token: string) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STAFF_INVITE_TOKEN_STORAGE_KEY, token.trim());
  } catch {
    /* ignore */
  }
}

export function clearStoredInviteToken() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STAFF_INVITE_TOKEN_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function readEntryJoinTokenFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return new URLSearchParams(window.location.search).get('join')?.trim() || null;
  } catch {
    return null;
  }
}

export function inviteToSession(invite: StaffInvite, userId: string | null): StaffInviteSession {
  return {
    inviteId: invite.id,
    token: invite.token,
    displayName: invite.display_name,
    role: invite.role,
    userId,
    spokenLang: parseInviteSpokenLang(invite.spoken_lang),
    siteId: invite.site_id
  };
}

export type InviteTokenSource = 'url' | 'storage';

/** Read participant invite token from URL query (`t` preferred, `token` alias). */
export function readInviteTokenFromSearchParams(sp: URLSearchParams | null | undefined): string | null {
  if (!sp) return null;
  try {
    return sp.get('t')?.trim() || sp.get('token')?.trim() || null;
  } catch {
    return null;
  }
}

export function readInviteTokenFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return readInviteTokenFromSearchParams(new URLSearchParams(window.location.search));
  } catch {
    return null;
  }
}

/**
 * Bootstrap token priority: URL `?t=` / `?token=` always wins over localStorage.
 * When URL token differs from stored, stale storage is cleared before validation.
 */
export function resolveBootstrapInviteToken(urlToken: string | null): {
  token: string | null;
  source: InviteTokenSource | null;
  clearedStaleStorage: boolean;
} {
  const stored = loadStoredInviteToken();
  if (urlToken) {
    const clearedStaleStorage = Boolean(stored && stored !== urlToken);
    if (clearedStaleStorage) clearStoredInviteToken();
    return { token: urlToken, source: 'url', clearedStaleStorage };
  }
  if (stored) return { token: stored, source: 'storage', clearedStaleStorage: false };
  return { token: null, source: null, clearedStaleStorage: false };
}

export function readDeprecatedUserParamFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return new URLSearchParams(window.location.search).get('user')?.trim() || null;
  } catch {
    return null;
  }
}

/** True when legacy `?user=` identity is explicitly requested (not invite `?t=`). */
export function hasLegacyStaffUserParamInUrl(): boolean {
  return Boolean(readDeprecatedUserParamFromUrl());
}
