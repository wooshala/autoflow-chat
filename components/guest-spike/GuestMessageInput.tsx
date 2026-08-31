'use client';

// Phase 1H.2 + IMAGE-CHAT-01A-SIMPLIFY + IMAGE-CHAT-01B — composer with optional single image
// (guest + staff). File picker and clipboard paste share guestComposerAttachment validation.

import { useCallback, useRef, useState } from 'react';

import {
  handleGuestComposerPaste,
  validateGuestComposerFile,
} from '@/lib/guest-spike/guestComposerAttachment';

export type GuestComposerAttachment = {
  file: File;
  previewUrl: string;
};

export function GuestMessageInput({
  onSend,
  placeholder,
  sendLabel,
  enableImages,
}: {
  onSend: (text: string, image?: File) => Promise<void>;
  placeholder: string;
  sendLabel: string;
  enableImages?: boolean;
}) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [attachment, setAttachment] = useState<GuestComposerAttachment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const canSend = (text.trim().length > 0 || attachment !== null) && !sending;

  const selectFile = useCallback((file: File) => {
    setError(null);
    const v = validateGuestComposerFile(file);
    if (!v.ok) {
      setError(v.message);
      return;
    }
    setAttachment((prev) => {
      if (prev) URL.revokeObjectURL(prev.previewUrl);
      return { file, previewUrl: URL.createObjectURL(file) };
    });
  }, []);

  const removeAttachment = useCallback(() => {
    setAttachment((prev) => {
      if (prev) URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
  }, []);

  const onPaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      if (!enableImages) return;
      const result = handleGuestComposerPaste(e.nativeEvent as unknown as Parameters<
        typeof handleGuestComposerPaste
      >[0]);
      if (result.action === 'none') return;
      e.preventDefault();
      if (result.action === 'error') {
        setError(result.message);
        return;
      }
      setError(null);
      selectFile(result.file as File);
    },
    [enableImages, selectFile],
  );

  const submit = useCallback(async () => {
    const body = text.trim();
    if ((!body && !attachment) || sending) return;
    setSending(true);
    setError(null);
    try {
      await onSend(body, attachment?.file);
      setText('');
      setAttachment((prev) => {
        if (prev) URL.revokeObjectURL(prev.previewUrl);
        return null;
      });
    } catch {
      setError('전송에 실패했습니다. 다시 시도해 주세요.');
    } finally {
      setSending(false);
    }
  }, [text, attachment, sending, onSend]);

  return (
    <div style={{ background: '#fff', borderTop: '1px solid #e5e7eb' }}>
      {enableImages && attachment ? (
        <div style={{ display: 'flex', gap: 8, padding: '10px 12px 0', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={attachment.previewUrl}
              alt=""
              style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8, border: '1px solid #e5e7eb' }}
            />
            <button
              type="button"
              aria-label="사진 제거"
              onClick={removeAttachment}
              disabled={sending}
              style={{
                position: 'absolute',
                top: -6,
                right: -6,
                width: 20,
                height: 20,
                borderRadius: 10,
                border: 'none',
                background: '#111',
                color: '#fff',
                fontSize: 12,
                lineHeight: '20px',
                cursor: sending ? 'not-allowed' : 'pointer',
              }}
            >
              ×
            </button>
          </div>
        </div>
      ) : null}
      {error ? (
        <div style={{ padding: '8px 12px 0', color: '#b91c1c', fontSize: 12 }}>{error}</div>
      ) : null}
      <div style={{ display: 'flex', gap: 8, padding: 12 }}>
        {enableImages ? (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) selectFile(file);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              aria-label="사진 선택"
              disabled={sending}
              onClick={() => fileRef.current?.click()}
              style={{
                borderRadius: 20,
                border: '1px solid #d1d5db',
                background: '#fff',
                padding: '0 12px',
                fontSize: 18,
                cursor: sending ? 'not-allowed' : 'pointer',
                opacity: sending ? 0.5 : 1,
              }}
            >
              📷
            </button>
          </>
        ) : null}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPaste={onPaste}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
          rows={1}
          placeholder={placeholder}
          style={{
            flex: 1,
            resize: 'none',
            borderRadius: 20,
            border: '1px solid #d1d5db',
            padding: '10px 14px',
            fontSize: 15,
            outline: 'none',
          }}
        />
        <button
          onClick={() => void submit()}
          disabled={!canSend}
          style={{
            borderRadius: 20,
            border: 'none',
            background: '#FEE500',
            fontWeight: 700,
            padding: '0 18px',
            fontSize: 15,
            opacity: !canSend ? 0.5 : 1,
          }}
        >
          {sending ? '…' : sendLabel}
        </button>
      </div>
    </div>
  );
}
