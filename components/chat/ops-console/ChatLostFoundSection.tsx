'use client';

import { useMemo, useState } from 'react';
import { ChatPhotoThumb } from '@/components/chat/ChatPhotoLightbox';
import { fetchEnvelope } from '@/lib/api/envelope';
import { LOST_FOUND_STATUS_UI } from '@/lib/ops-events/lostFoundFsm';
import type { LostFoundItem, LostFoundItemWithMatch } from '@/lib/ops-events/types';
import type { GuestMatchView } from '@/lib/stayJournal/stayGuestLookup';
import { formatKSTShort } from '@/lib/formatKST';

type FilterMode = 'open' | 'all';

type EditForm = {
  snap_room_no: string;
  item_description: string;
  found_location: string;
};

type Props = {
  items: LostFoundItemWithMatch[];
  lostFoundEnabled: boolean;
  actorId: string | null;
  onRefreshList: () => void;
};

function LostFoundEditModal({
  item,
  busy,
  onClose,
  onSave
}: {
  item: LostFoundItemWithMatch;
  busy: boolean;
  onClose: () => void;
  onSave: (form: EditForm) => void;
}) {
  const [form, setForm] = useState<EditForm>({
    snap_room_no: item.snap_room_no || '',
    item_description: item.item_description || '',
    found_location: item.found_location || ''
  });

  return (
    <div
      className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`${item.event_no} 수정`}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="w-full max-w-sm rounded-xl bg-white p-4 shadow-xl">
        <div className="text-sm font-extrabold text-gray-900">{item.event_no} 수정</div>
        <div className="mt-3 space-y-2">
          <label className="block text-[10px] font-bold text-gray-500" htmlFor="lf-edit-room">
            객실번호
            <input
              id="lf-edit-room"
              type="text"
              inputMode="numeric"
              maxLength={4}
              value={form.snap_room_no}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  snap_room_no: e.target.value.replace(/[^\d]/g, '').slice(0, 4)
                }))
              }
              placeholder="예: 607"
              className="mt-0.5 w-full rounded-md border border-gray-200 px-2 py-1.5 text-xs text-gray-900"
            />
          </label>
          <label className="block text-[10px] font-bold text-gray-500" htmlFor="lf-edit-desc">
            물건 설명
            <input
              id="lf-edit-desc"
              type="text"
              value={form.item_description}
              onChange={(e) => setForm((f) => ({ ...f, item_description: e.target.value }))}
              className="mt-0.5 w-full rounded-md border border-gray-200 px-2 py-1.5 text-xs text-gray-900"
            />
          </label>
          <label className="block text-[10px] font-bold text-gray-500" htmlFor="lf-edit-memo">
            메모 (임시)
            <textarea
              id="lf-edit-memo"
              value={form.found_location}
              onChange={(e) => setForm((f) => ({ ...f, found_location: e.target.value }))}
              rows={2}
              placeholder="발견 위치·보관 메모 등"
              className="mt-0.5 w-full resize-none rounded-md border border-gray-200 px-2 py-1.5 text-xs text-gray-900"
            />
          </label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-md border border-gray-200 px-3 py-1.5 text-[10px] font-bold text-gray-600 disabled:opacity-40"
          >
            취소
          </button>
          <button
            type="button"
            disabled={busy || !form.item_description.trim()}
            onClick={() => onSave(form)}
            className="rounded-md bg-gray-900 px-3 py-1.5 text-[10px] font-bold text-white disabled:opacity-40"
          >
            {busy ? '…' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}

