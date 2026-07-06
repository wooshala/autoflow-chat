import { isTauriApp } from '@/lib/tauri/isTauriApp';

/**
 * Cache-busting refresh helpers for the WebView cache problem (EXE/app shows a
 * stale bundle while browser Production is fresh).
 *
 * - refreshLatest(): SAFE. Loads the freshest deployed bundle. Preserves login
 *   and local settings (same-origin navigation with a new ?afts=; in the EXE it
 *   navigates the WebView without clearing storage).
 * - resetAppData(): ADVANCED. Clears cache + local storage (logout), then reloads.
 */

function cacheBustUrl(): string {
  const { pathname, hash } = window.location;
  return `${pathname}?afts=${Date.now()}${hash || ''}`;
}

/** "최신 화면으로 새로고침" — safe, keeps login/settings. */
export async function refreshLatest(): Promise<void> {
  if (isTauriApp()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('reload_fresh');
      return;
    } catch {
      /* fall through to plain web navigation */
    }
  }
  window.location.replace(cacheBustUrl());
}

/** "앱 데이터 초기화" (고급) — clears cache + local data (logout), then reloads. */
export async function resetAppData(): Promise<void> {
  if (isTauriApp()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('clear_webview_cache');
      return;
    } catch {
      /* fall through to web-side clear */
    }
  }
  try {
    window.localStorage.clear();
    window.sessionStorage.clear();
  } catch {
    /* ignore */
  }
  window.location.replace(cacheBustUrl());
}
