import { showBrowserNotification } from '@/lib/chat/browserNotifications';
import {
  isNotificationAudioUnlocked,
  NOTIFY_BEEP_GAIN,
  playNotificationTone,
  unlockNotificationAudio
} from '@/lib/chat/playNotificationTone';

function diagBase() {
  const permission =
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported';
  return {
    visibilityState: typeof document !== 'undefined' ? document.visibilityState : null,
    notificationPermission: permission,
    soundUnlocked: isNotificationAudioUnlocked(),
    notifyGain: NOTIFY_BEEP_GAIN
  };
}

/** Manual: verify loud notification beep independent of message receive path. */
export async function testLoudNotificationSound(): Promise<boolean> {
  const base = diagBase();
  console.log('[CHAT_DIAG_SOUND_TEST_START]', { ...base });

  if (!base.soundUnlocked) {
    console.log('[CHAT_DIAG_SOUND_TEST_UNLOCK]', { reason: 'sound_not_unlocked' });
    const unlocked = await unlockNotificationAudio();
    if (!unlocked) {
      console.log('[CHAT_SOUND_SKIPPED]', {
        source: 'diag_loud_sound_test',
        reason: 'not_unlocked',
        ...diagBase()
      });
      return false;
    }
  }

  const ok = await playNotificationTone('info');
  if (!ok) {
    console.log('[CHAT_SOUND_SKIPPED]', {
      source: 'diag_loud_sound_test',
      reason: 'play_returned_false',
      ...diagBase()
    });
  }
  return ok;
}

/** Manual: tag-less OS notification — Windows toast diagnosis. */
export async function testBrowserOsNotificationPlain(): Promise<boolean> {
  const base = diagBase();
  console.log('[CHAT_DIAG_BROWSER_NOTIFY_PLAIN_START]', {
    channel: 'os_notification',
    tag: null,
    ...base
  });

  const ok = await showBrowserNotification({
    title: 'AutoFlow OS 알림 테스트',
    body: '이 알림이 Windows 오른쪽 아래에 떠야 합니다',
    requireInteraction: true,
    silent: true,
    source: 'diag_os_plain_no_tag'
  });

  if (!ok) {
    console.log('[CHAT_BROWSER_NOTIFY_FAILED]', {
      source: 'diag_os_plain_no_tag',
      channel: 'os_notification',
      ...base
    });
  }
  return ok;
}

/** Manual: verify browser OS notification independent of message receive path. */
export async function testBrowserOsNotification(): Promise<boolean> {
  const base = diagBase();
  console.log('[CHAT_DIAG_BROWSER_NOTIFY_TEST_START]', base);

  const ok = await showBrowserNotification({
    title: 'AutoFlow OS 알림 테스트',
    body: '브라우저 OS 알림이 정상적으로 표시되면 성공입니다.',
    tag: 'chat-diag-browser-os-test',
    silent: true,
    source: 'diag_browser_os_test'
  });

  if (!ok) {
    console.log('[CHAT_BROWSER_NOTIFY_FAILED]', {
      source: 'diag_browser_os_test',
      ...base
    });
  }
  return ok;
}

/**
 * Manual: run hidden-tab notify path (OS notification + in-app beep)
 * without requiring the user to switch tabs first.
 */
export async function testHiddenNotifySimulation(): Promise<{ soundOk: boolean; notifyOk: boolean }> {
  const base = diagBase();
  console.log('[CHAT_DIAG_HIDDEN_SIM_START]', { ...base, simulatedHidden: true });

  if (!base.soundUnlocked) {
    await unlockNotificationAudio();
  }

  const notifyOk = await showBrowserNotification({
    title: 'AutoFlow hidden 시뮬레이션',
    body: '탭 hidden 분기와 동일한 OS 알림 경로입니다.',
    tag: 'chat-diag-hidden-sim',
    silent: true,
    source: 'diag_hidden_sim'
  });

  const soundOk = await playNotificationTone('info', { nativeAlreadyPlaysSound: false });

  console.log('[CHAT_DIAG_HIDDEN_SIM_DONE]', { notifyOk, soundOk, ...diagBase() });
  return { soundOk, notifyOk };
}
