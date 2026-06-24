'use client';

import { useEffect, useRef } from 'react';
import { STAFF_ROOM_OPTIONS } from '@/lib/chat/staffRoomOptions';

import type { StaffLocale } from '@/lib/i18n/messages';

type Props = {
  selectedRoom: string;
  onSelect: (roomNo: string) => void;
  disabled?: boolean;
  sectionLabel?: string;
  large?: boolean;
};

export default function RoomSelectorBar({
  selectedRoom,
  onSelect,
  disabled = false,
  sectionLabel = '객실',
  large = false
}: Props) {
  const selectedRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!selectedRoom) return;
    selectedRef.current?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [selectedRoom]);

  const chipClass = large
    ? 'shrink-0 rounded-full border px-4 py-2 text-lg font-extrabold tabular-nums min-h-[3rem] disabled:opacity-40'
    : 'shrink-0 rounded-full border px-2.5 py-1 text-xs font-extrabold tabular-nums disabled:opacity-40';
  const wrapClass = large ? 'border-b border-gray-100 bg-white px-2 py-2.5' : 'border-b border-gray-100 bg-white px-2 py-1.5';
  const labelClass = large
    ? 'shrink-0 text-xs font-bold uppercase tracking-wide text-gray-400'
    : 'shrink-0 text-[10px] font-bold uppercase tracking-wide text-gray-400';

  return (
    <div className={wrapClass}>
      <div className="mx-auto flex max-w-md items-center gap-2">
        <span className={labelClass}>{sectionLabel}</span>
        <div className="min-w-0 flex-1 overflow-x-auto overscroll-x-contain">
          <div className={`flex w-max items-center pr-1 ${large ? 'gap-2' : 'gap-1.5'}`}>
            {STAFF_ROOM_OPTIONS.map((room) => {
              const selected = selectedRoom === room;
              return (
                <button
                  key={room}
                  ref={selected ? selectedRef : undefined}
                  type="button"
                  disabled={disabled}
                  onClick={() => onSelect(room)}
                  className={`${chipClass} ${
                    selected
                      ? 'border-blue-600 bg-blue-600 text-white shadow-sm ring-2 ring-blue-200'
                      : 'border-gray-200 bg-gray-50 text-gray-800 active:border-blue-300 active:bg-blue-50'
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
