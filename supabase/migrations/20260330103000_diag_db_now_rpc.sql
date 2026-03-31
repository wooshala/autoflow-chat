-- Diagnostic RPC: return DB now() to compare perceived DB time between routes.

create or replace function public.diag_db_now()
returns timestamptz
language sql
stable
as $$
  select now();
$$;

comment on function public.diag_db_now()
is 'Diagnostic: returns now() from DB.';

