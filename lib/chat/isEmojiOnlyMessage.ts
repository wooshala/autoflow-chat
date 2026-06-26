/** True when trimmed body is emoji/pictograph only (no letters, digits, or CJK text). */
export function isEmojiOnlyMessage(text: string): boolean {
  const t = String(text ?? '').trim();
  if (!t) return false;

  const hasEmoji = /[\p{Extended_Pictographic}\p{Emoji_Presentation}]/u.test(t);
  if (!hasEmoji) return false;

  const withoutEmoji = t
    .replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}\uFE0F\u200D]/gu, '')
    .replace(/\s/g, '');

  return withoutEmoji.length === 0;
}
