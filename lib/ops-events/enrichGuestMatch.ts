import type { LostFoundItem, LostFoundItemWithMatch } from '@/lib/ops-events/types';
import {
  lookupGuestMatchForItem,
  unavailableGuestMatch
} from '@/lib/stayJournal/stayGuestLookup';

const MATCH_TIMEOUT_MS = 1500;

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), ms);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function enrichLostFoundWithGuestMatch(
  items: LostFoundItem[]
): Promise<LostFoundItemWithMatch[]> {
  return Promise.all(
    items.map(async (item) => {
      const foundAt = item.snap_message_created_at || item.created_at;
      const match = await withTimeout(
        lookupGuestMatchForItem({ room_no: item.snap_room_no, found_at: foundAt }),
        MATCH_TIMEOUT_MS
      );
      return {
        ...item,
        guestMatch: match || unavailableGuestMatch('숙박일지 조회 지연')
      };
    })
  );
}

export async function enrichOneLostFoundWithGuestMatch(
  item: LostFoundItem
): Promise<LostFoundItemWithMatch> {
  const [enriched] = await enrichLostFoundWithGuestMatch([item]);
  return enriched || { ...item, guestMatch: unavailableGuestMatch('숙박일지 조회 지연') };
}
