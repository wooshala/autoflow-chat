'use client';

import { useRouter } from 'next/navigation';

export default function Navigation({ active }: { active: 'chat' | 'maintenance' }) {
  const router = useRouter();
  return (
    <nav className="grid grid-cols-2 bg-white border-t border-gray-200 h-16 shrink-0">
      <button onClick={() => router.push('/chat')} className={`flex flex-col items-center justify-center ${active === 'chat' ? 'text-blue-600' : 'text-gray-400'}`}>
        <span className="text-2xl">💬</span>
        <span className="text-xs font-bold">채팅</span>
      </button>
      <button onClick={() => router.push('/maintenance')} className={`flex flex-col items-center justify-center ${active === 'maintenance' ? 'text-blue-600' : 'text-gray-400'}`}>
        <span className="text-2xl">🔧</span>
        <span className="text-xs font-bold">유지보수</span>
      </button>
    </nav>
  );
}
