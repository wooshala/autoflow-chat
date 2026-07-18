'use client';

// Phase 1B — Customer Service Console PoC (mock data, mock translation, no DB).
// Self-contained 3-panel layout (left conversation list · center timeline · right
// ops panel) so it can be exercised without touching the 1200-line staff /chat file.
// Reachable only behind the customer-service console flag.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  LANG_DISPLAY,
  mockCustomerTranslator,
  type CustomerLang,
} from '@/lib/customer-service/translationLangs';
import {
  MOCK_CONVERSATIONS,
  type MockConversation,
  type MockMessage,
} from '@/lib/customer-service/mock/customerConsoleMock';
import {
  extractClipboardImage,
  validateClipboardImage,
  createClipboardImagePreview,
  formatImageSize,
  type ClipboardEventLike,
  type ClipboardImagePreview,
} from '@/lib/customer-service/clipboardImage';

type InputMode = 'public' | 'internal';

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch {
    return '';
  }
}

function lastKoPreview(c: MockConversation): string {
  const last = c.messages[c.messages.length - 1];
  if (!last) return '';
  if (last.message_type === 'image' && !last.original_text) return '📷 이미지';
  if (last.sender_type === 'guest') return last.translated_text.ko ?? last.original_text ?? '';
  return last.original_text ?? '';
}

