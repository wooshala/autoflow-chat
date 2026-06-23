'use client';

import { useEffect, useState } from 'react';
import { loadUser, runSessionMigration, saveUser } from '@/lib/auth';

function readReturnPath(): string {
  if (typeof window === 'undefined') return '/chat';
  const params = new URLSearchParams(window.location.search);
  const ret = params.get('return');
  if (ret && ret.startsWith('/')) return ret;
  return '/chat';
}

function LoginForm() {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [returnTo, setReturnTo] = useState('/chat');

  useEffect(() => {
    runSessionMigration();
    const ret = readReturnPath();
    setReturnTo(ret);
    if (loadUser()) {
      window.location.href = ret;
    }
  }, []);

  function handleEnter() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('이름을 입력해 주세요');
      return;
    }
    setError('');
    saveUser(trimmed);
    window.location.href = returnTo;
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-700 to-blue-500 text-white">
      <div className="mx-auto max-w-md px-4 pt-16 pb-10">
        <div className="mb-10 text-center">
          <div className="mb-2 text-5xl">🏨</div>
          <h1 className="text-3xl font-extrabold">AutoFlow</h1>
          <p className="mt-1 text-sm text-blue-200">이름을 입력하고 입장하세요</p>
        </div>

        <div className="rounded-2xl border border-white/20 bg-white/10 p-6 shadow-lg">
          <label className="block text-xs font-semibold uppercase tracking-wide text-blue-200" htmlFor="login-name">
            이름
          </label>
          <input
            id="login-name"
            type="text"
            autoComplete="name"
            autoFocus
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (error) setError('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleEnter();
            }}
            placeholder="홍길동"
            className="mt-2 w-full rounded-xl border border-white/30 bg-white/10 px-4 py-3 text-base text-white placeholder:text-blue-200/60 outline-none ring-white focus:ring-2"
          />
          {error ? <p className="mt-2 text-sm text-rose-200">{error}</p> : null}
          <button
            type="button"
            onClick={handleEnter}
            disabled={!name.trim()}
            className="mt-6 w-full rounded-xl bg-white py-3 text-sm font-extrabold text-blue-900 disabled:opacity-40"
          >
            입장
          </button>
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return <LoginForm />;
}
