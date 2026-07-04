'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchEnvelope } from '@/lib/api/envelope';
import { staffSessionAuthHeaders } from '@/lib/auth/staffAccountSession';
import { QUICK_PHRASES_PERSONAL_URL, QUICK_PHRASES_TRANSLATE_URL } from '@/lib/chatApi';
import type { MessageKey, StaffLocale } from '@/lib/i18n/messages';
import type { ChatQuickPhrase } from '@/lib/types';

type Props = {
  open: boolean;
  locale: StaffLocale;
  t: (key: MessageKey) => string;
  onClose: () => void;
  onSaved: () => void;
};

export default function MobileQuickPhraseEditor({ open, locale, t, onClose, onSaved }: Props) {
  const [phrases, setPhrases] = useState<ChatQuickPhrase[]>([]);
  const [loading, setLoading] = useState(false);
  const [draftKo, setDraftKo] = useState('');
  const [draftRu, setDraftRu] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editKo, setEditKo] = useState('');
  const [editRu, setEditRu] = useState('');
  const [translating, setTranslating] = useState(false);

  const sessionHeaders = useMemo(() => staffSessionAuthHeaders(), [open]);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetchEnvelope<{ phrases: ChatQuickPhrase[] }>(QUICK_PHRASES_PERSONAL_URL, {
      headers: sessionHeaders
    });
    if (res.ok && res.data?.phrases) setPhrases(res.data.phrases);
    setLoading(false);
  }, [sessionHeaders]);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  async function translateField(source: string, from: 'ko' | 'ru', to: 'ko' | 'ru'): Promise<string | null> {
    const text = source.trim();
    if (!text) return null;
    setTranslating(true);
    try {
      const res = await fetchEnvelope<{ translated: string }>(QUICK_PHRASES_TRANSLATE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...sessionHeaders },
        body: JSON.stringify({ text, from, to })
      });
      if (!res.ok) return null;
      return res.data.translated?.trim() || null;
    } finally {
      setTranslating(false);
    }
  }

  if (!open) return null;

  async function handleCreate() {
    const res = await fetch(QUICK_PHRASES_PERSONAL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...sessionHeaders },
      body: JSON.stringify({ ko: draftKo, ru: draftRu })
    });
    if (res.ok) {
      setDraftKo('');
      setDraftRu('');
      await load();
      onSaved();
    }
  }

  async function handleSaveEdit(id: string) {
    await fetch(QUICK_PHRASES_PERSONAL_URL, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...sessionHeaders },
      body: JSON.stringify({ id, ko: editKo, ru: editRu })
    });
    setEditingId(null);
    await load();
    onSaved();
  }

  async function handleDelete(id: string) {
    const msg = t('phraseDeleteConfirm');
    if (!confirm(msg)) return;
    await fetch(`${QUICK_PHRASES_PERSONAL_URL}?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: sessionHeaders
    });
    await load();
    onSaved();
  }

  async function move(id: string, direction: 'up' | 'down') {
    const idx = phrases.findIndex((p) => p.id === id);
    if (idx < 0) return;
    const swap = direction === 'up' ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= phrases.length) return;
    const next = [...phrases];
    [next[idx], next[swap]] = [next[swap], next[idx]];
    setPhrases(next);
    await fetch(QUICK_PHRASES_PERSONAL_URL, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...sessionHeaders },
      body: JSON.stringify({ ids: next.map((p) => p.id) })
    });
    await load();
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col justify-end bg-black/45" role="dialog" aria-modal="true">
      <button type="button" className="absolute inset-0" aria-label={t('phraseClose')} onClick={onClose} />
      <div className="relative mx-auto flex max-h-[min(88dvh,640px)] w-full max-w-md flex-col rounded-t-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <h2 className="text-base font-bold text-gray-900">{t('phrasePersonalTitle')}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm font-semibold text-gray-600 active:bg-gray-100"
          >
            {t('phraseClose')}
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {loading ? <p className="py-4 text-center text-sm text-gray-400">{t('loading')}</p> : null}
          <div className="space-y-2">
            {phrases.map((p, idx) => (
              <div key={p.id} className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                <div className="mb-1 text-[10px] font-mono text-gray-400">{p.phrase_key}</div>
                {editingId === p.id ? (
                  <div className="space-y-2">
                    <label className="block text-xs font-semibold text-gray-600">{t('phraseKoLabel')}</label>
                    <input
                      value={editKo}
                      onChange={(e) => setEditKo(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base"
                    />
                    <button
                      type="button"
                      disabled={translating || !editKo.trim()}
                      onClick={() =>
                        void translateField(editKo, 'ko', 'ru').then((v) => {
                          if (v) setEditRu(v);
                        })
                      }
                      className="text-xs font-semibold text-blue-700 disabled:opacity-40"
                    >
                      {t('phraseTranslateToRu')}
                    </button>
                    <label className="block text-xs font-semibold text-gray-600">{t('phraseRuLabel')}</label>
                    <input
                      value={editRu}
                      onChange={(e) => setEditRu(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base"
                    />
                    <button
                      type="button"
                      disabled={translating || !editRu.trim()}
                      onClick={() =>
                        void translateField(editRu, 'ru', 'ko').then((v) => {
                          if (v) setEditKo(v);
                        })
                      }
                      className="text-xs font-semibold text-blue-700 disabled:opacity-40"
                    >
                      {t('phraseTranslateToKo')}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSaveEdit(p.id)}
                      className="h-10 w-full rounded-lg bg-blue-600 text-sm font-bold text-white"
                    >
                      {t('phraseSave')}
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="text-sm font-semibold text-gray-900">{p.ko}</div>
                    <div className="text-sm text-gray-600">{p.ru}</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => void move(p.id, 'up')}
                        className="h-9 min-w-[2.5rem] rounded-lg border border-gray-300 bg-white px-2 text-sm disabled:opacity-30"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        disabled={idx === phrases.length - 1}
                        onClick={() => void move(p.id, 'down')}
                        className="h-9 min-w-[2.5rem] rounded-lg border border-gray-300 bg-white px-2 text-sm disabled:opacity-30"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(p.id);
                          setEditKo(p.ko);
                          setEditRu(p.ru);
                        }}
                        className="h-9 flex-1 rounded-lg border border-blue-300 bg-blue-50 px-3 text-sm font-semibold text-blue-800"
                      >
                        {t('phraseEdit')}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(p.id)}
                        className="h-9 rounded-lg border border-rose-300 bg-rose-50 px-3 text-sm font-semibold text-rose-700"
                      >
                        {t('phraseDelete')}
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="shrink-0 border-t border-gray-200 bg-white px-4 py-3">
          <div className="space-y-2">
            <input
              value={draftKo}
              onChange={(e) => setDraftKo(e.target.value)}
              placeholder={t('phraseKoLabel')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base"
            />
            <button
              type="button"
              disabled={translating || !draftKo.trim()}
              onClick={() =>
                void translateField(draftKo, 'ko', 'ru').then((v) => {
                  if (v) setDraftRu(v);
                })
              }
              className="text-xs font-semibold text-blue-700 disabled:opacity-40"
            >
              {t('phraseTranslateToRu')}
            </button>
            <input
              value={draftRu}
              onChange={(e) => setDraftRu(e.target.value)}
              placeholder={t('phraseRuLabel')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base"
            />
            <button
              type="button"
              disabled={translating || !draftRu.trim()}
              onClick={() =>
                void translateField(draftRu, 'ru', 'ko').then((v) => {
                  if (v) setDraftKo(v);
                })
              }
              className="text-xs font-semibold text-blue-700 disabled:opacity-40"
            >
              {t('phraseTranslateToKo')}
            </button>
            <button
              type="button"
              onClick={() => void handleCreate()}
              className="h-11 w-full rounded-xl bg-gray-900 text-sm font-extrabold text-white"
            >
              {t('phraseAdd')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
