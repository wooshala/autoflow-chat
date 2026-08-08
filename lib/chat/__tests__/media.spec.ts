import { describe, expect, it } from 'vitest';

import {
  IMAGE_ACCEPT,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  VIDEO_ACCEPT,
  detectChatMediaKind,
  isVideoMessage,
  messageTypeFor,
  validateChatMedia,
} from '../media';

const MB = 1024 * 1024;

describe('accept 정책', () => {
  it('사진/동영상 input 은 분리된 accept 를 쓴다', () => {
    // 합치면 Android 가 카메라 직행 대신 선택기를 띄워 기존 사진 UX 가 느려진다.
    expect(IMAGE_ACCEPT).toBe('image/*');
    expect(VIDEO_ACCEPT).toBe('video/*');
    expect(IMAGE_ACCEPT).not.toContain('video');
    expect(VIDEO_ACCEPT).not.toContain('image');
  });
});

describe('MIME 판별', () => {
  it.each([
    ['image/jpeg', 'image'],
    ['image/png', 'image'],
    ['image/heic', 'image'],
    ['video/mp4', 'video'],
    ['video/quicktime', 'video'],
    ['VIDEO/MP4', 'video'],
  ])('%s → %s', (mime, kind) => {
    expect(detectChatMediaKind(mime)).toBe(kind);
  });

  it.each([
    'application/pdf',
    'text/plain',
    'application/zip',
    'audio/mpeg',
    'application/octet-stream',
    '',
    null,
    undefined,
  ])('%s → null (임의 파일 첨부 거부)', (mime) => {
    expect(detectChatMediaKind(mime as string | null | undefined)).toBeNull();
  });
});

describe('업로드 게이트', () => {
  it('image MIME 은 기존 경로대로 통과한다', () => {
    const r = validateChatMedia({ type: 'image/jpeg', size: 3 * MB });
    expect(r).toEqual({ ok: true, kind: 'image' });
  });

  it('video MIME 을 허용한다', () => {
    const r = validateChatMedia({ type: 'video/mp4', size: 3 * MB });
    expect(r).toEqual({ ok: true, kind: 'video' });
  });

  it('임의 MIME 은 거부한다', () => {
    const r = validateChatMedia({ type: 'application/pdf', size: 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.rejection.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('사진 상한 10MB 는 기존 그대로다', () => {
    expect(MAX_IMAGE_BYTES).toBe(10 * MB);
    expect(validateChatMedia({ type: 'image/jpeg', size: MAX_IMAGE_BYTES }).ok).toBe(true);
    const over = validateChatMedia({ type: 'image/jpeg', size: MAX_IMAGE_BYTES + 1 });
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.rejection.code).toBe('FILE_TOO_LARGE');
  });

  it('동영상 상한은 4MB — Vercel 요청 본문 4.5MB 제약 아래', () => {
    expect(MAX_VIDEO_BYTES).toBe(4 * MB);
    expect(MAX_VIDEO_BYTES).toBeLessThan(4.5 * MB);
    expect(validateChatMedia({ type: 'video/mp4', size: MAX_VIDEO_BYTES }).ok).toBe(true);
    const over = validateChatMedia({ type: 'video/mp4', size: MAX_VIDEO_BYTES + 1 });
    expect(over.ok).toBe(false);
    if (!over.ok) {
      expect(over.rejection.code).toBe('FILE_TOO_LARGE');
      expect(over.rejection.message).toContain('4MB');
    }
  });

  it('사진 상한을 동영상에 그대로 적용하지 않는다', () => {
    // 6MB 동영상은 거부, 같은 크기의 사진은 통과
    expect(validateChatMedia({ type: 'video/mp4', size: 6 * MB }).ok).toBe(false);
    expect(validateChatMedia({ type: 'image/jpeg', size: 6 * MB }).ok).toBe(true);
  });
});

describe('message_type 매핑', () => {
  it('kind 를 그대로 컬럼 값으로 쓴다', () => {
    expect(messageTypeFor('image')).toBe('image');
    expect(messageTypeFor('video')).toBe('video');
  });

  it('isVideoMessage 는 message_type=video + url 일 때만 참', () => {
    expect(isVideoMessage({ message_type: 'video', image_url: 'https://x/y.mp4' })).toBe(true);
    expect(isVideoMessage({ message_type: 'image', image_url: 'https://x/y.jpg' })).toBe(false);
    expect(isVideoMessage({ message_type: 'text', image_url: null })).toBe(false);
    // url 없는 video 는 재생기를 띄우지 않는다
    expect(isVideoMessage({ message_type: 'video', image_url: null })).toBe(false);
    expect(isVideoMessage({})).toBe(false);
  });
});
