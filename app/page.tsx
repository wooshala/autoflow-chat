'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { loadUser, runSessionMigration } from '@/lib/auth';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    runSessionMigration();
    if (loadUser()) {
      router.replace('/chat');
    } else {
      router.replace('/login');
    }
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-100">
      <p className="text-sm text-gray-500">이동 중…</p>
    </main>
  );
}
