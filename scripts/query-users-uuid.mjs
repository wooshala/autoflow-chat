import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadDotEnvLocal(path = ".env.local") {
  const txt = fs.readFileSync(path, "utf8");
  for (const line of txt.split(/\r?\n/)) {
    if (!line) continue;
    if (/^\s*#/.test(line)) continue;
    const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (!m) continue;
    const key = m[1];
    let value = m[2] ?? "";
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadDotEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Missing env", { hasUrl: Boolean(url), hasServiceKey: Boolean(serviceKey) });
  process.exit(1);
}

const sb = createClient(url, serviceKey);
const { data, error } = await sb
  .from("users")
  .select("id,name,role,language,created_at")
  .order("created_at", { ascending: true })
  .limit(20);

if (error) {
  console.error("ERROR", error.message);
  process.exit(2);
}

console.log(JSON.stringify(data, null, 2));

