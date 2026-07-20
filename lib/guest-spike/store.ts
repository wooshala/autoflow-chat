// Phase 1H.3 — Supabase-backed persistence for the guest chat (replaces the Phase 1G.4
// in-memory store, which was per-serverless-instance and lost the mobile↔EXE round trip
// on Vercel). SERVER-ONLY: imports supabaseAdmin (service role) — never import from a
// client component (client uses api.ts). Same contract the route used before, now async
// and throwing on DB errors so the route can map them to 503/500.
//
// Table: guest_chat_messages (channel_key, sender, original_text, original_lang,
// translated_json, created_at). No auth yet (spike) — see route.ts note.
//
// TODO(canonical-namespace): guest-spike → guest-chat (later refactor step).

import { supabaseAdmin } from '@/lib/supabase';
import type { GuestSpikeMsg, NewGuestMsg } from './types';

export type { GuestSpikeMsg, NewGuestMsg };

const TABLE = 'guest_chat_messages';
const COLS = 'id, sender, original_text, original_lang, translated_json, created_at';

interface Row {
  id: string;
  sender: 'guest' | 'staff';
  original_text: string;
  original_lang: string;
  translated_json: Record<string, string> | null;
  created_at: string;
}

function rowToMsg(r: Row): GuestSpikeMsg {
  return {
    id: r.id,
    sender: r.sender,
    original: r.original_text,
    original_lang: r.original_lang,
    translated: r.translated_json ?? {},
    created_at: r.created_at,
  };
}

/** Server admin client, or throw DB_UNAVAILABLE (missing SUPABASE_PRIMARY_URL / key). */
function db() {
  if (!supabaseAdmin) throw new Error('DB_UNAVAILABLE');
  return supabaseAdmin;
}

/** Ordered stable across serverless instances: created_at ASC, id ASC tiebreak. */
export async function listMessages(channelKey: string): Promise<GuestSpikeMsg[]> {
  const { data, error } = await db()
    .from(TABLE)
    .select(COLS)
    .eq('channel_key', channelKey)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });
  if (error) throw new Error(`DB_ERROR: ${error.message}`);
  return ((data as Row[] | null) ?? []).map(rowToMsg);
}

/** Single INSERT (original + translated together). DB assigns id + created_at. */
export async function appendMessage(channelKey: string, m: NewGuestMsg): Promise<GuestSpikeMsg> {
  const { data, error } = await db()
    .from(TABLE)
    .insert({
      channel_key: channelKey,
      sender: m.sender,
      original_text: m.original,
      original_lang: m.original_lang,
      translated_json: m.translated,
    })
    .select(COLS)
    .single();
  if (error) throw new Error(`DB_ERROR: ${error.message}`);
  return rowToMsg(data as Row);
}

/** Spike channel → guest language (translation direction). 308 = Japanese. */
export function guestLangForChannel(channelKey: string): string {
  if (channelKey.includes('308')) return 'ja';
  return 'ja';
}
