/** True only when the DB/schema layer reports chat_room_id column is absent. */
export function isMissingChatRoomIdColumnError(error: unknown): boolean {
  const code = String((error as { code?: string })?.code ?? '');
  const message = String((error as { message?: string })?.message ?? '');
  const details = String((error as { details?: string })?.details ?? '');
  const haystack = `${message} ${details}`;

  if (code === '42703') {
    return /\bchat_room_id\b/i.test(haystack) && /does not exist/i.test(haystack);
  }
  if (code === 'PGRST204') {
    return /Could not find the '?chat_room_id'? column/i.test(message);
  }
  if (/column "?chat_room_id"? .*does not exist/i.test(message)) return true;
  if (/Could not find the '?chat_room_id'? column of '?chat_messages'?/i.test(message)) return true;

  return false;
}
