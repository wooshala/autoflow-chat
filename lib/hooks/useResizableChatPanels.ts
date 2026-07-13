'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  LEFT_DEFAULT,
  RIGHT_DEFAULT,
  clampLeftWidth,
  clampRightWidth
} from '@/lib/chat/chatPanelSizing';

export type ChatResizeSide = 'left' | 'right';

/**
 * Phase 1.4 Commit F: 좌·우 패널 폭 상태 + 포인터 드래그 라이프사이클.
 * 레이아웃 전용 — 메시지/Realtime/selectedChatRoomId를 건드리지 않는다.
 * 드래그 중 성능: pointermove는 rAF로 배치해 프레임당 1회만 width state를 갱신한다.
 * (localStorage 저장·접기·ResizeObserver 반응 재계산은 Commit G에서 확장)
 */
export function useResizableChatPanels() {
  const containerRef = useRef<HTMLDivElement | null>(null);

  // preferred(사용자 선호) 폭. 창 축소로 clamp된 값으로 덮어쓰지 않는다(Commit G의 resolved와 분리).
  const [leftWidth, setLeftWidth] = useState(LEFT_DEFAULT);
  const [rightWidth, setRightWidth] = useState(RIGHT_DEFAULT);
  const [draggingSide, setDraggingSide] = useState<ChatResizeSide | null>(null);

  const leftRef = useRef(leftWidth);
  leftRef.current = leftWidth;
  const rightRef = useRef(rightWidth);
  rightRef.current = rightWidth;
  const draggingRef = useRef<ChatResizeSide | null>(null);

  const rafRef = useRef<number | null>(null);
  const pendingRef = useRef<number | null>(null);

  const flush = useCallback(() => {
    rafRef.current = null;
    const v = pendingRef.current;
    const side = draggingRef.current;
    if (v == null || side == null) return;
    if (side === 'left') setLeftWidth(v);
    else setRightWidth(v);
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
      if (side === 'left') {
        const desired = clientX - rect.left;
        pendingRef.current = clampLeftWidth(desired, {
          containerWidth: rect.width,
          rightWidth: rightRef.current,
          rightVisible: true
        });
      } else {
        const desired = rect.right - clientX;
        pendingRef.current = clampRightWidth(desired, {
          containerWidth: rect.width,
          leftWidth: leftRef.current,
          leftVisible: true
        });
      }
      if (rafRef.current == null) {
        rafRef.current = requestAnimationFrame(flush);
      }
    },
    [flush]
  );

  // 키보드 접근성: 방향키로 폭을 delta만큼 조정(선호 폭 갱신, 즉시 clamp).
  const nudge = useCallback((side: ChatResizeSide, delta: number) => {
    const container = containerRef.current;
    const containerWidth = container ? container.getBoundingClientRect().width : 0;
    if (side === 'left') {
      setLeftWidth((w) =>
        clampLeftWidth(w + delta, { containerWidth, rightWidth: rightRef.current, rightVisible: true })
      );
    } else {
      setRightWidth((w) =>
        clampRightWidth(w + delta, { containerWidth, leftWidth: leftRef.current, leftVisible: true })
      );
    }
  }, []);

  const onResizeEnd = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const v = pendingRef.current;
    const side = draggingRef.current;
    if (v != null && side) {
      if (side === 'left') setLeftWidth(v);
      else setRightWidth(v);
    }
    pendingRef.current = null;
    draggingRef.current = null;
    setDraggingSide(null);
    // Commit G: 여기서 pointerup 1회만 localStorage에 저장한다.
  }, []);

  // 언마운트 시 rAF 정리(전역 리스너 누적/누수 방지).
  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return {
    containerRef,
    leftWidth,
    rightWidth,
    draggingSide,
    onResizeStart,
    onResize,
    onResizeEnd,
    nudge
  };
}
