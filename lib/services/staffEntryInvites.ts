import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase';
import { IS_MOCK } from '@/lib/env';
import { getSiteId } from '@/lib/site';
import type { StaffEntryInvite } from '@/lib/types';

declare global {
  // eslint-disable-next-line no-var
  var __autoflowStaffEntryInvites: StaffEntryInvite[] | undefined;
}

function mockEntries(): StaffEntryInvite[] {
  if (!globalThis.__autoflowStaffEntryInvites) {
    globalThis.__autoflowStaffEntryInvites = [];
  }
  return globalThis.__autoflowStaffEntryInvites!;
}

function generateToken(): string {
  return crypto.randomBytes(12).toString('base64url').replace(/[^a-zA-Z0-9]/g, '').slice(0, 16);
}

export async function getActiveStaffEntryInvite(siteId = getSiteId()): Promise<StaffEntryInvite | null> {
  if (IS_MOCK || !supabaseAdmin) {
    return mockEntries().find((e) => e.site_id === siteId && e.status === 'active') || null;
  }
  const { data, error } = await supabaseAdmin
    .from('staff_entry_invites')
    .select('*')
    .eq('site_id', siteId)
    .eq('status', 'active')
    .maybeSingle();
  if (error) throw error;
  return (data as StaffEntryInvite) || null;
}

export async function resolveStaffEntryInviteByToken(token: string, siteId = getSiteId()): Promise<StaffEntryInvite | null> {
  const t = String(token || '').trim();
  if (!t) return null;
  if (IS_MOCK || !supabaseAdmin) {
    return mockEntries().find((e) => e.token === t && e.site_id === siteId && e.status === 'active') || null;
  }
  const { data, error } = await supabaseAdmin
    .from('staff_entry_invites')
    .select('*')
    .eq('site_id', siteId)
    .eq('token', t)
    .eq('status', 'active')
    .maybeSingle();
  if (error) throw error;
  return (data as StaffEntryInvite) || null;
}

/** Revoke current entry QR and issue a new active token. */
export async function rotateStaffEntryInvite(siteId = getSiteId()): Promise<StaffEntryInvite> {
  const now = new Date().toISOString();
  if (IS_MOCK || !supabaseAdmin) {
    for (const e of mockEntries()) {
      if (e.site_id === siteId && e.status === 'active') {
        e.status = 'revoked';
        e.revoked_at = now;
      }
    }
    const created: StaffEntryInvite = {
      id: `entry-${Date.now()}`,
      site_id: siteId,
      token: generateToken(),
      status: 'active',
      created_at: now,
      revoked_at: null
    };
    mockEntries().push(created);
    return created;
  }

  await supabaseAdmin
    .from('staff_entry_invites')
    .update({ status: 'revoked', revoked_at: now })
    .eq('site_id', siteId)
    .eq('status', 'active');

  let token = generateToken();
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await supabaseAdmin
      .from('staff_entry_invites')
      .insert({ site_id: siteId, token, status: 'active' })
      .select('*')
      .single();
    if (!error) return data as StaffEntryInvite;
    if (!String(error.message).includes('duplicate')) throw error;
    token = generateToken();
  }
  throw new Error('ENTRY_TOKEN_GENERATION_FAILED');
}

export function staffEntryInviteUrl(token: string, origin?: string): string {
  const base = origin || (typeof window !== 'undefined' ? window.location.origin : '');
  return `${base}/staff-chat?join=${encodeURIComponent(token)}`;
}
