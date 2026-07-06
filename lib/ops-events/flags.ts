export function isOpsEventsEnabled(): boolean {
  return process.env.OPS_EVENTS_ENABLED === '1';
}

export function isLostFoundEnabled(): boolean {
  return process.env.NEXT_PUBLIC_OPS_LOST_FOUND_ENABLED === '1';
}

/** Phase A: Chat + Operation panel layout PoC (Preview / PC only) */
export function isChatOpsConsoleEnabled(): boolean {
  return process.env.NEXT_PUBLIC_CHAT_OPS_CONSOLE === '1';
}

export function getSiteId(): string {
  return process.env.NEXT_PUBLIC_SITE_ID?.trim() || 'default';
}

export const LOST_FOUND_BUCKET = 'autoflow-photos';
