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
  /** Soft-delete — when true UI shows placeholder; original/translated must not be shown. */
  is_deleted?: boolean;
  deleted_at?: string | null;
  /** Staff sender users.id when sender=staff (for delete ownership). */
  staff_user_id?: string | null;
}

/** Insert payload — id + created_at are assigned by the DB, never by the app. */
export interface NewGuestMsg {
  sender: 'guest' | 'staff';
  original: string;
  original_lang: string;
  translated: Record<string, string>;
  /** Required for staff sends after soft-delete migration (ownership). */
  staff_user_id?: string | null;
}
