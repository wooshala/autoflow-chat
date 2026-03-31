-- Diagnostic RPC: compare Data API list vs DB execution via RPC.
-- Purpose: return the same "top-N by created_at desc" ids from inside Postgres.
-- This is used to determine if the issue is in the PostgREST/Data API layer vs DB ordering itself.

create or replace function public.diag_chat_list_top(p_limit integer default 50)
returns table (id uuid, created_at timestamptz)
language sql
stable
as $$
  select m.id, m.created_at
  from public.chat_messages m
  order by m.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

comment on function public.diag_chat_list_top(integer)
is 'Diagnostic: top-N chat_messages by created_at desc (id, created_at).';

