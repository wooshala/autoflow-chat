import { NextRequest } from 'next/server';
import { jsonErr, jsonOk } from '@/lib/api/envelope';
import { isUuid, opsEventsDisabledResponse } from '@/lib/ops-events/guard';
import {
  createLostFoundFromMessage,
  listLostFoundItems,
  LostFoundConflictError,
  LostFoundValidationError
} from '@/lib/ops-events/lostFoundService';
import type { LostFoundItem, LostFoundItemWithMatch, LostFoundStatus } from '@/lib/ops-events/types';
import {
  lookupGuestMatchForItem,
  unavailableGuestMatch
} from '@/lib/stayJournal/stayGuestLookup';

const VALID_STATUSES = new Set([
  'registered',
  'stored',
  'owner_notified',
  'returned',
  'disposed',
  'cancelled'
]);

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

async function enrichWithGuestMatch(items: LostFoundItem[]): Promise<LostFoundItemWithMatch[]> {
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

export async function GET(req: NextRequest) {
  const disabled = opsEventsDisabledResponse();
  if (disabled) return disabled;

  try {
    const statusParam = req.nextUrl.searchParams.get('status');
    const status =
      statusParam && VALID_STATUSES.has(statusParam) ? (statusParam as LostFoundStatus) : undefined;
    const items = await listLostFoundItems({ status });
    const enriched = await enrichWithGuestMatch(items);
    return jsonOk({ items: enriched });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonErr('INTERNAL', msg, 500);
  }
}

export async function POST(req: NextRequest) {
  const disabled = opsEventsDisabledResponse();
  if (disabled) return disabled;

  try {
    const body = await req.json().catch(() => ({}));
    const origin_message_id = String((body as any)?.origin_message_id || '').trim();
    const item_description = String((body as any)?.item_description || '').trim();
    const actor_id = String((body as any)?.actor_id || '').trim();
    const found_location = (body as any)?.found_location ?? null;
    const locker_code = (body as any)?.locker_code ?? null;
    const idempotency_key = (body as any)?.idempotency_key ?? null;

    if (!origin_message_id || !item_description || !actor_id) {
      return jsonErr('VALIDATION', 'origin_message_id, item_description, actor_id required', 400);
    }
    if (!isUuid(origin_message_id) || !isUuid(actor_id)) {
      return jsonErr('VALIDATION', 'Invalid UUID', 400);
    }

    const item = await createLostFoundFromMessage({
      origin_message_id,
      item_description,
      found_location,
      locker_code,
      actor_id,
      idempotency_key
    });

    // Register response: enrich single item so Event Center can show match immediately
    const [enriched] = await enrichWithGuestMatch([item]);
    return jsonOk({ item: enriched || item }, { status: 201 });
  } catch (e: unknown) {
    if (e instanceof LostFoundConflictError) {
      return jsonErr('CONFLICT', e.message, 409);
    }
    if (e instanceof LostFoundValidationError) {
      return jsonErr('VALIDATION', e.message, 400);
    }
    const msg = e instanceof Error ? e.message : String(e);
    return jsonErr('INTERNAL', msg, 500);
  }
}
