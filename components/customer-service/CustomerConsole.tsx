'use client';

// Phase 1B/1C — Customer Service Console PoC (mock data, mock translation, no DB).
// Self-contained 3-panel layout (left conversation list · center timeline · right ops
// panel). As of Phase 1C this file only ASSEMBLES the shell — the timeline and the
// input composer live in reusable components (CustomerRoomTimeline / CustomerReplyComposer)
// shared with Room Navigation. Render order, paste, internal-memo toggle and mock send
// are unchanged. Reachable only behind the customer-service console flag.

import { useCallback, useMemo, useState } from 'react';

import { LANG_DISPLAY } from '@/lib/customer-service/translationLangs';
import {
  MOCK_CONVERSATIONS,
  type MockConversation,
  type MockMessage,
} from '@/lib/customer-service/mock/customerConsoleMock';
import { CustomerRoomTimeline, fmtTime } from '@/components/customer-service/CustomerRoomTimeline';
import { CustomerReplyComposer } from '@/components/customer-service/CustomerReplyComposer';

function lastKoPreview(c: MockConversation): string {
  const last = c.messages[c.messages.length - 1];
  if (!last) return '';
  if (last.message_type === 'image' && !last.original_text) return '📷 이미지';
  if (last.sender_type === 'guest') return last.translated_text.ko ?? last.original_text ?? '';
  return last.original_text ?? '';
}

export default function CustomerConsole() {
  const [conversations, setConversations] = useState<MockConversation[]>(() =>
    JSON.parse(JSON.stringify(MOCK_CONVERSATIONS)),
  );
  const [selectedId, setSelectedId] = useState<string>(MOCK_CONVERSATIONS[0]?.id ?? '');

  const selected = conversations.find((c) => c.id === selectedId) ?? conversations[0];

  const selectConversation = useCallback((id: string) => {
    setSelectedId(id);
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, unread: 0 } : c)));
  }, []);

  const appendToSelected = useCallback(
    (m: MockMessage) => {
      if (!selected) return;
      setConversations((prev) =>
        prev.map((c) => (c.id === selected.id ? { ...c, messages: [...c.messages, m] } : c)),
      );
    },
    [selected],
  );

  const sorted = useMemo(
    () =>
      [...conversations].sort((a, b) => {
        const at = a.messages[a.messages.length - 1]?.created_at ?? '';
        const bt = b.messages[b.messages.length - 1]?.created_at ?? '';
        return bt.localeCompare(at);
      }),
    [conversations],
  );

  return (
    <div className="flex h-full min-h-[600px] w-full overflow-hidden rounded-lg border border-gray-200 bg-white text-sm">
      {/* LEFT — conversation list */}
      <aside className="flex w-64 shrink-0 flex-col border-r border-gray-200 bg-gray-50">
        <div className="border-b border-gray-200 px-3 py-2 font-semibold text-gray-700">
          고객 서비스 · 대화 <span className="text-xs font-normal text-gray-400">(PoC · mock)</span>
        </div>
        <ul className="flex-1 overflow-y-auto">
          {sorted.map((c) => {
            const active = c.id === selected?.id;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => selectConversation(c.id)}
                  className={`flex w-full flex-col gap-0.5 border-b border-gray-100 px-3 py-2 text-left hover:bg-white ${
                    active ? 'bg-white ring-1 ring-inset ring-blue-300' : ''
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[11px] font-medium text-blue-800">
                      {LANG_DISPLAY[c.guest_language]}
                    </span>
                    <span className="font-semibold text-gray-800">{c.room_no}호</span>
                    <span className="ml-auto text-[11px] text-gray-400">
                      {fmtTime(c.messages[c.messages.length - 1]?.created_at ?? '')}
                    </span>
                    {c.unread > 0 && (
                      <span className="rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white">
                        {c.unread}
                      </span>
                    )}
                  </div>
                  <div className="truncate text-xs text-gray-500">{lastKoPreview(c)}</div>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* CENTER — timeline + input */}
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-gray-200 px-4 py-2">
          <span className="font-semibold text-gray-800">{selected?.room_no}호</span>
          <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[11px] text-blue-800">
            {selected ? LANG_DISPLAY[selected.guest_language] : ''}
          </span>
          <span className="ml-auto text-xs text-gray-400">대화 타임라인</span>
        </header>

        {selected && <CustomerRoomTimeline guestLang={selected.guest_language} messages={selected.messages} />}

        {selected && (
          <CustomerReplyComposer key={selected.id} guestLang={selected.guest_language} onSend={appendToSelected} />
        )}
      </section>

      {/* RIGHT — small ops/info panel */}
      <aside className="hidden w-64 shrink-0 flex-col border-l border-gray-200 bg-gray-50 lg:flex">
        <div className="border-b border-gray-200 px-3 py-2 font-semibold text-gray-700">운영 정보</div>
        <div className="space-y-2 p-3 text-xs text-gray-600">
          <div>객실: {selected?.room_no}호</div>
          <div>고객 언어: {selected ? LANG_DISPLAY[selected.guest_language] : ''}</div>
          <div className="rounded bg-amber-50 p-2 text-[11px] text-amber-700">
            Phase 1B PoC · mock 데이터/번역. 실제 고객·DB 미연결. Quick Reply 없음.
          </div>
        </div>
      </aside>
    </div>
  );
}
