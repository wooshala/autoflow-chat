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

/**
 * 특정 data-testid 를 가진 <input> 태그 원문을 뽑는다.
 * onChange={(e) => …} 안에 '>' 가 들어 있어 정규식 [^>]* 로는 잘리므로,
 * testid 위치에서 앞뒤로 <input … /> 경계를 직접 찾는다.
 */
function inputTag(testId: string): string {
  const at = CHAT_PAGE.indexOf(`data-testid="${testId}"`);
  if (at < 0) return '';
  const start = CHAT_PAGE.lastIndexOf('<input', at);
  const end = CHAT_PAGE.indexOf('/>', at);
  if (start < 0 || end < 0) return '';
  return CHAT_PAGE.slice(start, end + 2);
}

describe('운영 채팅 첨부 UI — 촬영/선택 4경로', () => {
  const FOUR = [
    { id: 'photo-capture-input', accept: 'IMAGE_ACCEPT', capture: true },
    { id: 'photo-pick-input', accept: 'IMAGE_ACCEPT', capture: false },
    { id: 'video-capture-input', accept: 'VIDEO_ACCEPT', capture: true },
    { id: 'video-pick-input', accept: 'VIDEO_ACCEPT', capture: false },
  ] as const;

  it.each(FOUR)('$id 이 존재하고 accept=$accept', ({ id, accept }) => {
    const tag = inputTag(id);
    expect(tag).not.toBe('');
    expect(tag).toContain(`accept={${accept}}`);
  });

  it.each(FOUR)('$id 의 capture 유무가 계약대로다 (capture=$capture)', ({ id, capture }) => {
    const tag = inputTag(id);
    // 선택 경로에 capture 가 붙으면 갤러리 대신 카메라가 열려 기존 파일을 못 고른다.
    expect(tag.includes('capture="environment"')).toBe(capture);
  });

  it('첨부 메뉴에 네 항목이 모두 있다', () => {
    for (const id of ['attach-photo', 'attach-photo-pick', 'attach-video', 'attach-video-pick']) {
      expect(CHAT_PAGE).toContain(`data-testid={item.id}`);
      expect(CHAT_PAGE).toContain(`'${id}'`);
    }
    expect(CHAT_PAGE).toContain('사진 촬영');
    expect(CHAT_PAGE).toContain('사진 선택');
    expect(CHAT_PAGE).toContain('동영상 촬영');
    expect(CHAT_PAGE).toContain('동영상 선택');
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

});

describe('Android WebView 촬영 Intent', () => {
  it('기존 사진 촬영(ACTION_IMAGE_CAPTURE)이 유지된다', () => {
    expect(MAIN_ACTIVITY).toContain('MediaStore.ACTION_IMAGE_CAPTURE');
  });

  it('동영상 촬영(ACTION_VIDEO_CAPTURE)이 추가됐다', () => {
    expect(MAIN_ACTIVITY).toContain('MediaStore.ACTION_VIDEO_CAPTURE');
  });

  it('accept 가 video 일 때만 동영상 촬영으로 분기한다', () => {
    expect(MAIN_ACTIVITY).toContain('requestsVideo');
    expect(MAIN_ACTIVITY).toContain('it.startsWith("video/")');
    expect(MAIN_ACTIVITY).toContain('if (wantsVideo) buildVideoCaptureIntent() else buildCameraCaptureIntent()');
  });

  it('capture 여부(isCaptureEnabled)로 촬영과 선택을 가른다', () => {
    // capture 가 없으면 촬영 인텐트를 만들지 않고 선택기로 간다 — 네 경로가 섞이지 않는다.
    expect(MAIN_ACTIVITY).toContain('val wantsCapture = params?.isCaptureEnabled == true');
    expect(MAIN_ACTIVITY).toContain('if (wantsCapture && hasCamera)');
  });

  it('선택 경로는 accept 에 맞는 MIME 으로 GET_CONTENT 를 연다', () => {
    expect(MAIN_ACTIVITY).toContain('defaultPickIntent');
    expect(MAIN_ACTIVITY).toContain('Intent.ACTION_GET_CONTENT');
    expect(MAIN_ACTIVITY).toContain('val mime = if (wantsVideo) "video/*" else "image/*"');
  });

  it('기기 실측용 [FILE_CHOOSER] 진단 로그가 있다', () => {
    // 추측 대신 acceptTypes/capture/선택된 action 을 기기에서 직접 읽을 수 있어야 한다.
    expect(MAIN_ACTIVITY).toContain('[FILE_CHOOSER]');
    for (const field of ['acceptTypes=', 'capture=', 'wantsVideo=', 'action=', 'pickType=']) {
      expect(MAIN_ACTIVITY).toContain(field);
    }
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
