import { NextRequest } from 'next/server';
import { jsonErr, jsonOk } from '@/lib/api/envelope';
import { isUuid, opsEventsDisabledResponse } from '@/lib/ops-events/guard';
import { getLostFoundHistory, LostFoundNotFoundError } from '@/lib/ops-events/lostFoundService';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const disabled = opsEventsDisabledResponse();
  if (disabled) return disabled;

  try {
    const { id } = await ctx.params;
    if (!isUuid(id)) return jsonErr('VALIDATION', 'Invalid id', 400);
    const history = await getLostFoundHistory(id);
    return jsonOk({ history });
  } catch (e: unknown) {
    if (e instanceof LostFoundNotFoundError) {
      return jsonErr('NOT_FOUND', e.message, 404);
    }
    const msg = e instanceof Error ? e.message : String(e);
    return jsonErr('INTERNAL', msg, 500);
  }
}
