'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchEnvelope } from '@/lib/api/envelope';
import { LOST_FOUND_STATUS_UI } from '@/lib/ops-events/lostFoundFsm';
import type { LostFoundItem } from '@/lib/ops-events/types';

export default function LostFoundListPage() {
  const router = useRouter();
  const [items, setItems] = useState<LostFoundItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const r = await fetchEnvelope<{ items: LostFoundItem[] }>('/api/ops-events/lost-found', {
      cache: 'no-store'
    });
    if (!r.ok) {
      setError(r.message);
      setItems([]);
      setLoading(false);
      return;
    }
    setError(null);
    setItems(r.data.items || []);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <main className="flex h-screen flex-col bg-gray-100">
      <header className="border-b border-gray-200 bg-white px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xl font-extrabold">분실물</div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-xl border border-gray-200 px-3 py-2 text-sm font-bold text-gray-700"
            >
              ↻
            </button>
            <button
              type="button"
              onClick={() => router.push('/chat')}
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white"
            >
              채팅
            </button>
          </div>
        </div>
      </header>

      <section className="flex-1 overflow-y-auto p-3 space-y-3">
        {loading ? <div className="text-sm text-gray-500">로딩 중...</div> : null}
        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
        ) : null}
        {!loading && !error && items.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-500">
            등록된 분실물이 없습니다.
          </div>
        ) : null}
        {items.map((item) => {
          const ui = LOST_FOUND_STATUS_UI[item.status] || LOST_FOUND_STATUS_UI.registered;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => router.push(`/ops/lost-found/${item.id}`)}
              className="flex w-full gap-3 rounded-2xl border border-gray-200 bg-white p-3 text-left shadow-sm active:bg-gray-50"
            >
              {item.snap_image_url ? (
                <img
                  src={item.snap_image_url}
                  alt="분실물 사진"
                  className="h-24 w-24 shrink-0 rounded-xl object-cover ring-1 ring-gray-200"
                />
              ) : (
                <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-xs text-gray-500 ring-1 ring-gray-200">
                  사진
                </div>
              )}
              <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5 py-0.5">
                <div className="text-xs font-semibold tracking-tight text-gray-500">{item.event_no}</div>
                <div className="text-base font-bold text-gray-900">
                  {item.snap_room_no ? `${item.snap_room_no}호` : '객실 미지정'}
                </div>
                <span className={`w-fit rounded-full px-2.5 py-0.5 text-xs font-bold ${ui.badge}`}>
                  {ui.label}
                </span>
              </div>
            </button>
          );
        })}
      </section>
    </main>
  );
}
