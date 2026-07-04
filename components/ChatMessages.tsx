"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import AiActionBadge from "@/components/AiActionBadge";
import { AiAction, ChatMessage } from "@/lib/types";
import { formatKSTShort } from "@/lib/formatKST";
import { getMessageDisplayParts } from "@/lib/chat/displayMessageText";
import { isEmojiOnlyMessage } from "@/lib/chat/isEmojiOnlyMessage";
import { isUrgentMessage } from "@/lib/chat/messagePriority";
import MessageOverflowMenu from "@/components/chat/MessageOverflowMenu";

type Props = {
  messages: ChatMessage[];
  currentUserId?: string | null;
  isAdmin?: boolean;
  deletingMessageId?: string | null;
  onDeleteMessage?: (msg: ChatMessage) => void | Promise<void>;
  onCreateManualTicket?: (msg: ChatMessage) => void;
};

function translated(msg: ChatMessage, lang: string) {
  const { primary } = getMessageDisplayParts(msg, lang === 'ru' ? 'ru' : 'ko');
  return primary;
}

function isMaintenanceSystemMessage(msg: ChatMessage, renderedText: string): boolean {
  const raw = String(msg.message || "").trim();
  const view = String(renderedText || "").trim();
  const pattern = /^🔧\s*\d{3,4}호\s*유지보수\s*접수됨$/;
  return pattern.test(raw) || pattern.test(view);
}

function isGenericPhotoCaption(text: string): boolean {
  const t = String(text || '').trim();
  return !t || /^(사진|\d{3,4}호?\s*사진)$/i.test(t);
}

function photoStatusLabel(msg: ChatMessage, displayPrimary: string): string | null {
  if (!msg.image_url) return null;
  const primary = String(displayPrimary || msg.message || '').trim();
  if (isGenericPhotoCaption(primary)) return null;
  const stripped = primary.replace(/^\d{3,4}호?\s*/, '').trim();
  return stripped || primary;
}

