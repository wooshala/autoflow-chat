/**
 * Phase 1.4 Commit F 순수 검증: 패널 폭 clamp/resolve/normalize.
 * 실행: npx tsx scripts/verify-chat-panel-sizing-logic.ts
 */
import {
  resolveChatPanelWidths,
  clampLeftWidth,
  clampRightWidth,
  normalizeWidth,
  LEFT_DEFAULT,
  LEFT_MIN,
  LEFT_MAX,
  RIGHT_DEFAULT,
  RIGHT_MIN,
  RIGHT_MAX,
  CENTER_MIN,
  HANDLE_WIDTH
} from '../lib/chat/chatPanelSizing';

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
function assert(name: string, cond: boolean) {
  eq(name, cond, true);
}

// 상수 확인
eq('const:left', [LEFT_DEFAULT, LEFT_MIN, LEFT_MAX], [260, 200, 440]);
eq('const:right', [RIGHT_DEFAULT, RIGHT_MIN, RIGHT_MAX], [340, 270, 560]);
eq('const:center-handle', [CENTER_MIN, HANDLE_WIDTH], [460, 8]);

// 1) 기본값 + 충분한 폭 → 그대로
const wide = resolveChatPanelWidths({ containerWidth: 1600, preferredLeftWidth: 260, preferredRightWidth: 340 });
eq('resolve:wide-left', wide.leftWidth, 260);
eq('resolve:wide-right', wide.rightWidth, 340);
eq('resolve:wide-center', wide.centerWidth, 1600 - 260 - 340 - 16);
assert('resolve:wide-no-autocollapse', !wide.autoCollapsedLeft && !wide.autoCollapsedRight);

// 2) Left clamp
eq('clampLeft:below', clampLeftWidth(100, { containerWidth: 1600, rightWidth: 340, rightVisible: true }), 200);
eq('clampLeft:above', clampLeftWidth(500, { containerWidth: 1600, rightWidth: 340, rightVisible: true }), 440);

// 3) Right clamp
eq('clampRight:below', clampRightWidth(100, { containerWidth: 1600, leftWidth: 260, leftVisible: true }), 270);
eq('clampRight:above', clampRightWidth(700, { containerWidth: 1600, leftWidth: 260, leftVisible: true }), 560);

// 4) 중앙 최소폭 보호 — 양쪽 max 요청이라도 center >= CENTER_MIN
const squeeze = resolveChatPanelWidths({ containerWidth: 1000, preferredLeftWidth: 440, preferredRightWidth: 560 });
assert('resolve:center-protected', squeeze.centerWidth >= CENTER_MIN);
assert('resolve:squeeze-both-visible', squeeze.leftVisible && squeeze.rightVisible);

// 5) 좁은 창(900=EXE 최소) → 오른쪽 auto-collapse, 중앙 최소폭 유지
const narrow = resolveChatPanelWidths({ containerWidth: 900, preferredLeftWidth: 260, preferredRightWidth: 340 });
assert('resolve:narrow-auto-right', narrow.autoCollapsedRight);
eq('resolve:narrow-right-zero', narrow.rightWidth, 0);
assert('resolve:narrow-center-min', narrow.centerWidth >= CENTER_MIN);

// 6) 선호 폭 복원 — 작은 창에서 resolved<preferred, 큰 창에서 preferred 그대로
const small = resolveChatPanelWidths({ containerWidth: 700, preferredLeftWidth: 400, preferredRightWidth: 340 });
const big = resolveChatPanelWidths({ containerWidth: 1600, preferredLeftWidth: 400, preferredRightWidth: 340 });
assert('resolve:small-clamped', small.leftWidth < 400);
eq('resolve:big-restores-preferred', big.leftWidth, 400);

// 7) collapse → width 0
const lc = resolveChatPanelWidths({ containerWidth: 1600, preferredLeftWidth: 260, preferredRightWidth: 340, leftCollapsed: true });
eq('resolve:left-collapsed', lc.leftWidth, 0);
assert('resolve:left-collapsed-invisible', !lc.leftVisible);
const rc = resolveChatPanelWidths({ containerWidth: 1600, preferredLeftWidth: 260, preferredRightWidth: 340, rightCollapsed: true });
eq('resolve:right-collapsed', rc.rightWidth, 0);

// 8) normalizeWidth 방어값
eq('norm:undefined', normalizeWidth(undefined, 260, 200, 440), 260);
eq('norm:string', normalizeWidth('abc', 260, 200, 440), 260);
eq('norm:nan', normalizeWidth(NaN, 260, 200, 440), 260);
eq('norm:negative', normalizeWidth(-100, 260, 200, 440), 200);
eq('norm:zero', normalizeWidth(0, 260, 200, 440), 200);
eq('norm:huge', normalizeWidth(99999, 260, 200, 440), 440);
eq('norm:valid', normalizeWidth(350, 260, 200, 440), 350);

console.log(JSON.stringify({ phase: '1.4', commit: 'F', mode: 'logic', ok: failed === 0, failed }, null, 2));
if (failed > 0) process.exit(1);
