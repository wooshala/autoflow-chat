'use client';

import { useState } from 'react';
import type { MessageReadInfo } from '@/lib/chat/readReceipts';
import ReadReceiptPopover from '@/components/chat/ReadReceiptPopover';

/**
 * PC: "읽음 N" under a message; click toggles the read/unread roster popover.
 * Mobile renders its own minimal "읽음 N" inline (no list) — this is not used there.
 */
export default function ReadReceiptBar({ info }: { info: MessageReadInfo }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative mt-0.5 flex items-center gap-1 text-[10px] text-gray-400">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded px-1 hover:bg-gray-100 hover:text-gray-600"
        aria-expanded={open}
      >
        읽음 {info.readCount}
      </button>
      {open ? <ReadReceiptPopover info={info} onClose={() => setOpen(false)} /> : null}
    </div>
  );
}
