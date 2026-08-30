// IMAGE-CHAT-01A — server-only Storage helpers for guest chat attachments.

import { randomUUID } from 'node:crypto';

import { IS_MOCK } from '@/lib/env';
import { supabaseAdmin } from '@/lib/supabase';
import {
  GUEST_CHAT_ATTACHMENTS_BUCKET,
  buildGuestAttachmentStoragePath,
  extensionForMime,
  type GuestAttachmentMime,
} from './guestAttachmentValidation';

const SIGNED_URL_TTL_SEC = 3600;

function storage() {
  if (!supabaseAdmin) throw new Error('DB_UNAVAILABLE');
  return supabaseAdmin.storage.from(GUEST_CHAT_ATTACHMENTS_BUCKET);
}

export async function uploadGuestAttachmentObject(input: {
  sessionId: string;
  mime: GuestAttachmentMime;
  bytes: Buffer;
}): Promise<{ uploadId: string; storagePath: string }> {
  const uploadId = randomUUID();
  const storagePath = buildGuestAttachmentStoragePath(
    input.sessionId,
    uploadId,
    extensionForMime(input.mime),
  );

  if (IS_MOCK) {
    return { uploadId, storagePath };
  }

  const { error } = await storage().upload(storagePath, input.bytes, {
    contentType: input.mime,
    upsert: false,
  });
  if (error) throw new Error(`STORAGE_UPLOAD_FAILED: ${error.message}`);
  return { uploadId, storagePath };
}

export async function guestAttachmentObjectExists(storagePath: string): Promise<boolean> {
  if (IS_MOCK) return storagePath.startsWith('mock/') || /^[0-9a-f-]{36}\/[0-9a-f-]{36}\./i.test(storagePath);
  const parts = storagePath.split('/');
  const name = parts.pop();
  const folder = parts.join('/');
  if (!name) return false;
  const { data, error } = await storage().list(folder, { search: name, limit: 1 });
  if (error) return false;
  return (data ?? []).some((o) => o.name === name);
}

export async function deleteGuestAttachmentObjectBestEffort(storagePath: string): Promise<void> {
  if (IS_MOCK) return;
  try {
    await storage().remove([storagePath]);
  } catch {
    /* orphan GC is out of scope */
  }
}

export async function createGuestAttachmentSignedUrl(storagePath: string): Promise<string | null> {
  if (IS_MOCK) {
    return `https://mock.local/guest-chat/${encodeURIComponent(storagePath)}`;
  }
  const { data, error } = await storage().createSignedUrl(storagePath, SIGNED_URL_TTL_SEC);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}
