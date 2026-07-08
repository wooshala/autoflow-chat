'use client';

import { useMemo, useState } from 'react';
import { fetchEnvelope } from '@/lib/api/envelope';
import { LOST_FOUND_STATUS_UI } from '@/lib/ops-events/lostFoundFsm';
import type { LostFoundItem } from '@/lib/ops-events/types';
import { formatKSTShort } from '@/lib/formatKST';

type FilterMode = 'open' | 'all';

type Props = {
  items: LostFoundItem[];
  lostFoundEnabled: boolean;
  actorId: string | null;
  onRefreshList: () => void;
};

/**
 * Event Center lost-found = list ops panel (no detail page / no /ops navigation).
 */
export default function ChatLostFoundSection({
  items,
  lostFoundEnabled,
  actorId,
  onRefreshList
}: Props) {
  const [filter, setFilter] = useState<FilterMode>('open');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const visible = useMemo(() => {
    const sorted = [...items].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    if (filter === 'open') return sorted.filter((x) => x.status === 'registered');
    return sorted.filter((x) =>
      ['registered', 'stored', 'returned', 'disposed', 'cancelled', 'owner_notified'].includes(x.status)
    );
  }, [items, filter]);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      onRefreshList();
      await new Promise((r) => setTimeout(r, 300));
    } finally {
      setRefreshing(false);
    }
  }

  async function handleStore(item: LostFoundItem) {
    if (!actorId || item.status !== 'registered') return;
    setBusyId(item.id);
    const r = await fetchEnvelope<{ item: LostFoundItem }>(
      `/api/ops-events/lost-found/${item.id}/transitions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to_status: 'stored', actor_id: actorId })
      }
    );
    setBusyId(null);
    if (!r.ok) {
      alert(r.message || '보관 처리에 실패했습니다.');
      return;
    }
    onRefreshList();
  }

  async function handleDelete(item: LostFoundItem) {
    if (!actorId) return;
    if (!window.confirm(`${item.event_no}을(를) 삭제할까요?`)) return;
    setBusyId(item.id);
    const r = await fetchEnvelope<{ item: LostFoundItem }>(`/api/ops-events/lost-found/${item.id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor_id: actorId })
    });
    setBusyId(null);
    if (!r.ok) {
      alert(r.message || '삭제에 실패했습니다.');
      return;
    }
    onRefreshList();
  }

  if (!lostFoundEnabled) {
    return <div className="text-xs text-gray-400">분실물 비활성</div>;
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setFilter('open')}
          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
            filter === 'open' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
          }`}
        >
          미해결
        </button>
        <button
          type="button"
          onClick={() => setFilter('all')}
          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
            filter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
          }`}
        >
          전체
        </button>
        <button
          type="button"
          disabled={refreshing}
          onClick={() => void handleRefresh()}
          className="ml-auto rounded-md border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {refreshing ? '…' : '새로고침'}
        </button>
      </div>

      {visible.length === 0 ? (
        <div className="text-xs text-gray-400">등록 없음</div>
      ) : (
        <ul className="space-y-1.5">
          {visible.map((item) => {
            const statusUi = LOST_FOUND_STATUS_UI[item.status] || LOST_FOUND_STATUS_UI.registered;
            const busy = busyId === item.id;
            return (
              <li
                key={item.id}
                className="rounded-lg border border-gray-100 bg-gray-50 p-2"
              >
                <div className="flex gap-2">
                  {item.snap_image_url ? (
                    <img
                      src={item.snap_image_url}
                      alt=""
                      className="h-11 w-11 shrink-0 rounded-md object-cover"
                    />
                  ) : (
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-gray-200 text-[10px] text-gray-500">
                      —
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="text-xs font-extrabold text-gray-900">{item.event_no}</span>
                      <span className={`rounded-full px-1.5 py-0 text-[10px] font-bold ${statusUi.badge}`}>
                        {statusUi.label}
                      </span>
                    </div>
                    <div className="mt-0.5 truncate text-[10px] text-gray-700">
                      {item.snap_room_no ? `${item.snap_room_no}호 · ` : ''}
                      {item.item_description || '—'}
                    </div>
                    <div className="text-[10px] text-gray-500">{formatKSTShort(item.created_at)}</div>
                  </div>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {item.status === 'registered' ? (
                    <button
                      type="button"
                      disabled={busy || !actorId}
                      onClick={() => void handleStore(item)}
                      className="rounded-md bg-indigo-600 px-2 py-1 text-[10px] font-bold text-white disabled:opacity-40"
                    >
                      {busy ? '…' : '보관 처리'}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={busy || !actorId}
                    onClick={() => void handleDelete(item)}
                    className="rounded-md border border-rose-200 bg-white px-2 py-1 text-[10px] font-bold text-rose-700 disabled:opacity-40"
                  >
                    삭제
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
