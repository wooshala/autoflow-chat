'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChatPhotoThumb } from '@/components/chat/ChatPhotoLightbox';
import type { IssueType, MaintenanceTicket, TicketStatus } from '@/lib/types';
import { ISSUE_TYPES } from '@/lib/types';
import { formatKSTShort } from '@/lib/formatKST';

/** 기존 tickets 상태만 사용 (신규 상태 없음). */
const STATUS_UI: Record<TicketStatus, { label: string; badge: string }> = {
  open: { label: '접수', badge: 'bg-amber-100 text-amber-800' },
  progress: { label: '처리 중', badge: 'bg-blue-100 text-blue-800' },
  done: { label: '완료', badge: 'bg-gray-200 text-gray-600' }
};

type LoadState = 'loading' | 'ready' | 'error';

/** 목록 응답 티켓: 기존 필드 + image_url(additive). */
type TicketWithPhoto = MaintenanceTicket & { image_url?: string | null };

type EditForm = { room_no: string; issue_type: IssueType; description: string };

type Props = {
  /** 값이 바뀌면 목록을 다시 불러온다(등록 성공 후 갱신 신호). */
  refreshKey?: number;
};

/**
 * Event Center 시설고장 탭 실데이터.
 * GET /api/maintenance/list ({ tickets }, image_url 포함)로 카드 렌더 + 사진(텍스트 아래) 표시.
 * 카드 액션(기존 maintenance API 재사용, 분실물 로직 복제 아님):
 *  - 수정: 카드 내 작은 편집 모드에서 객실번호/유형/설명만 PATCH (status는 그대로 유지, 사진 대상 아님)
 *  - 미해결: PATCH status='open' / 수리완료: PATCH status='done' (기존 상태값)
 * 카드 텍스트 영역 클릭은 기존대로 /maintenance/[id] 이동. 액션/사진 클릭은 이동과 분리.
 */
