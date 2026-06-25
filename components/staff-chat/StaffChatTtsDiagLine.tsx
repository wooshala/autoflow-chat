'use client';

import { STAFF_CHAT_CLIENT_REV } from '@/lib/chat/staffChatClientRev';
import type { StaffTtsStage } from '@/lib/chat/staffTtsDiagState';

type Props = {
  clientRev: string;
  serverTtsAvailable: boolean | null;
  serverTtsUnlocked: boolean;
  soundEnabled: boolean;
  lastTtsStage: StaffTtsStage;
  lastTtsError: string;
  lastTtsSkipReason: string;
  ttsLang: string;
  ttsLangSource: string;
  translatedTtsExists: boolean;
  ttsTextLength: number;
  ttsTextOrigin: string;
  ruVoiceReady: boolean | null;
};

export default function StaffChatTtsDiagLine({
  clientRev,
  serverTtsAvailable,
  serverTtsUnlocked,
  soundEnabled,
  lastTtsStage,
  lastTtsError,
  lastTtsSkipReason,
  ttsLang,
  ttsLangSource,
  translatedTtsExists,
  ttsTextLength,
  ttsTextOrigin,
  ruVoiceReady
}: Props) {
  const serverLabel =
    serverTtsAvailable === null ? '…' : serverTtsAvailable ? 'true' : 'false';
  const localLabel =
    ruVoiceReady === null ? '…' : ruVoiceReady ? 'true' : 'false';
  const errorTone = lastTtsError !== 'none' ? 'text-rose-600' : 'text-gray-600';

  return (
    <div className="border-t border-gray-100 bg-gray-50 px-2 py-1 text-center text-[9px] leading-tight text-gray-600">
      <span className="font-semibold text-gray-500">diag</span> rev={clientRev || STAFF_CHAT_CLIENT_REV}
      <span className="block">
        serverTtsAvailable={serverLabel} · serverTtsUnlocked={serverTtsUnlocked ? 'true' : 'false'} ·
        soundEnabled={soundEnabled ? 'true' : 'false'} · localRuVoice={localLabel}
      </span>
      <span className="block">
        ttsLang={ttsLang} · ttsLangSource={ttsLangSource} · translatedTtsExists=
        {translatedTtsExists ? 'true' : 'false'} · ttsTextLength={ttsTextLength} · ttsTextOrigin=
        {ttsTextOrigin}
      </span>
      <span className="block">lastTtsStage={lastTtsStage}</span>
      <span className={`block truncate ${errorTone}`}>lastTtsError={lastTtsError}</span>
      <span className="block truncate text-amber-700">lastTtsSkipReason={lastTtsSkipReason}</span>
    </div>
  );
}
