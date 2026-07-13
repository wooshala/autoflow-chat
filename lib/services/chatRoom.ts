import { supabaseAdmin } from '@/lib/supabase';
import { IS_MOCK } from '@/lib/env';
import { isUuid } from '@/lib/ops-events/guard';
import {
  resolveDefaultChatRoomId,
  SEEDED_DEFAULT_CHAT_ROOM_ID
} from '@/lib/chat/chatRoomDefaults';
import { messagePreview } from '@/lib/chat/chatRoomSummaryFormat';
import { isChatRoomLastMessagesFunctionMissing } from '@/lib/chat/chatRoomsRpcError';
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

export type ChatRoomSummarySource = 'rpc' | 'legacy';
type LastMessagesResult = {
  map: Map<string, ChatRoomLastMessage>;
  source: ChatRoomSummarySource;
  /** legacy(버그 쿼리) 경로로 강등됐는지 — 관측성. RPC 성공만 false. */
  degraded: boolean;
};

/**
 * 방별 최신 메시지 1건. 방 수와 무관하게 단일 조회.
 * 1순위: DISTINCT ON RPC get_chat_room_last_messages(방별 최신, 조용한 방 누락 없음) → source 'rpc'.
 * 폴백: legacy 전체합산 쿼리(다중방+조용한방에서 누락 가능) → source 'legacy', degraded true.
 *   - 함수 미존재(마이그레이션 미적용)만 기대된 상황(warn). 그 외 RPC 오류/ malformed는 실제 결함(error).
 *   - 어떤 경우든 조용히 "정상"으로 오인되지 않도록 source/degraded로 관측 가능하게 노출한다.
 */
async function fetchLastMessagesByRoom(ids: string[]): Promise<LastMessagesResult> {
  const map = new Map<string, ChatRoomLastMessage>();
  if (!supabaseAdmin || ids.length === 0) return { map, source: 'rpc', degraded: false };

  const { data, error } = await supabaseAdmin.rpc('get_chat_room_last_messages', { p_room_ids: ids });
  if (!error && Array.isArray(data)) {
    for (const m of data as any[]) {
      const rid = String(m?.chat_room_id || '');
      if (!rid || map.has(rid)) continue;
      map.set(rid, mapLastMessage(m));
    }
    return { map, source: 'rpc', degraded: false };
  }

  // 오류 분류: 함수 미존재(기대) vs 실제 결함(권한/타임아웃/파라미터/malformed 등).
  // error가 null인데 data가 배열이 아닌 경우(malformed)도 여기로 오며 결함으로 취급한다.
  const missing = isChatRoomLastMessagesFunctionMissing(error);
  if (missing) {
    console.warn('[CHAT_ROOM_LAST_MSG_FALLBACK]', {
      reason: 'function_missing_migration_not_applied',
      room_count: ids.length,
      note: 'get_chat_room_last_messages 마이그레이션 미적용 — legacy로 degraded'
    });
  } else {
    console.error('[CHAT_ROOM_LAST_MSG_RPC_ERROR]', {
      code: (error as any)?.code ?? null,
      reason: (error as any)?.message || (Array.isArray(data) ? 'unknown' : 'malformed_rpc_result'),
      room_count: ids.length,
      note: 'RPC 실제 결함 — legacy로 degraded(정상 RPC로 오인 금지)'
    });
  }

  const { data: msgData, error: msgErr } = await supabaseAdmin
    .from('chat_messages')
    .select('id, chat_room_id, message, message_type, image_url, is_deleted, created_at, user:users(name)')
    .in('chat_room_id', ids)
    .order('created_at', { ascending: false })
    .limit(ids.length * 20);
  if (msgErr) throw msgErr;
  for (const m of (msgData || []) as any[]) {
    const rid = String(m?.chat_room_id || '');
    if (!rid || map.has(rid)) continue;
    map.set(rid, mapLastMessage(m));
  }
  return { map, source: 'legacy', degraded: true };
}

/**
 * 카카오톡형 왼쪽 목록용 채팅방 요약.
 * TEMP ACCESS POLICY (Phase 1.1): membership 인증 구조가 아직 없어 service-role 무제한 노출을 피하기 위해
 *   canonical default room(청소팀 단체방)만 반환한다. 타입/구조는 여러 방을 지원한다.
 * 성능: 방마다 반복 쿼리 없음. 고정 3쿼리(방 / active 참가자 / 최근 메시지) + 클라 집계. unread 없음.
 * 반환에 summary_source/degraded를 포함해 어떤 최근메시지 경로(rpc/legacy)가 실행됐는지 관측 가능.
 */
export type ListChatRoomSummariesResult = {
  rooms: ChatRoomSummary[];
  summarySource: ChatRoomSummarySource;
  degraded: boolean;
};

export async function listChatRoomSummaries(): Promise<ListChatRoomSummariesResult> {
  if (IS_MOCK || !supabaseAdmin) return { rooms: [], summarySource: 'rpc', degraded: false };

  const defaultId = resolveDefaultChatRoomId();

  // Q1: 방 목록(현재는 default room으로 제한)
  const { data: roomsData, error: roomsErr } = await supabaseAdmin
    .from('chat_rooms')
    .select('id, name')
    .eq('id', defaultId);
  if (roomsErr) throw roomsErr;
  const rooms = roomsData || [];
  if (rooms.length === 0) return { rooms: [], summarySource: 'rpc', degraded: false };
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

  // Q3: 방별 최신 메시지 1건(방 수와 무관하게 단일 조회, 조용한 방 누락 없음).
  const last = await fetchLastMessagesByRoom(ids);

  const summaries: ChatRoomSummary[] = rooms.map((r: any) => ({
    id: String(r.id),
    name: String(r.name || '기본 대화방'),
    participant_count: countByRoom.get(String(r.id)) || 0,
    last_message: last.map.get(String(r.id)) || null
  }));

  return { rooms: summaries, summarySource: last.source, degraded: last.degraded };
}
