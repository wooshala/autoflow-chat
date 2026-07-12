'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChatPhotoThumb } from '@/components/chat/ChatPhotoLightbox';
import type { MaintenanceTicket, TicketStatus } from '@/lib/types';
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

type Props = {
  /** 값이 바뀌면 목록을 다시 불러온다(등록 성공 후 갱신 신호). */
  refreshKey?: number;
};

/**
 * Event Center 시설고장 탭 실데이터.
 * GET /api/maintenance/list ({ tickets }, 각 ticket에 image_url 포함)를 조회해 카드로 렌더한다.
 * 사진: 목록 API가 배치 조회로 붙여준 image_url을 카드 안(텍스트 아래)에 바로 표시한다.
 * 카드별 추가 사진 요청 없음(N+1 없음). 사진 클릭 시 공통 ChatPhotoLightbox로 확대.
 * 카드 나머지 영역 클릭은 기존대로 /maintenance/[id] 상세로 이동.
 */
export default function ChatMaintenanceSection({ refreshKey }: Props) {
  const router = useRouter();
  const [tickets, setTickets] = useState<TicketWithPhoto[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  // 사진 로딩 실패한 ticket id들 → 해당 카드는 broken-image 대신 '사진 없음'으로 처리.
  const [brokenIds, setBrokenIds] = useState<Set<string>>(new Set());

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
      // 실패를 mock으로 숨기지 않는다. 오류 상태를 그대로 노출.
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
        return (
          <li key={t.id} className="overflow-hidden rounded-lg border border-gray-200 bg-white">
            {/* 텍스트 영역: 클릭 시 기존 상세 페이지로 이동(변경 없음) */}
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

            {/* 사진: 텍스트 아래 가로형. 있으면 클릭 시 공통 lightbox 확대. */}
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

            {/* 로딩 실패 감지(숨김): 실패 시 해당 카드만 '사진 없음'으로 전환(카드 전체 안 깨짐) */}
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
          </li>
        );
      })}
    </ul>
  );
}
