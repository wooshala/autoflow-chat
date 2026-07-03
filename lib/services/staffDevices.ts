import { IS_MOCK } from '@/lib/env';
import { supabaseAdmin } from '@/lib/supabase';
import { getStaffInviteById, resolveInviteUserId, resolveStaffInviteByTokenAny } from '@/lib/services/staffInvites';
import type { StaffInvite } from '@/lib/types';

export type StaffDeviceToken = {
  id: string;
  staff_invite_id: string | null;
  user_id: string | null;
  fcm_token: string;
  platform: 'android' | 'ios';
  device_key: string | null;
  device_label: string | null;
  app_version: string | null;
  user_agent: string | null;
  enabled: boolean;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
};

export type RegisterStaffDeviceInput = {
  inviteToken?: string | null;
  staffInviteId?: string | null;
  userId?: string | null;
  fcmToken: string;
  platform?: string | null;
  deviceKey?: string | null;
  deviceLabel?: string | null;
  appVersion?: string | null;
  userAgent?: string | null;
};

declare global {
  // eslint-disable-next-line no-var
  var __autoflowStaffDeviceTokens: StaffDeviceToken[] | undefined;
}

function nowIso() {
  return new Date().toISOString();
}

function trimOrNull(value: unknown): string | null {
  const s = String(value ?? '').trim();
  return s || null;
}

function mockTokens(): StaffDeviceToken[] {
  if (!globalThis.__autoflowStaffDeviceTokens) globalThis.__autoflowStaffDeviceTokens = [];
  return globalThis.__autoflowStaffDeviceTokens;
}

function normalizePlatform(value: unknown): 'android' | 'ios' {
  const p = String(value || 'android').trim().toLowerCase();
  if (p === 'ios') return 'ios';
  return 'android';
}

async function resolveActiveInvite(input: RegisterStaffDeviceInput): Promise<StaffInvite | null> {
  const inviteId = trimOrNull(input.staffInviteId);
  const inviteToken = trimOrNull(input.inviteToken);
  let invite: StaffInvite | null = null;

  if (inviteId) invite = await getStaffInviteById(inviteId);
  if (!invite && inviteToken) invite = await resolveStaffInviteByTokenAny(inviteToken);
  if (!invite) return null;
  if (!invite.enabled || invite.revoked_at) throw new Error('INVITE_REVOKED');
  return invite;
}

export async function registerStaffDeviceToken(input: RegisterStaffDeviceInput): Promise<StaffDeviceToken> {
  const fcmToken = trimOrNull(input.fcmToken);
  if (!fcmToken) throw new Error('FCM_TOKEN_REQUIRED');
  if (fcmToken.length < 40) throw new Error('FCM_TOKEN_INVALID');

  const invite = await resolveActiveInvite(input);
  const userId = trimOrNull(input.userId) || (invite ? resolveInviteUserId(invite) : null);
  if (!invite && !userId) throw new Error('STAFF_IDENTITY_REQUIRED');

  const row = {
    staff_invite_id: invite?.id ?? null,
    user_id: userId,
    fcm_token: fcmToken,
    platform: normalizePlatform(input.platform),
    device_key: trimOrNull(input.deviceKey),
    device_label: trimOrNull(input.deviceLabel),
    app_version: trimOrNull(input.appVersion),
    user_agent: trimOrNull(input.userAgent),
    enabled: true,
    last_seen_at: nowIso()
  };

  if (IS_MOCK || !supabaseAdmin) {
    const list = mockTokens();
    const existing = list.find((t) => t.fcm_token === fcmToken);
    // Phase 3A: a session/user_id registration (no invite) must not null an
    // existing invite binding on the same fcm_token.
    if (!invite && existing?.staff_invite_id) row.staff_invite_id = existing.staff_invite_id;
    if (existing) {
      Object.assign(existing, row, { updated_at: nowIso() });
      return existing;
    }
    const created: StaffDeviceToken = {
      id: `staff-device-${Date.now()}`,
      ...row,
      created_at: nowIso(),
      updated_at: nowIso()
    };
    list.push(created);
    return created;
  }

  // Phase 3A: a session/user_id registration (no invite) must not null an
  // existing invite binding on the same fcm_token.
  if (!invite) {
    const { data: prev } = await supabaseAdmin
      .from('staff_device_tokens')
      .select('staff_invite_id')
      .eq('fcm_token', fcmToken)
      .maybeSingle();
    if (prev?.staff_invite_id) row.staff_invite_id = prev.staff_invite_id;
  }

  const { data, error } = await supabaseAdmin
    .from('staff_device_tokens')
    .upsert(row, { onConflict: 'fcm_token' })
    .select('*')
    .single();

  if (error) throw error;
  return data as StaffDeviceToken;
}

export async function disableStaffDeviceTokens(fcmTokens: string[], reason: string): Promise<void> {
  const tokens = Array.from(new Set(fcmTokens.map((t) => String(t || '').trim()).filter(Boolean)));
  if (tokens.length === 0) return;
  if (IS_MOCK || !supabaseAdmin) {
    for (const item of mockTokens()) {
      if (tokens.includes(item.fcm_token)) {
        item.enabled = false;
        item.updated_at = nowIso();
      }
    }
    console.log('[STAFF_FCM_TOKEN_DISABLED_MOCK]', { count: tokens.length, reason });
    return;
  }

  const { error } = await supabaseAdmin
    .from('staff_device_tokens')
    .update({ enabled: false, updated_at: nowIso() })
    .in('fcm_token', tokens);
  if (error) throw error;
  console.log('[STAFF_FCM_TOKEN_DISABLED]', { count: tokens.length, reason });
}

export type StaffPushTarget = StaffDeviceToken & {
  staff_invite?: Pick<StaffInvite, 'id' | 'enabled' | 'revoked_at' | 'display_name' | 'role' | 'user_id'> | null;
};

export async function listEnabledStaffPushTargets(): Promise<StaffPushTarget[]> {
  if (IS_MOCK || !supabaseAdmin) {
    return mockTokens().filter((t) => t.enabled);
  }

  const { data, error } = await supabaseAdmin
    .from('staff_device_tokens')
    .select('*, staff_invite:staff_invites(id, enabled, revoked_at, display_name, role, user_id)')
    .eq('enabled', true);

  if (error) throw error;
  return ((data || []) as StaffPushTarget[]).filter((row) => {
    if (!row.staff_invite_id) return true;
    return Boolean(row.staff_invite?.enabled) && !row.staff_invite?.revoked_at;
  });
}
