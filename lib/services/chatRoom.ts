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
    return [];
  }

  const { data, error } = await supabaseAdmin
    .from('chat_room_participants')
    .select('user_id, role, joined_at, users(name)')
    .eq('room_id', roomId)
    .eq('status', 'active')
    .order('joined_at', { ascending: true });

  if (error) throw error;

  const rows = (data || []) as {
    user_id: string;
    role: ChatRoomParticipantListItem['role'];
    joined_at: string;
    users: { name: string } | { name: string }[] | null;
  }[];

  return rows.map((row) => ({
    user_id: row.user_id,
    name: pickUserName(row.users),
    role: row.role,
    joined_at: row.joined_at
  }));
}
