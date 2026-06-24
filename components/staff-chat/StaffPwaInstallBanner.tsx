'use client';

import { useStaffPwaInstall } from '@/lib/hooks/useStaffPwaInstall';

type Lang = 'ko' | 'vi' | 'ru';

const PWA_I18N: Record<Lang, Record<string, string>> = {
  ko: {
    pwaInstallTitle: '홈 화면에 추가',
    pwaInstallBody: '앱처럼 빠르게 열기 — AutoFlow Staff를 홈 화면에 추가하세요.',
    pwaInstallButton: '설치',
    pwaInstallInstalling: '설치 중…',
    pwaInstallDismiss: '나중에',
    pwaInstallIosHelp: 'Safari에서 공유(□↑) → 「홈 화면에 추가」를 선택하세요.'
  },
  vi: {
    pwaInstallTitle: 'Thêm vào màn hình chính',
    pwaInstallBody: 'Mở như ứng dụng — thêm AutoFlow Staff vào màn hình chính.',
    pwaInstallButton: 'Cài đặt',
    pwaInstallInstalling: 'Đang cài…',
    pwaInstallDismiss: 'Để sau',
    pwaInstallIosHelp: 'Safari: Chia sẻ (□↑) → «Thêm vào Màn hình chính».'
  },
  ru: {
    pwaInstallTitle: 'Добавить на главный экран',
    pwaInstallBody: 'Открывайте как приложение — добавьте AutoFlow Staff на главный экран.',
    pwaInstallButton: 'Установить',
    pwaInstallInstalling: 'Установка…',
    pwaInstallDismiss: 'Позже',
    pwaInstallIosHelp: 'Safari: Поделиться (□↑) → «На экран Домой».'
  }
};

function pwaT(lang: Lang, key: string): string {
  return PWA_I18N[lang][key] ?? PWA_I18N.ko[key] ?? key;
}

type Props = {
  lang: Lang;
};

export default function StaffPwaInstallBanner({ lang }: Props) {
  const { showBanner, isIosGuide, installing, install, dismiss } = useStaffPwaInstall();

  if (!showBanner) return null;

  return (
    <div className="mx-3 mt-2 shrink-0 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 shadow-sm">
      <div className="flex items-start gap-2">
        <div className="text-2xl leading-none" aria-hidden>
          📲
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-blue-950">{pwaT(lang, 'pwaInstallTitle')}</p>
          <p className="mt-0.5 text-xs leading-snug text-blue-900/90">
            {isIosGuide ? pwaT(lang, 'pwaInstallIosHelp') : pwaT(lang, 'pwaInstallBody')}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {!isIosGuide ? (
              <button
                type="button"
                onClick={() => void install()}
                disabled={installing}
                className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-extrabold text-white active:bg-blue-700 disabled:opacity-50"
              >
                {installing ? pwaT(lang, 'pwaInstallInstalling') : pwaT(lang, 'pwaInstallButton')}
              </button>
            ) : null}
            <button
              type="button"
              onClick={dismiss}
              className="rounded-lg border border-blue-300 bg-white px-3 py-2 text-xs font-semibold text-blue-800 active:bg-blue-100"
            >
              {pwaT(lang, 'pwaInstallDismiss')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
