'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatUnknownError, parseFailure, parseOkData } from '@/lib/api/envelope';
import { STAFF_ENTRY_INVITE_URL, STAFF_INVITES_URL } from '@/lib/chatApi';

function qrUrl(link: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(link)}`;
}

function resolveFetchUrl(path: string): string {
  if (typeof window !== 'undefined' && path.startsWith('/')) {
    return `${window.location.origin}${path}`;
  }
  return path;
}

const URL_FIELD_CANDIDATES = ['url', 'inviteUrl', 'entryUrl', 'link'] as const;

function pickEntryUrl(data: Record<string, unknown>): string | null {
  for (const key of URL_FIELD_CANDIDATES) {
    const v = data[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

function userMessageForFetchFailure(status: number, error: string, message: string, body: string): string {
  if (status === 404) return `API 404: ${message || '엔드포인트를 찾을 수 없습니다'}`;
  if (status === 500 && error === 'ENTRY_INVITE_FAILED') {
    const hint =
      /staff_entry_invites|relation.*does not exist|schema cache/i.test(message)
        ? ' (DB 마이그레이션 staff_entry_invites 미적용 가능)'
        : '';
    return `초대 링크 생성 실패: ${message}${hint}`;
  }
  if (status === 503) return `API 503: ${message}`;
  if (status === 0 && error === 'NETWORK_ERROR') return `네트워크 오류: ${message}`;
  if (error === 'INVALID_JSON') return `응답 JSON 파싱 실패 (HTTP ${status})`;
  if (error === 'INVALID_ENVELOPE') return `응답 형식 오류: { ok: true, data } envelope 필요 (HTTP ${status})`;
  if (status >= 400) return `API ${status}: ${message || error || body.slice(0, 120)}`;
  return message || error || '초대 링크를 불러오지 못했습니다';
}

function userMessageForMissingUrl(data: Record<string, unknown>): string {
  const keys = Object.keys(data);
  const alt = URL_FIELD_CANDIDATES.filter((k) => k !== 'url' && k in data);
  if (alt.length > 0) {
    return `응답 필드 누락: url (대체 필드 ${alt.join(', ')}는 지원하지 않음, keys=${keys.join(',')})`;
  }
  return `응답 필드 누락: url (keys=${keys.join(',') || 'none'})`;
}

type EntryInviteData = { url?: string; entry?: unknown };

async function fetchStaffEntryInviteUrl(): Promise<
  { ok: true; url: string; keys: string[] } | { ok: false; userMessage: string }
> {
  const url = resolveFetchUrl(STAFF_ENTRY_INVITE_URL);
  console.log('[STAFF_INVITE_QR_FETCH_START]', { url });

  let res: Response;
  let rawText = '';
  try {
    res = await fetch(url);
    rawText = await res.text();
  } catch (e: unknown) {
    const msg = formatUnknownError(e);
    console.log('[STAFF_INVITE_QR_FETCH_FAILED]', { status: 0, body: msg, phase: 'network' });
    return { ok: false, userMessage: userMessageForFetchFailure(0, 'NETWORK_ERROR', msg, msg) };
  }

  const bodyPreview = rawText.length > 2000 ? `${rawText.slice(0, 2000)}…` : rawText;

  if (!res.ok) {
    console.log('[STAFF_INVITE_QR_FETCH_FAILED]', { status: res.status, body: bodyPreview });
    let json: unknown = null;
    if (rawText.trim()) {
      try {
        json = JSON.parse(rawText);
      } catch {
        /* non-json error body */
      }
    }
    const fail = json ? parseFailure(json) : null;
    const error = fail?.error || 'HTTP_ERROR';
    const message = fail?.message || rawText.slice(0, 200) || `HTTP ${res.status}`;
    return { ok: false, userMessage: userMessageForFetchFailure(res.status, error, message, bodyPreview) };
  }

  let json: unknown = null;
  try {
    json = rawText.trim() ? JSON.parse(rawText) : null;
  } catch (e: unknown) {
    console.log('[STAFF_INVITE_QR_FETCH_FAILED]', {
      status: res.status,
      body: bodyPreview,
      phase: 'json_parse',
      error: formatUnknownError(e)
    });
    return { ok: false, userMessage: userMessageForFetchFailure(res.status, 'INVALID_JSON', formatUnknownError(e), bodyPreview) };
  }

  const parsed = parseOkData<EntryInviteData>(json);
  if (!parsed.ok) {
    const topKeys = json && typeof json === 'object' ? Object.keys(json as object) : [];
    console.log('[STAFF_INVITE_QR_FETCH_FAILED]', {
      status: res.status,
      body: bodyPreview,
      phase: 'invalid_envelope',
      topKeys
    });
    return {
      ok: false,
      userMessage: userMessageForFetchFailure(res.status, 'INVALID_ENVELOPE', '서버 응답 envelope 형식 오류', bodyPreview)
    };
  }

  const dataObj = parsed.data as Record<string, unknown>;
  const keys = Object.keys(dataObj);
  const entryUrl = pickEntryUrl(dataObj);

  console.log('[STAFF_INVITE_QR_FETCH_OK]', {
    status: res.status,
    keys,
    urlPresent: Boolean(entryUrl),
    urlField: entryUrl ? 'url' : null
  });

  if (!entryUrl) {
    console.log('[STAFF_INVITE_QR_FETCH_FAILED]', {
      status: res.status,
      body: bodyPreview,
      phase: 'missing_url_field',
      keys
    });
    return { ok: false, userMessage: userMessageForMissingUrl(dataObj) };
  }

  return { ok: true, url: entryUrl, keys };
}

/**
 * Always-visible staff invite QR — pinned to the /chat top bar next to the
 * desktop-update box. Staff scan it with a phone to join instantly, so they
 * never need to open the participant-management panel. Rotate / copy controls
 * stay small inside the card; on mobile it wraps below the update box.
 */
export default function StaffInviteQrCard() {
  const [entryUrl, setEntryUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [qrImageError, setQrImageError] = useState(false);
  const [rotatingEntry, setRotatingEntry] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    setQrImageError(false);
    const res = await fetchStaffEntryInviteUrl();
    if (res.ok) {
      setEntryUrl(res.url);
    } else {
      setEntryUrl(null);
      setLoadError(res.userMessage);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleRotateEntry = useCallback(async () => {
    if (!window.confirm('새 QR을 만들면 이전 QR은 사용할 수 없게 됩니다. 계속할까요?')) return;
    setRotatingEntry(true);
    setLoadError(null);
    setQrImageError(false);
    const url = resolveFetchUrl(STAFF_INVITES_URL);
    console.log('[STAFF_INVITE_QR_ROTATE_START]', { url });
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'rotate_entry' })
      });
      const rawText = await res.text();
      const bodyPreview = rawText.length > 2000 ? `${rawText.slice(0, 2000)}…` : rawText;
      if (!res.ok) {
        console.log('[STAFF_INVITE_QR_FETCH_FAILED]', { status: res.status, body: bodyPreview, phase: 'rotate' });
        let fail: { error: string; message: string } | null = null;
        if (rawText.trim()) {
          try {
            fail = parseFailure(JSON.parse(rawText));
          } catch {
            /* non-json */
          }
        }
        setLoadError(
          userMessageForFetchFailure(
            res.status,
            fail?.error || 'HTTP_ERROR',
            fail?.message || rawText.slice(0, 200),
            bodyPreview
          )
        );
        return;
      }
      let json: unknown = null;
      try {
        json = rawText.trim() ? JSON.parse(rawText) : null;
      } catch (e: unknown) {
        console.log('[STAFF_INVITE_QR_FETCH_FAILED]', {
          status: res.status,
          body: bodyPreview,
          phase: 'rotate_json_parse',
          error: formatUnknownError(e)
        });
        setLoadError('QR 재발급 응답 파싱 실패');
        return;
      }
      const parsed = parseOkData<{ url?: string }>(json);
      if (!parsed.ok) {
        console.log('[STAFF_INVITE_QR_FETCH_FAILED]', { status: res.status, body: bodyPreview, phase: 'rotate_envelope' });
        setLoadError('QR 재발급 응답 형식 오류');
        return;
      }
      const dataObj = parsed.data as Record<string, unknown>;
      const nextUrl = pickEntryUrl(dataObj);
      console.log('[STAFF_INVITE_QR_FETCH_OK]', {
        status: res.status,
        keys: Object.keys(dataObj),
        urlPresent: Boolean(nextUrl),
        phase: 'rotate'
      });
      if (nextUrl) {
        setEntryUrl(nextUrl);
      } else {
        setLoadError(userMessageForMissingUrl(dataObj));
      }
    } catch (e: unknown) {
      const msg = formatUnknownError(e);
      console.log('[STAFF_INVITE_QR_FETCH_FAILED]', { status: 0, body: msg, phase: 'rotate_network' });
      setLoadError(`QR 재발급 네트워크 오류: ${msg}`);
    } finally {
      setRotatingEntry(false);
    }
  }, []);

  const copyLink = useCallback(async () => {
    if (!entryUrl) return;
    try {
      await navigator.clipboard.writeText(entryUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }, [entryUrl]);

  return (
    <div className="flex w-[260px] max-w-full items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5">
      {entryUrl && !qrImageError ? (
        <img
          src={qrUrl(entryUrl)}
          alt="직원 입장 QR"
          className="h-[112px] w-[112px] shrink-0 rounded-md border border-emerald-200 bg-white p-1"
          onLoad={() => setQrImageError(false)}
          onError={() => {
            console.log('[STAFF_INVITE_QR_IMAGE_FAILED]', {
              qrService: 'api.qrserver.com',
              entryUrlPresent: true,
              entryUrlLen: entryUrl.length
            });
            setQrImageError(true);
          }}
        />
      ) : (
        <div className="flex h-[112px] w-[112px] shrink-0 flex-col items-center justify-center rounded-md border border-emerald-200 bg-white px-1 text-center text-[11px] text-gray-400">
          {loadError ? '링크 없음' : qrImageError ? 'QR 이미지 실패' : 'QR 로딩…'}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold text-emerald-900">직원 초대</div>
        <p className="mt-0.5 text-[11px] text-emerald-700">QR 스캔 → 즉시 입장</p>
        {qrImageError && entryUrl ? (
          <p className="mt-1 text-[11px] text-amber-700" role="alert">
            QR 이미지 로드 실패 (링크는 있음 — 복사 후 사용)
          </p>
        ) : null}
        {loadError ? (
          <p className="mt-1 text-[11px] text-rose-600" role="alert">
            {loadError}
            <button type="button" onClick={() => void load()} className="ml-1 underline">
              다시
            </button>
          </p>
        ) : null}
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button
            type="button"
            disabled={rotatingEntry}
            onClick={() => void handleRotateEntry()}
            className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
          >
            {rotatingEntry ? '재발급 중…' : 'QR 재발급'}
          </button>
          <button
            type="button"
            disabled={!entryUrl}
            onClick={() => void copyLink()}
            className="rounded-md border border-gray-300 bg-white px-2 py-1 text-[11px] font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {copied ? '복사됨 ✓' : '링크 복사'}
          </button>
        </div>
      </div>
    </div>
  );
}
