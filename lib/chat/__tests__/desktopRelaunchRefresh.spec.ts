/**
 * 데스크톱 셸(Tauri) 재실행 시 최신 프런트엔드 반영 계약.
 *
 * 배경: X 버튼은 트레이로 숨기고, single-instance 는 두 번째 프로세스를 죽인 뒤
 * 기존 창을 focus 만 한다. 그래서 운영자가 "EXE 를 다시 실행"해도 WebView 가
 * 재탐색되지 않아 며칠 전 프런트엔드가 계속 돌았다(실측: 프로세스 4일 2시간 생존).
 *
 * Rust 쪽 유닛 테스트 인프라가 없으므로, 다시 뒤집히면 안 되는 분기만 소스에서 고정한다.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

// CRLF 로 저장돼 있으면 '\n}\n' 같은 경계 탐색이 실패하므로 LF 로 정규화한다.
const LIB_RS = readFileSync(
  join(__dirname, '..', '..', '..', 'src-tauri', 'src', 'lib.rs'),
  'utf8',
).replace(/\r\n/g, '\n');

/** single-instance 콜백 본문만 잘라낸다. */
function singleInstanceBody(): string {
  const at = LIB_RS.indexOf('tauri_plugin_single_instance::init');
  expect(at).toBeGreaterThan(-1);
  return LIB_RS.slice(at, at + 1200);
}

describe('single-instance 재실행 분기', () => {
  it('딥링크가 있으면 기존 목적지로 이동한다 (/chat 으로 덮어쓰지 않음)', () => {
    const body = singleInstanceBody();
    expect(body).toContain('open_guest_room_in_shell(app, &room)');
    // 딥링크 분기에서 일반 새로고침 함수를 부르면 목적지가 덮어써진다.
    const deepLinkArm = body.slice(body.indexOf('if let Some(room)'), body.indexOf('} else {'));
    expect(deepLinkArm).not.toContain('focus_main_and_refresh');
  });

  it('딥링크가 없는 일반 재실행은 재탐색한다', () => {
    const body = singleInstanceBody();
    const elseArm = body.slice(body.indexOf('} else {'), body.indexOf('}));'));
    expect(elseArm).toContain('focus_main_and_refresh(app)');
    // 회귀 방지: focus 만 하고 끝나던 예전 동작으로 되돌아가면 실패한다.
    expect(elseArm).not.toMatch(/focus_main\(app\);/);
  });
});

describe('재탐색 안전 조건', () => {
  const fn = LIB_RS.slice(
    LIB_RS.indexOf('fn focus_main_and_refresh'),
    LIB_RS.indexOf('fn focus_main_and_refresh') + 1200,
  );

  it('서버에 도달 못 하면 재탐색하지 않는다 (오류 페이지로 화면을 파괴하지 않음)', () => {
    expect(fn).toContain('if !server_reachable()');
    expect(fn).toContain('return;');
  });

  it('콜드 스타트와 같은 캐시버스트 URL 헬퍼를 재사용한다', () => {
    expect(fn).toContain('chat_url_with_optional_guest_room(None)');
  });

  it('URL 을 로그에 남기지 않는다 (afts 값 노출 금지)', () => {
    // 로그 매크로 인자에 URL 변수를 넣지 않는다.
    const logs = fn.match(/log::(info|warn|error)!\([^)]*\)/g) ?? [];
    expect(logs.length).toBeGreaterThan(0);
    for (const l of logs) {
      expect(l).not.toContain('chat_url');
      expect(l).not.toContain('afts');
      expect(l).not.toContain('{u}');
    }
  });

  it('쿠키·localStorage·캐시를 삭제하지 않는다', () => {
    for (const forbidden of ['clear_all_browsing_data', 'clear_cache', 'delete_cookie', 'localStorage']) {
      expect(fn).not.toContain(forbidden);
    }
  });
});

describe('트레이/포커스 경로는 재탐색하지 않는다', () => {
  it('focus_main_window 커맨드는 focus 만 한다', () => {
    const cmd = LIB_RS.slice(
      LIB_RS.indexOf('fn focus_main_window'),
      LIB_RS.indexOf('fn focus_main_window') + 200,
    );
    expect(cmd).toContain('focus_main(&app)');
    expect(cmd).not.toContain('focus_main_and_refresh');
  });

  it('focus_main 자체는 navigate 하지 않는다', () => {
    // 함수 경계(열 0 의 닫는 중괄호)까지만 잘라야 다음 함수를 오검출하지 않는다.
    const start = LIB_RS.indexOf('fn focus_main(app');
    const end = LIB_RS.indexOf('\n}\n', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const f = LIB_RS.slice(start, end);
    expect(f).toContain('set_focus()');
    expect(f).not.toContain('navigate');
  });
});
