import { describe, expect, it } from 'vitest';
import { isEmojiOnlyMessage } from './isEmojiOnlyMessage';

describe('isEmojiOnlyMessage', () => {
  it('returns true for emoji-only strings', () => {
    expect(isEmojiOnlyMessage('👍')).toBe(true);
    expect(isEmojiOnlyMessage('😀😀')).toBe(true);
    expect(isEmojiOnlyMessage('  🎉  ')).toBe(true);
    expect(isEmojiOnlyMessage('👨‍👩‍👧')).toBe(true);
  });

  it('returns false when text or digits are present', () => {
    expect(isEmojiOnlyMessage('')).toBe(false);
    expect(isEmojiOnlyMessage('hello')).toBe(false);
    expect(isEmojiOnlyMessage('301호')).toBe(false);
    expect(isEmojiOnlyMessage('👍 ok')).toBe(false);
    expect(isEmojiOnlyMessage('123')).toBe(false);
    expect(isEmojiOnlyMessage('👍301')).toBe(false);
  });
});
