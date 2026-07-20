// Phase 1H.2 — ViewModel is the ONLY place text/language logic lives.
// primary = viewer lang · secondary = opposite (counterpart) lang delivered to the other party.
// Run: node --test lib/guest-spike/__tests__/messageViewModel.spec.ts

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildMessageViewModel } from '../messageViewModel.ts';

// displayText≡primary, originalText≡secondary, showOriginal≡showSecondary (MessageBubble wire names).

test('1. 고객→직원: primary=한국어, secondary=일본어(원문)', () => {
  const vm = buildMessageViewModel(
    { original: 'こんにちは', original_lang: 'ja', translated: { ko: '안녕하세요' } },
    'ko', 'ja', // staff viewer, counterpart guest=ja
  );
  assert.deepEqual(vm, { displayText: '안녕하세요', originalText: 'こんにちは', showOriginal: true });
});

test('2. 직원→고객: primary=일본어, secondary=한국어(원문)', () => {
  const vm = buildMessageViewModel(
    { original: '안녕하세요', original_lang: 'ko', translated: { ja: 'こんにちは' } },
    'ja', 'ko', // guest viewer, counterpart staff=ko
  );
  assert.deepEqual(vm, { displayText: 'こんにちは', originalText: '안녕하세요', showOriginal: true });
});

test('3. 직원 자기 메시지(직원 화면): primary=한국어(원문), secondary=일본어(전달본)', () => {
  const vm = buildMessageViewModel(
    { original: '네 알겠습니다', original_lang: 'ko', translated: { ja: 'はい、承知しました' } },
    'ko', 'ja',
  );
  assert.deepEqual(vm, { displayText: '네 알겠습니다', originalText: 'はい、承知しました', showOriginal: true });
});

test('4. 번역 실패(상대 언어 없음): secondary 생략', () => {
  const vm = buildMessageViewModel(
    { original: 'こんにちは', original_lang: 'ja', translated: {} },
    'ko', 'ja', // staff viewer; no ko translation → primary falls back to ja == secondary → hide
  );
  assert.equal(vm.displayText, 'こんにちは');
  assert.equal(vm.showOriginal, false);
});

test('5. 게스트 자기 메시지, 상대(ko) 번역 아직 없음 → secondary 생략', () => {
  const vm = buildMessageViewModel(
    { original: 'こんにちは', original_lang: 'ja', translated: {} },
    'ja', 'ko', // guest viewer; counterpart ko missing
  );
  assert.equal(vm.displayText, 'こんにちは');
  assert.equal(vm.showOriginal, false);
});

test('6. 새 언어(en 뷰어, 상대 ko) — 렌더러/분기 없이 동작', () => {
  const vm = buildMessageViewModel(
    { original: '안녕', original_lang: 'ko', translated: { en: 'Hi', ja: 'やあ' } },
    'en', 'ko',
  );
  assert.deepEqual(vm, { displayText: 'Hi', originalText: '안녕', showOriginal: true });
});
