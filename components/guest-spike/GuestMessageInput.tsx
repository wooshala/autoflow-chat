'use client';

// Phase 1H.2 + IMAGE-CHAT-01A — composer with optional guest image attachments.

import { useCallback, useRef, useState } from 'react';

import {
  GUEST_ATTACHMENT_MAX_COUNT,
  GUEST_ATTACHMENT_MAX_BYTES,
} from '@/lib/guest-spike/guestAttachmentLimits';

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
  onSend: (text: string, files: File[]) => Promise<void>;
  placeholder: string;
  sendLabel: string;
  /** Guest-only Phase A — staff composer unchanged when false/absent. */
  enableImages?: boolean;
}) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [attachments, setAttachments] = useState<GuestComposerAttachment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const canSend = (text.trim().length > 0 || attachments.length > 0) && !sending;

  const addFiles = useCallback((list: FileList | File[]) => {
    setError(null);
    const incoming = Array.from(list);
    setAttachments((prev) => {
      const next = [...prev];
      for (const file of incoming) {
        if (next.length >= GUEST_ATTACHMENT_MAX_COUNT) {
          setError(`사진은 최대 ${GUEST_ATTACHMENT_MAX_COUNT}장까지 보낼 수 있습니다.`);
          break;
        }
        if (file.size > GUEST_ATTACHMENT_MAX_BYTES) {
          setError('사진 크기는 10MB 이하여야 합니다.');
          continue;
        }
        const mime = file.type || '';
        if (mime.includes('heic') || mime.includes('heif') || file.name.toLowerCase().endsWith('.heic')) {
          setError('HEIC 형식은 지원하지 않습니다. JPEG/PNG/WebP 사진을 선택해 주세요.');
          continue;
        }
        if (!mime.startsWith('image/') || mime === 'image/svg+xml') {
          setError('JPEG, PNG, WebP 이미지만 보낼 수 있습니다.');
          continue;
        }
        next.push({ file, previewUrl: URL.createObjectURL(file) });
      }
      return next;
    });
  }, []);

  const removeAttachment = useCallback((idx: number) => {
    setAttachments((prev) => {
      const copy = [...prev];
      const [removed] = copy.splice(idx, 1);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return copy;
    });
  }, []);

  const submit = useCallback(async () => {
    const body = text.trim();
    if ((!body && attachments.length === 0) || sending) return;
    setSending(true);
    setError(null);
    try {
      await onSend(
        body,
        attachments.map((a) => a.file),
      );
      setText('');
      setAttachments((prev) => {
        for (const a of prev) URL.revokeObjectURL(a.previewUrl);
        return [];
      });
    } catch {
      setError('전송에 실패했습니다. 다시 시도해 주세요.');
    } finally {
      setSending(false);
    }
  }, [text, attachments, sending, onSend]);

  return (
    <div style={{ background: '#fff', borderTop: '1px solid #e5e7eb' }}>
      {enableImages && attachments.length > 0 ? (
        <div style={{ display: 'flex', gap: 8, padding: '10px 12px 0', flexWrap: 'wrap' }}>
          {attachments.map((a, idx) => (
            <div key={a.previewUrl} style={{ position: 'relative' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={a.previewUrl}
                alt=""
                style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8, border: '1px solid #e5e7eb' }}
              />
              <button
                type="button"
                aria-label="사진 제거"
                onClick={() => removeAttachment(idx)}
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
          ))}
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
              accept="image/jpeg,image/png,image/webp,image/*"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => {
                if (e.target.files?.length) addFiles(e.target.files);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              aria-label="사진 선택"
              disabled={sending || attachments.length >= GUEST_ATTACHMENT_MAX_COUNT}
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
