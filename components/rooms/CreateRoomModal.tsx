'use client';

// Phase 1C — "새 채팅방" modal. Mock only: it adds a room to local state and does NOT
// write to any DB. Room type is one of 일반/청소/정비/프런트 (§8).

import { useState } from 'react';

import { TEAM_LABEL, type RoomTeam } from '@/lib/rooms/roomTypes';

const TEAM_OPTIONS: RoomTeam[] = ['general', 'cleaning', 'maintenance', 'front'];

export function CreateRoomModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (input: { title: string; team: RoomTeam }) => void;
}) {
  const [title, setTitle] = useState('');
  const [participants, setParticipants] = useState('');
  const [team, setTeam] = useState<RoomTeam>('general');

  const submit = () => {
    if (!title.trim()) return;
    onCreate({ title: title.trim(), team });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[10050] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div className="w-full max-w-sm rounded-lg bg-white p-4 text-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <span className="font-semibold text-gray-800">새 채팅방</span>
          <span className="rounded bg-gray-200 px-1.5 text-[10px] font-semibold text-gray-500">mock</span>
        </div>

        <label className="mb-1 block text-xs text-gray-500">방 이름</label>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
          placeholder="예: 3층 청소 임시방"
          className="mb-3 w-full rounded border border-gray-300 px-3 py-2 focus:border-blue-400 focus:outline-none"
        />

        <label className="mb-1 block text-xs text-gray-500">참여자 (선택)</label>
        <input
          value={participants}
          onChange={(e) => setParticipants(e.target.value)}
          placeholder="예: 김청소, 이룸 (mock)"
          className="mb-3 w-full rounded border border-gray-300 px-3 py-2 focus:border-blue-400 focus:outline-none"
        />

        <label className="mb-1 block text-xs text-gray-500">방 종류</label>
        <div className="mb-4 grid grid-cols-4 gap-2">
          {TEAM_OPTIONS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTeam(t)}
              className={`rounded px-2 py-1.5 text-xs font-medium ${
                team === t ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
              }`}
            >
              {TEAM_LABEL[t]}
            </button>
          ))}
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
          >
            취소
          </button>
          <button
            type="button"
            disabled={!title.trim()}
            onClick={submit}
            className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
          >
            생성 (mock)
          </button>
        </div>
      </div>
    </div>
  );
}
