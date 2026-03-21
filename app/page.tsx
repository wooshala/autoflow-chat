'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

type LoginUser = { id: string; name: string; role: string; language: string; avatar: string; colors: string; pin: string };

const USERS: LoginUser[] = [
  { id: '61622137-1e31-4e58-8c32-6c6ac8d1247f', name: '김관리자', role: '매니저', language: '🇰🇷 한국어', avatar: '👑', colors: 'from-yellow-400 to-amber-500', pin: '0000' },
  { id: 'u-front', name: '이프론트', role: '프론트 직원', language: '🇰🇷 한국어', avatar: '🧑‍💼', colors: 'from-emerald-400 to-teal-500', pin: '1111' },
  { id: 'u-vn', name: 'Nguyen Van A', role: '청소 직원', language: '🇻🇳 Tiếng Việt', avatar: '🧹', colors: 'from-violet-400 to-indigo-500', pin: '2222' },
  { id: 'u-ru', name: 'Anna Ivanova', role: '청소 직원', language: '🇷🇺 Русский', avatar: '🧹', colors: 'from-rose-400 to-red-500', pin: '3333' }
];

export default function LoginPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<LoginUser | null>(null);
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const dots = useMemo(() => [0,1,2,3], []);

  useEffect(() => {
    console.log('[LOGIN_SCREEN_MOUNT]', { path: '/' });
    console.log('[AUTH_INIT]', { source: 'localStorage.autoflow_user' });
    const raw = localStorage.getItem('autoflow_user');
    if (!raw) {
      console.log('[AUTH_USER]', { hasUser: false });
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      console.log('[AUTH_USER]', { hasUser: true, id: parsed?.id || null });
    } catch {
      localStorage.removeItem('autoflow_user');
      console.log('[AUTH_USER]', { hasUser: false, reason: 'invalid_json_removed' });
    }
  }, []);

  useEffect(() => {
    console.log('[PIN_RENDER_CONDITION]', {
      selectedUser: selected?.id || null,
      showPinPad: Boolean(selected)
    });
  }, [selected]);

  function resetSession() {
    localStorage.removeItem('autoflow_user');
    setSelected(null);
    setPin('');
    setError('');
    console.log('[AUTH_USER]', { hasUser: false, reason: 'manual_reset' });
  }

  async function inputDigit(digit: string) {
    if (!selected || loading || pin.length >= 4) return;
    const nextPin = pin + digit;
    setPin(nextPin);
    setError('');
    if (nextPin.length === 4) {
      setLoading(true);
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin: nextPin })
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || 'PIN 오류');
          setPin('');
        } else {
          localStorage.setItem('autoflow_user', JSON.stringify(data.user));
          console.log('[LOGIN_REDIRECT]', { to: '/chat', userId: data?.user?.id || null });
          router.push('/chat');
        }
      } finally {
        setLoading(false);
      }
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-700 to-blue-500 text-white">
      <div className="mx-auto max-w-md px-4 pt-16 pb-10">
        <div className="text-center mb-10">
          <div className="text-5xl mb-2">🏨</div>
          <h1 className="text-3xl font-extrabold">AutoFlow</h1>
          <p className="text-blue-200 text-sm mt-1">채팅 + 유지보수 기록 MVP</p>
          <button onClick={resetSession} className="mt-3 text-xs underline text-blue-100">세션 초기화</button>
        </div>

        {!selected ? (
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-[0.2em] text-blue-200 px-2">직원 선택</p>
            {USERS.map((user) => (
              <button key={user.id} onClick={() => setSelected(user)} className="w-full flex items-center gap-4 rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-left hover:bg-white/20">
                <div className={`h-12 w-12 rounded-full bg-gradient-to-br ${user.colors} flex items-center justify-center text-2xl`}>{user.avatar}</div>
                <div className="flex-1">
                  <div className="font-bold">{user.name}</div>
                  <div className="text-xs text-blue-100">{user.role}</div>
                  <div className="mt-1 inline-block rounded-full bg-white/10 px-2 py-0.5 text-xs text-blue-100">{user.language}</div>
                </div>
                <div className="text-xl text-white/50">›</div>
              </button>
            ))}
          </div>
        ) : (
          <div className="text-center">
            <div className={`mx-auto mb-3 h-20 w-20 rounded-full bg-gradient-to-br ${selected.colors} flex items-center justify-center text-4xl border-4 border-white/30`}>{selected.avatar}</div>
            <div className="text-xl font-bold">{selected.name}</div>
            <div className="text-sm text-blue-100 mb-8">PIN 입력</div>
            <div className="flex justify-center gap-4 mb-4">
              {dots.map((d) => <div key={d} className={`h-4 w-4 rounded-full border-2 ${d < pin.length ? 'bg-white border-white' : 'border-white/50'}`} />)}
            </div>
            {error && <div className="text-red-200 text-sm mb-4">{error}</div>}
            <div className="mx-auto grid max-w-xs grid-cols-3 gap-3">
              {['1','2','3','4','5','6','7','8','9'].map((d) => (
                <button key={d} onClick={() => inputDigit(d)} className="h-16 rounded-2xl border border-white/20 bg-white/10 text-2xl font-semibold hover:bg-white/20">{d}</button>
              ))}
              <div />
              <button onClick={() => inputDigit('0')} className="h-16 rounded-2xl border border-white/20 bg-white/10 text-2xl font-semibold hover:bg-white/20">0</button>
              <button onClick={() => setPin((p) => p.slice(0, -1))} className="h-16 rounded-2xl text-xl text-white/70">⌫</button>
            </div>
            <button onClick={() => { setSelected(null); setPin(''); setError(''); }} className="mt-8 text-sm underline text-blue-100">← 직원 선택으로 돌아가기</button>
          </div>
        )}
      </div>
    </main>
  );
}
