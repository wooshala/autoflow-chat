'use client';

import { useStaffPwaInstall } from '@/lib/hooks/useStaffPwaInstall';
import type { MessageKey, StaffLocale } from '@/lib/i18n/messages';

type Props = {
  locale: StaffLocale;
  t: (key: MessageKey) => string;
};

export default function StaffPwaInstallBanner({ locale: _locale, t }: Props) {
  const { showBanner, isIosGuide, installing, install, dismiss } = useStaffPwaInstall();

  if (!showBanner) return null;

  return (
    <div className="mx-3 mt-2 shrink-0 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 shadow-sm">
      <div className="flex items-start gap-2">
        <div className="text-2xl leading-none" aria-hidden>
          📲
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-blue-950">{t('pwaInstallTitle')}</p>
          <p className="mt-0.5 text-xs leading-snug text-blue-900/90">
            {isIosGuide ? t('pwaInstallIosHelp') : t('pwaInstallBody')}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {!isIosGuide ? (
              <button
                type="button"
                onClick={() => void install()}
                disabled={installing}
                className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-extrabold text-white active:bg-blue-700 disabled:opacity-50"
              >
                {installing ? t('pwaInstallInstalling') : t('pwaInstallButton')}
              </button>
            ) : null}
            <button
              type="button"
              onClick={dismiss}
              className="rounded-lg border border-blue-300 bg-white px-3 py-2 text-xs font-semibold text-blue-800 active:bg-blue-100"
            >
              {t('pwaInstallDismiss')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
