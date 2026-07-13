/**
 * Phase 1.1 순수 로직 검증(DB 불필요): messagePreview + formatChatRoomTime.
 * 실행: npx tsx scripts/verify-chat-room-summary-logic.ts
 */
import { messagePreview, formatChatRoomTime } from '../lib/chat/chatRoomSummaryFormat';

let failed = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = got === want;
  if (!ok) {
    failed++;
    console.error(`FAIL ${name}: got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);
  } else {
    console.log(`ok   ${name}`);
  }
}

// --- preview 규칙 ---
eq('preview:deleted', messagePreview({ is_deleted: true, message_type: 'text', message: 'x' }), '삭제된 메시지');
eq('preview:image', messagePreview({ is_deleted: false, message_type: 'image', message: '' }), '사진');
eq('preview:text', messagePreview({ is_deleted: false, message_type: 'text', message: ' 501호 완료 ' }), '501호 완료');
eq('preview:empty', messagePreview({ is_deleted: false, message_type: 'text', message: '   ' }), '메시지 없음');

// --- 시간 규칙 (KST 기준, now 주입) ---
// 기준 now = 2026-07-13 10:00 KST = 2026-07-13T01:00:00Z
const now = Date.parse('2026-07-13T01:00:00Z');
eq('time:today', formatChatRoomTime('2026-07-13T00:42:00Z', now), '09:42'); // 09:42 KST 같은 날
eq('time:yesterday', formatChatRoomTime('2026-07-12T05:00:00Z', now), '어제'); // 7/12 KST
eq('time:within7', formatChatRoomTime('2026-07-09T05:00:00Z', now), '목요일'); // 7/9 = 4일 전 = 목
eq('time:older', formatChatRoomTime('2026-06-30T05:00:00Z', now), '6/30'); // 그 이전 → M/D
eq('time:invalid', formatChatRoomTime('not-a-date', now), '');

console.log(JSON.stringify({ phase: '1.1', mode: 'logic', ok: failed === 0, failed }, null, 2));
if (failed > 0) process.exit(1);
