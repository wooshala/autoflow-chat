/** User is actively viewing this tab — in-app toast + beep (P0 foreground path). */
export function isInAppForegroundVisible(): boolean {
  if (typeof document === 'undefined') return false;
  if (document.hidden || document.visibilityState !== 'visible') return false;
  if (typeof document.hasFocus === 'function') return document.hasFocus();
  return true;
}

/** Focus lost, hidden tab, or screen off — OS notification path (P0). */
export function isOsBackgroundLike(): boolean {
  if (typeof document === 'undefined') return true;
  if (document.hidden || document.visibilityState !== 'visible') return true;
  if (typeof document.hasFocus === 'function') return !document.hasFocus();
  return false;
}
