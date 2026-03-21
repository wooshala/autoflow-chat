/**
 * Soft delete 점검: 컬럼 존재, service vs anon PATCH
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
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    env[t.slice(0, i).trim()] = v;
  }
  return env;
}

async function main() {
  const env = loadEnvLocal();
  const base = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "");
  const service = env.SUPABASE_SERVICE_ROLE_KEY;
  const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const hSvc = { apikey: service, Authorization: `Bearer ${service}` };
  const hAnon = { apikey: anon, Authorization: `Bearer ${anon}` };

  console.log("=== 1) 컬럼 존재 (REST GET) ===\n");
  const r = await fetch(`${base}/rest/v1/chat_messages?select=id,is_deleted,deleted_at,sender_side&limit=1`, {
    headers: hSvc,
  });
  const t = await r.text();
  console.log("GET status:", r.status);
  console.log("GET body:", t.slice(0, 600));
  if (!r.ok) {
    console.error("\n컬럼 없음 또는 PostgREST 오류 → SQL 재실행 / schema reload 확인");
    process.exit(1);
  }

  console.log("\n=== 2) UPDATE (service role = 일반적으로 RLS 우회) ===\n");
  const q = await fetch(`${base}/rest/v1/chat_messages?select=id,user_id,is_deleted&is_deleted=eq.false&limit=1`, {
    headers: hSvc,
  });
  const rows = await q.json();
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) {
    console.log("is_deleted=false 인 행 없음 — PATCH 스킵");
    return;
  }
  const patch = { is_deleted: true, deleted_at: new Date().toISOString() };
  const u = await fetch(`${base}/rest/v1/chat_messages?id=eq.${row.id}`, {
    method: "PATCH",
    headers: { ...hSvc, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(patch),
  });
  const ub = await u.text();
  console.log("PATCH(service) status:", u.status);
  console.log("PATCH(service) body:", ub.slice(0, 400));
  await fetch(`${base}/rest/v1/chat_messages?id=eq.${row.id}`, {
    method: "PATCH",
    headers: { ...hSvc, "Content-Type": "application/json" },
    body: JSON.stringify({ is_deleted: false, deleted_at: null }),
  });
  console.log("→ 테스트 행 원복 완료\n");

  console.log("=== 3) anon key로 PATCH 시도 (JWT 없음 = RLS 적용 시 실패 가능) ===\n");
  const u2 = await fetch(`${base}/rest/v1/chat_messages?id=eq.${row.id}`, {
    method: "PATCH",
    headers: { ...hAnon, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({ is_deleted: true, deleted_at: new Date().toISOString() }),
  });
  const u2b = await u2.text();
  console.log("PATCH(anon, no user JWT) status:", u2.status);
  console.log("PATCH(anon) body:", u2b.slice(0, 400));
  console.log(
    "(참고) 서버 API는 SUPABASE_SERVICE_ROLE_KEY 사용 시 RLS를 우회합니다. anon만으로 실패하는 것은 정상일 수 있습니다.\n"
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
