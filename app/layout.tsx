import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AutoFlow',
  description: '채팅 + 유지보수 기록 MVP'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
