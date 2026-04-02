import { supabaseAdmin } from '@/lib/supabase';
import { IS_MOCK } from '@/lib/env';
import type { ChatRoomParticipantListItem } from '@/lib/types';

/** status=active 참가자 + users 이름 조회 (joined_at 오름차순). */
export async function listActiveChatRoomParticipants(
  roomId: string
): Promise<ChatRoomParticipantListItem[]> {
  if (IS_MOCK || !supabaseAdmin) {
    console.log('[ROOM_PARTICIPANTS_DB_QUERY]', { ok: false, skipped: true, reason: IS_MOCK ? 'mock' : 'no_supabase_admin' });
    return [];
  }

  const { data, error } = await supabaseAdmin
    .from('chat_room_participants')
    // NOTE: Some Supabase projects can have stale PostgREST schema cache or missing FK constraints.
    // Avoid embed joins entirely and fetch user names in a second query.
    .select('user_id, role, joined_at')
    .eq('room_id', roomId)
    .eq('status', 'active')
    .order('joined_at', { ascending: true });

  if (error) {
    console.log('[ROOM_PARTICIPANTS_DB_QUERY]', { ok: false, room_id: roomId, error: (error as any).message || String(error) });
    throw error;
  }
  console.log('[ROOM_PARTICIPANTS_DB_QUERY]', { ok: true, room_id: roomId, count: Array.isArray(data) ? data.length : null });

  const rows = (data || []) as {
    user_id: string;
    role: ChatRoomParticipantListItem['role'];
    joined_at: string;
  }[];

  const userIds = Array.from(new Set(rows.map((r) => String(r.user_id || '')).filter(Boolean)));
  const nameById = new Map<string, string>();
  if (userIds.length) {
    const { data: users, error: userErr } = await supabaseAdmin
      .from('users')
      .select('id, name')
      .in('id', userIds);
    if (userErr) {
      console.log('[ROOM_PARTICIPANTS_DB_QUERY_USERS]', {
        ok: false,
        room_id: roomId,
        error: (userErr as any).message || String(userErr)
      });
    } else {
      for (const u of (users || []) as any[]) {
        const id = String(u?.id || '');
        const name = String(u?.name || '');
        if (id) nameById.set(id, name);
      }
    }
  }

  return rows.map((row) => ({
    user_id: row.user_id,
    name: nameById.get(String(row.user_id)) || '',
    role: row.role,
    joined_at: row.joined_at
  }));
}
