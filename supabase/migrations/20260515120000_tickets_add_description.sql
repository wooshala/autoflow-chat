alter table public.tickets
  add column if not exists description text null;
