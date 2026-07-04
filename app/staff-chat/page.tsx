import { Suspense } from 'react';
import StaffChatClient from './StaffChatClient';

export default function StaffChatPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-gray-100">
          <p className="text-sm text-gray-500">…</p>
        </main>
      }
    >
      <StaffChatClient />
    </Suspense>
  );
}
