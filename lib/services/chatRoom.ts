import { supabaseAdmin } from '@/lib/supabase';
import { IS_MOCK } from '@/lib/env';
import type { ChatRoomParticipantListItem } from '@/lib/types';

function pickUserName(users: { name: string } | { name: string }[] | null | undefined): string {
  if (!users) return '';
  if (Array.isArray(users)) return users[0]?.name ?? '';
  return users.name ?? '';
}

/** status=active 참가자 + users 이름 조회 (joined_at 오름차순). PostgREST embed `users(name)`. */
export async function listActiveChatRoomParticipants(
  roomId: string
): Promise<ChatRoomParticipantListItem[]> {
  if (IS_MOCK || !supabaseAdmin) {
    console.log('[ROOM_PARTICIPANTS_DB_QUERY]', { ok: false, skipped: true, reason: IS_MOCK ? 'mock' : 'no_supabase_admin' });
    return [];
  }

  const { data, error } = await supabaseAdmin
    .from('chat_room_participants')
    // match embed style used elsewhere (`user:users(...)`) to avoid missing relationship errors
    .select('user_id, role, joined_at, user:users(name)')
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
    user: { name: string } | { name: string }[] | null;
  }[];

  return rows.map((row) => ({
    user_id: row.user_id,
    name: pickUserName(row.user),
    role: row.role,
    joined_at: row.joined_at
  }));
}
