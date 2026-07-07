'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchEnvelope } from '@/lib/api/envelope';
import { LOST_FOUND_STATUS_UI } from '@/lib/ops-events/lostFoundFsm';
import { historyRowDetail, historyRowTitle } from '@/lib/ops-events/lostFoundUi';
import type { LostFoundItem, OpsEventHistoryRow } from '@/lib/ops-events/types';
import { formatKST, formatKSTShort } from '@/lib/formatKST';

type ListProps = {
  items: LostFoundItem[];
  onSelect: (id: string) => void;
};

function LostFoundListView({ items, onSelect }: ListProps) {
  if (items.length === 0) {
    return <div className="text-xs text-gray-400">등록 없음</div>;
  }
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onSelect(item.id);
            }}
            className="flex w-full gap-2 rounded-lg bg-gray-50 p-2 text-left hover:bg-gray-100"
          >
            {item.snap_image_url ? (
              <img src={item.snap_image_url} alt="" className="h-12 w-12 shrink-0 rounded-md object-cover" />
            ) : (
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-gray-200 text-[10px] text-gray-500">
                —
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-bold text-gray-900">
                {item.event_no}
                {item.snap_room_no ? ` · ${item.snap_room_no}호` : ''}
              </div>
              <div className="truncate text-[10px] text-gray-600">{item.item_description}</div>
              <div className="text-[10px] text-gray-500">{formatKSTShort(item.created_at)}</div>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}

type DetailProps = {
  item: LostFoundItem;
  actorId: string | null;
  onBack: () => void;
  onItemUpdated: () => void;
};

/** LF-3C — list/detail inside Event Center (no /ops navigation). */
function LostFoundDetailView({ item, actorId, onBack, onItemUpdated }: DetailProps) {
  const [history, setHistory] = useState<OpsEventHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [transitioning, setTransitioning] = useState(false);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    const histRes = await fetchEnvelope<{ history: OpsEventHistoryRow[] }>(
      `/api/ops-events/lost-found/${item.id}/history`,
      { cache: 'no-store' }
    );
    setHistory(histRes.ok ? histRes.data.history || [] : []);
    setLoading(false);
  }, [item.id]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const statusUi = LOST_FOUND_STATUS_UI[item.status] || LOST_FOUND_STATUS_UI.registered;

  async function transitionToStored() {
    if (!actorId) {
      alert('actor_id가 설정되지 않았습니다.');
      return;
    }
    setTransitioning(true);
    const r = await fetchEnvelope<{ item: LostFoundItem }>(
      `/api/ops-events/lost-found/${item.id}/transitions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to_status: 'stored', actor_id: actorId })
      }
    );
    setTransitioning(false);
    if (!r.ok) {
      alert(r.message);
      return;
    }
    await loadDetail();
    onItemUpdated();
  }

  return (
    <div className="space-y-2">
      <button type="button" onClick={onBack} className="text-xs font-semibold text-blue-600">
        ← 목록
      </button>

      {loading ? (
        <div className="text-xs text-gray-500">로딩 중...</div>
      ) : (
        <>
          <div className="rounded-lg border border-gray-200 bg-white p-2.5 text-xs">
            {item.snap_image_url ? (
              <img src={item.snap_image_url} alt="분실물" className="mb-2 h-32 w-full rounded-lg object-cover" />
            ) : null}
            <div className="font-extrabold text-gray-900">{item.event_no}</div>
            <div className="mt-1 font-bold text-gray-800">{item.item_description}</div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {item.snap_room_no ? (
                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                  {item.snap_room_no}호
                </span>
              ) : null}
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${statusUi.badge}`}>
                {statusUi.label}
              </span>
            </div>
            <div className="mt-1 text-[10px] text-gray-500">등록 {formatKSTShort(item.created_at)}</div>
          </div>

          {item.status === 'registered' ? (
            <button
              type="button"
              disabled={transitioning}
              onClick={() => void transitionToStored()}
              className="w-full rounded-lg bg-indigo-600 py-2.5 text-xs font-bold text-white disabled:opacity-50"
            >
              {transitioning ? '처리 중...' : '보관 처리'}
            </button>
          ) : null}

          <div className="rounded-lg border border-gray-200 bg-white p-2.5">
            <div className="text-xs font-bold text-gray-900">History</div>
            <div className="mt-2 max-h-36 space-y-1.5 overflow-y-auto">
              {history.length === 0 ? (
                <div className="text-[11px] text-gray-500">기록 없음</div>
              ) : (
                history.map((h) => (
                  <div key={h.id} className="rounded bg-gray-50 px-2 py-1.5 text-[11px]">
                    <div className="font-semibold text-gray-900">
                      {historyRowTitle(h)}
                      {historyRowDetail(h) ? ` · ${historyRowDetail(h)}` : ''}
                    </div>
                    <div className="text-[10px] text-gray-500">
                      {h.actor_name} · {formatKST(h.created_at)}
                    </div>
                    {h.transition_note ? (
                      <div className="mt-0.5 whitespace-pre-wrap text-gray-600">{h.transition_note}</div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

type SectionProps = {
  items: LostFoundItem[];
  allItems?: LostFoundItem[];
  lostFoundEnabled: boolean;
  actorId: string | null;
  onRefreshList: () => void;
  openDetailId?: string | null;
  onOpenDetailIdConsumed?: () => void;
};

export default function ChatLostFoundSection({
  items,
  allItems,
  lostFoundEnabled,
  actorId,
  onRefreshList,
  openDetailId,
  onOpenDetailIdConsumed
}: SectionProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const lookupItems = allItems ?? items;

  useEffect(() => {
    if (openDetailId) {
      setSelectedId(openDetailId);
      onOpenDetailIdConsumed?.();
    }
  }, [openDetailId, onOpenDetailIdConsumed]);

  const selectedItem = selectedId ? lookupItems.find((x) => x.id === selectedId) || null : null;

  if (!lostFoundEnabled) {
    return <div className="text-xs text-gray-400">분실물 비활성</div>;
  }

  if (selectedItem) {
    return (
      <LostFoundDetailView
        item={selectedItem}
        actorId={actorId}
        onBack={() => setSelectedId(null)}
        onItemUpdated={onRefreshList}
      />
    );
  }

  return <LostFoundListView items={items} onSelect={setSelectedId} />;
}
