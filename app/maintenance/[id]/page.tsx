'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ISSUE_UI, MaintenanceTicket, STATUS_UI, TicketStatus, User } from '@/lib/types';

export default function MaintenanceDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const [ticket, setTicket] = useState<MaintenanceTicket | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [overlay, setOverlay] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const raw = localStorage.getItem('autoflow_user');
    if (raw) setUser(JSON.parse(raw));
  }, []);

  useEffect(() => {
    fetch(`/api/maintenance/${id}`).then((r) => r.json()).then((d) => setTicket(d.ticket || null));
  }, [id]);

  async function changeStatus(next: TicketStatus) {
    let complete_photo_url: string | null = null;
    let complete_storage_path: string | null = null;
    if (next === 'done' && photo) {
      const fd = new FormData();
      fd.append('file', photo);
      const upload = await fetch('/api/upload/image', { method: 'POST', body: fd });
      const up = await upload.json();
      complete_photo_url = up.image_url;
      complete_storage_path = up.storage_path;
    }
    const res = await fetch(`/api/maintenance/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next, updated_by: user?.id || null, complete_photo_url, complete_storage_path })
    });
    const data = await res.json();
    setTicket(data.ticket || null);
    setOverlay(false);
    setPhoto(null);
    setPreview(null);
  }

  if (!ticket) return <div className="flex h-screen items-center justify-center text-gray-400">불러오는 중...</div>;
  const afterPhotos = ticket.photos?.filter((p) => p.photo_type === 'after') || [];
  const beforePhotos = ticket.photos?.filter((p) => p.photo_type === 'before') || [];
  const nextAction = ticket.status === 'open' ? 'progress' : ticket.status === 'progress' ? 'done' : null;

  return (
    <main className="flex h-screen flex-col bg-gray-100">
      <header className="flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-3">
        <button onClick={() => router.back()} className="text-xl text-blue-600">←</button>
        <div className="font-bold">유지보수 상세</div>
      </header>
      <section className="flex-1 overflow-y-auto pb-28">
        {beforePhotos[0]?.image_url && <img src={beforePhotos[0].image_url} alt="before" className="h-64 w-full object-cover" />}
        <div className="card m-3 overflow-hidden">
          <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-4">
            <span className="text-3xl font-extrabold">{ticket.room_no}</span>
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${ISSUE_UI[ticket.issue_type].badge}`}>{ISSUE_UI[ticket.issue_type].emoji} {ticket.issue_type}</span>
            <span className={`ml-auto rounded-full px-3 py-1 text-xs font-bold ${STATUS_UI[ticket.status].badge}`}>{STATUS_UI[ticket.status].label}</span>
          </div>
          <div className="space-y-3 px-4 py-4 text-sm">
            <div><span className="text-gray-500 mr-2">설명</span><span className="font-medium">{ticket.description}</span></div>
            <div><span className="text-gray-500 mr-2">등록자</span><span className="font-medium">{ticket.creator?.name || ticket.created_by}</span></div>
            <div><span className="text-gray-500 mr-2">등록시간</span><span className="font-medium">{new Date(ticket.created_at).toLocaleString('ko-KR')}</span></div>
          </div>
        </div>
        {afterPhotos.length > 0 && (
          <div className="card m-3 p-4">
            <div className="mb-2 text-sm font-bold">완료 사진</div>
            <div className="grid grid-cols-2 gap-3">
              {afterPhotos.map((p) => <img key={p.id} src={p.image_url} alt="after" className="h-32 w-full rounded-xl object-cover" />)}
            </div>
          </div>
        )}
      </section>
      <div className="absolute bottom-0 left-0 right-0 border-t border-gray-200 bg-white px-4 py-4">
        {nextAction === 'progress' && <button onClick={() => changeStatus('progress')} className="w-full rounded-2xl bg-yellow-500 px-4 py-4 font-bold text-white">처리 시작</button>}
        {nextAction === 'done' && <button onClick={() => setOverlay(true)} className="w-full rounded-2xl bg-green-600 px-4 py-4 font-bold text-white">완료 처리</button>}
        {!nextAction && <div className="rounded-2xl bg-gray-100 px-4 py-4 text-center font-bold text-gray-500">처리 완료됨</div>}
      </div>
      {overlay && (
        <div className="absolute inset-0 bg-black/40 flex items-end">
          <div className="w-full rounded-t-3xl bg-white p-4">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-gray-300" />
            <div className="mb-2 text-lg font-bold">완료 사진 등록</div>
            <div className="mb-4 text-sm text-gray-500">가능하면 완료 사진을 남겨주세요.</div>
            {preview ? <img src={preview} alt="complete" className="mb-3 h-44 w-full rounded-2xl object-cover" /> : <button onClick={() => fileRef.current?.click()} className="mb-3 flex h-40 w-full items-center justify-center rounded-2xl border-2 border-dashed border-gray-300 bg-gray-50 text-gray-500">📷 사진 촬영 / 선택</button>}
            <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (!file) return; setPhoto(file); setPreview(URL.createObjectURL(file)); }} />
            <button onClick={() => changeStatus('done')} className="w-full rounded-2xl bg-green-600 px-4 py-4 font-bold text-white">완료 저장</button>
            <button onClick={() => setOverlay(false)} className="mt-2 w-full rounded-2xl bg-gray-100 px-4 py-3 font-semibold text-gray-600">취소</button>
          </div>
        </div>
      )}
    </main>
  );
}
