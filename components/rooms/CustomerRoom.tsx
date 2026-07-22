'use client';

// Phase 1C — customer room center, built from the Phase 1B renderers (CustomerRoomTimeline
// + CustomerReplyComposer) over the shared mock store.
//
// Phase 1H.2 — a room wired to a LIVE guest channel (via channels.ts, the single source of
// truth) renders the Canonical GuestChatPanel instead of the mock stack.
//
// Phase 2C — adds a staff "객실 이동" (room move) action next to "대화 종료": it notifies the
// CURRENT guest to rescan the new room's QR and then closes the session. NOT a session transfer /
// merge / carry-over — the guest starts a fresh session on the new room's channel by scanning its
// QR. The notice is sent first; the session is closed only after the notice is stored, and a
// close-only retry (never re-sending the notice) covers the message-sent / close-failed case.

import { useCallback, useState } from 'react';

import { useRoomNavigation } from './RoomNavigationContext';
import { RoomHeader } from './RoomHeader';
import { CustomerRoomTimeline } from '@/components/customer-service/CustomerRoomTimeline';
import { CustomerReplyComposer } from '@/components/customer-service/CustomerReplyComposer';
import { GuestChatPanel } from '@/components/guest-spike/GuestChatPanel';
import { StaffAuthModal } from '@/components/guest-spike/StaffAuthModal';
import { useStaffSession } from '@/components/guest-spike/useStaffSession';
import { lookupChannelKey } from '@/lib/guest-spike/channels';
import { closeGuestSession, roomMove } from '@/lib/guest-spike/api';
import { roomNoFromChannelKey } from '@/lib/guest-spike/customerContextView';
import { STAFF_VALID_ROOM_SET } from '@/lib/chat/staffRoomOptions';
import { isGuestLang, type GuestLang } from '@/lib/guest-spike/languages';
import type { Room } from '@/lib/rooms/roomTypes';

