import { NextRequest } from 'next/server';
import { jsonOk, jsonErr } from '@/lib/api/envelope';
import { listChatMessages, listChatMessagesByTicket, listChatMessagesSince } from '@/lib/services/chat';
import { supabaseAdmin } from '@/lib/supabase';

// supabase-js uses fetch internally; without these, Next.js Data Cache caches the
// list query per URL (limit-keyed) and can serve a stale window (e.g. limit=500
// stuck on an old snapshot). Match the staff auth routes so chat reads are fresh.
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const DEBUG_VERBOSE = process.env.CHAT_DEBUG_VERBOSE === '1';

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function urlHost(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    return new URL(raw).host;
  } catch {
    return null;
  }
}

function logSupabaseEnvCtx(tag: string) {
  const publicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || null;
  const primaryUrl = process.env.SUPABASE_PRIMARY_URL || null;
  const chosenAdminUrl = primaryUrl || publicUrl;
  console.log(tag, {
    public_url_host: urlHost(publicUrl),
    primary_url_host: urlHost(primaryUrl),
    admin_chosen_url_host: urlHost(chosenAdminUrl),
    has_primary_url_env: Boolean(primaryUrl),
    has_service_role_key_env: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    has_anon_key_env: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    has_supabase_admin_client: Boolean(supabaseAdmin)
  });
}

function getAdminChosenUrlHost(): string | null {
  const publicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || null;
  const primaryUrl = process.env.SUPABASE_PRIMARY_URL || null;
  const chosenAdminUrl = primaryUrl || publicUrl;
  return urlHost(chosenAdminUrl);
}

