/**
 * .env.local 기준으로 chat_messages에 is_deleted, deleted_at 컬럼 존재 여부 확인
 * 사용: node scripts/verify-chat-columns.mjs
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
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return env;
}

async function main() {
  const env = loadEnvLocal();
  const base = env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) {
    console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요");
    process.exit(1);
  }
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
  };
  const url = `${base}/rest/v1/chat_messages?select=id,is_deleted,deleted_at&limit=1`;
  const res = await fetch(url, { headers });
  const text = await res.text();
  if (!res.ok) {
    console.error("[FAIL] REST", res.status, text);
    if (text.includes("is_deleted") || text.includes("column")) {
      console.error("\n→ Supabase SQL Editor에서 실행: sql/add_chat_soft_delete_columns.sql");
    }
    process.exit(1);
  }
  console.log("[OK] is_deleted, deleted_at 컬럼 조회 성공");
  console.log(text.slice(0, 400));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
