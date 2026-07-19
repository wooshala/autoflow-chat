'use client';

// Phase 1C — DEV mock team room (청소팀/프런트/정비팀 or a room created via the modal).
// Plain local-state timeline + input. NO translation, NO DB write, NOT the real staff
// stream. A banner makes the DEV/mock nature explicit so it is never mistaken for the
// real 직원 전체 chat (§2).

import { useState } from 'react';

import { MOCK_STAFF_ROOM_LINES } from '@/lib/rooms/roomsMock';
import type { Room } from '@/lib/rooms/roomTypes';
import { RoomHeader } from './RoomHeader';
import { fmtTime } from '@/components/customer-service/CustomerRoomTimeline';

interface Line {
  who: string;
  text: string;
  at: string;
}

export function MockStaffRoom({ room }: { room: Room }) {
  const [lines, setLines] = useState<Line[]>(() => (MOCK_STAFF_ROOM_LINES[room.id] ?? []).map((l) => ({ ...l })));
  const [text, setText] = useState('');

  const send = () => {
    const t = text.trim();
    if (!t) return;
    setLines((prev) => [...prev, { who: '나', text: t, at: new Date().toISOString() }]);
    setText('');
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-[#B2C7D9]">
      <RoomHeader room={room} />

      <div className="flex-1 space-y-2 overflow-y-auto bg-[#B2C7D9] p-4">
        <div className="rounded bg-amber-50 p-2 text-[11px] text-amber-700">
          DEV mock 팀 대화입니다. 실제 직원 채팅(직원 전체)과 별개이며 DB에 저장되지 않습니다.
        </div>
        {lines.map((l, i) => (
          <div key={i} className="text-sm">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-800">{l.who}</span>
              <span className="text-[11px] text-gray-600">{fmtTime(l.at)}</span>
            </div>
            <div className="text-gray-900">{l.text}</div>
          </div>
        ))}
      </div>

      <div className="flex items-end gap-2 border-t border-gray-700 bg-gray-800 px-3 py-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // Match staff/customer: Enter sends, Shift+Enter = newline; ignore IME composition.
            if (e.nativeEvent.isComposing) return;
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          enterKeyHint="send"
          rows={2}
          placeholder="mock 팀 메시지 (Enter 전송 · Shift+Enter 줄바꿈, DB 저장 안 됨)"
          className="max-h-24 min-w-0 flex-1 resize-none rounded-2xl border border-gray-600 bg-gray-700 px-4 py-3 text-sm text-white outline-none placeholder:text-gray-400 focus:border-yellow-400"
        />
        <button
          type="button"
          onClick={send}
          disabled={!text.trim()}
          className="h-11 shrink-0 rounded-full bg-[#FEE500] px-4 text-sm font-bold text-gray-900 disabled:opacity-40"
        >
          전송 (mock)
        </button>
      </div>
    </div>
  );
}
