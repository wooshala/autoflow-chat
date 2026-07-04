'use client';

import { useCallback } from 'react';
import { playStaffDefaultSound, unlockStaffDefaultSound } from '@/lib/chat/playNotificationTone';

export default function StaffNativeSoundPicker({
  volume,
  onVolumeChange
}: {
  volume: number;
  onVolumeChange: (v: number) => void;
}) {
  const pct = Math.round(volume * 100);

  const handleTest = useCallback(() => {
    void unlockStaffDefaultSound().then(() => playStaffDefaultSound(volume));
  }, [volume]);

  return (
    <div className="mx-auto mb-1 flex max-w-md items-center gap-2">
      <span className="shrink-0 text-[11px] font-semibold text-gray-500">🔊 음량</span>
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
      <button
        type="button"
        onClick={handleTest}
        className="shrink-0 rounded-lg border border-blue-300 bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700 active:bg-blue-100"
      >
        테스트
      </button>
    </div>
  );
}
