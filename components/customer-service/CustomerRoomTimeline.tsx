'use client';

// Phase 1C — customer timeline extracted from CustomerConsole (Phase 1B) with NO
// behavior change: same scroll container, same MessageBubble, same render order.
// Reused by both /customer-console and the Room Navigation customer room.

import { useState } from 'react';

import { type CustomerLang } from '@/lib/customer-service/translationLangs';
import type { MockMessage } from '@/lib/customer-service/mock/customerConsoleMock';

export function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch {
    return '';
  }
}

export function CustomerRoomTimeline({
  guestLang,
  messages,
}: {
  guestLang: CustomerLang;
  messages: MockMessage[];
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleOriginal = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <div className="flex-1 space-y-3 overflow-y-auto bg-[#B2C7D9] p-4">
      {messages.map((m) => (
        <MessageBubble
          key={m.id}
          m={m}
          guestLang={guestLang}
          expanded={expanded.has(m.id)}
          onToggle={() => toggleOriginal(m.id)}
        />
      ))}
    </div>
  );
}

function MessageBubble({
  m,
  guestLang,
  expanded,
  onToggle,
}: {
  m: MockMessage;
  guestLang: CustomerLang;
  expanded: boolean;
  onToggle: () => void;
}) {
  const isGuest = m.sender_type === 'guest';
  const isInternal = m.visibility === 'internal';

  // Guest → Korean translation primary; staff → Korean original primary.
  const koText = isGuest ? m.translated_text.ko ?? m.original_text : m.original_text;
  const guestTranslation = isGuest ? null : m.translated_text[guestLang];
  const secondary = isGuest ? m.original_text : guestTranslation;
  const secondaryLabel = isGuest ? '고객 원문' : '고객에게 전달된 번역';

  return (
    <div className={`flex ${isGuest ? 'justify-start' : 'justify-end'}`}>
      <div
        className={`max-w-[75%] rounded-2xl px-3 py-2 shadow-sm ${
          isInternal
            ? 'border border-amber-300 bg-amber-50 text-gray-900'
            : isGuest
              ? 'bg-white text-gray-900'
              : 'bg-[#FEE500] text-gray-900'
        }`}
      >
        <div className="mb-0.5 flex items-center gap-2 text-[11px] opacity-70">
          <span>{isGuest ? '고객' : isInternal ? '내부 메모' : '직원'}</span>
          {isInternal && (
            <span className="rounded bg-amber-200 px-1 text-[10px] font-semibold text-amber-800">직원 전용</span>
          )}
          <span className="ml-auto">{fmtTime(m.created_at)}</span>
        </div>

        {m.message_type === 'image' && (
          <div
            className={`mb-1 flex h-24 w-40 items-center justify-center rounded border text-[11px] ${
              isGuest ? 'border-gray-200 text-gray-400' : 'border-gray-400 text-gray-600'
            }`}
          >
            🖼 {m.image_label ?? '이미지'}
          </div>
        )}

        {koText && <div className="whitespace-pre-wrap">{koText}</div>}

        {m.translation_failed && (
          <div className="mt-1 text-[11px] font-medium text-red-500">
            ⚠ 번역 실패 — 원문을 표시합니다{m.original_text ? `: ${m.original_text}` : ''}
          </div>
        )}

        {secondary && (
          <div className="mt-1 border-t border-black/10 pt-1">
            <button type="button" onClick={onToggle} className="text-[11px] underline opacity-70">
              {expanded ? '접기' : `${secondaryLabel} 보기`}
            </button>
            {expanded && <div className="mt-0.5 whitespace-pre-wrap text-[12px] opacity-90">{secondary}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