// The room badge (🏠 {room}호) already shows the room number, and inbound
// messages often start with the same room (e.g. "301 짐있음"). Drop a leading
// "{room}" / "{room}호" from the body so the room is not displayed twice
// ("301 301 짐있음" → "301 짐있음"). Render-time only; the stored text is intact.
function stripDuplicateRoomPrefix(text: string, roomNo?: string | null): string {
  const t = String(text || '');
  const room = String(roomNo || '').trim();
  if (!room) return t;
  const esc = room.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^\\s*${esc}\\s*호?\\s*[)\\].:·\\-]?\\s*`);
  const stripped = t.replace(re, '');
  return stripped.trim() ? stripped : t;
}

export default function ChatMessages({
  messages,
  currentUserId,
  isAdmin = false,
  deletingMessageId = null,
  onDeleteMessage,
  onCreateManualTicket
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <>
      {messages.map((msg) => {
        if (!msg?.id) return null;
        const isPc = msg.sender_side === "pc";
        const msgText = translated(msg, "ko");
        const { primary: displayPrimary, secondary: displaySecondary } = getMessageDisplayParts(msg, 'ko', {
          logContext: 'pc'
        });
        const isDeleted = Boolean(msg.is_deleted);
        const urgent = isUrgentMessage(msg);
        const statusLabel = photoStatusLabel(msg, displayPrimary);
        const displayBody = stripDuplicateRoomPrefix(displayPrimary, msg.room_no);
        const displaySecondaryBody = displaySecondary
          ? stripDuplicateRoomPrefix(displaySecondary, msg.room_no)
          : displaySecondary;
        const emojiOnly =
          !isDeleted && !msg.image_url && isEmojiOnlyMessage(displayBody || msg.message || '');
        const isImageOnly =
          !isDeleted && Boolean(msg.image_url) && !statusLabel && isGenericPhotoCaption(displayPrimary || msg.message || '');
        const isSystemEvent = isMaintenanceSystemMessage(msg, msgText);

        // 아바타 이니셜
        const initial = (msg.user?.name || "직")[0];

        // 유지보수 시스템 메시지 (pill 형태)
        if (isSystemEvent) {
          return (
            <div key={msg.id} className={`flex w-full ${isPc ? "justify-end" : "justify-start"}`}>
              <div className="max-w-[78%] py-1">
                <div
                  className={`rounded-full px-3 py-1 border ${
                    isDeleted
                      ? "border-gray-100 bg-gray-50/90 text-[10px] font-normal text-gray-400/90"
                      : "bg-amber-50 text-xs text-amber-700 border-amber-200"
                  }`}
                >
                  {isDeleted ? "삭제된 메시지입니다" : msgText}
                </div>
              </div>
            </div>
          );
        }

        const isDeletingThis = deletingMessageId != null && String(deletingMessageId) === String(msg.id);
        const deleteBusyGlobal = deletingMessageId != null;
        const isOwnMessage = Boolean(currentUserId) && String(msg.user_id) === String(currentUserId);
        const canDelete =
          (isOwnMessage || isAdmin) &&
          !isDeleted &&
          typeof onDeleteMessage === "function";
        const showDeleteBtn = canDelete;
        const deleteDisabled = isDeletingThis || (deleteBusyGlobal && !isDeletingThis);

        async function handleDeleteClick() {
          if (!onDeleteMessage || isDeleted || deleteDisabled) return;
          const confirmText = isOwnMessage ? "삭제하시겠습니까?" : "관리자 권한으로 삭제하시겠습니까?";
          if (!confirm(confirmText)) return;
          await onDeleteMessage(msg);
        }

        const showManualTicketAction =
          !isDeleted && !msg.ticket_id && !emojiOnly && typeof onCreateManualTicket === "function";
        const overflowItems = showManualTicketAction
          ? [{ id: "manual-ticket", label: "수동 티켓 생성", onClick: () => onCreateManualTicket!(msg) }]
          : [];

        return (
          // 카카오: 내 메시지=오른쪽, 상대=왼쪽 + 아바타
          <div key={msg.id} className={`flex w-full gap-2 ${isPc ? "justify-end" : "justify-start"}`}>

            {/* 상대방 아바타 — 왼쪽 메시지에만 표시 */}
            {!isPc && (
              <div className="w-9 h-9 shrink-0 rounded-full bg-gray-500 flex items-center justify-center text-white text-sm font-bold self-start mt-5">
                {initial}
              </div>
            )}

            {/* 이름 + [말풍선 + 시간] */}
            <div className={`flex flex-col gap-0.5 max-w-[72%] ${isPc ? "items-end" : "items-start"}`}>

              {/* 발신자 이름 — 상대 메시지에만 */}
              {!isPc && (
                <div className="text-[11px] text-gray-700 font-semibold px-1">
                  {msg.sender_name || msg.user?.name || '직원'}
                </div>
              )}

              {/* 말풍선 + 시간 가로 배치 */}
              <div className={`flex items-end gap-1.5 ${isPc ? "flex-row-reverse" : "flex-row"}`}>

                {emojiOnly ? (
                  <div className="group relative flex flex-col items-center gap-0.5 px-1">
                    <div className="flex items-start gap-1">
                      {showDeleteBtn ? (
                        <button
                          type="button"
                          disabled={deleteDisabled}
                          aria-busy={isDeletingThis}
                          aria-label="메시지 삭제"
                          onClick={() => void handleDeleteClick()}
                          className="shrink-0 rounded px-1 py-0.5 text-[10px] font-medium text-gray-500 opacity-0 transition-opacity hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40 group-hover:opacity-100"
                        >
                          {isDeletingThis ? "삭제 중" : "삭제"}
                        </button>
                      ) : null}
                      {overflowItems.length > 0 ? (
                        <MessageOverflowMenu items={overflowItems} align={isPc ? 'right' : 'left'} />
                      ) : null}
                    </div>
                    <div className="text-4xl leading-none sm:text-5xl" aria-label="이모티콘 메시지">
                      {displayBody}
                    </div>
                  </div>
                ) : (
                <div
                  className={`group relative rounded-2xl px-3 pb-2 shadow-sm ${
                    isDeleted
                      ? "border border-gray-100/80 bg-gray-50/90 pt-2"
                      : urgent && !isPc
                        ? "border-2 border-orange-400 bg-orange-50 text-gray-900 pt-2"
                      : isPc
                        ? "bg-[#FEE500] text-gray-900 pt-2"  // 내 메시지: 카카오 노랑
                        : "bg-white text-gray-900 pt-2"       // 상대 메시지: 흰색
                  }`}
                >
                  {urgent && !isPc && !isDeleted && (
                    <div className="mb-1 inline-block rounded bg-orange-500 px-2 py-0.5 text-[10px] font-extrabold text-white">
                      긴급
                    </div>
                  )}
                  {urgent && isPc && !isDeleted && (
                    <div className="mb-1 inline-block rounded bg-orange-600 px-2 py-0.5 text-[10px] font-extrabold text-white">
                      긴급
                    </div>
                  )}
                  {showDeleteBtn && (
                    <div className="-mt-0.5 mb-1 flex min-h-[22px] items-center justify-end gap-0.5">
                      <MessageOverflowMenu items={overflowItems} align="right" />
                      <button
                        type="button"
                        disabled={deleteDisabled}
                        aria-busy={isDeletingThis}
                        aria-label="메시지 삭제"
                        onClick={() => void handleDeleteClick()}
                        className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium transition-opacity disabled:cursor-not-allowed disabled:opacity-40 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 ${
                          isPc
                            ? "text-gray-700 ring-1 ring-gray-400/40 hover:bg-black/5"
                            : "text-red-600 ring-1 ring-gray-200/80 bg-white/90 hover:bg-red-50"
                        }`}
                      >
                        {isDeletingThis ? "삭제 중" : "삭제"}
                      </button>
                    </div>
                  )}
                  {!showDeleteBtn && overflowItems.length > 0 ? (
                    <div className="-mt-0.5 mb-1 flex min-h-[22px] justify-end">
                      <MessageOverflowMenu items={overflowItems} align="right" />
                    </div>
                  ) : null}

                  {/* 객실 번호 — 굵게 + 배경 강조 (업무 식별 포인트) */}
                  {!isDeleted && msg.room_no && (
                    <div
                      className={`mb-1 inline-block rounded-full px-2.5 py-1 text-xs font-bold ${
                        isPc ? "bg-black/10 text-gray-900" : "bg-blue-50 text-blue-700"
                      }`}
                    >
                      🏠 {msg.room_no}호
                    </div>
                  )}

                  {!isDeleted && statusLabel && msg.image_url ? (
                    <div
                      className={`mb-1 inline-block rounded-full px-2.5 py-1 text-xs font-bold ${
                        isPc ? "bg-emerald-100 text-emerald-900" : "bg-emerald-50 text-emerald-800"
                      }`}
                    >
                      {statusLabel}
                    </div>
                  ) : null}

                  {!isDeleted && <AiActionBadge aiAction={msg.ai_action as AiAction} />}

                  {isDeleted ? (
                    <div className="text-[10px] font-normal leading-relaxed text-gray-400/90">삭제된 메시지입니다</div>
                  ) : msg.image_url ? (
                    <>
                      {isImageOnly ? (
                        <div className="mb-1 text-xs opacity-80">[사진 메시지]</div>
                      ) : null}
                      <img
                        src={msg.image_url}
                        alt="업로드"
                        className="mt-1 h-40 w-full rounded-xl object-cover"
                      />
                      {!statusLabel && !isGenericPhotoCaption(displayPrimary || msg.message || '') ? (
                        <div
                          className={`mt-1 whitespace-pre-wrap break-words ${
                            urgent ? 'font-bold' : 'font-medium'
                          } ${isPc ? 'text-sm' : 'text-base'}`}
                        >
                          {displayBody}
                        </div>
                      ) : null}
                      {displaySecondary ? (
                        <div className="mt-1 whitespace-pre-wrap break-words text-[11px] text-gray-500 opacity-80">
                          {displaySecondaryBody}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <div>
                      <div
                        className={`whitespace-pre-wrap break-words ${
                          urgent ? 'font-bold' : 'font-medium'
                        } ${isPc ? 'text-sm' : 'text-base'}`}
                      >
                        {displayBody}
                      </div>
                      {displaySecondary ? (
                        <div className="mt-1 whitespace-pre-wrap break-words text-[11px] text-gray-500 opacity-80">
                          {displaySecondaryBody}
                        </div>
                      ) : null}
                    </div>
                  )}

                  {!isDeleted && (msg.ai_action === "ticket_created" || msg.ai_action === "ticket_created_manual") && msg.ticket_id && (
                    <button
                      onClick={() => router.push(`/maintenance/${msg.ticket_id}`)}
                      className={`mt-1 text-xs font-semibold underline ${isPc ? "text-gray-800" : "text-blue-700"}`}
                    >
                      티켓 보기
                    </button>
                  )}
                  {!isDeleted && msg.ai_action === "ticket_linked_existing" && msg.ticket_id && (
                    <button
                      onClick={() => router.push(`/maintenance/${msg.ticket_id}`)}
                      className={`mt-1 text-xs font-semibold underline ${isPc ? "text-gray-800" : "text-indigo-700"}`}
                    >
                      연결된 티켓 보기
                    </button>
                  )}
                  {!isDeleted && msg.ai_action === "skip_duplicate" && (
                    <div className={`mt-1 text-xs ${isPc ? "text-gray-700" : "text-amber-700"}`}>
                      최근 동일 이슈 티켓이 있어 새로 생성하지 않았습니다.
                    </div>
                  )}
                  {!isDeleted && msg.ai_action === "skip_duplicate" && msg.duplicate_ticket_id && (
                    <button
                      onClick={() => router.push(`/maintenance/${msg.duplicate_ticket_id}`)}
                      className={`mt-1 text-xs font-semibold underline ${isPc ? "text-gray-700" : "text-amber-700"}`}
                    >
                      기존 티켓 보기
                    </button>
                  )}
                  {!isDeleted && msg.ai_action === "skip_not_ticketable" && (
                    <div className={`mt-1 text-xs ${isPc ? "text-gray-700" : "text-gray-600"}`}>티켓 대상 메시지가 아닙니다.</div>
                  )}
                  {!isDeleted && msg.ai_action === "note_saved" && (
                    <div className={`mt-1 text-xs ${isPc ? "text-gray-700" : "text-slate-600"}`}>메모로 저장되었습니다.</div>
                  )}
                  {!isDeleted && msg.ai_action === "skip_review_required" && (
                    <div className={`mt-1 text-xs ${isPc ? "text-gray-700" : "text-violet-700"}`}>
                      민감/운영 이슈로 자동 티켓 생성이 보류되었습니다. (리뷰 필요)
                    </div>
                  )}
                  {!isDeleted && msg.ai_action === "skip_no_room" && (
                    <div className={`mt-1 text-xs ${isPc ? "text-gray-700" : "text-blue-700"}`}>객실번호를 확인할 수 없습니다.</div>
                  )}
                  {!isDeleted && msg.ai_action === "skip_ai_error" && (
                    <div className={`mt-1 text-xs ${isPc ? "text-gray-700" : "text-rose-700"}`}>AI 처리 오류로 자동 생성이 건너뛰어졌습니다.</div>
                  )}
                </div>
                )}

                {/* 시간 — 말풍선 옆 하단에 배치 (월/일 시간, 연도 제외) */}
                <div className="text-[10px] text-gray-500 shrink-0 pb-0.5 leading-none whitespace-nowrap">
                  {formatKSTShort(msg.created_at)}
                </div>
              </div>
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </>
  );
}
