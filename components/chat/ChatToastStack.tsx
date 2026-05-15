'use client';

import { useEffect, useRef } from 'react';
import type { ChatToastItem } from '@/lib/hooks/useChatNotifications';
import { getCategoryBadgeClassName, getCategoryLabel } from '@/lib/chat/classifyMessageCategory';
import { log } from '@/lib/logger';

const DEBUG_NOTIFY = process.env.NEXT_PUBLIC_CHAT_NOTIFY_DEBUG === '1';

function getToastAccentClassName(t: ChatToastItem): string {
  if (t.flags.urgent) return 'bg-red-500';
  switch (t.tone) {
    case 'warn':
      return 'bg-amber-500';
    case 'info':
      return 'bg-sky-500';
    case 'soft':
      return 'bg-slate-400';
    case 'urgent':
      return 'bg-red-500';
    case 'silent':
    default:
      return 'bg-gray-300';
  }
}

function FlagBadge({ label, className }: { label: string; className: string }) {
  return (
    <div className={['rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset', className].join(' ')}>
      {label}
    </div>
  );
}

export default function ChatToastStack({
  toasts,
  onToastClick,
  onDismiss
}: {
  toasts: ChatToastItem[];
  onToastClick: (t: ChatToastItem) => void;
  onDismiss: (key: string) => void;
}) {
  const prevLenRef = useRef(0);
  useEffect(() => {
    if (toasts.length > prevLenRef.current && toasts.length > 0) {
      if (DEBUG_NOTIFY) log.info('[CHAT_TOAST_RENDER]', { count: toasts.length });
    }
    prevLenRef.current = toasts.length;
  }, [toasts.length]);

  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed right-3 top-16 z-[9999] flex w-[min(26rem,calc(100vw-1.5rem))] flex-col gap-3"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.key}
          className={[
            'pointer-events-auto relative flex overflow-hidden rounded-xl border bg-white/95 text-sm text-gray-900 shadow-2xl backdrop-blur transition duration-150',
            t.flags.urgent ? 'border-red-200' : 'border-gray-200'
          ].join(' ')}
        >
          <div className={['w-1.5', getToastAccentClassName(t)].join(' ')} />
          <button
            type="button"
            onClick={() => onToastClick(t)}
            className="min-w-0 flex-1 px-4 py-3 text-left transition hover:bg-gray-50 active:bg-gray-100"
          >
            <div className="mb-1 flex items-center gap-2">
              <div className="font-semibold">
                새 메시지
                {t.roomNumber ? ` · ${t.roomNumber}호` : ''}
              </div>
              <FlagBadge label={getCategoryLabel(t.category)} className={getCategoryBadgeClassName(t.category)} />
              {t.flags.urgent ? <FlagBadge label="긴급" className="bg-red-50 text-red-700 ring-red-200" /> : null}
              {t.flags.request ? <FlagBadge label="요청" className="bg-violet-50 text-violet-700 ring-violet-200" /> : null}
              {t.flags.status ? <FlagBadge label="상태" className="bg-slate-50 text-slate-700 ring-slate-200" /> : null}
            </div>
            <p className="line-clamp-2 break-words text-[13px] leading-5 text-gray-800">{t.body}</p>
            <p className="mt-2 text-[11px] text-gray-500">탭하면 채팅으로 이동</p>
          </button>
          <button
            type="button"
            className="shrink-0 border-l border-gray-100 px-3 text-xs text-gray-500 hover:bg-gray-50 hover:text-gray-800"
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
