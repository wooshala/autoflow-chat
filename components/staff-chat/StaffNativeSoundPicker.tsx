'use client';

import { useCallback } from 'react';
import { unlockStaffSound, playStaffSound } from '@/lib/chat/playNotificationTone';
import {
  STAFF_SOUND_OPTIONS,
  staffSoundSrc,
  type StaffSoundKey
} from '@/lib/chat/staffAlertPrefs';

export default function StaffNativeSoundPicker({
  soundKey,
  volume,
  onSoundKeyChange,
  onVolumeChange
}: {
  soundKey: StaffSoundKey;
  volume: number;
  onSoundKeyChange: (k: StaffSoundKey) => void;
  onVolumeChange: (v: number) => void;
}) {
  const pct = Math.round(volume * 100);

  const preview = useCallback(
    (src: string) => {
      void unlockStaffSound(src).then(() => playStaffSound(src, volume));
    },
    [volume]
  );

  const handleSoundChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const key = e.target.value as StaffSoundKey;
      onSoundKeyChange(key);
      preview(staffSoundSrc(key));
    },
    [onSoundKeyChange, preview]
  );

  const handleReplay = useCallback(() => {
    preview(staffSoundSrc(soundKey));
  }, [soundKey, preview]);

  return (
    <div className="mx-auto mb-1 flex max-w-md flex-col gap-1.5 px-2">
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-[11px] font-semibold text-gray-500">🔔 알림음</span>
        <select
          value={soundKey}
          onChange={handleSoundChange}
          className="min-w-0 flex-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-[12px] font-medium text-gray-700 focus:border-blue-400 focus:outline-none"
        >
          {STAFF_SOUND_OPTIONS.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleReplay}
          className="shrink-0 rounded-lg border border-blue-300 bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700 active:bg-blue-100"
        >
          다시 듣기
        </button>
      </div>

      <div className="flex items-center gap-2">
        <span className="shrink-0 text-[11px] font-semibold text-gray-500">🔊 알림음 크기</span>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={pct}
          onChange={(e) => onVolumeChange(Number(e.target.value) / 100)}
          className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-gray-200 accent-blue-600"
          aria-label="알림 음량"
        />
        <span className="w-8 text-right text-[11px] font-bold tabular-nums text-gray-600">
          {pct}%
        </span>
      </div>
    </div>
  );
}
