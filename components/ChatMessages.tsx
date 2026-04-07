"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import AiActionBadge from "@/components/AiActionBadge";
import { AiAction, ChatMessage } from "@/lib/types";

type Props = {
  messages: ChatMessage[];
  currentUserId?: string | null;
  /** 삭제 API 진행 중인 message id — 해당 말풍선만 버튼 비활성 */
  deletingMessageId?: string | null;
  onDeleteMessage?: (msg: ChatMessage) => void | Promise<void>;
  onCreateManualTicket?: (msg: ChatMessage) => void;
};

function formatTimeKST(dateString: string) {
  return new Date(dateString).toLocaleTimeString("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function translated(msg: ChatMessage, lang: string) {
  return msg.translated_text?.[lang as keyof typeof msg.translated_text] || msg.message;
}

function isMaintenanceSystemMessage(msg: ChatMessage, renderedText: string): boolean {
  const raw = String(msg.message || "").trim();
  const view = String(renderedText || "").trim();
  const pattern = /^🔧\s*\d{3,4}호\s*유지보수\s*접수됨$/;
  return pattern.test(raw) || pattern.test(view);
}

export default function ChatMessages({
  messages,
  currentUserId,
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
        const isDeleted = Boolean(msg.is_deleted);
        const isImageOnly = !isDeleted && Boolean(msg.image_url) && !String(msgText || "").trim();
        const isSystemEvent = isMaintenanceSystemMessage(msg, msgText);

        /* sender_side만으로 정렬: pc=오른쪽, 그 외=왼쪽 (시스템 🔧 줄도 동일) */
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
        const canDelete =
          Boolean(currentUserId) &&
          String(msg.user_id) === String(currentUserId) &&
          !isDeleted &&
          typeof onDeleteMessage === "function";
        const showDeleteBtn = canDelete;
        const deleteDisabled = isDeletingThis || (deleteBusyGlobal && !isDeletingThis);

        async function handleDeleteClick() {
          if (!onDeleteMessage || isDeleted || deleteDisabled) return;
          if (!confirm("삭제하시겠습니까?")) return;
          await onDeleteMessage(msg);
        }

        return (
          <div key={msg.id} className={`flex w-full ${isPc ? "justify-end" : "justify-start"}`}>
            <div className={`group relative max-w-[78%] ${isPc ? "items-end" : "items-start"} flex flex-col gap-1`}>
              {!isPc && <div className="text-[11px] text-gray-500 px-1">{msg.user?.name || "직원"}</div>}
              <div
                className={`relative rounded-2xl px-3 pb-2 shadow-sm ${
                  isDeleted
                    ? "border border-gray-100/80 bg-gray-50/90 pt-2"
                    : isPc
                      ? "bg-blue-600 text-white pt-2"
                      : "bg-white text-gray-900 pt-2"
                }`}
              >
                {showDeleteBtn && (
                  <div className="-mt-0.5 mb-1 flex min-h-[22px] justify-end">
                    <button
                      type="button"
                      disabled={deleteDisabled}
                      aria-busy={isDeletingThis}
                      aria-label="메시지 삭제"
                      onClick={() => void handleDeleteClick()}
                      className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium transition-opacity disabled:cursor-not-allowed disabled:opacity-40 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 ${
                        isPc
                          ? "text-white/90 ring-1 ring-white/30 hover:bg-white/10"
                          : "text-red-600 ring-1 ring-gray-200/80 bg-white/90 hover:bg-red-50"
                      }`}
                    >
                      {isDeletingThis ? "삭제 중" : "삭제"}
                    </button>
                  </div>
                )}
                {!isDeleted && msg.room_no && (
                  <div
                    className={`mb-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${isPc ? "bg-white/20 text-white" : "bg-blue-50 text-blue-700"}`}
                  >
                    🏠 {msg.room_no}호
                  </div>
                )}
                {!isDeleted && <AiActionBadge aiAction={msg.ai_action as AiAction} />}
                {isDeleted ? (
                  <div className="text-[10px] font-normal leading-relaxed text-gray-400/90">삭제된 메시지입니다</div>
                ) : isImageOnly ? (
                  <div className="text-xs opacity-80 mb-1">[사진 메시지]</div>
                ) : (
                  <div className="whitespace-pre-wrap break-words text-sm">{msgText}</div>
                )}

                {!isDeleted && (msg.ai_action === "ticket_created" || msg.ai_action === "ticket_created_manual") && msg.ticket_id && (
                  <button
                    onClick={() => router.push(`/maintenance/${msg.ticket_id}`)}
                    className={`mt-1 text-xs font-semibold underline ${isPc ? "text-white" : "text-blue-700"}`}
                  >
                    티켓 보기
                  </button>
                )}
                {!isDeleted && msg.ai_action === "ticket_linked_existing" && msg.ticket_id && (
                  <button
                    onClick={() => router.push(`/maintenance/${msg.ticket_id}`)}
                    className={`mt-1 text-xs font-semibold underline ${isPc ? "text-white" : "text-indigo-700"}`}
                  >
                    연결된 티켓 보기
                  </button>
                )}
                {!isDeleted && !msg.ticket_id && onCreateManualTicket && (
                  <button
                    onClick={() => onCreateManualTicket(msg)}
                    className={`mt-1 text-xs font-semibold underline ${isPc ? "text-white/90" : "text-cyan-700"}`}
                  >
                    수동 티켓 생성
                  </button>
                )}
                {!isDeleted && msg.ai_action === "skip_duplicate" && (
                  <div className={`mt-1 text-xs ${isPc ? "text-white/90" : "text-amber-700"}`}>
                    최근 동일 이슈 티켓이 있어 새로 생성하지 않았습니다.
                  </div>
                )}
                {!isDeleted && msg.ai_action === "skip_duplicate" && msg.duplicate_ticket_id && (
                  <button
                    onClick={() => router.push(`/maintenance/${msg.duplicate_ticket_id}`)}
                    className={`mt-1 text-xs font-semibold underline ${isPc ? "text-white/90" : "text-amber-700"}`}
                  >
                    기존 티켓 보기
                  </button>
                )}
                {!isDeleted && msg.ai_action === "skip_not_ticketable" && (
                  <div className={`mt-1 text-xs ${isPc ? "text-white/90" : "text-gray-600"}`}>티켓 대상 메시지가 아닙니다.</div>
                )}
                {!isDeleted && msg.ai_action === "note_saved" && (
                  <div className={`mt-1 text-xs ${isPc ? "text-white/90" : "text-slate-600"}`}>메모로 저장되었습니다.</div>
                )}
                {!isDeleted && msg.ai_action === "skip_review_required" && (
                  <div className={`mt-1 text-xs ${isPc ? "text-white/90" : "text-violet-700"}`}>
                    민감/운영 이슈로 자동 티켓 생성이 보류되었습니다. (리뷰 필요)
                  </div>
                )}
                {!isDeleted && msg.ai_action === "skip_no_room" && (
                  <div className={`mt-1 text-xs ${isPc ? "text-white/90" : "text-blue-700"}`}>객실번호를 확인할 수 없습니다.</div>
                )}
                {!isDeleted && msg.ai_action === "skip_ai_error" && (
                  <div className={`mt-1 text-xs ${isPc ? "text-white/90" : "text-rose-700"}`}>AI 처리 오류로 자동 생성이 건너뛰어졌습니다.</div>
                )}
                {!isDeleted && msg.image_url && <img src={msg.image_url} alt="업로드" className="mt-2 h-40 w-full rounded-xl object-cover" />}
              </div>
              <div className={`text-[10px] px-1 ${isPc ? "text-gray-300" : "text-gray-400"}`}>{formatTimeKST(msg.created_at)}</div>
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </>
  );
}
