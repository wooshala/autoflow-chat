// Latency breakdown instrumentation (measurement only — no behavior change).
// Emits [CHAT_LATENCY_<STAGE>] console logs with a standard field set so a
// send can be reconstructed end-to-end across sender, server, and receiver.
//
// Correlation keys:
//   - client_nonce : ties the SENDER's pre-response stages (before message_id)
//   - message_id   : ties server + realtime + receiver stages
//
// elapsed_ms is measured PER SURFACE against that surface's own clock (skew-free
// within a machine). Cross-machine gaps are read from absolute `ts` values.

import { lookupClientNonceForMessage } from '@/lib/chat/sendTrace';

export type LatencyStage =
  | 'SEND_CLICK'
  | 'API_START'
  | 'DB_INSERTED'
  | 'API_RESPONDED'
  | 'LOCAL_RENDERED'
  | 'REALTIME_RECEIVED'
  | 'REMOTE_RENDERED'
  | 'TRANSLATION_QUEUED'
  | 'TRANSLATION_DONE'
  | 'TRANSLATION_UPDATED'
  | 'TRANSLATION_FAILED'
  | 'AI_DONE';

export type LatencyFields = {
  message_id?: string | null;
  client_nonce?: string | null;
  sender_side?: string | null;
  receiver_side?: string | null;
  room?: string | null;
  ts?: number;
  elapsed_ms?: number | null;
  has_translation?: boolean | null;
  source?: 'pc' | 'staff' | string | null;
  [k: string]: unknown;
};

/** Pure emitter — usable on both client and server. Always includes the full field set. */
export function emitLatency(stage: LatencyStage, fields: LatencyFields): void {
  const ts = fields.ts ?? Date.now();
  // eslint-disable-next-line no-console
  console.log(`[CHAT_LATENCY_${stage}]`, {
    message_id: null,
    client_nonce: null,
    sender_side: null,
    receiver_side: null,
    room: null,
    has_translation: null,
    source: null,
    elapsed_ms: null,
    ...fields,
    ts
  });
}

// ── Client-side stateful helpers ─────────────────────────────────────────────

type SentTrace = {
  nonce: string;
  t0: number;
  sender_side: string | null;
  room: string | null;
  source: string | null;
  message_id?: string;
};

const sentByNonce = new Map<string, SentTrace>();
const sentByMsgId = new Map<string, SentTrace>();
const recvAtByMsgId = new Map<string, number>();

let self: { side: string | null; source: string | null } = { side: null, source: null };

/** Each surface declares its own side/source once (pc /chat vs staff mobile). */
export function setLatencySelf(side: string | null, source: string | null): void {
  self = { side, source };
}

export function latSendClick(p: {
  client_nonce: string;
  sender_side: string | null;
  room: string | null;
  source: string | null;
}): void {
  const t0 = Date.now();
  sentByNonce.set(p.client_nonce, {
    nonce: p.client_nonce,
    t0,
    sender_side: p.sender_side,
    room: p.room,
    source: p.source
  });
  emitLatency('SEND_CLICK', {
    client_nonce: p.client_nonce,
    sender_side: p.sender_side,
    room: p.room,
    source: p.source,
    elapsed_ms: 0,
    ts: t0
  });
}

export function latApiStart(client_nonce: string): void {
  const s = sentByNonce.get(client_nonce);
  const ts = Date.now();
  emitLatency('API_START', {
    client_nonce,
    sender_side: s?.sender_side ?? null,
    room: s?.room ?? null,
    source: s?.source ?? null,
    elapsed_ms: s ? ts - s.t0 : null,
    ts
  });
}

export function latApiResponded(client_nonce: string, message_id: string, has_translation: boolean | null): void {
  const s = sentByNonce.get(client_nonce);
  const ts = Date.now();
  if (s) {
    s.message_id = message_id;
    sentByMsgId.set(message_id, s);
  }
  emitLatency('API_RESPONDED', {
    client_nonce,
    message_id,
    sender_side: s?.sender_side ?? null,
    room: s?.room ?? null,
    source: s?.source ?? null,
    has_translation,
    elapsed_ms: s ? ts - s.t0 : null,
    ts
  });
}

/**
 * Called when a freshly-seen message id is rendered. Returns true if it was the
 * sender's own message (LOCAL_RENDERED), false otherwise (REMOTE_RENDERED) so
 * the caller can route accordingly.
 */
export function latRendered(message_id: string): 'local' | 'remote' {
  const ts = Date.now();
  const s = sentByMsgId.get(message_id);
  if (s) {
    emitLatency('LOCAL_RENDERED', {
      client_nonce: s.nonce,
      message_id,
      sender_side: s.sender_side,
      room: s.room,
      source: s.source,
      elapsed_ms: ts - s.t0,
      ts
    });
    return 'local';
  }
  const recvAt = recvAtByMsgId.get(message_id);
  emitLatency('REMOTE_RENDERED', {
    message_id,
    receiver_side: self.side,
    source: self.source,
    elapsed_ms: recvAt != null ? ts - recvAt : null,
    ts
  });
  return 'remote';
}

export function latRealtimeReceived(p: {
  message_id: string;
  sender_side: string | null;
  room: string | null;
  has_translation: boolean | null;
  created_at?: string | null;
}): void {
  const ts = Date.now();
  recvAtByMsgId.set(p.message_id, ts);
  const client_nonce = lookupClientNonceForMessage(p.message_id);
  const createdMs = p.created_at ? Date.parse(p.created_at) : NaN;
  const elapsed_from_created_ms = Number.isFinite(createdMs) ? ts - createdMs : null;
  emitLatency('REALTIME_RECEIVED', {
    message_id: p.message_id,
    client_nonce: client_nonce ?? null,
    sender_side: p.sender_side,
    receiver_side: self.side,
    room: p.room,
    has_translation: p.has_translation,
    source: self.source,
    // cross-machine (server insert -> receiver) — subject to clock skew
    elapsed_ms: elapsed_from_created_ms,
    elapsed_from_created_ms,
    ts
  });
}
