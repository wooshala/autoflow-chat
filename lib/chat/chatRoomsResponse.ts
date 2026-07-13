/**
 * Phase 1.2.5 A-3: GET /api/chat/rooms 응답 방어(순수, 테스트 대상).
 * - 응답이 객체인지 / rooms가 배열인지 확인
 * - 각 item 필수 필드 검증(any로 통과 금지)
 * - 잘못된 item은 조용히 정상 room으로 취급하지 않는다
 * - 구조 자체가 손상되면 명시적 error
 * empty(정상 빈 목록)와 error(손상)를 구분해 상위에서 다르게 처리한다.
 */
import type { ChatRoomSummary, ChatRoomLastMessage } from '@/lib/types';
import { isChatRoomUuid } from '@/lib/chat/chatRoomSelection';

export type ChatRoomsResponseStatus = 'ready' | 'empty' | 'error';
export type NormalizedChatRoomsResponse = {
  status: ChatRoomsResponseStatus;
  rooms: ChatRoomSummary[];
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function normalizeLastMessage(v: unknown): ChatRoomLastMessage | null | undefined {
  // null/undefined → 메시지 없음(정상). 값이 있으면 필수 필드 검증, 실패 시 undefined(=item 무효).
  if (v == null) return null;
  if (!isPlainObject(v)) return undefined;
  const id = v.id;
  const preview = v.preview;
  const created_at = v.created_at;
  if (typeof id !== 'string' || !id) return undefined;
  if (typeof preview !== 'string') return undefined;
  if (typeof created_at !== 'string' || !created_at) return undefined;
  return {
    id,
    preview,
    sender_name: typeof v.sender_name === 'string' ? v.sender_name : null,
    created_at,
    message_type: typeof v.message_type === 'string' ? v.message_type : null,
    image_url: typeof v.image_url === 'string' ? v.image_url : null,
    is_deleted: Boolean(v.is_deleted)
  };
}

/** 유효 item이면 정규화된 ChatRoomSummary, 아니면 null(=드롭). */
function normalizeRoomItem(v: unknown): ChatRoomSummary | null {
  if (!isPlainObject(v)) return null;
  if (!isChatRoomUuid(v.id)) return null;
  if (typeof v.name !== 'string' || !v.name) return null;
  if (typeof v.participant_count !== 'number' || !Number.isFinite(v.participant_count)) return null;
  const lm = normalizeLastMessage(v.last_message);
  if (lm === undefined) return null; // last_message가 존재하지만 손상 → item 무효
  return {
    id: String(v.id),
    name: v.name,
    participant_count: v.participant_count,
    last_message: lm
  };
}

export function normalizeChatRoomsResponse(json: unknown): NormalizedChatRoomsResponse {
  if (!isPlainObject(json)) return { status: 'error', rooms: [] };
  const raw = (json as { rooms?: unknown }).rooms;
  if (!Array.isArray(raw)) return { status: 'error', rooms: [] };
  if (raw.length === 0) return { status: 'empty', rooms: [] };

  const rooms: ChatRoomSummary[] = [];
  for (const item of raw) {
    const norm = normalizeRoomItem(item);
    if (norm) rooms.push(norm);
  }
  // 배열은 non-empty였는데 유효 item이 0 → 손상된 응답으로 판단(정상 빈목록과 구분).
  if (rooms.length === 0) return { status: 'error', rooms: [] };
  return { status: 'ready', rooms };
}
