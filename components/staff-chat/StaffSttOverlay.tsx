import type { RefObject } from 'react';
import type { SttPhase } from '@/lib/hooks/useStaffPushToTalk';

/**
 * Push-to-Talk overlay (v1): RMS bar only, no interim transcript text.
 * Rendered while phase !== 'idle'. The RMS bar element is driven imperatively by
 * the hook (ref + requestAnimationFrame), so this component does not re-render on
 * RMS updates.
 *
 * No auto-send: on completion the transcript fills the input; the "done" hint is
 * shown briefly, then the overlay dismisses.
 */
export type StaffSttOverlayLabels = {
  listening: string; // recording
  recognizing: string; // recognizing
  done: string; // filled into input
};

export default function StaffSttOverlay({
  phase,
  rmsElRef,
  labels
}: {
  phase: SttPhase;
  rmsElRef: RefObject<HTMLDivElement>;
  labels: StaffSttOverlayLabels;
}) {
  if (phase === 'idle') return null;

  const title =
    phase === 'recording' ? labels.listening : phase === 'recognizing' ? labels.recognizing : labels.done;

  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-5 bg-black/55 backdrop-blur-sm"
      aria-live="polite"
    >
      <div className="text-6xl">{phase === 'done' ? '✅' : '🎤'}</div>
      <div className="px-8 text-center text-lg font-bold text-white">
        {phase === 'done' ? '' : '● '}
        {title}
      </div>
      <div className="flex h-20 items-end">
        {phase === 'recording' ? (
          <div
            ref={rmsElRef}
            className="h-20 w-48 origin-bottom rounded-lg bg-emerald-400"
            style={{ transform: 'scaleY(0.15)' }}
          />
        ) : phase === 'recognizing' ? (
          <div className="h-20 w-48 animate-pulse rounded-lg bg-white/30" />
        ) : null}
      </div>
    </div>
  );
}
