'use client';

import { useEffect, useRef } from 'react';
import { STAFF_ROOM_OPTIONS } from '@/lib/chat/staffRoomOptions';

type Props = {
  selectedRoom: string;
  onSelect: (roomNo: string) => void;
  disabled?: boolean;
};

export default function RoomSelectorBar({ selectedRoom, onSelect, disabled = false }: Props) {
  const selectedRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!selectedRoom) return;
    selectedRef.current?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [selectedRoom]);

  return (
    <div className="border-b border-gray-100 bg-white px-2 py-1.5">
      <div className="mx-auto flex max-w-md items-center gap-1.5">
        <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-gray-400">객실</span>
        <div className="min-w-0 flex-1 overflow-x-auto overscroll-x-contain">
          <div className="flex w-max items-center gap-1.5 pr-1">
            {STAFF_ROOM_OPTIONS.map((room) => {
              const selected = selectedRoom === room;
              return (
                <button
                  key={room}
                  ref={selected ? selectedRef : undefined}
                  type="button"
                  disabled={disabled}
                  onClick={() => onSelect(room)}
                  className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-extrabold tabular-nums disabled:opacity-40 ${
                    selected
                      ? 'border-blue-600 bg-blue-600 text-white shadow-sm ring-2 ring-blue-200'
                      : 'border-gray-200 bg-gray-50 text-gray-800 active:bg-blue-50 active:border-blue-300'
                  }`}
                >
                  {room}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