export default function ChatMaintenanceSection({ refreshKey }: Props) {
  const router = useRouter();
  const [tickets, setTickets] = useState<TicketWithPhoto[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [brokenIds, setBrokenIds] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ room_no: '', issue_type: '기타', description: '' });

  const load = useCallback(async () => {
    setState('loading');
    setBrokenIds(new Set());
    try {
      const res = await fetch('/api/maintenance/list');
      if (!res.ok) throw new Error(`maintenance list ${res.status}`);
      const json = (await res.json()) as { tickets?: TicketWithPhoto[] };
      // API가 created_at DESC로 이미 정렬 → 프론트 재정렬하지 않음.
      setTickets(Array.isArray(json?.tickets) ? json.tickets : []);
      setState('ready');
    } catch {
      setState('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const markBroken = useCallback((id: string) => {
    setBrokenIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  async function patchTicket(id: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/maintenance/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`maintenance patch ${res.status}`);
    return res.json();
  }

  // 미해결(open) / 수리완료(done) — 기존 상태값만 사용.
  async function handleStatus(t: TicketWithPhoto, toStatus: TicketStatus) {
    if (busyId || t.status === toStatus) return; // 처리 중이거나 동일 상태면 요청 안 보냄
    setBusyId(String(t.id));
    try {
      await patchTicket(String(t.id), { status: toStatus });
      await load();
    } catch {
      alert('상태 변경에 실패했습니다.');
    } finally {
      setBusyId(null);
    }
  }

  function openEdit(t: TicketWithPhoto) {
    setEditForm({
      room_no: t.room_no || '',
      issue_type: (t.issue_type as IssueType) || '기타',
      description: t.description || ''
    });
    setEditId(String(t.id));
  }

  function cancelEdit() {
    setEditId(null); // 취소: 저장 없이 기존 값 유지
  }

  async function saveEdit(t: TicketWithPhoto) {
    if (busyId) return;
    setBusyId(String(t.id));
    try {
      // status는 기존 값 그대로 유지, 필드만 수정. 사진은 대상 아님.
      await patchTicket(String(t.id), {
        status: t.status,
        room_no: editForm.room_no.trim(),
        issue_type: editForm.issue_type,
        description: editForm.description.trim()
      });
      setEditId(null);
      await load();
    } catch {
      alert('수정에 실패했습니다.');
    } finally {
      setBusyId(null);
    }
  }

  if (state === 'loading') {
    return <p className="py-6 text-center text-xs text-gray-400">시설고장을 불러오는 중…</p>;
  }

  if (state === 'error') {
    return (
      <div className="py-6 text-center text-xs text-gray-500">
        <p>시설고장 목록을 불러오지 못했습니다.</p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-2 rounded-lg border border-gray-300 bg-white px-3 py-1 font-semibold text-gray-700 hover:bg-gray-50"
        >
          다시 시도
        </button>
      </div>
    );
  }

  if (tickets.length === 0) {
    return <p className="py-6 text-center text-xs text-gray-400">등록된 시설고장이 없습니다.</p>;
  }

  return (
    <ul className="space-y-1.5">
      {tickets.map((t) => {
        const st = STATUS_UI[t.status] ?? STATUS_UI.open;
        const hasPhoto = Boolean(t.image_url) && !brokenIds.has(String(t.id));
        const busy = busyId === String(t.id);
        const editing = editId === String(t.id);
        return (
          <li key={t.id} className="overflow-hidden rounded-lg border border-gray-200 bg-white">
            {editing ? (
              /* 작은 인라인 편집 모드: 객실번호/유형/설명만 (사진 수정 없음) */
              <div className="space-y-1.5 px-2.5 py-2">
                <label className="block text-[10px] font-bold text-gray-500">
                  객실번호
                  <input
                    type="text"
                    value={editForm.room_no}
                    onChange={(e) => setEditForm((f) => ({ ...f, room_no: e.target.value }))}
                    placeholder="예: 607"
                    className="mt-0.5 w-full rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-900"
                  />
                </label>
                <label className="block text-[10px] font-bold text-gray-500">
                  유형
                  <select
                    value={editForm.issue_type}
                    onChange={(e) => setEditForm((f) => ({ ...f, issue_type: e.target.value as IssueType }))}
                    className="mt-0.5 w-full rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-900"
                  >
                    {ISSUE_TYPES.map((it) => (
                      <option key={it} value={it}>
                        {it}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-[10px] font-bold text-gray-500">
                  설명
                  <textarea
                    value={editForm.description}
                    onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                    rows={2}
                    className="mt-0.5 w-full resize-none rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-900"
                  />
                </label>
                <div className="flex justify-end gap-1.5">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={cancelEdit}
                    className="rounded-md border border-gray-200 px-2.5 py-1 text-[10px] font-bold text-gray-600 disabled:opacity-40"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void saveEdit(t)}
                    className="rounded-md bg-gray-900 px-2.5 py-1 text-[10px] font-bold text-white disabled:opacity-40"
                  >
                    {busy ? '…' : '저장'}
                  </button>
                </div>
              </div>
            ) : (
              /* 텍스트 영역: 클릭 시 기존 상세 페이지로 이동(변경 없음) */
              <button
                type="button"
                onClick={() => router.push(`/maintenance/${t.id}`)}
                className="block w-full px-2.5 py-2 text-left hover:bg-gray-50"
              >
                <span className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-gray-900">
                    {t.room_no ? `${t.room_no}호` : '객실 미지정'}
                  </span>
                  <span className="text-[11px] text-gray-500">{t.issue_type}</span>
                  <span className={`ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${st.badge}`}>
                    {st.label}
                  </span>
                </span>
                <span className="mt-0.5 block truncate text-[11px] text-gray-600">
                  {t.description || '(설명 없음)'}
                </span>
                <span className="mt-0.5 block text-[10px] text-gray-400">{formatKSTShort(t.created_at)}</span>
              </button>
            )}

            {/* 사진: 텍스트 아래 가로형. 있으면 클릭 시 공통 lightbox 확대. (편집 중에도 유지) */}
            {hasPhoto ? (
              <div className="px-2.5 pb-2">
                <ChatPhotoThumb
                  src={t.image_url as string}
                  alt={`${t.room_no ? `${t.room_no}호 ` : ''}시설고장 사진`}
                  className="block w-full overflow-hidden rounded-md"
                  imgClassName="w-full max-h-56 rounded-md object-cover"
                />
              </div>
            ) : (
              <div className="px-2.5 pb-2 text-[10px] text-gray-400">사진 없음</div>
            )}

            {/* 로딩 실패 감지(숨김): 실패 시 해당 카드만 '사진 없음'으로 전환 */}
            {t.image_url && !brokenIds.has(String(t.id)) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={t.image_url}
                alt=""
                aria-hidden="true"
                className="hidden"
                onError={() => markBroken(String(t.id))}
              />
            ) : null}

            {/* 액션 버튼: [수정] [미해결] [수리완료] — 편집 모드가 아닐 때만. 카드 이동과 분리. */}
            {!editing ? (
              <div className="flex flex-wrap items-center gap-1.5 border-t border-gray-100 px-2.5 py-1.5">
                <button
                  type="button"
                  disabled={busy}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    openEdit(t);
                  }}
                  className="rounded-md border border-gray-200 bg-white px-2.5 py-1 text-[10px] font-bold text-gray-700 disabled:opacity-40"
                >
                  수정
                </button>
                <button
                  type="button"
                  disabled={busy || t.status === 'open'}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    void handleStatus(t, 'open');
                  }}
                  className="rounded-md border border-amber-200 bg-white px-2.5 py-1 text-[10px] font-bold text-amber-800 disabled:opacity-40"
                >
                  {busy ? '…' : '미해결'}
                </button>
                <button
                  type="button"
                  disabled={busy || t.status === 'done'}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    void handleStatus(t, 'done');
                  }}
                  className="rounded-md bg-emerald-600 px-2.5 py-1 text-[10px] font-bold text-white disabled:opacity-40"
                >
                  {busy ? '…' : '수리완료'}
                </button>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
