import ChatInput from "@/components/ChatInput";
import ChatMessages from "@/components/ChatMessages";
import { formatKST } from "@/lib/formatKST";
import { getTicket as getMaintenanceTicket } from "@/lib/services/maintenance";
import { listChatMessagesByTicket } from "@/lib/services/chat";


interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function MaintenanceDetailPage({ params }: PageProps) {
  const { id } = await params;
  const ticket = await getMaintenanceTicket(id);
  if (!ticket) {
    throw new Error("티켓 조회 실패");
  }

  const messages = await listChatMessagesByTicket(ticket.id);

  return (
    <main style={{ padding: 24 }}>
      <h1>유지보수 상세 페이지</h1>

      <div style={{ marginTop: 16 }}>
        <p><strong>ID:</strong> {ticket.id}</p>
        <p><strong>객실:</strong> {ticket.room_no || '-'}</p>
        <p><strong>유형:</strong> {ticket.issue_type}</p>
        <p><strong>설명:</strong> {ticket.description || '-'}</p>
        <p><strong>상태:</strong> {ticket.status}</p>
        <p><strong>생성자:</strong> {ticket.creator?.name || ticket.created_by}</p>
        <p><strong>생성일:</strong> {ticket.created_at ? formatKST(ticket.created_at) : '-'}</p>
      </div>

      <div style={{ marginTop: 24 }}>
        <h2>사진</h2>
        {ticket.photos && ticket.photos.length > 0 ? (
          ticket.photos.map((photo) => (
            <div key={photo.id} style={{ marginTop: 12 }}>
              <p><strong>구분:</strong> {photo.photo_type}</p>
              <img
                src={photo.image_url}
                alt={photo.photo_type}
                style={{ width: 300, borderRadius: 8 }}
              />
            </div>
          ))
        ) : (
          <p>사진 없음</p>
        )}
      </div>
      <ChatMessages messages={messages} />

<ChatInput ticketId={ticket.id} roomNo={ticket.room_no || ""} />



    </main>
  );
}