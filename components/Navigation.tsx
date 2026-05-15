'use client';

import { useRouter } from 'next/navigation';

type ActiveTab = 'chat' | 'maintenance' | 'rooms';

export default function Navigation({ active }: { active: ActiveTab }) {
  const router = useRouter();
  const btn = (tab: ActiveTab) =>
    `flex flex-col items-center justify-center ${active === tab ? 'text-blue-600' : 'text-gray-400'}`;
  return (
    <nav className="grid grid-cols-3 bg-white border-t border-gray-200 h-16 shrink-0">
      <button onClick={() => router.push('/chat')} className={btn('chat')}>
        <span className="text-2xl">💬</span>
        <span className="text-xs font-bold">채팅</span>
      </button>
      <button onClick={() => router.push('/maintenance')} className={btn('maintenance')}>
        <span className="text-2xl">🔧</span>
        <span className="text-xs font-bold">유지보수</span>
      </button>
      <button onClick={() => router.push('/rooms')} className={btn('rooms')}>
        <span className="text-2xl">🏨</span>
        <span className="text-xs font-bold">객실</span>
      </button>
    </nav>
  );
}
