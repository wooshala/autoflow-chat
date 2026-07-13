'use client';

import type { ReactNode } from 'react';
import { useResizableChatPanels, type ChatResizeSide } from '@/lib/hooks/useResizableChatPanels';
import ChatResizeHandle from '@/components/chat/layout/ChatResizeHandle';

type Props = {
  /** 왼쪽 채팅방 패널(폭을 모르는 presentational). */
  left: ReactNode;
  /** 가운데 채팅 타임라인(자체 flex-1 min-w-0). 남은 폭 사용. */
  center: ReactNode;
  /** 오른쪽 Event Center 패널(폭을 모르는 presentational). */
  right: ReactNode;
};

/** 접힘 상태에서 다시 여는 얇은 rail 버튼(중앙 좌/우측). */
function ExpandRail({
  side,
  label,
  onClick
}: {
  side: ChatResizeSide;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`flex h-full w-5 shrink-0 items-center justify-center bg-gray-50 text-gray-500 hover:bg-gray-100 ${
        side === 'left' ? 'border-r border-gray-200' : 'border-l border-gray-200'
      }`}
    >
      <span aria-hidden className="text-sm leading-none">
        {side === 'left' ? '›' : '‹'}
      </span>
    </button>
  );
}

/**
 * Phase 1.4 Commit F/G: PC /chat 3열 리사이즈 레이아웃.
 * width는 이 wrapper가 소유하고, 좌·우 패널은 폭을 모르는 presentational(w-full로 채움).
 * 접힘(수동/자동)은 컴포넌트를 unmount하지 않고 wrapper width 0 + overflow hidden으로 처리해
 * 탭/선택/스크롤 state를 보존한다. 레이아웃 전용 — 메시지/Realtime을 건드리지 않는다.
 */
export default function ResizableChatLayout({ left, center, right }: Props) {
  const {
    containerRef,
    leftWidth,
    rightWidth,
    leftVisible,
    rightVisible,
    userCollapsedLeft,
    userCollapsedRight,
    draggingSide,
    onResizeStart,
    onResize,
    onResizeEnd,
    nudge,
    toggleCollapse
  } = useResizableChatPanels();

  const dragging = draggingSide != null;

  return (
    <div
      ref={containerRef}
      className={`flex min-h-0 flex-1 ${dragging ? 'cursor-col-resize select-none' : ''}`}
    >
      {/* 왼쪽 패널 — 항상 mount. 숨김 시 width 0(state/scroll 보존). */}
      <div
        className={`h-full shrink-0 overflow-hidden ${leftVisible ? '' : 'pointer-events-none'}`}
        style={{ width: leftVisible ? leftWidth : 0 }}
        aria-hidden={!leftVisible}
      >
        {left}
      </div>

      {/* 왼쪽 컨트롤: 표시=드래그 핸들+접기 버튼 / 수동 접힘=열기 rail / 자동 접힘=얇은 표시 */}
      {leftVisible ? (
        <div className="relative flex h-full shrink-0">
          <ChatResizeHandle
            side="left"
            active={draggingSide === 'left'}
            label="채팅방 패널 크기 조절"
            onResizeStart={onResizeStart}
            onResize={onResize}
            onResizeEnd={onResizeEnd}
            onNudge={nudge}
          />
          <button
            type="button"
            aria-label="채팅방 패널 접기"
            title="채팅방 패널 접기"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => toggleCollapse('left')}
            className="absolute left-1/2 top-1 z-20 flex h-4 w-4 -translate-x-1/2 items-center justify-center rounded bg-white/90 text-[10px] leading-none text-gray-600 shadow hover:bg-white"
          >
            <span aria-hidden>‹</span>
          </button>
        </div>
      ) : userCollapsedLeft ? (
        <ExpandRail side="left" label="채팅방 패널 열기" onClick={() => toggleCollapse('left')} />
      ) : (
        <div className="h-full w-1 shrink-0 bg-gray-200" aria-hidden />
      )}

      {/* 가운데 — 남은 폭 */}
      {center}

      {/* 오른쪽 컨트롤 */}
      {rightVisible ? (
        <div className="relative flex h-full shrink-0">
          <ChatResizeHandle
            side="right"
            active={draggingSide === 'right'}
            label="Event Center 패널 크기 조절"
            onResizeStart={onResizeStart}
            onResize={onResize}
            onResizeEnd={onResizeEnd}
            onNudge={nudge}
          />
          <button
            type="button"
            aria-label="Event Center 패널 접기"
            title="Event Center 패널 접기"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => toggleCollapse('right')}
            className="absolute left-1/2 top-1 z-20 flex h-4 w-4 -translate-x-1/2 items-center justify-center rounded bg-white/90 text-[10px] leading-none text-gray-600 shadow hover:bg-white"
          >
            <span aria-hidden>›</span>
          </button>
        </div>
      ) : userCollapsedRight ? (
        <ExpandRail side="right" label="Event Center 패널 열기" onClick={() => toggleCollapse('right')} />
      ) : (
        <div className="h-full w-1 shrink-0 bg-gray-200" aria-hidden />
      )}

      {/* 오른쪽 패널 — 항상 mount */}
      <div
        className={`h-full shrink-0 overflow-hidden ${rightVisible ? '' : 'pointer-events-none'}`}
        style={{ width: rightVisible ? rightWidth : 0 }}
        aria-hidden={!rightVisible}
      >
        {right}
      </div>
    </div>
  );
}
