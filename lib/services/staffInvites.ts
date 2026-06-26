import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase';
import { IS_MOCK } from '@/lib/env';
import { getSiteId } from '@/lib/site';
import { resolveUserIdForStaffKey, type StaffUserKey } from '@/lib/auth/staffUsers';
import type { StaffInvite } from '@/lib/types';

declare global {
  // eslint-disable-next-line no-var
  var __autoflowStaffInvites: StaffInvite[] | undefined;
}

export function generateInviteToken(length = 8): string {
  return crypto.randomBytes(12).toString('base64url').replace(/[^a-zA-Z0-9]/g, '').slice(0, length);
}

function mockInvites(): StaffInvite[] {
  if (!globalThis.__autoflowStaffInvites) {
    const now = new Date().toISOString();
    globalThis.__autoflowStaffInvites = [];
  }
  return globalThis.__autoflowStaffInvites!;
}

function roleToStaffKey(role: string, displayName: string): StaffUserKey {
  const r = role.toLowerCase();
  const n = displayName.toLowerCase();
  if (r.includes('2') || r === 'cleaning2' || n.includes('cleaner-2') || n.includes('cleaner2')) return 'cleaner2';
  if (r === 'manager' || r === 'front' || r === 'admin') return 'manager';
  return 'cleaner1';
}

export function resolveInviteUserId(invite: Pick<StaffInvite, 'user_id' | 'role' | 'display_name'>): string | null {
  if (invite.user_id) return invite.user_id;
  return resolveUserIdForStaffKey(roleToStaffKey(invite.role, invite.display_name));
}

export async function listStaffInvites(siteId = getSiteId()): Promise<StaffInvite[]> {
  if (IS_MOCK || !supabaseAdmin) {
    return mockInvites().filter((i) => i.site_id === siteId).sort((a, b) => a.display_name.localeCompare(b.display_name));
  }

  const { data, error } = await supabaseAdmin
    .from('staff_invites')
    .select('*')
    .eq('site_id', siteId)
    .order('display_name', { ascending: true });

  if (error) throw error;
  return (data || []) as StaffInvite[];
}

export async function resolveStaffInviteByToken(token: string, siteId = getSiteId()): Promise<StaffInvite | null> {
  const t = String(token || '').trim();
  if (!t) return null;

  if (IS_MOCK || !supabaseAdmin) {
    return mockInvites().find((i) => i.token === t && i.site_id === siteId && i.enabled) || null;
  }

  const { data, error } = await supabaseAdmin
    .from('staff_invites')
    .select('*')
    .eq('site_id', siteId)
    .eq('token', t)
    .eq('enabled', true)
    .maybeSingle();

  if (error) throw error;
  return (data as StaffInvite) || null;
}

/** Resolve token even when revoked — for blocked-session messaging. */
export async function resolveStaffInviteByTokenAny(token: string, siteId = getSiteId()): Promise<StaffInvite | null> {
  const t = String(token || '').trim();
  if (!t) return null;

  if (IS_MOCK || !supabaseAdmin) {
    return mockInvites().find((i) => i.token === t && i.site_id === siteId) || null;
  }

  const { data, error } = await supabaseAdmin
    .from('staff_invites')
    .select('*')
    .eq('site_id', siteId)
    .eq('token', t)
    .maybeSingle();

  if (error) throw error;
  return (data as StaffInvite) || null;
}

export async function getStaffInviteById(id: string): Promise<StaffInvite | null> {
  if (!id) return null;
  if (IS_MOCK || !supabaseAdmin) {
    return mockInvites().find((i) => i.id === id) || null;
  }
  const { data, error } = await supabaseAdmin.from('staff_invites').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as StaffInvite) || null;
}

