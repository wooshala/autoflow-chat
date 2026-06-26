import assert from 'node:assert/strict';
import { classifyMessage, classifyMessageCategory } from './classifyMessageCategory';

type Case = {
  input: string;
  mainCategory: ReturnType<typeof classifyMessageCategory>;
  urgent?: boolean;
  request?: boolean;
  status?: boolean;
  roomNumber?: string | null;
};

// Minimal snapshot-like checks (no test runner required).
export const CLASSIFY_MESSAGE_TEST_CASES: Case[] = [
  { input: '변기 막힘 급함', mainCategory: 'repair', urgent: true },
  { input: '수건 더 주세요', mainCategory: 'cleaning', request: true },
  { input: '손님 아직 있음', mainCategory: 'general', status: true },
  { input: '503 퇴실 청소 가능', mainCategory: 'turnover', roomNumber: '503' },
  { input: '601 담배냄새 심함', mainCategory: 'environment', urgent: true, roomNumber: '601' },
  { input: '402 에어컨 안됨', mainCategory: 'repair', roomNumber: '402' },
  { input: '객실 6-01 도어락 안됨', mainCategory: 'repair', roomNumber: '601' },
  { input: '청소 완료', mainCategory: 'cleaning', status: true },
  { input: '연박', mainCategory: 'general', status: true },
  { input: '방 비움', mainCategory: 'turnover' }
];

export function runClassificationSelfTest() {
  for (const tc of CLASSIFY_MESSAGE_TEST_CASES) {
    const r = classifyMessage(tc.input);
    assert.equal(r.mainCategory, tc.mainCategory, `mainCategory mismatch for "${tc.input}"`);
    if (tc.urgent !== undefined) assert.equal(r.flags.urgent, tc.urgent, `urgent flag mismatch for "${tc.input}"`);
    if (tc.request !== undefined) assert.equal(r.flags.request, tc.request, `request flag mismatch for "${tc.input}"`);
    if (tc.status !== undefined) assert.equal(r.flags.status, tc.status, `status flag mismatch for "${tc.input}"`);
    if (tc.roomNumber !== undefined) assert.equal(r.roomNumber, tc.roomNumber, `roomNumber mismatch for "${tc.input}"`);
  }
  return true;
}

