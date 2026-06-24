'use client';

import { STAFF_CHAT_CLIENT_REV } from '@/lib/chat/staffChatClientRev';

type Props = {
  clientRev: string;
  serverTtsAvailable: boolean | null;
  serverTtsUnlocked: boolean;
  soundEnabled: boolean;
  lastTtsError: string | null;
  ruVoiceReady: boolean | null;
};

export default function StaffChatTtsDiagLine({
  clientRev,
  serverTtsAvailable,
  serverTtsUnlocked,
  soundEnabled,
  lastTtsError,
  ruVoiceReady
}: Props) {
  const serverLabel =
    serverTtsAvailable === null ? '…' : serverTtsAvailable ? 'true' : 'false';
  const localLabel =
    ruVoiceReady === null ? '…' : ruVoiceReady ? 'true' : 'false';

  return (
    <div className="border-t border-gray-100 bg-gray-50 px-2 py-1 text-center text-[9px] leading-tight text-gray-600">
      <span className="font-semibold text-gray-500">diag</span> rev={clientRev || STAFF_CHAT_CLIENT_REV}
      <span className="block">
        serverTtsAvailable={serverLabel} · serverTtsUnlocked={serverTtsUnlocked ? 'true' : 'false'} ·
        soundEnabled={soundEnabled ? 'true' : 'false'} · localRuVoice={localLabel}
      </span>
      {lastTtsError ? (
        <span className="block truncate text-rose-600">lastTtsError: {lastTtsError}</span>
      ) : null}
    </div>
  );
}
