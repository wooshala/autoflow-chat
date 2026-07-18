'use client';

// Phase 1C.1 — a titled, collapsible group of rooms (직원 채팅 / 고객 채팅방 / 최근 대화방 /
// 휴지통). Collapse target is the SECTION, not an individual room. Renders nothing when
// empty so sections disappear cleanly.

import type { ReactNode } from 'react';

export function RoomSection({
  title,
  count,
  collapsed,
  onToggle,
  children,
}: {
  title: string;
  count?: number;
  collapsed?: boolean;
  onToggle?: () => void;
  children: ReactNode;
}) {
  return (
    <div className="py-1">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400 hover:text-gray-600"
      >
        <span aria-hidden className="inline-block w-2 text-gray-400">{collapsed ? '▸' : '▾'}</span>
        <span>{title}</span>
        {typeof count === 'number' && count > 0 && <span className="text-gray-300">{count}</span>}
      </button>
      {!collapsed && <ul>{children}</ul>}
    </div>
  );
}
