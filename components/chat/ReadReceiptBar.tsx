'use client';

import { useEffect, useState } from 'react';
import type { MessageReadInfo } from '@/lib/chat/readReceipts';
import ReadReceiptPopover from '@/components/chat/ReadReceiptPopover';

const COOLDOWN_MS = 30_000;

function hhmm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * PC: "읽음 N" under a message (click → read/unread roster popover), plus a [호출]
 * button when there is ≥1 unread reader. After a call, shows "호출됨 HH:MM" and stays
 * disabled for the 30s cooldown (driven by last_called_at, synced via realtime).
 * Mobile renders its own minimal "읽음 N" inline — this component is not used there.
 */
export default function ReadReceiptBar({
  info,
  lastCalledAt,
  onCall
}: {
  info: MessageReadInfo;
  lastCalledAt?: string | null;
  onCall?: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [calling, setCalling] = useState(false);
  const [, setTick] = useState(0);

  const cooldownUntil = lastCalledAt ? new Date(lastCalledAt).getTime() + COOLDOWN_MS : 0;
  const inCooldown = cooldownUntil > Date.now();

  // Re-render once when the cooldown elapses so the button re-enables.
  useEffect(() => {
    if (!inCooldown) return;
    const t = setTimeout(() => setTick((x) => x + 1), Math.max(250, cooldownUntil - Date.now()));
    return () => clearTimeout(t);
  }, [inCooldown, cooldownUntil]);

  const showCall = info.unreadCount >= 1 && typeof onCall === 'function';

  async function handleCall() {
    if (!onCall || calling || inCooldown) return;
    setCalling(true);
    try {
      await onCall();
    } finally {
      setCalling(false);
    }
  }

  return (
    <div className="relative mt-0.5 flex items-center gap-1.5 text-[10px] text-gray-400">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded px-1 hover:bg-gray-100 hover:text-gray-600"
        aria-expanded={open}
      >
        읽음 {info.readCount}
      </button>
      {showCall ? (
        inCooldown ? (
          <span className="rounded px-1 text-gray-400" aria-live="polite">
            호출됨{lastCalledAt ? ` ${hhmm(lastCalledAt)}` : ''}
          </span>
        ) : (
          <button
            type="button"
            disabled={calling}
            onClick={() => void handleCall()}
            className="rounded border border-orange-300 bg-orange-50 px-1.5 py-0.5 font-semibold text-orange-700 hover:bg-orange-100 disabled:opacity-50"
          >
            {calling ? '호출 중…' : '호출'}
          </button>
        )
      ) : null}
      {open ? <ReadReceiptPopover info={info} onClose={() => setOpen(false)} /> : null}
    </div>
  );
}
