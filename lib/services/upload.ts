import { supabaseAdmin } from '@/lib/supabase';
import { IS_MOCK } from '@/lib/env';

export async function uploadImage(file: File) {
  if (IS_MOCK || !supabaseAdmin) {
    const seed = `${Date.now()}-${Math.random().toString(16).slice(2)}-${file.name.replace(/\s+/g, '-')}`;
    return {
      // mock 모드에서도 업로드마다 URL이 달라져 캐시/고정 이미지 문제를 방지
      image_url: `https://picsum.photos/seed/${encodeURIComponent(seed)}/800/600`,
      storage_path: `mock/${seed}`
    };
  }

  const ext = file.name.split('.').pop() || 'jpg';
  const path = `maintenance/${new Date().toISOString().slice(0, 10)}/${Date.now()}.${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  const { error } = await supabaseAdmin.storage.from('autoflow-photos').upload(path, bytes, {
    contentType: file.type,
    upsert: false
  });
  if (error) throw error;
  const { data } = supabaseAdmin.storage.from('autoflow-photos').getPublicUrl(path);
  return { image_url: data.publicUrl, storage_path: path };
}
