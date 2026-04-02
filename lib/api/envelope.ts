import { NextResponse } from 'next/server';
import { log } from '@/lib/logger';

const FETCH_ENVELOPE_LOG_TAG = '[FETCH_ENVELOPE]';
const RAW_BODY_LOG_MAX = 4000;

/** 표준 성공 페이로드 */
export type ApiSuccess<T> = { ok: true; data: T };

/** 표준 실패 페이로드 */
export type ApiFailure = { ok: false; error: string; message: string };

export type ApiEnvelope<T> = ApiSuccess<T> | ApiFailure;

export function jsonOk<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ ok: true, data } satisfies ApiSuccess<T>, init);
}

export function jsonErr(error: string, message: string, status: number): NextResponse {
  return NextResponse.json({ ok: false, error, message } satisfies ApiFailure, { status });
}

/** 클라이언트: participants 등 envelope JSON 파싱 */
export function parseOkData<T>(json: unknown): { ok: true; data: T } | { ok: false; reason: 'shape' } {
  if (!json || typeof json !== 'object') return { ok: false, reason: 'shape' };
  const o = json as Record<string, unknown>;
  if (o.ok !== true || !('data' in o)) return { ok: false, reason: 'shape' };
  return { ok: true, data: o.data as T };
}

export function parseFailure(json: unknown): { error: string; message: string } | null {
  if (!json || typeof json !== 'object') return null;
  const o = json as Record<string, unknown>;
  if (o.ok !== false) return null;
  const error = typeof o.error === 'string' ? o.error : 'UNKNOWN';
  const message = typeof o.message === 'string' ? o.message : String(o.message ?? '요청 실패');
  return { error, message };
}

/** 레거시 `{ error: string }` (message 없음) — HTTP 에러 본문 파싱 보조 */
export function parseLegacyErrorBody(json: unknown): string | null {
  if (!json || typeof json !== 'object') return null;
  const o = json as Record<string, unknown>;
  if (typeof o.error === 'string' && o.error.trim()) return o.error;
  if (typeof o.message === 'string' && o.message.trim()) return o.message;
  return null;
}

export type FetchEnvelopeOk<T> = { ok: true; data: T; status: number };
export type FetchEnvelopeFail = {
  ok: false;
  error: string;
  message: string;
  status: number;
};

const DEFAULT_FETCH_TIMEOUT_MS = 10_000;

export type FetchEnvelopeInit = RequestInit & {
  /** 기본 10초. 초과 시 AbortController로 중단하고 `REQUEST_TIMEOUT` 반환 */
  timeoutMs?: number;
  /**
   * 기본 true (`{ ok: true, data }` 표준 envelope).
   * false면 HTTP 2xx 본문 JSON을 `T`로 그대로 반환(레거시 API용).
   */
  envelope?: boolean;
};

/**
 * fetch + JSON envelope 통합 파싱.
 * - `envelope !== false` + HTTP 2xx + `ok: true` + `data` → 성공
 * - `envelope === false` + HTTP 2xx → 본문 JSON을 `data`로 반환
 * - HTTP 비정상 → `parseFailure` / 레거시 error 문자열
 * - `timeoutMs`(기본 10초): 내부 AbortController + `init.signal`과 병합
 */
export async function fetchEnvelope<T>(
  input: RequestInfo | URL,
  init?: FetchEnvelopeInit
): Promise<FetchEnvelopeOk<T> | FetchEnvelopeFail> {
  const timeoutMs = init?.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
  const useEnvelope = init?.envelope !== false;
  const userSignal = init?.signal;
  const { timeoutMs: _t, signal: _u, envelope: _env, ...restInit } = init || {};

  const controller = new AbortController();
  let timedOut = false;
  const tid = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const onUserAbort = () => {
    clearTimeout(tid);
    controller.abort();
  };
  if (userSignal) {
    if (userSignal.aborted) {
      clearTimeout(tid);
      throw new DOMException('Aborted', 'AbortError');
    }
    userSignal.addEventListener('abort', onUserAbort, { once: true });
  }

  let res: Response;
  try {
    res = await fetch(input, { ...restInit, signal: controller.signal });
  } catch (e: unknown) {
    clearTimeout(tid);
    userSignal?.removeEventListener('abort', onUserAbort);
    if (e instanceof Error && e.name === 'AbortError') {
      if (userSignal?.aborted) throw e;
      if (timedOut) {
        return {
          ok: false,
          error: 'REQUEST_TIMEOUT',
          message: '요청 시간이 초과되었습니다.',
          status: 0
        };
      }
      throw e;
    }
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: 'NETWORK_ERROR', message: msg, status: 0 };
  } finally {
    clearTimeout(tid);
  }
  userSignal?.removeEventListener('abort', onUserAbort);

  const urlStr =
    typeof input === 'string' ? input : input instanceof URL ? input.toString() : String(input);

  let rawText = '';
  try {
    rawText = await res.text();
  } catch (e: unknown) {
    log.error(FETCH_ENVELOPE_LOG_TAG, {
      phase: 'read_text_failed',
      url: urlStr,
      status: res.status,
      error: e instanceof Error ? e.message : String(e)
    });
    return {
      ok: false,
      error: 'READ_BODY_FAILED',
      message: '응답 본문을 읽지 못했습니다.',
      status: res.status
    };
  }

  const truncated =
    rawText.length > RAW_BODY_LOG_MAX
      ? `${rawText.slice(0, RAW_BODY_LOG_MAX)}…[truncated,len=${rawText.length}]`
      : rawText;
  log.debug(FETCH_ENVELOPE_LOG_TAG, {
    url: urlStr,
    status: res.status,
    bodyLen: rawText.length,
    rawText: truncated
  });

  let json: unknown = null;
  const trimmed = rawText.trim();
  if (trimmed) {
    try {
      json = JSON.parse(trimmed);
    } catch (e: unknown) {
      log.error(FETCH_ENVELOPE_LOG_TAG, {
        phase: 'json_parse_failed',
        url: urlStr,
        status: res.status,
        error: e instanceof Error ? e.message : String(e),
        rawText: truncated
      });
      return {
        ok: false,
        error: 'INVALID_JSON',
        message: '서버 응답을 JSON으로 파싱하지 못했습니다.',
        status: res.status
      };
    }
  }

  if (!res.ok) {
    const fail = parseFailure(json);
    if (fail) {
      return { ok: false, error: fail.error, message: fail.message, status: res.status };
    }
    const legacy = parseLegacyErrorBody(json);
    return {
      ok: false,
      error: 'HTTP_ERROR',
      message: legacy || `HTTP ${res.status}`,
      status: res.status
    };
  }

  if (!useEnvelope) {
    return { ok: true, data: json as T, status: res.status };
  }

  const parsed = parseOkData<T>(json);
  if (!parsed.ok) {
    log.error(FETCH_ENVELOPE_LOG_TAG, {
      phase: 'invalid_envelope',
      url: urlStr,
      status: res.status,
      jsonType: json === null ? 'null' : typeof json,
      jsonKeys: json && typeof json === 'object' ? Object.keys(json as object) : null,
      bodyPreview: truncated.slice(0, 800)
    });
    return {
      ok: false,
      error: 'INVALID_ENVELOPE',
      message: '서버 응답 형식이 올바르지 않습니다.',
      status: res.status
    };
  }

  return { ok: true, data: parsed.data, status: res.status };
}
