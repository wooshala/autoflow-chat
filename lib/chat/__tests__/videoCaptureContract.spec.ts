/**
 * 동영상 촬영 진입 계약 — "사용자가 동영상 촬영을 시작할 수 있다"를 지킨다.
 *
 * 구현 세부에 과하게 붙지 않도록, 촬영 진입에 반드시 필요한 요소(별도 input,
 * accept, capture, Android 촬영 Intent)만 소스에서 검증한다. 이 기능은 과거에
 * 한 번도 존재한 적이 없어 회귀 테스트가 없었으므로 계약을 여기서 고정한다.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const CHAT_PAGE = read('app/chat/page.tsx');
const MAIN_ACTIVITY = read(
  'android-staff/app/src/main/java/com/autoflow/staff/MainActivity.kt',
);

describe('운영 채팅 첨부 UI', () => {
  it('사진 촬영 input 이 존재한다 (accept=image/*, capture)', () => {
    expect(CHAT_PAGE).toContain('data-testid="photo-capture-input"');
    expect(CHAT_PAGE).toContain('accept={IMAGE_ACCEPT}');
  });

  it('동영상 촬영 input 이 별도로 존재한다 (accept=video/*, capture)', () => {
    expect(CHAT_PAGE).toContain('data-testid="video-capture-input"');
    expect(CHAT_PAGE).toContain('accept={VIDEO_ACCEPT}');
  });

  it('두 input 모두 capture="environment" 로 촬영을 요청한다', () => {
    const captures = CHAT_PAGE.match(/capture="environment"/g) ?? [];
    expect(captures.length).toBeGreaterThanOrEqual(2);
  });

  it('사진 input 의 accept 를 video 와 합치지 않는다', () => {
    // 합치면 Android 가 카메라로 직행하지 않아 기존 사진 UX 가 느려진다.
    // 주석이 아니라 실제 accept 속성 값만 본다 — 어떤 accept 도 두 종류를 동시에 갖지 않아야 한다.
    const acceptValues = [...CHAT_PAGE.matchAll(/accept=(?:"([^"]*)"|\{([^}]*)\})/g)].map(
      (m) => m[1] ?? m[2] ?? '',
    );
    expect(acceptValues.length).toBeGreaterThanOrEqual(2);
    for (const v of acceptValues) {
      const hasImage = v.includes('image/') || v.includes('IMAGE_ACCEPT');
      const hasVideo = v.includes('video/') || v.includes('VIDEO_ACCEPT');
      expect(hasImage && hasVideo).toBe(false);
    }
  });

  it('첨부 메뉴에 사진 촬영과 동영상 촬영 항목이 있다', () => {
    expect(CHAT_PAGE).toContain('data-testid="attach-photo"');
    expect(CHAT_PAGE).toContain('data-testid="attach-video"');
    expect(CHAT_PAGE).toContain('사진 촬영');
    expect(CHAT_PAGE).toContain('동영상 촬영');
  });
});

describe('Android WebView 촬영 Intent', () => {
  it('기존 사진 촬영(ACTION_IMAGE_CAPTURE)이 유지된다', () => {
    expect(MAIN_ACTIVITY).toContain('MediaStore.ACTION_IMAGE_CAPTURE');
  });

  it('동영상 촬영(ACTION_VIDEO_CAPTURE)이 추가됐다', () => {
    expect(MAIN_ACTIVITY).toContain('MediaStore.ACTION_VIDEO_CAPTURE');
  });

  it('accept 가 video/* 일 때만 동영상 촬영으로 분기한다', () => {
    expect(MAIN_ACTIVITY).toContain('requestsVideo');
    expect(MAIN_ACTIVITY).toContain('it.startsWith("video/")');
    expect(MAIN_ACTIVITY).toContain('if (wantsVideo) buildVideoCaptureIntent() else buildCameraCaptureIntent()');
  });

  it('촬영 길이 상한을 걸어 서버 상한을 넘기 어렵게 한다', () => {
    expect(MAIN_ACTIVITY).toContain('MediaStore.EXTRA_DURATION_LIMIT');
    expect(MAIN_ACTIVITY).toContain('VIDEO_DURATION_LIMIT_SEC');
  });
});

describe('렌더러', () => {
  it('동영상은 <video controls playsInline preload=metadata> 로 재생한다', () => {
    const player = read('components/chat/ChatVideoPlayer.tsx');
    expect(player).toContain('controls');
    expect(player).toContain('playsInline');
    expect(player).toContain('preload="metadata"');
  });

  it('자동재생하지 않는다', () => {
    const player = read('components/chat/ChatVideoPlayer.tsx');
    expect(player).not.toContain('autoPlay');
    expect(player).not.toContain('autoplay');
  });

  it('운영/게스트 타임라인이 video 분기를 갖는다', () => {
    const list = read('components/ChatMessages.tsx');
    expect(list).toContain('isVideoMessage(msg)');
    expect(list).toContain('ChatVideoPlayer');
    // 기존 이미지 경로 유지
    expect(list).toContain('ChatPhotoThumb');
  });

  it('직원 채팅이 video 분기를 갖는다', () => {
    const staff = read('app/staff-chat/StaffChatClient.tsx');
    expect(staff).toContain('isVideoMessage(m)');
    expect(staff).toContain('ChatVideoPlayer');
    expect(staff).toContain('ChatPhotoThumb');
  });
});

describe('서버 업로드 게이트', () => {
  it('공용 validateChatMedia 를 쓰고 image-only 하드코딩이 남아있지 않다', () => {
    const route = read('app/api/chat/send/route.ts');
    expect(route).toContain('validateChatMedia');
    expect(route).not.toContain("image.type.startsWith('image/')");
  });

  it('message_type 을 미디어 종류에서 파생한다', () => {
    const route = read('app/api/chat/send/route.ts');
    expect(route).toContain('messageTypeFor(mediaKind)');
    expect(route).not.toContain("image instanceof File ? 'image' : 'text'");
  });
});
