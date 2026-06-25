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
  console.log('[CHAT_DIAG_SOUND_TEST_START]', { ...base, allowHidden: true });

  if (!base.soundUnlocked) {
    console.log('[CHAT_DIAG_SOUND_TEST_UNLOCK]', { reason: 'sound_not_unlocked' });
    const unlocked = await unlockNotificationAudio();
    if (!unlocked) {
      console.log('[CHAT_SOUND_PLAY_FAILED]', {
        source: 'diag_loud_sound_test',
        reason: 'unlock_failed',
        ...diagBase()
      });
      return false;
    }
  }

  console.log('[CHAT_SOUND_PLAY]', {
    source: 'diag_loud_sound_test',
    tone: 'info',
    allowHidden: true,
    ...diagBase()
  });

  const ok = await playNotificationTone('info', { allowHidden: true });
  if (ok) {
    console.log('[CHAT_SOUND_PLAY_OK]', { source: 'diag_loud_sound_test', ...diagBase() });
  } else {
    console.log('[CHAT_SOUND_PLAY_FAILED]', {
      source: 'diag_loud_sound_test',
      reason: 'play_returned_false',
      ...diagBase()
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
    silent: false,
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
 * Manual: run hidden-tab notify path (OS notification + allowHidden beep)
 * without requiring the user to switch tabs first.
 */
export async function testHiddenNotifySimulation(): Promise<{ soundOk: boolean; notifyOk: boolean }> {
  const base = diagBase();
  console.log('[CHAT_DIAG_HIDDEN_SIM_START]', { ...base, allowHidden: true, simulatedHidden: true });

  if (!base.soundUnlocked) {
    await unlockNotificationAudio();
  }

  const notifyOk = await showBrowserNotification({
    title: 'AutoFlow hidden 시뮬레이션',
    body: '탭 hidden 분기와 동일한 OS 알림 경로입니다.',
    tag: 'chat-diag-hidden-sim',
    silent: false,
    source: 'diag_hidden_sim'
  });

  console.log('[CHAT_SOUND_PLAY]', {
    source: 'diag_hidden_sim',
    tone: 'info',
    allowHidden: true,
    simulatedHidden: true,
    ...diagBase()
  });

  const soundOk = await playNotificationTone('info', { allowHidden: true });
  if (soundOk) {
    console.log('[CHAT_SOUND_PLAY_OK]', { source: 'diag_hidden_sim', ...diagBase() });
  } else {
    console.log('[CHAT_SOUND_PLAY_FAILED]', {
      source: 'diag_hidden_sim',
      reason: 'play_returned_false',
      ...diagBase()
    });
  }

  console.log('[CHAT_DIAG_HIDDEN_SIM_DONE]', { notifyOk, soundOk, ...diagBase() });
  return { soundOk, notifyOk };
}
