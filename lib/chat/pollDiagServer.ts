/**
 * P0-B — server side of the request-source diagnostics.
 *
 * Reads the `x-autoflow-diag-*` headers a flagged client sends and emits ONE structured line
 * per request. Requests without those headers are ignored entirely, so enabling this costs
 * nothing for ordinary production traffic.
 *
 * Header values are attacker-controllable (any caller can set them), so everything is
 * validated and length-capped before it reaches a log line. `request_reason` is checked
 * against the fixed enum rather than echoed.
 */

import { DIAG_HEADER, isRequestReason, type RequestReason } from './pollDiag';

export const CHAT_POLL_DIAG_REQUEST = 'CHAT_POLL_DIAG_REQUEST';
export const DIAG_SERVER_ENV_FLAG = 'CHAT_POLL_DIAG_SERVER';

/**
 * Server-side collection gate.
 *
 * The client flag is a URL query anyone can set, so it cannot be the server's trust anchor:
 * without this gate a stranger could spray `x-autoflow-diag-*` headers at production and fill
 * the log with ids of their choosing. Collection therefore requires an env flag that only a
 * deployment owner can set — enable it on Preview, leave it off in Production.
 */
export function isDiagServerCollectionEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[DIAG_SERVER_ENV_FLAG] === '1';
}

/**
 * Generated ids are UUIDs or short base36. The character class also rejects newlines,
 * control characters and spaces, so a header can never inject structure into a log line.
 */
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const HOOK_RE = /^[A-Za-z0-9_]{1,48}$/;

export interface DiagRequestContext {
  tabId: string;
  clientInstanceId: string;
  requestReason: RequestReason;
  hookName: string;
  isTauri: boolean;
}

export interface HeaderReader {
  get(name: string): string | null;
}

/** Null when the request is not a flagged diagnostic request, or the headers are malformed. */
export function readDiagContext(headers: HeaderReader): DiagRequestContext | null {
  const tabId = headers.get(DIAG_HEADER.tabId);
  if (!tabId || !ID_RE.test(tabId)) return null;

  const clientInstanceId = headers.get(DIAG_HEADER.clientInstance) ?? '';
  if (!ID_RE.test(clientInstanceId)) return null;

  const reason = headers.get(DIAG_HEADER.requestReason) ?? '';
  if (!isRequestReason(reason)) return null;

  const hookName = headers.get(DIAG_HEADER.hook) ?? '';
  if (!HOOK_RE.test(hookName)) return null;

  return {
    tabId,
    clientInstanceId,
    requestReason: reason,
    hookName,
    isTauri: headers.get(DIAG_HEADER.isTauri) === '1',
  };
}

export interface DiagLogInput {
  path: string;
  method: string;
  responseStatus: number;
  elapsedMs: number;
  ctx: DiagRequestContext;
  deployment?: string | null;
  now?: () => string;
}

/**
 * The log payload. Deliberately a pure builder so a test can assert the exact key set —
 * that is how C6 (no secrets) stays true as fields are added later.
 */
export function buildDiagLogPayload(input: DiagLogInput): Record<string, unknown> {
  return {
    timestamp: (input.now ?? (() => new Date().toISOString()))(),
    path: input.path,
    method: input.method,
    tab_id: input.ctx.tabId,
    client_instance_id: input.ctx.clientInstanceId,
    request_reason: input.ctx.requestReason,
    hook_name: input.ctx.hookName,
    is_tauri: input.ctx.isTauri,
    deployment: input.deployment ?? process.env.VERCEL_DEPLOYMENT_ID ?? null,
    response_status: input.responseStatus,
    elapsed_ms: input.elapsedMs,
  };
}

export function logDiagRequest(
  input: DiagLogInput,
  sink: (event: string, payload: Record<string, unknown>) => void = (e, p) => console.info(`[${e}]`, p),
): void {
  sink(CHAT_POLL_DIAG_REQUEST, buildDiagLogPayload(input));
}

/**
 * Wrap a route handler so a flagged request produces exactly one line at completion.
 * A non-flagged request is passed through untouched — no timing, no logging.
 */
export async function withDiagRequestLog<T extends { status: number }>(
  req: { headers: HeaderReader; method: string; nextUrl?: { pathname: string }; url?: string },
  run: () => Promise<T>,
  sink?: (event: string, payload: Record<string, unknown>) => void,
  env: NodeJS.ProcessEnv = process.env,
): Promise<T> {
  // Gate first: with collection off, a flagged request costs exactly as much as any other.
  if (!isDiagServerCollectionEnabled(env)) return run();
  const ctx = readDiagContext(req.headers);
  if (!ctx) return run();
  const startedAt = Date.now();
  let status = 0;
  try {
    const res = await run();
    status = res.status;
    return res;
  } finally {
    logDiagRequest(
      {
        path: req.nextUrl?.pathname ?? req.url ?? '',
        method: req.method,
        responseStatus: status,
        elapsedMs: Date.now() - startedAt,
        ctx,
      },
      sink,
    );
  }
}
