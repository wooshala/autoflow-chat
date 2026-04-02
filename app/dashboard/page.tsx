'use client';

import * as React from 'react';
import { KpiCards } from '@/components/dashboard/KpiCards';
import { TicketTable } from '@/components/dashboard/TicketTable';
import { TicketDetailPanel } from '@/components/dashboard/TicketDetailPanel';
import { InsightsCards } from '@/components/dashboard/InsightsCards';
import type { DashboardInsights, DashboardSummary, DashboardTicket } from '@/lib/dashboard';
import { fetchEnvelope } from '@/lib/api/envelope';
import { TIMEOUT_MS_DASHBOARD } from '@/lib/api/timeouts';

async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetchEnvelope<T>(url, {
    cache: 'no-store',
    envelope: false,
    timeoutMs: TIMEOUT_MS_DASHBOARD
  });
  if (!r.ok) {
    throw new Error(r.message);
  }
  return r.data;
}

export default function DashboardPage() {
  const [summary, setSummary] = React.useState<DashboardSummary | null>(null);
  const [tickets, setTickets] = React.useState<DashboardTicket[]>([]);
  const [selected, setSelected] = React.useState<DashboardTicket | null>(null);
  const [insights, setInsights] = React.useState<DashboardInsights | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [statusFilter, setStatusFilter] = React.useState<'all' | 'open' | 'in_progress' | 'done' | 'hold'>('all');
  const [roomNoDraft, setRoomNoDraft] = React.useState('');
  const [roomNoApplied, setRoomNoApplied] = React.useState('');
  const [categoryFilter, setCategoryFilter] = React.useState('all');
  const [autoFilter, setAutoFilter] = React.useState<'all' | 'true' | 'false'>('all');

  const insightsDays = 7;

  const loadSummary = React.useCallback(async () => {
    const s = await fetchJson<DashboardSummary>('/api/dashboard/summary');
    setSummary(s);
  }, []);

  const loadTickets = React.useCallback(async () => {
    const qs = new URLSearchParams();
    qs.set('limit', '120');
    if (statusFilter !== 'all') qs.set('status', statusFilter);
    if (roomNoApplied.trim()) qs.set('room_no', roomNoApplied.trim());
    if (categoryFilter !== 'all') qs.set('category', categoryFilter);
    if (autoFilter !== 'all') qs.set('auto_created', autoFilter);

    const t = await fetchJson<{ tickets: DashboardTicket[] }>(`/api/dashboard/tickets?${qs.toString()}`);
    const nextTickets = Array.isArray(t?.tickets) ? t.tickets : [];
    setTickets(nextTickets);
    setSelected((prev) => {
      if (!prev?.id) return nextTickets[0] || null;
      const found = nextTickets.find((x) => String(x.id) === String(prev.id));
      return found || nextTickets[0] || null;
    });
  }, [statusFilter, roomNoApplied, categoryFilter, autoFilter]);

  const loadInsights = React.useCallback(async () => {
    try {
      const data = await fetchJson<DashboardInsights>(`/api/dashboard/insights?days=${insightsDays}`);
      setInsights(data);
    } catch {
      setInsights({ top_categories: [], top_rooms: [] });
    }
  }, []);

  const loadAll = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([loadSummary(), loadTickets(), loadInsights()]);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [loadSummary, loadTickets, loadInsights]);

  React.useEffect(() => {
    loadAll();
  }, [loadAll]);

  // when filters change, reload list only
  React.useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        await loadTickets();
      } catch (e: any) {
        setError(e?.message || String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [loadTickets]);

  const categoryOptions = React.useMemo(() => {
    const set = new Set<string>();
    for (const t of tickets) {
      const c = String((t as any)?.category || '').trim();
      if (c) set.add(c);
    }
    if (categoryFilter !== 'all') set.add(categoryFilter);
    return Array.from(set.values()).sort((a, b) => a.localeCompare(b));
  }, [tickets, categoryFilter]);

  return (
    <main className="min-h-screen bg-gray-100">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-lg font-bold text-gray-900">운영 대시보드 (MVP)</div>
              <div className="text-xs text-gray-500">운영 판단 우선: KPI + 티켓 테이블 + 상세 + 인사이트</div>
            </div>
            <button
              onClick={loadAll}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              disabled={loading}
            >
              {loading ? '새로고침…' : '새로고침'}
            </button>
          </div>
          {error ? (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">오류: {error}</div>
          ) : null}
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-4 space-y-4">
        <KpiCards summary={summary} loading={loading} />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <section className="mb-3 rounded-xl border border-gray-200 bg-white p-3">
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-gray-500">상태</span>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as any)}
                    className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-sm"
                  >
                    <option value="all">전체</option>
                    <option value="open">open</option>
                    <option value="in_progress">in_progress</option>
                    <option value="done">done</option>
                    <option value="hold">hold</option>
                  </select>
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-gray-500">객실(room_no)</span>
                  <input
                    value={roomNoDraft}
                    onChange={(e) => setRoomNoDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') setRoomNoApplied(roomNoDraft);
                    }}
                    placeholder="예: 601"
                    className="h-9 w-36 rounded-lg border border-gray-200 bg-white px-2 text-sm"
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-gray-500">유형(category)</span>
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-sm"
                  >
                    <option value="all">전체</option>
                    {categoryOptions.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-gray-500">자동생성</span>
                  <select
                    value={autoFilter}
                    onChange={(e) => setAutoFilter(e.target.value as any)}
                    className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-sm"
                  >
                    <option value="all">전체</option>
                    <option value="true">자동</option>
                    <option value="false">수동</option>
                  </select>
                </label>

                <button
                  onClick={() => setRoomNoApplied(roomNoDraft)}
                  className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                  disabled={loading}
                >
                  조회
                </button>

                <button
                  onClick={() => {
                    setStatusFilter('all');
                    setRoomNoDraft('');
                    setRoomNoApplied('');
                    setCategoryFilter('all');
                    setAutoFilter('all');
                  }}
                  className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                  disabled={loading}
                >
                  초기화
                </button>
              </div>
              <div className="mt-2 text-xs text-gray-500">
                적용: status={statusFilter}, room_no={roomNoApplied || '-'}, category={categoryFilter}, auto_created={autoFilter}
              </div>
            </section>

            <TicketTable tickets={tickets} loading={loading} selectedId={selected?.id || null} onSelect={(t) => setSelected(t)} />
          </div>

          <div className="lg:col-span-4">
            <TicketDetailPanel
              ticket={selected}
              onStatusUpdated={(next) => {
                setSelected(next);
                setTickets((prev) => prev.map((t) => (String(t.id) === String(next.id) ? { ...t, status: next.status } : t)));
              }}
            />
          </div>
        </div>

        <InsightsCards insights={insights} loading={loading} days={insightsDays} />
      </div>
    </main>
  );
}

