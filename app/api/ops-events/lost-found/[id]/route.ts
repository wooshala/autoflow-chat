import { NextRequest } from 'next/server';
import { jsonErr, jsonOk } from '@/lib/api/envelope';
import { enrichOneLostFoundWithGuestMatch } from '@/lib/ops-events/enrichGuestMatch';
import { isUuid, opsEventsDisabledResponse } from '@/lib/ops-events/guard';
import {
  LostFoundNotFoundError,
  LostFoundValidationError,
  softDeleteLostFoundItem,
  updateLostFoundItem
} from '@/lib/ops-events/lostFoundService';

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const disabled = opsEventsDisabledResponse();
  if (disabled) return disabled;

  try {
    const { id } = await ctx.params;
    if (!isUuid(id)) return jsonErr('VALIDATION', 'Invalid id', 400);

    const body = await req.json().catch(() => ({}));
    const actor_id = String((body as { actor_id?: unknown })?.actor_id || '').trim();
    if (!actor_id || !isUuid(actor_id)) {
      return jsonErr('VALIDATION', 'Invalid actor_id', 400);
    }

    const b = body as Record<string, unknown>;
    const patch: {
      snap_room_no?: string | null;
      item_description?: string;
      found_location?: string | null;
    } = {};

    if ('snap_room_no' in b) patch.snap_room_no = b.snap_room_no == null ? null : String(b.snap_room_no);
    if ('item_description' in b) patch.item_description = String(b.item_description ?? '');
    if ('found_location' in b) {
      patch.found_location = b.found_location == null ? null : String(b.found_location);
    }

    const result = await updateLostFoundItem({ id, actor_id, patch });
    const enriched = await enrichOneLostFoundWithGuestMatch(result.item);
    return jsonOk({ item: enriched, history: result.history });
  } catch (e: unknown) {
    if (e instanceof LostFoundNotFoundError) {
      return jsonErr('NOT_FOUND', e.message, 404);
    }
    if (e instanceof LostFoundValidationError) {
      return jsonErr('VALIDATION', e.message, 422);
    }
    const msg = e instanceof Error ? e.message : String(e);
    return jsonErr('INTERNAL', msg, 500);
  }
}

/** Soft-delete lost_found item (is_deleted=true). No physical delete. */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const disabled = opsEventsDisabledResponse();
  if (disabled) return disabled;

  try {
    const { id } = await ctx.params;
    if (!isUuid(id)) return jsonErr('VALIDATION', 'Invalid id', 400);

    const body = await req.json().catch(() => ({}));
    const actor_id = String((body as { actor_id?: unknown })?.actor_id || '').trim();
    if (!actor_id || !isUuid(actor_id)) {
      return jsonErr('VALIDATION', 'Invalid actor_id', 400);
    }

    const item = await softDeleteLostFoundItem({ id, actor_id });
    return jsonOk({ item });
  } catch (e: unknown) {
    if (e instanceof LostFoundNotFoundError) {
      return jsonErr('NOT_FOUND', e.message, 404);
    }
    if (e instanceof LostFoundValidationError) {
      return jsonErr('VALIDATION', e.message, 422);
    }
    const msg = e instanceof Error ? e.message : String(e);
    return jsonErr('INTERNAL', msg, 500);
  }
}
