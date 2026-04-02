const BASE = "http://localhost:3000";

async function safeJson(res) {
  const raw = await res.text();
  return {
    raw,
    json: raw ? JSON.parse(raw) : null
  };
}

async function run() {
  console.log("TEST 1: create maintenance ticket");

  const ticketRes = await fetch(`${BASE}/api/maintenance/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      room_no: "999",
      issue_type: "설비",
      description: "API 자동 테스트",
      created_by: "61622137-1e31-4e58-8c32-6c6ac8"
    })
  });

  const ticketParsed = await safeJson(ticketRes);
  console.log("TEST 1 status:", ticketRes.status, ticketRes.statusText);
  console.log("TEST 1 raw:", ticketParsed.raw);

  if (!ticketRes.ok || !ticketParsed.json) {
    console.log("FAIL: ticket create");
    return;
  }

  const ticketId = ticketParsed.json.ticket.id;
  console.log("PASS: ticket created", ticketId);

  console.log("TEST 2: send chat message (multipart envelope)");

  const fd = new FormData();
  fd.append("user_id", "61622137-1e31-4e58-8c32-6c6ac8");
  fd.append("message", "자동 테스트 메시지");
  fd.append("ticket_id", ticketId);

  const chatRes = await fetch(`${BASE}/api/chat/send`, {
    method: "POST",
    body: fd
  });

  const chatParsed = await safeJson(chatRes);
  console.log("TEST 2 status:", chatRes.status, chatRes.statusText);
  console.log("TEST 2 raw:", chatParsed.raw);

  if (!chatRes.ok || !chatParsed.json?.ok) {
    console.log("FAIL: chat send");
    return;
  }

  const saved = chatParsed.json.data?.message;
  if (!saved?.id) {
    console.log("FAIL: envelope data.message missing");
    return;
  }

  console.log("PASS: message saved", saved.id);

  console.log("TEST 3: query ticket messages (envelope)");

  const listRes = await fetch(`${BASE}/api/chat/list?ticket_id=${encodeURIComponent(ticketId)}`);
  const listRaw = await listRes.text();

  console.log("TEST 3 status:", listRes.status, listRes.statusText);
  console.log("TEST 3 raw:", listRaw);

  let listJson = null;
  try {
    listJson = listRaw ? JSON.parse(listRaw) : null;
  } catch (e) {
    console.log("FAIL: TEST 3 response is not valid JSON");
    return;
  }

  if (!listRes.ok || !listJson?.ok) {
    console.log("FAIL: list query", listJson);
    return;
  }

  const messages = listJson.data?.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    console.log("FAIL: no messages returned", listJson);
    return;
  }

  console.log("PASS: ticket query success");
  console.log("RESULT: PASS");
}

run().catch((err) => {
  console.error("FAIL: unexpected error", err);
});
