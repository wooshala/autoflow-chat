/**
 * Browser chat HTTP endpoints. Page navigation uses `/chat`; data must use `/api/chat/*`.
 */
export const CHAT_LIST_URL = '/api/chat/list';
export const CHAT_SEND_URL = '/api/chat/send';
export const CHAT_DELETE_URL = '/api/chat/delete';
export const CHAT_MANUAL_TICKET_URL = '/api/chat/manual-ticket';
export const CHAT_READ_URL = '/api/chat/read';
export const CHAT_READ_STATE_URL = '/api/chat/read-state';
export const CHAT_CALL_URL = '/api/chat/call';
export const QUICK_PHRASES_URL = '/api/chat/quick-phrases';
export const QUICK_PHRASES_ADMIN_URL = '/api/chat/quick-phrases/admin';
export const QUICK_PHRASES_PERSONAL_URL = '/api/chat/quick-phrases/personal';
export const QUICK_PHRASES_TRANSLATE_URL = '/api/chat/quick-phrases/translate';
export const STAFF_INVITES_URL = '/api/staff/invites';
export const STAFF_LOGIN_URL = '/api/staff/login';
export const STAFF_LOGIN_ROSTER_URL = '/api/staff/login/roster';
export const STAFF_LOGOUT_URL = '/api/staff/logout';
export const STAFF_SESSION_URL = '/api/staff/session';
export const STAFF_ACCOUNTS_ADMIN_URL = '/api/staff/accounts';
export const STAFF_PARTICIPANTS_SUMMARY_URL = '/api/staff/participants/summary';
export const STAFF_ENTRY_INVITE_URL = '/api/staff/invites?entry=active';
export const STAFF_TTS_URL = '/api/staff/tts';
export const STAFF_TTS_HEALTH_URL = '/api/staff/tts/health';
export const STAFF_TTS_TEST_URL = '/api/staff/tts/test';

export function chatRoomParticipantsUrl(roomId: string): string {
  return `/api/chat/rooms/${encodeURIComponent(roomId)}/participants`;
}
