'use client';

import { useCallback, useEffect, useState } from 'react';
import { isTauriApp } from '@/lib/tauri/isTauriApp';
import {
  checkDesktopUpdate,
  getDesktopShellVersion,
  installDesktopUpdate,
  type DownloadProgress
} from '@/lib/tauri/desktopUpdate';

type Phase = 'idle' | 'checking' | 'available' | 'uptodate' | 'downloading' | 'error';

/**
 * Tauri desktop shell updater — PC /chat header only.
 * Web UI ships via Vercel; this updates the native exe (tray, sounds, bridge).
 */
export default function TauriUpdatePanel() {
  const [inTauri, setInTauri] = useState(false);
  const [shellVersion, setShellVersion] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [remoteVersion, setRemoteVersion] = useState<string | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);

  useEffect(() => {
    const tauri = isTauriApp();
    setInTauri(tauri);
    if (!tauri) return;
    void getDesktopShellVersion().then(setShellVersion);
  }, []);

  const handleCheck = useCallback(async () => {
    setError(null);
    setPhase('checking');
    try {
      const info = await checkDesktopUpdate();
      if (info) {
        setRemoteVersion(info.version);
        setNotes(info.body ?? null);
        setPhase('available');
      } else {
        setPhase('uptodate');
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('error');
    }
  }, []);

  const handleInstall = useCallback(async () => {
    const label = remoteVersion ? ` v${remoteVersion}` : '';
    if (!window.confirm(`새 버전${label}을(를) 다운로드하고 설치할까요?\n앱이 재시작됩니다.`)) return;

    setError(null);
    setPhase('downloading');
    setProgress(null);
    try {
      await installDesktopUpdate((p) => setProgress(p));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('error');
    }
  }, [remoteVersion]);

  if (!inTauri) return null;

  const progressLabel =
    progress && progress.total
      ? `${Math.min(100, Math.round((progress.downloaded / progress.total) * 100))}%`
      : progress
        ? '다운로드 중…'
        : null;

  return (
    <div className="mt-2 rounded-lg border border-sky-700/60 bg-sky-950/40 px-3 py-2 text-xs text-sky-100">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-sky-200">
          데스크톱 앱 {shellVersion ? `v${shellVersion}` : ''}
        </span>
        <button
          type="button"
          disabled={phase === 'checking' || phase === 'downloading'}
          onClick={() => void handleCheck()}
          className="rounded border border-sky-600 bg-sky-900/60 px-2 py-0.5 font-semibold text-sky-100 hover:bg-sky-800/60 disabled:opacity-50"
        >
          {phase === 'checking' ? '확인 중…' : '앱 업데이트 확인'}
        </button>
        {phase === 'available' && remoteVersion ? (
          <button
            type="button"
            onClick={() => void handleInstall()}
            className="rounded border border-emerald-600 bg-emerald-900/50 px-2 py-0.5 font-semibold text-emerald-100 hover:bg-emerald-800/50"
          >
            v{remoteVersion} 설치
          </button>
        ) : null}
        {phase === 'uptodate' ? <span className="text-emerald-300">최신 버전입니다</span> : null}
        {phase === 'downloading' ? (
          <span className="text-amber-200">{progressLabel ?? '설치 중…'}</span>
        ) : null}
      </div>
      {notes ? <p className="mt-1 text-[10px] text-sky-300/80">{notes}</p> : null}
      {error ? (
        <p className="mt-1 text-[10px] text-rose-300" role="alert">
          업데이트 확인 실패: {error}
        </p>
      ) : null}
      <p className="mt-1 text-[10px] text-sky-400/70">
        채팅 화면은 Vercel에서, 알림·트레이는 이 앱 설치본에서 업데이트됩니다.
      </p>
    </div>
  );
}
