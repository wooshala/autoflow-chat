'use client';

import { useMemo, useState } from 'react';
import type { ChatOpsQueueItem, QueueItemStatus } from '@/lib/chat/chatOpsQueue';
import ChatOpsQueueCard from '@/components/chat/ChatOpsQueueCard';
import { sortQueueItems } from '@/lib/chat/chatOpsQueue';
import { getCategoryLabel } from '@/lib/chat/classifyMessageCategory';

type StatusTab = 'all' | QueueItemStatus;

type CategoryChip =
  | 'all'
  | 'urgent'
  | 'repair'
  | 'environment'
  | 'cleaning'
  | 'turnover'
  | 'general';

function Chip({
  active,
  label,
  onClick
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset transition',
        active ? 'bg-gray-900 text-white ring-gray-900' : 'bg-white text-gray-700 ring-gray-200 hover:bg-gray-50'
      ].join(' ')}
    >
      {label}
    </button>
  );
}

export default function ChatOpsQueueBoard({
  items,
  onSetStatus,
  debug = false
}: {
  items: ChatOpsQueueItem[];
  onSetStatus: (id: string, status: QueueItemStatus) => void;
  debug?: boolean;
}) {
  const [statusTab, setStatusTab] = useState<StatusTab>('all');
  const [catChip, setCatChip] = useState<CategoryChip>('all');
  const [showDone, setShowDone] = useState(false);

  const sorted = useMemo(() => sortQueueItems(items), [items]);

  const filtered = useMemo(() => {
    const base = sorted.filter((it) => {
      if (statusTab !== 'all' && it.status !== statusTab) return false;
      if (catChip === 'all') return true;
      if (catChip === 'urgent') return it.flags.urgent;
      return it.mainCategory === catChip;
    });
    return base;
  }, [sorted, statusTab, catChip]);

  const activeItems = filtered.filter((x) => x.status !== 'done');
  const doneItems = filtered.filter((x) => x.status === 'done');

  const countByStatus = useMemo(() => {
    const out: Record<QueueItemStatus, number> = {
      new: 0,
      acknowledged: 0,
      done: 0,
      deferred: 0
    };
    for (const it of items) out[it.status] += 1;
    return out;
  }, [items]);

  return (
    <aside className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-bold text-gray-900">작업 큐</div>
          <div className="mt-0.5 text-xs text-gray-500">토스트는 인입 알림, 큐는 처리 흐름</div>
        </div>
        <div className="text-xs text-gray-500">총 {items.length}</div>
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        <Chip active={statusTab === 'all'} label={`전체`} onClick={() => setStatusTab('all')} />
        <Chip active={statusTab === 'new'} label={`신규 ${countByStatus.new}`} onClick={() => setStatusTab('new')} />
        <Chip
          active={statusTab === 'acknowledged'}
          label={`처리중 ${countByStatus.acknowledged}`}
          onClick={() => setStatusTab('acknowledged')}
        />
        <Chip active={statusTab === 'deferred'} label={`보류 ${countByStatus.deferred}`} onClick={() => setStatusTab('deferred')} />
        <Chip active={statusTab === 'done'} label={`완료 ${countByStatus.done}`} onClick={() => setStatusTab('done')} />
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        <Chip active={catChip === 'all'} label="전체" onClick={() => setCatChip('all')} />
        <Chip active={catChip === 'urgent'} label="긴급" onClick={() => setCatChip('urgent')} />
        <Chip active={catChip === 'repair'} label={getCategoryLabel('repair')} onClick={() => setCatChip('repair')} />
        <Chip active={catChip === 'environment'} label={getCategoryLabel('environment')} onClick={() => setCatChip('environment')} />
        <Chip active={catChip === 'cleaning'} label={getCategoryLabel('cleaning')} onClick={() => setCatChip('cleaning')} />
        <Chip active={catChip === 'turnover'} label={getCategoryLabel('turnover')} onClick={() => setCatChip('turnover')} />
        <Chip active={catChip === 'general'} label={getCategoryLabel('general')} onClick={() => setCatChip('general')} />
      </div>

      <div className="mt-3 space-y-2">
        {activeItems.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3 py-6 text-center text-xs text-gray-500">
            표시할 작업이 없습니다.
          </div>
        ) : (
          activeItems.map((it) => <ChatOpsQueueCard key={it.id} item={it} onSetStatus={onSetStatus} debug={debug} />)
        )}
      </div>

      {doneItems.length > 0 ? (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowDone((v) => !v)}
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-left text-xs font-semibold text-gray-700 hover:bg-gray-50"
          >
            완료 {doneItems.length} {showDone ? '접기' : '펼치기'}
          </button>
          {showDone ? (
            <div className="mt-2 space-y-2">
              {doneItems.map((it) => (
                <ChatOpsQueueCard key={it.id} item={it} onSetStatus={onSetStatus} debug={debug} />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}

