'use client';

type Props = {
  title?: string;
  connectionStatus: 'connected' | 'degraded' | 'reconnecting';
  onlineCount: number;
  browserNotifyLabel: string;
  onLogout: () => void;
  onOpenSettings?: () => void;
};

export default function ChatOpsConsoleHeader({
  title = 'AutoFlow 채팅',
  connectionStatus,
  onlineCount,
  browserNotifyLabel,
  onLogout,
  onOpenSettings
}: Props) {
  const connected = connectionStatus === 'connected';

  return (
    <header className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-700 bg-gray-800 px-4 py-2.5">
      <div className="min-w-0">
        <div className="truncate font-bold text-white">{title}</div>
        <div className="text-[10px] text-yellow-400/90">운영 콘솔 (Layout PoC)</div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2 text-[11px]">
        <span className="inline-flex items-center gap-1 rounded-full bg-gray-700 px-2 py-1 text-gray-200">
          <span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-emerald-400' : 'bg-amber-400'}`} />
          {connected ? '연결됨' : connectionStatus === 'degraded' ? '지연' : '재연결'}
        </span>
        <span className="rounded-full bg-gray-700 px-2 py-1 text-gray-300">{browserNotifyLabel}</span>
        <span className="rounded-full bg-gray-700 px-2 py-1 text-gray-300">온라인 {onlineCount}명</span>
        {onOpenSettings ? (
          <button
            type="button"
            onClick={onOpenSettings}
            className="rounded-lg border border-gray-600 px-2 py-1 text-gray-300 hover:bg-gray-700"
          >
            설정
          </button>
        ) : null}
        <button
          type="button"
          onClick={onLogout}
          className="rounded-lg border border-gray-600 px-2 py-1 text-gray-300 hover:bg-gray-700"
        >
          로그아웃
        </button>
      </div>
    </header>
  );
}
