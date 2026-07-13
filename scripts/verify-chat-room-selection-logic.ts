/**
 * Phase 1.2 순수 선택 로직 검증(DB/React 불필요).
 * 실행: npx tsx scripts/verify-chat-room-selection-logic.ts
 */
import {
  resolveInitialSelectedChatRoomId,
  buildChatSearchWithRoom,
  readStoredSelectedRoomId,
  isValidChatRoomSelection,
  shouldAcceptRealtimeRowForRoom
} from '../lib/chat/chatRoomSelection';

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
const C = '33333333-3333-4333-8333-333333333333';
const rooms = [{ id: A }, { id: B }];

// --- resolveInitialSelectedChatRoomId: 우선순위 ---
eq('init:url-first', resolveInitialSelectedChatRoomId({ urlRoomId: B, storedRoomId: A, rooms }), B);
eq('init:stored-when-no-url', resolveInitialSelectedChatRoomId({ urlRoomId: null, storedRoomId: B, rooms }), B);
eq('init:first-fallback', resolveInitialSelectedChatRoomId({ urlRoomId: null, storedRoomId: null, rooms }), A);
// url이 목록에 없으면 무시 → stored → first
eq('init:url-not-in-rooms', resolveInitialSelectedChatRoomId({ urlRoomId: C, storedRoomId: null, rooms }), A);
eq('init:stored-not-in-rooms', resolveInitialSelectedChatRoomId({ urlRoomId: null, storedRoomId: C, rooms }), A);
// 깨진 값 무시
eq('init:garbage-url', resolveInitialSelectedChatRoomId({ urlRoomId: 'not-a-uuid', storedRoomId: null, rooms }), A);
// 빈 목록 → null
eq('init:empty-rooms', resolveInitialSelectedChatRoomId({ urlRoomId: A, storedRoomId: A, rooms: [] }), null);

// --- isValidChatRoomSelection ---
eq('valid:in-rooms', isValidChatRoomSelection(A, rooms), true);
eq('valid:not-in-rooms', isValidChatRoomSelection(C, rooms), false);
eq('valid:garbage', isValidChatRoomSelection('x', rooms), false);
eq('valid:null', isValidChatRoomSelection(null, rooms), false);

// --- readStoredSelectedRoomId ---
eq('stored:valid', readStoredSelectedRoomId(A), A);
eq('stored:empty', readStoredSelectedRoomId(''), null);
eq('stored:garbage', readStoredSelectedRoomId('abc'), null);
eq('stored:null', readStoredSelectedRoomId(null), null);

// --- buildChatSearchWithRoom: 다른 query 보존 ---
eq('url:set-preserve', buildChatSearchWithRoom('?debug=1', A), `?debug=1&chat_room_id=${A}`);
eq('url:replace', buildChatSearchWithRoom(`?chat_room_id=${B}&debug=1`, A), `?chat_room_id=${A}&debug=1`);
eq('url:from-empty', buildChatSearchWithRoom('', A), `?chat_room_id=${A}`);
eq('url:remove-when-null', buildChatSearchWithRoom(`?chat_room_id=${A}&debug=1`, null), '?debug=1');
eq('url:noop-empty', buildChatSearchWithRoom('', null), '');

// --- shouldAcceptRealtimeRowForRoom: §16 null-permissive ---
eq('rt:same-room', shouldAcceptRealtimeRowForRoom(A, A), true);
eq('rt:other-room', shouldAcceptRealtimeRowForRoom(B, A), false);
eq('rt:null-row-permissive', shouldAcceptRealtimeRowForRoom(null, A), true);
eq('rt:empty-row-permissive', shouldAcceptRealtimeRowForRoom('', A), true);
eq('rt:no-selection-accepts-all', shouldAcceptRealtimeRowForRoom(B, null), true);

console.log(JSON.stringify({ phase: '1.2', mode: 'logic', ok: failed === 0, failed }, null, 2));
if (failed > 0) process.exit(1);
