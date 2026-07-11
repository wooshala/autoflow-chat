'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { MaintenanceTicket, TicketStatus } from '@/lib/types';
import { formatKSTShort } from '@/lib/formatKST';

/** 기존 tickets 상태만 사용 (신규 상태 없음). */
const STATUS_UI: Record<TicketStatus, { label: string; badge: string }> = {
  open: { label: '접수', badge: 'bg-amber-100 text-amber-800' },
  progress: { label: '처리 중', badge: 'bg-blue-100 text-blue-800' },
  done: { label: '완료', badge: 'bg-gray-200 text-gray-600' }
};

type LoadState = 'loading' | 'ready' | 'error';

type Props = {
  /** 값이 바뀌면 목록을 다시 불러온다(등록 성공 후 갱신 신호). */
  refreshKey?: number;
};

/**
 * Event Center 시설고장 탭 실데이터.
 * GET /api/maintenance/list (기존 API, { tickets })를 조회해 카드로 렌더한다.
 * 사진 썸네일: list API가 image_url을 반환하지 않으므로 placeholder(🔧)를 쓰고,
 * 실제 사진은 카드 클릭 시 기존 상세(/maintenance/[id])에서 본다.
 */
export default function ChatMaintenanceSection({ refreshKey }: Props) {
  const router = useRouter();
  const [tickets, setTickets] = useState<MaintenanceTicket[]>([]);
  const [state, setState] = useState<LoadState>('loading');

  const load = useCallback(async () => {
    setState('loading');
    try {
      const res = await fetch('/api/maintenance/list');
      if (!res.ok) throw new Error(`maintenance list ${res.status}`);
      const json = (await res.json()) as { tickets?: MaintenanceTicket[] };
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
        return (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => router.push(`/maintenance/${t.id}`)}
              className="flex w-full items-center gap-2.5 rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-left hover:bg-gray-50"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-gray-100 text-lg">
                🔧
              </span>
              <span className="min-w-0 flex-1">
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
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
