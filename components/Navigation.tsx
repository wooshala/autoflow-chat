'use client';

import { useRouter } from 'next/navigation';

type ActiveTab = 'chat' | 'maintenance' | 'rooms';

export default function Navigation({ active }: { active: ActiveTab }) {
  const router = useRouter();
  // 활성 탭: 카카오 포인트 노랑 / 비활성: 회색
  const btn = (tab: ActiveTab) =>
    `flex flex-col items-center justify-center gap-0.5 ${active === tab ? 'text-[#FEE500]' : 'text-gray-500'}`;
  return (
    // 탭바: 헤더와 통일된 다크 그레이
    <nav className="grid grid-cols-3 bg-gray-800 border-t border-gray-700 h-16 shrink-0">
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
