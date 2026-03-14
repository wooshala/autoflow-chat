'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Navigation from '@/components/Navigation';
import { MaintenanceTicket, STATUS_UI, TicketStatus, ISSUE_UI } from '@/lib/types';

const tabs: Array<TicketStatus | 'all'> = ['all', 'open', 'progress', 'done'];

export default function MaintenancePage() {
  const router = useRouter();
  const [tickets, setTickets] = useState<MaintenanceTicket[]>([]);
  const [tab, setTab] = useState<TicketStatus | 'all'>('all');

  useEffect(() => {
    fetch(`/api/maintenance/list${tab === 'all' ? '' : `?status=${tab}`}`).then((r) => r.json()).then((d) => setTickets(d.tickets || []));
  }, [tab]);

  return (
    <main className="flex h-screen flex-col bg-gray-100">
      <header className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xl font-extrabold">유지보수 현황</div>
            <div className="text-xs text-gray-500">PMS와 별도인 이슈 기록 보드</div>
          </div>
          <button onClick={() => router.push('/chat')} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white">채팅으로</button>
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto">
          {tabs.map((t) => <button key={t} onClick={() => setTab(t)} className={`rounded-full border px-4 py-1.5 text-xs font-bold ${tab === t ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-200'}`}>{t === 'all' ? '전체' : STATUS_UI[t].label}</button>)}
        </div>
      </header>
      <section className="flex-1 overflow-y-auto p-3 space-y-3">
        {tickets.map((ticket) => (
          <button key={ticket.id} onClick={() => router.push(`/maintenance/${ticket.id}`)} className="card block w-full overflow-hidden text-left">
            <div className="flex items-center gap-2 px-4 pt-4">
              <span className="rounded-xl bg-gray-900 px-3 py-1 text-white font-extrabold">{ticket.room_no}</span>
              <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${ISSUE_UI[ticket.issue_type].badge}`}>{ISSUE_UI[ticket.issue_type].emoji} {ticket.issue_type}</span>
              <span className={`ml-auto rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_UI[ticket.status].badge}`}>{STATUS_UI[ticket.status].label}</span>
            </div>
            <div className="px-4 py-2 text-sm font-medium text-gray-800">{ticket.description}</div>
            {ticket.photos?.[0]?.image_url && <img src={ticket.photos[0].image_url} alt="ticket" className="h-32 w-full object-cover" />}
            <div className="flex items-center justify-between bg-gray-50 px-4 py-2 text-xs text-gray-500">
              <span>👤 {ticket.creator?.name || ticket.created_by}</span>
              <span>{new Date(ticket.created_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          </button>
        ))}
      </section>
      <Navigation active="maintenance" />
    </main>
  );
}
