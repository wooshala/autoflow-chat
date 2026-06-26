'use client';

import * as React from 'react';
import { ISSUE_UI, STATUS_UI, TicketStatus } from '@/lib/types';
import type { DashboardTicket } from '@/lib/dashboard';
import { fetchEnvelope } from '@/lib/api/envelope';
import { TIMEOUT_MS_DASHBOARD } from '@/lib/api/timeouts';
import { resolveChatSendUserId } from '@/lib/auth';
import { createTaggedLogger } from '@/lib/logger';
import { formatKST } from '@/lib/formatKST';

const tlog = createTaggedLogger('[TICKET_DETAIL]');

function Badge({ className, children }: { className: string; children: React.ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${className}`}>{children}</span>;
}

export type TicketDetailPanelProps = {
  ticket: DashboardTicket | null;
  onStatusUpdated?: (nextTicket: DashboardTicket) => void;
};

type AllowedStatus = 'open' | 'in_progress' | 'done' | 'hold';

function statusUi(status: string): { label: string; badge: string } {
  const s = String(status || '').toLowerCase();
  if (s === 'hold') return { label: '보류', badge: 'bg-gray-100 text-gray-700' };
  if (s === 'in_progress') return STATUS_UI.progress;
  const cast = s as TicketStatus;
  return (STATUS_UI as any)[cast] || STATUS_UI.open;
}

export function TicketDetailPanel({ ticket, onStatusUpdated }: TicketDetailPanelProps) {
  const [updating, setUpdating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [actorId, setActorId] = React.useState<string | null>(null);
  const statusReqIdRef = React.useRef(0);
  const statusAbortRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    setActorId(resolveChatSendUserId());
  }, []);

  React.useEffect(() => {
    return () => {
      statusAbortRef.current?.abort();
      statusAbortRef.current = null;
    };
  }, [ticket?.id]);

  if (!ticket) {
    return (
      <aside className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="text-sm font-bold text-gray-900">상세</div>
        <div className="mt-2 text-sm text-gray-500">왼쪽 리스트에서 티켓을 선택하세요.</div>
      </aside>
    );
  }

  const issueUi = (ISSUE_UI as any)[String(ticket.category || '기타')] || ISSUE_UI['기타'];
  const status = String(ticket.status || 'open');
  const stUi = statusUi(status);
  const ticketId = String(ticket.id || '');
  const baseTicket = ticket;

  async function updateStatus(next: AllowedStatus) {
    if (updating) {
      tlog.debug({ event: 'status_update_blocked', reason: 'already_updating' });
      return;
    }
    const myReq = ++statusReqIdRef.current;
    if (statusAbortRef.current) {
      statusAbortRef.current.abort();
      statusAbortRef.current = null;
    }
    const ac = new AbortController();
    statusAbortRef.current = ac;

    setUpdating(true);
    setError(null);
    try {
      type StatusBody = {
        ok: boolean;
        ticket?: Record<string, unknown>;
        error?: string;
        message?: string;
      };
      const result = await fetchEnvelope<StatusBody>(
        `/api/dashboard/tickets/${encodeURIComponent(ticketId)}/status`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: next, actor_id: actorId }),
          signal: ac.signal,
          envelope: false,
          timeoutMs: TIMEOUT_MS_DASHBOARD
        }
      );
      if (myReq !== statusReqIdRef.current) return;

      if (!result.ok) {
        throw new Error(result.message);
      }
      const data = result.data;
      if (!data?.ok) {
        throw new Error(data?.error || data?.message || '상태 변경 실패');
      }

      // 서버 row는 tickets 원본 스키마 형태일 수 있으므로, 현재 DashboardTicket에 최소 반영만 한다.
      const updatedAt = String((data?.ticket as any)?.updated_at || new Date().toISOString());
      const dbStatus = String((data?.ticket as any)?.status || '').toUpperCase();
      const normalized =
        dbStatus === 'IN_PROGRESS' ? 'in_progress' :
        dbStatus === 'DONE' ? 'done' :
        dbStatus === 'HOLD' ? 'hold' :
        dbStatus === 'OPEN' ? 'open' :
        next;

      const nextTicket: DashboardTicket = { ...baseTicket, status: normalized, created_at: baseTicket.created_at, updated_at: updatedAt } as any;
      onStatusUpdated?.(nextTicket);
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        tlog.debug({ event: 'status_update_aborted' });
        return;
      }
      if (myReq === statusReqIdRef.current) {
        setError(e?.message || String(e));
      }
    } finally {
      if (statusAbortRef.current === ac) {
        statusAbortRef.current = null;
      }
      if (myReq === statusReqIdRef.current) {
        setUpdating(false);
      }
    }
  }

  return (
    <aside className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-bold text-gray-900">티켓 상세</div>
          <div className="mt-1 text-xs text-gray-500 font-mono">{ticket.id}</div>
        </div>
        <div className="flex flex-wrap gap-2 justify-end">
          <Badge className={issueUi.badge}>{issueUi.emoji} {String(ticket.category || '기타')}</Badge>
          <Badge className={stUi.badge}>{stUi.label}</Badge>
          <Badge className={ticket.auto_created ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600'}>
            {ticket.auto_created === null ? '자동여부: -' : ticket.auto_created ? '자동 생성' : '수동 생성'}
          </Badge>
        </div>
      </div>

      <div className="mt-4 space-y-3 text-sm">
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-1 text-xs font-semibold text-gray-500">생성시각</div>
          <div className="col-span-2 text-xs text-gray-700 font-mono">{ticket.created_at ? formatKST(ticket.created_at) : '-'}</div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-1 text-xs font-semibold text-gray-500">room_no</div>
          <div className="col-span-2 text-sm font-semibold text-gray-900">{ticket.room_no || '-'}</div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-1 text-xs font-semibold text-gray-500">category</div>
          <div className="col-span-2 text-sm text-gray-900">{String(ticket.category || '-')}</div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-1 text-xs font-semibold text-gray-500">status</div>
          <div className="col-span-2 text-sm text-gray-900">{String(ticket.status || '-')}</div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-1 text-xs font-semibold text-gray-500">auto_created</div>
          <div className="col-span-2 text-sm text-gray-900">
            {ticket.auto_created === null ? '-' : ticket.auto_created ? 'true' : 'false'}
          </div>
        </div>

        <div className="border-t border-gray-100 pt-3">
          <div className="text-xs font-semibold text-gray-500">원문/요약</div>
          <div className="mt-1 whitespace-pre-wrap rounded-lg border border-gray-100 bg-gray-50 p-3 text-sm text-gray-900">
            {ticket.original || '(내용 없음)'}
          </div>
        </div>
      </div>

      <div className="mt-4 border-t border-gray-100 pt-3">
        <div className="text-xs font-semibold text-gray-500">상태 변경</div>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            disabled={updating}
            onClick={() => updateStatus('open')}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            대기중
          </button>
          <button
            disabled={updating}
            onClick={() => updateStatus('in_progress')}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            처리중
          </button>
          <button
            disabled={updating}
            onClick={() => updateStatus('done')}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            완료
          </button>
          <button
            disabled={updating}
            onClick={() => updateStatus('hold')}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            보류
          </button>
        </div>
        {error ? <div className="mt-2 text-xs text-red-600">오류: {error}</div> : null}
        <div className="mt-2 text-xs text-gray-400">권한/인증 검증은 MVP 단계에서 생략(다음 단계에서 강화)</div>
      </div>
    </aside>
  );
}

