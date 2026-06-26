'use client';

import * as React from 'react';
import { ISSUE_UI, STATUS_UI, TicketStatus } from '@/lib/types';
import type { DashboardTicket } from '@/lib/dashboard';
import { formatKST } from '@/lib/formatKST';

function statusUi(status: string): { label: string; badge: string } {
  const s = String(status || '').toLowerCase().trim();
  if (s === 'hold') return { label: '보류', badge: 'bg-gray-100 text-gray-700' };
  if (s === 'in_progress') return STATUS_UI.progress;
  const cast = s as TicketStatus;
  return (STATUS_UI as any)[cast] || STATUS_UI.open;
}

function StatusBadge({ status }: { status: string }) {
  const ui = statusUi(status);
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${ui.badge}`}>{ui.label}</span>;
}

function DelayBadge({ isDelayed, delayMinutes }: { isDelayed: boolean; delayMinutes: number }) {
  if (!isDelayed) return null;
  const m = Number.isFinite(delayMinutes) ? Math.max(0, Math.floor(delayMinutes)) : 0;
  return (
    <span className="ml-2 inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
      지연 {m}m
    </span>
  );
}

function AutoBadge({ autoCreated }: { autoCreated: boolean | null }) {
  if (autoCreated === null) {
    return <span className="text-xs text-gray-400">-</span>;
  }
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${autoCreated ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600'}`}>
      {autoCreated ? '자동' : '수동'}
    </span>
  );
}

function IssueBadge({ issue }: { issue: string }) {
  const ui = (ISSUE_UI as any)[issue] || ISSUE_UI['기타'];
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${ui.badge}`}>{ui.emoji} {issue}</span>;
}

export type TicketTableProps = {
  tickets: DashboardTicket[];
  loading?: boolean;
  selectedId: string | null;
  onSelect: (ticket: DashboardTicket) => void;
};

export function TicketTable({ tickets, loading, selectedId, onSelect }: TicketTableProps) {
  const dim = loading ? 'opacity-70' : '';

  return (
    <section className={`rounded-xl border border-gray-200 bg-white ${dim}`}>
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <div className="text-sm font-bold text-gray-900">티켓 리스트</div>
        <div className="text-xs text-gray-500">최근 {tickets.length}건</div>
      </div>

      <div className="overflow-auto">
        <table className="min-w-[900px] w-full text-sm">
          <thead className="sticky top-0 bg-white">
            <tr className="border-b border-gray-100 text-left text-xs font-semibold text-gray-500">
              <th className="px-4 py-2 w-[180px]">생성시각</th>
              <th className="px-4 py-2 w-[110px]">객실/장소</th>
              <th className="px-4 py-2 w-[120px]">유형</th>
              <th className="px-4 py-2">요약</th>
              <th className="px-4 py-2 w-[110px]">상태</th>
              <th className="px-4 py-2 w-[120px]">자동생성</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {tickets.map((t) => {
              const isSelected = selectedId && String(selectedId) === String(t.id);
              return (
                <tr
                  key={t.id}
                  onClick={() => onSelect(t)}
                  className={`cursor-pointer hover:bg-blue-50/30 ${isSelected ? 'bg-blue-50/60' : ''} ${t.is_delayed ? 'bg-red-50/40' : ''}`}
                >
                  <td className="px-4 py-2 text-xs text-gray-600 font-mono">{t.created_at ? formatKST(t.created_at) : '-'}</td>
                  <td className="px-4 py-2 text-sm font-semibold text-gray-900">{t.room_no ? `${t.room_no}호` : '-'}</td>
                  <td className="px-4 py-2">
                    <IssueBadge issue={String(t.category || '기타')} />
                  </td>
                  <td className="px-4 py-2 text-gray-900">{t.summary || '-'}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center">
                      <StatusBadge status={String(t.status || 'open')} />
                      <DelayBadge isDelayed={Boolean(t.is_delayed)} delayMinutes={Number(t.delay_minutes || 0)} />
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <AutoBadge autoCreated={t.auto_created} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {tickets.length === 0 ? (
        <div className="px-4 py-6 text-sm text-gray-500">{loading ? '불러오는 중…' : '표시할 티켓이 없습니다.'}</div>
      ) : null}
    </section>
  );
}

