-- Minimal repro schema (new Supabase project)
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid null,
  message text null,
  message_type text null,
  sender_side text null,
  room_no text null,
  ticket_id uuid null,
  duplicate_ticket_id uuid null,
  ai_action text null
);

-- Optional: allow service role to read/write regardless of RLS (service role bypasses RLS by default).
-- If you enable RLS for some reason, add policies accordingly.

