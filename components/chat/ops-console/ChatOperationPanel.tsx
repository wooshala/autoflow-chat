'use client';

import { useRouter } from 'next/navigation';
import { LOST_FOUND_STATUS_UI } from '@/lib/ops-events/lostFoundFsm';
import { MOCK_MAINTENANCE_ROWS, MOCK_RECENT_WORK_ROWS } from '@/lib/chat/opsConsoleMock';
import type { LostFoundItem } from '@/lib/ops-events/types';
import type { ChatMessage } from '@/lib/types';
import { formatKSTShort } from '@/lib/formatKST';

type Props = {
  selectedRoomNo: string | null;
  recentPhotoMessage: ChatMessage | null;
  lostFoundItems: LostFoundItem[];
  lostFoundEnabled: boolean;
  onRegisterLostFound?: (msg: ChatMessage) => void;
  onSelectRoom: (roomNo: string | null) => void;
  /** Layout PoC: keep /chat — do not navigate to /ops/lost-found */
  stayOnChat?: boolean;
};

export default function ChatOperationPanel({
  selectedRoomNo,
  recentPhotoMessage,
  lostFoundItems,
  lostFoundEnabled,
  onRegisterLostFound,
  onSelectRoom,
  stayOnChat = false
}: Props) {
  const router = useRouter();
  const roomLabel = selectedRoomNo ? `${selectedRoomNo}호` : '전체';

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-l border-gray-200 bg-gray-50 lg:w-80">
      <div className="border-b border-gray-200 bg-white px-3 py-2.5">
        <div className="text-xs font-bold text-gray-500">선택 객실</div>
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="text-lg font-extrabold text-gray-900">{roomLabel}</span>
          {selectedRoomNo ? (
            <button
              type="button"
              onClick={() => onSelectRoom(null)}
              className="text-[10px] font-semibold text-blue-600"
            >
              전체
            </button>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {/* 최근 사진 — real */}
        <section className="rounded-xl border border-gray-200 bg-white p-3">
          <div className="text-xs font-bold text-gray-800">최근 사진 메시지</div>
          {recentPhotoMessage?.image_url ? (
            <>
              <img
                src={recentPhotoMessage.image_url}
                alt="최근 사진"
                className="mt-2 h-28 w-full rounded-lg object-cover ring-1 ring-gray-200"
              />
              <div className="mt-1.5 text-[10px] text-gray-500">
                {recentPhotoMessage.room_no ? `${recentPhotoMessage.room_no}호 · ` : ''}
                {formatKSTShort(recentPhotoMessage.created_at)}
              </div>
            </>
          ) : (
            <div className="mt-2 rounded-lg bg-gray-100 py-8 text-center text-xs text-gray-400">사진 없음</div>
          )}
        </section>

        {/* 빠른 등록 */}
        <section className="rounded-xl border border-amber-200 bg-amber-50/80 p-3">
          <div className="text-xs font-bold text-amber-900">빠른 등록</div>
          {recentPhotoMessage?.image_url ? (
            <img
              src={recentPhotoMessage.image_url}
              alt=""
              className="mt-2 h-16 w-full rounded-lg object-cover opacity-90"
            />
          ) : null}
          <div className="mt-2 grid grid-cols-1 gap-1.5">
            <button
              type="button"
              disabled={!lostFoundEnabled || !recentPhotoMessage || !onRegisterLostFound}
              onClick={() => recentPhotoMessage && onRegisterLostFound?.(recentPhotoMessage)}
              className="rounded-lg bg-white px-3 py-2 text-left text-xs font-bold text-gray-800 shadow-sm ring-1 ring-gray-200 disabled:opacity-40"
            >
              👜 분실물 등록
            </button>
            <button
              type="button"
              disabled
              className="rounded-lg bg-white/60 px-3 py-2 text-left text-xs font-semibold text-gray-400 ring-1 ring-gray-200"
            >
              🔧 시설 고장 등록
            </button>
            <button
              type="button"
              disabled
              className="rounded-lg bg-white/60 px-3 py-2 text-left text-xs font-semibold text-gray-400 ring-1 ring-gray-200"
            >
              📝 기타 등록
            </button>
          </div>
        </section>

        {/* 분실물 — real */}
        <section className="rounded-xl border border-gray-200 bg-white p-3">
          <div className="flex items-center justify-between">
            <div className="text-xs font-bold text-gray-800">분실물</div>
            {lostFoundEnabled && !stayOnChat ? (
              <button
                type="button"
                onClick={() => router.push('/ops/lost-found')}
                className="text-[10px] font-semibold text-blue-600"
              >
                전체
              </button>
            ) : null}
          </div>
          <ul className="mt-2 space-y-2">
            {lostFoundItems.length === 0 ? (
              <li className="text-xs text-gray-400">등록 없음</li>
            ) : (
              lostFoundItems.slice(0, 5).map((item) => {
                const ui = LOST_FOUND_STATUS_UI[item.status];
                return (
                  <li key={item.id}>
                    {stayOnChat ? (
                      <div className="flex w-full gap-2 rounded-lg bg-gray-50 p-2 text-left">
                        {item.snap_image_url ? (
                          <img
                            src={item.snap_image_url}
                            alt=""
                            className="h-12 w-12 shrink-0 rounded-md object-cover"
                          />
                        ) : (
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-gray-200 text-[10px] text-gray-500">
                            —
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-bold text-gray-900">
                            {item.snap_room_no ? `${item.snap_room_no}호` : item.event_no}
                          </div>
                          <div className="text-[10px] text-gray-500">{formatKSTShort(item.created_at)}</div>
                          <span className={`mt-0.5 inline-block rounded-full px-1.5 py-0 text-[10px] font-bold ${ui.badge}`}>
                            {ui.label}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => router.push(`/ops/lost-found/${item.id}`)}
                        className="flex w-full gap-2 rounded-lg bg-gray-50 p-2 text-left hover:bg-gray-100"
                      >
                        {item.snap_image_url ? (
                          <img
                            src={item.snap_image_url}
                            alt=""
                            className="h-12 w-12 shrink-0 rounded-md object-cover"
                          />
                        ) : (
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-gray-200 text-[10px] text-gray-500">
                            —
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-bold text-gray-900">
                            {item.snap_room_no ? `${item.snap_room_no}호` : item.event_no}
                          </div>
                          <div className="text-[10px] text-gray-500">{formatKSTShort(item.created_at)}</div>
                          <span className={`mt-0.5 inline-block rounded-full px-1.5 py-0 text-[10px] font-bold ${ui.badge}`}>
                            {ui.label}
                          </span>
                        </div>
                      </button>
                    )}
                  </li>
                );
              })
            )}
          </ul>
        </section>

        {/* 시설 고장 — mock */}
        <section className="rounded-xl border border-gray-200 bg-white p-3">
          <div className="text-xs font-bold text-gray-800">시설 고장</div>
          <span className="text-[10px] text-gray-400">(PoC mock)</span>
          <ul className="mt-2 space-y-1.5">
            {MOCK_MAINTENANCE_ROWS.map((row) => (
              <li
                key={row.id}
                className="flex items-center justify-between rounded-lg bg-gray-50 px-2 py-1.5 text-xs"
              >
                <span className="font-semibold text-gray-800">
                  {row.room_no}호 {row.title}
                </span>
                <span className="text-[10px] text-gray-400">{row.time_label}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* 최근 작업 — mock */}
        <section className="rounded-xl border border-gray-200 bg-white p-3">
          <div className="text-xs font-bold text-gray-800">최근 작업 / 상태 요약</div>
          <span className="text-[10px] text-gray-400">(PoC mock)</span>
          <ul className="mt-2 space-y-1">
            {MOCK_RECENT_WORK_ROWS.map((row) => (
              <li key={row.id} className="flex justify-between gap-2 text-xs text-gray-700">
                <span className="truncate">{row.text}</span>
                <span className="shrink-0 text-[10px] text-gray-400">{row.time_label}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </aside>
  );
}
