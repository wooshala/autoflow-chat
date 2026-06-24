'use client';

type Props = {
  serverTtsAvailable: boolean | null;
  lastTtsError: string | null;
  ruVoiceReady: boolean | null;
};

export default function StaffChatTtsDiagLine({
  serverTtsAvailable,
  lastTtsError,
  ruVoiceReady
}: Props) {
  const serverLabel =
    serverTtsAvailable === null ? '…' : serverTtsAvailable ? 'true' : 'false';
  const localLabel =
    ruVoiceReady === null ? '…' : ruVoiceReady ? 'true' : 'false';

  return (
    <div className="border-t border-gray-100 bg-gray-50 px-2 py-1 text-center text-[9px] leading-tight text-gray-600">
      <span className="font-semibold text-gray-500">diag</span>{' '}
      serverTtsAvailable={serverLabel} · localRuVoice={localLabel}
      {lastTtsError ? (
        <span className="block truncate text-rose-600">lastTtsError: {lastTtsError}</span>
      ) : null}
    </div>
  );
}
