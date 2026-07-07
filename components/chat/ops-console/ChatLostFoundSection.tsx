'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchEnvelope } from '@/lib/api/envelope';
import { LOST_FOUND_STATUS_UI } from '@/lib/ops-events/lostFoundFsm';
import { historyRowDetail, historyRowTitle } from '@/lib/ops-events/lostFoundUi';
import type { LostFoundItem, LostFoundMemo, OpsEventHistoryRow } from '@/lib/ops-events/types';
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
              {item.snap_guest_name ? (
                <div className="truncate text-[10px] text-gray-600">{item.snap_guest_name}</div>
              ) : null}
              <div className="text-[10px] text-gray-500">{formatKSTShort(item.created_at)}</div>
              {item.memo_count ? (
                <div className="mt-0.5 truncate text-[10px] text-emerald-700">
                  메모 {item.memo_count}
                  {item.latest_memo_text ? ` · ${item.latest_memo_text}` : ''}
                </div>
              ) : null}
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

/**
 * LF-4A — auto-filled guest fields + staff memo only.
 */
function LostFoundDetailView({ item, actorId, onBack, onItemUpdated }: DetailProps) {
  const [history, setHistory] = useState<OpsEventHistoryRow[]>([]);
  const [memos, setMemos] = useState<LostFoundMemo[]>([]);
  const [memoDraft, setMemoDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [roomDraft, setRoomDraft] = useState(item.snap_room_no || '');
  const [guestDraft, setGuestDraft] = useState(item.snap_guest_name || '');
  const [stayDraft, setStayDraft] = useState(item.snap_stay_date || '');
  const [otaDraft, setOtaDraft] = useState(item.snap_ota_safe_number || '');

  useEffect(() => {
    setRoomDraft(item.snap_room_no || '');
    setGuestDraft(item.snap_guest_name || '');
    setStayDraft(item.snap_stay_date || '');
    setOtaDraft(item.snap_ota_safe_number || '');
  }, [item.id, item.snap_room_no, item.snap_guest_name, item.snap_stay_date, item.snap_ota_safe_number]);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    const [histRes, memoRes] = await Promise.all([
      fetchEnvelope<{ history: OpsEventHistoryRow[] }>(`/api/ops-events/lost-found/${item.id}/history`, {
        cache: 'no-store'
      }),
      fetchEnvelope<{ memos: LostFoundMemo[] }>(`/api/ops-events/lost-found/${item.id}/memos`, {
        cache: 'no-store'
      })
    ]);
    setHistory(histRes.ok ? histRes.data.history || [] : []);
    setMemos(memoRes.ok ? memoRes.data.memos || [] : []);
    setLoading(false);
  }, [item.id]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const statusHistory = history.filter((h) => h.action !== 'note_added');
  const statusUi = LOST_FOUND_STATUS_UI[item.status] || LOST_FOUND_STATUS_UI.registered;

  function fieldInput(
    label: string,
    value: string,
    onChange: (v: string) => void,
    placeholder = '—'
  ) {
    const empty = !value.trim();
    return (
      <div className="space-y-0.5">
        <dt className="text-gray-500">{label}</dt>
        <dd>
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className={`w-full rounded border px-2 py-1 text-[11px] font-semibold ${
              empty ? 'border-amber-200 bg-amber-50/50 text-gray-700' : 'border-gray-200 bg-white text-gray-900'
            }`}
          />
        </dd>
      </div>
    );
  }

  async function handleSave() {
    if (!actorId) {
      alert('actor_id가 설정되지 않았습니다.');
      return;
    }
    const text = memoDraft.trim();
    if (!text) {
      alert('운영 메모를 입력해 주세요.');
      return;
    }
    setSaving(true);
    const r = await fetchEnvelope<{ memo: LostFoundMemo }>(`/api/ops-events/lost-found/${item.id}/memos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memo_text: text, actor_id: actorId })
    });
    setSaving(false);
    if (!r.ok) {
      alert(r.message);
      return;
    }
    setMemoDraft('');
    setMemos((prev) => [...prev, r.data.memo]);
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
            <dl className="mt-2 space-y-2 text-[11px]">
              {fieldInput('객실', roomDraft, setRoomDraft, '201')}
              {fieldInput('투숙객', guestDraft, setGuestDraft)}
              {fieldInput('숙박일', stayDraft, setStayDraft, 'YYYY-MM-DD')}
              {fieldInput('OTA 안심번호', otaDraft, setOtaDraft, '050...')}
              <div className="flex items-center justify-between gap-2 pt-0.5">
                <dt className="text-gray-500">상태</dt>
                <dd>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${statusUi.badge}`}>
                    {statusUi.label}
                  </span>
                </dd>
              </div>
            </dl>
          </div>

          <div className="border-t border-gray-200" />

          <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-2.5">
            <div className="text-xs font-bold text-emerald-950">운영 메모</div>
            {memos.length > 0 ? (
              <div className="mt-2 max-h-28 space-y-1 overflow-y-auto">
                {memos.map((m) => (
                  <div key={m.id} className="rounded border border-emerald-100 bg-white px-2 py-1 text-[10px] text-gray-700">
                    <div className="whitespace-pre-wrap">{m.memo_text}</div>
                  </div>
                ))}
              </div>
            ) : null}
            <textarea
              value={memoDraft}
              onChange={(e) => setMemoDraft(e.target.value)}
              placeholder="오늘 저녁 방문 예정 / 택배 발송 요청"
              rows={3}
              className="mt-2 w-full rounded-lg border border-emerald-200 bg-white px-2 py-1.5 text-xs"
            />
            <button
              type="button"
              disabled={saving || !memoDraft.trim()}
              onClick={() => void handleSave()}
              className="mt-2 w-full rounded-lg bg-emerald-600 py-2.5 text-xs font-bold text-white disabled:opacity-50"
            >
              {saving ? '저장 중...' : '저장'}
            </button>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-2.5">
            <div className="text-xs font-bold text-gray-900">History</div>
            <div className="mt-2 max-h-36 space-y-1.5 overflow-y-auto">
              {statusHistory.length === 0 ? (
                <div className="text-[11px] text-gray-500">기록 없음</div>
              ) : (
                statusHistory.map((h) => (
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
