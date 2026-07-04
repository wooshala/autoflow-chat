import { useCallback, useEffect, useRef, useState } from 'react';
import type { TouchEvent as ReactTouchEvent, RefObject } from 'react';

/**
 * Android Push-to-Talk (STT, ru-RU) — input method only.
 *
 * The recognized transcript is delivered to `onTranscript`, which the caller
 * wires to the EXISTING chat send path (`send(text)`). This hook never touches
 * the send contract, translation, room_no, telemetry, etc.
 *
 * Bridge contract (see docs/design/staff-chat-stt.md):
 *   web → native : window.AutoFlowStaffStt.start()/stop()/cancel()
 *   native → web : window.onSttState/onSttResult/onSttError/onSttRms
 * React owns the state machine; native emits lifecycle hints only.
 */

export type SttPhase = 'idle' | 'recording' | 'recognizing' | 'sending';

type StaffSttBridge = {
  start: () => void;
  stop: () => void;
  cancel: () => void;
};

declare global {
  interface Window {
    AutoFlowStaffStt?: StaffSttBridge;
    onSttState?: (state: string) => void;
    onSttResult?: (text: string) => void;
    onSttError?: (code: string) => void;
    onSttRms?: (level: number) => void;
  }
}

const SHORT_TAP_MS = 300;
const DRAG_CANCEL_MARGIN_PX = 24;

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export type UseStaffPushToTalkOptions = {
  /** Called with the final transcript. Wire to the existing send(text). */
  onTranscript: (text: string) => void | Promise<unknown>;
  /** Optional error surface (e.g. toast). */
  onError?: (code: string) => void;
  /** When true, presses are ignored (e.g. no resolved user / already sending). */
  disabled?: boolean;
};

export type UseStaffPushToTalk = {
  available: boolean;
  phase: SttPhase;
  rmsElRef: RefObject<HTMLDivElement>;
  handlers: {
    onTouchStart: (e: ReactTouchEvent) => void;
    onTouchEnd: (e: ReactTouchEvent) => void;
    onTouchCancel: (e: ReactTouchEvent) => void;
    onTouchMove: (e: ReactTouchEvent) => void;
  };
};

