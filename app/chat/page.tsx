'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Navigation from '@/components/Navigation';
import { ChatMessage, ISSUE_TYPES, ISSUE_UI, IssueType, User } from '@/lib/types';

function translated(msg: ChatMessage, lang: string) {
  return msg.translated_text?.[lang as keyof typeof msg.translated_text] || msg.message;
}

export default function ChatPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [roomNo, setRoomNo] = useState('');
  const [keypadOpen, setKeypadOpen] = useState(false);
  const [keypadNum, setKeypadNum] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [showMaintenance, setShowMaintenance] = useState(false);
  const [issueType, setIssueType] = useState<IssueType>('설비');
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const raw = localStorage.getItem('autoflow_user');
    if (!raw) { router.push('/'); return; }
    setUser(JSON.parse(raw));
  }, [router]);

  async function load() {
    const res = await fetch('/api/chat/list');
    const data = await res.json();
    setMessages(data.messages || []);
  }

  useEffect(() => { load(); }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, preview, showMaintenance]);

  const canSend = useMemo(() => Boolean(text.trim() || photo), [text, photo]);

  async function sendMessage() {
    if (!user || !canSend || submitting) return;
    setSubmitting(true);
    try {
      let image_url: string | null = null;
      let image_storage_path: string | null = null;
      if (photo) {
        const fd = new FormData();
        fd.append('file', photo);
        const upload = await fetch('/api/upload/image', { method: 'POST', body: fd });
        const up = await upload.json();
        image_url = up.image_url;
        image_storage_path = up.storage_path;
      }
const res = await fetch('/api/chat/send', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    user_id: user.id,
    message: text.trim() || '사진',
    message_type: photo ? 'image' : 'text',
    room_no: roomNo || null,
    image_url,
    image_storage_path
  })
});

const data = await res.json();

if (!res.ok) {
  alert(data?.error || '채팅 전송 실패');
  return;
}

if (!data?.message) {
  alert('채팅 응답이 비정상입니다.');
  return;
}

setMessages((prev) => [...prev, data.message]);
resetComposer();
    } finally {
      setSubmitting(false);
    }
  }

  async function submitMaintenance() {
    if (!user || !roomNo || submitting) return;
    setSubmitting(true);
    try {
      let image_url: string | null = null;
      let storage_path: string | null = null;
      if (photo) {
        const fd = new FormData();
        fd.append('file', photo);
        const upload = await fetch('/api/upload/image', { method: 'POST', body: fd });
        const up = await upload.json();
        image_url = up.image_url;
        storage_path = up.storage_path;
      }
   const desc = text.trim() || `${issueType} 문제 발생`;

const res = await fetch('/api/maintenance/create', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    room_no: roomNo,
    issue_type: issueType,
    description: desc,
    created_by: user.id,
    image_url: null,
    storage_path
  })
});
const data = await res.json();

if (!res.ok) {
  alert(data?.error || '유지보수 등록 실패');
  return;
}

if (data?.chat_message) {
  setMessages((prev) => [...prev, data.chat_message]);
}

