/**
 * Core v0.1 latency instrumentation (console logs).
 * client_nonce ties sender click → API → realtime → UI on one message.
 */

export type ClientNonceSource = 'pc' | 'staff' | string;

type PendingTrace = {
  client_nonce: string;
  sendClickedAt: number;
  apiReceivedAt?: number;
  dbInsertedAt?: number;
  apiRespondedAt?: number;
  messageId?: string;
};

const pending = new Map<string, PendingTrace>();

/** Send click 직전 — format: chat_${source}_${Date.now()}_${rand6} */
export function createClientNonce(source: ClientNonceSource): string {
  const suffix = Math.random().toString(36).slice(2, 8);
  return `chat_${source}_${Date.now()}_${suffix}`;
}

export function logSendClick(client_nonce: string) {
  const ts = Date.now();
  pending.set(client_nonce, { client_nonce, sendClickedAt: ts });
  console.log('[CHAT_SEND_CLICK]', { client_nonce, ts });
}

export function logSendApiResponded(client_nonce: string, messageId: string, dbInsertedAt?: string) {
  const ts = Date.now();
  const row = pending.get(client_nonce) || { client_nonce, sendClickedAt: ts };
  row.apiRespondedAt = ts;
  row.messageId = messageId;
  if (dbInsertedAt) row.dbInsertedAt = Date.parse(dbInsertedAt) || undefined;
  pending.set(client_nonce, row);
  const elapsed_ms = ts - row.sendClickedAt;
  console.log('[CHAT_SEND_API_RESPONDED]', { client_nonce, message_id: messageId, elapsed_ms, ts });
}

export function lookupClientNonceForMessage(messageId: string): string | null {
  for (const [client_nonce, row] of pending.entries()) {
    if (row.messageId === messageId) return client_nonce;
  }
  return null;
}

export function logRealtimeReceived(messageId: string, roomNo: string | null, senderSide: string | null) {
  const ts = Date.now();
  const client_nonce = lookupClientNonceForMessage(messageId);
  let elapsed_from_db_ms: number | null = null;

  if (client_nonce) {
    const row = pending.get(client_nonce);
    if (row?.dbInsertedAt) elapsed_from_db_ms = ts - row.dbInsertedAt;
  }

  console.log('[CHAT_REALTIME_RECEIVED]', {
    client_nonce,
    message_id: messageId,
    room: roomNo,
    sender: senderSide,
    elapsed_from_db_ms,
    ts
  });
}

export function logUiRendered(messageId: string) {
  const ts = Date.now();
  const client_nonce = lookupClientNonceForMessage(messageId);
  let elapsed_total_ms: number | null = null;

  if (client_nonce) {
    const row = pending.get(client_nonce);
    if (row) {
      elapsed_total_ms = ts - row.sendClickedAt;
      pending.delete(client_nonce);
    }
  }

  console.log('[CHAT_UI_RENDERED]', {
    client_nonce,
    message_id: messageId,
    elapsed_total_ms,
    ts
  });
}

export function registerMessageIdForNonce(client_nonce: string, messageId: string) {
  const row = pending.get(client_nonce);
  if (row) {
    row.messageId = messageId;
    pending.set(client_nonce, row);
  }
}
