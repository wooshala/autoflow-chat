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
  site_id?: string;
}): Promise<StaffInvite> {
  const site_id = input.site_id || getSiteId();
  let token = generateInviteToken();
  const row = {
    site_id,
    token,
    display_name: input.display_name.trim(),
    role: input.role.trim() || 'cleaning',
    user_id: input.user_id || null,
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

export function staffInviteUrl(token: string, origin?: string): string {
  const base = origin || (typeof window !== 'undefined' ? window.location.origin : '');
  return `${base}/staff-chat?t=${encodeURIComponent(token)}`;
}
