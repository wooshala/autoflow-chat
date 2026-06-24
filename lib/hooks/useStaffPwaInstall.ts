'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const DISMISS_STORAGE_KEY = 'autoflow_staff_pwa_install_dismissed_v1';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false;
  const mq = window.matchMedia('(display-mode: standalone)').matches;
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return mq || iosStandalone;
}

function isIosSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/i.test(ua) && !/CriOS|FxiOS|EdgiOS/i.test(ua);
}

function loadDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function useStaffPwaInstall() {
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [isIosGuide, setIsIosGuide] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isStandaloneDisplay()) return;
    if (loadDismissed()) return;

    if (isIosSafari()) {
      setIsIosGuide(true);
      setShowBanner(true);
      return;
    }

    function onBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      deferredPromptRef.current = e as BeforeInstallPromptEvent;
      setShowBanner(true);
    }

    function onAppInstalled() {
      deferredPromptRef.current = null;
      setShowBanner(false);
      setIsIosGuide(false);
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(DISMISS_STORAGE_KEY, '1');
    } catch {
      /* ignore */
    }
    setShowBanner(false);
    setIsIosGuide(false);
  }, []);

  const install = useCallback(async () => {
    const promptEvent = deferredPromptRef.current;
    if (!promptEvent) return false;
    setInstalling(true);
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice.outcome === 'accepted') {
        deferredPromptRef.current = null;
        setShowBanner(false);
        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      setInstalling(false);
    }
  }, []);

  return {
    showBanner: showBanner && !isStandaloneDisplay(),
    isIosGuide,
    installing,
    install,
    dismiss
  };
}
