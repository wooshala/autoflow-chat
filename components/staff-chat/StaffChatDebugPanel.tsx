'use client';

import { useCallback, useState } from 'react';
import {
  formatStaffChatDebugLogsForCopy,
  type StaffChatDebugEntry
} from '@/lib/chat/staffChatDebugLog';

type Props = {
  logs: StaffChatDebugEntry[];
};

export default function StaffChatDebugPanel({ logs }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'ok' | 'fail'>('idle');

  const handleCopy = useCallback(async () => {
    if (typeof window === 'undefined') return;
    const text = formatStaffChatDebugLogsForCopy(logs);
    if (!text) {
      setCopyState('fail');
      window.setTimeout(() => setCopyState('idle'), 1500);
      return;
    }
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopyState('ok');
    } catch {
      setCopyState('fail');
    }
    window.setTimeout(() => setCopyState('idle'), 1500);
  }, [logs]);

  const copyLabel =
    copyState === 'ok' ? '복사됨' : copyState === 'fail' ? '실패' : '복사';

  return (
    <>
      {expanded ? (
        <div
          className="pointer-events-auto fixed inset-x-0 top-0 z-30 max-h-[38vh] overflow-hidden border-b-2 border-amber-400 bg-black/92 shadow-lg"
          role="dialog"
          aria-label="Staff chat debug log"
        >
          <div className="flex h-8 max-h-8 items-center justify-between gap-2 border-b border-amber-800/80 bg-amber-950 px-2">
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="truncate text-left text-[10px] font-bold text-amber-100"
            >
              ▲ DEBUG · {logs.length}/50
            </button>
            <button
              type="button"
              onClick={() => void handleCopy()}
              className="shrink-0 rounded border border-amber-500/60 px-2 py-0.5 text-[10px] font-bold text-amber-50 active:bg-amber-800"
            >
              {copyLabel}
            </button>
          </div>
          <div className="max-h-[calc(38vh-2rem)] overflow-y-auto p-2 font-mono text-[10px] leading-snug text-amber-100">
            {logs.length === 0 ? (
              <p className="text-amber-400/80">로그 대기 중… (self/TTS/사운드 이벤트)</p>
            ) : (
              <ul className="space-y-1">
                {[...logs].reverse().map((e) => (
                  <li key={e.id} className="break-all border-b border-amber-900/50 pb-1">
                    <span className="text-amber-500">{e.at}</span>{' '}
                    <span className="font-bold text-amber-200">[{e.tag}]</span>
                    {e.payload ? <span className="text-amber-100/90"> {e.payload}</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}

      {/* Collapsed chip: top-right, ≤32px, pointer-events only on this bar */}
      <div className="pointer-events-none fixed right-2 top-11 z-30">
        <div className="pointer-events-auto flex h-8 max-h-8 w-max max-w-[calc(100vw-1rem)] items-center gap-1 rounded-lg border border-amber-400/90 bg-amber-950/95 px-2 shadow-md">
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="min-w-0 truncate text-[10px] font-bold leading-none text-amber-100"
          >
            ▼ DEBUG · {logs.length}/50
          </button>
          <button
            type="button"
            onClick={() => void handleCopy()}
            className="shrink-0 rounded border border-amber-500/60 px-1.5 py-0.5 text-[10px] font-bold leading-none text-amber-50 active:bg-amber-800"
          >
            {copyLabel}
          </button>
        </div>
      </div>
    </>
  );
}
