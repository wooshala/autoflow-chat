import { NextRequest } from 'next/server';
import { jsonErr, jsonOk } from '@/lib/api/envelope';
import { isUuid, opsEventsDisabledResponse } from '@/lib/ops-events/guard';
import {
  LostFoundNotFoundError,
  LostFoundValidationError,
  transitionLostFoundItem
} from '@/lib/ops-events/lostFoundService';
import type { LostFoundStatus } from '@/lib/ops-events/types';

const VALID_STATUSES = new Set([
  'registered',
  'stored',
  'owner_notified',
  'returned',
  'disposed',
  'cancelled'
]);

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const disabled = opsEventsDisabledResponse();
  if (disabled) return disabled;

  try {
    const { id } = await ctx.params;
    if (!isUuid(id)) return jsonErr('VALIDATION', 'Invalid id', 400);

    const body = await req.json().catch(() => ({}));
    const to_status = String((body as any)?.to_status || '').trim() as LostFoundStatus;
    const actor_id = String((body as any)?.actor_id || '').trim();
    const transition_note = (body as any)?.transition_note ?? null;
    const idempotency_key =
      req.headers.get('Idempotency-Key') || (body as any)?.idempotency_key || null;

    if (!to_status || !VALID_STATUSES.has(to_status)) {
      return jsonErr('VALIDATION', 'Invalid to_status', 400);
    }
    if (!actor_id || !isUuid(actor_id)) {
      return jsonErr('VALIDATION', 'Invalid actor_id', 400);
    }

    const result = await transitionLostFoundItem({
      id,
      to_status,
      actor_id,
      transition_note,
      idempotency_key
    });

    return jsonOk(result);
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
