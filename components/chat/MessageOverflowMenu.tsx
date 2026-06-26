'use client';

import { useEffect, useRef, useState } from 'react';

export type MessageOverflowItem = {
  id: string;
  label: string;
  onClick: () => void;
};

type Props = {
  items: MessageOverflowItem[];
  align?: 'left' | 'right';
};

export default function MessageOverflowMenu({ items, align = 'right' }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  if (!items.length) return null;

  return (
    <div ref={rootRef} className={`relative ${align === 'right' ? 'ml-auto' : ''}`}>
      <button
        type="button"
        aria-label="메시지 더보기"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="rounded px-1 py-0.5 text-[11px] font-bold text-gray-500 opacity-0 transition-opacity hover:bg-black/5 group-hover:opacity-100 group-focus-within:opacity-100"
      >
        ⋮
      </button>
      {open ? (
        <div
          className={`absolute top-full z-20 mt-0.5 min-w-[9rem] rounded-md border border-gray-200 bg-white py-1 shadow-lg ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
              className="block w-full px-3 py-1.5 text-left text-xs font-medium text-gray-800 hover:bg-gray-50"
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
