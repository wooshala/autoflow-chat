"use client";

import { AiAction } from "@/lib/types";

type Props = {
  aiAction?: AiAction;
};

const META: Record<Exclude<AiAction, null>, { label: string; className: string }> = {
  ticket_created: {
    label: "✅ 티켓 생성",
    className: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  },
  ticket_created_manual: {
    label: "🛠️ 수동 티켓 생성",
    className: "bg-cyan-50 text-cyan-700 border border-cyan-200",
  },
  skip_duplicate: {
    label: "⚠️ 중복 스킵",
    className: "bg-amber-50 text-amber-700 border border-amber-200",
  },
  skip_not_ticketable: {
    label: "⛔ 티켓 대상 아님",
    className: "bg-gray-100 text-gray-700 border border-gray-200",
  },
  skip_no_room: {
    label: "❓ 객실번호 없음",
    className: "bg-blue-50 text-blue-700 border border-blue-200",
  },
  skip_ai_error: {
    label: "🔥 AI 오류",
    className: "bg-rose-50 text-rose-700 border border-rose-200",
  },
};

export default function AiActionBadge({ aiAction }: Props) {
  if (!aiAction) return null;
  const meta = META[aiAction];
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${meta.className}`}
    >
      {meta.label}
    </span>
  );
}
