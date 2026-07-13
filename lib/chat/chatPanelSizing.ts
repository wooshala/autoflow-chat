/**
 * Phase 1.4 좌·우 패널 폭 계산(순수, DOM/React 의존 없음 → 단위 테스트 가능).
 * 레이아웃 전용: 메시지/Realtime/selectedChatRoomId와 무관.
 *
 * 불변식: leftWidth + rightWidth + handleWidths + CENTER_MIN <= containerWidth
 *   (확보 불가 시 오른쪽 → 왼쪽 순서로 auto-collapse. CENTER_MIN은 낮추지 않는다.)
 */

export const LEFT_DEFAULT = 260;
export const LEFT_MIN = 200;
export const LEFT_MAX = 440;

export const RIGHT_DEFAULT = 340;
export const RIGHT_MIN = 270;
export const RIGHT_MAX = 560;

/** 운영자가 실제 사용하는 채팅 최소폭. EXE 최소창(900)에서 확보 불가하면 패널을 auto-collapse한다. */
export const CENTER_MIN = 460;

export const HANDLE_WIDTH = 8;

export function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.min(max, Math.max(min, v));
}

/** localStorage 등에서 온 폭 후보를 [min,max]로 정규화. 잘못된 값이면 fallback. */
export function normalizeWidth(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return clamp(n, min, max);
}

type ResolveInput = {
  containerWidth: number;
  preferredLeftWidth: number;
  preferredRightWidth: number;
  leftCollapsed?: boolean;
  rightCollapsed?: boolean;
};

export type ResolvedChatPanelWidths = {
  leftWidth: number;
  rightWidth: number;
  centerWidth: number;
  leftVisible: boolean;
  rightVisible: boolean;
  /** 창이 좁아 자동으로 접힘(사용자 수동 접기와 구분). 창을 키우면 복원 가능. */
  autoCollapsedLeft: boolean;
  autoCollapsedRight: boolean;
};

/**
 * 선호 폭 + 컨테이너 폭으로 실제 렌더 폭을 계산한다(선호 폭은 변형하지 않음 — 순수).
 * 공간 부족 시: 오른쪽 축소 → 왼쪽 축소 → 오른쪽 auto-collapse → 왼쪽 auto-collapse.
 * 가로 스크롤을 만들지 않는다.
 */
export function resolveChatPanelWidths(input: ResolveInput): ResolvedChatPanelWidths {
  const W = Number.isFinite(input.containerWidth) ? input.containerWidth : 0;
  let leftVisible = !input.leftCollapsed;
  let rightVisible = !input.rightCollapsed;
  let autoCollapsedLeft = false;
  let autoCollapsedRight = false;

  let left = leftVisible ? clamp(input.preferredLeftWidth, LEFT_MIN, LEFT_MAX) : 0;
  let right = rightVisible ? clamp(input.preferredRightWidth, RIGHT_MIN, RIGHT_MAX) : 0;

  const handles = () => (leftVisible ? HANDLE_WIDTH : 0) + (rightVisible ? HANDLE_WIDTH : 0);

  // 1) 오른쪽 → 2) 왼쪽 순서로 최소값까지 축소해 중앙 최소폭 확보
  let over = left + right + handles() + CENTER_MIN - W;
  if (over > 0 && rightVisible) {
    const r = Math.min(over, right - RIGHT_MIN);
    right -= r;
    over -= r;
  }
  if (over > 0 && leftVisible) {
    const l = Math.min(over, left - LEFT_MIN);
    left -= l;
    over -= l;
  }
  // 3) 그래도 부족 → 오른쪽 auto-collapse
  if (over > 0 && rightVisible) {
    autoCollapsedRight = true;
    rightVisible = false;
    right = 0;
    over = left + handles() + CENTER_MIN - W;
  }
  // 4) 그래도 부족 → 왼쪽 auto-collapse
  if (over > 0 && leftVisible) {
    autoCollapsedLeft = true;
    leftVisible = false;
    left = 0;
  }

  left = Math.max(0, Math.round(left));
  right = Math.max(0, Math.round(right));
  const centerWidth = Math.max(0, Math.round(W - left - right - handles()));
  return { leftWidth: left, rightWidth: right, centerWidth, leftVisible, rightVisible, autoCollapsedLeft, autoCollapsedRight };
}

/**
 * 왼쪽 handle 드래그 시 목표 폭을 clamp한다.
 * [LEFT_MIN, min(LEFT_MAX, 컨테이너에서 중앙 최소폭·현재 오른쪽 폭을 뺀 값)]
 */
export function clampLeftWidth(
  desiredLeft: number,
  opts: { containerWidth: number; rightWidth: number; rightVisible: boolean }
): number {
  const handles = HANDLE_WIDTH + (opts.rightVisible ? HANDLE_WIDTH : 0);
  const maxForCenter = opts.containerWidth - opts.rightWidth - handles - CENTER_MIN;
  const upper = Math.max(LEFT_MIN, Math.min(LEFT_MAX, maxForCenter));
  return clamp(desiredLeft, LEFT_MIN, upper);
}

/**
 * 오른쪽 handle 드래그 시 목표 폭을 clamp한다(반대 방향).
 * [RIGHT_MIN, min(RIGHT_MAX, 컨테이너에서 중앙 최소폭·현재 왼쪽 폭을 뺀 값)]
 */
export function clampRightWidth(
  desiredRight: number,
  opts: { containerWidth: number; leftWidth: number; leftVisible: boolean }
): number {
  const handles = HANDLE_WIDTH + (opts.leftVisible ? HANDLE_WIDTH : 0);
  const maxForCenter = opts.containerWidth - opts.leftWidth - handles - CENTER_MIN;
  const upper = Math.max(RIGHT_MIN, Math.min(RIGHT_MAX, maxForCenter));
  return clamp(desiredRight, RIGHT_MIN, upper);
}
