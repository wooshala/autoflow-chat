/**
 * Browser chat HTTP endpoints. Page navigation uses `/chat`; data must use `/api/chat/*`.
 */
export const CHAT_LIST_URL = '/api/chat/list';
export const CHAT_SEND_URL = '/api/chat/send';
export const CHAT_DELETE_URL = '/api/chat/delete';
export const CHAT_MANUAL_TICKET_URL = '/api/chat/manual-ticket';
export const CHAT_READ_URL = '/api/chat/read';
export const CHAT_READ_STATE_URL = '/api/chat/read-state';
export const QUICK_PHRASES_URL = '/api/chat/quick-phrases';
export const QUICK_PHRASES_ADMIN_URL = '/api/chat/quick-phrases/admin';
export const STAFF_INVITES_URL = '/api/staff/invites';
export const STAFF_ENTRY_INVITE_URL = '/api/staff/invites?entry=active';
export const STAFF_TTS_URL = '/api/staff/tts';
export const STAFF_TTS_HEALTH_URL = '/api/staff/tts/health';
export const STAFF_TTS_TEST_URL = '/api/staff/tts/test';

export function chatRoomParticipantsUrl(roomId: string): string {
  return `/api/chat/rooms/${encodeURIComponent(roomId)}/participants`;
}
