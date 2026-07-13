'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  LEFT_DEFAULT,
  LEFT_MIN,
  LEFT_MAX,
  RIGHT_DEFAULT,
  RIGHT_MIN,
  RIGHT_MAX,
  STORAGE_KEY_LEFT_WIDTH,
  STORAGE_KEY_RIGHT_WIDTH,
  STORAGE_KEY_LEFT_COLLAPSED,
  STORAGE_KEY_RIGHT_COLLAPSED,
  clampLeftWidth,
  clampRightWidth,
  parseStoredCollapsed,
  parseStoredPanelWidth,
  resolveChatPanelWidths
} from '@/lib/chat/chatPanelSizing';

export type ChatResizeSide = 'left' | 'right';

/**
 * Phase 1.4 Commit G: 좌·우 패널 폭 상태 + 저장·복원 + 수동/자동 접기 + 창 크기 보정.
 * 레이아웃 전용 — 메시지/Realtime/selectedChatRoomId/Event Center 데이터를 건드리지 않는다.
 *
 * preferred(사용자 선호) / resolved(실제 렌더) 분리:
 *   - preferred: 드래그 종료 시만 갱신·저장. 창 축소로 clamp돼도 덮어쓰지 않음.
 *   - resolved: containerWidth에 맞춰 매 렌더 재계산(resolveChatPanelWidths). 저장하지 않음.
 * 저장: 폭=pointerup 1회, 접기=사용자 토글 시. 자동 접기는 저장하지 않는다.
 */
