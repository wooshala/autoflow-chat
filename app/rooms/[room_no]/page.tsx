'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Navigation from '@/components/Navigation';
import { fetchEnvelope } from '@/lib/api/envelope';
import type { TimelineEvent, TimelineSourceType, TimelineSeverity } from '@/lib/types';
import { formatKSTShort } from '@/lib/formatKST';

// ── filter types ──────────────────────────────────────────────────────────────

type SourceFilter   = 'all' | TimelineSourceType;
type StatusFilter   = 'all' | 'urgent' | 'unresolved';

// ── filter logic ──────────────────────────────────────────────────────────────

function isUnresolved(ev: TimelineEvent): boolean {
  const meta = ev.meta ?? {};
  if (ev.source_type === 'ticket') return meta['status'] === 'OPEN';
  if (ev.source_type === 'queue')  return meta['status'] !== 'done' && meta['status'] !== 'deferred';
  if (ev.source_type === 'intent') return meta['is_ticketable'] === true;
  return false;
}

function applyFilters(
  events: TimelineEvent[],
  source: SourceFilter,
  status: StatusFilter
): TimelineEvent[] {
  const filtered = events.filter((ev) => {
    if (source !== 'all' && ev.source_type !== source) return false;
    if (status === 'urgent')     return ev.severity === 'urgent';
    if (status === 'unresolved') return isUnresolved(ev);
    return true;
  });

  // unresolved items surface first; within each group preserve API order (occurred_at desc)
  if (status === 'all' || status === 'urgent') {
    filtered.sort((a, b) => {
      const au = isUnresolved(a) ? 0 : 1;
      const bu = isUnresolved(b) ? 0 : 1;
      return au - bu;
    });
  }

  return filtered;
}

// ── helpers ───────────────────────────────────────────────────────────────────

const SOURCE_LABEL: Record<TimelineSourceType, string> = {
  intent: 'AI 분류',
  ticket: '티켓',
  queue:  '운영큐',
};

const SOURCE_BADGE: Record<TimelineSourceType, string> = {
  intent: 'bg-purple-100 text-purple-700',
  ticket: 'bg-orange-100 text-orange-700',
  queue:  'bg-blue-100 text-blue-700',
};

const SEVERITY_DOT: Record<TimelineSeverity, string> = {
  urgent: 'bg-red-500',
  high:   'bg-orange-400',
  normal: 'bg-gray-300',
};

const formatTime = formatKSTShort;

// ── filter bar ────────────────────────────────────────────────────────────────

function FilterPill<T extends string>({
  value, active, onClick, children,
}: {
  value: T; active: boolean; onClick: (v: T) => void; children: React.ReactNode;
}) {
  return (
    <button
      onClick={() => onClick(value)}
      className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
        active
          ? 'bg-gray-900 text-white'
          : 'bg-white text-gray-500 ring-1 ring-gray-200'
      }`}
    >
      {children}
    </button>
  );
}

function FilterBar({
  source, setSource, status, setStatus,
}: {
  source: SourceFilter;    setSource: (v: SourceFilter) => void;
  status: StatusFilter;    setStatus: (v: StatusFilter) => void;
}) {
  return (
    <div className="shrink-0 border-b border-gray-100 bg-white px-4 py-2 space-y-1.5">
      <div className="flex gap-2 overflow-x-auto pb-0.5">
        {(['all', 'ticket', 'queue', 'intent'] as SourceFilter[]).map((v) => (
          <FilterPill key={v} value={v} active={source === v} onClick={setSource}>
            {v === 'all' ? '전체' : v === 'ticket' ? '티켓' : v === 'queue' ? '운영큐' : 'AI 분류'}
          </FilterPill>
        ))}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-0.5">
        {(['all', 'urgent', 'unresolved'] as StatusFilter[]).map((v) => (
          <FilterPill key={v} value={v} active={status === v} onClick={setStatus}>
            {v === 'all' ? '전체' : v === 'urgent' ? '긴급' : '미해결'}
          </FilterPill>
        ))}
      </div>
    </div>
  );
}

// ── event card ────────────────────────────────────────────────────────────────

function EventCard({ ev }: { ev: TimelineEvent }) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${SEVERITY_DOT[ev.severity]}`} />
        <div className="mt-1 flex-1 border-l border-dashed border-gray-200" />
      </div>
      <div className="mb-3 flex-1 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${SOURCE_BADGE[ev.source_type]}`}>
            {SOURCE_LABEL[ev.source_type]}
          </span>
          <span className="text-[11px] text-gray-400 tabular-nums">{formatTime(ev.occurred_at)}</span>
        </div>
        <div className="mt-1.5 text-xs font-semibold text-gray-500">{ev.event_type}</div>
        <div className="mt-0.5 text-sm text-gray-800">{ev.summary}</div>
      </div>
    </div>
  );
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function RoomTimelinePage() {
  const params  = useParams();
  const router  = useRouter();
  const room_no = decodeURIComponent(String(params.room_no ?? ''));

  const [events,  setEvents]  = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const [source, setSource] = useState<SourceFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('all');

  const filtered = useMemo(
    () => applyFilters(events, source, status),
    [events, source, status]
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchEnvelope<{ events: TimelineEvent[] }>(
      `/api/rooms/${encodeURIComponent(room_no)}/timeline`,
      { cache: 'no-store' }
    ).then((r) => {
      if (cancelled) return;
      if (r.ok) setEvents(r.data.events);
      else      setError(r.message);
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [room_no]);

  const countLabel = !loading && !error
    ? (filtered.length === events.length
        ? `${events.length}건`
        : `${filtered.length} / ${events.length}건`)
    : null;

  return (
    <div className="flex h-dvh flex-col bg-gray-50">
      <header className="shrink-0 border-b border-gray-200 bg-white px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push('/rooms')}
            className="text-sm text-gray-400 hover:text-gray-600"
          >
            ← 뒤로
          </button>
          <div className="text-base font-bold text-gray-900">{room_no}호 타임라인</div>
          <div className="ml-auto flex items-center gap-2">
            {countLabel && (
              <span className="text-xs text-gray-400 tabular-nums">{countLabel}</span>
            )}
            <button
              onClick={() => router.push(`/chat?room=${encodeURIComponent(room_no)}`)}
              className="rounded-full bg-blue-600 px-3 py-1 text-xs font-semibold text-white"
            >
              💬 채팅
            </button>
          </div>
        </div>
      </header>

      <FilterBar
        source={source} setSource={setSource}
        status={status} setStatus={setStatus}
      />

      <main className="flex-1 overflow-y-auto px-4 py-4">
        {loading && (
          <div className="pt-16 text-center text-sm text-gray-400">불러오는 중…</div>
        )}

        {!loading && error && (
          <div className="rounded-xl bg-red-50 p-4 text-sm text-red-600">{error}</div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="pt-16 text-center text-sm text-gray-400">
            {events.length === 0 ? `${room_no}호의 이벤트가 없습니다.` : '필터 조건에 맞는 이벤트가 없습니다.'}
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div className="pb-4">
            {filtered.map((ev) => (
              <EventCard key={`${ev.source_type}-${ev.reference_id}`} ev={ev} />
            ))}
          </div>
        )}
      </main>

      <Navigation active="rooms" />
    </div>
  );
}
