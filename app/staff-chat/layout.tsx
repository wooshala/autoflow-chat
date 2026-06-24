import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'AutoFlow Staff',
  description: '청소팀 Staff Chat — 객실 상태·사진·긴급 메시지',
  applicationName: 'AutoFlow Staff',
  manifest: '/staff-chat/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'AutoFlow Staff'
  },
  icons: {
    icon: [
      { url: '/staff-chat/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/staff-chat/icon-512.png', sizes: '512x512', type: 'image/png' }
    ],
    apple: [{ url: '/staff-chat/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }]
  },
  formatDetection: {
    telephone: false
  }
};

export const viewport: Viewport = {
  themeColor: '#2563eb',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover'
};

export default function StaffChatLayout({ children }: { children: React.ReactNode }) {
  return children;
}
