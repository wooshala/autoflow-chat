'use client';

import type { ChatToastItem } from '@/lib/hooks/useChatNotifications';

export default function ChatToastStack({
  toasts,
  onToastClick,
  onDismiss
}: {
  toasts: ChatToastItem[];
  onToastClick: (t: ChatToastItem) => void;
  onDismiss: (key: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed right-3 top-16 z-[60] flex max-w-[min(20rem,calc(100vw-1.5rem))] flex-col gap-2"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.key}
          className="pointer-events-auto flex overflow-hidden rounded-lg border border-gray-200 bg-white text-xs text-gray-800 shadow-md"
        >
          <button
            type="button"
            onClick={() => onToastClick(t)}
            className="min-w-0 flex-1 px-3 py-2 text-left transition hover:bg-gray-50 active:bg-gray-100"
          >
            <div className="mb-0.5 font-semibold text-gray-900">새 메시지</div>
            <p className="line-clamp-3 break-words text-gray-600">{t.body}</p>
            <p className="mt-1 text-[10px] text-gray-400">탭하면 채팅으로 이동</p>
          </button>
          <button
            type="button"
            className="shrink-0 border-l border-gray-100 px-2 text-[10px] text-gray-400 hover:bg-gray-50 hover:text-gray-600"
            onClick={() => onDismiss(t.key)}
            aria-label="닫기"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
