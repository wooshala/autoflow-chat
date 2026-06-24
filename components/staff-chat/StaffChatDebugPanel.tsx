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

  return (
    <div
      className="pointer-events-auto fixed bottom-[5.5rem] left-2 right-2 z-[70] flex max-w-md flex-col-reverse sm:left-auto sm:right-3"
      role="region"
      aria-label="Staff chat debug log"
    >
      <div className="flex items-center gap-1 rounded-t-xl border border-amber-300 bg-amber-950/95 px-2 py-1.5 text-[10px] text-amber-100 shadow-lg backdrop-blur-sm">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="min-w-0 flex-1 truncate text-left font-bold"
        >
          {expanded ? '▼' : '▲'} DEBUG · {logs.length}/50
        </button>
        <button
          type="button"
          onClick={() => void handleCopy()}
          className="shrink-0 rounded border border-amber-500/60 px-2 py-0.5 font-bold text-amber-50 active:bg-amber-800"
        >
          {copyState === 'ok' ? '복사됨' : copyState === 'fail' ? '실패' : '복사'}
        </button>
      </div>

      {expanded ? (
        <div className="max-h-[32vh] overflow-y-auto rounded-t-lg border border-b-0 border-amber-300/80 bg-black/90 p-2 font-mono text-[10px] leading-snug text-amber-100">
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
      ) : null}
    </div>
  );
}