export async function GET(req: NextRequest) {
  try {
    logSupabaseEnvCtx('[DIAG_SUPABASE_CTX_LIST]');
    const { searchParams } = new URL(req.url);
    const limit = Number(searchParams.get('limit') || '50');
    const ticketId = searchParams.get('ticket_id');
    const since = searchParams.get('since')?.trim() || null;
    if (DEBUG_VERBOSE) {
      console.log('[CHAT_LIST_REQUEST]', {
        limit,
        since: since || null,
        before: searchParams.get('before') || null,
        ticket_id: ticketId || null,
        query: searchParams.toString()
      });
    }

    // DB time probe (diagnostic only)
    try {
      if (supabaseAdmin) {
        const { data, error } = await supabaseAdmin.rpc('diag_db_now');
        console.log('[DB_NOW_LIST]', {
          db_now: data ?? null,
          admin_chosen_url_host: getAdminChosenUrlHost(),
          message_id: null,
          ok: !error,
          error: error ? (error as any).message || String(error) : null
        });
      } else {
        console.log('[DB_NOW_LIST]', {
          db_now: null,
          admin_chosen_url_host: getAdminChosenUrlHost(),
          message_id: null,
          ok: false,
          error: 'no_supabase_admin_client'
        });
      }
    } catch (e: any) {
      console.log('[DB_NOW_LIST]', {
        db_now: null,
        admin_chosen_url_host: getAdminChosenUrlHost(),
        message_id: null,
        ok: false,
        error: e?.message || String(e)
      });
    }
    console.log('[CHAT_LIST_API_START]', {
      limit,
      ticket_id: ticketId || null,
      since: since || null
    });

    // Step (2)(3)(4) probe: can we read the last sent message id right before list?
    const lastSent = (globalThis as any).__autoflowLastSentChatMessage as
      | { id?: string; created_at?: string; at_ms?: number }
      | undefined;
    const probeId = lastSent?.id ? String(lastSent.id) : '';
    const probeRecent = Boolean(lastSent?.at_ms && Date.now() - Number(lastSent.at_ms) < 5 * 60 * 1000);
    let probeIncludedInRawList: boolean | null = null;
    if (probeId && probeRecent && supabaseAdmin) {
      const sb = supabaseAdmin;
      const started = Date.now();
      const { data, error } = await sb
        .from('chat_messages')
        .select('id, created_at')
        .eq('id', probeId)
        .maybeSingle();
      console.log('[CHAT_LIST_PROBE_BY_ID]', {
        ok: Boolean(data && !error),
        probe_message_id: probeId,
        probe_created_at: (data as any)?.created_at ?? null,
        error: error ? (error as any).message || String(error) : null,
        duration_ms: Date.now() - started
      });

      // Compare "raw list" vs "embedded list" behavior using the SAME client.
      // This is a yes/no diagnostic for: query shape (select/embed) vs consistency/routing.
      const fetchRawList = async () => {
        const listStarted = Date.now();
        const { data: rawRows, error: rawErr } = await sb
          .from('chat_messages')
          .select('id, created_at')
          .order('created_at', { ascending: false })
          .limit(limit);
        const rawIds = (rawRows || []).map((r: any) => String(r?.id || '')).filter(Boolean);
        const rawNewest = (rawRows || [])[0]?.created_at ?? null;
        probeIncludedInRawList = rawIds.includes(probeId);
        console.log('[CHAT_LIST_PROBE_RAW_LIST]', {
          ok: !rawErr,
          probe_message_id: probeId,
          included_in_raw_list: probeIncludedInRawList,
          raw_list_newest_created_at: rawNewest,
          raw_list_count: rawIds.length,
          error: rawErr ? (rawErr as any).message || String(rawErr) : null,
          duration_ms: Date.now() - listStarted
        });
      };

      await fetchRawList();

      // Compare with RPC execution (POST) from inside Postgres.
      // If RPC shows the id but raw list doesn't, the difference is outside SQL semantics.
      const rpcStarted = Date.now();
      const { data: rpcRows, error: rpcErr } = await sb.rpc('diag_chat_list_top', {
        p_limit: limit
      });
      const rpcIds = (rpcRows || []).map((r: any) => String(r?.id || '')).filter(Boolean);
      console.log('[CHAT_LIST_PROBE_RPC_TOP]', {
        ok: !rpcErr,
        probe_message_id: probeId,
        included_in_rpc_top: rpcIds.includes(probeId),
        rpc_top_newest_created_at: (rpcRows || [])[0]?.created_at ?? null,
        rpc_top_count: rpcIds.length,
        error: rpcErr ? (rpcErr as any).message || String(rpcErr) : null,
        duration_ms: Date.now() - rpcStarted
      });

      // Guardrail: if a just-written id is readable by id but not in top-N list yet,
      // retry a few times (bounded) before serving the list.
      if (probeIncludedInRawList === false && !ticketId && !since) {
        const delays = [120, 220, 320];
        for (const d of delays) {
          console.log('[CHAT_LIST_FULL_RETRY_SCHEDULED]', { probe_message_id: probeId, delay_ms: d });
          await sleep(d);
          await fetchRawList();
          if (probeIncludedInRawList) break;
        }
        console.log('[CHAT_LIST_FULL_RETRY_DONE]', {
          probe_message_id: probeId,
          included_in_raw_list: probeIncludedInRawList
        });
      }
    } else {
      console.log('[CHAT_LIST_PROBE_BY_ID]', {
        ok: false,
        probe_message_id: probeId || null,
        skipped: true,
        reason: !probeId ? 'no_last_sent_message_id' : !probeRecent ? 'last_sent_too_old' : !supabaseAdmin ? 'no_supabase_admin_client' : 'unknown'
      });
    }

    const runQuery = async () => {
      return ticketId
        ? await listChatMessagesByTicket(ticketId, limit)
        : since
          ? await listChatMessagesSince(since, limit)
          : await listChatMessages(limit);
    };

    let messages = await runQuery();

    // If we had to retry raw list for consistency, rerun the actual list query too.
    if (!ticketId && !since && probeId && probeRecent && probeIncludedInRawList === true) {
      messages = await runQuery();
      console.log('[CHAT_LIST_RERUN_AFTER_RAW_LIST_VISIBLE]', { probe_message_id: probeId, ok: true });
    }

    // Temporary defense: merge server-side "recently saved rows" (send response is source of truth)
    // into full_table list results to reduce refresh misses when list reads are stale.
    if (!ticketId && !since) {
      const recent = (globalThis as any).__autoflowRecentSavedChatMessages as
        | { at_ms: number; message: any }[]
        | undefined;
      const now = Date.now();
      const TTL_MS = 10 * 60 * 1000;
      const candidates = Array.isArray(recent)
        ? recent.filter((x) => x && typeof x.at_ms === 'number' && now - x.at_ms <= TTL_MS).map((x) => x.message)
        : [];
      if (candidates.length > 0) {
        const byId = new Map<string, any>();
        for (const m of messages || []) {
          if (m?.id) byId.set(String(m.id), m);
        }
        let added = 0;
        for (const m of candidates) {
          const id = m?.id ? String(m.id) : '';
          if (!id) continue;
          if (!byId.has(id)) {
            byId.set(id, m);
            added += 1;
          }
        }
        if (added > 0) {
          const merged = Array.from(byId.values()).sort((a, b) =>
            String(b?.created_at || '').localeCompare(String(a?.created_at || ''))
          );
          messages = merged.slice(0, limit);
          console.log('[CHAT_LIST_SERVER_MERGE_RECENT_SAVED]', {
            ok: true,
            added,
            merged_count: messages.length,
            limit
          });
        } else {
          console.log('[CHAT_LIST_SERVER_MERGE_RECENT_SAVED]', { ok: true, added: 0 });
        }
      } else {
        console.log('[CHAT_LIST_SERVER_MERGE_RECENT_SAVED]', { ok: false, skipped: true, reason: 'no_recent_candidates' });
      }
    }

    // If the project is using a read-replica / load balancer URL for GETs,
    // replication lag can cause empty delta reads immediately after writes or restores.
    // A tiny retry is a pragmatic guardrail.
    if (!ticketId && since && (messages || []).length === 0) {
      const retryMs = 200;
      console.log('[CHAT_LIST_SINCE_EMPTY_RETRY_SCHEDULED]', { since, limit, retry_ms: retryMs });
      await sleep(retryMs);
      messages = await runQuery();
      console.log('[CHAT_LIST_SINCE_EMPTY_RETRY_DONE]', { since, limit, count: (messages || []).length });
    }

    const rows = messages || [];
    const scope = ticketId ? 'ticket' : since ? 'since_delta' : 'full_table';
    if (DEBUG_VERBOSE) {
      const first = rows[0]
        ? {
            id: rows[0]?.id ?? null,
            created_at: rows[0]?.created_at ?? null,
            text: String(rows[0]?.message ?? '').slice(0, 40),
            room_no: (rows[0] as any)?.room_no ?? null
          }
        : null;
      const last = rows.length
        ? {
            id: rows[rows.length - 1]?.id ?? null,
            created_at: rows[rows.length - 1]?.created_at ?? null,
            text: String(rows[rows.length - 1]?.message ?? '').slice(0, 40),
            room_no: (rows[rows.length - 1] as any)?.room_no ?? null
          }
        : null;
      console.log('[CHAT_LIST_RESULT_SUMMARY]', {
        scope,
        count: rows.length,
        first,
        last,
        last5: rows.slice(-5).map((m: any) => ({
          id: m?.id ?? null,
          created_at: m?.created_at ?? null,
          text: String(m?.message ?? '').slice(0, 40),
          room_no: m?.room_no ?? null
        }))
      });
      console.log('[CHAT_LIST_ORDER_CHECK]', {
        scope,
        first_created_at: rows[0]?.created_at ?? null,
        last_created_at: rows[rows.length - 1]?.created_at ?? null
      });
    }
    if (probeId && probeRecent) {
      const included = rows.some((m: any) => String(m?.id || '') === probeId);
      console.log('[CHAT_LIST_CONTAINS_PROBE_ID]', {
        ok: true,
        probe_message_id: probeId,
        included_in_list: included,
        scope,
        limit,
        since: since || null,
        ticket_id: ticketId || null
      });
    } else {
      console.log('[CHAT_LIST_CONTAINS_PROBE_ID]', {
        ok: false,
        probe_message_id: probeId || null,
        skipped: true
      });
    }
    console.log('[CHAT_LIST_RESPONSE_DIAGNOSTIC]', {
      scope,
      limit,
      since: since || null,
      ticket_id: ticketId || null,
      count: rows.length,
      ids: rows.map((m: any) => m?.id ?? null),
      created_ats: rows.map((m: any) => m?.created_at ?? null),
      user_ids: rows.map((m: any) => m?.user_id ?? null),
      newest_created_at: rows[0]?.created_at ?? null,
      oldest_in_page_created_at: rows[rows.length - 1]?.created_at ?? null,
      query_shape:
        scope === 'full_table'
          ? 'chat_messages: no WHERE | ORDER BY created_at DESC | LIMIT ' + limit
          : scope === 'since_delta'
            ? 'chat_messages: created_at > since | ORDER BY created_at DESC | LIMIT ' + limit
            : 'chat_messages: ticket_id = ? | ORDER BY created_at DESC | LIMIT ' + limit
    });

    const latest5 = (messages || []).slice(-5).map((m: any) => ({
      id: m?.id || null,
      message: m?.message || '',
      created_at: m?.created_at || null,
      user_id: m?.user_id || null
    }));
    console.log('[CHAT_LIST_RESPONSE_LAST_IDS]', {
      limit,
      ticket_id: ticketId || null,
      ids: (messages || []).slice(-5).map((m: any) => m?.id || null)
    });
    console.log('[CHAT_LIST_API_RESULT]', {
      limit,
      ticket_id: ticketId || null,
      count: messages?.length || 0,
      latest5
    });

    return jsonOk({ messages });
  } catch (error: any) {
    const message = error?.message || '채팅 목록 조회 실패';
    return jsonErr('CHAT_LIST_FAILED', message, 500);
  }
}