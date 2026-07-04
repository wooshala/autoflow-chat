import { IS_MOCK } from '@/lib/env';
import { supabaseAdmin } from '@/lib/supabase';
import { getStaffInviteById, isStaffInviteActive, resolveInviteUserId, resolveStaffInviteByTokenAny } from '@/lib/services/staffInvites';
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

type SupabaseErrorLike = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

function throwSupabaseError(error: SupabaseErrorLike, phase: string): never {
  console.error('[STAFF_DEVICE_REGISTER]', {
    phase,
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint
  });
  throw new Error(
    JSON.stringify({
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint
    })
  );
}

async function resolveActiveInvite(input: RegisterStaffDeviceInput): Promise<StaffInvite | null> {
  const inviteId = trimOrNull(input.staffInviteId);
  const inviteToken = trimOrNull(input.inviteToken);
  let invite: StaffInvite | null = null;

  if (inviteId) invite = await getStaffInviteById(inviteId);
  if (!invite && inviteToken) invite = await resolveStaffInviteByTokenAny(inviteToken);
  if (!invite) return null;
  if (!isStaffInviteActive(invite)) throw new Error('INVITE_REVOKED');
  return invite;
}

export async function registerStaffDeviceToken(input: RegisterStaffDeviceInput): Promise<StaffDeviceToken> {
  const inviteTokenRaw = trimOrNull(input.inviteToken);
  const deviceKeyRaw = trimOrNull(input.deviceKey);
  const platform = normalizePlatform(input.platform);

  console.log('[STAFF_DEVICE_REGISTER]', { phase: 'register_start' });
  console.log('[STAFF_DEVICE_REGISTER]', {
    phase: 'input_summary',
    hasInviteToken: Boolean(inviteTokenRaw),
    inviteTokenPrefix: inviteTokenRaw ? inviteTokenRaw.slice(0, 8) : null,
    fcmTokenLength: String(input.fcmToken ?? '').trim().length,
    fcmTokenPrefix: String(input.fcmToken ?? '').trim().slice(0, 12) || null,
    platform,
    hasDeviceKey: Boolean(deviceKeyRaw)
  });

  const fcmToken = trimOrNull(input.fcmToken);
  if (!fcmToken) throw new Error('FCM_TOKEN_REQUIRED');
  if (fcmToken.length < 40) throw new Error('FCM_TOKEN_INVALID');

  const invite = await resolveActiveInvite(input);
  console.log('[STAFF_DEVICE_REGISTER]', {
    phase: 'staff_invite_lookup',
    found: Boolean(invite),
    staffInviteId: invite?.id ?? null
  });

  const userId = trimOrNull(input.userId) || (invite ? resolveInviteUserId(invite) : null);
  console.log('[STAFF_DEVICE_REGISTER]', {
    phase: 'identity_resolved',
    staffInviteId: invite?.id ?? null,
    userId: userId ?? null
  });

  if (!invite && !userId) throw new Error('STAFF_IDENTITY_REQUIRED');

  const row = {
    staff_invite_id: invite?.id ?? null,
    user_id: userId,
    fcm_token: fcmToken,
    platform,
    device_key: deviceKeyRaw,
    device_label: trimOrNull(input.deviceLabel),
    app_version: trimOrNull(input.appVersion),
    user_agent: trimOrNull(input.userAgent),
    enabled: true,
    last_seen_at: nowIso()
  };

  if (IS_MOCK || !supabaseAdmin) {
    const list = mockTokens();
    const existing = list.find((t) => t.fcm_token === fcmToken);
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

  console.log('[STAFF_DEVICE_REGISTER]', {
    phase: 'upsert_start',
    payloadKeys: Object.keys(row)
  });

  const { data, error } = await supabaseAdmin
    .from('staff_device_tokens')
    .upsert(row, { onConflict: 'fcm_token' })
    .select('*')
    .single();

  if (error) throwSupabaseError(error, 'upsert_failed');
  console.log('[STAFF_DEVICE_REGISTER]', {
    phase: 'upsert_success',
    deviceId: data?.id ?? null,
    enabled: data?.enabled ?? true,
    user_id_prefix: userId ? String(userId).slice(0, 8) : null,
    device_key: deviceKeyRaw
  });
  return data as StaffDeviceToken;
}

export async function disableStaffDevicesForUser(
  userId: string,
  opts?: { deviceKey?: string | null; fcmToken?: string | null }
): Promise<number> {
  const uid = String(userId || '').trim();
  if (!uid) return 0;
  const deviceKey = opts?.deviceKey ? String(opts.deviceKey).trim() : null;
  const fcmToken = opts?.fcmToken ? String(opts.fcmToken).trim() : null;

  if (IS_MOCK || !supabaseAdmin) {
    let count = 0;
    for (const item of mockTokens()) {
      if (String(item.user_id || '') !== uid) continue;
      if (deviceKey && String(item.device_key || '') !== deviceKey) continue;
      if (fcmToken && item.fcm_token !== fcmToken) continue;
      if (item.enabled) {
        item.enabled = false;
        item.updated_at = nowIso();
        count += 1;
      }
    }
    console.log('[STAFF_FCM_TOKEN_DISABLED_MOCK]', { count, reason: 'logout', user_id_prefix: uid.slice(0, 8) });
    return count;
  }

  let query = supabaseAdmin
    .from('staff_device_tokens')
    .update({ enabled: false, updated_at: nowIso() })
    .eq('user_id', uid)
    .eq('enabled', true);

  if (deviceKey) query = query.eq('device_key', deviceKey);
  if (fcmToken) query = query.eq('fcm_token', fcmToken);

  const { data, error } = await query.select('id');
  if (error) throw error;
  const count = (data || []).length;
  console.log('[STAFF_FCM_TOKEN_DISABLED]', { count, reason: 'logout', user_id_prefix: uid.slice(0, 8) });
  return count;
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