export async function isStaffDeviceRevoked(deviceKey: string, siteId = getSiteId()): Promise<boolean> {
  const key = String(deviceKey || '').trim();
  if (!key) return false;
  if (IS_MOCK || !supabaseAdmin) return false;
  const { data, error } = await supabaseAdmin
    .from('staff_revoked_devices')
    .select('device_key')
    .eq('site_id', siteId)
    .eq('device_key', key)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

async function recordRevokedDevice(invite: StaffInvite): Promise<void> {
  const deviceKey = String(invite.device_key || '').trim();
  if (!deviceKey) return;
  if (IS_MOCK || !supabaseAdmin) return;
  await supabaseAdmin.from('staff_revoked_devices').upsert(
    {
      site_id: invite.site_id,
      device_key: deviceKey,
      invite_id: invite.id,
      revoked_at: new Date().toISOString()
    },
    { onConflict: 'site_id,device_key' }
  );
}

/** Kick participant — soft revoke, keep messages/history. */
export async function revokeStaffInvite(id: string): Promise<StaffInvite> {
  const now = new Date().toISOString();
  if (IS_MOCK || !supabaseAdmin) {
    const inv = mockInvites().find((i) => i.id === id);
    if (!inv) throw new Error('NOT_FOUND');
    inv.enabled = false;
    inv.revoked_at = now;
    return inv;
  }

  const existing = await getStaffInviteById(id);
  if (!existing) throw new Error('NOT_FOUND');

  const { data, error } = await supabaseAdmin
    .from('staff_invites')
    .update({ enabled: false, revoked_at: now })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  await recordRevokedDevice(data as StaffInvite);
  return data as StaffInvite;
}

/** Per-device QR reissue — invalidates old link/token. */
export async function rotateStaffInviteToken(id: string): Promise<StaffInvite> {
  const token = generateInviteToken(12);
  if (IS_MOCK || !supabaseAdmin) {
    const inv = mockInvites().find((i) => i.id === id);
    if (!inv) throw new Error('NOT_FOUND');
    inv.token = token;
    inv.enabled = true;
    inv.revoked_at = null;
    return inv;
  }

  const { data, error } = await supabaseAdmin
    .from('staff_invites')
    .update({ token, enabled: true, revoked_at: null })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data as StaffInvite;
}

export async function assertStaffInviteCanSend(tokenId: string | null | undefined): Promise<{ ok: true } | { ok: false; reason: string }> {
  const id = String(tokenId || '').trim();
  if (!id) return { ok: true };
  const invite = await getStaffInviteById(id);
  if (!invite) return { ok: false, reason: 'INVITE_NOT_FOUND' };
  if (!invite.enabled) return { ok: false, reason: 'INVITE_REVOKED' };
  return { ok: true };
}

export async function joinStaffViaEntry(input: {
  entry_token: string;
  display_name: string;
  spoken_lang?: string | null;
  role?: string;
  device_key: string;
  site_id?: string;
}): Promise<StaffInvite> {
  const site_id = input.site_id || getSiteId();
  const device_key = String(input.device_key || '').trim();
  if (!device_key) throw new Error('DEVICE_KEY_REQUIRED');

  if (await isStaffDeviceRevoked(device_key, site_id)) {
    throw new Error('DEVICE_REVOKED');
  }

  const { resolveStaffEntryInviteByToken } = await import('@/lib/services/staffEntryInvites');
  const entry = await resolveStaffEntryInviteByToken(input.entry_token, site_id);
  if (!entry) throw new Error('INVALID_ENTRY_TOKEN');

  return createStaffInvite({
    display_name: input.display_name,
    role: input.role || 'cleaning',
    spoken_lang: input.spoken_lang,
    site_id,
    device_key
  });
}

export async function touchStaffInviteSeen(id: string): Promise<void> {
  const now = new Date().toISOString();
  if (IS_MOCK || !supabaseAdmin) {
    const inv = mockInvites().find((i) => i.id === id);
    if (inv) inv.last_seen_at = now;
    return;
  }
  await supabaseAdmin.from('staff_invites').update({ last_seen_at: now }).eq('id', id);
}

export async function createStaffInvite(input: {
  display_name: string;
  role: string;
  user_id?: string | null;
  spoken_lang?: string | null;
  site_id?: string;
  device_key?: string | null;
}): Promise<StaffInvite> {
  const site_id = input.site_id || getSiteId();
  let token = generateInviteToken();
  const spokenLang = input.spoken_lang?.trim() || null;
  const row = {
    site_id,
    token,
    display_name: input.display_name.trim(),
    role: input.role.trim() || 'cleaning',
    user_id: input.user_id || null,
    spoken_lang: spokenLang,
    device_key: input.device_key?.trim() || null,
    enabled: true
  };

  if (IS_MOCK || !supabaseAdmin) {
    const created: StaffInvite = {
      id: `inv-${Date.now()}`,
      ...row,
      created_at: new Date().toISOString(),
      last_seen_at: null
    };
    mockInvites().push(created);
    return created;
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await supabaseAdmin.from('staff_invites').insert({ ...row, token }).select('*').single();
    if (!error) return data as StaffInvite;
    if (!String(error.message).includes('duplicate')) throw error;
    token = generateInviteToken();
  }
  throw new Error('TOKEN_GENERATION_FAILED');
}

export async function setStaffInviteEnabled(id: string, enabled: boolean): Promise<StaffInvite> {
  if (IS_MOCK || !supabaseAdmin) {
    const inv = mockInvites().find((i) => i.id === id);
    if (!inv) throw new Error('NOT_FOUND');
    inv.enabled = enabled;
    return inv;
  }

  const { data, error } = await supabaseAdmin
    .from('staff_invites')
    .update({ enabled })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data as StaffInvite;
}

/** Update a staff member's work status (available/cleaning/break/outside/off_duty). */
export async function setStaffInviteStatus(id: string, status: string): Promise<StaffInvite> {
  const now = new Date().toISOString();
  if (IS_MOCK || !supabaseAdmin) {
    const inv = mockInvites().find((i) => i.id === id);
    if (!inv) throw new Error('NOT_FOUND');
    inv.current_status = status;
    inv.status_updated_at = now;
    return inv;
  }

  const { data, error } = await supabaseAdmin
    .from('staff_invites')
    .update({ current_status: status, status_updated_at: now })
    .eq('id', id)
    .select('*')
    .single();
  if (error) {
    // Graceful until the migration lands: surface a typed error the route maps.
    if (String(error.message || '').includes('current_status')) {
      const e = new Error('STATUS_COLUMN_MISSING');
      (e as any).code = 'STATUS_COLUMN_MISSING';
      throw e;
    }
    throw error;
  }
  return data as StaffInvite;
}

export function staffInviteUrl(token: string, origin?: string): string {
  const base = origin || (typeof window !== 'undefined' ? window.location.origin : '');
  return `${base}/staff-chat?t=${encodeURIComponent(token)}`;
}
