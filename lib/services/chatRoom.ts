import { supabaseAdmin } from '@/lib/supabase';
import { IS_MOCK } from '@/lib/env';
import { isUuid } from '@/lib/ops-events/guard';
import {
  resolveDefaultChatRoomId,
  SEEDED_DEFAULT_CHAT_ROOM_ID
} from '@/lib/chat/chatRoomDefaults';
import { messagePreview } from '@/lib/chat/chatRoomSummaryFormat';
import type {
  ChatRoom,
  ChatRoomParticipantListItem,
  ChatRoomLastMessage,
  ChatRoomSummary
} from '@/lib/types';

export {
  resolveDefaultChatRoomId,
  SEEDED_DEFAULT_CHAT_ROOM_ID,
  SEEDED_DEFAULT_CHAT_ROOM_NAME,
  parseOptionalChatRoomId,
  DefaultChatRoomConfigError,
  resolveDefaultChatRoomIdFromEnv
} from '@/lib/chat/chatRoomDefaults';

export async function getChatRoomById(roomId: string): Promise<ChatRoom | null> {
  if (!roomId || !isUuid(roomId)) return null;
  if (IS_MOCK || !supabaseAdmin) return null;

  const { data, error } = await supabaseAdmin
    .from('chat_rooms')
    .select('id, name, created_at')
    .eq('id', roomId)
    .maybeSingle();

  if (error) throw error;
  return (data as ChatRoom | null) ?? null;
}

export async function getDefaultChatRoom(): Promise<ChatRoom | null> {
  return getChatRoomById(resolveDefaultChatRoomId());
}

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

function mapLastMessage(m: any): ChatRoomLastMessage {
  return {
    id: String(m?.id ?? ''),
    preview: messagePreview({
      is_deleted: m?.is_deleted,
      message_type: m?.message_type,
      message: m?.message
    }),
    // chat_messages → users 임베드(sender 이름). 실패 대비 null 폴백.
    sender_name: (m?.user?.name ?? m?.sender_name) || null,
    created_at: String(m?.created_at ?? ''),
    message_type: m?.message_type ?? null,
    image_url: m?.image_url ?? null,
    is_deleted: Boolean(m?.is_deleted)
  };
}

/**
 * 카카오톡형 왼쪽 목록용 채팅방 요약.
 * TEMP ACCESS POLICY (Phase 1.1): membership 인증 구조가 아직 없어 service-role 무제한 노출을 피하기 위해
 *   canonical default room(청소팀 단체방)만 반환한다. 타입/구조는 여러 방을 지원한다.
 * 성능: 방마다 반복 쿼리 없음. 고정 3쿼리(방 / active 참가자 / 최근 메시지) + 클라 집계. unread 없음.
 */
export async function listChatRoomSummaries(): Promise<ChatRoomSummary[]> {
  if (IS_MOCK || !supabaseAdmin) return [];

  const defaultId = resolveDefaultChatRoomId();

  // Q1: 방 목록(현재는 default room으로 제한)
  const { data: roomsData, error: roomsErr } = await supabaseAdmin
    .from('chat_rooms')
    .select('id, name')
    .eq('id', defaultId);
  if (roomsErr) throw roomsErr;
  const rooms = roomsData || [];
  if (rooms.length === 0) return [];
  const ids = rooms.map((r: any) => String(r.id));

  // Q2: active 참가자 수(방 반복 없이 IN 1회 후 클라 집계)
  const { data: partData, error: partErr } = await supabaseAdmin
    .from('chat_room_participants')
    .select('room_id')
    .in('room_id', ids)
    .eq('status', 'active');
  if (partErr) throw partErr;
  const countByRoom = new Map<string, number>();
  for (const p of partData || []) {
    const rid = String((p as any).room_id || '');
    if (rid) countByRoom.set(rid, (countByRoom.get(rid) || 0) + 1);
  }

  // Q3: 최근 메시지(created_at DESC로 IN 1회 → 방별 첫 건). chat_messages_chat_room_id_created_at_idx 활용.
  const { data: msgData, error: msgErr } = await supabaseAdmin
    .from('chat_messages')
    .select('id, chat_room_id, message, message_type, image_url, is_deleted, created_at, user:users(name)')
    .in('chat_room_id', ids)
    .order('created_at', { ascending: false })
    .limit(ids.length * 20);
  if (msgErr) throw msgErr;
  const lastByRoom = new Map<string, ChatRoomLastMessage>();
  for (const m of (msgData || []) as any[]) {
    const rid = String(m?.chat_room_id || '');
    if (!rid || lastByRoom.has(rid)) continue;
    lastByRoom.set(rid, mapLastMessage(m));
  }

  return rooms.map((r: any) => ({
    id: String(r.id),
    name: String(r.name || '기본 대화방'),
    participant_count: countByRoom.get(String(r.id)) || 0,
    last_message: lastByRoom.get(String(r.id)) || null
  }));
}
