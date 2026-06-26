'use client';

import { useEffect, useState } from 'react';
import { CHAT_CLIENT_REV } from '@/lib/chat/chatClientRev';
import {
  NOTIFY_SOUND_OPTIONS,
  getNotifySoundKey,
  setNotifySoundKey,
  playNotifySoundPreview,
  type NotifySoundKey
} from '@/lib/chat/notifySound';
import {
  testBrowserOsNotification,
  testBrowserOsNotificationPlain,
  testHiddenNotifySimulation,
  testLoudNotificationSound
} from '@/lib/chat/chatNotifyDiag';
import { NOTIFY_BEEP_GAIN } from '@/lib/chat/playNotificationTone';
import { useChatNotifyDiagState } from '@/lib/hooks/useChatNotifyDiagState';
import { useNotificationAudioUnlock } from '@/lib/hooks/useNotificationAudioUnlock';

type Props = {
  onRequestPermission?: () => void;
};

export default function ChatNotifyDiagBar({ onRequestPermission }: Props) {
  const soundUnlocked = useNotificationAudioUnlock();
  const { permission, visibilityState, refresh } = useChatNotifyDiagState();

  const [soundKey, setSoundKey] = useState<NotifySoundKey>('default');
  useEffect(() => {
    setSoundKey(getNotifySoundKey());
  }, []);

  const onSelectSound = (key: NotifySoundKey) => {
    setSoundKey(key);
    setNotifySoundKey(key);
  };

  const onTestSound = () => {
    const native = (typeof window !== 'undefined' ? (window as any).AutoFlowNative : undefined) as
      | { playSound?: (k: string) => void }
      | undefined;
    if (native && typeof native.playSound === 'function') {
      native.playSound(soundKey); // Tauri: test the actual native sound path
    } else {
      playNotifySoundPreview(soundKey); // plain browser: web audio preview
    }
  };

  const runSoundTest = () => {
    void testLoudNotificationSound().then(() => refresh());
  };

  const runBrowserPlainTest = () => {
    if (permission === 'default' && onRequestPermission) {
      onRequestPermission();
      return;
    }
    void testBrowserOsNotificationPlain().then(() => refresh());
  };

  const runBrowserTest = () => {
    if (permission === 'default' && onRequestPermission) {
      onRequestPermission();
      return;
    }
    void testBrowserOsNotification().then(() => refresh());
  };

  const runHiddenSim = () => {
    if (permission === 'default' && onRequestPermission) {
      onRequestPermission();
      return;
    }
    void testHiddenNotifySimulation().then(() => refresh());
  };

  return (
    <section
      className="border-b border-amber-500/80 bg-amber-950/90 px-3 py-2 text-xs text-amber-50"
      aria-label="알림 진단"
    >
      <div className="mb-2 font-bold text-amber-200">알림 진단 (배포 rev 확인용)</div>
      <div className="mb-2 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
        <div>
          <span className="text-amber-400/80">rev</span>{' '}
          <span className="font-mono font-semibold text-white">{CHAT_CLIENT_REV}</span>
        </div>
        <div>
          <span className="text-amber-400/80">permission</span>{' '}
          <span className="font-mono font-semibold text-white">{permission}</span>
        </div>
        <div>
          <span className="text-amber-400/80">visibility</span>{' '}
          <span className="font-mono font-semibold text-white">{visibilityState}</span>
        </div>
        <div>
          <span className="text-amber-400/80">soundUnlocked</span>{' '}
          <span className="font-mono font-semibold text-white">{String(soundUnlocked)}</span>
        </div>
        <div className="col-span-2 sm:col-span-4">
          <span className="text-amber-400/80">notifyGain</span>{' '}
          <span className="font-mono font-semibold text-white">{NOTIFY_BEEP_GAIN}</span>
        </div>
      </div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <label htmlFor="notify-sound-select" className="font-semibold text-amber-200">
          알림음 선택
        </label>
        <select
          id="notify-sound-select"
          value={soundKey}
          onChange={(e) => onSelectSound(e.target.value as NotifySoundKey)}
          className="rounded border border-amber-400/70 bg-amber-900/60 px-2 py-1 font-semibold text-amber-50"
        >
          {NOTIFY_SOUND_OPTIONS.map((o) => (
            <option key={o.key} value={o.key} className="text-black">
              {o.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onTestSound}
          className="rounded border border-amber-400/70 bg-amber-800/60 px-2.5 py-1 font-semibold text-amber-50 hover:bg-amber-700/70"
        >
          테스트 재생
        </button>
        <span className="text-[10px] text-amber-300/80">선택값은 자동 저장(localStorage)</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={runSoundTest}
          className="rounded border border-amber-400/70 bg-amber-900/60 px-2.5 py-1 font-semibold text-amber-50 hover:bg-amber-800/70"
        >
          큰 알림음 테스트
        </button>
        <button
          type="button"
          onClick={runBrowserPlainTest}
          className="rounded border border-emerald-400/70 bg-emerald-950/60 px-2.5 py-1 font-semibold text-emerald-100 hover:bg-emerald-900/70"
        >
          OS 알림 테스트 (tag 없음)
        </button>
        <button
          type="button"
          onClick={runBrowserTest}
          className="rounded border border-sky-400/70 bg-sky-950/60 px-2.5 py-1 font-semibold text-sky-100 hover:bg-sky-900/70"
        >
          브라우저 OS 알림 테스트 (tag 있음)
        </button>
        <button
          type="button"
          onClick={runHiddenSim}
          className="rounded border border-violet-400/70 bg-violet-950/60 px-2.5 py-1 font-semibold text-violet-100 hover:bg-violet-900/70"
        >
          hidden 알림 시뮬레이션
        </button>
      </div>
      <p className="mt-1.5 text-[10px] leading-snug text-amber-300/90">
        수동 OS: [CHAT_BROWSER_NOTIFY_CREATED] → [CHAT_BROWSER_NOTIFY_SHOW]. in-app: [CHAT_INAPP_TOAST_SHOW] only.
        CREATED만 있고 SHOW 없음 → 브라우저 미표시. tag 없음 버튼으로 tag replace 여부 확인.
      </p>
    </section>
  );
}
