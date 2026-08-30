-- IMAGE-CHAT-01A hardening — true DB transaction for message + attachments + token consume.
-- Additive: extends pending_uploads with message_id provenance; does NOT alter guest_chat_messages.

alter table public.guest_chat_pending_uploads
  add column if not exists message_id uuid null
  references public.guest_chat_messages(id) on delete set null;

create index if not exists guest_chat_pending_uploads_message_idx
  on public.guest_chat_pending_uploads (message_id)
  where message_id is not null;

-- Abandoned/interrupted claims (legacy pre-RPC rows only; RPC sets consumed_at + message_id atomically).
create index if not exists guest_chat_pending_uploads_abandoned_idx
  on public.guest_chat_pending_uploads (consumed_at)
  where consumed_at is not null and message_id is null;

comment on column public.guest_chat_pending_uploads.message_id is
  'Set atomically with consumed_at when pending upload is linked to a message. NULL + consumed_at => abandoned (pre-RPC or manual).';

-- Single-transaction message creation for attachment sends only (text-only keeps appendMessage()).
create or replace function public.create_guest_message_with_attachments(
  p_channel_key       text,
  p_session_id        uuid,
  p_sender            text,
  p_original_text     text,
  p_original_lang     text,
  p_translated_json   jsonb,
  p_staff_user_id     uuid,
  p_upload_token_ids  uuid[],
  p_ttl_minutes       integer default 60
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_message     guest_chat_messages%rowtype;
  v_attachment  guest_chat_attachments%rowtype;
  v_pending     guest_chat_pending_uploads%rowtype;
  v_token       uuid;
  v_idx         integer;
  v_token_count integer;
  v_attachments jsonb := '[]'::jsonb;
  v_ttl         interval;
begin
  if p_sender not in ('guest', 'staff') then
    raise exception 'INVALID_SENDER' using errcode = 'P0001';
  end if;

  v_token_count := coalesce(array_length(p_upload_token_ids, 1), 0);
  if v_token_count < 1 or v_token_count > 5 then
    raise exception 'INVALID_TOKEN' using errcode = 'P0001';
  end if;

  if (select count(distinct t) from unnest(p_upload_token_ids) as t) <> v_token_count then
    raise exception 'INVALID_TOKEN' using errcode = 'P0001';
  end if;

  v_ttl := make_interval(mins => greatest(1, least(coalesce(p_ttl_minutes, 60), 1440)));

  -- Lock all tokens (ordered) before any mutation.
  perform 1
  from public.guest_chat_pending_uploads
  where id = any (p_upload_token_ids)
  order by id
  for update;

  if (select count(*) from public.guest_chat_pending_uploads where id = any (p_upload_token_ids)) <> v_token_count then
    raise exception 'INVALID_TOKEN' using errcode = 'P0001';
  end if;

  for v_idx in 1 .. v_token_count loop
    v_token := p_upload_token_ids[v_idx];

    select * into v_pending
    from public.guest_chat_pending_uploads
    where id = v_token;

    if v_pending.consumed_at is not null then
      raise exception 'ALREADY_USED' using errcode = 'P0001';
    end if;

    if v_pending.session_id <> p_session_id or v_pending.channel_key <> p_channel_key then
      raise exception 'CROSS_SESSION' using errcode = 'P0001';
    end if;

    if v_pending.created_at < (now() - v_ttl) then
      raise exception 'EXPIRED' using errcode = 'P0001';
    end if;
  end loop;

  insert into public.guest_chat_messages (
    channel_key,
    session_id,
    sender,
    original_text,
    original_lang,
    translated_json,
    staff_user_id
  ) values (
    p_channel_key,
    p_session_id,
    p_sender,
    p_original_text,
    p_original_lang,
    coalesce(p_translated_json, '{}'::jsonb),
    case when p_sender = 'staff' then p_staff_user_id else null end
  )
  returning * into v_message;

  for v_idx in 1 .. v_token_count loop
    v_token := p_upload_token_ids[v_idx];

    select * into v_pending
    from public.guest_chat_pending_uploads
    where id = v_token;

    insert into public.guest_chat_attachments (
      message_id,
      session_id,
      storage_path,
      mime_type,
      size_bytes,
      sort_order
    ) values (
      v_message.id,
      p_session_id,
      v_pending.storage_path,
      v_pending.mime_type,
      v_pending.size_bytes,
      v_idx - 1
    )
    returning * into v_attachment;

    update public.guest_chat_pending_uploads
    set consumed_at = now(),
        message_id = v_message.id
    where id = v_token;

    v_attachments := v_attachments || jsonb_build_array(
      jsonb_build_object(
        'id', v_attachment.id,
        'mime_type', v_attachment.mime_type,
        'size_bytes', v_attachment.size_bytes,
        'sort_order', v_attachment.sort_order,
        'storage_path', v_attachment.storage_path
      )
    );
  end loop;

  return jsonb_build_object(
    'message', jsonb_build_object(
      'id', v_message.id,
      'sender', v_message.sender,
      'original_text', v_message.original_text,
      'original_lang', v_message.original_lang,
      'translated_json', v_message.translated_json,
      'created_at', v_message.created_at,
      'is_deleted', coalesce(v_message.is_deleted, false),
      'deleted_at', v_message.deleted_at,
      'staff_user_id', v_message.staff_user_id
    ),
    'attachments', v_attachments
  );
end;
$$;

comment on function public.create_guest_message_with_attachments is
  'IMAGE-CHAT-01A: atomic guest message + attachments + pending token consume (single transaction).';

-- Maintenance: orphan image-only messages (empty text, zero attachments, guest sender).
comment on table public.guest_chat_attachments is
  'Guest chat image attachments. Orphan detect: guest sender + empty original_text + zero attachment rows.';
