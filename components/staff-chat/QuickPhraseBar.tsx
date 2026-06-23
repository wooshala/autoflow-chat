'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  bumpPhraseUseCount,
  loadQuickPhrases,
  movePhrase,
  saveQuickPhrases,
  type QuickPhrase
} from '@/lib/chat/staffQuickPhrases';

type Props = {
  onInsert: (label: string) => void;
  disabled?: boolean;
};

export default function QuickPhraseBar({ onInsert, disabled = false }: Props) {
  const [phrases, setPhrases] = useState<QuickPhrase[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [draftLabel, setDraftLabel] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addInputRef = useRef<HTMLInputElement>(null);

  const persist = useCallback((next: QuickPhrase[]) => {
    setPhrases(next);
    saveQuickPhrases(next);
  }, []);

  useEffect(() => {
    setPhrases(loadQuickPhrases());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (addOpen) addInputRef.current?.focus();
  }, [addOpen]);

  function handlePhraseTap(phrase: QuickPhrase) {
    if (disabled || manageOpen) return;
    const next = bumpPhraseUseCount(phrases, phrase.id);
    persist(next);
    onInsert(phrase.label);
  }

  function clearLongPressTimer() {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }

  function startLongPress(phrase: QuickPhrase) {
    clearLongPressTimer();
    longPressTimerRef.current = setTimeout(() => {
      setEditingId(phrase.id);
      setEditDraft(phrase.label);
      setManageOpen(true);
      longPressTimerRef.current = null;
    }, 500);
  }

  function handleAddSave() {
    const label = draftLabel.trim();
    if (!label) return;
    persist([...phrases, { id: `qp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, label, useCount: 0 }]);
    setDraftLabel('');
    setAddOpen(false);
  }

  function handleEditSave() {
    if (!editingId) return;
    const label = editDraft.trim();
    if (!label) return;
    persist(phrases.map((p) => (p.id === editingId ? { ...p, label } : p)));
    setEditingId(null);
    setEditDraft('');
  }

  function handleDelete(id: string) {
    if (phrases.length <= 1) return;
    persist(phrases.filter((p) => p.id !== id));
    if (editingId === id) {
      setEditingId(null);
      setEditDraft('');
    }
  }

  if (!hydrated) return null;

  return (
    <div className="border-b border-gray-100 bg-white px-2 py-1.5">
      <div className="mx-auto flex max-w-md items-center gap-1.5">
        <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-gray-400">Quick</span>
        <div className="min-w-0 flex-1 overflow-x-auto overscroll-x-contain">
          <div className="flex w-max items-center gap-1.5 pr-1">
            {phrases.map((phrase) => (
              <button
                key={phrase.id}
                type="button"
                disabled={disabled}
                onClick={() => handlePhraseTap(phrase)}
                onPointerDown={() => startLongPress(phrase)}
                onPointerUp={clearLongPressTimer}
                onPointerLeave={clearLongPressTimer}
                onPointerCancel={clearLongPressTimer}
                className="shrink-0 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-semibold text-gray-800 active:bg-blue-50 active:border-blue-300 disabled:opacity-40"
              >
                {phrase.label}
              </button>
            ))}
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                setAddOpen((v) => !v);
                setDraftLabel('');
              }}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-dashed border-gray-300 bg-white text-sm font-bold text-gray-600 active:bg-gray-50 disabled:opacity-40"
              aria-label="문구 추가"
            >
              +
            </button>
          </div>
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            setManageOpen((v) => !v);
            setEditingId(null);
            setEditDraft('');
          }}
          className="shrink-0 rounded-lg px-1.5 py-0.5 text-[10px] font-bold text-gray-500 underline-offset-2 hover:underline disabled:opacity-40"
        >
          {manageOpen ? '완료' : '편집'}
        </button>
      </div>

      {addOpen ? (
        <div className="mx-auto mt-1.5 flex max-w-md items-center gap-2 px-0.5">
          <label className="shrink-0 text-[11px] font-semibold text-gray-500">문구</label>
          <input
            ref={addInputRef}
            type="text"
            value={draftLabel}
            onChange={(e) => setDraftLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddSave();
              }
            }}
            placeholder="새 문구"
            className="min-h-[36px] min-w-0 flex-1 rounded-lg border border-gray-200 px-2 text-sm outline-none focus:border-blue-500"
          />
          <button
            type="button"
            onClick={handleAddSave}
            disabled={!draftLabel.trim()}
            className="shrink-0 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-bold text-white disabled:bg-gray-300"
          >
            저장
          </button>
        </div>
      ) : null}

      {manageOpen ? (
        <div className="mx-auto mt-1.5 max-h-36 max-w-md overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 px-2 py-1">
          {phrases.map((phrase, idx) => (
            <div key={phrase.id} className="flex items-center gap-1 border-b border-gray-100 py-1 last:border-0">
              {editingId === phrase.id ? (
                <>
                  <input
                    type="text"
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                    className="min-h-[32px] min-w-0 flex-1 rounded border border-gray-200 px-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={handleEditSave}
                    className="shrink-0 rounded bg-blue-600 px-2 py-1 text-[10px] font-bold text-white"
                  >
                    저장
                  </button>
                </>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-800">{phrase.label}</span>
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={() => persist(movePhrase(phrases, phrase.id, 'up'))}
                    className="shrink-0 rounded border border-gray-200 px-1.5 py-0.5 text-[10px] disabled:opacity-30"
                    aria-label="위로"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    disabled={idx === phrases.length - 1}
                    onClick={() => persist(movePhrase(phrases, phrase.id, 'down'))}
                    className="shrink-0 rounded border border-gray-200 px-1.5 py-0.5 text-[10px] disabled:opacity-30"
                    aria-label="아래로"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(phrase.id);
                      setEditDraft(phrase.label);
                    }}
                    className="shrink-0 rounded border border-gray-200 px-1.5 py-0.5 text-[10px] font-semibold text-gray-600"
                  >
                    수정
                  </button>
                  <button
                    type="button"
                    disabled={phrases.length <= 1}
                    onClick={() => handleDelete(phrase.id)}
                    className="shrink-0 rounded border border-rose-200 px-1.5 py-0.5 text-[10px] font-semibold text-rose-600 disabled:opacity-30"
                  >
                    삭제
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
