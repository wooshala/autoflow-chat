import type { StaffInvite } from '@/lib/types';

export const STAFF_INVITE_TOKEN_STORAGE_KEY = 'autoflow_staff_invite_token_v1';

export type StaffInviteSession = {
  inviteId: string;
  token: string;
  displayName: string;
  role: string;
  userId: string | null;
  siteId: string;
};

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

export function inviteToSession(invite: StaffInvite, userId: string | null): StaffInviteSession {
  return {
    inviteId: invite.id,
    token: invite.token,
    displayName: invite.display_name,
    role: invite.role,
    userId,
    siteId: invite.site_id
  };
}

export function readInviteTokenFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return new URLSearchParams(window.location.search).get('t')?.trim() || null;
  } catch {
    return null;
  }
}

export function readDeprecatedUserParamFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return new URLSearchParams(window.location.search).get('user')?.trim() || null;
  } catch {
    return null;
  }
}
