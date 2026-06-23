'use client';

import type { ChatOpsQueueItem, QueueItemStatus } from '@/lib/chat/chatOpsQueue';
import { getCategoryBadgeClassName, getCategoryLabel } from '@/lib/chat/classifyMessageCategory';
import { formatKSTTime } from '@/lib/formatKST';

const formatTimeKST = formatKSTTime;

function FlagBadge({ label, className }: { label: string; className: string }) {
  return (
    <div className={['rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset', className].join(' ')}>
      {label}
    </div>
  );
}

export function getQueueAccentClassName(tone: ChatOpsQueueItem['tone']): string {
  switch (tone) {
    case 'urgent':
      return 'border-red-300 bg-red-50/40';
    case 'warn':
      return 'border-amber-300 bg-amber-50/40';
    case 'info':
      return 'border-sky-300 bg-sky-50/30';
    case 'soft':
      return 'border-slate-300 bg-slate-50/40';
    case 'silent':
    default:
      return 'border-gray-200 bg-white';
  }
}

function getStatusLabel(status: QueueItemStatus): string {
  switch (status) {
    case 'new':
      return '신규';
    case 'acknowledged':
      return '처리중';
    case 'done':
      return '완료';
    case 'deferred':
      return '보류';
    default:
      return status;
  }
}

function getStatusBadgeClassName(status: QueueItemStatus): string {
  switch (status) {
    case 'new':
      return 'bg-blue-50 text-blue-700 ring-blue-200';
    case 'acknowledged':
      return 'bg-amber-50 text-amber-800 ring-amber-200';
    case 'done':
      return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
    case 'deferred':
      return 'bg-slate-50 text-slate-700 ring-slate-200';
    default:
      return 'bg-gray-50 text-gray-700 ring-gray-200';
  }
}

export default function ChatOpsQueueCard({
  item,
  onSetStatus,
  debug = false
}: {
  item: ChatOpsQueueItem;
  onSetStatus: (id: string, status: QueueItemStatus) => void;
  debug?: boolean;
}) {
  const debugTitle = debug
    ? JSON.stringify(
        {
          matchedKeywords: item.debug?.matchedKeywords || {},
          reasons: item.debug?.reasons || []
        },
        null,
        0
      )
    : undefined;

  return (
    <div className={['rounded-xl border p-3', getQueueAccentClassName(item.tone)].join(' ')} title={debugTitle}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            {item.roomNumber ? (
              <div className="rounded-full bg-gray-900 px-2 py-0.5 text-[11px] font-bold text-white">{item.roomNumber}호</div>
            ) : null}
            <FlagBadge label={getCategoryLabel(item.mainCategory)} className={getCategoryBadgeClassName(item.mainCategory)} />
            {item.flags.urgent ? <FlagBadge label="긴급" className="bg-red-50 text-red-700 ring-red-200" /> : null}
            {item.flags.request ? <FlagBadge label="요청" className="bg-violet-50 text-violet-700 ring-violet-200" /> : null}
            {item.flags.status ? <FlagBadge label="상태" className="bg-slate-50 text-slate-700 ring-slate-200" /> : null}
          </div>

          <div className="text-sm font-semibold text-gray-900">{item.summary}</div>
          <div className="mt-0.5 line-clamp-1 text-xs text-gray-600">{item.text}</div>
        </div>

        <div className="shrink-0 text-right">
          <div className="text-[11px] text-gray-500">{formatTimeKST(item.createdAt)}</div>
          <div className="mt-1 inline-block">
            <FlagBadge label={getStatusLabel(item.status)} className={getStatusBadgeClassName(item.status)} />
          </div>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        {item.status === 'new' ? (
          <button
            type="button"
            onClick={() => onSetStatus(item.id, 'acknowledged')}
            className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-bold text-white"
          >
            접수
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onSetStatus(item.id, 'acknowledged')}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-gray-800 hover:bg-gray-50"
          >
            처리중
          </button>
        )}
        <button
          type="button"
          onClick={() => onSetStatus(item.id, 'done')}
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100"
        >
          완료
        </button>
        <button
          type="button"
          onClick={() => onSetStatus(item.id, 'deferred')}
          className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-800 hover:bg-slate-100"
        >
          보류
        </button>
      </div>
    </div>
  );
}