export function useResizableChatPanels() {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [preferredLeft, setPreferredLeft] = useState(LEFT_DEFAULT);
  const [preferredRight, setPreferredRight] = useState(RIGHT_DEFAULT);
  const [userCollapsedLeft, setUserCollapsedLeft] = useState(false);
  const [userCollapsedRight, setUserCollapsedRight] = useState(false);
  const [containerWidth, setContainerWidth] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const [draggingSide, setDraggingSide] = useState<ChatResizeSide | null>(null);

  const resolved = useMemo(
    () =>
      resolveChatPanelWidths({
        containerWidth,
        preferredLeftWidth: preferredLeft,
        preferredRightWidth: preferredRight,
        leftCollapsed: userCollapsedLeft,
        rightCollapsed: userCollapsedRight
      }),
    [containerWidth, preferredLeft, preferredRight, userCollapsedLeft, userCollapsedRight]
  );

  // 드래그/토글에서 최신값을 재바인딩 없이 읽기 위한 refs.
  const preferredLeftRef = useRef(preferredLeft);
  preferredLeftRef.current = preferredLeft;
  const preferredRightRef = useRef(preferredRight);
  preferredRightRef.current = preferredRight;
  const userCollapsedLeftRef = useRef(userCollapsedLeft);
  userCollapsedLeftRef.current = userCollapsedLeft;
  const userCollapsedRightRef = useRef(userCollapsedRight);
  userCollapsedRightRef.current = userCollapsedRight;
  const resolvedRef = useRef(resolved);
  resolvedRef.current = resolved;
  const hydratedRef = useRef(false);
  hydratedRef.current = hydrated;
  const draggingRef = useRef<ChatResizeSide | null>(null);

  const rafRef = useRef<number | null>(null);
  const pendingRef = useRef<number | null>(null);

  const persistWidth = useCallback((side: ChatResizeSide, value: number) => {
    if (!hydratedRef.current) return; // 복원 전에는 저장 금지(선호값 덮어쓰기 방지)
    try {
      window.localStorage.setItem(
        side === 'left' ? STORAGE_KEY_LEFT_WIDTH : STORAGE_KEY_RIGHT_WIDTH,
        String(Math.round(value))
      );
    } catch {
      /* ignore */
    }
  }, []);

  const persistCollapsed = useCallback((side: ChatResizeSide, value: boolean) => {
    try {
      window.localStorage.setItem(
        side === 'left' ? STORAGE_KEY_LEFT_COLLAPSED : STORAGE_KEY_RIGHT_COLLAPSED,
        String(value)
      );
    } catch {
      /* ignore */
    }
  }, []);

  // 복원: client mount 후 1회. SSR 접근 금지(useEffect 내부).
  useEffect(() => {
    try {
      const ls = window.localStorage;
      setPreferredLeft(parseStoredPanelWidth(ls.getItem(STORAGE_KEY_LEFT_WIDTH), LEFT_DEFAULT, LEFT_MIN, LEFT_MAX));
      setPreferredRight(parseStoredPanelWidth(ls.getItem(STORAGE_KEY_RIGHT_WIDTH), RIGHT_DEFAULT, RIGHT_MIN, RIGHT_MAX));
      setUserCollapsedLeft(parseStoredCollapsed(ls.getItem(STORAGE_KEY_LEFT_COLLAPSED)));
      setUserCollapsedRight(parseStoredCollapsed(ls.getItem(STORAGE_KEY_RIGHT_COLLAPSED)));
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  // ResizeObserver: container 폭 추적(window resize listener와 중복 사용하지 않음).
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => setContainerWidth(el.getBoundingClientRect().width);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const flush = useCallback(() => {
    rafRef.current = null;
    const v = pendingRef.current;
    const side = draggingRef.current;
    if (v == null || side == null) return;
    if (side === 'left') setPreferredLeft(v);
    else setPreferredRight(v);
  }, []);

  const onResizeStart = useCallback((side: ChatResizeSide) => {
    draggingRef.current = side;
    setDraggingSide(side);
  }, []);

  const onResize = useCallback(
    (clientX: number) => {
      const side = draggingRef.current;
      const container = containerRef.current;
      if (!side || !container) return;
      const rect = container.getBoundingClientRect();
      const r = resolvedRef.current;
      if (side === 'left') {
        pendingRef.current = clampLeftWidth(clientX - rect.left, {
          containerWidth: rect.width,
          rightWidth: r.rightWidth,
          rightVisible: r.rightVisible
        });
      } else {
        pendingRef.current = clampRightWidth(rect.right - clientX, {
          containerWidth: rect.width,
          leftWidth: r.leftWidth,
          leftVisible: r.leftVisible
        });
      }
      if (rafRef.current == null) rafRef.current = requestAnimationFrame(flush);
    },
    [flush]
  );

  const onResizeEnd = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const v = pendingRef.current;
    const side = draggingRef.current;
    if (v != null && side) {
      if (side === 'left') setPreferredLeft(v);
      else setPreferredRight(v);
      persistWidth(side, v); // pointerup/cancel 시 1회만 저장
    }
    pendingRef.current = null;
    draggingRef.current = null;
    setDraggingSide(null);
  }, [persistWidth]);

  // 키보드 조절(선호 폭 갱신 + 저장).
  const nudge = useCallback(
    (side: ChatResizeSide, delta: number) => {
      const container = containerRef.current;
      const cw = container ? container.getBoundingClientRect().width : 0;
      const r = resolvedRef.current;
      if (side === 'left') {
        const nv = clampLeftWidth(preferredLeftRef.current + delta, {
          containerWidth: cw,
          rightWidth: r.rightWidth,
          rightVisible: r.rightVisible
        });
        setPreferredLeft(nv);
        persistWidth('left', nv);
      } else {
        const nv = clampRightWidth(preferredRightRef.current + delta, {
          containerWidth: cw,
          leftWidth: r.leftWidth,
          leftVisible: r.leftVisible
        });
        setPreferredRight(nv);
        persistWidth('right', nv);
      }
    },
    [persistWidth]
  );

  // 수동 접기/열기(사용자 의도 → 저장. 창 확대해도 자동으로 열지 않음).
  const toggleCollapse = useCallback(
    (side: ChatResizeSide) => {
      if (side === 'left') {
        const nv = !userCollapsedLeftRef.current;
        setUserCollapsedLeft(nv);
        persistCollapsed('left', nv);
      } else {
        const nv = !userCollapsedRightRef.current;
        setUserCollapsedRight(nv);
        persistCollapsed('right', nv);
      }
    },
    [persistCollapsed]
  );

  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return {
    containerRef,
    hydrated,
    // resolved(실제 렌더)
    leftWidth: resolved.leftWidth,
    rightWidth: resolved.rightWidth,
    centerWidth: resolved.centerWidth,
    leftVisible: resolved.leftVisible,
    rightVisible: resolved.rightVisible,
    autoCollapsedLeft: resolved.autoCollapsedLeft,
    autoCollapsedRight: resolved.autoCollapsedRight,
    // 사용자 수동 접기 상태(열기 버튼 표시 판정용)
    userCollapsedLeft,
    userCollapsedRight,
    draggingSide,
    onResizeStart,
    onResize,
    onResizeEnd,
    nudge,
    toggleCollapse
  };
}
