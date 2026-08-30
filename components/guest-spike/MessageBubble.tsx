'use client';

// IMAGE-CHAT-01A — Message bubble with optional image attachments + lightbox (staff thumbnail click).

import { useState } from 'react';

import type { MessageViewModel } from '@/lib/guest-spike/messageViewModel';
import { GuestImageLightbox } from './GuestImageLightbox';

export function MessageBubble({
  vm,
  align,
  label,
  own,
  time,
  canDelete,
  deleteBusy,
  onDelete,
}: {
  vm: MessageViewModel;
  align: 'left' | 'right';
  label: string;
  own: boolean;
  time?: string;
  canDelete?: boolean;
  deleteBusy?: boolean;
  onDelete?: () => void | Promise<void>;
}) {
  const deleted = Boolean(vm.isDeleted);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  return (
    <>
      <div style={{ alignSelf: align === 'right' ? 'flex-end' : 'flex-start', maxWidth: '80%' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4, flexDirection: align === 'right' ? 'row-reverse' : 'row' }}>
          {canDelete && !deleted ? (
            <button
              type="button"
              disabled={deleteBusy}
              aria-label="메시지 삭제"
              onClick={() => void onDelete?.()}
              style={{
                flexShrink: 0,
                marginTop: 2,
                border: 'none',
                background: 'transparent',
                color: '#6b7280',
                fontSize: 10,
                cursor: deleteBusy ? 'not-allowed' : 'pointer',
                opacity: deleteBusy ? 0.4 : 1,
                padding: '2px 4px',
              }}
            >
              {deleteBusy ? '삭제 중' : '삭제'}
            </button>
          ) : null}
          <div
            style={{
              padding: '8px 12px',
              borderRadius: 16,
              background: deleted ? '#f3f4f6' : own ? '#FEE500' : '#fff',
              border: deleted ? '1px solid #e5e7eb' : own ? 'none' : '1px solid #e5e7eb',
              color: deleted ? '#9ca3af' : '#111',
            }}
          >
            {vm.showText && (
              <div style={{ fontSize: deleted ? 12 : 15, lineHeight: 1.4, fontWeight: deleted ? 400 : undefined }}>
                {vm.displayText}
              </div>
            )}
            {!deleted && vm.showOriginal && (
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: vm.showText ? 3 : 0, lineHeight: 1.35 }}>
                {vm.originalText}
              </div>
            )}
            {!deleted && vm.attachments.length > 0 ? (
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 6,
                  marginTop: vm.showText || vm.showOriginal ? 6 : 0,
                }}
              >
                {vm.attachments.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    aria-label="사진 확대"
                    onClick={() => a.url && setLightboxUrl(a.url)}
                    style={{
                      border: 'none',
                      padding: 0,
                      background: 'transparent',
                      cursor: a.url ? 'pointer' : 'default',
                      borderRadius: 8,
                      overflow: 'hidden',
                      lineHeight: 0,
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={a.url || undefined}
                      alt=""
                      style={{
                        width: 120,
                        height: 120,
                        objectFit: 'cover',
                        display: 'block',
                        background: '#e5e7eb',
                      }}
                    />
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        <div style={{ fontSize: 10, color: '#9ca3af', textAlign: align, marginTop: 2 }}>
          {label}
          {time ? <span style={{ marginLeft: 6 }}>{time}</span> : null}
        </div>
      </div>
      {lightboxUrl ? <GuestImageLightbox url={lightboxUrl} alt="" onClose={() => setLightboxUrl(null)} /> : null}
    </>
  );
}
