/** Tab/window is visible — in-app toast + beep (P0 foreground path). */
export function isInAppForegroundVisible(): boolean {
  if (typeof document === 'undefined') return false;
  return !document.hidden && document.visibilityState === 'visible';
}

/** Hidden tab / screen off — rely on OS notification (native FCM on mobile). */
export function isOsBackgroundLike(): boolean {
  if (typeof document === 'undefined') return true;
  return document.hidden || document.visibilityState !== 'visible';
}
