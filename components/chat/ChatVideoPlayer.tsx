'use client';

/**
 * 채팅 타임라인의 동영상 재생기.
 *
 * 자동재생하지 않는다 — 운영 현장에서 여러 메시지가 동시에 소리를 내면 안 되고,
 * `preload="metadata"` 로 첫 프레임/길이만 받아 목록 스크롤 시 데이터 사용을 줄인다.
 * 사용자가 재생 버튼을 눌러야 로드된다.
 */

type ChatVideoPlayerProps = {
  src: string;
  className?: string;
  videoClassName?: string;
};

export function ChatVideoPlayer({
  src,
  className = '',
  videoClassName = 'max-h-56 w-full rounded-xl bg-black object-contain',
}: ChatVideoPlayerProps) {
  return (
    <div className={className} data-chat-media="video">
      <video
        src={src}
        controls
        playsInline
        preload="metadata"
        className={videoClassName}
        // 재생 중 다른 메시지로 스크롤해도 소리가 겹치지 않도록 사용자 조작에만 반응
        onClick={(e) => e.stopPropagation()}
      >
        <a href={src} target="_blank" rel="noreferrer">
          동영상 열기
        </a>
      </video>
    </div>
  );
}
