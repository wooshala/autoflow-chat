// Phase 1H.3 — guest chat message shapes. Pure types (no server/DB imports) so both the
// server store (store.ts, imports supabaseAdmin) and the client api (api.ts) can share
// them without pulling server code into the browser bundle.
//
// TODO(canonical-namespace): guest-spike → guest-chat (later refactor step).

export interface GuestSpikeMsg {
  id: string;
  sender: 'guest' | 'staff';
  original: string;
  original_lang: string;
  translated: Record<string, string>; // BCP-47 keyed
  created_at: string; // ISO
}

/** Insert payload — id + created_at are assigned by the DB, never by the app. */
export interface NewGuestMsg {
  sender: 'guest' | 'staff';
  original: string;
  original_lang: string;
  translated: Record<string, string>;
}
