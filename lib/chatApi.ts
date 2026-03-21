/**
 * Browser chat HTTP endpoints. Page navigation uses `/chat`; data must use `/api/chat/*`.
 */
export const CHAT_LIST_URL = '/api/chat/list';
export const CHAT_SEND_URL = '/api/chat/send';
export const CHAT_DELETE_URL = '/api/chat/delete';
export const CHAT_MANUAL_TICKET_URL = '/api/chat/manual-ticket';

export function chatRoomParticipantsUrl(roomId: string): string {
  return `/api/chat/rooms/${encodeURIComponent(roomId)}/participants`;
}