function formatClock(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = String(v).trim();
  if (!s) return null;
  // already HH:mm or ISO
  const m = s.match(/(\d{1,2}):(\d{2})/);
  if (m) return `${m[1]!.padStart(2, '0')}:${m[2]}`;
  try {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleTimeString('ko-KR', {
        timeZone: 'Asia/Seoul',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
    }
  } catch {
    /* ignore */
  }
  return s;
}

function statusHeaderLabel(status: LostFoundItem['status']): string {
  if (status === 'registered') return '미해결';
  if (status === 'stored') return '보관중';
  if (status === 'returned' || status === 'disposed') return '보관완료';
  return LOST_FOUND_STATUS_UI[status]?.label || status;
}

function auxBadges(item: LostFoundItemWithMatch): string[] {
  const badges: string[] = [];
  const createdMs = new Date(item.created_at).getTime();
  if (Number.isFinite(createdMs) && Date.now() - createdMs < 24 * 60 * 60 * 1000) {
    badges.push('새로 등록');
  }
  if (item.found_location) badges.push('수동');
  if (item.guestMatch?.status === 'exact') badges.push('매칭확인');
  else if (item.guestMatch?.status === 'multiple') badges.push('확인필요');
  return badges;
}

function GuestMatchBlock({ match }: { match?: GuestMatchView | null }) {
  if (!match) {
    return (
      <div className="mt-2 w-full rounded-md bg-white/80 px-2.5 py-2 text-[11px] leading-snug text-gray-500">
        숙박일지 조회중...
      </div>
    );
  }

  if (match.status === 'unavailable') {
    return (
      <div className="mt-2 w-full rounded-md border border-amber-100 bg-amber-50/80 px-2.5 py-2 text-[11px] leading-snug text-amber-800">
        {match.label}
      </div>
    );
  }

  if (match.status === 'none') {
    return (
      <div className="mt-2 w-full rounded-md bg-white/80 px-2.5 py-2 text-[11px] leading-snug text-gray-500">
        ★☆☆☆☆ 숙박일지 매칭 없음
      </div>
    );
  }

  if (match.status === 'multiple') {
    return (
      <div className="mt-2 w-full rounded-md border border-amber-100 bg-amber-50/80 px-2.5 py-2 text-[11px] leading-snug text-amber-950">
        <div className="font-bold break-words">
          {match.starsDisplay} {match.label}
        </div>
        <ol className="mt-1 list-decimal space-y-1 pl-3.5 break-words">
          {match.candidates.map((c, i) => (
            <li key={`${c.guest_name}-${c.stay_date}-${i}`}>
              <span className="font-semibold">
                {c.segmentLabel || '—'}
                {c.stay_date ? ` · ${c.stay_date}` : ''} {c.guest_name}
              </span>
              {c.check_in || c.check_out
                ? ` · ${formatClock(c.check_in) || '?'}~${formatClock(c.check_out) || '?'}`
                : ''}
              {c.phone ? ` · ${c.phone}` : ''}
              {c.reason ? <div className="text-amber-800">{c.reason}</div> : null}
            </li>
          ))}
        </ol>
      </div>
    );
  }

  // exact
  const cin = formatClock(match.check_in);
  const cout = formatClock(match.check_out);
  return (
    <div className="mt-2 w-full rounded-md border border-emerald-100 bg-emerald-50/70 px-2.5 py-2 text-[11px] leading-snug text-emerald-950">
      <div className="font-bold break-words">
        {match.starsDisplay} {match.label}
      </div>
      <div className="mt-0.5 font-semibold break-words">
        {match.segmentLabel || '—'}
        {match.stay_date ? ` · ${match.stay_date}` : ''}
      </div>
      {cin || cout ? (
        <div className="text-emerald-800">
          입실 {cin || '—'} / 퇴실 {cout || '—'}
        </div>
      ) : null}
      {match.guest_name ? <div className="break-words">고객: {match.guest_name}</div> : null}
      {match.phone ? <div className="break-words">전화: {match.phone}</div> : null}
      {match.reservation_source ? <div className="break-words">예약: {match.reservation_source}</div> : null}
    </div>
  );
}

/**
 * Event Center lost-found = list ops panel (no detail page / no /ops navigation).
 * Guest match is automatic from GET enrichment (no "find guest" button).
 */
export default function ChatLostFoundSection({
  items,
  lostFoundEnabled,
  actorId,
  onRefreshList
}: Props) {
  const [filter, setFilter] = useState<FilterMode>('open');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [editItem, setEditItem] = useState<LostFoundItemWithMatch | null>(null);

  const visible = useMemo(() => {
    const sorted = [...items].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    if (filter === 'open') return sorted.filter((x) => x.status === 'registered');
    return sorted.filter((x) =>
      ['registered', 'stored', 'returned', 'disposed', 'cancelled', 'owner_notified'].includes(x.status)
    );
  }, [items, filter]);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      onRefreshList();
      await new Promise((r) => setTimeout(r, 300));
    } finally {
      setRefreshing(false);
    }
  }

  async function handleStore(item: LostFoundItem) {
    if (!actorId || item.status !== 'registered') return;
    setBusyId(item.id);
    const r = await fetchEnvelope<{ item: LostFoundItem }>(
      `/api/ops-events/lost-found/${item.id}/transitions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to_status: 'stored', actor_id: actorId })
      }
    );
    setBusyId(null);
    if (!r.ok) {
      alert(r.message || '보관 처리에 실패했습니다.');
      return;
    }
    onRefreshList();
  }

  async function handleDelete(item: LostFoundItem) {
    if (!actorId) return;
    if (!window.confirm(`${item.event_no}을(를) 삭제할까요?`)) return;
    setBusyId(item.id);
    const r = await fetchEnvelope<{ item: LostFoundItem }>(`/api/ops-events/lost-found/${item.id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor_id: actorId })
    });
    setBusyId(null);
    if (!r.ok) {
      alert(r.message || '삭제에 실패했습니다.');
      return;
    }
    onRefreshList();
  }

  async function handleSaveEdit(item: LostFoundItemWithMatch, form: EditForm) {
    if (!actorId) return;
    setBusyId(item.id);
    const r = await fetchEnvelope<{ item: LostFoundItemWithMatch }>(
      `/api/ops-events/lost-found/${item.id}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actor_id: actorId,
          snap_room_no: form.snap_room_no.trim() || null,
          item_description: form.item_description.trim(),
          found_location: form.found_location.trim() || null
        })
      }
    );
    setBusyId(null);
    if (!r.ok) {
      alert(r.message || '수정에 실패했습니다.');
      return;
    }
    setEditItem(null);
    onRefreshList();
  }

  if (!lostFoundEnabled) {
    return <div className="text-xs text-gray-400">분실물 비활성</div>;
  }

  return (
    <div className="space-y-2">
      {editItem ? (
        <LostFoundEditModal
          item={editItem}
          busy={busyId === editItem.id}
          onClose={() => {
            if (busyId !== editItem.id) setEditItem(null);
          }}
          onSave={(form) => void handleSaveEdit(editItem, form)}
        />
      ) : null}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setFilter('open')}
          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
            filter === 'open' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
          }`}
        >
          미해결
        </button>
        <button
          type="button"
          onClick={() => setFilter('all')}
          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
            filter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
          }`}
        >
          전체
        </button>
        <button
          type="button"
          disabled={refreshing}
          onClick={() => void handleRefresh()}
          className="ml-auto rounded-md border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {refreshing ? '…' : '새로고침'}
        </button>
      </div>

      {visible.length === 0 ? (
        <div className="text-xs text-gray-400">등록 없음</div>
      ) : (
        <ul className="space-y-3">
          {visible.map((item) => {
            const statusUi = LOST_FOUND_STATUS_UI[item.status] || LOST_FOUND_STATUS_UI.registered;
            const busy = busyId === item.id;
            const foundAt = item.snap_message_created_at || item.created_at;
            const aux = auxBadges(item);
            return (
              <li key={item.id} className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                {/* Header: status | aux | LF# */}
                <div className="flex min-w-0 items-center gap-1.5">
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${statusUi.badge}`}
                  >
                    {statusHeaderLabel(item.status)}
                  </span>
                  {aux.map((b) => (
                    <span
                      key={b}
                      className="shrink-0 rounded-full bg-white px-1.5 py-0.5 text-[10px] font-semibold text-gray-600 ring-1 ring-gray-200"
                    >
                      {b}
                    </span>
                  ))}
                  <span className="ml-auto shrink-0 text-[11px] font-extrabold tabular-nums text-gray-900">
                    {item.event_no}
                  </span>
                </div>

                {/* Body: thumb | room/desc + found/reporter */}
                <div className="mt-2.5 flex min-w-0 gap-2.5">
                  {item.snap_image_url ? (
                    <ChatPhotoThumb
                      src={item.snap_image_url}
                      alt={item.event_no}
                      className="h-16 w-16 shrink-0 overflow-hidden rounded-lg"
                      imgClassName="h-16 w-16 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-gray-200 text-[10px] text-gray-500">
                      —
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="break-words text-[12px] font-semibold leading-snug text-gray-900">
                      {item.snap_room_no ? `${item.snap_room_no}호` : '객실 미상'}
                      {item.item_description ? ` · ${item.item_description}` : ''}
                    </div>
                    <div className="mt-0.5 break-words text-[11px] leading-snug text-gray-500">
                      발견 {formatKSTShort(foundAt)}
                      {item.snap_sender ? ` · ${item.snap_sender}` : ''}
                    </div>
                    {item.found_location ? (
                      <div className="mt-0.5 break-words text-[11px] leading-snug text-gray-600">
                        메모: {item.found_location}
                      </div>
                    ) : null}
                  </div>
                </div>

                <GuestMatchBlock match={item.guestMatch} />

                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    disabled={busy || !actorId}
                    onClick={() => setEditItem(item)}
                    className="rounded-md border border-gray-200 bg-white px-2.5 py-1 text-[10px] font-bold text-gray-700 disabled:opacity-40"
                  >
                    수정
                  </button>
                  {item.status === 'registered' ? (
                    <button
                      type="button"
                      disabled={busy || !actorId}
                      onClick={() => void handleStore(item)}
                      className="rounded-md bg-indigo-600 px-2.5 py-1 text-[10px] font-bold text-white disabled:opacity-40"
                    >
                      {busy ? '…' : '보관 처리'}
                    </button>
                  ) : item.status === 'stored' ? (
                    <span className="rounded-md bg-indigo-50 px-2.5 py-1 text-[10px] font-bold text-indigo-700">
                      보관됨
                    </span>
                  ) : null}
                  <button
                    type="button"
                    disabled={busy || !actorId}
                    onClick={() => void handleDelete(item)}
                    className="rounded-md border border-rose-200 bg-white px-2.5 py-1 text-[10px] font-bold text-rose-700 disabled:opacity-40"
                  >
                    삭제
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