export default function CustomerConsole() {
  const [conversations, setConversations] = useState<MockConversation[]>(() =>
    JSON.parse(JSON.stringify(MOCK_CONVERSATIONS)),
  );
  const [selectedId, setSelectedId] = useState<string>(MOCK_CONVERSATIONS[0]?.id ?? '');
  const [mode, setMode] = useState<InputMode>('public');
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<{ p: ClipboardImagePreview; type: string; size: number } | null>(null);
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const previewRef = useRef<ClipboardImagePreview | null>(null);

  const selected = conversations.find((c) => c.id === selectedId) ?? conversations[0];

  const clearPreview = useCallback(() => {
    previewRef.current?.revoke();
    previewRef.current = null;
    setPreview(null);
  }, []);

  // Revoke any live object URL on unmount (memory-leak safety).
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

  const selectConversation = useCallback((id: string) => {
    setSelectedId(id);
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, unread: 0 } : c)));
    setText('');
    setPasteError(null);
    setMode('public');
  }, []);

  const send = useCallback(async () => {
    if (!selected) return;
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
        const out = await mockCustomerTranslator.translate(body, 'ko', selected.guest_language);
        if (out) translated = { [selected.guest_language]: out };
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
      setConversations((prev) =>
        prev.map((c) => (c.id === selected.id ? { ...c, messages: [...c.messages, msg] } : c)),
      );
      setText('');
      clearPreview();
    } finally {
      setSending(false);
    }
  }, [selected, text, preview, mode, clearPreview]);

  const toggleOriginal = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const sorted = useMemo(
    () =>
      [...conversations].sort((a, b) => {
        const at = a.messages[a.messages.length - 1]?.created_at ?? '';
        const bt = b.messages[b.messages.length - 1]?.created_at ?? '';
        return bt.localeCompare(at);
      }),
    [conversations],
  );

  return (
    <div className="flex h-full min-h-[600px] w-full overflow-hidden rounded-lg border border-gray-200 bg-white text-sm">
      {/* LEFT — conversation list */}
      <aside className="flex w-64 shrink-0 flex-col border-r border-gray-200 bg-gray-50">
        <div className="border-b border-gray-200 px-3 py-2 font-semibold text-gray-700">
          고객 서비스 · 대화 <span className="text-xs font-normal text-gray-400">(PoC · mock)</span>
        </div>
        <ul className="flex-1 overflow-y-auto">
          {sorted.map((c) => {
            const active = c.id === selected?.id;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => selectConversation(c.id)}
                  className={`flex w-full flex-col gap-0.5 border-b border-gray-100 px-3 py-2 text-left hover:bg-white ${
                    active ? 'bg-white ring-1 ring-inset ring-blue-300' : ''
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[11px] font-medium text-blue-800">
                      {LANG_DISPLAY[c.guest_language]}
                    </span>
                    <span className="font-semibold text-gray-800">{c.room_no}호</span>
                    <span className="ml-auto text-[11px] text-gray-400">
                      {fmtTime(c.messages[c.messages.length - 1]?.created_at ?? '')}
                    </span>
                    {c.unread > 0 && (
                      <span className="rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white">
                        {c.unread}
                      </span>
                    )}
                  </div>
                  <div className="truncate text-xs text-gray-500">{lastKoPreview(c)}</div>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* CENTER — timeline + input */}
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-gray-200 px-4 py-2">
          <span className="font-semibold text-gray-800">{selected?.room_no}호</span>
          <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[11px] text-blue-800">
            {selected ? LANG_DISPLAY[selected.guest_language] : ''}
          </span>
          <span className="ml-auto text-xs text-gray-400">대화 타임라인</span>
        </header>

        <div className="flex-1 space-y-3 overflow-y-auto bg-gray-50 p-4">
          {selected?.messages.map((m) => (
            <MessageBubble
              key={m.id}
              m={m}
              guestLang={selected.guest_language}
              expanded={expanded.has(m.id)}
              onToggle={() => toggleOriginal(m.id)}
            />
          ))}
        </div>

        {/* INPUT */}
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
      </section>

      {/* RIGHT — small ops/info panel */}
      <aside className="hidden w-64 shrink-0 flex-col border-l border-gray-200 bg-gray-50 lg:flex">
        <div className="border-b border-gray-200 px-3 py-2 font-semibold text-gray-700">운영 정보</div>
        <div className="space-y-2 p-3 text-xs text-gray-600">
          <div>객실: {selected?.room_no}호</div>
          <div>고객 언어: {selected ? LANG_DISPLAY[selected.guest_language] : ''}</div>
          <div className="rounded bg-amber-50 p-2 text-[11px] text-amber-700">
            Phase 1B PoC · mock 데이터/번역. 실제 고객·DB 미연결. Quick Reply 없음.
          </div>
        </div>
      </aside>
    </div>
  );
}

function MessageBubble({
  m,
  guestLang,
  expanded,
  onToggle,
}: {
  m: MockMessage;
  guestLang: CustomerLang;
  expanded: boolean;
  onToggle: () => void;
}) {
  const isGuest = m.sender_type === 'guest';
  const isInternal = m.visibility === 'internal';

  // Guest → Korean translation primary; staff → Korean original primary.
  const koText = isGuest ? m.translated_text.ko ?? m.original_text : m.original_text;
  const guestTranslation = isGuest ? null : m.translated_text[guestLang];
  const secondary = isGuest ? m.original_text : guestTranslation;
  const secondaryLabel = isGuest ? '고객 원문' : '고객에게 전달된 번역';

  return (
    <div className={`flex ${isGuest ? 'justify-start' : 'justify-end'}`}>
      <div
        className={`max-w-[75%] rounded-lg px-3 py-2 ${
          isInternal
            ? 'border border-amber-300 bg-amber-50'
            : isGuest
              ? 'bg-white ring-1 ring-gray-200'
              : 'bg-blue-600 text-white'
        }`}
      >
        <div className="mb-0.5 flex items-center gap-2 text-[11px] opacity-70">
          <span>{isGuest ? '고객' : isInternal ? '내부 메모' : '직원'}</span>
          {isInternal && (
            <span className="rounded bg-amber-200 px-1 text-[10px] font-semibold text-amber-800">직원 전용</span>
          )}
          <span className="ml-auto">{fmtTime(m.created_at)}</span>
        </div>

        {m.message_type === 'image' && (
          <div
            className={`mb-1 flex h-24 w-40 items-center justify-center rounded border text-[11px] ${
              isGuest ? 'border-gray-200 text-gray-400' : 'border-blue-400 text-blue-100'
            }`}
          >
            🖼 {m.image_label ?? '이미지'}
          </div>
        )}

        {koText && <div className="whitespace-pre-wrap">{koText}</div>}

        {m.translation_failed && (
          <div className="mt-1 text-[11px] font-medium text-red-500">
            ⚠ 번역 실패 — 원문을 표시합니다{m.original_text ? `: ${m.original_text}` : ''}
          </div>
        )}

        {secondary && (
          <div className="mt-1 border-t border-black/10 pt-1">
            <button type="button" onClick={onToggle} className="text-[11px] underline opacity-70">
              {expanded ? '접기' : `${secondaryLabel} 보기`}
            </button>
            {expanded && <div className="mt-0.5 whitespace-pre-wrap text-[12px] opacity-90">{secondary}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
