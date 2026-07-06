import { NextResponse } from 'next/server';
import { isOpsEventsEnabled } from '@/lib/ops-events/flags';

export function opsEventsDisabledResponse(): NextResponse | null {
  if (!isOpsEventsEnabled()) {
    return NextResponse.json({ ok: false, error: 'NOT_FOUND', message: 'Not found' }, { status: 404 });
  }
  return null;
}

export function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}
