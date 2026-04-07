/**
 * front-ops/page.tsx 필터와 동일한 파이프라인으로 DB 상위 100건을 평가.
 * 사용: node scripts/front-ops-zero-stage.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MOBILE_WINDOW_MS = 48 * 60 * 60 * 1000;

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

function main() {
  const env = loadEnvLocal();
  if (!env?.NEXT_PUBLIC_SUPABASE_URL || !env?.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing .env.local or NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  const base = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "");
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    Accept: "application/json"
  };

  return fetch(
    `${base}/rest/v1/chat_messages?select=id,sender_side,created_at,is_deleted,message,room_no,message_type,image_url&order=created_at.desc&limit=100`,
    { headers }
  )
    .then((r) => r.json())
    .then((msgs) => {
      if (!Array.isArray(msgs)) {
        console.error("[FAIL] expected array", msgs);
        process.exit(1);
      }
      const total = msgs.length;
      const sorted = [...msgs].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      const now = Date.now();

      console.log(
        "[FRONT_OPS_RAW_MESSAGES]",
        sorted.slice(0, 5).map((m) => ({
          id: m.id,
          sender_side: m.sender_side,
          created_at: m.created_at,
          is_deleted: m.is_deleted,
          message: typeof m.message === "string" ? m.message.slice(0, 80) : m.message,
          room_no: m.room_no
        }))
      );

      const baseRows = sorted.filter((m) => Boolean(m?.id) && !m.is_deleted);
      const mobileOnly = {
        before: baseRows.length,
        after: baseRows.filter((m) => m.sender_side === "mobile").length
      };
      const mobileMsgs = baseRows.filter((m) => m.sender_side === "mobile");
      const recent2h = {
        before: mobileMsgs.length,
        after: mobileMsgs.filter((m) => {
          const createdMs = new Date(String(m.created_at || "")).getTime();
          return Number.isFinite(createdMs) && now - createdMs <= MOBILE_WINDOW_MS;
        }).length
      };
      const recentMobileMsgs = mobileMsgs.filter((m) => {
        const createdMs = new Date(String(m.created_at || "")).getTime();
        return Number.isFinite(createdMs) && now - createdMs <= MOBILE_WINDOW_MS;
      });
      const afterMaintenance = recentMobileMsgs.filter(
        (m) => !(m.message_type === "maintenance" && /^🔧/.test(String(m.message || "").trim()))
      );
      let roomKindParseFail = 0;
      for (const m of afterMaintenance) {
        const rf = normalizeRoomNo(m.room_no);
        const rt = rf ? null : extractRoomFromText(String(m.message || ""));
        if (!rf && !rt) roomKindParseFail += 1;
      }
      const parsedCards = { eligible: afterMaintenance.length, roomKindParseFail };

      const filterAudit = sorted.slice(0, 20).map((m) => {
        const createdMs = new Date(String(m.created_at || "")).getTime();
        const within2h = Number.isFinite(createdMs) && now - createdMs <= MOBILE_WINDOW_MS;
        const roomFromField = normalizeRoomNo(m.room_no);
        const roomFromText = roomFromField ? null : extractRoomFromText(String(m.message || ""));
        const { kind, label } = parseWorkKind(m);
        const maintenanceSkip =
          m.message_type === "maintenance" && /^🔧/.test(String(m.message || "").trim());
        return {
          id: m.id,
          sender_side: m.sender_side,
          created_at: m.created_at,
          checks: {
            hasId: Boolean(m?.id),
            notDeleted: !m.is_deleted,
            isMobile: m.sender_side === "mobile",
            within2h,
            notMaintenanceAuto: !maintenanceSkip,
            hasRoom: Boolean(roomFromField || roomFromText),
            kind,
            label,
            createdMsOk: Number.isFinite(createdMs),
            ageMs: Number.isFinite(createdMs) ? now - createdMs : null
          }
        };
      });
      console.log("[FRONT_OPS_FILTER_AUDIT]", JSON.stringify(filterAudit, null, 0));

      const parseFailSamples = [];
      for (const m of afterMaintenance) {
        if (parseFailSamples.length >= 10) break;
        const rf = normalizeRoomNo(m.room_no);
        const rt = rf ? null : extractRoomFromText(String(m.message || ""));
        if (rf || rt) continue;
        const { kind, label } = parseWorkKind(m);
        parseFailSamples.push({
          id: m.id,
          sender_side: m.sender_side,
          message: String(m.message || "").slice(0, 120),
          kind,
          kindLabel: label
        });
      }
      if (parseFailSamples.length) console.log("[FRONT_OPS_PARSE_FAIL_SAMPLE]", parseFailSamples);

      const map = {};
      const prevActiveByRoomKind = new Map();
      const included = new Set();
      const nextCards = [];
      const beforeDedupEntries = [];
      for (const m of sorted) {
        if (!m?.id) continue;
        if (m.is_deleted) continue;
        if (m.sender_side !== "mobile") continue;
        const createdMs = new Date(String(m.created_at || "")).getTime();
        if (!Number.isFinite(createdMs) || now - createdMs > MOBILE_WINDOW_MS) continue;
        if (m.message_type === "maintenance" && /^🔧/.test(String(m.message || "").trim())) continue;

        const roomFromField = normalizeRoomNo(m.room_no);
        const roomFromText = roomFromField ? null : extractRoomFromText(String(m.message || ""));
        const room = roomFromField || roomFromText;
        const { kind, label } = parseWorkKind(m);
        const roomKindKey = `${normalizeRoomNo(room) || "none"}:${kind}`;
        if (beforeDedupEntries.length < 20) beforeDedupEntries.push({ messageId: String(m.id), roomKindKey });
        const prev = prevActiveByRoomKind.get(roomKindKey);
        if (prev && prev.status !== "done") {
          if (!included.has(prev.key)) {
            included.add(prev.key);
            nextCards.push(prev);
          }
          continue;
        }
        const key = String(m.id);
        const st = map[key] || "new";
        if (nextCards.some((c) => `${normalizeRoomNo(c.roomNo) || "none"}:${c.kind}` === roomKindKey && c.status !== "done")) {
          continue;
        }
        nextCards.push({
          key,
          messageId: String(m.id),
          roomNo: room,
          label,
          kind,
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

      console.log("[FRONT_OPS_DEDUP_KEYS_BEFORE]", beforeDedupEntries.slice(0, 20));
      console.log(
        "[FRONT_OPS_DEDUP_KEYS_AFTER]",
        nextCards.slice(0, 20).map((c) => ({
          key: `${normalizeRoomNo(c.roomNo) || "none"}:${c.kind}`,
          cardKey: c.key,
          status: c.status
        }))
      );

      const mobileOnlyAfter = mobileOnly.after;
      const recent2hAfter = recent2h.after;
      const eligibleAfter = parsedCards.eligible;
      let stage = "ok";
      if (total === 0) stage = "total";
      else if (mobileOnlyAfter === 0) stage = "mobileOnly";
      else if (recent2hAfter === 0) stage = "recent2h";
      else if (eligibleAfter === 0) stage = "parsedCards_eligible";
      else if (afterDedup === 0) stage = "afterDedup";
      else if (visible === 0) stage = "visible";

      console.log("[FRONT_OPS_ZERO_STAGE]", {
        stage,
        total,
        mobileOnlyAfter,
        recent2hAfter,
        eligibleAfter,
        roomKindParseFail: parsedCards.roomKindParseFail,
        afterDedup,
        visible,
        showDone,
        doneCount,
        notDoneCount
      });

      const distinctSides = [...new Set(sorted.map((m) => m.sender_side ?? "(null/undefined)"))];
      console.log("[DIAG_DISTINCT_SENDER_SIDE_IN_100]", distinctSides);
    });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
