/** Staff-chat init tracing (always console.log for mobile debugging). */
export function staffChatLog(
  tag:
    | 'STAFF_CHAT_INIT'
    | 'STAFF_CHAT_USER_PARAM'
    | 'STAFF_CHAT_USER_RESOLVED'
    | 'STAFF_CHAT_SESSION_READY'
    | 'STAFF_CHAT_LIST_START'
    | 'STAFF_CHAT_LIST_SUCCESS'
    | 'STAFF_CHAT_LIST_ERROR'
    | 'STAFF_CHAT_TIMELINE_LOADED'
    | 'STAFF_CHAT_LEGACY_USER_MODE'
    | 'STAFF_CHAT_LEGACY_USER_FALLBACK'
    | 'STAFF_CHAT_INVITE_BOOTSTRAP'
    | 'STAFF_CHAT_INVITE_VALIDATE_OK'
    | 'STAFF_CHAT_INVITE_VALIDATE_FAIL'
    | 'STAFF_CHAT_READY'
    | 'STAFF_CHAT_AUTH'
    | 'STAFF_CHAT_SEND_CLICK'
    | 'STAFF_CHAT_SEND_BLOCKED'
    | 'STAFF_CHAT_SEND_API_START'
    | 'STAFF_CHAT_SEND_API_SUCCESS'
    | 'STAFF_CHAT_SEND_API_ERROR'
    | 'STAFF_CHAT_DISPLAY_TEXT'
    | 'STAFF_CHAT_LANG_SELECTED',
  payload?: Record<string, unknown>
) {
  if (typeof console !== 'undefined') {
    console.log(`[${tag}]`, payload ?? {});
  }
}
