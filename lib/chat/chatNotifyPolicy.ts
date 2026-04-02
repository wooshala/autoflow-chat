import type { ChatMessage } from '@/lib/types';

/** 알림·동일 방 판별용 객실 문자열 정규화 */
export function normalizeRoomNo(v: string | null | undefined): string {
  return String(v ?? '').trim();
}

/** 화면의 roomNo와 메시지 room_no가 같으면 “같은 방” (둘 다 빈 문자열이면 동일로 취급) */
export function isSameRoomForNotify(viewRoomNo: string, message: ChatMessage): boolean {
  return normalizeRoomNo(viewRoomNo) === normalizeRoomNo(message.room_no);
}

export function messagePreview(msg: ChatMessage, maxLen = 80): string {
  const raw = String(msg.message || '').trim();
  if (msg.message_type === 'image') return '(이미지)';
  if (!raw) return '(내용 없음)';
  return raw.length > maxLen ? `${raw.slice(0, maxLen)}…` : raw;
}
