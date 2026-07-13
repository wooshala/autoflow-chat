'use client';

import { useCallback } from 'react';
import type { ChatResizeSide } from '@/lib/hooks/useResizableChatPanels';
import { HANDLE_WIDTH } from '@/lib/chat/chatPanelSizing';

const KEY_STEP = 16;

type Props = {
  side: ChatResizeSide;
  active: boolean;
  label: string;
  onResizeStart: (side: ChatResizeSide) => void;
  onResize: (clientX: number) => void;
  onResizeEnd: () => void;
  onNudge: (side: ChatResizeSide, delta: number) => void;
};

/**
 * Phase 1.4 좌·우 패널 사이 리사이즈 핸들(Pointer Events + setPointerCapture).
 * 외부 라이브러리 없음. PC 마우스가 주 대상이나 Pointer Events로 구현(터치/펜 호환).
 * a11y: role="separator" + aria-orientation + 방향키 조절.
 */
export default function ChatResizeHandle({
  side,
  active,
  label,
  onResizeStart,
  onResize,
  onResizeEnd,
  onNudge
}: Props) {
  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // 주 버튼(마우스 좌클릭/터치/펜)만
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      onResizeStart(side);
    },
    [side, onResizeStart]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!active) return;
      onResize(e.clientX);
    },
    [active, onResize]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      onResizeEnd();
    },
    [onResizeEnd]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      // 왼쪽 핸들: →=왼패널 확대, ←=축소. 오른쪽 핸들: ←=오른패널 확대, →=축소.
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        onNudge(side, side === 'left' ? -KEY_STEP : KEY_STEP);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        onNudge(side, side === 'left' ? KEY_STEP : -KEY_STEP);
      }
    },
    [side, onNudge]
  );

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onKeyDown={handleKeyDown}
      className={`group relative z-10 flex h-full shrink-0 cursor-col-resize touch-none select-none items-stretch justify-center ${
        active ? 'bg-blue-400/40' : 'bg-transparent hover:bg-blue-400/20'
      }`}
      style={{ width: HANDLE_WIDTH }}
    >
      {/* 얇은 시각적 구분선(hit area는 8px, 선은 가늘게) */}
      <span
        className={`my-auto h-full w-px ${active ? 'bg-blue-500' : 'bg-gray-300 group-hover:bg-blue-400'}`}
      />
    </div>
  );
}
