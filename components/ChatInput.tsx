"use client";

import { useState } from "react";
import { CHAT_SEND_URL } from "@/lib/chatApi";

export default function ChatInput({
  ticketId,
  roomNo,
}: {
  ticketId: string;
  roomNo: string;
}) {
  const [message, setMessage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function sendMessage() {
    console.log("[SEND_SUBMIT_START]", { source: "ChatInput", hasMessage: Boolean(message.trim()), hasFile: Boolean(file), submitting });
    if (submitting) {
      console.log("[SEND_SUBMIT_BLOCKED_ALREADY_SUBMITTING]", { source: "ChatInput" });
      return;
    }
    if (!message.trim() && !file) return;
    setSubmitting(true);

    try {
const formData = new FormData();

formData.append("ticket_id", ticketId);
formData.append("room_no", roomNo);
formData.append("message", message);
const raw = typeof window !== "undefined" ? localStorage.getItem("autoflow_user") : null;
const userId = raw ? (JSON.parse(raw)?.id as string | undefined) : undefined;
formData.append("user_id", userId || "u-front");

if (file) {
  console.log("[CHAT_FILE_APPEND]", {
    name: file.name,
    size: file.size,
    type: file.type
  });
  formData.append("image", file);
}

const res = await fetch(CHAT_SEND_URL, {
  method: "POST",
  body: formData,
});

if (!res.ok) {
  const data = await res.json().catch(() => null);
  console.error("[CHAT_SEND_CLIENT_ERROR]", data);
  alert("전송 실패: " + (data?.error || res.status));
  return;
}

const data = await res.json().catch(() => null);
console.log("[SEND_RESPONSE_OK]", { source: "ChatInput", message_id: data?.message?.id || null });

setMessage("");
setFile(null);
location.reload();

    } catch (e: any) {
      console.error("[CHAT_SEND_CLIENT_ERROR]", e);
      alert("fetch error: " + e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ marginTop: 20 }}>
<input
  value={message}
  onChange={(e) => setMessage(e.target.value)}
  onKeyDown={(e) => {
    if (e.key === "Enter") {
      sendMessage();
    }
  }}
  placeholder="메시지 입력..."
  style={{
    padding: 8,
    width: 300,
    border: "1px solid #ccc",
    borderRadius: 4,
  }}
/>
<input
  type="file"
  accept="image/*"
  onChange={(e) => setFile(e.target.files?.[0] || null)}
  style={{ marginLeft: 8 }}
/>

{file && (
  <span style={{ marginLeft: 8, fontSize: 12 }}>
    {file.name}
  </span>
)}


      <button
        type="button"
        onClick={() => {
          console.log("[SEND_CLICK]", { source: "ChatInput", submitting });
          sendMessage();
        }}
        disabled={submitting}
        style={{
          marginLeft: 8,
          padding: "8px 12px",
        }}
      >
        전송
      </button>
    </div>
  );
}
