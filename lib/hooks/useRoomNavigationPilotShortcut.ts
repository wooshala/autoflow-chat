'use client';

// Phase 1E.2 — binds the Ctrl+Alt+Shift+N pilot shortcut to a real keydown listener.
// All decision logic lives in lib/rooms/roomNavigationPilot.ts (unit-tested); this hook
// only reads the current override, confirms, writes localStorage, and reloads. It does
// NOT read or change the Room Navigation gate — the gate keeps its own fail-safe rules.

import { useEffect } from 'react';

import { ROOM_NAV_OVERRIDE_KEY, getRoomNavigationRuntimeOverride } from '@/lib/rooms/roomNavigationFlags';
import {
  nextPilotOverride,
  pilotConfirmMessage,
  shouldHandlePilotToggle,
} from '@/lib/rooms/roomNavigationPilot';

export function useRoomNavigationPilotShortcut(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target as (HTMLElement | null);
      const handle = shouldHandlePilotToggle(
        {
          ctrlKey: e.ctrlKey,
          altKey: e.altKey,
          shiftKey: e.shiftKey,
          metaKey: e.metaKey,
          key: e.key,
          repeat: e.repeat,
          isComposing: e.isComposing,
        },
        t ? { tagName: t.tagName, isContentEditable: t.isContentEditable } : null,
      );
      if (!handle) return;

      e.preventDefault();
      e.stopPropagation();

      const previousOverride = getRoomNavigationRuntimeOverride();
      const next = nextPilotOverride(previousOverride);
      if (!window.confirm(pilotConfirmMessage(previousOverride))) return; // cancel → no-op, no log

      if (process.env.NODE_ENV === 'development') {
        console.log('[ROOM_NAV_PILOT_TOGGLE]', { previousOverride, nextOverride: next });
      }
      try {
        window.localStorage.setItem(ROOM_NAV_OVERRIDE_KEY, next);
      } catch {
        /* storage unavailable → nothing to toggle */
      }
      window.location.reload();
    };

    // Capture phase so we can preempt/stop the combo before page handlers.
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);
}
