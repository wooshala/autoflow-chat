/**
 * Core v0.1 latency instrumentation (console logs).
 */

type PendingTrace = {
  nonce: string;
  sendClickedAt: number;
  apiReceivedAt?: number;
  dbInsertedAt?: number;
  apiRespondedAt?: number;
  messageId?: string;
};

const pending = new Map<string, PendingTrace>();

export function createClientNonce(): string {
  return (globalThis.crypto?.randomUUID?.() || `n-${Date.now()}-${Math.random().toString(16).slice(2)}`).toString();
}

export function logSendClick(nonce: string) {
  const ts = Date.now();
  pending.set(nonce, { nonce, sendClickedAt: ts });
  console.log('[CHAT_SEND_CLICK]', { nonce, ts });
}

export function logSendApiResponded(nonce: string, messageId: string, dbInsertedAt?: string) {
  const ts = Date.now();
  const row = pending.get(nonce) || { nonce, sendClickedAt: ts };
  row.apiRespondedAt = ts;
  row.messageId = messageId;
  if (dbInsertedAt) row.dbInsertedAt = Date.parse(dbInsertedAt) || undefined;
  pending.set(nonce, row);
  const elapsed_ms = ts - row.sendClickedAt;
  console.log('[CHAT_SEND_API_RESPONDED]', { nonce, message_id: messageId, elapsed_ms, ts });
}

export function logRealtimeReceived(messageId: string, roomNo: string | null, senderSide: string | null) {
  const ts = Date.now();
  let matchedNonce: string | null = null;
  let elapsed_from_db_ms: number | null = null;

  for (const [nonce, row] of pending.entries()) {
    if (row.messageId === messageId || !row.messageId) {
      if (row.messageId === messageId) {
        matchedNonce = nonce;
        if (row.dbInsertedAt) elapsed_from_db_ms = ts - row.dbInsertedAt;
        break;
      }
    }
  }

  if (!matchedNonce) {
    for (const [nonce, row] of pending.entries()) {
      if (!row.messageId) continue;
    }
  }

  for (const [nonce, row] of pending.entries()) {
    if (row.messageId === messageId) {
      matchedNonce = nonce;
      if (row.dbInsertedAt) elapsed_from_db_ms = ts - row.dbInsertedAt;
      break;
    }
  }

  console.log('[CHAT_REALTIME_RECEIVED]', {
    nonce: matchedNonce,
    message_id: messageId,
    room: roomNo,
    sender: senderSide,
    elapsed_from_db_ms,
    ts
  });
}

export function logUiRendered(messageId: string) {
  const ts = Date.now();
  let matchedNonce: string | null = null;
  let elapsed_total_ms: number | null = null;

  for (const [nonce, row] of pending.entries()) {
    if (row.messageId === messageId) {
      matchedNonce = nonce;
      elapsed_total_ms = ts - row.sendClickedAt;
      pending.delete(nonce);
      break;
    }
  }

  console.log('[CHAT_UI_RENDERED]', {
    nonce: matchedNonce,
    message_id: messageId,
    elapsed_total_ms,
    ts
  });
}

export function registerMessageIdForNonce(nonce: string, messageId: string) {
  const row = pending.get(nonce);
  if (row) {
    row.messageId = messageId;
    pending.set(nonce, row);
  }
}