export function useStaffPushToTalk(opts: UseStaffPushToTalkOptions): UseStaffPushToTalk {
  const { onTranscript, onError, disabled } = opts;

  const [available, setAvailable] = useState(false);
  const [phase, setPhaseState] = useState<SttPhase>('idle');

  const phaseRef = useRef<SttPhase>('idle');
  const setPhase = useCallback((p: SttPhase) => {
    phaseRef.current = p;
    setPhaseState(p);
  }, []);

  const awaitingResultRef = useRef(false);
  const pressStartRef = useRef(0);
  const cancelledRef = useRef(false);
  const rmsValueRef = useRef(0);
  const rmsElRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);

  // latest callbacks via refs — stale-closure safe
  const onTranscriptRef = useRef(onTranscript);
  const onErrorRef = useRef(onError);
  const disabledRef = useRef(Boolean(disabled));
  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);
  useEffect(() => {
    disabledRef.current = Boolean(disabled);
  }, [disabled]);

  // availability detection (client only, avoids SSR mismatch)
  useEffect(() => {
    setAvailable(typeof window !== 'undefined' && typeof window.AutoFlowStaffStt?.start === 'function');
  }, []);

  const stopRaf = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const startRaf = useCallback(() => {
    stopRaf();
    const tick = () => {
      const el = rmsElRef.current;
      if (el) {
        const lvl = Math.max(0, Math.min(1, rmsValueRef.current));
        el.style.transform = `scaleY(${0.15 + lvl * 0.85})`;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [stopRaf]);

  // window callbacks — single owner, cleaned up on unmount
  useEffect(() => {
    const handleState = (state: string) => {
      if (state === 'RECORDING') {
        if (phaseRef.current === 'idle' || phaseRef.current === 'recording') setPhase('recording');
      } else if (state === 'RECOGNIZING') {
        if (phaseRef.current === 'recording') setPhase('recognizing');
      } else if (state === 'IDLE' || state === 'ERROR') {
        if (phaseRef.current !== 'sending') {
          awaitingResultRef.current = false;
          setPhase('idle');
        }
      }
    };
    const handleResult = (text: string) => {
      if (!awaitingResultRef.current) return; // dedupe / stray result
      awaitingResultRef.current = false;
      const trimmed = String(text || '').trim();
      if (!trimmed) {
        setPhase('idle'); // empty result → no send
        return;
      }
      if (phaseRef.current === 'sending') return; // already sending
      setPhase('sending');
      Promise.resolve(onTranscriptRef.current(trimmed)).finally(() => {
        setPhase('idle');
      });
    };
    const handleError = (code: string) => {
      awaitingResultRef.current = false;
      setPhase('idle');
      onErrorRef.current?.(String(code || 'unknown'));
    };
    const handleRms = (level: number) => {
      const n = Number(level);
      rmsValueRef.current = Number.isFinite(n) ? n : 0;
    };
    window.onSttState = handleState;
    window.onSttResult = handleResult;
    window.onSttError = handleError;
    window.onSttRms = handleRms;
    return () => {
      if (window.onSttState === handleState) delete window.onSttState;
      if (window.onSttResult === handleResult) delete window.onSttResult;
      if (window.onSttError === handleError) delete window.onSttError;
      if (window.onSttRms === handleRms) delete window.onSttRms;
      stopRaf();
    };
  }, [setPhase, stopRaf]);

  // RMS animation only while recording — ref driven, no React re-render
  useEffect(() => {
    if (phase === 'recording') {
      startRaf();
    } else {
      stopRaf();
      rmsValueRef.current = 0;
    }
  }, [phase, startRaf, stopRaf]);

  const beginPress = useCallback(() => {
    if (disabledRef.current) return;
    if (phaseRef.current !== 'idle') return; // re-entry blocked
    const bridge = typeof window !== 'undefined' ? window.AutoFlowStaffStt : undefined;
    if (!bridge?.start) return;
    cancelledRef.current = false;
    pressStartRef.current = nowMs();
    setPhase('recording');
    try {
      bridge.start();
    } catch {
      setPhase('idle');
    }
  }, [setPhase]);

  const endPress = useCallback(() => {
    if (phaseRef.current !== 'recording') return;
    if (cancelledRef.current) {
      cancelledRef.current = false;
      return;
    }
    const held = nowMs() - pressStartRef.current;
    const bridge = typeof window !== 'undefined' ? window.AutoFlowStaffStt : undefined;
    if (held < SHORT_TAP_MS) {
      try {
        bridge?.cancel();
      } catch {
        /* ignore */
      }
      setPhase('idle'); // short tap → no send
      return;
    }
    awaitingResultRef.current = true;
    setPhase('recognizing');
    try {
      bridge?.stop();
    } catch {
      awaitingResultRef.current = false;
      setPhase('idle');
    }
  }, [setPhase]);

  const cancelPress = useCallback(() => {
    if (phaseRef.current !== 'recording') return;
    cancelledRef.current = true;
    try {
      window.AutoFlowStaffStt?.cancel();
    } catch {
      /* ignore */
    }
    setPhase('idle'); // drag / touch cancel → no send
  }, [setPhase]);

  const onTouchStart = useCallback(
    (e: ReactTouchEvent) => {
      e.preventDefault();
      beginPress();
    },
    [beginPress]
  );
  const onTouchEnd = useCallback(
    (e: ReactTouchEvent) => {
      e.preventDefault();
      endPress();
    },
    [endPress]
  );
  const onTouchCancel = useCallback(
    (_e: ReactTouchEvent) => {
      cancelPress();
    },
    [cancelPress]
  );
  const onTouchMove = useCallback(
    (e: ReactTouchEvent) => {
      if (phaseRef.current !== 'recording') return;
      const touch = e.touches[0];
      if (!touch) return;
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const out =
        touch.clientX < rect.left - DRAG_CANCEL_MARGIN_PX ||
        touch.clientX > rect.right + DRAG_CANCEL_MARGIN_PX ||
        touch.clientY < rect.top - DRAG_CANCEL_MARGIN_PX ||
        touch.clientY > rect.bottom + DRAG_CANCEL_MARGIN_PX;
      if (out) cancelPress();
    },
    [cancelPress]
  );

  return {
    available,
    phase,
    rmsElRef,
    handlers: { onTouchStart, onTouchEnd, onTouchCancel, onTouchMove },
  };
}
