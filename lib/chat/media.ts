/**
 * 채팅 첨부 미디어 정책 — 서버 검증과 클라이언트 UI 가 같은 값을 쓴다.
 *
 * 사진은 기존 동작을 그대로 유지하고, 동영상만 새로 허용한다.
 * 임의 파일 첨부는 허용하지 않는다 (image/* 와 video/* 만).
 */

export type ChatMediaKind = 'image' | 'video';

/** 사진 촬영 input — 기존 UX(카메라 직행) 유지를 위해 video 와 합치지 않는다. */
export const IMAGE_ACCEPT = 'image/*';
/** 동영상 촬영 input — 별도 input 으로 분리한다. */
export const VIDEO_ACCEPT = 'video/*';

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/**
 * 동영상 상한 4MB.
 *
 * 근거: 업로드는 `/api/chat/send` 가 `req.formData()` 로 파일을 통째로 받아
 * Supabase Storage 로 중계하는 구조다. Vercel 서버리스 함수의 요청 본문 상한은
 * 4.5MB 이고 이는 코드로 올릴 수 없는 플랫폼 제약이라, 초과분은 핸들러에 닿기도
 * 전에 413 으로 끊긴다. multipart 오버헤드와 동시 전송 텍스트 필드를 감안해
 * 4MB 를 상한으로 둔다.
 *
 * 더 긴 영상이 필요해지면 브라우저 → Storage 직접 업로드(signed URL)로 구조를
 * 바꿔야 하며, 이번 범위 밖이다.
 */
export const MAX_VIDEO_BYTES = 4 * 1024 * 1024;

export function detectChatMediaKind(mimeType: string | null | undefined): ChatMediaKind | null {
  const t = String(mimeType ?? '').toLowerCase();
  if (t.startsWith('image/')) return 'image';
  if (t.startsWith('video/')) return 'video';
  return null;
}

export function maxBytesFor(kind: ChatMediaKind): number {
  return kind === 'video' ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
}

export function formatMaxSizeLabel(kind: ChatMediaKind): string {
  return `${Math.round(maxBytesFor(kind) / (1024 * 1024))}MB`;
}

export type ChatMediaRejection =
  | { code: 'UNSUPPORTED_MEDIA_TYPE'; message: string }
  | { code: 'FILE_TOO_LARGE'; message: string };

/**
 * 서버·클라이언트 공용 검증. 클라이언트가 보낸 MIME 을 신뢰하지 않기 위한
 * 최소 게이트이며, 서버는 이 결과를 반드시 다시 확인한다.
 */
export function validateChatMedia(
  file: { type: string; size: number },
): { ok: true; kind: ChatMediaKind } | { ok: false; rejection: ChatMediaRejection } {
  const kind = detectChatMediaKind(file.type);
  if (!kind) {
    return {
      ok: false,
      rejection: {
        code: 'UNSUPPORTED_MEDIA_TYPE',
        message: '사진 또는 동영상만 첨부할 수 있습니다.',
      },
    };
  }
  if (file.size > maxBytesFor(kind)) {
    return {
      ok: false,
      rejection: {
        code: 'FILE_TOO_LARGE',
        message:
          kind === 'video'
            ? `동영상은 ${formatMaxSizeLabel('video')} 이하만 전송할 수 있습니다. 더 짧게 촬영해 주세요.`
            : `${formatMaxSizeLabel('image')} 이하만 가능합니다.`,
      },
    };
  }
  return { ok: true, kind };
}

/** message_type 컬럼 값 — 'image' 는 기존 값 그대로, 동영상은 'video'. */
export function messageTypeFor(kind: ChatMediaKind): 'image' | 'video' {
  return kind;
}

/** 저장된 메시지가 동영상인지. image_url/image_storage_path 컬럼을 미디어 공용으로 재사용한다. */
export function isVideoMessage(msg: {
  message_type?: string | null;
  image_url?: string | null;
}): boolean {
  return msg?.message_type === 'video' && Boolean(msg?.image_url);
}
