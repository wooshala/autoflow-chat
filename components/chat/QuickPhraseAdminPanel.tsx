'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchEnvelope } from '@/lib/api/envelope';
import { QUICK_PHRASES_ADMIN_URL } from '@/lib/chatApi';
import type { ChatQuickPhrase } from '@/lib/types';

export default function QuickPhraseAdminPanel() {
  const [phrases, setPhrases] = useState<ChatQuickPhrase[]>([]);
  const [loading, setLoading] = useState(true);
  const [draftKey, setDraftKey] = useState('');
  const [draftKo, setDraftKo] = useState('');
  const [draftRu, setDraftRu] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editKo, setEditKo] = useState('');
  const [editRu, setEditRu] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetchEnvelope<{ phrases: ChatQuickPhrase[] }>(QUICK_PHRASES_ADMIN_URL);
    if (res.ok && res.data?.phrases) setPhrases(res.data.phrases);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate() {
    const res = await fetch(QUICK_PHRASES_ADMIN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phrase_key: draftKey, ko: draftKo, ru: draftRu })
    });
    if (res.ok) {
      setDraftKey('');
      setDraftKo('');
      setDraftRu('');
      void load();
    }
  }

  async function handleSaveEdit(id: string) {
    await fetch(QUICK_PHRASES_ADMIN_URL, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ko: editKo, ru: editRu })
    });
    setEditingId(null);
    void load();
  }

  async function handleDelete(id: string) {
    if (!confirm('이 Quick Phrase를 삭제할까요?')) return;
    await fetch(`${QUICK_PHRASES_ADMIN_URL}?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    void load();
  }

  async function move(id: string, direction: 'up' | 'down') {
    const idx = phrases.findIndex((p) => p.id === id);
    if (idx < 0) return;
    const swap = direction === 'up' ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= phrases.length) return;
    const next = [...phrases];
    [next[idx], next[swap]] = [next[swap], next[idx]];
    setPhrases(next);
    await fetch(QUICK_PHRASES_ADMIN_URL, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: next.map((p) => p.id) })
    });
    void load();
  }

  return (
    <div className="rounded-xl border border-gray-600 bg-gray-900/60 p-3 text-sm text-gray-200">
      <div className="mb-2 font-bold text-yellow-400">Quick Phrase 관리 (모바일 즉시 반영)</div>
      {loading ? <p className="text-xs text-gray-400">불러오는 중…</p> : null}
      <div className="space-y-1">
        {phrases.map((p, idx) => (
          <div key={p.id} className="flex flex-wrap items-center gap-1 rounded-lg bg-gray-800/80 px-2 py-1">
            <span className="text-[10px] text-gray-500">{p.phrase_key}</span>
            {editingId === p.id ? (
              <>
                <input value={editKo} onChange={(e) => setEditKo(e.target.value)} className="min-w-[5rem] rounded border border-gray-600 bg-gray-700 px-1 text-xs" placeholder="ko" />
                <input value={editRu} onChange={(e) => setEditRu(e.target.value)} className="min-w-[5rem] rounded border border-gray-600 bg-gray-700 px-1 text-xs" placeholder="ru" />
                <button type="button" onClick={() => void handleSaveEdit(p.id)} className="rounded bg-blue-600 px-2 py-0.5 text-[10px] font-bold">저장</button>
              </>
            ) : (
              <>
                <span className="text-xs">{p.ko}</span>
                <span className="text-xs text-gray-400">/ {p.ru}</span>
                <button type="button" disabled={idx === 0} onClick={() => void move(p.id, 'up')} className="text-[10px] disabled:opacity-30">↑</button>
                <button type="button" disabled={idx === phrases.length - 1} onClick={() => void move(p.id, 'down')} className="text-[10px] disabled:opacity-30">↓</button>
                <button type="button" onClick={() => { setEditingId(p.id); setEditKo(p.ko); setEditRu(p.ru); }} className="text-[10px] text-blue-300">수정</button>
                <button type="button" onClick={() => void handleDelete(p.id)} className="text-[10px] text-rose-300">삭제</button>
              </>
            )}
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        <input value={draftKey} onChange={(e) => setDraftKey(e.target.value)} placeholder="phrase_key" className="w-24 rounded border border-gray-600 bg-gray-700 px-1 py-1 text-xs" />
        <input value={draftKo} onChange={(e) => setDraftKo(e.target.value)} placeholder="한국어" className="w-24 rounded border border-gray-600 bg-gray-700 px-1 py-1 text-xs" />
        <input value={draftRu} onChange={(e) => setDraftRu(e.target.value)} placeholder="Русский" className="w-28 rounded border border-gray-600 bg-gray-700 px-1 py-1 text-xs" />
        <button type="button" onClick={() => void handleCreate()} className="rounded bg-[#FEE500] px-2 py-1 text-xs font-bold text-gray-900">추가</button>
      </div>
    </div>
  );
}
