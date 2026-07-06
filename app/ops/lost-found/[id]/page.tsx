'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { fetchEnvelope } from '@/lib/api/envelope';
import { LOST_FOUND_STATUS_UI } from '@/lib/ops-events/lostFoundFsm';
import { historyRowDetail, historyRowTitle } from '@/lib/ops-events/lostFoundUi';
import type { LostFoundItem, OpsEventHistoryRow } from '@/lib/ops-events/types';
import { formatKST, formatKSTShort } from '@/lib/formatKST';
import { resolveChatSendUserId } from '@/lib/auth';

export default function LostFoundDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id || '';
  const [item, setItem] = useState<LostFoundItem | null>(null);
  const [history, setHistory] = useState<OpsEventHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [transitioning, setTransitioning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const actorId = resolveChatSendUserId();

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const listRes = await fetchEnvelope<{ items: LostFoundItem[] }>('/api/ops-events/lost-found', {
      cache: 'no-store'
    });
    const histRes = await fetchEnvelope<{ history: OpsEventHistoryRow[] }>(
      `/api/ops-events/lost-found/${id}/history`,
      { cache: 'no-store' }
    );
    if (!listRes.ok) {
      setError(listRes.message);
      setLoading(false);
      return;
    }
    const found = (listRes.data.items || []).find((x) => x.id === id) || null;
    setItem(found);
    setHistory(histRes.ok ? histRes.data.history || [] : []);
    setError(found ? null : '분실물을 찾을 수 없습니다.');
    setLoading(false);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function transitionToStored() {
    if (!item || !actorId) {
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
    await load();
  }

  if (loading) {
    return (
      <main className="p-4">
        <div className="text-sm text-gray-500">로딩 중...</div>
      </main>
    );
  }

  if (!item) {
    return (
      <main className="p-4">
        <div className="text-sm text-red-600">{error || 'Not found'}</div>
        <button type="button" className="mt-3 text-sm text-blue-600" onClick={() => router.push('/ops/lost-found')}>
          목록으로
        </button>
      </main>
    );
  }

  const ui = LOST_FOUND_STATUS_UI[item.status] || LOST_FOUND_STATUS_UI.registered;

  return (
    <main className="flex min-h-screen flex-col bg-gray-100">
      <header className="border-b border-gray-200 bg-white px-4 py-3">
        <button type="button" onClick={() => router.push('/ops/lost-found')} className="text-sm text-blue-600">
          ← 목록
        </button>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-xl font-extrabold">{item.event_no}</span>
          {item.snap_room_no ? (
            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">
              {item.snap_room_no}호
            </span>
          ) : null}
          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${ui.badge}`}>{ui.label}</span>
        </div>
      </header>

      <section className="flex-1 space-y-3 p-4">
        <div className="rounded-2xl border border-gray-200 bg-white p-4 text-sm">
          <div className="font-bold text-gray-900">{item.item_description}</div>
          <div className="mt-2 text-gray-600">등록 {formatKSTShort(item.created_at)}</div>
          {item.snap_image_url ? (
            <img src={item.snap_image_url} alt="분실물" className="mt-3 h-48 w-full rounded-xl object-cover" />
          ) : null}
        </div>

        {item.status === 'registered' ? (
          <button
            type="button"
            disabled={transitioning}
            onClick={() => void transitionToStored()}
            className="w-full rounded-xl bg-indigo-600 py-3 text-sm font-bold text-white disabled:opacity-50"
          >
            {transitioning ? '처리 중...' : '보관 처리'}
          </button>
        ) : null}

        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <div className="text-sm font-bold text-gray-900">History</div>
          <div className="mt-3 space-y-2">
            {history.length === 0 ? (
              <div className="text-xs text-gray-500">기록 없음</div>
            ) : (
              history.map((h) => (
                <div key={h.id} className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-700">
                  <div className="font-semibold text-gray-900">
                    {historyRowTitle(h)}
                    {historyRowDetail(h) ? ` · ${historyRowDetail(h)}` : ''}
                  </div>
                  <div className="mt-0.5 text-gray-500">
                    {h.actor_name} · {formatKST(h.created_at)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
