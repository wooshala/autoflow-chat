'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Navigation from '@/components/Navigation';
import { fetchEnvelope } from '@/lib/api/envelope';
import { TIMEOUT_MS_DASHBOARD } from '@/lib/api/timeouts';
import { MaintenanceTicket, STATUS_UI, TicketStatus, ISSUE_UI } from '@/lib/types';
import { formatKST, formatKSTShort } from '@/lib/formatKST';

const tabs: Array<TicketStatus | 'all'> = ['all', 'open', 'progress', 'done'];

export default function MaintenancePage() {
  const router = useRouter();
  const [tickets, setTickets] = useState<MaintenanceTicket[]>([]);
  const [tab, setTab] = useState<TicketStatus | 'all'>('all');
  const [refreshTick, setRefreshTick] = useState(0);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const r = await fetchEnvelope<{ tickets?: MaintenanceTicket[] }>(
          `/api/maintenance/list${tab === 'all' ? '' : `?status=${tab}`}`,
          { cache: 'no-store', envelope: false, timeoutMs: TIMEOUT_MS_DASHBOARD }
        );

        console.log('[MAINTENANCE_FETCH_RAW]', {
          ok: r.ok,
          status: r.status,
          dataType: typeof (r as any).data,
          ticketsIsArray: Array.isArray((r as any).data?.tickets),
          count: Array.isArray((r as any).data?.tickets) ? (r as any).data.tickets.length : 0,
          ids: Array.isArray((r as any).data?.tickets)
            ? (r as any).data.tickets.slice(0, 20).map((t: any) => t?.id)
            : [],
          room_nos: Array.isArray((r as any).data?.tickets)
            ? (r as any).data.tickets.slice(0, 20).map((t: any) => t?.room_no)
            : [],
          statuses: Array.isArray((r as any).data?.tickets)
            ? (r as any).data.tickets.slice(0, 20).map((t: any) => t?.status)
            : [],
        });

        if (!r.ok) {
          if (!cancelled) setTickets([]);
          return;
        }

        const rawDataTickets = (r as any).data?.tickets;
        const typedDataTickets = r.data?.tickets;
        console.log('[MAINTENANCE_PRE_NEXT_TICKETS]', {
          rawLen: Array.isArray(rawDataTickets) ? rawDataTickets.length : String(typeof rawDataTickets),
          typedLen: Array.isArray(typedDataTickets) ? typedDataTickets.length : String(typeof typedDataTickets),
          sameRef: rawDataTickets === typedDataTickets,
        });

        const nextTickets = Array.isArray(r.data?.tickets) ? r.data.tickets : [];

        console.log('[MAINTENANCE_SET_TICKETS]', {
          count: nextTickets.length,
          ids: nextTickets.slice(0, 20).map(t => t.id),
          room_nos: nextTickets.slice(0, 20).map(t => t.room_no),
          statuses: nextTickets.slice(0, 20).map(t => t.status),
        });

        if (!cancelled) {
          setTickets(nextTickets);
          setLastRefreshed(new Date());
        }
      } catch (err: any) {
        console.error('[MAINTENANCE_FETCH_ERROR]', {
          message: err?.message ?? String(err),
          stack: err?.stack ?? null,
        });
        if (!cancelled) setTickets([]);
      }
    }

    load();
    const interval = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [tab, refreshTick]);

  useEffect(() => {
    const uncovered = Array.from(
      new Set(
        (tickets || [])
          .map((t: any) => String(t?.issue_type || ''))
          .filter((v) => v && !(v in ISSUE_UI))
      )
    );
    if (uncovered.length > 0) {
      console.warn('[maintenance] ISSUE_UI에 없는 issue_type 값:', uncovered);
    }
  }, [tickets]);

  useEffect(() => {
    console.log('[MAINTENANCE_RENDER_TICKETS]', tickets.map(t => ({
      id: t.id,
      room_no: t.room_no,
      status: t.status,
      status_ui_exists: t.status in STATUS_UI,
    })));
  }, [tickets]);

  return (
    <main className="flex h-screen flex-col bg-gray-100">
      <header className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xl font-extrabold">유지보수 현황</div>
            <div className="text-xs text-gray-500">
              {lastRefreshed
                ? `${formatKST(lastRefreshed)} 기준`
                : '로딩 중...'}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setRefreshTick((n) => n + 1)}
              className="rounded-xl border border-gray-200 px-3 py-2 text-sm font-bold text-gray-700 active:bg-gray-100"
            >↻</button>
            <button onClick={() => router.push('/chat')} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white">채팅으로</button>
          </div>
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto">
          {tabs.map((t) => <button key={t} onClick={() => setTab(t)} className={`rounded-full border px-4 py-1.5 text-xs font-bold ${tab === t ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-200'}`}>{t === 'all' ? '전체' : STATUS_UI[t].label}</button>)}
        </div>
      </header>
      <section className="flex-1 overflow-y-auto p-3 space-y-3">
        {tickets.map((ticket) => (
          (() => {
            const issue = (ISSUE_UI as any)[(ticket as any).issue_type] || ISSUE_UI['기타'];
            return (
          <button key={ticket.id} onClick={() => router.push(`/maintenance/${ticket.id}`)} className="card block w-full overflow-hidden text-left">
            <div className="flex items-center gap-2 px-4 pt-4">
              <span className="rounded-xl bg-gray-900 px-3 py-1 text-white font-extrabold">{ticket.room_no}</span>
              <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${issue.badge}`}>{issue.emoji} {String((ticket as any).issue_type || '기타')}</span>
              <span className={`ml-auto rounded-full px-2.5 py-1 text-xs font-bold ${(STATUS_UI[ticket.status] ?? STATUS_UI['open']).badge}`}>{(STATUS_UI[ticket.status] ?? STATUS_UI['open']).label}</span>
            </div>
            <div className="px-4 py-2 text-sm font-medium text-gray-800">{ticket.description}</div>
            {ticket.photos?.[0]?.image_url && <img src={ticket.photos[0].image_url} alt="ticket" className="h-32 w-full object-cover" />}
            <div className="flex items-center justify-between bg-gray-50 px-4 py-2 text-xs text-gray-500">
              <span>👤 {ticket.creator?.name || ticket.created_by}</span>
              <span>{formatKSTShort(ticket.created_at)}</span>
            </div>
          </button>
            );
          })()
        ))}
      </section>
      <Navigation active="maintenance" />
    </main>
  );
}
