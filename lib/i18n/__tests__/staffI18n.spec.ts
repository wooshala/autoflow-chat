import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { messages, staffMessageKeys, type MessageKey } from '../messages';

const ROOT = join(process.cwd());
const STAFF_CHAT_DIRS = [
  join(ROOT, 'app', 'staff-chat'),
  join(ROOT, 'components', 'staff-chat')
];

/** Known AutoFlow chrome strings that must not reappear hardcoded in JSX. */
const FORBIDDEN_HARDCODED = [
  '직원 로그인',
  '현재 상태',
  '근무 가능',
  '청소 중',
  '알림음 크기',
  '미리듣기 음량', // must come from t('previewVolume'), not literal in JSX source as assignment
  '사진 촬영',
  '동영상 촬영',
  '사진 선택',
  '동영상 선택',
  '삭제하시겠습니까?',
  '홈 화면에 추가',
  '알림음을 켜려면 탭하세요',
  '로그아웃',
  '듣는 중...',
  '객실 없음',
  '삭제된 메시지입니다'
];

function walkTsx(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkTsx(p, out);
    else if (/\.(tsx|ts)$/.test(name) && !/\.spec\./.test(name) && !/\.test\./.test(name)) {
      out.push(p);
    }
  }
  return out;
}

/** Strip block/line comments and string contents inside messages dictionary files. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/**
 * Find JSX / template string literals that look like user-visible Korean chrome.
 * Excludes comments (already stripped) and import paths.
 */
function findKoreanUiLiterals(src: string): string[] {
  const cleaned = stripComments(src);
  const hits: string[] = [];
  const re = /(['"`])([^'"`]*[가-힣][^'"`]*)\1/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cleaned))) {
    const lit = m[2];
    // Skip pure path-ish / technical leftovers
    if (/^[\w./\\-]+$/.test(lit)) continue;
    hits.push(lit);
  }
  return hits;
}

describe('staff i18n completeness', () => {
  it('ko and ru message key sets are equal', () => {
    const ko = Object.keys(messages.ko).sort();
    const ru = Object.keys(messages.ru).sort();
    assert.deepEqual(ru, ko);
  });

  it('every key has non-empty ko and ru translations', () => {
    const missing: string[] = [];
    for (const key of staffMessageKeys()) {
      const k = messages.ko[key];
      const r = messages.ru[key];
      if (typeof k !== 'string' || (k.length === 0 && key !== 'roomSuffix')) {
        // roomSuffix may be empty for ru; ko roomSuffix is '호'
        if (key === 'roomSuffix') continue;
        missing.push(`ko:${key}`);
      }
      if (typeof r !== 'string') missing.push(`ru:${key}`);
      // Allow empty roomSuffix for Russian
      if (key !== 'roomSuffix' && typeof r === 'string' && r.trim() === '') {
        missing.push(`ru-empty:${key}`);
      }
      if (key !== 'roomSuffix' && typeof k === 'string' && k.trim() === '') {
        missing.push(`ko-empty:${key}`);
      }
    }
    assert.deepEqual(missing, []);
  });

  it('staff-chat UI sources have no hardcoded Korean chrome literals', () => {
    const files = STAFF_CHAT_DIRS.flatMap((d) => walkTsx(d));
    const offenders: { file: string; lit: string }[] = [];
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      for (const lit of findKoreanUiLiterals(src)) {
        offenders.push({ file: file.replace(ROOT + '\\', '').replace(ROOT + '/', ''), lit });
      }
    }
    assert.deepEqual(
      offenders,
      [],
      `Hardcoded Korean UI literals:\n${offenders.map((o) => `${o.file}: ${o.lit}`).join('\n')}`
    );
  });

  it('known chrome strings do not reappear as JSX string literals', () => {
    const files = STAFF_CHAT_DIRS.flatMap((d) => walkTsx(d));
    const hits: string[] = [];
    for (const file of files) {
      const src = stripComments(readFileSync(file, 'utf8'));
      for (const s of FORBIDDEN_HARDCODED) {
        // Match as a JS string literal containing the exact chrome text
        const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(`(['\`"])${escaped}\\1`);
        if (re.test(src)) {
          hits.push(`${file}: ${s}`);
        }
      }
    }
    assert.deepEqual(hits, [], hits.join('\n'));
  });

  it('MessageKey type covers all ko keys (runtime mirror)', () => {
    const keys = staffMessageKeys();
    assert.ok(keys.length > 40);
    for (const key of keys) {
      assert.equal(typeof messages.ko[key as MessageKey], 'string');
      assert.equal(typeof messages.ru[key as MessageKey], 'string');
    }
  });
});
