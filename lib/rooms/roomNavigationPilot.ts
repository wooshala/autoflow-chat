// Phase 1E.2 — pure decision logic for the Room Navigation pilot shortcut
// (Ctrl+Alt+Shift+N). DOM-free so it is unit-testable; the React hook
// (lib/hooks/useRoomNavigationPilotShortcut.ts) only binds these to real events.

import type { RoomNavigationOverride } from './roomNavigationFlags';

/** Minimal shape of a keydown event needed to decide the shortcut. */
export interface PilotKeyEvent {
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
  key: string;
  repeat: boolean;
  isComposing: boolean;
}

/** Minimal shape of the event target needed to detect an editable field. */
export interface PilotTarget {
  tagName?: string;
  isContentEditable?: boolean;
}

/** Exactly Ctrl+Alt+Shift+N, no Meta, not an auto-repeat. */
export function isPilotShortcut(e: PilotKeyEvent): boolean {
  if (e.repeat) return false;
  if (e.metaKey) return false;
  if (!e.ctrlKey || !e.altKey || !e.shiftKey) return false;
  return e.key.toLowerCase() === 'n';
}

/** input / textarea / select / contenteditable → don't hijack the key while editing. */
export function isEditableTarget(target: PilotTarget | null | undefined): boolean {
  if (!target) return false;
  if (target.isContentEditable) return true;
  const tag = (target.tagName || '').toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/** Full guard: handle only the exact shortcut, never while composing or editing. */
export function shouldHandlePilotToggle(e: PilotKeyEvent, target: PilotTarget | null | undefined): boolean {
  if (e.isComposing) return false;
  if (isEditableTarget(target)) return false;
  return isPilotShortcut(e);
}

/** Toggle: currently 'on' → 'off'; anything else (off/null/invalid) → 'on'. */
export function nextPilotOverride(current: RoomNavigationOverride): 'on' | 'off' {
  return current === 'on' ? 'off' : 'on';
}

/** confirm() text — notes it applies to THIS PC only and is reversible with the same keys. */
export function pilotConfirmMessage(current: RoomNavigationOverride): string {
  const tail = ' (이 PC에서만 적용 · 같은 단축키로 언제든 복귀)';
  return current === 'on'
    ? 'Room Navigation 파일럿을 끄고 기존 화면으로 돌아가시겠습니까?' + tail
    : '이 PC에서만 Room Navigation 파일럿을 활성화하시겠습니까?' + tail;
}
