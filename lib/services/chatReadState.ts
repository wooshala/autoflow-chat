import { getMockStore } from '@/lib/mock';
import { supabaseAdmin } from '@/lib/supabase';
import { IS_MOCK } from '@/lib/env';
import { resolveUserIdForStaffKey } from '@/lib/auth/staffUsers';
import { pcReaderId } from '@/lib/chat/readerIdentity';
import type { ReadStateMember } from '@/lib/chat/readReceipts';

/** Advance a reader's watermark (monotonic, no-retreat — enforced by the rpc). */
export async function advanceReadState(input: {
  readerId: string;
  roomId: string | null;
  lastReadMessageId: string | null;
  lastReadAt: string;
}): Promise<void> {
  if (IS_MOCK || !supabaseAdmin) return; // local mock: no-op
  const { error } = await supabaseAdmin.rpc('chat_read_advance', {
    p_room: input.roomId,
    p_reader: input.readerId,
    p_at: input.lastReadAt,
    p_msg: input.lastReadMessageId
  });
  if (error) throw error;
}

/**
 * Roster joined with each reader's watermark.
 *
 * Identity is canonical `user:<users.id>` — the same id the PC manager and mobile
 * staff actually send/read with (env-configured chat users). Built from
 * resolveUserIdForStaffKey (manager / cleaner1 / cleaner2) so it matches runtime
 * exactly. Invite-token staff are included only when linked to a users row
 * (user_id) and mapped to user:<user_id>; invites without a user_id are excluded
 * (they can never match a user-based runtime reader → would be phantom "안읽음").
 */
export async function getReadState(
  roomId: string | null,
  debug = false
): Promise<{ members: ReadStateMember[]; _debug?: Record<string, unknown> }> {
  if (IS_MOCK || !supabaseAdmin) {
    const store = getMockStore();
    const members = store.users.map((u) => ({
      reader_id: pcReaderId(u.id),
      name: u.name,
      role: u.role,
      last_read_at: null as string | null
    }));
    return { members };
  }

  let stateQuery = supabaseAdmin.from('chat_read_state').select('reader_id, last_read_at');
  stateQuery = roomId ? stateQuery.eq('room_id', roomId) : stateQuery.is('room_id', null);

  const managerId = resolveUserIdForStaffKey('manager');
  const envIds = (['manager', 'cleaner1', 'cleaner2'] as const)
    .map((k) => resolveUserIdForStaffKey(k))
    .filter((x): x is string => Boolean(x));

  const [usersRes, invitesRes, stateRes] = await Promise.all([
    envIds.length
      ? supabaseAdmin.from('users').select('id, name, role').in('id', envIds)
      : Promise.resolve({ data: [] as { id: string; name: string; role: string }[], error: null }),
    supabaseAdmin.from('staff_invites').select('display_name, role, user_id').eq('enabled', true),
    stateQuery
  ]);
  if (usersRes.error) throw usersRes.error;
  if (invitesRes.error) throw invitesRes.error;
  if (stateRes.error) throw stateRes.error;

  const watermark = new Map<string, string | null>();
  for (const r of stateRes.data || []) watermark.set(String(r.reader_id), r.last_read_at ?? null);

  const usersById = new Map<string, { id: string; name: string; role: string }>();
  for (const u of usersRes.data || []) usersById.set(String(u.id), u as { id: string; name: string; role: string });

  const members: ReadStateMember[] = [];
  const seen = new Set<string>();
  const add = (userId: string, name: string, role: string | null) => {
    const rid = pcReaderId(userId);
    if (seen.has(rid)) return;
    seen.add(rid);
    members.push({ reader_id: rid, name, role: role ?? null, last_read_at: watermark.get(rid) ?? null });
  };

  // Env-configured participants (manager first), names from the users table.
  for (const id of envIds) {
    const u = usersById.get(id);
    const isManager = managerId != null && id === managerId;
    add(id, isManager ? '관리자' : u?.name || '직원', u?.role ?? (isManager ? 'manager' : 'cleaning'));
  }
  // Invite-linked staff only (user_id present), deduped against env participants.
  for (const inv of invitesRes.data || []) {
    const linked = (inv as { user_id?: string | null }).user_id;
    if (linked) add(String(linked), (inv.display_name as string) || '직원', (inv.role as string) ?? null);
  }

  if (debug) {
    return {
      members,
      _debug: {
        envIds,
        managerId,
        stateRowCount: (stateRes.data || []).length,
        stateKeys: (stateRes.data || []).map((r) => String(r.reader_id)),
        rosterRids: members.map((m) => m.reader_id)
      }
    };
  }
  return { members };
}
