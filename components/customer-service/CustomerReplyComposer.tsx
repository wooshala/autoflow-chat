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

import { useCallback, useEffect, useRef, useState } from 'react';

import { mockCustomerTranslator, type CustomerLang } from '@/lib/customer-service/translationLangs';
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
        // Staff Korean → guest language. On failure we DO NOT auto-send the Korean
        // as-is to the guest (§2B) — we surface a failure and keep the message local.
        const out = await mockCustomerTranslator.translate(body, 'ko', guestLang);
        if (out) translated = { [guestLang]: out };
        else translationFailed = true;
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
    <div className="border-t border-gray-200 p-3">
      <div className="mb-2 flex gap-2">
        <button
          type="button"
          onClick={() => setMode('public')}
          className={`rounded px-3 py-1 text-xs font-medium ${
            mode === 'public' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
          }`}
        >
          고객 답변
        </button>
        <button
          type="button"
          onClick={() => setMode('internal')}
          className={`rounded px-3 py-1 text-xs font-medium ${
            mode === 'internal' ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-600'
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
        <div className="mb-2 flex items-center gap-3 rounded border border-gray-200 bg-gray-50 p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview.p.url} alt="붙여넣은 이미지" className="h-16 w-16 rounded object-cover" />
          <div className="text-xs text-gray-600">
            <div>{preview.type}</div>
            <div>{formatImageSize(preview.size)}</div>
          </div>
          <button
            type="button"
            onClick={clearPreview}
            className="ml-auto rounded bg-gray-200 px-2 py-1 text-xs text-gray-700 hover:bg-gray-300"
          >
            제거
          </button>
        </div>
      )}
      {pasteError && <div className="mb-2 text-xs text-red-600">{pasteError}</div>}

      <div className="flex items-end gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPaste={onPaste}
          rows={2}
          placeholder={
            mode === 'public'
              ? '한국어로 답변을 입력하세요. Win+Shift+S 캡처 후 Ctrl+V로 이미지 첨부'
              : '내부 메모(한국어)'
          }
          className="min-w-0 flex-1 resize-none rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
        />
        <button
          type="button"
          disabled={sending || (!text.trim() && !preview)}
          onClick={send}
          className="shrink-0 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {sending ? '전송 중…' : mode === 'public' ? '전송' : '메모 저장'}
        </button>
      </div>
    </div>
  );
}