export function CustomerRoom({ room }: { room: Room }) {
  const { customerMessages, appendCustomerMessage, reportChannelLanguage, markChannelViewed, channelActiveSessionId } =
    useRoomNavigation();
  const channelKey = lookupChannelKey(room.id); // SSOT — no hardcoded room branch
  const currentRoomNo = channelKey ? roomNoFromChannelKey(channelKey) : null;
  const lang = room.language ?? 'en';
  // Phase 1H.7 — reading/replying to guest messages requires a REAL staff session (server
  // validates the Bearer token). Only the customer-chat area is gated, not the rest of /chat.
  const { hasSession, refresh } = useStaffSession();
  const [loginOpen, setLoginOpen] = useState(false);
  const [preferred, setPreferred] = useState<GuestLang | null>(null);
  const onChannelMeta = useCallback(
    (m: {
      preferred_language: string | null;
      session_status: 'open' | 'none' | null;
      latest_guest_message_at: string | null;
    }) => {
      const p = isGuestLang(m.preferred_language) ? m.preferred_language : null;
      setPreferred(p);
      reportChannelLanguage(room.id, p, m.session_status);
      if (channelKey) markChannelViewed(channelKey, m.latest_guest_message_at);
    },
    [reportChannelLanguage, markChannelViewed, room.id, channelKey],
  );

  const endSession = useCallback(async () => {
    if (!channelKey) return;
    if (!window.confirm('현재 고객과의 대화를 종료합니다. 고객은 더 이상 접근할 수 없습니다. 계속할까요?')) return;
    await closeGuestSession(channelKey);
  }, [channelKey]);

  // ── Phase 2C — room move ─────────────────────────────────────────────────────────────
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveTarget, setMoveTarget] = useState('');
  const [moveBusy, setMoveBusy] = useState(false);
  const [moveMsg, setMoveMsg] = useState<string | null>(null);
  const [closeOnly, setCloseOnly] = useState(false); // notice already sent → only the close may retry

  const openMove = useCallback(() => {
    setMoveTarget('');
    setMoveMsg(null);
    setCloseOnly(false);
    setMoveOpen(true);
  }, []);

  const submitMove = useCallback(async () => {
    if (!channelKey || moveBusy) return;
    const t = moveTarget.trim();
    // client-side mirror of the server validation (server is authoritative)
    if (!t) return setMoveMsg('새 객실번호를 입력해 주세요.');
    if (!STAFF_VALID_ROOM_SET.has(t)) return setMoveMsg('존재하지 않는 객실번호입니다.');
    if (currentRoomNo && t === currentRoomNo) return setMoveMsg('현재 객실과 동일한 번호입니다.');
    setMoveBusy(true);
    setMoveMsg(null);
    const res = await roomMove(channelKey, t, channelActiveSessionId[room.id] ?? null);
    setMoveBusy(false);
    if (res.ok) {
      setMoveOpen(false);
      window.alert(`${t}호 QR 재촬영 안내를 보냈고 기존 대화를 종료했습니다.`);
      return;
    }
    if (res.kind === 'close_failed') {
      // notice was sent — never re-send it; offer a close-only retry
      setCloseOnly(true);
      setMoveMsg('안내 메시지는 전송되었으나 대화 종료에 실패했습니다. 종료만 다시 시도해 주세요.');
      return;
    }
    if (res.kind === 'no_session') return setMoveMsg('활성 고객 세션이 없거나 세션이 변경되었습니다. 새로고침 후 확인해 주세요.');
    if (res.kind === 'validation') return setMoveMsg('객실번호를 확인해 주세요.');
    if (res.kind === 'message_failed') return setMoveMsg('안내 메시지 전송에 실패했습니다. 다시 시도해 주세요.');
    setMoveMsg('처리 상태를 확인할 수 없습니다. 새로고침 후 확인해 주세요.');
  }, [channelKey, moveBusy, moveTarget, currentRoomNo, channelActiveSessionId, room.id]);

  const retryClose = useCallback(async () => {
    if (!channelKey || moveBusy) return;
    setMoveBusy(true);
    try {
      await closeGuestSession(channelKey); // close ONLY — never re-sends the notice
      setMoveOpen(false);
      setCloseOnly(false);
      setMoveMsg(null);
    } catch {
      setMoveMsg('대화 종료에 실패했습니다. 다시 시도해 주세요.');
    } finally {
      setMoveBusy(false);
    }
  }, [channelKey, moveBusy]);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#B2C7D9]">
      <RoomHeader room={room} />
      {channelKey ? (
        hasSession ? (
          <>
            <div className="flex shrink-0 items-center justify-end gap-2 border-b border-gray-300/40 bg-[#B2C7D9] px-3 py-1">
              <button
                type="button"
                onClick={openMove}
                className="rounded border border-blue-300 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100"
              >
                객실 이동
              </button>
              <button
                type="button"
                onClick={() => void endSession()}
                className="rounded border border-red-300 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
              >
                대화 종료
              </button>
            </div>
            <GuestChatPanel
              channelKey={channelKey}
              viewerLang="ko"
              counterpartLang={preferred ?? 'ko'}
              ownSender="staff"
              asStaff
              ownLabel="직원(나)"
              otherLabel="고객"
              emptyText="고객 메시지를 기다리는 중…"
              inputPlaceholder="한국어로 답변 입력 (Enter 전송)"
              sendLabel="전송"
              onChannelMeta={onChannelMeta}
              disabledNotice={
                preferred
                  ? undefined
                  : '고객 언어가 선택되지 않았습니다. 고객이 QR에서 언어를 선택한 뒤 답변할 수 있습니다.'
              }
            />
            {moveOpen && (
              <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
                <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl">
                  <div className="text-sm font-bold text-gray-900">객실 이동</div>
                  <p className="mt-2 text-xs leading-relaxed text-gray-600">
                    입력한 객실의 QR 재촬영 안내를 현재 고객에게 보내고 이 대화를 종료합니다. 종료 후에는 기존 채팅을 다시 사용할 수 없습니다.
                  </p>
                  <label className="mt-3 block">
                    <span className="mb-1 block text-xs font-medium text-gray-500">새 객실번호</span>
                    <input
                      value={moveTarget}
                      onChange={(e) => setMoveTarget(e.target.value)}
                      inputMode="numeric"
                      placeholder="예: 607"
                      disabled={moveBusy || closeOnly}
                      className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm text-gray-900 focus:border-blue-400 focus:outline-none"
                    />
                  </label>
                  {moveMsg && <p className="mt-2 text-[11px] leading-snug text-amber-700">{moveMsg}</p>}
                  <div className="mt-4 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setMoveOpen(false)}
                      disabled={moveBusy}
                      className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      취소
                    </button>
                    {closeOnly ? (
                      <button
                        type="button"
                        onClick={() => void retryClose()}
                        disabled={moveBusy}
                        className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        {moveBusy ? '종료 중…' : '대화 종료 다시 시도'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void submitMove()}
                        disabled={moveBusy}
                        className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        {moveBusy ? '처리 중…' : '안내 후 종료'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
            <div className="text-sm text-gray-700">고객 채팅을 보려면 직원 인증이 필요합니다.</div>
            <button
              type="button"
              onClick={() => setLoginOpen(true)}
              className="rounded-lg bg-[#FEE500] px-4 py-2 text-sm font-bold text-gray-900"
            >
              직원 인증
            </button>
            {loginOpen && (
              <StaffAuthModal
                onClose={() => setLoginOpen(false)}
                onSuccess={() => {
                  refresh();
                  setLoginOpen(false);
                }}
              />
            )}
          </div>
        )
      ) : (
        <>
          <CustomerRoomTimeline guestLang={lang} messages={customerMessages[room.id] ?? []} />
          <CustomerReplyComposer key={room.id} guestLang={lang} onSend={(m) => appendCustomerMessage(room.id, m)} />
        </>
      )}
    </div>
  );
}
