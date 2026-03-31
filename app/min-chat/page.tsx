'use client';

import { useCallback, useEffect, useState } from 'react';

type Row = {
  id: string;
  created_at: string;
  user_id: string | null;
  message: string | null;
};

export default function MinChatPage() {
  const [input, setInput] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/chat/list-min?limit=50', { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      console.log('[LIST_RESPONSE]', data);
      console.log('messages length:', (data as any)?.messages?.length);
      console.log('raw data:', data);
      if (!res.ok) {
        throw new Error(typeof data?.error === 'string' ? data.error : `HTTP ${res.status}`);
      }
      const nextRows = Array.isArray((data as any)?.messages) ? ((data as any).messages as Row[]) : [];
      console.log('[SET_ROWS_INPUT]', (data as any)?.messages);
      console.log('[SET_ROWS_LENGTH]', Array.isArray((data as any)?.messages) ? (data as any).messages.length : 'not-array');
      console.log('[NEXT_ROWS]', nextRows);
      setRows(nextRows);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function send() {
    const msg = input.trim();
    if (!msg) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/chat/send-min', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg,
          user_id: '00000000-0000-0000-0000-000000000001'
        })
      });
      const data = await res.json().catch(() => ({}));
      console.log('[SEND_RESPONSE]', data);
      if (!res.ok) {
        throw new Error(typeof data?.error === 'string' ? data.error : `HTTP ${res.status}`);
      }
      setInput('');
      await load();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-2xl space-y-4">
        <div style={{ fontSize: 20, fontWeight: 'bold', color: 'red' }}>
          DEBUG rows.length = {rows.length}
        </div>
        <header className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="text-lg font-bold">Min Repro Chat</div>
          <div className="text-xs text-gray-500">
            Sends to <code className="rounded bg-gray-100 px-1">/api/chat/send-min</code> and loads from{' '}
            <code className="rounded bg-gray-100 px-1">/api/chat/list-min</code>.
          </div>
        </header>

        <section className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
          <div className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void send();
              }}
              placeholder="type message..."
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => void send()}
              disabled={loading}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Send
            </button>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 disabled:opacity-50"
            >
              Reload
            </button>
          </div>

          {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          <div className="text-xs text-gray-500">
            {loading ? 'loading…' : `rows: ${rows.length}`}
          </div>
        </section>

        <section style={{ border: '1px solid #ccc', padding: 12, marginTop: 12, background: '#fff' }}>
          <div>rows.length: {rows.length}</div>

          {rows.length === 0 ? (
            <div className="text-sm text-gray-500">No rows</div>
          ) : (
            <ul className="space-y-2">
              {rows.map((r) => (
                <li key={r.id} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                  <div className="text-xs text-gray-500 font-mono">{r.id}</div>
                  <div className="text-xs text-gray-500">{r.created_at}</div>
                  <div className="text-sm text-gray-900">{r.message}</div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

