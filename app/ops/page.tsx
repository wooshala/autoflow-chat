'use client';

import { useEffect, useMemo, useState } from 'react';
import ChatOpsQueueBoard from '@/components/chat/ChatOpsQueueBoard';
import type { ChatOpsQueueItem, QueueItemStatus } from '@/lib/chat/chatOpsQueue';
import { sortQueueItems } from '@/lib/chat/chatOpsQueue';
import { getCategoryLabel } from '@/lib/chat/classifyMessageCategory';

type Summary = {
  date: string;
  total: number;
  urgent: number;
  new: number;
  acknowledged: number;
  done: number;
  deferred: number;
  byCategory: Record<string, number>;
  topRooms: Array<{ roomNumber: string; count: number }>;
};

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-3">
      <div className="text-[11px] font-semibold text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-extrabold text-gray-900">{value}</div>
    </div>
  );
}

function OpsSummarySection({ summary }: { summary: Summary | null }) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-bold text-gray-900">일일 운영 요약</div>
          <div className="mt-0.5 text-xs text-gray-500">{summary ? summary.date : '-'}</div>
        </div>
        <div className="text-xs text-gray-500">polling 3s</div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-6">
        <StatCard label="전체" value={summary?.total || 0} />
        <StatCard label="긴급" value={summary?.urgent || 0} />
        <StatCard label="신규" value={summary?.new || 0} />
        <StatCard label="처리중" value={summary?.acknowledged || 0} />
        <StatCard label="완료" value={summary?.done || 0} />
        <StatCard label="보류" value={summary?.deferred || 0} />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
          <div className="text-xs font-bold text-gray-700">카테고리별</div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-gray-700">
            {(['repair', 'environment', 'cleaning', 'turnover', 'general'] as const).map((c) => (
              <div key={c} className="flex items-center justify-between rounded-lg bg-white px-2 py-1 ring-1 ring-gray-200">
                <span className="font-semibold">{getCategoryLabel(c)}</span>
                <span className="tabular-nums">{(summary?.byCategory?.[c] || 0) as number}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
          <div className="text-xs font-bold text-gray-700">객실 반복 이슈</div>
          <div className="mt-2 space-y-1 text-xs text-gray-700">
            {(summary?.topRooms || []).length === 0 ? (
              <div className="text-gray-500">데이터 없음</div>
            ) : (
              (summary?.topRooms || []).map((r) => (
                <div key={r.roomNumber} className="flex items-center justify-between rounded-lg bg-white px-2 py-1 ring-1 ring-gray-200">
                  <span className="font-semibold">{r.roomNumber}호</span>
                  <span className="tabular-nums">{r.count}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export default function OpsPage() {
  const [items, setItems] = useState<ChatOpsQueueItem[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);

  const sorted = useMemo(() => sortQueueItems(items), [items]);

  async function fetchQueue() {
    const r = await fetch('/api/chat/ops-queue/list?limit=300', { cache: 'no-store' });
    const j = await r.json().catch(() => null);
    if (!j?.ok) return;
    const rows = (j?.data?.items || []) as any[];
    const mapped: ChatOpsQueueItem[] = rows.map((x) => ({
      id: String(x.id),
      messageId: String(x.message_id),
      createdAt: String(x.updated_at || x.created_at),
      text: String(x.text || ''),
      roomNumber: x.room_number ? String(x.room_number) : null,
      mainCategory: String(x.main_category || 'general') as any,
      flags: {
        urgent: Boolean(x.urgent),
        request: Boolean(x.request),
        status: Boolean(x.status_flag)
      },
      tone: String(x.tone || 'silent') as any,
      summary: String(x.summary || ''),
      status: String(x.status || 'new') as any,
      source: 'chat'
    }));
    setItems(mapped);
  }

  async function fetchSummary() {
    const r = await fetch('/api/chat/ops-queue/summary?date=today', { cache: 'no-store' });
    const j = await r.json().catch(() => null);
    if (!j?.ok) return;
    setSummary(j.data as Summary);
  }

  useEffect(() => {
    void fetchQueue();
    void fetchSummary();
    const t = setInterval(() => {
      void fetchQueue();
      void fetchSummary();
    }, 3000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSetStatus(id: string, status: QueueItemStatus) {
    // optimistic
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, status } : it)));
    try {
      await fetch('/api/chat/ops-queue/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status })
      });
    } finally {
      // refresh shortly
      setTimeout(() => void fetchQueue(), 300);
      setTimeout(() => void fetchSummary(), 300);
    }
  }

  return (
    <main className="flex h-screen flex-col bg-gray-100">
      <header className="shrink-0 border-b border-gray-200 bg-white px-4 py-3">
        <div className="font-bold">운영 대시보드</div>
        <div className="text-xs text-gray-500">작업 큐 + 일일 요약</div>
      </header>

      <section className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        <OpsSummarySection summary={summary} />
        <ChatOpsQueueBoard items={sorted} onSetStatus={onSetStatus} debug={process.env.NEXT_PUBLIC_CHAT_NOTIFY_DEBUG === '1'} />
      </section>
    </main>
  );
}

