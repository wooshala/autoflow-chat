import { supabaseAdmin } from '@/lib/supabase';
import { IS_MOCK } from '@/lib/env';

export async function uploadImage(file: File) {
  if (IS_MOCK || !supabaseAdmin) {
    return {
      image_url: 'https://images.unsplash.com/photo-1585771724684-38269d6639fd?w=800&h=600&fit=crop',
      storage_path: `mock/${Date.now()}-${file.name.replace(/\s+/g, '-')}`
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
