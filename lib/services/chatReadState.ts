import { getMockStore } from '@/lib/mock';
import { supabaseAdmin } from '@/lib/supabase';
import { IS_MOCK } from '@/lib/env';
import { inviteReaderId, pcReaderId } from '@/lib/chat/readerIdentity';
import type { ReadStateMember } from '@/lib/chat/readReceipts';

/** PC /chat console user (the manager) — included in the roster so it can appear
 *  in the read/unread list. NEXT_PUBLIC_* is readable server-side too. */
const MANAGER_USER_ID = (process.env.NEXT_PUBLIC_CHAT_SEND_USER_ID || '').trim();

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

/** Roster (enabled staff + manager) joined with each reader's watermark for a room. */
export async function getReadState(roomId: string | null): Promise<{ members: ReadStateMember[] }> {
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

  const [invitesRes, stateRes] = await Promise.all([
    supabaseAdmin.from('staff_invites').select('id, display_name, role').eq('enabled', true),
    stateQuery
  ]);
  if (invitesRes.error) throw invitesRes.error;
  if (stateRes.error) throw stateRes.error;

  const watermark = new Map<string, string | null>();
  for (const r of stateRes.data || []) watermark.set(String(r.reader_id), r.last_read_at ?? null);

  const members: ReadStateMember[] = [];
  if (MANAGER_USER_ID) {
    const rid = pcReaderId(MANAGER_USER_ID);
    members.push({ reader_id: rid, name: '관리자', role: 'manager', last_read_at: watermark.get(rid) ?? null });
  }
  for (const inv of invitesRes.data || []) {
    const rid = inviteReaderId(String(inv.id));
    members.push({
      reader_id: rid,
      name: (inv.display_name as string) || '직원',
      role: (inv.role as string) ?? null,
      last_read_at: watermark.get(rid) ?? null
    });
  }
  return { members };
}
