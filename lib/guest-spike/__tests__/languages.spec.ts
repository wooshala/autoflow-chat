// Phase 1H.5 — heuristic detector + original_lang priority resolver.
// Run: node --test lib/guest-spike/__tests__/languages.spec.ts

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  detectGuestLangHeuristic,
  resolveOriginalLang,
  SUPPORTED_LANGS,
  isGuestLang,
  langDisplayName,
  uiTextFor,
} from '../languages.ts';

test('supported set = 7 langs (incl. fr/es)', () => {
  assert.deepEqual([...SUPPORTED_LANGS], ['ko', 'en', 'ja', 'zh-CN', 'ru', 'fr', 'es']);
  assert.equal(isGuestLang('zh-CN'), true);
  assert.equal(isGuestLang('fr'), true);
  assert.equal(isGuestLang('es'), true);
  assert.equal(isGuestLang('de'), false);
});

test('fr/es have display names and guest UI strings (Phase 2B)', () => {
  assert.equal(langDisplayName('fr'), 'Français');
  assert.equal(langDisplayName('es'), 'Español');
  assert.equal(uiTextFor('fr').send, 'Envoyer');
  assert.equal(uiTextFor('es').send, 'Enviar');
  assert.equal(uiTextFor('fr').selectPrompt, 'Veuillez sélectionner votre langue');
  assert.equal(uiTextFor('es').selectPrompt, 'Seleccione su idioma');
});

test('heuristic: kana → ja (even with kanji present)', () => {
  assert.equal(detectGuestLangHeuristic('冷蔵庫が冷えません'), 'ja');
  assert.equal(detectGuestLangHeuristic('タオル'), 'ja');
});
test('heuristic: hangul → ko', () => assert.equal(detectGuestLangHeuristic('안녕하세요'), 'ko'));
test('heuristic: cyrillic → ru', () => assert.equal(detectGuestLangHeuristic('Где ресторан?'), 'ru'));
test('heuristic: han-only → zh-CN', () => assert.equal(detectGuestLangHeuristic('早餐几点开始'), 'zh-CN'));
test('heuristic: latin → en', () => assert.equal(detectGuestLangHeuristic('Can I check out at 1 PM?'), 'en'));
test('heuristic: unclassifiable → null', () => {
  assert.equal(detectGuestLangHeuristic('😀🏨'), null);
  assert.equal(detectGuestLangHeuristic('   '), null);
});

test('resolve: LLM detected wins (no fallback)', () => {
  assert.deepEqual(resolveOriginalLang({ llmDetected: 'en', text: '早餐', preferred: 'ja' }), { lang: 'en', usedFallback: false });
});
test('resolve: LLM null → heuristic (no fallback)', () => {
  assert.deepEqual(resolveOriginalLang({ llmDetected: null, text: 'Can I check out at 1 PM?', preferred: 'ja' }), { lang: 'en', usedFallback: false });
});
test('resolve: LLM + heuristic null → preferred (fallback)', () => {
  assert.deepEqual(resolveOriginalLang({ llmDetected: null, text: '😀', preferred: 'ja' }), { lang: 'ja', usedFallback: true });
});
test('resolve: all null → en last resort (fallback)', () => {
  assert.deepEqual(resolveOriginalLang({ llmDetected: null, text: '😀', preferred: null }), { lang: 'en', usedFallback: true });
});
