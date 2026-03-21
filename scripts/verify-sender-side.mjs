/**
 * 1) REST로 sender_side 컬럼 존재 여부 확인
 * 2) 컬럼이 있으면 localhost /api/chat/send 로 pc·mobile 각 1건 전송 후 목록 확인
 * 사용: node scripts/verify-sender-side.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnvLocal() {
  const p = path.join(__dirname, "..", ".env.local");
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

async function main() {
  const env = loadEnvLocal();
  const base = env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !serviceKey) {
    console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing in .env.local");
    process.exit(1);
  }

  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  };

  const colUrl = `${base}/rest/v1/chat_messages?select=id,sender_side&limit=1`;
  const colRes = await fetch(colUrl, { headers });
  const colText = await colRes.text();
  if (!colRes.ok) {
    console.error("[sender_side column check] HTTP", colRes.status, colText);
    if (colText.includes("sender_side") && colText.includes("does not exist")) {
      console.error("\n→ Supabase SQL Editor에서 실행: supabase/migrations/20250320120000_add_sender_side.sql");
    }
    process.exit(1);
  }
  console.log("[OK] sender_side column exists (REST select succeeded)");

  const usersUrl = `${base}/rest/v1/users?select=id&limit=1`;
  const usersRes = await fetch(usersUrl, { headers });
  const usersJson = await usersRes.json();
  if (!usersRes.ok || !Array.isArray(usersJson) || !usersJson[0]?.id) {
    console.error("[FAIL] could not fetch a user id", usersRes.status, usersJson);
    process.exit(1);
  }
  const userId = usersJson[0].id;

  const appBase = "http://localhost:3000";
  async function send(side, label) {
    const fd = new FormData();
    fd.set("user_id", userId);
    fd.set("message", `[verify-sender-side] ${label} ${new Date().toISOString()}`);
    fd.set("sender_side", side);
    const r = await fetch(`${appBase}/api/chat/send`, { method: "POST", body: fd });
    const text = await r.text();
    let j = null;
    try {
      j = text ? JSON.parse(text) : null;
    } catch {
      /* ignore */
    }
    return { ok: r.ok, status: r.status, json: j, raw: text };
  }

  console.log("\nSending PC + mobile via", appBase, "...");
  const pc = await send("pc", "PC");
  const mo = await send("mobile", "MOBILE");
  console.log("PC send:", pc.status, pc.json?.message?.sender_side ?? pc.raw?.slice?.(0, 200));
  console.log("MOBILE send:", mo.status, mo.json?.message?.sender_side ?? mo.raw?.slice?.(0, 200));

  if (!pc.ok || !mo.ok) {
    console.error("\n→ Next dev 서버가 켜져 있는지 확인 (npm run dev)");
    process.exit(1);
  }

  const lastUrl = `${base}/rest/v1/chat_messages?select=id,sender_side,message,created_at&user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc&limit=5`;
  const lastRes = await fetch(lastUrl, { headers });
  const rows = await lastRes.json();
  console.log("\n[last 5 messages for user, REST]");
  console.log(JSON.stringify(rows, null, 2));

  console.log("\n채팅 화면에서 sender_side / mySide 정렬 확인");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
