'use client';

// Phase 1C — a titled group of rooms in the left navigation (e.g. 직원 채팅 / 고객 채팅방
// / 최근 대화방 / 휴지통). Renders nothing when empty so sections collapse cleanly.

import type { ReactNode } from 'react';

export function RoomSection({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <div className="py-1">
      <div className="flex items-center gap-2 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
        <span>{title}</span>
        {typeof count === 'number' && count > 0 && <span className="text-gray-300">{count}</span>}
      </div>
      <ul>{children}</ul>
    </div>
  );
}
