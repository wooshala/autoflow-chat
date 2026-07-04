import { supabaseAdmin } from '@/lib/supabase';
import { IS_MOCK } from '@/lib/env';

export async function uploadImage(file: File) {
  if (IS_MOCK || !supabaseAdmin) {
    const seed = `${Date.now()}-${Math.random().toString(16).slice(2)}-${file.name.replace(/\s+/g, '-')}`;
    return {
      image_url: `https://picsum.photos/seed/${encodeURIComponent(seed)}/800/600`,
      storage_path: `mock/${seed}`,
      profile: { array_buffer_ms: 0, storage_upload_ms: 0, total_upload_image_ms: 0 }
    };
  }

  const ext = file.name.split('.').pop() || 'jpg';
  const path = `maintenance/${new Date().toISOString().slice(0, 10)}/${Date.now()}.${ext}`;

  const abStart = Date.now();
  const bytes = Buffer.from(await file.arrayBuffer());
  const abMs = Date.now() - abStart;
  console.log('[CHAT_FILE_ARRAY_BUFFER_OK]', {
    array_buffer_ms: abMs,
    size: bytes.length,
    type: file.type
  });

  const storageStart = Date.now();
  const { error } = await supabaseAdmin.storage.from('autoflow-photos').upload(path, bytes, {
    contentType: file.type,
    upsert: false
  });
  const storageMs = Date.now() - storageStart;
  if (error) throw error;

  const { data } = supabaseAdmin.storage.from('autoflow-photos').getPublicUrl(path);
  return {
    image_url: data.publicUrl,
    storage_path: path,
    profile: {
      array_buffer_ms: abMs,
      storage_upload_ms: storageMs,
      total_upload_image_ms: abMs + storageMs
    }
  };
}
