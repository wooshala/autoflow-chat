'use client';

// Phase 1C — customer reply input extracted from CustomerConsole (Phase 1B). Send /
// translate / paste / object-URL logic is byte-for-byte the same; only ownership moved
// from the parent into this self-contained component so it can be reused per room.
//
// Draft-leak safety (§ Phase 1C.3): mount this with key={room.id}. On room switch the
// component unmounts → the unmount effect revokes any pending preview URL and the fresh
// mount starts with an empty draft, so a half-typed reply / attached image can never
// leak into another room. (Phase 1B kept a pending preview across conversation switches;
// this is the one intentional, strictly-safer lifecycle change — see the 1C report.)
//
// Phase 1F.12 — staff session gate for public replies. Two auth systems coexist and
// stay separate:
//   • autoflow_user_v1                = LEGACY /chat UI identity (name only). Unchanged.
//   • autoflow_staff_session_token_v1 = CANONICAL server auth (staff account session).
// Customer translation REQUIRES the canonical session (the translate route validates it
// server-side). With no session we make ZERO translate calls, keep the draft, and reveal
// a 직원 인증 button that opens the existing loginWithCode flow (StaffAuthModal). Login
// never auto-sends — the operator re-sends manually. A 401 at translate time means the
// session expired: we clear it, keep the draft, append nothing, and re-prompt auth.

import { useCallback, useEffect, useRef, useState } from 'react';

import { type CustomerLang } from '@/lib/customer-service/translationLangs';
import { translateCustomerReply } from '@/lib/customer-service/apiCustomerTranslator';
import {
  clearStaffSession,
  loadStoredSessionToken,
  staffSessionAuthHeaders,
} from '@/lib/auth/staffAccountSession';
import { classifyTranslateFailure, decidePublicSend } from '@/lib/customer-service/customerReplyAuth';
import { StaffAuthModal } from '@/components/customer-service/StaffAuthModal';
import type { MockMessage } from '@/lib/customer-service/mock/customerConsoleMock';
import {
  extractClipboardImage,
  validateClipboardImage,
  createClipboardImagePreview,
  formatImageSize,
  type ClipboardEventLike,
  type ClipboardImagePreview,
} from '@/lib/customer-service/clipboardImage';

type InputMode = 'public' | 'internal';

