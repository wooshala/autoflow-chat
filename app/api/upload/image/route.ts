import { NextRequest, NextResponse } from 'next/server';
import { uploadImage } from '@/lib/services/upload';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file required' }, { status: 400 });
    }
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: '이미지 파일만 업로드할 수 있습니다.' }, { status: 400 });
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: '10MB 이하만 가능합니다.' }, { status: 400 });
    }
    const result = await uploadImage(file);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || '업로드 실패' }, { status: 500 });
  }
}
