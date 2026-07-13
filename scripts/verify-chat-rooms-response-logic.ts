/**
 * Phase 1.2.5 A-3 순수 검증: GET /api/chat/rooms 응답 방어.
 * 실행: npx tsx scripts/verify-chat-rooms-response-logic.ts
 */
import { normalizeChatRoomsResponse } from '../lib/chat/chatRoomsResponse';

let failed = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) {
    failed++;
    console.error(`FAIL ${name}: got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);
  } else {
    console.log(`ok   ${name}`);
  }
}

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

const goodRoom = (id: string, name: string) => ({
  id,
  name,
  participant_count: 3,
  last_message: {
    id: 'm1',
    preview: '안녕',
    sender_name: '홍길동',
    created_at: '2026-07-13T00:00:00Z',
    message_type: 'text',
    image_url: null,
    is_deleted: false
  }
});

// --- 정상 ---
eq(
  'ready:valid',
  normalizeChatRoomsResponse({ rooms: [goodRoom(A, '청소팀'), { id: B, name: '검증방', participant_count: 0, last_message: null }] }).status,
  'ready'
);
eq(
  'ready:count',
  normalizeChatRoomsResponse({ rooms: [goodRoom(A, '청소팀')] }).rooms.length,
  1
);

// --- empty(정상 빈 목록) vs error(손상) 구분 ---
eq('empty:zero-rooms', normalizeChatRoomsResponse({ rooms: [] }).status, 'empty');
eq('error:not-object', normalizeChatRoomsResponse(null).status, 'error');
eq('error:string', normalizeChatRoomsResponse('boom').status, 'error');
eq('error:rooms-not-array', normalizeChatRoomsResponse({ rooms: 'x' }).status, 'error');
eq('error:rooms-missing', normalizeChatRoomsResponse({ foo: 1 }).status, 'error');

// --- 잘못된 item ---
// 전부 무효(비UUID id) → non-empty였는데 유효 0 → error
eq(
  'error:all-bad-items',
  normalizeChatRoomsResponse({ rooms: [{ id: 'not-uuid', name: 'x', participant_count: 1, last_message: null }] }).status,
  'error'
);
// 혼합: 유효 1 + 무효 1 → 무효 드롭, ready 1건
const mixed = normalizeChatRoomsResponse({
  rooms: [goodRoom(A, '청소팀'), { id: 'bad', name: 'x', participant_count: 1, last_message: null }]
});
eq('mixed:status-ready', mixed.status, 'ready');
eq('mixed:drops-bad', mixed.rooms.length, 1);
eq('mixed:keeps-good', mixed.rooms[0]?.id, A);

// last_message 존재하지만 손상(id 없음) → item 무효 → 유효 0 → error
eq(
  'error:bad-last-message',
  normalizeChatRoomsResponse({ rooms: [{ id: A, name: '방', participant_count: 1, last_message: { preview: 'x' } }] }).status,
  'error'
);
// participant_count 누락 → item 무효
eq(
  'error:missing-count',
  normalizeChatRoomsResponse({ rooms: [{ id: A, name: '방', last_message: null }] }).status,
  'error'
);

console.log(JSON.stringify({ phase: '1.2.5', mode: 'logic', ok: failed === 0, failed }, null, 2));
if (failed > 0) process.exit(1);
