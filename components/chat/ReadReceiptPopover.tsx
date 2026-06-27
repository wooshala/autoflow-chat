'use client';

import type { MessageReadInfo } from '@/lib/chat/readReceipts';

/** PC-only: read/unread roster for one message. Never rendered on mobile. */
export default function ReadReceiptPopover({
  info,
  onClose
}: {
  info: MessageReadInfo;
  onClose: () => void;
}) {
  return (
    <>
      {/* click-away */}
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden />
      <div className="absolute bottom-5 left-0 z-50 w-48 rounded-lg border border-gray-200 bg-white p-2 text-[11px] shadow-xl">
        <div className="mb-1 font-bold text-gray-700">
          읽음 {info.readCount} / 안읽음 {info.unreadCount}
        </div>
        {info.read.length > 0 ? (
          <div className="mb-1.5">
            <div className="mb-0.5 text-gray-400">읽음</div>
            {info.read.map((m) => (
              <div key={m.reader_id} className="truncate text-emerald-700">
                ✓ {m.name}
              </div>
            ))}
          </div>
        ) : null}
        {info.unread.length > 0 ? (
          <div>
            <div className="mb-0.5 text-gray-400">안읽음</div>
            {info.unread.map((m) => (
              <div key={m.reader_id} className="truncate text-gray-500">
                ○ {m.name}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </>
  );
}
