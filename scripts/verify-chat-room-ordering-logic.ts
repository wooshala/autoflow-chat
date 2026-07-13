/**
 * Phase 1.2.6 E 순수 검증: Room Summary 정렬 계약(초기/Realtime 공용 comparator).
 * 실행: npx tsx scripts/verify-chat-room-ordering-logic.ts
 */
import { sortChatRoomSummaries, compareChatRoomSummaries } from '../lib/chat/chatRoomSummaryFormat';
import type { ChatRoomSummary } from '../lib/types';

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

function room(id: string, name: string, createdAt: string | null): ChatRoomSummary {
  return {
    id,
    name,
    participant_count: 0,
    last_message: createdAt
      ? {
          id: `m-${id}`,
          preview: 'x',
          sender_name: null,
          created_at: createdAt,
          message_type: 'text',
          image_url: null,
          is_deleted: false
        }
      : null
  };
}

const ids = (list: ChatRoomSummary[]) => list.map((r) => r.id);

// 1) 시각 DESC + null 뒤
const A = room('a', '가방', '2026-07-13T10:05:00Z');
const B = room('b', '나방', '2026-07-13T09:00:00Z');
const C = room('c', '다방', null);
eq('order:desc-null-last', ids(sortChatRoomSummaries([C, A, B])), ['a', 'b', 'c']);

// 2) 둘 다 null → name ASC
const Alpha = room('z', 'Alpha', null);
const Beta = room('y', 'Beta', null);
eq('order:both-null-name-asc', ids(sortChatRoomSummaries([Beta, Alpha])), ['z', 'y']); // Alpha(z) < Beta(y)

// 3) 동일 timestamp + 동일 name → id ASC
const S1 = room('id2', '같은방', '2026-07-13T10:00:00Z');
const S2 = room('id1', '같은방', '2026-07-13T10:00:00Z');
eq('order:same-ts-name-id-asc', ids(sortChatRoomSummaries([S1, S2])), ['id1', 'id2']);

// 4) invalid timestamp → null 그룹과 동일 후순위(유효 시각 방보다 뒤)
const Valid = room('v', '유효', '2026-07-13T08:00:00Z');
const Invalid = room('i', '무효', 'not-a-date');
eq('order:invalid-ts-after-valid', ids(sortChatRoomSummaries([Invalid, Valid])), ['v', 'i']);
// invalid는 NaN으로 무너지지 않고 결정적 결과
eq('order:invalid-not-nan', Number.isNaN(compareChatRoomSummaries(Invalid, Valid)), false);

// 5) 단일 방 안전
eq('order:single', ids(sortChatRoomSummaries([A])), ['a']);
// 입력 불변(순수)
const input = [C, A, B];
sortChatRoomSummaries(input);
eq('order:input-unchanged', ids(input), ['c', 'a', 'b']);

console.log(JSON.stringify({ phase: '1.2.6', commit: 'E', mode: 'logic', ok: failed === 0, failed }, null, 2));
if (failed > 0) process.exit(1);
