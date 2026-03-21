import { createClient as createSupabaseClient, SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;
let createClientCallCount = 0;

export function createClient(): SupabaseClient {
  createClientCallCount += 1;
  if (browserClient) {
    if (typeof window !== "undefined") {
      console.log("[SUPABASE_BROWSER_CLIENT_GET]", {
        call_count: createClientCallCount,
        reused: true
      });
    }
    return browserClient;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
  browserClient = createSupabaseClient(url, key);
  if (typeof window !== "undefined") {
    let host = url;
    try {
      host = new URL(url).host;
    } catch {
      /* ignore */
    }
    console.log("[SUPABASE_BROWSER_CLIENT_NEW_INSTANCE]", {
      call_count: createClientCallCount,
      url_host: host,
      new_instance_count: 1
    });
  }
  return browserClient;
}