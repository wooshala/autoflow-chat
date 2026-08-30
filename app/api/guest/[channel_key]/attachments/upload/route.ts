// IMAGE-CHAT-01A — POST /api/guest/[channel_key]/attachments/upload (Guest → Staff Phase A).

import { NextRequest, NextResponse } from 'next/server';

import {
  GUEST_ATTACHMENT_MAX_COUNT,
  normalizeAttachmentCount,
  validateGuestAttachmentFile,
} from '@/lib/guest-spike/guestAttachmentValidation';
import { uploadGuestAttachmentObject } from '@/lib/guest-spike/guestAttachmentStorage';
import { resolveGuestAttachmentSession } from '@/lib/guest-spike/guestAttachmentSession';
import { insertPendingGuestUpload } from '@/lib/guest-spike/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

function dbError(e: unknown) {
  const msg = e instanceof Error ? e.message : '';
  if (msg === 'DB_UNAVAILABLE') return NextResponse.json({ ok: false, error: 'DB_UNAVAILABLE' }, { status: 503 });
  if (msg.startsWith('STORAGE_UPLOAD_FAILED')) {
    return NextResponse.json({ ok: false, error: 'STORAGE_UPLOAD_FAILED' }, { status: 502 });
  }
  return NextResponse.json({ ok: false, error: 'DB_ERROR' }, { status: 500 });
}

export async function POST(req: NextRequest, { params }: { params: { channel_key: string } }) {
  const channelKey = params.channel_key;

  // Phase A: guest upload only (staff composer untouched).
  if (req.nextUrl.searchParams.get('as') === 'staff') {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  let resolved;
  try {
    resolved = await resolveGuestAttachmentSession(req, channelKey);
  } catch (e) {
    return dbError(e);
  }

  if (!resolved.ok) {
    if (resolved.kind === 'closed') {
      return NextResponse.json({ ok: false, error: 'SESSION_CLOSED' }, { status: 409 });
    }
    if (resolved.kind === 'occupied') {
      return NextResponse.json({ ok: false, error: 'SESSION_OCCUPIED' }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: 'NO_ACTIVE_SESSION' }, { status: 409 });
  }

  const session = resolved.session;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: 'BAD_FORM' }, { status: 400 });
  }

  const files = form.getAll('files').filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    const single = form.get('file');
    if (single instanceof File) files.push(single);
  }

  const countCheck = normalizeAttachmentCount(files.length);
  if (!countCheck.ok) {
    return NextResponse.json({ ok: false, error: countCheck.error }, { status: 400 });
  }

  const uploads: { upload_token: string; mime_type: string; size_bytes: number }[] = [];

  try {
    for (const file of files) {
      const bytes = Buffer.from(await file.arrayBuffer());
      const validated = validateGuestAttachmentFile({
        bytes,
        declaredMime: file.type || 'application/octet-stream',
        declaredSize: file.size,
      });
      if (!validated.ok) {
        return NextResponse.json({ ok: false, error: validated.error }, { status: 400 });
      }

      const { storagePath } = await uploadGuestAttachmentObject({
        sessionId: session.id,
        mime: validated.mime,
        bytes,
      });

      const { uploadToken } = await insertPendingGuestUpload({
        sessionId: session.id,
        channelKey,
        storagePath,
        mimeType: validated.mime,
        sizeBytes: bytes.length,
      });

      uploads.push({
        upload_token: uploadToken,
        mime_type: validated.mime,
        size_bytes: bytes.length,
      });
    }
  } catch (e) {
    return dbError(e);
  }

  if (uploads.length > GUEST_ATTACHMENT_MAX_COUNT) {
    return NextResponse.json({ ok: false, error: 'TOO_MANY' }, { status: 400 });
  }

  return NextResponse.json({ ok: true, uploads }, { status: 201 });
}
