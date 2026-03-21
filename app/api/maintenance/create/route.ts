import { NextRequest, NextResponse } from 'next/server';
import { createTicket } from '@/lib/services/maintenance';
import { listChatMessages } from '@/lib/services/chat';
import { uploadImage } from '@/lib/services/upload';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    // optional: message_id (for client-side traceability / future linkage)
    const message_id = String(formData.get('message_id') || '');
    const room_no = String(formData.get('room_no') || '');
    const issue_type = String(formData.get('issue_type') || '') || '설비';
    const description = String(formData.get('description') || '');
    const created_by = String(formData.get('created_by') || '');
    const image = formData.get('image');

    if (!room_no || !description || !created_by) {
      return NextResponse.json(
        { error: 'room_no, description, created_by required' },
        { status: 400 }
      );
    }

    let image_url: string | null = null;
    let storage_path: string | null = null;
    if (image instanceof File) {
      if (!image.type.startsWith('image/')) {
        return NextResponse.json(
          { error: '이미지 파일만 업로드할 수 있습니다.' },
          { status: 400 }
        );
      }
      if (image.size > 10 * 1024 * 1024) {
        return NextResponse.json(
          { error: '10MB 이하만 가능합니다.' },
          { status: 400 }
        );
      }
      const uploaded = await uploadImage(image);
      image_url = uploaded.image_url;
      storage_path = uploaded.storage_path;
    }

    const payload = {
      room_no,
      issue_type: issue_type as any,
      description,
      created_by,
      image_url,
      storage_path
    } as const;

    // 디버그용: 실제 서버 측 payload 로깅
    console.log('[api/maintenance/create] payload', payload);

    const ticket = await createTicket(payload);
    const messages = await listChatMessages(1);
    return NextResponse.json({ ticket, chat_message: messages[messages.length - 1] || null });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || '유지보수 생성 실패' }, { status: 500 });
  }
}
