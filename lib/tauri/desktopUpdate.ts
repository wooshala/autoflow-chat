import { isTauriApp } from '@/lib/tauri/isTauriApp';

const LOG = '[AUTOFLOW_UPDATER]';

export type DesktopUpdateInfo = {
  version: string;
  body?: string;
};

export async function getDesktopShellVersion(): Promise<string | null> {
  if (!isTauriApp()) return null;
  try {
    const { getVersion } = await import('@tauri-apps/api/app');
    return await getVersion();
  } catch (e: unknown) {
    console.warn(LOG, 'getVersion failed', e instanceof Error ? e.message : String(e));
    return null;
  }
}

/** Check GitHub latest.json via Tauri updater plugin. Returns null if up to date. */
export async function checkDesktopUpdate(): Promise<DesktopUpdateInfo | null> {
  if (!isTauriApp()) return null;
  try {
    const { check } = await import('@tauri-apps/plugin-updater');
    const update = await check();
    if (!update) {
      console.info(LOG, 'no update available');
      return null;
    }
    console.info(LOG, 'update available', { version: update.version });
    return { version: update.version, body: update.body ?? undefined };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(LOG, 'check failed', msg);
    throw new Error(msg);
  }
}

export type DownloadProgress = {
  downloaded: number;
  total: number | null;
};

/** Download, install, and relaunch. Call only after user confirmation. */
export async function installDesktopUpdate(onProgress?: (p: DownloadProgress) => void): Promise<void> {
  if (!isTauriApp()) return;
  const { check } = await import('@tauri-apps/plugin-updater');
  const { relaunch } = await import('@tauri-apps/plugin-process');
  const update = await check();
  if (!update) {
    throw new Error('업데이트가 더 이상 사용할 수 없습니다.');
  }

  let downloaded = 0;
  let total: number | null = null;

  await update.downloadAndInstall((event) => {
    if (event.event === 'Started') {
      total = event.data.contentLength ?? null;
      downloaded = 0;
      onProgress?.({ downloaded: 0, total });
    } else if (event.event === 'Progress') {
      downloaded += event.data.chunkLength;
      onProgress?.({ downloaded, total });
    } else if (event.event === 'Finished') {
      onProgress?.({ downloaded, total });
    }
  });

  console.info(LOG, 'installed', { version: update.version });
  await relaunch();
}
