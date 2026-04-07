"use client";

import { useState } from "react";
import { fetchEnvelope } from "@/lib/api/envelope";
import { unwrapChatSendEnvelopeData } from "@/lib/api/unwrapChatSendResponse";
import { TIMEOUT_MS_CHAT_SEND } from "@/lib/api/timeouts";
import { CHAT_SEND_URL } from "@/lib/chatApi";
import type { ChatMessage } from "@/lib/types";
import { loadUser, resolveChatSendUserId } from "@/lib/auth";
import { createTaggedLogger } from "@/lib/logger";

const tlog = createTaggedLogger("[CHAT_INPUT]");

function getOrCreateDeviceId(): string {
  try {
    const key = "autoflow_device_id";
    const existing = typeof window !== "undefined" ? window.localStorage.getItem(key) : null;
    if (existing) return existing;
    const generated = `dev-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    if (typeof window !== "undefined") window.localStorage.setItem(key, generated);
    return generated;
  } catch {
    return "dev-fallback";
  }
}

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
    tlog.debug({
      event: "send_submit_start",
      hasMessage: Boolean(message.trim()),
      hasFile: Boolean(file),
      submitting,
    });
    if (submitting) {
      tlog.debug({ event: "send_submit_blocked", reason: "already_submitting" });
      return;
    }
    if (!message.trim() && !file) return;
    const userId = resolveChatSendUserId();
    if (!userId) {
      alert("전송에 실패했습니다. 관리자 설정이 필요합니다.");
      return;
    }
    setSubmitting(true);

    try {
      const formData = new FormData();

      formData.append("ticket_id", ticketId);
      formData.append("room_no", roomNo);
      formData.append("message", message);
      formData.append("user_id", userId);
      const actor = loadUser()?.name?.trim();
      if (actor) formData.append("actor_name", actor);

      const clientRequestId = (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`).toString();
      formData.append("client_request_id", clientRequestId);
      formData.append("client_device_id", getOrCreateDeviceId());

      if (file) {
        tlog.debug({
          event: "chat_file_append",
          name: file.name,
          size: file.size,
          type: file.type,
        });
        formData.append("image", file);
      }

      const result = await fetchEnvelope<{ message: ChatMessage }>(CHAT_SEND_URL, {
        method: "POST",
        body: formData,
        timeoutMs: TIMEOUT_MS_CHAT_SEND,
      });

      if (!result.ok) {
        tlog.error({ event: "chat_send_client_error", error: result.error, message: result.message });
        alert("전송에 실패했습니다. 잠시 후 다시 시도해 주세요.");
        return;
      }

      const saved = unwrapChatSendEnvelopeData(result.data);
      if (!saved) {
        tlog.error({ event: "chat_send_abnormal_response", data: result.data });
        alert("채팅 응답이 비정상입니다.");
        return;
      }
      tlog.info({ event: "send_response_ok", message_id: saved.id });

      setMessage("");
      setFile(null);
      location.reload();
    } catch (e: any) {
      tlog.error({ event: "chat_send_client_error", error: e?.message || String(e) });
      alert("전송에 실패했습니다. 잠시 후 다시 시도해 주세요.");
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
            void sendMessage();
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
      <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} style={{ marginLeft: 8 }} />

      {file && (
        <span style={{ marginLeft: 8, fontSize: 12 }}>
          {file.name}
        </span>
      )}

      <button
        type="button"
        onClick={() => {
          tlog.debug({ event: "send_click", submitting });
          void sendMessage();
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
