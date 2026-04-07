/**
 * 동일 chat_messages 100건에 대해 시간 창만 바꿔 front-ops 파이프라인 지표 비교.
 * node scripts/front-ops-window-compare.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnvLocal() {
  const p = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(p)) return null;
  const txt = fs.readFileSync(p, "utf8");
  const env = {};
  for (const line of txt.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    env[k] = v;
  }
  return env;
}

function normalizeRoomNo(v) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const m = s.match(/\d{3,4}/);
  return m ? m[0] : null;
}

function extractRoomFromText(text) {
  const t = String(text || "");
  const m = t.match(/\b(\d{3,4})\b/);
  return m ? m[1] : null;
}

function parseWorkKind(msg) {
  const text = String(msg.message || "").trim();
  const lower = text.toLowerCase();
  const hasImage = Boolean(msg.image_url) || msg.message_type === "image";
  if (hasImage || /사진|photo|pic/.test(lower)) return { kind: "photo_report", label: "사진 보고" };
  if (/(청소\s*완료|청소완료|clean\s*done|완료했습니다|완료됨)/.test(lower))
    return { kind: "clean_done", label: "청소 완료" };
  if (/(수건|towel)/.test(lower)) return { kind: "towel_request", label: "수건 요청" };
  if (/(생수|물\b|워터|water)/.test(lower)) return { kind: "water_request", label: "생수/물 요청" };
  if (/(담배|냄새|smell|odor)/.test(lower)) return { kind: "smell_issue", label: "냄새 이슈" };
  if (/(고장|문제|차단기|냉장고|tv\b|hdmi|불\s*없|전원|작동\s*안|broken|issue)/.test(lower))
    return { kind: "maintenance_issue", label: "설비 이슈" };
  return { kind: "general", label: "일반" };
}

function evaluateWindow(sorted, now, windowMs, statusMap = {}) {
  const baseRows = sorted.filter((m) => Boolean(m?.id) && !m.is_deleted);
  const mobileOnlyAfter = baseRows.filter((m) => m.sender_side === "mobile").length;
  const mobileMsgs = baseRows.filter((m) => m.sender_side === "mobile");
  const recentMobileMsgs = mobileMsgs.filter((m) => {
    const createdMs = new Date(String(m.created_at || "")).getTime();
    return Number.isFinite(createdMs) && now - createdMs <= windowMs;
  });
  const recentWindowAfter = recentMobileMsgs.length;
  const afterMaintenance = recentMobileMsgs.filter(
    (m) => !(m.message_type === "maintenance" && /^🔧/.test(String(m.message || "").trim()))
  );
  let roomKindParseFail = 0;
  for (const m of afterMaintenance) {
    const rf = normalizeRoomNo(m.room_no);
    const rt = rf ? null : extractRoomFromText(String(m.message || ""));
    if (!rf && !rt) roomKindParseFail += 1;
  }
  const eligibleAfter = afterMaintenance.length;

  const prevActiveByRoomKind = new Map();
  const included = new Set();
  const nextCards = [];
  for (const m of sorted) {
    if (!m?.id) continue;
    if (m.is_deleted) continue;
    if (m.sender_side !== "mobile") continue;
    const createdMs = new Date(String(m.created_at || "")).getTime();
    if (!Number.isFinite(createdMs) || now - createdMs > windowMs) continue;
    if (m.message_type === "maintenance" && /^🔧/.test(String(m.message || "").trim())) continue;

    const roomFromField = normalizeRoomNo(m.room_no);
    const roomFromText = roomFromField ? null : extractRoomFromText(String(m.message || ""));
    const room = roomFromField || roomFromText;
    const { kind, label } = parseWorkKind(m);
    const roomKindKey = `${normalizeRoomNo(room) || "none"}:${kind}`;
    const prev = prevActiveByRoomKind.get(roomKindKey);
    if (prev && prev.status !== "done") {
      if (!included.has(prev.key)) {
        included.add(prev.key);
        nextCards.push(prev);
      }
      continue;
    }
    const key = String(m.id);
    const st = statusMap[key] || "new";
    if (nextCards.some((c) => `${normalizeRoomNo(c.roomNo) || "none"}:${c.kind}` === roomKindKey && c.status !== "done")) {
      continue;
    }
    nextCards.push({
      key,
      messageId: String(m.id),
      roomNo: room,
      label,
      kind,
      originalText: String(m.message || "").trim() || (m.message_type === "image" ? "(이미지)" : "(내용 없음)"),
      createdAt: String(m.created_at || ""),
      status: st
    });
  }
  nextCards.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const afterDedup = nextCards.length;
  const showDone = false;
  const visible = showDone ? nextCards.length : nextCards.filter((c) => c.status !== "done").length;
  const doneCount = nextCards.filter((c) => c.status === "done").length;
  const notDoneCount = nextCards.filter((c) => c.status !== "done").length;

  return {
    mobileOnlyAfter,
    recentWindowAfter,
    eligibleAfter,
    roomKindParseFail,
    afterDedup,
    visible,
    doneCount,
    notDoneCount,
    cards: nextCards
  };
}

async function main() {
  const env = loadEnvLocal();
  if (!env?.NEXT_PUBLIC_SUPABASE_URL || !env?.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing .env.local or keys");
    process.exit(1);
  }
  const base = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "");
  const headers = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    Accept: "application/json"
  };
  const r = await fetch(
    `${base}/rest/v1/chat_messages?select=id,sender_side,created_at,is_deleted,message,room_no,message_type,image_url&order=created_at.desc&limit=100`,
    { headers }
  );
  const msgs = await r.json();
  if (!Array.isArray(msgs)) {
    console.error(msgs);
    process.exit(1);
  }
  const sorted = [...msgs].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const now = Date.now();

  const windows = [
    { label: "2h", ms: 2 * 60 * 60 * 1000 },
    { label: "24h", ms: 24 * 60 * 60 * 1000 },
    { label: "48h", ms: 48 * 60 * 60 * 1000 }
  ];

  const table = [];
  let cards48 = [];
  for (const { label, ms } of windows) {
    const out = evaluateWindow(sorted, now, ms);
    if (label === "48h") cards48 = out.cards;
    table.push({
      window: label,
      mobileOnlyAfter: out.mobileOnlyAfter,
      recentWindowAfter: out.recentWindowAfter,
      eligibleAfter: out.eligibleAfter,
      afterDedup: out.afterDedup,
      visible: out.visible,
      doneCount: out.doneCount,
      notDoneCount: out.notDoneCount
    });
  }

  console.log("[FRONT_OPS_WINDOW_COMPARE]", JSON.stringify(table, null, 2));

  const samples = cards48.slice(0, 10).map((c) => {
    const createdMs = new Date(String(c.createdAt || "")).getTime();
    const ageHours = Number.isFinite(createdMs) ? (now - createdMs) / (60 * 60 * 1000) : null;
    return {
      room: c.roomNo,
      status: c.status,
      created_at: c.createdAt,
      ageHours: ageHours != null ? Math.round(ageHours * 10) / 10 : null,
      kind: c.kind,
      messagePreview: c.originalText.slice(0, 80)
    };
  });
  console.log("[FRONT_OPS_48H_CARD_SAMPLES]", JSON.stringify(samples, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
