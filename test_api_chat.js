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

  console.log("TEST 2: send chat message");

  const chatRes = await fetch(`${BASE}/api/chat/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: "61622137-1e31-4e58-8c32-6c6ac8",
      message: "자동 테스트 메시지",
      message_type: "text",
      ticket_id: ticketId
    })
  });

  const chatParsed = await safeJson(chatRes);
  console.log("TEST 2 status:", chatRes.status, chatRes.statusText);
  console.log("TEST 2 raw:", chatParsed.raw);

  if (!chatRes.ok || !chatParsed.json) {
    console.log("FAIL: chat send");
    return;
  }

  console.log("PASS: message saved");

  console.log("TEST 3: query ticket messages");

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

  if (!listRes.ok) {
    console.log("FAIL: list query", listJson);
    return;
  }

  if (!listJson || !listJson.messages || listJson.messages.length === 0) {
    console.log("FAIL: no messages returned", listJson);
    return;
  }

  console.log("PASS: ticket query success");
  console.log("RESULT: PASS");
}

run().catch((err) => {
  console.error("FAIL: unexpected error", err);
});