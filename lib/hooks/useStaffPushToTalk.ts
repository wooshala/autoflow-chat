import { useCallback, useEffect, useRef, useState } from 'react';
import type { TouchEvent as ReactTouchEvent, RefObject } from 'react';

/**
 * Android Push-to-Talk (STT, ru-RU) — input assist only.
 *
 * UX (no auto-send): the recognized transcript is written into the EXISTING
 * message input via `onResult`; a brief "done" hint is shown, then the staff
 * reviews/edits and presses the existing send button manually. This hook NEVER
 * sends and never touches the send path.
 *
 * Bridge contract (see docs/design/staff-chat-stt.md):
 *   web → native : window.AutoFlowStaffStt.start()/stop()/cancel()
 *   native → web : window.onSttState/onSttResult/onSttError/onSttRms
 * React owns the state machine; native emits lifecycle hints only.
 */

export type SttPhase = 'idle' | 'recording' | 'recognizing' | 'done';

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
const RECOGNIZE_TIMEOUT_MS = 5000;
const DONE_DISPLAY_MS = 1000;

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export type UseStaffPushToTalkOptions = {
  /** Final transcript → fill the existing input (setText). NEVER sends. */
  onResult: (text: string) => void;
  /** Recognition failure (empty / error / timeout / permission). Show a toast. */
  onFailure?: (code: string) => void;
  /** When true, presses are ignored (e.g. no resolved user). */
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
  const { onResult, onFailure, disabled } = opts;

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
  const recognizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const doneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // latest callbacks via refs — stale-closure safe
  const onResultRef = useRef(onResult);
  const onFailureRef = useRef(onFailure);
  const disabledRef = useRef(Boolean(disabled));
  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);
  useEffect(() => {
    onFailureRef.current = onFailure;
  }, [onFailure]);
  useEffect(() => {
    disabledRef.current = Boolean(disabled);
  }, [disabled]);

  // availability detection (client only, avoids SSR mismatch)
  useEffect(() => {
    setAvailable(typeof window !== 'undefined' && typeof window.AutoFlowStaffStt?.start === 'function');
  }, []);

  const clearRecognizeTimer = useCallback(() => {
    if (recognizeTimerRef.current != null) {
      clearTimeout(recognizeTimerRef.current);
      recognizeTimerRef.current = null;
    }
  }, []);

  const clearDoneTimer = useCallback(() => {
    if (doneTimerRef.current != null) {
      clearTimeout(doneTimerRef.current);
      doneTimerRef.current = null;
    }
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
        // Only interrupt an in-flight capture; never cut the brief "done" hint.
        if (phaseRef.current === 'recording' || phaseRef.current === 'recognizing') {
          awaitingResultRef.current = false;
          clearRecognizeTimer();
          setPhase('idle');
        }
      }
    };
    const handleResult = (text: string) => {
      if (!awaitingResultRef.current) return; // dedupe / stray result
      awaitingResultRef.current = false;
      clearRecognizeTimer();
      const trimmed = String(text || '').trim();
      if (!trimmed) {
        setPhase('idle');
        onFailureRef.current?.('no_match'); // empty → no input change
        return;
      }
      onResultRef.current(trimmed); // fill the existing input; NO send
      setPhase('done'); // "입력창에서 확인 후 전송하세요" — brief
      clearDoneTimer();
      doneTimerRef.current = setTimeout(() => {
        doneTimerRef.current = null;
        if (phaseRef.current === 'done') setPhase('idle');
      }, DONE_DISPLAY_MS);
    };
    const handleError = (code: string) => {
      awaitingResultRef.current = false;
      clearRecognizeTimer();
      setPhase('idle');
      onFailureRef.current?.(String(code || 'unknown'));
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
      clearRecognizeTimer();
      clearDoneTimer();
      stopRaf();
    };
  }, [setPhase, stopRaf, clearRecognizeTimer, clearDoneTimer]);

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
      setPhase('idle'); // short tap → no input change, no send
      return;
    }
    awaitingResultRef.current = true;
    setPhase('recognizing');
    // RECOGNIZING must resolve within 5s; otherwise fail without input change.
    clearRecognizeTimer();
    recognizeTimerRef.current = setTimeout(() => {
      if (!awaitingResultRef.current) return;
      awaitingResultRef.current = false;
      recognizeTimerRef.current = null;
      try {
        window.AutoFlowStaffStt?.cancel();
      } catch {
        /* ignore */
      }
      setPhase('idle');
      onFailureRef.current?.('timeout');
    }, RECOGNIZE_TIMEOUT_MS);
    try {
      bridge?.stop();
    } catch {
      awaitingResultRef.current = false;
      clearRecognizeTimer();
      setPhase('idle');
    }
  }, [setPhase, clearRecognizeTimer]);

  const cancelPress = useCallback(() => {
    if (phaseRef.current !== 'recording') return;
    cancelledRef.current = true;
    clearRecognizeTimer();
    try {
      window.AutoFlowStaffStt?.cancel();
    } catch {
      /* ignore */
    }
    setPhase('idle'); // drag / touch cancel → no input change, no send
  }, [setPhase, clearRecognizeTimer]);

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
    handlers: { onTouchStart, onTouchEnd, onTouchCancel, onTouchMove }
  };
}
