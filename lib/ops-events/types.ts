export const LOST_FOUND_TERMINAL_STATUSES = ['returned', 'disposed', 'cancelled'] as const;

export type LostFoundStatus =
  | 'registered'
  | 'stored'
  | 'owner_notified'
  | 'returned'
  | 'disposed'
  | 'cancelled';

export type LostFoundItem = {
  id: string;
  event_no: string;
  site_id: string;
  source: 'autoflow';
  snap_room_no: string | null;
  snap_sender: string | null;
  snap_sender_role: string | null;
  snap_image_url: string | null;
  snap_storage_path: string | null;
  snap_message_text: string | null;
  snap_message_created_at: string | null;
  origin_message_id: string | null;
  item_description: string;
  found_location: string | null;
  locker_code: string | null;
  status: LostFoundStatus;
  status_changed_at: string | null;
  status_changed_by: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type OpsEventHistoryRow = {
  id: string;
  site_id: string;
  ref_table: string;
  ref_id: string;
  action: 'created' | 'status_changed' | 'reopened' | 'note_added' | 'soft_deleted';
  from_status: string | null;
  to_status: string | null;
  actor_id: string;
  actor_name: string;
  actor_role: string | null;
  transition_note: string | null;
  meta?: Record<string, unknown> | null;
  created_at: string;
};

import type { GuestMatchView } from '@/lib/stayJournal/stayGuestLookup';

/** Phase 1: dynamic stay-journal match on GET (not a DB column). */
export type LostFoundGuestMatch = GuestMatchView;

export type LostFoundItemWithMatch = LostFoundItem & {
  guestMatch?: GuestMatchView | null;
};
