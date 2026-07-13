/**
 * Phase 1.2 순수 선택 로직 (DB/React 불필요, 테스트 대상).
 * selectedChatRoomId 초기값 결정 + URL query 보존 + localStorage 값 검증.
 *
 * 개념 분리(절대): 여기서 다루는 값은 messenger 방 UUID(chat_room_id)이며
 * hotel 객실번호(room_no)와 절대 혼용하지 않는다.
 */

/** 선택된 방을 브라우저에 보존하는 localStorage 키 (버전 고정). */
export const CHAT_SELECTED_ROOM_STORAGE_KEY = 'autoflow_chat_selected_room_v1';

/** URL/localStorage에서 방을 식별하는 query key. */
export const CHAT_ROOM_QUERY_KEY = 'chat_room_id';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isChatRoomUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value.trim());
}

/** 방 목록에 존재하는 유효한 선택인지. */
export function isValidChatRoomSelection(
  id: string | null | undefined,
  rooms: { id: string }[]
): id is string {
  if (!isChatRoomUuid(id)) return false;
  return rooms.some((r) => String(r.id) === id);
}

/**
 * localStorage raw 값을 검증해 UUID면 반환, 아니면 null.
 * (빈 문자열/깨진 값/비UUID는 무시)
 */
export function readStoredSelectedRoomId(raw: string | null | undefined): string | null {
  if (!isChatRoomUuid(raw)) return null;
  return (raw as string).trim();
}

/**
 * 초기 selectedChatRoomId 결정.
 * 우선순위: URL query → localStorage → API 첫 방 → canonical default.
 * - 후보는 반드시 rooms에 존재해야 채택(존재하지 않으면 다음 후보로).
 * - rooms가 비면 null.
 */
export function resolveInitialSelectedChatRoomId(input: {
  urlRoomId?: string | null;
  storedRoomId?: string | null;
  rooms: { id: string }[];
  defaultRoomId?: string | null;
}): string | null {
  const { urlRoomId, storedRoomId, rooms, defaultRoomId } = input;
  if (!rooms.length) return null;

  // 1) URL, 2) localStorage — rooms에 존재할 때만 채택
  for (const candidate of [urlRoomId, storedRoomId]) {
    if (isValidChatRoomSelection(candidate, rooms)) return candidate;
  }
  // 3) API 첫 방
  const first = rooms[0]?.id ? String(rooms[0].id) : null;
  if (first) return first;
  // 4) canonical default (rooms에 있을 때만; 사실상 도달하지 않음)
  if (isValidChatRoomSelection(defaultRoomId, rooms)) return defaultRoomId;
  return null;
}

/**
 * 현재 search string(예: "?a=1&debug=1")에 chat_room_id를 세팅하되
 * 다른 query는 보존한다. 결과는 "?..."(빈 경우 "") 형태.
 * roomId가 falsy면 chat_room_id 제거.
 */
export function buildChatSearchWithRoom(currentSearch: string, roomId: string | null): string {
  const params = new URLSearchParams(currentSearch.startsWith('?') ? currentSearch.slice(1) : currentSearch);
  if (roomId && isChatRoomUuid(roomId)) {
    params.set(CHAT_ROOM_QUERY_KEY, roomId);
  } else {
    params.delete(CHAT_ROOM_QUERY_KEY);
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/**
 * §16 임시 방어: Realtime 수신 행을 현재 방 타임라인에 반영할지.
 * null-permissive — chat_room_id가 없는(구 행/미지정) 수신은 절대 드롭하지 않고,
 * 명시적으로 다른 방인 경우에만 필터한다(모바일 메시지 유실 방지).
 * 엄격한 방 격리는 Phase 1.3에서 구현.
 */
export function shouldAcceptRealtimeRowForRoom(
  rowChatRoomId: string | null | undefined,
  selectedChatRoomId: string | null | undefined
): boolean {
  if (rowChatRoomId == null || rowChatRoomId === '') return true;
  if (!selectedChatRoomId) return true;
  return String(rowChatRoomId) === String(selectedChatRoomId);
}
