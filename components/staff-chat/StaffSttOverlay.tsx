import type { RefObject } from 'react';
import type { SttPhase } from '@/lib/hooks/useStaffPushToTalk';

/**
 * Push-to-Talk overlay (v1): RMS bar only, no interim transcript text.
 * Rendered while phase !== 'idle'. The RMS bar element is driven imperatively by
 * the hook (ref + requestAnimationFrame), so this component does not re-render on
 * RMS updates.
 */
export type StaffSttOverlayLabels = {
  listening: string;
  recognizing: string;
  sending: string;
  hint: string;
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
    phase === 'recording' ? labels.listening : phase === 'recognizing' ? labels.recognizing : labels.sending;

  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-5 bg-black/55 backdrop-blur-sm"
      aria-live="polite"
    >
      <div className="text-6xl">🎤</div>
      <div className="text-lg font-bold text-white">● {title}</div>
      <div className="flex h-20 items-end">
        {phase === 'recording' ? (
          <div
            ref={rmsElRef}
            className="h-20 w-48 origin-bottom rounded-lg bg-emerald-400"
            style={{ transform: 'scaleY(0.15)' }}
          />
        ) : (
          <div className="h-20 w-48 animate-pulse rounded-lg bg-white/30" />
        )}
      </div>
      <div className="text-sm text-white/80">{labels.hint}</div>
    </div>
  );
}
