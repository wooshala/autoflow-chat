'use client';

import type { ReactNode } from 'react';
import { useResizableChatPanels } from '@/lib/hooks/useResizableChatPanels';
import ChatResizeHandle from '@/components/chat/layout/ChatResizeHandle';

type Props = {
  /** 왼쪽 채팅방 패널(폭을 모르는 presentational — 이 wrapper가 폭을 소유). */
  left: ReactNode;
  /** 가운데 채팅 타임라인(자체 flex-1 min-w-0). 남은 폭 사용. */
  center: ReactNode;
  /** 오른쪽 Event Center 패널(폭을 모르는 presentational). */
  right: ReactNode;
};

/**
 * Phase 1.4 Commit F: PC /chat 3열 리사이즈 레이아웃.
 * width는 이 wrapper가 소유하고, 좌·우 패널은 w-full로 wrapper를 채우는 presentational 컴포넌트다.
 * (이후 collapse/animation/overlay를 wrapper 폭 제어로 깨끗하게 확장하기 위함)
 * 레이아웃 전용 — 메시지/Realtime/selectedChatRoomId를 건드리지 않는다.
 */
export default function ResizableChatLayout({ left, center, right }: Props) {
  const {
    containerRef,
    leftWidth,
    rightWidth,
    draggingSide,
    onResizeStart,
    onResize,
    onResizeEnd,
    nudge
  } = useResizableChatPanels();

  const dragging = draggingSide != null;

  return (
    <div
      ref={containerRef}
      className={`flex min-h-0 flex-1 ${dragging ? 'cursor-col-resize select-none' : ''}`}
    >
      {/* 왼쪽 wrapper — 폭 소유 */}
      <div className="h-full shrink-0 overflow-hidden" style={{ width: leftWidth }}>
        {left}
      </div>

      <ChatResizeHandle
        side="left"
        active={draggingSide === 'left'}
        label="채팅방 패널 크기 조절"
        onResizeStart={onResizeStart}
        onResize={onResize}
        onResizeEnd={onResizeEnd}
        onNudge={nudge}
      />

      {/* 가운데 — 남은 폭(자체 flex-1 min-w-0) */}
      {center}

      <ChatResizeHandle
        side="right"
        active={draggingSide === 'right'}
        label="Event Center 패널 크기 조절"
        onResizeStart={onResizeStart}
        onResize={onResize}
        onResizeEnd={onResizeEnd}
        onNudge={nudge}
      />

      {/* 오른쪽 wrapper — 폭 소유 */}
      <div className="h-full shrink-0 overflow-hidden" style={{ width: rightWidth }}>
        {right}
      </div>
    </div>
  );
}
