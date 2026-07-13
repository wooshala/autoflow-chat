/**
 * Phase 1.4 Commit G 순수 검증: localStorage 파싱 + user/auto collapse + preferred/resolved 복원.
 * 실행: npx tsx scripts/verify-chat-panel-storage-logic.ts
 */
import {
  parseStoredPanelWidth,
  parseStoredCollapsed,
  isPanelVisible,
  resolveChatPanelWidths,
  LEFT_DEFAULT,
  LEFT_MIN,
  LEFT_MAX,
  RIGHT_DEFAULT,
  RIGHT_MIN,
  RIGHT_MAX
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
const assert = (name: string, cond: boolean) => eq(name, cond, true);

// --- parseStoredPanelWidth (left 기준 260/200/440) ---
const pw = (raw: string | null | undefined) => parseStoredPanelWidth(raw, LEFT_DEFAULT, LEFT_MIN, LEFT_MAX);
eq('pw:valid-string', pw('260'), 260);
eq('pw:other-valid', pw('320'), 320);
eq('pw:undefined', pw(undefined), LEFT_DEFAULT);
eq('pw:null', pw(null), LEFT_DEFAULT);
eq('pw:empty', pw(''), LEFT_DEFAULT);
eq('pw:nan', pw('NaN'), LEFT_DEFAULT);
eq('pw:garbage', pw('abc'), LEFT_DEFAULT);
eq('pw:infinity', pw('Infinity'), LEFT_DEFAULT);
eq('pw:negative-clamps-min', pw('-1'), LEFT_MIN);
eq('pw:zero-clamps-min', pw('0'), LEFT_MIN);
eq('pw:huge-clamps-max', pw('99999'), LEFT_MAX);

// --- parseStoredCollapsed ---
eq('collapsed:true', parseStoredCollapsed('true'), true);
eq('collapsed:false', parseStoredCollapsed('false'), false);
eq('collapsed:null', parseStoredCollapsed(null), false);
eq('collapsed:garbage', parseStoredCollapsed('yes'), false);

// --- isPanelVisible (user vs auto) ---
eq('vis:user-only', isPanelVisible(true, false), false);
eq('vis:auto-only', isPanelVisible(false, true), false);
eq('vis:both', isPanelVisible(true, true), false);
eq('vis:none', isPanelVisible(false, false), true);

// --- 창 축소/확대: preferred 400/500 ---
const small = resolveChatPanelWidths({ containerWidth: 900, preferredLeftWidth: 400, preferredRightWidth: 500 });
assert('resize:small-auto-right', small.autoCollapsedRight);
assert('resize:small-left-shrunk', small.leftWidth < 400);
const big = resolveChatPanelWidths({ containerWidth: 1600, preferredLeftWidth: 400, preferredRightWidth: 500 });
eq('resize:big-restore-left', big.leftWidth, 400);
eq('resize:big-restore-right', big.rightWidth, 500);
assert('resize:big-no-auto', !big.autoCollapsedLeft && !big.autoCollapsedRight);

// --- 수동 접기는 넓은 창에서도 유지(사용자 우선) ---
const manual = resolveChatPanelWidths({
  containerWidth: 1600,
  preferredLeftWidth: 260,
  preferredRightWidth: 340,
  rightCollapsed: true
});
assert('manual:right-hidden-even-wide', !manual.rightVisible);
eq('manual:right-width-zero', manual.rightWidth, 0);
assert('manual:not-auto', !manual.autoCollapsedRight); // 수동이지 자동 아님

// --- 자동 접기는 입력(user collapse)을 변형하지 않음(비저장 근거) ---
// rightCollapsed=false로 넣어도 auto가 처리 → user 플래그는 caller가 계속 false로 유지 가능.
const autoCase = resolveChatPanelWidths({ containerWidth: 900, preferredLeftWidth: 260, preferredRightWidth: 340 });
assert('auto:right-autocollapsed', autoCase.autoCollapsedRight);
assert('auto:center-protected', autoCase.centerWidth >= 460);

console.log(JSON.stringify({ phase: '1.4', commit: 'G', mode: 'logic', ok: failed === 0, failed }, null, 2));
if (failed > 0) process.exit(1);