setShowMaintenance(false);
resetComposer();
    } finally {
      setSubmitting(false);
    }
  }

  function resetComposer() {
    setText('');
    setPhoto(null);
    setPreview(null);
    setRoomNo('');
    setKeypadNum('');
    setShowMaintenance(false);
  }

  return (
    <main className="flex h-screen flex-col bg-gray-100">
      <header className="bg-white border-b border-gray-200 px-4 py-3 shrink-0">
        <div className="font-bold">AutoFlow 채팅</div>
        <div className="text-xs text-green-600">직원 협업 + 유지보수 등록</div>
      </header>

      <section className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.map((msg) => {
          const mine = msg.user_id === user?.id;
          const msgText = translated(msg, user?.language || 'ko');
          return (
            <div key={msg.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[78%] ${mine ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
                {!mine && <div className="text-[11px] text-gray-500 px-1">{msg.user?.name || '직원'}</div>}
                <div className={`${mine ? 'bg-blue-600 text-white' : 'bg-white text-gray-900'} rounded-2xl px-3 py-2 shadow-sm`}> 
                  {msg.room_no && <div className={`mb-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${mine ? 'bg-white/20 text-white' : 'bg-blue-50 text-blue-700'}`}>🏠 {msg.room_no}호</div>}
                  {msg.message_type === 'maintenance' && msg.ticket_id ? (
                    <button onClick={() => router.push(`/maintenance/${msg.ticket_id}`)} className="text-left">
                      <div className="font-bold">{msg.message}</div>
                      <div className="text-xs opacity-80 mt-1">상세 보기 →</div>
                    </button>
                  ) : (
                    <div className="whitespace-pre-wrap break-words text-sm">{msgText}</div>
                  )}
                  {msg.image_url && <img src={msg.image_url} alt="업로드" className="mt-2 h-40 w-full rounded-xl object-cover" />}
                </div>
                <div className="text-[10px] text-gray-400 px-1">{new Date(msg.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </section>

      {showMaintenance && (
        <div className="border-t border-gray-200 bg-white px-3 pt-3 pb-2">
          <div className="mb-2 text-xs font-bold text-gray-500">문제 유형</div>
          <div className="grid grid-cols-5 gap-2 mb-3">
            {ISSUE_TYPES.map((type) => (
              <button key={type} onClick={() => setIssueType(type)} className={`rounded-xl p-2 text-xs font-bold ${issueType === type ? ISSUE_UI[type].badge + ' ring-2 ring-blue-300' : 'bg-gray-100 text-gray-700'}`}>
                <div>{ISSUE_UI[type].emoji}</div>
                <div>{type}</div>
              </button>
            ))}
          </div>
          <button onClick={submitMaintenance} className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white">유지보수 등록</button>
        </div>
      )}

      <div className="bg-white border-t border-gray-200 px-3 py-3 shrink-0">
        <div className="mb-2 flex items-center gap-2">
          <button onClick={() => setKeypadOpen(true)} className={`rounded-full px-3 py-1.5 text-xs font-bold ${roomNo ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-gray-100 text-gray-500 border border-dashed border-gray-300'}`}>
            {roomNo ? `🏠 ${roomNo}호` : '🏠 객실 선택'}
          </button>
          {roomNo && <button onClick={() => setRoomNo('')} className="text-xs text-gray-400">초기화</button>}
          {photo && <span className="text-xs rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">사진 선택됨</span>}
          {!showMaintenance && (roomNo || photo) && <button onClick={() => setShowMaintenance(true)} className="ml-auto rounded-full bg-blue-600 px-3 py-1.5 text-xs font-bold text-white">🔧 유지보수</button>}
        </div>
        {preview && <img src={preview} alt="preview" className="mb-2 h-20 w-20 rounded-xl object-cover" />}
        <div className="flex items-end gap-2">
          <button onClick={() => fileRef.current?.click()} className="h-11 w-11 rounded-full bg-gray-100 text-xl">📷</button>
          <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="메시지를 입력하세요" rows={1} className="input min-h-[44px] max-h-24 resize-none" />
          <button disabled={!canSend || submitting} onClick={sendMessage} className="h-11 w-11 rounded-full bg-blue-600 text-white disabled:opacity-40">➤</button>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setPhoto(file);
            setPreview(URL.createObjectURL(file));
          }} />
        </div>
      </div>

      {keypadOpen && (
        <div className="absolute inset-0 bg-black/40 flex items-end">
          <div className="w-full rounded-t-3xl bg-white p-4">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-gray-300" />
            <div className="mb-3 text-sm font-bold">객실 번호 입력</div>
            <div className="mb-3 rounded-2xl bg-gray-100 px-4 py-3 text-3xl font-extrabold text-blue-700">{keypadNum || '-'}</div>
            <div className="grid grid-cols-3 gap-3">
              {['1','2','3','4','5','6','7','8','9'].map((n) => <button key={n} onClick={() => setKeypadNum((p) => (p + n).slice(0, 4))} className="h-14 rounded-2xl bg-gray-100 text-2xl font-semibold">{n}</button>)}
              <button onClick={() => setKeypadOpen(false)} className="h-14 rounded-2xl text-sm font-semibold text-gray-500">닫기</button>
              <button onClick={() => setKeypadNum((p) => (p + '0').slice(0, 4))} className="h-14 rounded-2xl bg-gray-100 text-2xl font-semibold">0</button>
              <button onClick={() => setKeypadNum((p) => p.slice(0, -1))} className="h-14 rounded-2xl text-xl">⌫</button>
            </div>
            <button onClick={() => { setRoomNo(keypadNum); setKeypadOpen(false); }} className="mt-3 w-full rounded-2xl bg-blue-600 px-4 py-3 font-bold text-white">확인</button>
          </div>
        </div>
      )}

      <Navigation active="chat" />
    </main>
  );
}
