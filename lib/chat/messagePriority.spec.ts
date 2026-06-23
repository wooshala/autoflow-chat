import { describe, expect, it } from 'vitest';
import { isUrgentMessage, normalizeMessagePriority, parseSendPriority } from './messagePriority';

describe('messagePriority', () => {
  it('treats null/undefined as normal', () => {
    expect(normalizeMessagePriority(null)).toBe('normal');
    expect(normalizeMessagePriority(undefined)).toBe('normal');
    expect(isUrgentMessage({ priority: null })).toBe(false);
    expect(isUrgentMessage({})).toBe(false);
  });

  it('detects urgent', () => {
    expect(normalizeMessagePriority('urgent')).toBe('urgent');
    expect(isUrgentMessage({ priority: 'urgent' })).toBe(true);
  });

  it('parses send form values', () => {
    expect(parseSendPriority('urgent')).toBe('urgent');
    expect(parseSendPriority('URGENT')).toBe('urgent');
    expect(parseSendPriority('normal')).toBe('normal');
    expect(parseSendPriority(null)).toBe('normal');
  });
});