export function CustomerReplyComposer({
  guestLang,
  onSend,
}: {
  guestLang: CustomerLang;
  onSend: (m: MockMessage) => void;
}) {
  const [mode, setMode] = useState<InputMode>('public');
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<{ p: ClipboardImagePreview; type: string; size: number } | null>(null);
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  // Phase 1F.12 — staff-session auth surface (draft/room state untouched by these).
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const previewRef = useRef<ClipboardImagePreview | null>(null);

  const clearPreview = useCallback(() => {
    previewRef.current?.revoke();
    previewRef.current = null;
    setPreview(null);
  }, []);

  // Revoke any live object URL on unmount (memory-leak safety + room-switch reset).
  useEffect(() => () => previewRef.current?.revoke(), []);

  const onPaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const img = extractClipboardImage(e.nativeEvent as unknown as ClipboardEventLike);
      if (!img) return; // no image → let normal text paste proceed (no preventDefault)
      e.preventDefault();
      setPasteError(null);
      const v = validateClipboardImage(img);
      if (!v.ok) {
        setPasteError(v.message);
        return;
      }
      clearPreview(); // replacing → revoke the previous preview first
      const p = createClipboardImagePreview(img as unknown as Blob);
      previewRef.current = p;
      setPreview({ p, type: img.type, size: img.size });
    },
    [clearPreview],
  );

  const send = useCallback(async () => {
    const body = text.trim();
    if (!body && !preview) return;
    setSending(true);
    try {
      const now = new Date().toISOString();
      const hasImage = Boolean(preview);
      let translated: Partial<Record<CustomerLang, string>> = {};
      let translationFailed = false;

      if (mode === 'public' && body) {
        // Decide BEFORE any network call. No staff session → reveal 직원 인증, make
        // ZERO translate requests, keep the draft (§6 세션 없음). Session presence is the
        // canonical autoflow_staff_session_token_v1, never the legacy autoflow_user_v1.
        const decision = decidePublicSend({ hasBody: true, hasStaffToken: Boolean(loadStoredSessionToken()) });
        if (decision === 'need-auth') {
          setAuthNotice('직원 인증이 필요합니다. "직원 인증"을 눌러 로그인해 주세요.');
          setSending(false);
          return;
        }

        // Staff Korean → guest language via the authenticated server API. On failure we
        // DO NOT send the Korean as-is to the guest (§2B) — surface a failure, keep draft.
        // A 401 means the session expired → clear it, keep the draft, append nothing,
        // and re-prompt auth (the server validateSessionToken stays the final authority).
        try {
          const out = await translateCustomerReply(body, 'ko', guestLang, {
            authHeaders: staffSessionAuthHeaders(),
          });
          translated = { [guestLang]: out };
        } catch (e) {
          if (classifyTranslateFailure(e) === 'session-expired') {
            clearStaffSession();
            setAuthNotice('세션이 만료되었습니다. "직원 인증"을 눌러 다시 로그인해 주세요.');
            setSending(false);
            return;
          }
          translationFailed = true;
        }
      }

      if (mode === 'public' && body && translationFailed) {
        setPasteError('번역에 실패했습니다. 고객에게 자동 전송하지 않았습니다. 다시 시도해 주세요.');
        setSending(false);
        return;
      }

      const msg: MockMessage = {
        id: `local-${Date.now()}`,
        sender_type: 'staff',
        visibility: mode,
        message_type: hasImage ? 'image' : 'text',
        original_text: body || null,
        original_language: body ? 'ko' : null,
        translated_text: mode === 'public' ? translated : {},
        image_label: hasImage ? '직원이 붙여넣은 캡처 (mock)' : undefined,
        created_at: now,
      };
      onSend(msg);
      setText('');
      clearPreview();
    } finally {
      setSending(false);
    }
  }, [text, preview, mode, guestLang, clearPreview, onSend]);

  return (
    <div className="shrink-0 border-t border-gray-700 bg-gray-800 px-3 py-3">
      <div className="mb-2 flex gap-2">
        <button
          type="button"
          onClick={() => setMode('public')}
          className={`rounded px-3 py-1 text-xs font-medium ${
            mode === 'public' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'
          }`}
        >
          고객 답변
        </button>
        <button
          type="button"
          onClick={() => setMode('internal')}
          className={`rounded px-3 py-1 text-xs font-medium ${
            mode === 'internal' ? 'bg-amber-500 text-white' : 'bg-gray-700 text-gray-300'
          }`}
        >
          내부 메모
        </button>
        <span className="ml-2 self-center text-[11px] text-gray-400">
          {mode === 'public'
            ? '고객에게 전송됩니다 · 한국어 입력 → 고객 언어 번역'
            : '직원만 볼 수 있는 메모 · 고객에게 전송되지 않음'}
        </span>
      </div>

      {preview && (
        <div className="mb-2 flex items-center gap-3 rounded border border-gray-700 bg-gray-900 p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview.p.url} alt="붙여넣은 이미지" className="h-16 w-16 rounded object-cover" />
          <div className="text-xs text-gray-300">
            <div>{preview.type}</div>
            <div>{formatImageSize(preview.size)}</div>
          </div>
          <button
            type="button"
            onClick={clearPreview}
            className="ml-auto rounded bg-gray-700 px-2 py-1 text-xs text-gray-200 hover:bg-gray-600"
          >
            제거
          </button>
        </div>
      )}
      {pasteError && <div className="mb-2 text-xs text-red-400">{pasteError}</div>}
      {authNotice && (
        <div className="mb-2 flex items-center gap-2 text-xs text-amber-300">
          <span>{authNotice}</span>
          <button
            type="button"
            onClick={() => setAuthOpen(true)}
            className="rounded border border-amber-400/60 bg-amber-500/10 px-2 py-1 font-semibold text-amber-200 hover:bg-amber-500/20"
          >
            직원 인증
          </button>
        </div>
      )}

      {authOpen && (
        <StaffAuthModal
          onClose={() => setAuthOpen(false)}
          onSuccess={() => {
            // Session saved by the modal. Close + clear the notice ONLY. Draft/room state
            // is untouched, and we NEVER auto-send — the operator re-sends manually (§2/§6).
            setAuthOpen(false);
            setAuthNotice(null);
          }}
        />
      )}

      <div className="flex items-end gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPaste={onPaste}
          onKeyDown={(e) => {
            // Match staff chat: Enter sends, Shift+Enter = newline; ignore IME composition.
            if (e.nativeEvent.isComposing) return;
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (!sending) void send();
            }
          }}
          enterKeyHint="send"
          rows={2}
          placeholder={
            mode === 'public'
              ? '한국어로 답변을 입력하세요 (Enter 전송 · Shift+Enter 줄바꿈). Win+Shift+S 캡처 후 Ctrl+V로 이미지 첨부'
              : '내부 메모(한국어) · Enter 저장 · Shift+Enter 줄바꿈'
          }
          className="max-h-24 min-w-0 flex-1 resize-none rounded-2xl border border-gray-600 bg-gray-700 px-4 py-3 text-sm text-white outline-none placeholder:text-gray-400 focus:border-yellow-400"
        />
        <button
          type="button"
          disabled={sending || (!text.trim() && !preview)}
          onClick={send}
          className="h-11 shrink-0 rounded-full bg-[#FEE500] px-4 text-sm font-bold text-gray-900 disabled:opacity-40"
        >
          {sending ? '전송 중…' : mode === 'public' ? '전송' : '메모 저장'}
        </button>
      </div>
    </div>
  );
}
